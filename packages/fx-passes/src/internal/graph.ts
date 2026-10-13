import { toUniformName } from "@frapx/core";
import type { RenderTargetFormat } from "@frapx/core";
import type { PassOptions } from "../types";

export type PassInput = {
  /** Index of the pass sampled. */
  pass: number;
  /** Whether the input is that pass' output from the previous frame. */
  previous: boolean;
  uniformName: string;
  sizeUniformName: string;
};

export type PassPlan = {
  name: string;
  index: number;
  fragment: string;
  vertex: string | undefined;
  accumulate: boolean;
  format: RenderTargetFormat;
  scale: number;
  filter: "nearest" | "linear";
  wrap: "clamp" | "repeat" | "mirror";
  inputs: PassInput[];
  /** Some pass reads this one's previous output, so it keeps two buffers. */
  keepsHistory: boolean;
};

/** Uniforms every pass receives; pass names may not shadow them. */
export const BUILT_IN_UNIFORMS = new Set([
  "u_time",
  "u_delta",
  "u_frameTime",
  "u_resolution",
  "u_viewportSize",
  "u_pixelRatio",
  "u_pointer",
  "u_pointerUv",
  "u_pointerActive",
  "u_reducedMotion",
  "u_sampleIndex",
  "u_sampleCount",
  "u_jitter"
]);

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const FORMATS: readonly RenderTargetFormat[] = ["rgba8", "rgba16f", "rgba32f"];

/**
 * Validates the pass list and resolves every input to a pass index and frame.
 * Throws `TypeError` / `RangeError` describing the first problem found.
 */
export const planPasses = (passes: readonly PassOptions[]): PassPlan[] => {
  if (!Array.isArray(passes) || passes.length === 0) {
    throw new TypeError("`passes` needs at least one pass.");
  }

  const indexByName = new Map<string, number>();
  passes.forEach((pass, index) => {
    const { name } = pass;
    if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
      throw new TypeError(
        `Pass name ${JSON.stringify(name)} must start with a letter and contain only letters, digits and _.`
      );
    }
    if (indexByName.has(name)) {
      throw new TypeError(`Duplicate pass name: ${name}`);
    }
    for (const uniform of [toUniformName(name), toUniformName(`${name}Size`)]) {
      if (BUILT_IN_UNIFORMS.has(uniform)) {
        throw new TypeError(`Pass name ${name} collides with the built-in uniform ${uniform}.`);
      }
    }
    if (typeof pass.fragment !== "string") {
      throw new TypeError(`Pass ${name} needs a fragment shader.`);
    }
    indexByName.set(name, index);
  });

  let accumulating = true;
  const plans = passes.map((pass, index): PassPlan => {
    const accumulate = pass.accumulate === true;
    if (accumulate && !accumulating) {
      throw new TypeError(
        `Accumulating pass ${pass.name} must come before every pass that does not accumulate.`
      );
    }
    if (!accumulate) accumulating = false;

    const scale = pass.scale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError(`Pass ${pass.name} needs a positive scale, got ${scale}.`);
    }
    const format = pass.format ?? "rgba16f";
    if (!FORMATS.includes(format)) {
      throw new RangeError(`Pass ${pass.name} has an unknown format: ${String(format)}`);
    }

    const seen = new Set<string>();
    const inputNames: readonly string[] = pass.inputs ?? [];
    const inputs = inputNames.map((inputName): PassInput => {
      const source = indexByName.get(inputName);
      if (source === undefined) {
        throw new TypeError(`Pass ${pass.name} reads an unknown pass: ${inputName}`);
      }
      if (seen.has(inputName)) {
        throw new TypeError(`Pass ${pass.name} lists ${inputName} twice.`);
      }
      seen.add(inputName);
      if (accumulate && source === index) {
        throw new TypeError(`Accumulating pass ${pass.name} cannot read its own output.`);
      }
      if (accumulate && source < index) {
        throw new TypeError(
          `Accumulating pass ${pass.name} cannot read ${inputName}, which accumulates in the same frame.`
        );
      }
      return {
        pass: source,
        previous: source >= index,
        uniformName: toUniformName(inputName),
        sizeUniformName: toUniformName(`${inputName}Size`)
      };
    });

    return {
      name: pass.name,
      index,
      fragment: pass.fragment,
      vertex: pass.vertex,
      accumulate,
      format,
      scale,
      filter: pass.filter ?? "linear",
      wrap: pass.wrap ?? "clamp",
      inputs,
      keepsHistory: false
    };
  });

  for (const plan of plans) {
    for (const input of plan.inputs) {
      if (input.previous) plans[input.pass]!.keepsHistory = true;
    }
  }
  return plans;
};

/** Size of a pass' output for a canvas of `width` × `height`. */
export const passSize = (
  plan: Pick<PassPlan, "scale">,
  width: number,
  height: number
): [number, number] => [
  Math.max(1, Math.round(width * plan.scale)),
  Math.max(1, Math.round(height * plan.scale))
];
