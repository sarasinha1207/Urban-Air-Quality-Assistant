// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFailover, UnusableReplyError } from "@/lib/model-failover";

const apiError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const MODELS = ["a", "b", "c"];

afterEach(() => vi.useRealTimers());

function setup(policy = {}) {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let now = 0;
  const failover = createFailover(policy, () => now);
  return { failover, setNow: (ms: number) => (now = ms) };
}

describe("createFailover", () => {
  it("returns the first model's result without touching the others", async () => {
    const { failover } = setup();
    const attempt = vi.fn().mockResolvedValue("ok");
    expect(await failover.run(MODELS, attempt)).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt.mock.calls[0]?.[0]).toBe("a");
  });

  it("moves to the next model after a failure, and reports the last error if all fail", async () => {
    const { failover } = setup({ retryDelayMs: 0 });
    const attempt = vi.fn().mockRejectedValueOnce(apiError(500)).mockResolvedValueOnce("from b");
    expect(await failover.run(MODELS, attempt)).toBe("from b");

    const failing = vi.fn().mockRejectedValue(apiError(404));
    await expect(createFailover().run(MODELS, failing)).rejects.toThrow("HTTP 404");
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it("skips a failed model for the cool-down, then tries it again", async () => {
    const { failover, setNow } = setup({ cooldownMs: 1000 });
    const attempt = vi.fn().mockRejectedValueOnce(apiError(500)).mockResolvedValue("ok");
    await failover.run(MODELS, attempt);
    await failover.run(MODELS, attempt);
    expect(attempt.mock.calls.map((c) => c[0])).toEqual(["a", "b", "b"]);

    setNow(1001);
    await failover.run(MODELS, attempt);
    expect(attempt.mock.calls.at(-1)?.[0]).toBe("a");
  });

  it("skips an exhausted quota (429) much longer than other failures", async () => {
    const { failover, setNow } = setup({ cooldownMs: 1000, quotaCooldownMs: 100_000 });
    const attempt = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValue("ok");
    await failover.run(MODELS, attempt);
    setNow(50_000);
    await failover.run(MODELS, attempt);
    expect(attempt.mock.calls.at(-1)?.[0]).toBe("b");
    setNow(100_001);
    await failover.run(MODELS, attempt);
    expect(attempt.mock.calls.at(-1)?.[0]).toBe("a");
  });

  it("tries every model again when all are cooling down", async () => {
    const { failover } = setup({ retryDelayMs: 0 });
    await expect(failover.run(["a"], vi.fn().mockRejectedValue(apiError(500)))).rejects.toThrow();
    const attempt = vi.fn().mockResolvedValue("ok");
    expect(await failover.run(["a"], attempt)).toBe("ok");
  });

  it("does not cool down a model whose reply was merely unusable", async () => {
    const { failover } = setup();
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new UnusableReplyError(new Error("bad json")))
      .mockResolvedValue("ok");
    await failover.run(MODELS, attempt);
    await failover.run(MODELS, attempt);
    expect(attempt.mock.calls.map((c) => c[0])).toEqual(["a", "b", "a"]);
  });

  it("keeps the original message of an unusable reply", async () => {
    expect(new UnusableReplyError(new Error("Empty reply")).message).toBe("Empty reply");
    expect(new UnusableReplyError("odd").message).toBe("Unusable reply");
  });

  it("starts the next model alongside a slow one, and cancels the loser without penalty", async () => {
    vi.useFakeTimers();
    const { failover } = setup({ hedgeMs: 100 });
    let slowSignal: AbortSignal | undefined;
    const attempt = vi
      .fn()
      .mockImplementationOnce(
        (_model: string, signal: AbortSignal) =>
          new Promise((_, reject) => {
            slowSignal = signal;
            signal.addEventListener("abort", () => reject(apiError(500)));
          }),
      )
      .mockResolvedValue("fast");

    const pending = failover.run(MODELS, attempt);
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toBe("fast");
    expect(slowSignal?.aborted).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps waiting for a slow lone model when the hedge timer finds no other to start", async () => {
    vi.useFakeTimers();
    const { failover } = setup({ hedgeMs: 100 });
    let finish: (value: string) => void = () => {};
    const attempt = vi.fn().mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    const pending = failover.run(["a"], attempt);
    await vi.advanceTimersByTimeAsync(150);
    finish("late");
    expect(await pending).toBe("late");
  });

  it("retries overloaded (503) models once after a pause, then gives up", async () => {
    vi.useFakeTimers();
    const { failover } = setup({ retryDelayMs: 50 });
    const attempt = vi.fn().mockRejectedValue(apiError(503));
    const outcome = expect(failover.run(MODELS, attempt)).rejects.toThrow("HTTP 503");
    await vi.advanceTimersByTimeAsync(50);
    await outcome;
    expect(attempt).toHaveBeenCalledTimes(MODELS.length * 2);
  });

  it("recovers when the overload clears during the retry", async () => {
    vi.useFakeTimers();
    const { failover } = setup({ retryDelayMs: 50 });
    const attempt = vi.fn();
    MODELS.forEach(() => attempt.mockRejectedValueOnce(apiError(503)));
    attempt.mockResolvedValue("back");
    const pending = failover.run(MODELS, attempt);
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toBe("back");
  });

  it("stops when the time budget is spent, without a retry round", async () => {
    const { failover, setNow } = setup({ totalBudgetMs: 1000 });
    const attempt = vi.fn().mockImplementationOnce(async () => {
      setNow(2000);
      throw apiError(503);
    });
    await expect(failover.run(MODELS, attempt)).rejects.toThrow("HTTP 503");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("gives every attempt an abort signal that fires on timeout", async () => {
    const { failover } = setup({ attemptTimeoutMs: 20, hedgeMs: 5000, retryDelayMs: 0 });
    const attempt = (_model: string, signal: AbortSignal) =>
      new Promise<string>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("timed out"))),
      );
    await expect(failover.run(["a"], attempt)).rejects.toThrow("timed out");
  });
});
