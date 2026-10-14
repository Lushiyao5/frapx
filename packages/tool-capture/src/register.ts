import { captureSequence } from "./sequence";
import type { CaptureTarget, FrameSink, RenderHost, RenderJob, RenderTargetOptions } from "./types";

declare global {
  var __frapxRender: RenderHost | undefined;
}

// Posts each frame to the CLI, which intercepts the request and writes the
// file. A non-2xx answer (such as a failed disk write) fails the export.
const createEndpointSink = (endpoint: string): FrameSink => ({
  async write(name, data) {
    const response = await fetch(`${endpoint}/frame/${encodeURIComponent(name)}`, {
      method: "POST",
      body: data
    });
    if (!response.ok) {
      throw new Error(`Writing ${name} failed: ${response.status} ${await response.text()}`);
    }
  },
  async close() {}
});

/**
 * Makes `target` renderable by `@frapx/tool-render` (`frapx-render <url>`),
 * which renders frame ranges in a headless browser and writes them to disk.
 * Pass a getter when the page replaces its instance. Registering again
 * replaces the previous registration; the returned function removes it.
 */
export const registerRenderTarget = (
  target: CaptureTarget | (() => CaptureTarget),
  options: RenderTargetOptions
): (() => void) => {
  const { fps, duration, prepare } = options;
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError(`fps must be a positive number, got ${fps}`);
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError(`duration must be a positive number, got ${duration}`);
  }
  const resolve = typeof target === "function" ? target : () => target;
  let controller: AbortController | null = null;

  const host: RenderHost = {
    version: 1,
    describe: () => ({ fps, duration }),
    async render(job: RenderJob) {
      if (controller) throw new Error("A render job is already running.");
      const current = new AbortController();
      controller = current;
      try {
        await resolve().ready;
        await prepare?.({
          params: job.params,
          fps: job.fps,
          format: job.format,
          resolution: job.resolution
        });
        // prepare() may have replaced the instance.
        const instance = resolve();
        await instance.ready;
        if (job.resolution) {
          if (!instance.setResolution) {
            throw new Error("This render target cannot change its resolution.");
          }
          instance.setResolution(job.resolution);
        }
        await captureSequence(instance, {
          sink: createEndpointSink(job.endpoint),
          fps: job.fps,
          frameCount: job.frameCount,
          startFrame: job.startFrame,
          format: job.format,
          signal: current.signal
        });
        const canvas = instance.canvas;
        return { width: canvas?.width ?? 0, height: canvas?.height ?? 0 };
      } finally {
        controller = null;
      }
    },
    abort() {
      controller?.abort(new DOMException("The render was stopped.", "AbortError"));
    }
  };

  globalThis.__frapxRender = host;
  return () => {
    if (globalThis.__frapxRender === host) globalThis.__frapxRender = undefined;
  };
};
