import type { UniformInput } from "../types";
import { toUniformName } from "./names";
import { normalizeUniform, type NormalizedUniform } from "./uniforms";

/**
 * Supplies uniform values for a time, such as a keyframe timeline. Runtimes
 * call `get()` with the same time as `u_time` before drawing.
 */
export type UniformSource = {
  get(time: number): Readonly<Record<string, UniformInput>>;
};

/** Ordered sources whose values override the runtime's own uniforms. */
export type UniformBindings = {
  /** Adds `source`; a later source wins for the same name. Returns its removal. */
  add(source: UniformSource): () => void;
  readonly size: number;
  /** Merged, normalized values at `time`, keyed by uniform name (`u_` prefixed). */
  evaluate(time: number): Map<string, NormalizedUniform>;
  /** A stable string of the values at `time`, to notice when they change. */
  signature(time: number): string;
};

export const createUniformBindings = (): UniformBindings => {
  const sources: UniformSource[] = [];

  const evaluate = (time: number): Map<string, NormalizedUniform> => {
    const merged = new Map<string, NormalizedUniform>();
    for (const source of sources) {
      for (const [name, value] of Object.entries(source.get(time))) {
        merged.set(toUniformName(name), normalizeUniform(value));
      }
    }
    return merged;
  };

  return {
    add(source) {
      sources.push(source);
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        const index = sources.indexOf(source);
        if (index >= 0) sources.splice(index, 1);
      };
    },
    get size() {
      return sources.length;
    },
    evaluate,
    signature(time) {
      if (sources.length === 0) return "";
      let text = "";
      for (const [name, uniform] of evaluate(time)) {
        text += `${name}:${uniform.type}:${Array.from(uniform.value).join(",")};`;
      }
      return text;
    }
  };
};

// --- Keyframes -------------------------------------------------------------------

export type KeyframeValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number];

/** `[time in seconds, value]`. */
export type Keyframe = readonly [number, KeyframeValue];

/**
 * How a segment eases from one key to the next: `"linear"`, `"smooth"`
 * (smoothstep), `"step"` (hold the earlier key), or a function of the
 * segment's 0–1 progress.
 */
export type Ease = "linear" | "smooth" | "step" | ((t: number) => number);

export type KeyframeTrack = readonly Keyframe[] | { keys: readonly Keyframe[]; ease?: Ease };

export type KeyframeOptions = {
  /** Default ease for tracks that do not set their own. Defaults to `"linear"`. */
  ease?: Ease;
};

const EASES: Record<Exclude<Ease, (t: number) => number>, (t: number) => number> = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  step: () => 0
};

const toEaseFunction = (ease: Ease): ((t: number) => number) => {
  if (typeof ease === "function") return ease;
  const fn = EASES[ease];
  if (!fn) throw new RangeError(`Unknown ease: ${String(ease)}`);
  return fn;
};

const componentsOf = (value: KeyframeValue): readonly number[] =>
  typeof value === "number" ? [value] : value;

type CompiledTrack = {
  times: number[];
  values: Array<readonly number[]>;
  scalar: boolean;
  ease: (t: number) => number;
};

const isKeyList = (track: KeyframeTrack): track is readonly Keyframe[] => Array.isArray(track);

const compileTrack = (name: string, track: KeyframeTrack, fallback: Ease): CompiledTrack => {
  // Not `"keys" in track`: arrays have a keys() method.
  const list = isKeyList(track);
  const keys = list ? track : track.keys;
  const ease = toEaseFunction((list ? undefined : track.ease) ?? fallback);
  if (keys.length === 0) throw new TypeError(`Keyframe track ${name} has no keys.`);

  const sorted = [...keys].sort((a, b) => a[0] - b[0]);
  const scalar = typeof sorted[0]![1] === "number";
  const size = componentsOf(sorted[0]![1]).length;
  for (const [time, value] of sorted) {
    if (!Number.isFinite(time)) throw new TypeError(`Keyframe track ${name} has a non-finite time.`);
    const components = componentsOf(value);
    if ((typeof value === "number") !== scalar || components.length !== size) {
      throw new TypeError(`Keyframe track ${name} mixes values of different sizes.`);
    }
    if (!components.every(Number.isFinite)) {
      throw new TypeError(`Keyframe track ${name} has a non-finite value.`);
    }
  }
  return {
    times: sorted.map(([time]) => time),
    values: sorted.map(([, value]) => componentsOf(value)),
    scalar,
    ease
  };
};

const sampleTrack = (track: CompiledTrack, time: number): UniformInput => {
  const { times, values } = track;
  const last = times.length - 1;
  let components: readonly number[];
  if (time <= times[0]!) {
    components = values[0]!;
  } else if (time >= times[last]!) {
    components = values[last]!;
  } else {
    // The last key at or before `time`.
    let low = 0;
    let high = last;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (times[middle]! <= time) low = middle;
      else high = middle;
    }
    const span = times[high]! - times[low]!;
    const t = span > 0 ? track.ease((time - times[low]!) / span) : 0;
    const from = values[low]!;
    const to = values[high]!;
    components = from.map((value, index) => value + (to[index]! - value) * t);
  }
  return track.scalar ? components[0]! : (Array.from(components) as UniformInput);
};

/**
 * A `UniformSource` that interpolates keyframes per component: floats and
 * vec2–vec4 as tuples. Keys may come in any order; times before the first key
 * or after the last hold that key's value.
 *
 * ```ts
 * fx.bindUniforms(keyframes({
 *   camPos: [[0, [0, 1, 6]], [4, [3, 1.5, 2]]],
 *   glow: { keys: [[0, 0], [2, 1]], ease: "smooth" }
 * }));
 * ```
 */
export const keyframes = (
  tracks: Readonly<Record<string, KeyframeTrack>>,
  options: KeyframeOptions = {}
): UniformSource => {
  const fallback = options.ease ?? "linear";
  toEaseFunction(fallback);
  const compiled = Object.entries(tracks).map(
    ([name, track]) => [name, compileTrack(name, track, fallback)] as const
  );
  return {
    get(time) {
      const values: Record<string, UniformInput> = {};
      for (const [name, track] of compiled) values[name] = sampleTrack(track, time);
      return values;
    }
  };
};
