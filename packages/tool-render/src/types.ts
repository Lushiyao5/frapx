export type SequenceFormat = "png" | "png16";
export type Encoder = "prores" | "h264";
export type BrowserName = "chrome" | "chromium";

export type RenderOptions = {
  /** An http(s) URL, or a directory to serve (such as a Vite `dist/`). */
  source: string;
  /** Output directory for the frames, `frapx-render.json` and encoded videos. */
  out: string;
  /** Inclusive frame range. Defaults to the page's duration at `fps`. */
  range?: readonly [number, number];
  /** Defaults to the page's frame rate. */
  fps?: number;
  /** Overrides the render size the page declares (or, without one, its own size). */
  resolution?: readonly [number, number];
  format: SequenceFormat;
  /** Passed to the page's `prepare()` as strings. */
  params: Readonly<Record<string, string>>;
  /** Skips frames already in `out`; the settings must match its `frapx-render.json`. */
  resume: boolean;
  encode: readonly Encoder[];
  browser: BrowserName;
  headed: boolean;
  /** Renders even when WebGL runs on a software renderer such as SwiftShader. */
  allowSoftware: boolean;
  /** Seconds to wait for the page to call `registerRenderTarget()`. */
  timeout: number;
};

export type RenderEvent =
  | {
      type: "start";
      url: string;
      renderer: string;
      fps: number;
      /** `--resolution`, else the page's declared size; `null` for the page's own size. */
      resolution: readonly [number, number] | null;
      range: readonly [number, number];
      /** Frames to render in this run; the rest of the range already exists. */
      pending: number;
    }
  | {
      type: "frame";
      frame: number;
      completed: number;
      total: number;
      /** Mean seconds per frame in this run. */
      secondsPerFrame: number;
    }
  | { type: "retry"; reason: string; attempt: number }
  | { type: "page-error"; message: string }
  | { type: "encode"; encoder: Encoder; file: string };

export type RenderResult = {
  out: string;
  range: readonly [number, number];
  /** Frames rendered in this run. */
  rendered: number;
  /** Encoded video files. */
  videos: string[];
};
