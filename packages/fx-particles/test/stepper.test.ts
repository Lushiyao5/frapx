import { describe, expect, it } from "vitest";
import { MAX_CATCH_UP_STEPS, SpawnCounter, planSteps, stepTarget } from "../src/internal/stepper";

const base = { rate: 60, prewarmSteps: 100, dirty: false, exact: false };

describe("stepTarget", () => {
  it("absorbs float error at frame boundaries", () => {
    expect(stepTarget(0.7, 60)).toBe(42);
    expect(stepTarget(41 / 30, 60)).toBe(82);
    expect(stepTarget(1 / 24, 60)).toBe(2);
  });
});

describe("planSteps", () => {
  it("runs every step up to the target when exact", () => {
    expect(planSteps({ ...base, next: 10, time: 2, exact: true })).toEqual({ reset: false, runTo: 120, skipTo: 120 });
  });

  it("restarts from the prewarmed start when going back or dirty", () => {
    expect(planSteps({ ...base, next: 120, time: 1, exact: true })).toEqual({ reset: true, runTo: 60, skipTo: 60 });
    expect(planSteps({ ...base, next: 0, time: 0, dirty: true })).toEqual({ reset: true, runTo: 0, skipTo: 0 });
  });

  it("drops time a realtime frame cannot catch up on", () => {
    expect(planSteps({ ...base, next: 10, time: 1 })).toEqual({
      reset: false,
      runTo: 10 + MAX_CATCH_UP_STEPS,
      skipTo: 60
    });
    expect(planSteps({ ...base, next: 58, time: 1 })).toEqual({ reset: false, runTo: 60, skipTo: 60 });
  });

  it("completes the prewarm when a realtime frame resets late", () => {
    expect(planSteps({ ...base, next: 500, time: 30, dirty: true })).toEqual({
      reset: true,
      runTo: MAX_CATCH_UP_STEPS,
      skipTo: 1800
    });
  });
});

describe("SpawnCounter", () => {
  it("carries fractions so the long-run count matches the rate", () => {
    const counter = new SpawnCounter();
    let total = 0;
    for (let i = 0; i < 600; i++) total += counter.next(7, 1 / 60, 1000).count;
    expect(total).toBe(70);
    expect(counter.total).toBe(70);
  });

  it("caps a step at the pool and reports it", () => {
    const counter = new SpawnCounter();
    expect(counter.next(1000, 1, 64)).toEqual({ base: 0, count: 64, overflow: true });
    expect(counter.next(10, 0.5, 64)).toEqual({ base: 64, count: 5, overflow: false });
  });
});
