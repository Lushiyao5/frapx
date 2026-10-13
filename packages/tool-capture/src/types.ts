/**
 * Where exported frames go. `captureSequence()` calls `write()` once per frame
 * in order, then `close()` on success and resolves with its result, or
 * `abort()` when the export fails or is aborted.
 */
export type FrameSink<TResult = void> = {
  write(name: string, data: Blob): Promise<void>;
  close(): Promise<TResult>;
  abort?(reason: unknown): void | Promise<void>;
};

export type ClockMode = "realtime" | "manual";

/**
 * What `captureSequence()` drives. `@frapx/fx-canvas` and `@frapx/fx-passes`
 * instances satisfy it as is; neither package is a dependency.
 */
export type CaptureTarget = {
  readonly ready: Promise<void>;
  readonly canvas: { readonly width: number; readonly height: number } | null;
  readonly clock: ClockMode;
  setClock(clock: ClockMode): void;
  setTime(seconds: number): void;
  /**
   * `"png"` resolves to a `Blob`, `"rgba16f"` to RGBA floats, top row first.
   * Receives the export's `signal`, so a frame drawn over several tasks (such
   * as fx-passes sample accumulation) can stop part-way.
   */
  captureFrame(options: {
    format: "png" | "rgba16f";
    signal?: AbortSignal;
  }): Promise<Blob | Float32Array>;
  resetFeedback?(): void;
};

/**
 * `"png"` writes the canvas as an 8-bit PNG. `"png16"` reads the float
 * feedback buffer and writes a 16-bit PNG; the target needs a float buffer,
 * such as fx-canvas `feedback: { format: "rgba16f", formatFallback: false }`.
 */
export type SequenceFormat = "png" | "png16";

export type FrameInfo = {
  /** Absolute frame number: `startFrame` plus the frames already written. */
  frame: number;
  /** `frame / fps`, in seconds. */
  time: number;
};

export type CaptureProgress = FrameInfo & {
  /** Frames written so far, including this one. */
  completed: number;
  total: number;
};

export type CaptureSequenceOptions<TResult = void> = {
  sink: FrameSink<TResult>;
  /** Frames per second; frame `n` is drawn at `n / fps` seconds. */
  fps: number;
  /** Number of frames to write. */
  frameCount: number;
  /**
   * First frame number. Defaults to 0. Frame numbers name the files and set
   * the time, so for shaders that depend only on time a range split across
   * runs lines up with a single run. Feedback history does not carry over.
   */
  startFrame?: number;
  /** Defaults to `"png"`. */
  format?: SequenceFormat;
  /** Defaults to `frame_00000.png`. Must be a plain file name for folder sinks. */
  fileName?: (frame: number) => string;
  /**
   * Clears the target's feedback history before the first frame, so repeated
   * exports start from the same state. Defaults to `true`.
   */
  resetFeedback?: boolean;
  signal?: AbortSignal;
  /** Runs after the time is set and before the frame is drawn. */
  onBeforeFrame?: (info: FrameInfo) => void | Promise<void>;
  onProgress?: (progress: CaptureProgress) => void;
};
