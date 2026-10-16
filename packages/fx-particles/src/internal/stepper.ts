/** Steps a realtime frame runs at most before dropping the rest of the time. */
export const MAX_CATCH_UP_STEPS = 4;

// Absorbs float error in time * rate, such as 0.7 * 60 = 41.99999999999999.
const STEP_EPSILON = 1e-6;

/** The index of the last step the frame at `time` includes, plus one. */
export const stepTarget = (time: number, rate: number): number =>
  Math.floor(time * rate + STEP_EPSILON);

export type StepPlanInput = {
  /** Index of the next step to run; step `k` covers `[k, k + 1) / rate`. */
  next: number;
  /** The state must restart from the prewarmed start. */
  dirty: boolean;
  time: number;
  rate: number;
  prewarmSteps: number;
  /**
   * Run every step up to the target: manual clocks (frames must not depend
   * on how they were reached) and explicit seeks.
   */
  exact: boolean;
};

export type StepPlan = {
  /** Clear the state and continue from step `-prewarmSteps`. */
  reset: boolean;
  /** Run steps while the next index is below this. */
  runTo: number;
  /** Afterwards, skip the next index forward to this without simulating. */
  skipTo: number;
};

/**
 * Plans how to bring the simulation to `time`. Going back restarts from the
 * prewarmed start. A realtime frame that fell far behind (a slow frame, a
 * restored context) runs a few steps and drops the rest of the time, keeping
 * step times in line with the clock.
 */
export const planSteps = (input: StepPlanInput): StepPlan => {
  const target = stepTarget(input.time, input.rate);
  const reset = input.dirty || target < input.next;
  const from = reset ? -input.prewarmSteps : input.next;

  if (input.exact) return { reset, runTo: target, skipTo: target };

  // Prewarming always completes, so a reset frame is never half full.
  const base = reset ? Math.min(0, target) : from;
  const runTo = Math.min(target, base + MAX_CATCH_UP_STEPS);
  return { reset, runTo: Math.max(runTo, Math.min(0, target)), skipTo: target };
};

/**
 * Turns the emission rate into whole spawns per step, carrying the fraction
 * so the long-run count matches the rate exactly.
 */
export class SpawnCounter {
  private carry = 0;
  /** Spawns so far, as an absolute index for per-particle random numbers. */
  total = 0;

  reset(): void {
    this.carry = 0;
    this.total = 0;
  }

  /** Spawns for one step, capped at `pool`. Returns the first spawn's index and the count. */
  next(rate: number, stepSeconds: number, pool: number): { base: number; count: number; overflow: boolean } {
    this.carry += Math.max(rate, 0) * stepSeconds;
    let count = Math.floor(this.carry);
    this.carry -= count;
    const overflow = count > pool;
    if (overflow) count = pool;
    const base = this.total;
    this.total += count;
    return { base, count, overflow };
  }
}
