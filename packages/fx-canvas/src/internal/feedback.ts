import type {
  FeedbackFormat,
  FeedbackOptions,
  GLContext,
  UniformVec4
} from "../types";
import {
  TextureLoadError,
  createBlitter,
  createPingPong,
  toUniformName
} from "@frapx/core";
import type { Blitter, PingPong } from "@frapx/core";

export type NormalizedFeedbackOptions = {
  uniform: string;
  uniformName: string;
  sizeUniformName: string;
  filter: NonNullable<FeedbackOptions["filter"]>;
  wrap: NonNullable<FeedbackOptions["wrap"]>;
  clearColor: UniformVec4;
  format: FeedbackFormat;
  formatFallback: boolean;
};

export type FeedbackState = {
  options: NormalizedFeedbackOptions;
  targets: PingPong;
  blitter: Blitter;
  textureUnit: number;
};

const DEFAULT_CLEAR_COLOR: UniformVec4 = [0, 0, 0, 0];
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const normalizeFeedbackOptions = (
  input: boolean | FeedbackOptions | undefined
): NormalizedFeedbackOptions | null => {
  if (!input) return null;
  const options = input === true ? {} : input;
  const uniform = options.uniform ?? "previousFrame";

  if (uniform.startsWith("u_")) {
    throw new TextureLoadError(
      `Feedback uniform must be a suffix name without the u_ prefix: ${uniform}`
    );
  }

  if (!IDENTIFIER.test(uniform)) {
    throw new TextureLoadError(
      `Feedback uniform must be a valid GLSL identifier suffix: ${uniform}`
    );
  }

  const format = options.format ?? "rgba8";
  if (format !== "rgba8" && format !== "rgba16f") {
    throw new TextureLoadError(`Unknown feedback format: ${String(format)}`);
  }

  return {
    uniform,
    uniformName: toUniformName(uniform),
    sizeUniformName: toUniformName(`${uniform}Size`),
    filter: options.filter ?? "linear",
    wrap: options.wrap ?? "clamp",
    clearColor: options.clearColor ?? DEFAULT_CLEAR_COLOR,
    format,
    formatFallback: options.formatFallback ?? true
  };
};

export const createFeedbackState = (
  gl: GLContext,
  options: NormalizedFeedbackOptions,
  width: number,
  height: number,
  textureUnit: number
): FeedbackState => {
  const targets = createPingPong(gl, width, height, {
    format: options.format,
    formatFallback: options.formatFallback,
    filter: options.filter,
    wrap: options.wrap,
    clearColor: options.clearColor
  });

  let blitter: Blitter;
  try {
    blitter = createBlitter(gl);
  } catch (error) {
    targets.dispose();
    throw error;
  }

  return { options, targets, blitter, textureUnit };
};

export const resizeFeedbackState = (
  state: FeedbackState,
  width: number,
  height: number
): void => {
  state.targets.resize(width, height);
};

export const deleteFeedbackState = (state: FeedbackState | null): void => {
  if (!state) return;
  state.targets.dispose();
  state.blitter.dispose();
};

export const bindFeedbackForRead = (
  gl: GLContext,
  state: FeedbackState,
  samplerLocation: WebGLUniformLocation
): void => {
  gl.activeTexture(gl.TEXTURE0 + state.textureUnit);
  gl.bindTexture(gl.TEXTURE_2D, state.targets.read.texture);
  gl.uniform1i(samplerLocation, state.textureUnit);
};

export const copyFeedbackToCanvas = (
  state: FeedbackState,
  width: number,
  height: number
): void => {
  state.blitter.blit(state.targets.write.texture, null, width, height);
};

export const swapFeedbackTargets = (state: FeedbackState): void => {
  state.targets.swap();
};
