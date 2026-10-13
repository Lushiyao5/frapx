import { createShaderBackground } from "@frapx/fx-canvas";
import type { Resolution, ShaderBackgroundInstance } from "@frapx/fx-canvas";
import {
  canPickDirectory,
  captureSequence,
  createZipSink,
  pickDirectorySink
} from "@frapx/tool-capture";
import type { CaptureProgress, FrameSink } from "@frapx/tool-capture";
import { LOOP_SECONDS, fragment } from "./scene.glsl";
import "./styles.css";

type ExportOptions = {
  startFrame: number;
  frameCount: number;
  samples: number;
  signal?: AbortSignal;
  onProgress?: (progress: CaptureProgress) => void;
  // Called after each sample but the last, which captureFrame() draws.
  onSample?: (frame: number, drawn: number) => void;
};

declare global {
  interface Window {
    // Read by verification scripts.
    __poolrooms?: {
      readonly fx: ShaderBackgroundInstance;
      readonly loopFrames: number;
      showFrame(frame: number): void;
      exportSequence<R>(sink: FrameSink<R>, options: ExportOptions): Promise<R>;
      createZipSink: typeof createZipSink;
    };
  }
}

const stage = document.querySelector<HTMLElement>("[data-stage]")!;
const resolutionSelect = document.querySelector<HTMLSelectElement>("[data-resolution]")!;
const fpsSelect = document.querySelector<HTMLSelectElement>("[data-fps]")!;
const modeSelect = document.querySelector<HTMLSelectElement>("[data-mode]")!;
const frameInput = document.querySelector<HTMLInputElement>("[data-frame]")!;
const frameOutput = document.querySelector<HTMLOutputElement>("[data-frame-output]")!;
const playButton = document.querySelector<HTMLButtonElement>("[data-play]")!;
const samplesLabel = document.querySelector<HTMLElement>("[data-samples]")!;
const sppInput = document.querySelector<HTMLInputElement>("[data-spp]")!;
const firstInput = document.querySelector<HTMLInputElement>("[data-first]")!;
const lastInput = document.querySelector<HTMLInputElement>("[data-last]")!;
const note = document.querySelector<HTMLElement>("[data-note]")!;
const exportButton = document.querySelector<HTMLButtonElement>("[data-export]")!;
const cancelButton = document.querySelector<HTMLButtonElement>("[data-cancel]")!;
const progressBar = document.querySelector<HTMLProgressElement>("[data-progress]")!;
const status = document.querySelector<HTMLElement>("[data-status]")!;

const parseResolution = (value: string): Resolution => {
  const [width, height] = value.split("x").map(Number);
  return [width!, height!];
};

// ?res=WxH, ?spp=N and ?frame=N preset the controls.
const params = new URLSearchParams(window.location.search);
const presetResolution = params.get("res");
if (
  presetResolution &&
  /^\d+x\d+$/.test(presetResolution) &&
  parseResolution(presetResolution).every((size) => size >= 1)
) {
  if (![...resolutionSelect.options].some((option) => option.value === presetResolution)) {
    resolutionSelect.add(new Option(presetResolution.replace("x", " × "), presetResolution));
  }
  resolutionSelect.value = presetResolution;
}
const presetSpp = Number(params.get("spp"));
if (Number.isInteger(presetSpp) && presetSpp >= 1) sppInput.value = String(presetSpp);

// Samples per exported frame. A paused still frame refines to the same count,
// so the preview shows what the export will look like.
const targetSamples = () => Math.max(1, Math.round(Number(sppInput.value)) || 1);

// The feedback buffer holds the running mean of the current frame's samples,
// so it must be float: 8-bit storage would round each step of the mean.
const fx = createShaderBackground({
  target: stage,
  fragment,
  clock: "manual",
  resolution: parseResolution(resolutionSelect.value),
  feedback: { format: "rgba16f", formatFallback: false, filter: "nearest" },
  uniforms: {
    loopFrame: 0,
    fps: Number(fpsSelect.value),
    sample: 0,
    samples: 0,
    preview: modeSelect.value === "preview" ? 1 : 0
  }
});

const loopFrames = () => Math.round(LOOP_SECONDS * Number(fpsSelect.value));

// Resolves once the GPU has finished everything submitted so far. Waiting
// between samples keeps each submission short, so a slow 4K frame never
// trips the browser's GPU watchdog and loses the context.
const gpuIdle = (): Promise<void> => {
  const gl = fx.gl;
  if (!(gl instanceof WebGL2RenderingContext)) return Promise.resolve();
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) return Promise.resolve();
  gl.flush();
  return new Promise((resolve) => {
    const poll = () => {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) {
        setTimeout(poll, 4);
        return;
      }
      gl.deleteSync(sync);
      resolve();
    };
    poll();
  });
};

let frame = Number(params.get("frame")) || 0;
let sample = 0;
let playing = false;
let exporting = false;
let rafId = 0;

const drawSample = () => {
  fx.setUniforms({ loopFrame: frame % loopFrames(), sample, samples: 0 });
  fx.render();
  sample += 1;
  showSamples();
};

const showSamples = () => {
  const target = targetSamples();
  if (playing) {
    samplesLabel.textContent = "Playing · 1 sample per frame";
  } else if (sample < target) {
    samplesLabel.textContent = `Refining · ${sample}/${target} samples`;
  } else {
    samplesLabel.textContent = `Done · ${target} samples`;
  }
};

const showFrame = (next: number) => {
  frame = next;
  sample = 0;
  frameInput.value = String(frame % loopFrames());
  frameOutput.value = String(frame % loopFrames());
};

// Playing draws one sample per frame; paused, the still frame keeps refining.
const tick = () => {
  rafId = 0;
  if (exporting) return;
  if (playing) {
    showFrame((frame + 1) % loopFrames());
    drawSample();
  } else if (sample < targetSamples()) {
    drawSample();
  } else {
    return;
  }
  rafId = requestAnimationFrame(tick);
};

const wake = () => {
  if (!rafId && !exporting) rafId = requestAnimationFrame(tick);
};

const setPlaying = (next: boolean) => {
  playing = next;
  playButton.textContent = playing ? "Pause" : "Play";
  if (!playing) sample = 0;
  wake();
};

/**
 * Writes frames startFrame .. startFrame + frameCount - 1, each the mean of
 * `samples` samples. The frame number names the file; the scene only sees it
 * modulo the loop, so frame loopFrames renders exactly like frame 0.
 */
const exportSequence = async <R>(sink: FrameSink<R>, options: ExportOptions): Promise<R> => {
  const { startFrame, frameCount, samples, signal, onProgress, onSample } = options;
  exporting = true;
  cancelAnimationFrame(rafId);
  rafId = 0;
  try {
    await gpuIdle();
    return await captureSequence(fx, {
      sink,
      fps: Number(fpsSelect.value),
      frameCount,
      startFrame,
      ...(signal ? { signal } : {}),
      ...(onProgress ? { onProgress } : {}),
      // Every sample but the last; captureFrame() draws the last one.
      async onBeforeFrame({ frame: current }) {
        fx.setUniform("loopFrame", current % loopFrames());
        for (let k = 0; k < samples - 1; k++) {
          signal?.throwIfAborted();
          fx.setUniforms({ sample: k, samples });
          fx.render();
          await gpuIdle();
          onSample?.(current, k + 1);
        }
        fx.setUniforms({ sample: samples - 1, samples });
      }
    });
  } finally {
    exporting = false;
    sample = 0;
    wake();
  }
};

const formatDuration = (seconds: number): string => {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s).padStart(2, "0")}s`;
};

const describe = () => {
  note.textContent = canPickDirectory()
    ? `Frames ${firstInput.value}–${lastInput.value} of a ${loopFrames()}-frame loop. Keep this tab visible while exporting.`
    : "Exporting to a folder needs the File System Access API (Chrome or Edge).";
};

let abort: AbortController | null = null;
const baseTitle = document.title;

const setBusy = (busy: boolean) => {
  exportButton.disabled = busy || !canPickDirectory();
  cancelButton.disabled = !busy;
  for (const control of [resolutionSelect, fpsSelect, modeSelect, frameInput, playButton]) {
    control.disabled = busy;
  }
  for (const input of [sppInput, firstInput, lastInput]) input.disabled = busy;
};

exportButton.addEventListener("click", async () => {
  const samples = targetSamples();
  const first = Math.max(0, Math.round(Number(firstInput.value)));
  const last = Math.max(first, Math.round(Number(lastInput.value)));
  const frameCount = last - first + 1;

  let folder: Awaited<ReturnType<typeof pickDirectorySink>>;
  try {
    folder = await pickDirectorySink();
  } catch {
    // The user dismissed the folder picker.
    return;
  }

  setPlaying(false);
  abort = new AbortController();
  setBusy(true);
  progressBar.value = 0;
  const started = performance.now();
  let written = 0;
  status.textContent = `0/${frameCount}`;
  note.textContent = `Rendering frame ${first}…`;
  document.title = `0/${frameCount} · ${baseTitle}`;

  try {
    await exportSequence(folder, {
      startFrame: first,
      frameCount,
      samples,
      signal: abort.signal,
      onSample(current, drawn) {
        progressBar.value = (written + drawn / samples) / frameCount;
        samplesLabel.textContent =
          drawn < samples - 1
            ? `Frame ${current} · ${drawn}/${samples} samples`
            : `Frame ${current} · writing PNG`;
      },
      onProgress({ frame: current, completed, total }) {
        written = completed;
        progressBar.value = completed / total;
        const elapsed = (performance.now() - started) / 1000;
        const remaining = (elapsed / completed) * (total - completed);
        status.textContent = `${completed}/${total}`;
        document.title = `${completed}/${total} · ${baseTitle}`;
        note.textContent =
          completed < total
            ? `Wrote frame ${current}. ${(elapsed / completed).toFixed(1)}s per frame, about ${formatDuration(remaining)} left.`
            : `Wrote frame ${current}.`;
      }
    });
    status.textContent = "Done";
    document.title = `✓ Done · ${baseTitle}`;
    note.textContent = `Wrote ${frameCount} frames (${first}–${last}) in ${formatDuration((performance.now() - started) / 1000)}.`;
  } catch (error) {
    if (abort.signal.aborted) {
      status.textContent = "Stopped";
      document.title = `Stopped · ${baseTitle}`;
      note.textContent = `Stopped after ${written} frames. Resume with First set to ${first + written}.`;
    } else {
      status.textContent = "Failed";
      document.title = `Failed · ${baseTitle}`;
      note.textContent = error instanceof Error ? error.message : String(error);
      console.error(error);
    }
  } finally {
    abort = null;
    setBusy(false);
  }
});

cancelButton.addEventListener("click", () => abort?.abort());

playButton.addEventListener("click", () => setPlaying(!playing));

frameInput.addEventListener("input", () => {
  setPlaying(false);
  showFrame(Number(frameInput.value));
  wake();
});

resolutionSelect.addEventListener("change", () => {
  fx.setResolution(parseResolution(resolutionSelect.value));
  sample = 0;
  wake();
});

modeSelect.addEventListener("change", () => {
  fx.setUniform("preview", modeSelect.value === "preview" ? 1 : 0);
  sample = 0;
  wake();
});

fpsSelect.addEventListener("change", () => {
  fx.setUniform("fps", Number(fpsSelect.value));
  frameInput.max = String(loopFrames() - 1);
  lastInput.value = String(loopFrames() - 1);
  showFrame(0);
  describe();
  wake();
});

sppInput.addEventListener("change", () => {
  // The running mean cannot drop samples, so a lower count starts over.
  if (sample > targetSamples()) sample = 0;
  if (!playing) showSamples();
  wake();
});

firstInput.addEventListener("change", describe);
lastInput.addEventListener("change", describe);

window.__poolrooms = {
  fx,
  get loopFrames() {
    return loopFrames();
  },
  showFrame(next: number) {
    setPlaying(false);
    showFrame(next);
    wake();
  },
  exportSequence,
  createZipSink
};

showFrame(frame);
describe();
setBusy(false);

void fx.ready.then(
  () => {
    status.textContent = "Ready";
    wake();
  },
  (error: unknown) => {
    // Needs WebGL2 with EXT_color_buffer_float for the float buffer.
    status.textContent = "Unsupported";
    exportButton.disabled = true;
    console.error(error);
  }
);
