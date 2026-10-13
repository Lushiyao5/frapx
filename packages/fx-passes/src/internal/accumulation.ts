import type { AccumulationOptions, ResolvedAccumulation } from "../types";

/** Validates accumulation settings, filling gaps from `base`. */
export const resolveAccumulation = (
  options: AccumulationOptions = {},
  base: ResolvedAccumulation = { samples: 1, shutter: 0, fps: null }
): ResolvedAccumulation => {
  const samples = options.samples ?? base.samples;
  const shutter = options.shutter ?? base.shutter;
  const fps = options.fps ?? base.fps;
  if (!Number.isInteger(samples) || samples < 1) {
    throw new RangeError(`accumulation.samples must be a positive integer, got ${samples}`);
  }
  if (!Number.isFinite(shutter) || shutter < 0 || shutter > 1) {
    throw new RangeError(`accumulation.shutter must be between 0 and 1, got ${shutter}`);
  }
  if (fps !== null && (!Number.isFinite(fps) || fps <= 0)) {
    throw new RangeError(`accumulation.fps must be a positive number, got ${fps}`);
  }
  if (shutter > 0 && fps === null) {
    throw new TypeError("accumulation.fps is required when shutter is above 0.");
  }
  return { samples, shutter, fps };
};
