import { describe, expect, it } from "vitest";
import { sampleAt, sampleTime } from "../src/internal/sampling";

describe("sampleAt", () => {
  it("starts with an unjittered sample at the shutter opening", () => {
    expect(sampleAt(0)).toEqual({ jitter: [0, 0], shutter: 0 });
  });

  it("stays in range and is deterministic", () => {
    for (let index = 0; index < 4096; index++) {
      const { jitter, shutter } = sampleAt(index);
      expect(jitter[0]).toBeGreaterThanOrEqual(-0.5);
      expect(jitter[0]).toBeLessThan(0.5);
      expect(jitter[1]).toBeGreaterThanOrEqual(-0.5);
      expect(jitter[1]).toBeLessThan(0.5);
      expect(shutter).toBeGreaterThanOrEqual(0);
      expect(shutter).toBeLessThan(1);
    }
    expect(sampleAt(37)).toEqual(sampleAt(37));
  });

  it("covers the pixel and the shutter evenly", () => {
    const count = 256;
    const cells = new Set<number>();
    const slots = new Set<number>();
    for (let index = 0; index < count; index++) {
      const { jitter, shutter } = sampleAt(index);
      cells.add(Math.floor((jitter[0] + 0.5) * 4) * 4 + Math.floor((jitter[1] + 0.5) * 4));
      slots.add(Math.floor(shutter * 16));
    }
    expect(cells.size).toBe(16);
    expect(slots.size).toBe(16);
    const meanShutter =
      Array.from({ length: count }, (_, index) => sampleAt(index).shutter).reduce(
        (sum, value) => sum + value,
        0
      ) / count;
    expect(meanShutter).toBeCloseTo(0.5, 1);
  });
});

describe("sampleTime", () => {
  it("spreads samples over [time, time + shutter / fps)", () => {
    expect(sampleTime(2, { jitter: [0, 0], shutter: 0.5 }, 0.5, 50)).toBeCloseTo(2.005);
    expect(sampleTime(2, { jitter: [0, 0], shutter: 0.5 }, 0, 50)).toBe(2);
  });
});
