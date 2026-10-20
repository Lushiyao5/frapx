import type { AccumulationOptions, ResolvedAccumulation } from "../types";

/** Validates accumulation settings, filling gaps from `base`. */
export const resolveAccumulation = (
  options: AccumulationOptions = {},
  base: ResolvedAccumulation = { samples: 1, shutter: 0, fps: null, loop: null }
): ResolvedAccumulation => {
  const samples = options.samples ?? base.samples;
  const shutter = options.shutter ?? base.shutter;
  const fps = options.fps ?? base.fps;
  const loop = options.loop === undefined ? base.loop : options.loop;
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
  if (loop !== null && (!Number.isFinite(loop) || loop <= 0)) {
    throw new RangeError(`accumulation.loop must be a positive number, got ${loop}`);
  }
  return { samples, shutter, fps, loop };
};

/**
 * `time` wrapped into `[0, loop)`, in double precision; unchanged without a
 * loop. A frame time that is a whole number of loops wraps to exactly 0.
 */
export const wrapTime = (time: number, loop: number | null): number =>
  loop === null ? time : time - loop * Math.floor(time / loop);
