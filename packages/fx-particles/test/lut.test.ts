import { describe, expect, it } from "vitest";
import { LUT_WIDTH, buildLut } from "../src/internal/lut";

const texel = (data: Uint8Array, x: number, row = 0) =>
  Array.from(data.slice((row * LUT_WIDTH + x) * 4, (row * LUT_WIDTH + x) * 4 + 4));

describe("buildLut", () => {
  it("fills one color across the row", () => {
    const data = buildLut("#ff000080", null);
    expect(texel(data, 0)).toEqual([255, 0, 0, 128]);
    expect(texel(data, 255)).toEqual([255, 0, 0, 128]);
  });

  it("spaces plain stops evenly and interpolates straight alpha", () => {
    const data = buildLut(["#000000", "#ffffff00"], null);
    expect(texel(data, 0)).toEqual([0, 0, 0, 255]);
    expect(texel(data, 255)).toEqual([255, 255, 255, 0]);
    expect(texel(data, 128)[0]).toBeGreaterThan(120);
    expect(texel(data, 128)[0]).toBeLessThan(136);
  });

  it("holds the end colors outside the stop offsets", () => {
    const data = buildLut(
      [
        [0.5, "#ff0000"],
        [0.75, "#0000ff"]
      ],
      null
    );
    expect(texel(data, 0)).toEqual([255, 0, 0, 255]);
    expect(texel(data, 255)).toEqual([0, 0, 255, 255]);
  });

  it("writes the palette into the second row", () => {
    const data = buildLut("#ffffff", ["#ff0000", "#00ff00"]);
    expect(texel(data, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(texel(data, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(texel(data, 2, 1)).toEqual([0, 0, 0, 0]);
  });
});
