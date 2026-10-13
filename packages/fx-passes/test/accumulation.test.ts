import { describe, expect, it } from "vitest";
import { resolveAccumulation } from "../src/internal/accumulation";

describe("resolveAccumulation", () => {
  it("defaults to one sample and no motion blur", () => {
    expect(resolveAccumulation()).toEqual({ samples: 1, shutter: 0, fps: null });
  });

  it("merges partial updates over the current settings", () => {
    const base = resolveAccumulation({ samples: 64, shutter: 0.5, fps: 24 });
    expect(resolveAccumulation({ samples: 8 }, base)).toEqual({
      samples: 8,
      shutter: 0.5,
      fps: 24
    });
  });

  it("rejects invalid values", () => {
    expect(() => resolveAccumulation({ samples: 0 })).toThrow("positive integer");
    expect(() => resolveAccumulation({ samples: 1.5 })).toThrow("positive integer");
    expect(() => resolveAccumulation({ shutter: 1.5, fps: 30 })).toThrow("between 0 and 1");
    expect(() => resolveAccumulation({ fps: 0 })).toThrow("positive number");
    expect(() => resolveAccumulation({ shutter: 0.5 })).toThrow("fps is required");
  });
});
