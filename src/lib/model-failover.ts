import { describeError, httpStatusOf } from "./errors";
import { HTTP_STATUS } from "./http-status";
import { MINUTE_MS } from "./limits";

/** Timing rules for trying several models; all values in milliseconds. */
export interface FailoverPolicy {
  /** A model that failed is skipped for this long, so later requests do not wait on it again. */
  cooldownMs: number;
  /** An exhausted quota (429) will not come back within a minute, so wait longer. */
  quotaCooldownMs: number;
  /** Longest a single attempt may take. */
  attemptTimeoutMs: number;
  /** If a model has not answered after this long, start the next one alongside it. */
  hedgeMs: number;
  /** Overload (503) comes in short bursts, so those models get one more try after this pause. */
  retryDelayMs: number;
  /** A retry round only starts if at least this much of the budget is left. */
  minBudgetForRetryMs: number;
  /** Total time spent across all models; keeps a route inside its serverless time limit. */
  totalBudgetMs: number;
}

const QUOTA_COOLDOWN_MINUTES = 5;

export const DEFAULT_FAILOVER_POLICY: FailoverPolicy = {
  cooldownMs: 20_000,
  quotaCooldownMs: QUOTA_COOLDOWN_MINUTES * MINUTE_MS,
  attemptTimeoutMs: 8_000,
  hedgeMs: 4_000,
  retryDelayMs: 1_500,
  minBudgetForRetryMs: 5_000,
  totalBudgetMs: 20_000,
};

/**
 * Thrown by an attempt whose model answered, but with something unusable (bad JSON, empty text).
 * The model is not put on cool-down: one bad reply says little about the next one.
 */
export class UnusableReplyError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Unusable reply", { cause });
    this.name = "UnusableReplyError";
  }
}

type Attempt<T> = (model: string, signal: AbortSignal) => Promise<T>;

/** Remembers which models failed recently, shared by every call to one failover runner. */
class Cooldowns {
  private readonly until = new Map<string, number>();

  /** Models that are not cooling down; if every one is cooling, all are tried anyway. */
  ready(models: readonly string[], now: number): string[] {
    const available = models.filter((model) => (this.until.get(model) ?? 0) <= now);
    return available.length > 0 ? available : [...models];
  }

  mark(model: string, until: number): void {
    this.until.set(model, until);
  }
}

/** What a race needs besides the model list: how to run a model, the rules and where to report. */
interface RaceDeps<T> {
  attempt: Attempt<T>;
  rules: FailoverPolicy;
  cooldowns: Cooldowns;
  clock: () => number;
  resolve: (result: T) => void;
  reject: (error: unknown) => void;
}

/** One call's contest between models: the first valid result wins and the rest are cancelled. */
class Race<T> {
  private readonly started: number;
  private readonly queue: string[];
  private readonly overloaded: string[] = [];
  private readonly cancelLosers = new AbortController();
  private inFlight = 0;
  private settled = false;
  private retried = false;
  private hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  private lastError: unknown = new Error("No model available");

  private readonly attempt: Attempt<T>;
  private readonly rules: FailoverPolicy;
  private readonly cooldowns: Cooldowns;
  private readonly clock: () => number;
  private readonly resolve: (result: T) => void;
  private readonly reject: (error: unknown) => void;

  constructor(models: readonly string[], deps: RaceDeps<T>) {
    ({
      attempt: this.attempt,
      rules: this.rules,
      cooldowns: this.cooldowns,
      clock: this.clock,
      resolve: this.resolve,
      reject: this.reject,
    } = deps);
    this.started = this.clock();
    this.queue = this.cooldowns.ready(models, this.started);
  }

  /** Starts the first model. */
  start(): void {
    this.launchNext();
  }

  private timeLeft(): number {
    return this.rules.totalBudgetMs - (this.clock() - this.started);
  }

  private launchNext = (): void => {
    clearTimeout(this.hedgeTimer);
    if (this.settled) return;
    const model = this.queue.shift();
    if (model === undefined || this.timeLeft() <= 0) this.finishOrRetry();
    else this.launch(model);
  };

  /** Nothing left to start: end once running models have failed, after one retry if worthwhile. */
  private finishOrRetry(): void {
    if (this.inFlight > 0) return;
    const worthRetrying = !this.retried && this.overloaded.length > 0;
    if (!worthRetrying || this.timeLeft() < this.rules.minBudgetForRetryMs) {
      this.reject(this.lastError);
      return;
    }
    this.retried = true;
    this.queue.push(...this.overloaded);
    this.hedgeTimer = setTimeout(this.launchNext, this.rules.retryDelayMs);
  }

  private launch(model: string): void {
    this.inFlight++;
    this.hedgeTimer = setTimeout(this.launchNext, this.rules.hedgeMs);
    this.attemptModel(model).then(
      (result) => this.win(result),
      (error) => this.lose(model, error),
    );
  }

  private async attemptModel(model: string): Promise<T> {
    const budget = Math.max(1, Math.min(this.rules.attemptTimeoutMs, this.timeLeft()));
    const signal = AbortSignal.any([this.cancelLosers.signal, AbortSignal.timeout(budget)]);
    try {
      return await this.attempt(model, signal);
    } catch (error) {
      this.recordFailure(model, error);
      throw error;
    }
  }

  /** A request cancelled because another model already won is not a model failure. */
  private recordFailure(model: string, error: unknown): void {
    if (this.cancelLosers.signal.aborted || error instanceof UnusableReplyError) return;
    const quotaExhausted = httpStatusOf(error) === HTTP_STATUS.TOO_MANY_REQUESTS;
    const cooldown = quotaExhausted ? this.rules.quotaCooldownMs : this.rules.cooldownMs;
    this.cooldowns.mark(model, this.clock() + cooldown);
    console.error(`Model ${model} failed (${describeError(error)}); trying the next one`);
  }

  private win(result: T): void {
    this.settled = true;
    clearTimeout(this.hedgeTimer);
    this.cancelLosers.abort();
    this.resolve(result);
  }

  private lose(model: string, error: unknown): void {
    this.lastError = error;
    if (httpStatusOf(error) === HTTP_STATUS.SERVICE_UNAVAILABLE) this.overloaded.push(model);
    this.inFlight--;
    this.launchNext();
  }
}

/**
 * Creates a failover runner that remembers which models are cooling down between calls.
 * @param policy - Overrides for the default timing rules.
 * @param clock - Time source, injected for tests.
 * @returns An object whose `run` returns the first successful result across the given models.
 */
export function createFailover(
  policy: Partial<FailoverPolicy> = {},
  clock: () => number = () => Date.now(),
) {
  const rules = { ...DEFAULT_FAILOVER_POLICY, ...policy };
  const cooldowns = new Cooldowns();

  return {
    /**
     * Tries the models in order. A failed model hands over to the next; a slow one is joined by the
     * next after `hedgeMs` and the first success wins, with the others cancelled. Models that were
     * only overloaded get one more round after a short pause.
     * @param models - Model names in order of preference.
     * @param attempt - Runs one model; it must honour the abort signal.
     * @returns The first successful result.
     * @throws The last error when every model fails or the time budget runs out.
     */
    run<T>(models: readonly string[], attempt: Attempt<T>): Promise<T> {
      return new Promise<T>((resolve, reject) =>
        new Race(models, { attempt, rules, cooldowns, clock, resolve, reject }).start(),
      );
    },
  };
}
