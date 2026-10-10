export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

export type ShaderLayer = "background" | "overlay";
export type RenderMode = "always" | "demand";
/**
 * `"realtime"` advances time from requestAnimationFrame. `"manual"` never
 * renders on its own: time only changes through `setTime()` and frames are
 * drawn only by explicit `render()` calls, so output is deterministic.
 */
export type ClockMode = "realtime" | "manual";
/** Fixed internal render size in pixels: `[width, height]`. */
export type Resolution = readonly [number, number];
export type DprOption = "auto" | number | (() => number);

export type ShaderStatus =
  | "idle"
  | "loading"
  | "ready"
  | "running"
  | "paused"
  | "error"
  | "unsupported"
  | "context-lost"
  | "destroyed";

export type TextureSource = string | HTMLImageElement | HTMLCanvasElement;

export type TextureOptions = {
  source: TextureSource;
  wrap?: "clamp" | "repeat" | "mirror";
  filter?: "nearest" | "linear";
  flipY?: boolean;
};

export type TextureInput = TextureSource | TextureOptions;
export type TextureMap = Record<string, TextureInput>;

export type UniformScalar = number;
export type UniformVec2 = [number, number] | readonly [number, number];
export type UniformVec3 =
  | [number, number, number]
  | readonly [number, number, number];
export type UniformVec4 =
  | [number, number, number, number]
  | readonly [number, number, number, number];

export type UniformType = "float" | "vec2" | "vec3" | "vec4" | "mat3" | "mat4";

export type ExplicitUniformInput = {
  type: UniformType;
  value: number[] | Float32Array;
};

export type UniformInput =
  | UniformScalar
  | UniformVec2
  | UniformVec3
  | UniformVec4
  | Float32Array
  | ExplicitUniformInput;

export type UniformInputMap = Record<string, UniformInput>;

export type UniformRuntimeValue<T> = T extends ExplicitUniformInput
  ? ExplicitUniformInput
  : T extends Float32Array
    ? Float32Array
    : T extends readonly [number, number]
      ? UniformVec2
      : T extends readonly [number, number, number]
        ? UniformVec3
        : T extends readonly [number, number, number, number]
          ? UniformVec4
          : T extends number
            ? number
            : UniformInput;

export type FeedbackOptions = {
  /**
   * Suffix name for the generated sampler uniform. Defaults to
   * "previousFrame", which creates `u_previousFrame` and
   * `u_previousFrameSize`.
   */
  uniform?: string;
  filter?: "nearest" | "linear";
  wrap?: "clamp" | "repeat" | "mirror";
  clearColor?: UniformVec4;
};

export type RenderState<TUniforms extends UniformInputMap = UniformInputMap> = {
  instance: ShaderBackgroundInstance<TUniforms>;
  gl: GLContext;
  canvas: HTMLCanvasElement;
  time: number;
  delta: number;
  frame: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  /** Whether the OS "prefers reduced motion" setting is currently enabled. */
  reducedMotion: boolean;
};

export type CreateShaderBackgroundOptions<
  TUniforms extends UniformInputMap = UniformInputMap,
> = {
  target?: string | Element;
  canvas?: HTMLCanvasElement;
  fragment: string;
  vertex?: string;
  uniforms?: TUniforms;
  textures?: TextureMap;
  feedback?: boolean | FeedbackOptions;
  layer?: ShaderLayer;
  autoStart?: boolean;
  pauseWhenOffscreen?: boolean;
  /**
   * Pause the render loop while the document is hidden (e.g. a background tab).
   * Defaults to `true`.
   */
  pauseWhenHidden?: boolean;
  /**
   * When `true`, automatically hold a single static frame while the user's OS
   * "prefers reduced motion" setting is enabled. Defaults to `false`. The
   * `u_reducedMotion` uniform (0/1) is always supplied regardless of this flag.
   */
  respectReducedMotion?: boolean;
  renderMode?: RenderMode;
  /**
   * Defaults to `"realtime"`. With `"manual"`, no animation loop runs: set the
   * time with `setTime()` and draw with `render()`. Offscreen, hidden and
   * reduced-motion pausing are bypassed, and `u_pointer*` / `u_reducedMotion`
   * stay at 0 so the same time and uniforms always produce the same pixels.
   * Switch later with `setClock()`.
   */
  clock?: ClockMode;
  /**
   * Fixes the internal render size (`u_resolution`) instead of following the
   * target's size. The canvas is letterboxed with `object-fit: contain`,
   * `u_viewportSize` stays the displayed size and `u_pixelRatio` is derived
   * from the two; `dpr` and `maxDpr` are ignored. Required when neither
   * `target` nor `canvas` is given, in which case a detached canvas is created.
   * Change later with `setResolution()`.
   */
  resolution?: Resolution;
  dpr?: DprOption;
  maxDpr?: number;
  autoResize?: boolean;
  debug?: boolean;
  canvasClass?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  onReady?: (instance: ShaderBackgroundInstance<TUniforms>) => void;
  onError?: (error: Error) => void;
  onBeforeRender?: (state: RenderState<TUniforms>) => void;
  onAfterRender?: (state: RenderState<TUniforms>) => void;
  /** Called whenever the observed size actually changes (not every frame). */
  onResize?: (state: RenderState<TUniforms>) => void;
};

export type ShaderBackgroundInstance<
  TUniforms extends UniformInputMap = UniformInputMap,
> = {
  readonly canvas: HTMLCanvasElement | null;
  readonly gl: GLContext | null;
  readonly status: ShaderStatus;
  readonly supported: boolean;
  readonly ready: Promise<void>;
  /** The active clock mode. */
  readonly clock: ClockMode;
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
  /**
   * Sets `u_time` to `seconds`. In manual mode `u_delta` becomes the difference
   * from the previous `setTime()` value (0 the first time, not clamped). In
   * realtime mode this seeks the running clock. Does not render by itself.
   */
  setTime(seconds: number): void;
  /**
   * Switches between `"realtime"` and `"manual"` clocks. Returning to realtime
   * resumes the loop if the instance was started.
   */
  setClock(clock: ClockMode): void;
  /**
   * Fixes the internal render size, or follows the target's size again when
   * `null`. Resets the feedback buffers like any resize. Throws
   * `UnsupportedError` when the size exceeds the GPU's limits, and `TypeError`
   * when passing `null` to an instance created without a target.
   */
  setResolution(resolution: Resolution | null): void;
  setTexture(name: string, input: TextureInput): Promise<void>;
  setTextures(values: TextureMap): Promise<void>;
  setUniform<K extends keyof TUniforms & string>(
    name: K,
    value: UniformRuntimeValue<TUniforms[K]>,
  ): void;
  setUniform(name: string, value: UniformInput): void;
  setUniforms(values: Record<string, UniformInput>): void;
};
