import { hexToRgba } from "@frapx/core";
import type { Rgba } from "@frapx/core";
import type { ColorStop } from "../types";

/** Texels per row; also the most palette colors the second row holds. */
export const LUT_WIDTH = 256;

/** Parses color stops into sorted `[offset, rgba]`, validating every color. */
export const parseColorStops = (color: string | readonly ColorStop[]): Array<[number, Rgba]> => {
  const stops = typeof color === "string" ? [color] : color;
  if (stops.length === 0) throw new RangeError("color needs at least one stop");
  const last = Math.max(stops.length - 1, 1);
  return stops
    .map((stop, index): [number, Rgba] => {
      if (typeof stop === "string") return [stops.length === 1 ? 0 : index / last, hexToRgba(stop)];
      const offset = stop[0];
      if (!Number.isFinite(offset)) throw new RangeError(`color offset must be a finite number, got ${offset}`);
      return [Math.min(Math.max(offset, 0), 1), hexToRgba(stop[1])];
    })
    .sort((a, b) => a[0] - b[0]);
};

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
