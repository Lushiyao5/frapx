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

export type HostPointer = {
  x: number;
  y: number;
  uvX: number;
  uvY: number;
  active: number;
};

export type HostFrameState = {
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
  reducedMotion: boolean;
  pointer: HostPointer;
};

export type SetupCanvasOptions = {
  target?: string | Element;
  canvas?: HTMLCanvasElement;
  layer?: ShaderLayer;
  canvasClass?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  /**
   * When neither `target` nor `canvas` is given, create a canvas that is not
   * attached to the document instead of failing.
   */
  detached?: boolean;
};

export type RuntimeHostOptions = {
  target?: string | Element;
  canvas?: HTMLCanvasElement;
  layer?: ShaderLayer;
  dpr?: DprOption;
  maxDpr?: number;
  autoResize?: boolean;
  canvasClass?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  autoStart?: boolean;
  pauseWhenOffscreen?: boolean;
  pauseWhenHidden?: boolean;
  respectReducedMotion?: boolean;
  renderMode?: RenderMode;
  /** Defaults to `"realtime"`. See {@link ClockMode}. */
  clock?: ClockMode;
  /**
   * Fixes the internal render size instead of following the target's size.
   * Required when neither `target` nor `canvas` is given.
   */
  resolution?: Resolution;
  debug?: boolean;

  createContext: (canvas: HTMLCanvasElement) => GLContext | null;
  onInit: (gl: GLContext, width: number, height: number) => Promise<void> | void;
  onDraw: (state: HostFrameState) => void;
  /** Called whenever the observed size actually changes (not every frame). */
  onResize?: (state: HostFrameState) => void;
  onContextLost?: () => void;
  onContextRestored?: (
    gl: GLContext,
    width: number,
    height: number
  ) => Promise<void> | void;

  onReady?: () => void;
  onError?: (error: Error) => void;
};

export type RuntimeHostInstance = {
  readonly canvas: HTMLCanvasElement | null;
  readonly gl: GLContext | null;
  readonly status: ShaderStatus;
  readonly supported: boolean;
  readonly ready: Promise<void>;
  readonly clock: ClockMode;
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
  /**
   * Sets the clock to `seconds`. In manual mode `u_delta` becomes the
   * difference from the previous `setTime()` value (0 the first time). In
   * realtime mode this seeks the running clock. Does not render by itself.
   */
  setTime(seconds: number): void;
  /** Switches between realtime and manual clocks after creation. */
  setClock(clock: ClockMode): void;
  /**
   * Fixes the internal render size, or follows the target's size again when
   * `null`. Throws `UnsupportedError` when the size exceeds the GPU limits.
   */
  setResolution(resolution: Resolution | null): void;
};
