export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

export type ShaderLayer = "background" | "overlay";
export type RenderMode = "always" | "demand";
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
  start(): void;
  stop(): void;
  render(): void;
  resize(): void;
  destroy(): void;
};
