import { encodePng16 } from "./png16";
import type { CaptureSequenceOptions, CaptureTarget, SequenceFormat } from "./types";

const defaultFileName = (frame: number): string =>
  `frame_${String(frame).padStart(5, "0")}.png`;

const assertOptions = (fps: number, frameCount: number, startFrame: number) => {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError(`fps must be a positive number, got ${fps}`);
  }
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new RangeError(`frameCount must be a positive integer, got ${frameCount}`);
  }
  if (!Number.isInteger(startFrame) || startFrame < 0) {
    throw new RangeError(`startFrame must be a non-negative integer, got ${startFrame}`);
  }
};

const captureOne = async (
  target: CaptureTarget,
  format: SequenceFormat,
  signal: AbortSignal | undefined
): Promise<Blob> => {
  if (format === "png") {
    const png = await target.captureFrame({ format: "png", ...(signal ? { signal } : {}) });
    if (!(png instanceof Blob)) throw new TypeError("captureFrame() did not return a PNG Blob.");
    return png;
  }

  const pixels = await target.captureFrame({ format: "rgba16f", ...(signal ? { signal } : {}) });
  if (!(pixels instanceof Float32Array)) {
    throw new TypeError("captureFrame() did not return rgba16f pixels.");
  }
  const canvas = target.canvas;
  if (!canvas) throw new Error("Cannot size a 16-bit frame without a canvas.");
  return encodePng16(pixels, canvas.width, canvas.height);
};

/**
 * Renders frames `startFrame` to `startFrame + frameCount - 1` at
 * `frame / fps` seconds and writes each one to `options.sink`, resolving with
 * the sink's `close()` result.
 *
 * The target runs on its manual clock for the export and returns to its
 * previous clock afterwards, so pointer input and visibility never change the
 * output. A realtime clock resumes from the last exported frame's time. `u_delta` is `1 / fps` on every frame, including the first. On
 * failure or abort the sink's `abort()` runs and the promise rejects.
 */
export const captureSequence = async <TResult>(
  target: CaptureTarget,
  options: CaptureSequenceOptions<TResult>
): Promise<TResult> => {
  const {
    sink,
    fps,
    frameCount,
    startFrame = 0,
    format = "png",
    fileName = defaultFileName,
    resetFeedback = true,
    signal,
    onBeforeFrame,
    onProgress
  } = options;
  assertOptions(fps, frameCount, startFrame);
  if (format !== "png" && format !== "png16") {
    throw new RangeError(`Unknown sequence format: ${String(format)}`);
  }

  const previousClock = target.clock;
  try {
    signal?.throwIfAborted();
    await target.ready;

    target.setClock("manual");
    if (resetFeedback) target.resetFeedback?.();
    // Prime the clock one frame back so the first frame's u_delta is 1 / fps
    // rather than whatever the last preview left behind.
    target.setTime((startFrame - 1) / fps);

    for (let index = 0; index < frameCount; index++) {
      signal?.throwIfAborted();
      const frame = startFrame + index;
      const time = frame / fps;
      target.setTime(time);
      await onBeforeFrame?.({ frame, time });
      await sink.write(fileName(frame), await captureOne(target, format, signal));
      onProgress?.({ frame, time, completed: index + 1, total: frameCount });
    }
  } catch (error) {
    try {
      await sink.abort?.(error);
    } catch {
      // Report the original failure, not the cleanup's.
    }
    throw error;
  } finally {
    if (target.clock !== previousClock) target.setClock(previousClock);
  }

  return sink.close();
};
