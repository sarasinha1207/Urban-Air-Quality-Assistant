"use client";

import { useState } from "react";
import { buildProfile, requestAdvice, type AdviceState, type Coords } from "./advice-request";

/**
 * Owns the request lifecycle (idle, loading, error, success) for the household form.
 * @returns The current state and a `submit` that ignores repeat clicks while a request is running.
 */
export function useAdvice() {
  const [state, setState] = useState<AdviceState>({ status: "idle" });

  async function submit(form: FormData, coords: Coords | null) {
    if (state.status === "loading") return;
    setState({ status: "loading" });
    const outcome = await requestAdvice(buildProfile(form, coords));
    setState(
      outcome.ok
        ? { status: "success", data: outcome.data }
        : { status: "error", message: outcome.message },
    );
  }

  return { state, submit };
}
