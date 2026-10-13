import { describe, expect, it } from "vitest";
import { passSize, planPasses } from "../src/internal/graph";
import type { PassOptions } from "../src/types";

const pass = (name: string, extra: Partial<PassOptions> = {}): PassOptions => ({
  name,
  fragment: "void main() {}",
  ...extra
});

describe("planPasses", () => {
  it("resolves earlier passes to this frame and itself or later passes to the previous one", () => {
    const plans = planPasses([
      pass("scene", { inputs: ["post"] }),
      pass("trail", { inputs: ["scene", "trail"] }),
      pass("post", { inputs: ["trail"] })
    ]);

    expect(plans[1]!.inputs).toEqual([
      { pass: 0, previous: false, uniformName: "u_scene", sizeUniformName: "u_sceneSize" },
      { pass: 1, previous: true, uniformName: "u_trail", sizeUniformName: "u_trailSize" }
    ]);
    expect(plans[0]!.inputs[0]!.previous).toBe(true);
    expect(plans.map((plan) => plan.keepsHistory)).toEqual([false, true, true]);
  });

  it("fills in defaults", () => {
    const [plan] = planPasses([pass("scene")]);
    expect(plan).toMatchObject({
      accumulate: false,
      format: "rgba16f",
      scale: 1,
      filter: "linear",
      wrap: "clamp",
      inputs: []
    });
  });

  it("rejects an empty list, bad and duplicate names", () => {
    expect(() => planPasses([])).toThrow("at least one pass");
    expect(() => planPasses([pass("1st")])).toThrow("must start with a letter");
    expect(() => planPasses([pass("a"), pass("a")])).toThrow("Duplicate pass name");
    expect(() => planPasses([pass("time")])).toThrow("built-in uniform u_time");
    expect(() => planPasses([pass("pointerUv")])).toThrow("built-in uniform");
  });

  it("rejects unknown and repeated inputs", () => {
    expect(() => planPasses([pass("a", { inputs: ["b"] })])).toThrow("unknown pass: b");
    expect(() =>
      planPasses([pass("a"), pass("b", { inputs: ["a", "a"] })])
    ).toThrow("lists a twice");
  });

  it("keeps accumulating passes first", () => {
    expect(() =>
      planPasses([pass("a"), pass("b", { accumulate: true })])
    ).toThrow("must come before every pass that does not accumulate");
    expect(() =>
      planPasses([pass("a", { accumulate: true }), pass("b", { accumulate: true }), pass("c")])
    ).not.toThrow();
  });

  it("lets accumulating passes read only later passes", () => {
    expect(() =>
      planPasses([pass("a", { accumulate: true, inputs: ["a"] })])
    ).toThrow("cannot read its own output");
    expect(() =>
      planPasses([
        pass("a", { accumulate: true }),
        pass("b", { accumulate: true, inputs: ["a"] })
      ])
    ).toThrow("accumulates in the same frame");
    expect(() =>
      planPasses([pass("a", { accumulate: true, inputs: ["b"] }), pass("b")])
    ).not.toThrow();
  });

  it("validates scale and format", () => {
    expect(() => planPasses([pass("a", { scale: 0 })])).toThrow("positive scale");
    expect(() =>
      planPasses([pass("a", { format: "rgb565" as "rgba8" })])
    ).toThrow("unknown format");
  });
});

describe("passSize", () => {
  it("scales and rounds, never below one pixel", () => {
    expect(passSize({ scale: 0.5 }, 1920, 1081)).toEqual([960, 541]);
    expect(passSize({ scale: 0.001 }, 100, 100)).toEqual([1, 1]);
  });
});
