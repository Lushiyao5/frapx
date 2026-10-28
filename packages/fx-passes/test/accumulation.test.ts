import { describe, expect, it } from "vitest";
import { resolveAccumulation, wrapTime } from "../src/internal/accumulation";

describe("resolveAccumulation", () => {
  it("defaults to one sample and no motion blur", () => {
    expect(resolveAccumulation()).toEqual({ samples: 1, shutter: 0, fps: null, loop: null });
  });

  it("merges partial updates over the current settings", () => {
    const base = resolveAccumulation({ samples: 64, shutter: 0.5, fps: 24, loop: 16 });
    expect(resolveAccumulation({ samples: 8 }, base)).toEqual({
      samples: 8,
      shutter: 0.5,
      fps: 24,
      loop: 16
    });
    expect(resolveAccumulation({ loop: null }, base).loop).toBeNull();
  });

  it("rejects invalid values", () => {
    expect(() => resolveAccumulation({ samples: 0 })).toThrow("positive integer");
    expect(() => resolveAccumulation({ samples: 1.5 })).toThrow("positive integer");
    expect(() => resolveAccumulation({ shutter: 1.5, fps: 30 })).toThrow("between 0 and 1");
    expect(() => resolveAccumulation({ fps: 0 })).toThrow("positive number");
    expect(() => resolveAccumulation({ shutter: 0.5 })).toThrow("fps is required");
    expect(() => resolveAccumulation({ loop: 0 })).toThrow("loop must be a positive number");
    expect(() => resolveAccumulation({ loop: Number.POSITIVE_INFINITY })).toThrow("positive number");
  });
});

describe("wrapTime", () => {
  it("wraps into [0, loop), whole loops to exactly 0", () => {
    expect(wrapTime(16, 16)).toBe(0);
    expect(wrapTime(960 / 60, 16)).toBe(0);
    expect(wrapTime(17.5, 16)).toBe(1.5);
    expect(wrapTime(-1, 16)).toBe(15);
    expect(wrapTime(17.5, null)).toBe(17.5);
  });
});
