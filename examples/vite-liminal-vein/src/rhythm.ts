import type { UniformSource } from "@frapx/fx-passes";
import { LOOP_SECONDS } from "./scene.glsl";

/** Beats per loop: one every four seconds, slow enough to stay quiet. */
const BEATS_PER_LOOP = 4;
/** How fast a beat's flare fades, per second. */
const PULSE_DECAY = 3;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * The rhythm the light follows: `pulse`, a beat that flares and fades (0–1),
 * and `energy`, how strongly the tunnel is lit (0–1). This fixed curve repeats
 * every loop; music would replace this source with values from its analysis
 * without touching the shader. fx-passes reads it at every sample's time, so
 * a beat is motion blurred like everything else.
 */
export const loopRhythm: UniformSource = {
  get(time) {
    const phase = (((time / LOOP_SECONDS) % 1) + 1) % 1;
    const sinceBeat = ((phase * BEATS_PER_LOOP) % 1) * (LOOP_SECONDS / BEATS_PER_LOOP);
    // Swells through the middle of the loop, its release, and is back to
    // rest by the loop's end so the loop wraps without a jump.
    const swell = smoothstep(0.3, 0.5, phase) * (1 - smoothstep(0.75, 0.95, phase));
    return {
      pulse: Math.exp(-PULSE_DECAY * sinceBeat),
      energy: 0.35 + 0.65 * swell
    };
  }
};
