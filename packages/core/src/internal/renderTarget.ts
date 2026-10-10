import type {
  GLContext,
  PingPong,
  RenderTarget,
  RenderTargetFormat,
  RenderTargetOptions
} from "../types";
import { ShaderCompileError, UnsupportedError } from "./errors";
import { isWebGL2Context } from "./webgl";

const DEFAULT_CLEAR_COLOR = [0, 0, 0, 0] as const;

/**
 * Whether `format` can be allocated as a color attachment on `gl`. `rgba8` is
 * always available; `rgba16f` needs WebGL2 and `EXT_color_buffer_float`.
 * Enables the extension as a side effect when present.
 */
export const supportsRenderTargetFormat = (
  gl: GLContext,
  format: RenderTargetFormat
): boolean => {
  if (format === "rgba8") return true;
  return isWebGL2Context(gl) && gl.getExtension("EXT_color_buffer_float") !== null;
};

/**
 * Resolves the format a render target will actually use. When `format` is not
 * supported this warns and returns `rgba8`, or throws `UnsupportedError` when
 * `formatFallback` is `false`.
 */
export const resolveRenderTargetFormat = (
  gl: GLContext,
  format: RenderTargetFormat = "rgba8",
  formatFallback = true
): RenderTargetFormat => {
  if (supportsRenderTargetFormat(gl, format)) return format;

  const reason = `${format} render targets need WebGL2 with EXT_color_buffer_float.`;
  if (!formatFallback) throw new UnsupportedError(reason);
  console.warn(`[frapx] ${reason} Falling back to rgba8.`);
  return "rgba8";
};

/**
 * Creates a texture-backed framebuffer to render into and sample from. The
 * storage is cleared to `clearColor` on creation and on every resize.
 */
export const createRenderTarget = (
  gl: GLContext,
  width: number,
  height: number,
  options: RenderTargetOptions = {}
): RenderTarget => {
  const format = resolveRenderTargetFormat(
    gl,
    options.format,
    options.formatFallback
  );
  return new Target(gl, width, height, format, options);
};

/**
 * Creates two render targets of the same size and format for feedback-style
 * rendering: draw into `write` while sampling `read`, then `swap()`.
 */
export const createPingPong = (
  gl: GLContext,
  width: number,
  height: number,
  options: RenderTargetOptions = {}
): PingPong => {
  // Resolve once so a fallback warns a single time for both targets.
  const format = resolveRenderTargetFormat(
    gl,
    options.format,
    options.formatFallback
  );
  let read: RenderTarget = new Target(gl, width, height, format, options);
  let write: RenderTarget;
  try {
    write = new Target(gl, width, height, format, options);
  } catch (error) {
    read.dispose();
    throw error;
  }

  return {
    get read() {
      return read;
    },
    get write() {
      return write;
    },
    format,
    swap() {
      const previous = read;
      read = write;
      write = previous;
    },
    resize(nextWidth: number, nextHeight: number) {
      read.resize(nextWidth, nextHeight);
      write.resize(nextWidth, nextHeight);
    },
    clear() {
      read.clear();
      write.clear();
    },
    dispose() {
      read.dispose();
      write.dispose();
    }
  };
};

class Target implements RenderTarget {
  texture!: WebGLTexture;
  framebuffer!: WebGLFramebuffer;
  width: number;
  height: number;

  constructor(
    private readonly gl: GLContext,
    width: number,
    height: number,
    readonly format: RenderTargetFormat,
    private readonly options: RenderTargetOptions
  ) {
    this.width = width;
    this.height = height;
    this.allocate();
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.release();
    this.width = width;
    this.height = height;
    this.allocate();
  }

  clear(): void {
    const gl = this.gl;
    const [r, g, b, a] = this.options.clearColor ?? DEFAULT_CLEAR_COLOR;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    this.release();
  }

  private allocate(): void {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) {
      throw new ShaderCompileError("Failed to create render target texture.");
    }

    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      throw new ShaderCompileError("Failed to create render target framebuffer.");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (this.format === "rgba16f" && isWebGL2Context(gl)) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        this.width,
        this.height,
        0,
        gl.RGBA,
        gl.HALF_FLOAT,
        null
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.width,
        this.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
    }

    const wrap = getWrap(gl, this.options.wrap ?? "clamp");
    const filter = this.options.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new ShaderCompileError(
        `Render target framebuffer (${this.format}) is incomplete: ${status}`
      );
    }

    this.texture = texture;
    this.framebuffer = framebuffer;
    this.clear();
  }

  private release(): void {
    this.gl.deleteFramebuffer(this.framebuffer);
    this.gl.deleteTexture(this.texture);
  }
}

const getWrap = (
  gl: GLContext,
  wrap: NonNullable<RenderTargetOptions["wrap"]>
): number => {
  if (wrap === "repeat") return gl.REPEAT;
  if (wrap === "mirror") return gl.MIRRORED_REPEAT;
  return gl.CLAMP_TO_EDGE;
};
