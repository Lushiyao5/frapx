import type {
  CreateShaderBackgroundOptions,
  GLContext,
  RenderState,
  ShaderBackgroundInstance,
  ShaderStatus,
  TextureInput,
  TextureMap,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue
} from "./types";
import {
  TextureLoadError,
  UnsupportedError,
  createRuntimeHost,
  isGLSL300,
  loadTexture,
  toUniformName
} from "@frapx/core";
import type { HostFrameState, RuntimeHostInstance } from "@frapx/core";
import {
  applyProgramUniform,
  applyUniform,
  collectUniformLocations,
  createUniformCache,
  normalizeUniform,
  type NormalizedUniform
} from "./internal/uniforms";
import {
  bindFeedbackForRead,
  copyFeedbackToCanvas,
  createFeedbackState,
  deleteFeedbackState,
  normalizeFeedbackOptions,
  resizeFeedbackState,
  swapFeedbackTargets,
  type FeedbackState,
  type NormalizedFeedbackOptions
} from "./internal/feedback";
import {
  createFullscreenBuffer,
  createProgram,
  defaultVertexShader,
  defaultVertexShader300
} from "./internal/webgl";
import type { LoadedTexture } from "./internal/textures";

export const createShaderBackground = <
  TUniforms extends UniformInputMap = UniformInputMap
>(
  options: CreateShaderBackgroundOptions<TUniforms>
): ShaderBackgroundInstance<TUniforms> => {
  return new ShaderBackground<TUniforms>(options);
};

class ShaderBackground<TUniforms extends UniformInputMap>
  implements ShaderBackgroundInstance<TUniforms>
{
  readonly ready: Promise<void>;

  private readonly options: CreateShaderBackgroundOptions<TUniforms>;
  private readonly uniformCache: Map<string, NormalizedUniform>;
  private readonly warnedUniforms = new Set<string>();
  private readonly host: RuntimeHostInstance;

  // Shader-specific GL state
  private _gl: GLContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private attribLocation = -1;
  private uniformLocations = new Map<string, WebGLUniformLocation>();
  private textureInputs = new Map<string, TextureInput>();
  private textures = new Map<string, LoadedTexture>();
  private textureUnits = new Map<string, number>();
  private textureVersions = new Map<string, number>();
  private feedbackOptions: NormalizedFeedbackOptions | null = null;
  private feedbackState: FeedbackState | null = null;
  private shaderDestroyed = false;

  constructor(options: CreateShaderBackgroundOptions<TUniforms>) {
    this.options = options;
    this.uniformCache = createUniformCache(options.uniforms);

    this.host = createRuntimeHost({
      ...(options.target !== undefined && { target: options.target }),
      ...(options.canvas !== undefined && { canvas: options.canvas }),
      ...(options.layer !== undefined && { layer: options.layer }),
      ...(options.dpr !== undefined && { dpr: options.dpr }),
      ...(options.maxDpr !== undefined && { maxDpr: options.maxDpr }),
      ...(options.autoResize !== undefined && { autoResize: options.autoResize }),
      ...(options.canvasClass !== undefined && { canvasClass: options.canvasClass }),
      ...(options.canvasStyle !== undefined && { canvasStyle: options.canvasStyle }),
      ...(options.autoStart !== undefined && { autoStart: options.autoStart }),
      ...(options.pauseWhenOffscreen !== undefined && { pauseWhenOffscreen: options.pauseWhenOffscreen }),
      ...(options.pauseWhenHidden !== undefined && { pauseWhenHidden: options.pauseWhenHidden }),
      ...(options.respectReducedMotion !== undefined && { respectReducedMotion: options.respectReducedMotion }),
      ...(options.renderMode !== undefined && { renderMode: options.renderMode }),
      ...(options.debug !== undefined && { debug: options.debug }),

      createContext: (canvas) => {
        const want300 = isGLSL300(options.fragment);
        const contextType = want300 ? "webgl2" : "webgl";
        const attrs = {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false
        };
        const gl = canvas.getContext(contextType, attrs) as GLContext | null;
        if (!gl && want300) {
          throw new UnsupportedError("WebGL2 is not supported in this browser.");
        }
        return gl;
      },

      onInit: async (gl, width, height) => {
        this._gl = gl;
        if (this.host.canvas) {
          this.host.canvas.dataset.frapxShaderCanvas = "";
        }
        this.feedbackOptions = normalizeFeedbackOptions(options.feedback);
        this.initProgram(gl);
        this.textureInputs = new Map(Object.entries(options.textures ?? {}));
        this.assertNoFeedbackTextureConflict();
        this.initFeedback(gl, width, height);
        await this.loadTextureInputs(gl);
        this.applyTextureSizeUniforms();
      },

      onDraw: (state) => {
        if (this.shaderDestroyed || !this.program) return;
        this.drawFrame(state);
      },

      onResize: (state) => {
        if (this.shaderDestroyed) return;
        this.options.onResize?.(this.createRenderState(state));
      },

      onContextLost: () => {
        this.feedbackState = null;
      },

      onContextRestored: async (gl, width, height) => {
        this._gl = gl;
        this.initProgram(gl);
        this.applyCachedUniforms(gl);
        this.initFeedback(gl, width, height);
        await this.loadTextureInputs(gl);
        this.applyTextureSizeUniforms();
      },

      onReady: () => options.onReady?.(this),
      ...(options.onError !== undefined && { onError: options.onError })
    });

    this.ready = this.host.ready;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.host.canvas;
  }

  get gl(): GLContext | null {
    return this.host.gl;
  }

  get status(): ShaderStatus {
    return this.host.status;
  }

  get supported(): boolean {
    return this.host.supported;
  }

  start(): void {
    this.host.start();
  }

  stop(): void {
    this.host.stop();
  }

  render(): void {
    this.host.render();
  }

  resize(): void {
    this.host.resize();
  }

  destroy(): void {
    if (this.shaderDestroyed) return;
    this.shaderDestroyed = true;

    const gl = this._gl;
    if (gl) {
      for (const texture of this.textures.values()) {
        gl.deleteTexture(texture.texture);
      }
      deleteFeedbackState(gl, this.feedbackState);
      this.feedbackState = null;
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
    }

    this.host.destroy();
  }

  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>
  ): void;
  setUniform(name: string, value: UniformInput): void;
  setUniform(name: string, value: UniformInput): void {
    if (this.shaderDestroyed) return;
    const uniformName = toUniformName(name);
    this.uniformCache.set(uniformName, normalizeUniform(value));

    const gl = this._gl;
    const location = this.uniformLocations.get(uniformName);
    if (gl && this.program && location) {
      applyProgramUniform(
        gl,
        this.program,
        location,
        this.uniformCache.get(uniformName)!
      );
    } else if (this.program) {
      this.warnUnknownUniform(uniformName);
    }

    if (this.options.renderMode === "demand" && !this.shaderDestroyed) {
      this.host.render();
    }
  }

  setUniforms(values: Record<string, UniformInput>): void {
    for (const [name, value] of Object.entries(values)) {
      this.setUniform(name, value);
    }
  }

  async setTexture(name: string, input: TextureInput): Promise<void> {
    if (this.shaderDestroyed) return;
    if (this.feedbackOptions?.uniform === name) {
      const error = new TextureLoadError(
        `Texture name conflicts with feedback uniform: ${name}`
      );
      this.options.onError?.(error);
      throw error;
    }

    let gl = this._gl;
    if (!gl) {
      await this.ready;
      if (this.shaderDestroyed) return;
      gl = this._gl;
    }

    if (!gl) {
      const error = new TextureLoadError(
        "Cannot set texture before WebGL is ready."
      );
      this.options.onError?.(error);
      throw error;
    }

    const version = (this.textureVersions.get(name) ?? 0) + 1;
    this.textureVersions.set(name, version);

    try {
      const unit = this.resolveTextureUnit(gl, name);
      const loaded = await loadTexture(gl, name, input, unit);

      if (this.shaderDestroyed || this.textureVersions.get(name) !== version) {
        gl.deleteTexture(loaded.texture);
        return;
      }

      const previous = this.textures.get(name);
      this.textureInputs.set(name, input);
      this.textures.set(name, loaded);
      if (previous) gl.deleteTexture(previous.texture);
      this.applyTextureSizeUniform(loaded);

      if (this.options.renderMode === "demand" && !this.shaderDestroyed) {
        this.host.render();
      }
    } catch (error) {
      if (!this.textures.has(name) && !this.textureInputs.has(name)) {
        this.textureUnits.delete(name);
      }
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(normalized);
      throw normalized;
    }
  }

  async setTextures(values: TextureMap): Promise<void> {
    await Promise.all(
      Object.entries(values).map(([name, input]) =>
        this.setTexture(name, input)
      )
    );
  }

  private drawFrame(state: HostFrameState): void {
    const gl = state.gl;

    this.uniformCache.set("u_time", { type: "float", value: [state.time] });
    this.uniformCache.set("u_delta", { type: "float", value: [state.delta] });

    this.resizeFeedback(gl, state.width, state.height);
    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      this.feedbackState ? this.feedbackState.write.framebuffer : null
    );
    gl.viewport(0, 0, state.width, state.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    this.applyBuiltInUniforms(gl, state);

    const renderState = this.createRenderState(state);
    this.options.onBeforeRender?.(renderState);
    // Re-establish core draw state after user hook so GL side-effects
    // (program, buffer, attribs, textures) cannot corrupt the core draw.
    this.prepareDrawState(gl);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.options.onAfterRender?.(renderState);

    if (this.feedbackState) {
      copyFeedbackToCanvas(gl, this.feedbackState, state.width, state.height);
      swapFeedbackTargets(this.feedbackState);
    }
  }

  private initProgram(gl: GLContext): void {
    if (this.program) gl.deleteProgram(this.program);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    deleteFeedbackState(gl, this.feedbackState);
    this.feedbackState = null;

    const defaultVertex = isGLSL300(this.options.fragment)
      ? defaultVertexShader300
      : defaultVertexShader;
    this.program = createProgram(
      gl,
      this.options.vertex ?? defaultVertex,
      this.options.fragment
    );
    gl.useProgram(this.program);
    this.buffer = createFullscreenBuffer(gl, this.program);
    this.attribLocation = gl.getAttribLocation(this.program, "a_position");
    this.uniformLocations = collectUniformLocations(gl, this.program);
  }

  // Re-bind core program, geometry, textures and uniforms so a draw is correct
  // regardless of GL state changed by onBeforeRender/onAfterRender.
  private prepareDrawState(gl: GLContext): void {
    if (!this.program) return;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (this.attribLocation >= 0) {
      gl.enableVertexAttribArray(this.attribLocation);
      gl.vertexAttribPointer(this.attribLocation, 2, gl.FLOAT, false, 0, 0);
    }
    this.applyTextures(gl);
    this.applyCachedUniforms(gl);
    this.applyFeedbackTexture(gl);
  }

  private initFeedback(gl: GLContext, width: number, height: number): void {
    if (!this.feedbackOptions) return;
    const unit = this.resolveTextureUnit(gl, this.feedbackOptions.uniform);
    this.feedbackState = createFeedbackState(
      gl,
      this.feedbackOptions,
      width,
      height,
      unit,
      this.options.fragment
    );
    this.applyFeedbackSizeUniform();
  }

  private resizeFeedback(gl: GLContext, width: number, height: number): void {
    if (!this.feedbackState) return;
    resizeFeedbackState(gl, this.feedbackState, width, height);
    this.applyFeedbackSizeUniform();
  }

  private applyBuiltInUniforms(gl: GLContext, state: HostFrameState): void {
    const builtIns: Record<string, UniformInput> = {
      resolution: [state.width, state.height],
      viewportSize: [state.viewportWidth, state.viewportHeight],
      pixelRatio: state.pixelRatio,
      pointer: [state.pointer.x, state.pointer.y],
      pointerUv: [state.pointer.uvX, state.pointer.uvY],
      pointerActive: state.pointer.active,
      reducedMotion: state.reducedMotion ? 1 : 0
    };

    for (const [name, value] of Object.entries(builtIns)) {
      this.uniformCache.set(toUniformName(name), normalizeUniform(value));
    }
    this.applyFeedbackSizeUniform();
    this.applyCachedUniforms(gl);
  }

  private applyFeedbackSizeUniform(): void {
    if (!this.feedbackState) return;
    const uniform = {
      type: "vec2" as const,
      value: [this.feedbackState.read.width, this.feedbackState.read.height]
    };
    this.uniformCache.set(this.feedbackState.options.sizeUniformName, uniform);
  }

  private applyTextureSizeUniforms(): void {
    for (const texture of this.textures.values()) {
      this.applyTextureSizeUniform(texture);
    }
  }

  private applyTextureSizeUniform(texture: LoadedTexture): void {
    const uniform = {
      type: "vec2" as const,
      value: [texture.width, texture.height]
    };
    this.uniformCache.set(texture.sizeUniformName, uniform);

    const gl = this._gl;
    const location = this.uniformLocations.get(texture.sizeUniformName);
    if (gl && this.program && location) {
      applyProgramUniform(gl, this.program, location, uniform);
    } else if (this.program) {
      this.warnUnknownUniform(texture.sizeUniformName);
    }
  }

  private applyCachedUniforms(gl: GLContext): void {
    for (const [name, uniform] of this.uniformCache) {
      const location = this.uniformLocations.get(name);
      if (!location) {
        this.warnUnknownUniform(name);
        continue;
      }
      applyUniform(gl, location, uniform);
    }
  }

  private applyTextures(gl: GLContext): void {
    for (const texture of this.textures.values()) {
      const unit = this.textureUnits.get(texture.name);
      if (unit === undefined) continue;
      const location = this.uniformLocations.get(texture.uniformName);
      if (!location) {
        this.warnUnknownUniform(texture.uniformName);
        continue;
      }

      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniform1i(location, unit);
    }
  }

  private applyFeedbackTexture(gl: GLContext): void {
    if (!this.feedbackState) return;
    const location = this.uniformLocations.get(
      this.feedbackState.options.uniformName
    );
    if (!location) {
      this.warnUnknownUniform(this.feedbackState.options.uniformName);
      return;
    }
    bindFeedbackForRead(gl, this.feedbackState, location);
  }

  private async loadTextureInputs(gl: GLContext): Promise<void> {
    const loadedTextures = new Map<string, LoadedTexture>();

    for (const [name, input] of this.textureInputs) {
      if (this.shaderDestroyed) break;
      const unit = this.resolveTextureUnit(gl, name);
      loadedTextures.set(name, await loadTexture(gl, name, input, unit));
    }

    for (const texture of this.textures.values()) {
      gl.deleteTexture(texture.texture);
    }
    this.textures = loadedTextures;
  }

  private resolveTextureUnit(gl: GLContext, name: string): number {
    const existing = this.textureUnits.get(name);
    if (existing !== undefined) return existing;

    const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;

    for (let unit = 0; unit < maxUnits; unit += 1) {
      if (![...this.textureUnits.values()].includes(unit)) {
        this.textureUnits.set(name, unit);
        return unit;
      }
    }

    throw new TextureLoadError(
      `Texture unit limit exceeded while loading texture: ${name}`
    );
  }

  private assertNoFeedbackTextureConflict(): void {
    if (!this.feedbackOptions) return;
    if (this.textureInputs.has(this.feedbackOptions.uniform)) {
      throw new TextureLoadError(
        `Texture name conflicts with feedback uniform: ${this.feedbackOptions.uniform}`
      );
    }
  }

  private createRenderState(state: HostFrameState): RenderState<TUniforms> {
    return {
      instance: this,
      gl: state.gl,
      canvas: state.canvas,
      time: state.time,
      delta: state.delta,
      frame: state.frame,
      width: state.width,
      height: state.height,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight,
      pixelRatio: state.pixelRatio,
      reducedMotion: state.reducedMotion
    };
  }

  private warnUnknownUniform(name: string): void {
    if (!this.options.debug || this.warnedUniforms.has(name)) return;
    this.warnedUniforms.add(name);
    console.warn(`[frapx/shader] Uniform not found or optimized out: ${name}`);
  }
}
