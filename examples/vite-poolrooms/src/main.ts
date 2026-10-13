import { createPasses } from "@frapx/fx-passes";
import type { PassesInstance, Resolution, SampleProgress } from "@frapx/fx-passes";
import {
  canPickDirectory,
  captureSequence,
  createZipSink,
  pickDirectorySink
} from "@frapx/tool-capture";
import type { CaptureProgress, FrameSink } from "@frapx/tool-capture";
import { LOOP_SECONDS, display, scene } from "./scene.glsl";
import "./styles.css";

type ExportOptions = {
  startFrame: number;
  frameCount: number;
  samples: number;
  signal?: AbortSignal;
  onProgress?: (progress: CaptureProgress) => void;
  onSample?: (frame: number, drawn: number) => void;
};

declare global {
  interface Window {
    // Read by verification scripts.
    __poolrooms?: {
      readonly fx: PassesInstance;
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

let frame = Number(params.get("frame")) || 0;
let playing = false;
let exporting = false;
let rafId = 0;
// Where sample progress goes: the preview label, or the export's progress.
let reportSample = (progress: SampleProgress) => {
  if (!progress.capturing) showSamples(progress.drawn, progress.total);
};

// The scene pass sums its samples in float, so the mean never drifts with
// the count; the display pass tone maps the mean once per frame.
const fx = createPasses({
  target: stage,
  clock: "manual",
  resolution: parseResolution(resolutionSelect.value),
  accumulation: { samples: targetSamples() },
  passes: [
    { name: "scene", fragment: scene, accumulate: true, format: "rgba32f", filter: "nearest" },
    { name: "display", fragment: display, inputs: ["scene"], filter: "nearest" }
  ],
  uniforms: {
    fps: Number(fpsSelect.value),
    preview: modeSelect.value === "preview" ? 1 : 0
  },
  onSample: (progress) => reportSample(progress)
});

const fps = () => Number(fpsSelect.value);
const loopFrames = () => Math.round(LOOP_SECONDS * fps());

const showSamples = (drawn: number, total: number) => {
  if (playing) {
    samplesLabel.textContent = "Playing · 1 sample per frame";
  } else if (drawn < total) {
    samplesLabel.textContent = `Refining · ${drawn}/${total} samples`;
  } else {
    samplesLabel.textContent = `Done · ${total} samples`;
  }
};

// Draws `next` from its first sample; a paused frame then refines by itself.
const showFrame = (next: number) => {
  frame = next;
  frameInput.value = String(frame % loopFrames());
  frameOutput.value = String(frame % loopFrames());
  if (exporting) return;
  fx.setTime(frame / fps());
  fx.render();
};

// Playing draws one sample per frame.
const tick = () => {
  rafId = 0;
  if (!playing || exporting) return;
  showFrame((frame + 1) % loopFrames());
  rafId = requestAnimationFrame(tick);
};

const setPlaying = (next: boolean) => {
  playing = next;
  playButton.textContent = playing ? "Pause" : "Play";
  fx.setAccumulation({ samples: playing ? 1 : targetSamples() });
  if (playing && !rafId) rafId = requestAnimationFrame(tick);
  if (!playing) showFrame(frame);
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
  let current = startFrame;
  reportSample = ({ drawn, capturing }) => {
    if (capturing) onSample?.(current, drawn);
  };
  try {
    fx.setAccumulation({ samples });
    return await captureSequence(fx, {
      sink,
      fps: fps(),
      frameCount,
      startFrame,
      ...(signal ? { signal } : {}),
      ...(onProgress ? { onProgress } : {}),
      onBeforeFrame({ frame: next }) {
        current = next;
      }
    });
  } finally {
    exporting = false;
    reportSample = (progress) => {
      if (!progress.capturing) showSamples(progress.drawn, progress.total);
    };
    fx.setAccumulation({ samples: targetSamples() });
    showFrame(frame);
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
          drawn < samples
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
  if (playing) setPlaying(false);
  showFrame(Number(frameInput.value));
});

resolutionSelect.addEventListener("change", () => {
  fx.setResolution(parseResolution(resolutionSelect.value));
  showFrame(frame);
});

// Input changes restart the frame's samples and refine again by themselves.
modeSelect.addEventListener("change", () => {
  fx.setUniform("preview", modeSelect.value === "preview" ? 1 : 0);
});

fpsSelect.addEventListener("change", () => {
  fx.setUniform("fps", fps());
  frameInput.max = String(loopFrames() - 1);
  lastInput.value = String(loopFrames() - 1);
  showFrame(0);
  describe();
});

sppInput.addEventListener("change", () => {
  if (!playing) fx.setAccumulation({ samples: targetSamples() });
});

firstInput.addEventListener("change", describe);
lastInput.addEventListener("change", describe);

window.__poolrooms = {
  fx,
  get loopFrames() {
    return loopFrames();
  },
  showFrame(next: number) {
    if (playing) setPlaying(false);
    showFrame(next);
  },
  exportSequence,
  createZipSink
};

frameInput.value = String(frame % loopFrames());
frameOutput.value = String(frame % loopFrames());
describe();
setBusy(false);

void fx.ready.then(
  () => {
    status.textContent = "Ready";
    showFrame(frame);
  },
  (error: unknown) => {
    // Needs WebGL2 with EXT_color_buffer_float for the float buffer.
    status.textContent = "Unsupported";
    exportButton.disabled = true;
    console.error(error);
  }
);
