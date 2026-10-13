import {
  createFullscreenProgram,
  createPingPong,
  createRenderTarget
} from "@frapx/core";
import type { FullscreenProgram, PingPong, RenderTarget } from "@frapx/core";

const addFragment = `#version 300 es
precision highp float;
uniform sampler2D u_sum;
uniform sampler2D u_sample;
uniform float u_first;
out vec4 fragColor;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 value = texelFetch(u_sample, pixel, 0);
  fragColor = u_first > 0.5 ? value : texelFetch(u_sum, pixel, 0) + value;
}
`;

const resolveFragment = `#version 300 es
precision highp float;
uniform sampler2D u_sum;
uniform float u_scale;
out vec4 fragColor;

void main() {
  fragColor = texelFetch(u_sum, ivec2(gl_FragCoord.xy), 0) * u_scale;
}
`;

const SUM_OPTIONS = { format: "rgba32f", formatFallback: false, filter: "nearest" } as const;

/**
 * Sums the samples of one pass in 32-bit float and resolves their mean. Sums
 * with additive blending when `EXT_float_blend` allows blending into float
 * targets; otherwise each sample is drawn into its own target and added by a
 * second pass. Either way no sample is ever rounded to half precision, which
 * would bias the mean downward as the count grows.
 */
export class Accumulator {
  private count = 0;
  private width: number;
  private height: number;
  private readonly blend: boolean;
  private readonly sums: PingPong | null = null;
  private readonly sum: RenderTarget | null = null;
  private readonly sample: RenderTarget | null = null;
  private readonly add: FullscreenProgram | null = null;
  private readonly resolver: FullscreenProgram;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    width: number,
    height: number
  ) {
    this.width = width;
    this.height = height;
    this.blend = gl.getExtension("EXT_float_blend") !== null;
    if (this.blend) {
      this.sum = createRenderTarget(gl, width, height, SUM_OPTIONS);
    } else {
      this.sums = createPingPong(gl, width, height, SUM_OPTIONS);
      this.sample = createRenderTarget(gl, width, height, SUM_OPTIONS);
      this.add = createFullscreenProgram(gl, addFragment);
    }
    this.resolver = createFullscreenProgram(gl, resolveFragment);
  }

  /** Samples summed since the last reset. */
  get samples(): number {
    return this.count;
  }

  /** Whether samples are summed by blending (no extra target and pass). */
  get blending(): boolean {
    return this.blend;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.sum?.resize(width, height);
    this.sums?.resize(width, height);
    this.sample?.resize(width, height);
    this.count = 0;
  }

  reset(): void {
    this.count = 0;
  }

  /**
   * Binds the framebuffer the next sample is drawn into, with the viewport
   * and blending it needs. Follow the draw with `endSample()`.
   */
  beginSample(): void {
    const gl = this.gl;
    if (this.blend) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sum!.framebuffer);
      gl.viewport(0, 0, this.width, this.height);
      if (this.count === 0) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sample!.framebuffer);
      gl.viewport(0, 0, this.width, this.height);
    }
  }

  endSample(): void {
    const gl = this.gl;
    if (this.blend) {
      gl.disable(gl.BLEND);
    } else {
      const sums = this.sums!;
      const add = this.add!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, sums.write.framebuffer);
      gl.viewport(0, 0, this.width, this.height);
      add.use();
      bindSampler(gl, add, "u_sum", 0, sums.read.texture);
      bindSampler(gl, add, "u_sample", 1, this.sample!.texture);
      setFloat(gl, add, "u_first", this.count === 0 ? 1 : 0);
      add.draw();
      sums.swap();
    }
    this.count += 1;
  }

  /** Writes the mean of the summed samples into `target`. */
  resolveInto(target: RenderTarget): void {
    const gl = this.gl;
    const sum = this.blend ? this.sum! : this.sums!.read;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    this.resolver.use();
    bindSampler(gl, this.resolver, "u_sum", 0, sum.texture);
    setFloat(gl, this.resolver, "u_scale", this.count > 0 ? 1 / this.count : 0);
    this.resolver.draw();
  }

  dispose(): void {
    this.sum?.dispose();
    this.sums?.dispose();
    this.sample?.dispose();
    this.add?.dispose();
    this.resolver.dispose();
  }
}

const bindSampler = (
  gl: WebGL2RenderingContext,
  program: FullscreenProgram,
  name: string,
  unit: number,
  texture: WebGLTexture
): void => {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const location = program.locations.get(name);
  if (location) gl.uniform1i(location, unit);
};

const setFloat = (
  gl: WebGL2RenderingContext,
  program: FullscreenProgram,
  name: string,
  value: number
): void => {
  const location = program.locations.get(name);
  if (location) gl.uniform1f(location, value);
};
