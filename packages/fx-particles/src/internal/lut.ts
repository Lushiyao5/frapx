import { hexToRgba } from "@frapx/core";
import type { ColorStop } from "../types";
import { parseColorStops } from "./config";

export const LUT_WIDTH = 256;

/**
 * Builds the 256x2 RGBA8 lookup texture: row 0 is the color over life
 * (straight alpha, sampled by life 0–1), row 1 holds the palette colors from
 * texel 0.
 */
export const buildLut = (
  color: string | readonly ColorStop[],
  palette: readonly string[] | null
): Uint8Array => {
  const data = new Uint8Array(LUT_WIDTH * 2 * 4);
  const stops = parseColorStops(color);

  for (let x = 0; x < LUT_WIDTH; x++) {
    const t = x / (LUT_WIDTH - 1);
    let upper = stops.findIndex(([offset]) => offset >= t);
    if (upper === -1) upper = stops.length - 1;
    const lower = Math.max(upper - 1, 0);
    const [a, colorA] = stops[lower]!;
    const [b, colorB] = stops[upper]!;
    const k = b > a ? Math.min(Math.max((t - a) / (b - a), 0), 1) : t <= a ? 0 : 1;
    for (let c = 0; c < 4; c++) {
      const value = colorA[c]! + (colorB[c]! - colorA[c]!) * k;
      data[x * 4 + c] = Math.round(value * 255);
    }
  }

  palette?.forEach((entry, index) => {
    const rgba = hexToRgba(entry);
    const offset = (LUT_WIDTH + index) * 4;
    for (let c = 0; c < 4; c++) data[offset + c] = Math.round(rgba[c]! * 255);
  });
  return data;
};
