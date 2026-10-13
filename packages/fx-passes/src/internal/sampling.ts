// Roberts' R3 sequence: the 3D low-discrepancy sequence built on the root of
// x^4 = x + 1. https://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/
const PHI3 = 1.2207440846057596;
const A1 = 1 / PHI3;
const A2 = 1 / (PHI3 * PHI3);
const A3 = 1 / (PHI3 * PHI3 * PHI3);

const fract = (value: number): number => value - Math.floor(value);

export type Sample = {
  /** Sub-pixel offset in pixels, each component in [-0.5, 0.5). */
  jitter: readonly [number, number];
  /** Position within the open shutter, in [0, 1). */
  shutter: number;
};

/**
 * The `index`-th sample of the R3 sequence, shifted so sample 0 has no jitter
 * and opens the shutter. A single sample is therefore the plain, unblurred
 * frame, and every later sample fills in the gaps deterministically.
 */
export const sampleAt = (index: number): Sample => {
  const x = fract(0.5 + index * A1);
  const y = fract(0.5 + index * A2);
  const z = fract(0.5 + index * A3);
  return { jitter: [x - 0.5, y - 0.5], shutter: fract(z + 0.5) };
};

/**
 * Time of a sample: the frame time plus its share of the shutter interval
 * `[time, time + shutter / fps)`.
 */
export const sampleTime = (
  frameTime: number,
  sample: Sample,
  shutter: number,
  fps: number
): number => (shutter > 0 ? frameTime + (sample.shutter * shutter) / fps : frameTime);
