import {
  DestroyedError,
  TextureLoadError,
  UnsupportedError,
  applyUniform,
  applyUniforms,
  createBlitter,
  createFullscreenProgram,
  createPingPong,
  createRenderTarget,
  createRuntimeHost,
  createTextureSet,
  createUniformCache,
  normalizeUniform,
  supportsRenderTargetFormat,
  toUniformName,
  waitForGpu
} from "@frapx/core";
import type {
  Blitter,
  FullscreenProgram,
  GLContext,
  HostFrameState,
  LoadedTexture,
  NormalizedUniform,
  PingPong,
  RenderTarget,
  RuntimeHostInstance,
  TextureSet
} from "@frapx/core";
import { Accumulator } from "./internal/accumulator";
import { resolveAccumulation } from "./internal/accumulation";
import { BUILT_IN_UNIFORMS, passSize, planPasses, type PassPlan } from "./internal/graph";
import { sampleAt, sampleTime } from "./internal/sampling";
import type {
  AccumulationOptions,
  CaptureFormat,
  CaptureOptions,
  CaptureResult,
  ClockMode,
  CreatePassesOptions,
  PassesInstance,
  ResolvedAccumulation,
  Resolution,
  ShaderStatus,
  TextureInput,
  TextureMap,
  UniformInput,
  UniformInputMap,
  UniformRuntimeValue
} from "./types";

const MAX_SAMPLE_BATCH = 64;
const FAST_WAIT_MS = 8;
const SLOW_WAIT_MS = 32;

export const createPasses = <TUniforms extends UniformInputMap = UniformInputMap>(
  options: CreatePassesOptions<TUniforms>
): PassesInstance<TUniforms> => new Passes<TUniforms>(options);

type PassState = {
  plan: PassPlan;
  program: FullscreenProgram;
  /** A pass that some pass reads from the previous frame keeps two buffers. */
  output: RenderTarget | PingPong;
  accumulator: Accumulator | null;
  unit: number;
  width: number;
  height: number;
};

// The target holding this frame's output; a two-buffer pass swaps when the
// next frame starts, so its write side is current until then.
const currentOf = (pass: PassState): RenderTarget =>
  "swap" in pass.output ? pass.output.write : pass.output;

const previousOf = (pass: PassState): RenderTarget =>
  "swap" in pass.output ? pass.output.read : pass.output;

class Passes<TUniforms extends UniformInputMap> implements PassesInstance<TUniforms> {
  readonly ready: Promise<void>;

  private readonly options: CreatePassesOptions<TUniforms>;
  private readonly plans: PassPlan[];
  private readonly host: RuntimeHostInstance;
  private readonly uniformCache: Map<string, NormalizedUniform>;
  private readonly textureSet: TextureSet;
  private readonly warnedUniforms = new Set<string>();
  private settings: ResolvedAccumulation;

  private context: WebGL2RenderingContext | null = null;
  private passes: PassState[] = [];
  private blitter: Blitter | null = null;
  private destroyed = false;
  private capturing = false;
  private drawn = 0;
  private inputsDirty = true;
  private lastFrameTime: number | null = null;
  private refineId = 0;
  private pendingUniforms = new Map<string, NormalizedUniform>();
  private pendingReset = false;

  constructor(options: CreatePassesOptions<TUniforms>) {
    this.options = options;
    this.plans = planPasses(options.passes);
    this.settings = resolveAccumulation(options.accumulation);
    this.uniformCache = createUniformCache(options.uniforms);
    this.textureSet = createTextureSet(options.textures);
    for (const name of Object.keys(options.textures ?? {})) {
      this.assertTextureName(name);
    }

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
      ...(options.clock !== undefined && { clock: options.clock }),
      ...(options.resolution !== undefined && { resolution: options.resolution }),
      ...(options.debug !== undefined && { debug: options.debug }),

      createContext: (canvas) => {
        const gl = canvas.getContext("webgl2", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false
        });
        if (!gl) throw new UnsupportedError("@frapx/fx-passes needs WebGL2.");
        return gl;
      },

      onInit: async (gl, width, height) => {
        this.initGl(gl, width, height);
        await this.textureSet.loadAll(gl, () => this.destroyed);
        this.applyTextureSizeUniforms();
        this.warnUnusedUniforms();
      },

      onDraw: (state) => {
        if (this.destroyed || !this.context) return;
        this.drawPreview(state);
      },

      onCaptureDraw: (state, signal) => this.drawCapture(state, signal),

      captureSource: () => {
        const last = this.passes[this.passes.length - 1];
        return last ? currentOf(last) : null;
      },

      onContextLost: () => {
        this.cancelRefine();
        this.passes = [];
        this.blitter = null;
        this.context = null;
      },

      onContextRestored: async (gl, width, height) => {
        this.initGl(gl, width, height);
        await this.textureSet.loadAll(gl, () => this.destroyed);
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

  get gl(): WebGL2RenderingContext | null {
    return this.context;
  }

  get status(): ShaderStatus {
    return this.host.status;
  }

  get supported(): boolean {
    return this.host.supported;
  }

  get clock(): ClockMode {
    return this.host.clock;
  }

  get accumulation(): ResolvedAccumulation {
    return this.settings;
  }

  get samplesDrawn(): number {
    return this.drawn;
  }

  start(): void {
    this.host.start();
  }

  stop(): void {
    this.host.stop();
    // The loop drew one sample per frame; the still frame refines from here.
    this.scheduleRefine();
  }

  render(): void {
    this.host.render();
  }

  resize(): void {
    this.host.resize();
  }

  setTime(seconds: number): void {
    if (this.destroyed) return;
    this.host.setTime(seconds);
  }

  setClock(clock: ClockMode): void {
    if (this.destroyed) return;
    this.host.setClock(clock);
    this.scheduleRefine();
  }

  setResolution(resolution: Resolution | null): void {
    if (this.destroyed) return;
    this.host.setResolution(resolution);
  }

  setAccumulation(options: AccumulationOptions): void {
    if (this.destroyed) return;
    this.settings = resolveAccumulation(options, this.settings);
    this.invalidate();
  }

  captureFrame<F extends CaptureFormat = "png">(
    options?: CaptureOptions<F>
  ): Promise<CaptureResult<F>> {
    return this.host.captureFrame(options);
  }

  resetFeedback(): void {
    if (this.destroyed) return;
    if (this.capturing) {
      this.pendingReset = true;
      return;
    }
    for (const pass of this.passes) {
      if ("swap" in pass.output) pass.output.clear();
    }
    this.lastFrameTime = null;
    this.invalidate();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelRefine();
    if (this.context) {
      this.textureSet.dispose(this.context);
      this.disposeGl();
    }
    this.context = null;
    this.host.destroy();
  }

  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>
  ): void;
  setUniform(name: string, value: UniformInput): void;
  setUniform(name: string, value: UniformInput): void {
    if (this.destroyed) return;
    const uniformName = toUniformName(name);
    if (this.passes.length > 0) this.warnIfUnused(uniformName);
    if (this.capturing) {
      // Every sample of a capture sees the same inputs.
      this.pendingUniforms.set(uniformName, normalizeUniform(value));
      return;
    }
    this.uniformCache.set(uniformName, normalizeUniform(value));
    this.invalidate();
  }

  setUniforms(values: Record<string, UniformInput>): void {
    for (const [name, value] of Object.entries(values)) {
      this.setUniform(name, value);
    }
  }

  async setTexture(name: string, input: TextureInput): Promise<void> {
    if (this.destroyed) return;
    try {
      this.assertTextureName(name);
    } catch (error) {
      this.options.onError?.(error as Error);
      throw error;
    }

    let gl = this.context;
    if (!gl) {
      await this.ready;
      if (this.destroyed) return;
      gl = this.context;
    }
    if (!gl) {
      const error = new TextureLoadError("Cannot set texture before WebGL is ready.");
      this.options.onError?.(error);
      throw error;
    }

    try {
      const loaded = await this.textureSet.set(gl, name, input, () => this.destroyed);
      if (!loaded) return;
      this.setTextureSizeUniform(loaded);
      this.invalidate();
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(normalized);
      throw normalized;
    }
  }

  async setTextures(values: TextureMap): Promise<void> {
    await Promise.all(
      Object.entries(values).map(([name, input]) => this.setTexture(name, input))
    );
  }

  // --- Drawing ---------------------------------------------------------------

  private get hasAccumulation(): boolean {
    return this.plans[0]!.accumulate;
  }

  private drawPreview(state: HostFrameState): void {
    this.beginFrame(state);
    if (this.hasAccumulation) {
      if (this.drawn < this.settings.samples) {
        this.drawSample(state, this.drawn, this.settings);
        this.drawn += 1;
        this.reportSample(false, this.settings.samples);
      }
    } else {
      this.drawn = 1;
    }
    this.finishFrame(state);
    this.scheduleRefine();
  }

  private async drawCapture(
    state: HostFrameState,
    signal: AbortSignal | undefined
  ): Promise<void> {
    const gl = this.context;
    if (!gl) throw new UnsupportedError("Cannot capture without a WebGL context.");
    this.cancelRefine();
    this.capturing = true;
    // Settings changed during the capture apply to the next frame.
    const settings = this.settings;
    try {
      // Start the frame's samples over, whatever a preview already summed.
      this.inputsDirty = true;
      this.beginFrame(state);
      const total = this.hasAccumulation ? settings.samples : 0;
      // Samples submitted between GPU waits: doubles while a wait finishes
      // within a couple of polls and halves once one drags on, so a batch
      // stays a small fraction of the browser's GPU watchdog.
      let batch = 1;
      let sinceWait = 0;
      for (let index = 0; index < total; index++) {
        if (sinceWait === batch) {
          // Yield between samples so long frames never trip the GPU watchdog.
          const started = performance.now();
          await waitForGpu(gl);
          const waited = performance.now() - started;
          if (waited < FAST_WAIT_MS) batch = Math.min(batch * 2, MAX_SAMPLE_BATCH);
          else if (waited > SLOW_WAIT_MS) batch = Math.max(1, batch >> 1);
          sinceWait = 0;
          if (this.destroyed) throw new DestroyedError("Passes were destroyed.");
          if (!this.context) throw new UnsupportedError("The WebGL context was lost while capturing.");
        }
        sinceWait += 1;
        signal?.throwIfAborted();
        this.drawSample(state, index, settings);
        this.drawn = index + 1;
        this.reportSample(true, total);
      }
      if (!this.hasAccumulation) this.drawn = 1;
      // Runs in the task that settles, so the host reads it before compositing.
      this.finishFrame(state);
    } finally {
      this.capturing = false;
      this.applyDeferredInputs();
      // An aborted capture leaves a partial frame for refinement to finish.
      this.scheduleRefine();
    }
  }

  private applyDeferredInputs(): void {
    if (this.destroyed) return;
    for (const [name, uniform] of this.pendingUniforms) {
      this.uniformCache.set(name, uniform);
    }
    const changed = this.pendingUniforms.size > 0;
    this.pendingUniforms.clear();
    if (this.pendingReset) {
      this.pendingReset = false;
      this.resetFeedback();
    } else if (changed) {
      this.invalidate();
    }
  }

  // Starts a frame: matches the targets to the canvas, advances the history
  // when the time moved on, and restarts the samples when an input changed.
  private beginFrame(state: HostFrameState): void {
    let reset = this.inputsDirty;
    for (const pass of this.passes) {
      const [width, height] = passSize(pass.plan, state.width, state.height);
      if (width === pass.width && height === pass.height) continue;
      pass.width = width;
      pass.height = height;
      pass.output.resize(width, height);
      pass.accumulator?.resize(width, height);
      reset = true;
    }

    if (state.time !== this.lastFrameTime) {
      for (const pass of this.passes) {
        if ("swap" in pass.output) pass.output.swap();
      }
      this.lastFrameTime = state.time;
      reset = true;
    }

    if (reset) {
      this.inputsDirty = false;
      this.drawn = 0;
      for (const pass of this.passes) pass.accumulator?.reset();
    }
  }

  private drawSample(
    state: HostFrameState,
    index: number,
    settings: ResolvedAccumulation
  ): void {
    const gl = this.context!;
    const sample = sampleAt(index);
    const total = settings.samples;
    const time = sampleTime(state.time, sample, settings.shutter, settings.fps ?? 1);
    this.cacheFrameUniforms(state);

    for (const pass of this.passes) {
      if (!pass.plan.accumulate) break;
      const accumulator = pass.accumulator!;
      accumulator.beginSample();
      this.preparePass(gl, pass, time);
      this.setPassUniform(gl, pass, "u_sampleIndex", index);
      this.setPassUniform(gl, pass, "u_sampleCount", total);
      this.setPassUniform(gl, pass, "u_jitter", sample.jitter);
      pass.program.draw();
      accumulator.endSample();
    }
  }

  // Resolves the accumulated passes, draws the rest once and shows the last.
  private finishFrame(state: HostFrameState): void {
    const gl = this.context!;
    this.cacheFrameUniforms(state);

    for (const pass of this.passes) {
      if (pass.accumulator) {
        pass.accumulator.resolveInto(currentOf(pass));
        continue;
      }
      const target = currentOf(pass);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, pass.width, pass.height);
      this.preparePass(gl, pass, state.time);
      this.setPassUniform(gl, pass, "u_sampleIndex", 0);
      this.setPassUniform(gl, pass, "u_sampleCount", 1);
      this.setPassUniform(gl, pass, "u_jitter", [0, 0]);
      pass.program.draw();
    }

    const last = this.passes[this.passes.length - 1]!;
    this.blitter!.blit(currentOf(last).texture, null, state.width, state.height);
  }

  // Binds a pass' program, textures, inputs and uniforms. The caller has bound
  // the framebuffer and viewport.
  private preparePass(gl: WebGL2RenderingContext, pass: PassState, time: number): void {
    const { program } = pass;
    program.use();
    this.textureSet.bind(gl, program.locations);
    for (const input of pass.plan.inputs) {
      const source = this.passes[input.pass]!;
      const texture = input.previous ? previousOf(source) : currentOf(source);
      gl.activeTexture(gl.TEXTURE0 + source.unit);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      const location = program.locations.get(input.uniformName);
      if (location) gl.uniform1i(location, source.unit);
      this.setPassUniform(gl, pass, input.sizeUniformName, [source.width, source.height]);
    }
    applyUniforms(gl, program.locations, this.uniformCache);
    this.setPassUniform(gl, pass, "u_time", time);
    this.setPassUniform(gl, pass, "u_resolution", [pass.width, pass.height]);
  }

  private setPassUniform(
    gl: WebGL2RenderingContext,
    pass: PassState,
    name: string,
    value: UniformInput
  ): void {
    const location = pass.program.locations.get(name);
    if (location) applyUniform(gl, location, normalizeUniform(value));
  }

  private cacheFrameUniforms(state: HostFrameState): void {
    const values: Record<string, UniformInput> = {
      u_frameTime: state.time,
      u_delta: state.delta,
      u_viewportSize: [state.viewportWidth, state.viewportHeight],
      u_pixelRatio: state.pixelRatio,
      u_pointer: [state.pointer.x, state.pointer.y],
      u_pointerUv: [state.pointer.uvX, state.pointer.uvY],
      u_pointerActive: state.pointer.active,
      u_reducedMotion: state.reducedMotion ? 1 : 0
    };
    for (const [name, value] of Object.entries(values)) {
      this.uniformCache.set(name, normalizeUniform(value));
    }
  }

  private reportSample(capturing: boolean, total: number): void {
    this.options.onSample?.({ drawn: this.drawn, total, capturing });
  }

  // --- Progressive refinement ------------------------------------------------

  // A still frame keeps adding samples on animation frames until complete,
  // under either clock. While the realtime loop runs it draws every frame
  // itself, and a capture always starts the frame's samples over.
  private scheduleRefine(): void {
    if (
      this.refineId ||
      this.destroyed ||
      this.capturing ||
      // Only refine a frame that was drawn; never draw on our own first.
      this.lastFrameTime === null ||
      !this.hasAccumulation ||
      this.drawn >= this.settings.samples ||
      // A running realtime loop draws every frame itself; demand mode does not.
      (this.host.status === "running" && this.options.renderMode !== "demand")
    ) {
      return;
    }
    this.refineId = requestAnimationFrame(() => {
      this.refineId = 0;
      this.host.render();
    });
  }

  private cancelRefine(): void {
    if (this.refineId) cancelAnimationFrame(this.refineId);
    this.refineId = 0;
  }

  // An input changed: the next draw restarts the frame's samples. Redraws
  // right away in demand mode, and otherwise lets refinement pick it up.
  private invalidate(): void {
    this.inputsDirty = true;
    if (!this.context || this.capturing) return;
    if (this.options.renderMode === "demand" && this.host.clock !== "manual") {
      this.host.render();
      return;
    }
    if (this.drawn > 0) {
      this.drawn = 0;
      this.scheduleRefine();
    }
  }

  // --- GL resources ----------------------------------------------------------

  private initGl(gl: GLContext, width: number, height: number): void {
    const gl2 = gl as WebGL2RenderingContext;
    if (!supportsRenderTargetFormat(gl2, "rgba32f")) {
      throw new UnsupportedError(
        "@frapx/fx-passes needs EXT_color_buffer_float for float render targets."
      );
    }
    this.disposeGl();
    this.context = gl2;
    if (this.host.canvas) this.host.canvas.dataset.frapxPassesCanvas = "";

    const passes: PassState[] = [];
    try {
      for (const plan of this.plans) {
        const program = createFullscreenProgram(gl2, plan.fragment, plan.vertex);
        const [passWidth, passHeight] = passSize(plan, width, height);
        const targetOptions = {
          format: plan.format,
          formatFallback: false,
          filter: plan.filter,
          wrap: plan.wrap
        };
        const output = plan.keepsHistory
          ? createPingPong(gl2, passWidth, passHeight, targetOptions)
          : createRenderTarget(gl2, passWidth, passHeight, targetOptions);
        const accumulator = plan.accumulate
          ? new Accumulator(gl2, passWidth, passHeight)
          : null;
        passes.push({
          plan,
          program,
          output,
          accumulator,
          unit: this.textureSet.reserveUnit(gl2, `pass:${plan.name}`),
          width: passWidth,
          height: passHeight
        });
      }
      this.blitter = createBlitter(gl2);
    } catch (error) {
      for (const pass of passes) disposePass(pass);
      throw error;
    }
    this.passes = passes;
    this.lastFrameTime = null;
    this.inputsDirty = true;
    this.drawn = 0;
  }

  private disposeGl(): void {
    for (const pass of this.passes) disposePass(pass);
    this.passes = [];
    this.blitter?.dispose();
    this.blitter = null;
  }

  private applyTextureSizeUniforms(): void {
    for (const texture of this.textureSet.textures.values()) {
      this.setTextureSizeUniform(texture);
    }
  }

  private setTextureSizeUniform(texture: LoadedTexture): void {
    this.uniformCache.set(texture.sizeUniformName, {
      type: "vec2",
      value: [texture.width, texture.height]
    });
  }

  private assertTextureName(name: string): void {
    const uniformName = toUniformName(name);
    const clash = this.plans.find(
      (plan) =>
        toUniformName(plan.name) === uniformName ||
        toUniformName(`${plan.name}Size`) === uniformName
    );
    if (clash || BUILT_IN_UNIFORMS.has(uniformName)) {
      throw new TextureLoadError(
        `Texture name ${name} collides with ${clash ? `pass ${clash.name}` : "a built-in uniform"}.`
      );
    }
  }

  private warnUnusedUniforms(): void {
    for (const name of this.uniformCache.keys()) this.warnIfUnused(name);
  }

  private warnIfUnused(name: string): void {
    if (!this.options.debug || this.warnedUniforms.has(name)) return;
    if (this.passes.some((pass) => pass.program.locations.has(name))) return;
    this.warnedUniforms.add(name);
    console.warn(`[frapx/passes] Uniform not found in any pass or optimized out: ${name}`);
  }
}

const disposePass = (pass: PassState): void => {
  pass.program.dispose();
  pass.output.dispose();
  pass.accumulator?.dispose();
};
