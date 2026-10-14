import { describe, expect, it } from "vitest";
import { createUniformBindings, keyframes } from "../src/internal/bindings";

describe("keyframes", () => {
  it("interpolates floats and vectors per component, holding the ends", () => {
    const source = keyframes({
      glow: [
        [2, 1],
        [0, 0]
      ],
      camPos: [
        [0, [0, 1, 6]],
        [4, [4, 3, 2]]
      ]
    });
    expect(source.get(-1)).toEqual({ glow: 0, camPos: [0, 1, 6] });
    expect(source.get(1)).toEqual({ glow: 0.5, camPos: [1, 1.5, 5] });
    expect(source.get(3)).toEqual({ glow: 1, camPos: [3, 2.5, 3] });
    expect(source.get(10)).toEqual({ glow: 1, camPos: [4, 3, 2] });
  });

  it("finds the right segment among many keys", () => {
    const source = keyframes({
      x: [
        [0, 0],
        [1, 10],
        [2, 0],
        [3, 30],
        [4, 0]
      ]
    });
    expect([0.5, 1.5, 2.5, 3.5].map((time) => source.get(time)["x"])).toEqual([5, 5, 15, 15]);
    expect(source.get(3)["x"]).toBe(30);
  });

  it("applies the default ease, per-track eases and custom functions", () => {
    const source = keyframes(
      {
        a: [
          [0, 0],
          [1, 1]
        ],
        b: {
          keys: [
            [0, 0],
            [1, 1]
          ],
          ease: "step"
        },
        c: {
          keys: [
            [0, 0],
            [1, 1]
          ],
          ease: (t) => t * t
        }
      },
      { ease: "smooth" }
    );
    expect(source.get(0.25)).toEqual({ a: 0.15625, b: 0, c: 0.0625 });
    expect(source.get(1)).toEqual({ a: 1, b: 1, c: 1 });
  });

  it("rejects empty tracks, mixed sizes, non-finite numbers and unknown eases", () => {
    expect(() => keyframes({ x: [] })).toThrow(TypeError);
    expect(() =>
      keyframes({
        x: [
          [0, 1],
          [1, [1, 2]]
        ]
      })
    ).toThrow("mixes values");
    expect(() => keyframes({ x: [[Number.NaN, 1]] })).toThrow("non-finite time");
    expect(() => keyframes({ x: [[0, Number.POSITIVE_INFINITY]] })).toThrow("non-finite value");
    expect(() => keyframes({}, { ease: "bounce" as "linear" })).toThrow(RangeError);
  });
});

describe("createUniformBindings", () => {
  it("merges sources in order, later ones winning, under u_ names", () => {
    const bindings = createUniformBindings();
    bindings.add({ get: (time) => ({ glow: time, tint: [1, 0, 0] }) });
    const removeSecond = bindings.add({ get: () => ({ u_glow: 9 }) });

    expect(bindings.size).toBe(2);
    expect(Object.fromEntries(bindings.evaluate(2))).toEqual({
      u_glow: { type: "float", value: [9] },
      u_tint: { type: "vec3", value: [1, 0, 0] }
    });

    removeSecond();
    removeSecond();
    expect(bindings.size).toBe(1);
    expect(bindings.evaluate(2).get("u_glow")).toEqual({ type: "float", value: [2] });
  });

  it("changes its signature only when the values change", () => {
    const bindings = createUniformBindings();
    expect(bindings.signature(0)).toBe("");
    let level = 1;
    bindings.add({ get: () => ({ level }) });
    const first = bindings.signature(5);
    expect(bindings.signature(5)).toBe(first);
    level = 2;
    expect(bindings.signature(5)).not.toBe(first);
  });
});
