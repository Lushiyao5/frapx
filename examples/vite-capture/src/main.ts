import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import type { Resolution, ShaderBackgroundInstance } from "@frapx/fx-canvas";
import "./styles.css";

// A small raymarched SDF scene: heavy enough to be worth rendering offline,
// cheap enough to preview interactively.
const fragment = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

mat2 rotate(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float sdRoundBox(vec3 p, vec3 size, float radius) {
  vec3 q = abs(p) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - radius;
}

float sdTorus(vec3 p, vec2 size) {
  vec2 q = vec2(length(p.xz) - size.x, p.y);
  return length(q) - size.y;
}

float smoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
  vec3 box = p - vec3(0.0, 0.15, 0.0);
  box.xz *= rotate(u_time * 0.5);
  box.xy *= rotate(u_time * 0.3);

  vec3 ring = p - vec3(0.0, 0.15, 0.0);
  ring.yz *= rotate(1.2 + u_time * 0.7);

  float shape = smoothMin(
    sdRoundBox(box, vec3(0.5), 0.12),
    sdTorus(ring, vec2(1.05, 0.12)),
    0.25
  );
  return min(shape, p.y + 1.0);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

float softShadow(vec3 origin, vec3 direction) {
  float result = 1.0;
  float t = 0.02;
  for (int i = 0; i < 48; i++) {
    float h = map(origin + direction * t);
    result = min(result, 8.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (result < 0.001 || t > 8.0) break;
  }
  return clamp(result, 0.0, 1.0);
}

float ambientOcclusion(vec3 p, vec3 n) {
  float occlusion = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float d = 0.06 * float(i);
    occlusion += weight * (d - map(p + n * d));
    weight *= 0.6;
  }
  return clamp(1.0 - 2.0 * occlusion, 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  float orbit = 0.6 + u_time * 0.15;
  vec3 origin = vec3(5.2 * sin(orbit), 1.9, 5.2 * cos(orbit));
  vec3 forward = normalize(-origin);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 direction = normalize(forward * 2.0 + uv.x * right + uv.y * up);

  float t = 0.0;
  float hit = -1.0;
  for (int i = 0; i < 128; i++) {
    float d = map(origin + direction * t);
    if (d < 0.0005 * max(t, 1.0)) {
      hit = t;
      break;
    }
    t += d;
    if (t > 20.0) break;
  }

  vec3 sky = mix(
    vec3(0.05, 0.06, 0.09),
    vec3(0.18, 0.22, 0.3),
    clamp(direction.y * 0.5 + 0.5, 0.0, 1.0)
  );
  vec3 color = sky;

  if (hit > 0.0) {
    vec3 p = origin + direction * hit;
    vec3 n = calcNormal(p);
    vec3 light = normalize(vec3(0.6, 0.9, 0.4));
    float diffuse = clamp(dot(n, light), 0.0, 1.0) * softShadow(p + n * 0.002, light);
    float occlusion = ambientOcclusion(p, n);
    float checker = mod(floor(p.x * 2.0) + floor(p.z * 2.0), 2.0);
    vec3 albedo = p.y < -0.99
      ? vec3(0.3) * (0.8 + 0.2 * checker)
      : vec3(0.95, 0.45, 0.25);
    float specular = pow(clamp(dot(reflect(-light, n), -direction), 0.0, 1.0), 32.0);

    color = albedo * (0.15 * occlusion + 1.1 * diffuse)
      + vec3(0.6, 0.7, 1.0) * 0.12 * occlusion * (0.5 + 0.5 * n.y)
      + specular * diffuse * 0.6;
    color = mix(color, sky, 1.0 - exp(-0.004 * hit * hit));
  }

  gl_FragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}
`;

type FrameSink = {
  label: string;
  write(name: string, png: Blob): Promise<void>;
};

type ExportOptions = {
  fps: number;
  frameCount: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
};

// Not in TypeScript's DOM lib yet (Chromium-only File System Access API).
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

declare global {
  interface Window {
    __frapxCapture?: {
      fx: ShaderBackgroundInstance;
      exportSequence: (sink: FrameSink, options: ExportOptions) => Promise<number>;
    };
  }
}

const stage = document.querySelector<HTMLElement>("[data-stage]")!;
const resolutionSelect = document.querySelector<HTMLSelectElement>("[data-resolution]")!;
const fpsSelect = document.querySelector<HTMLSelectElement>("[data-fps]")!;
const durationInput = document.querySelector<HTMLInputElement>("[data-duration]")!;
const timeInput = document.querySelector<HTMLInputElement>("[data-time]")!;
const timeOutput = document.querySelector<HTMLOutputElement>("[data-time-output]")!;
const destination = document.querySelector<HTMLElement>("[data-destination]")!;
const exportButton = document.querySelector<HTMLButtonElement>("[data-export]")!;
const cancelButton = document.querySelector<HTMLButtonElement>("[data-cancel]")!;
const progress = document.querySelector<HTMLProgressElement>("[data-progress]")!;
const status = document.querySelector<HTMLElement>("[data-status]")!;

const parseResolution = (value: string): Resolution => {
  const [width, height] = value.split("x").map(Number);
  return [width!, height!];
};

// The manual clock never animates on its own: every frame is an explicit
// setTime() + render() (or captureFrame()), so exports are deterministic.
const fx = createShaderBackground({
  target: stage,
  fragment,
  clock: "manual",
  resolution: parseResolution(resolutionSelect.value)
});

const preview = () => {
  const time = Number(timeInput.value);
  timeOutput.value = `${time.toFixed(2)}s`;
  fx.setTime(time);
  fx.render();
};

const frameName = (index: number) => `frame_${String(index).padStart(5, "0")}.png`;

const exportSequence = async (
  sink: FrameSink,
  { fps, frameCount, signal, onProgress }: ExportOptions
): Promise<number> => {
  for (let index = 0; index < frameCount; index++) {
    if (signal?.aborted) return index;
    fx.setTime(index / fps);
    // Draws and reads back in one task, so the PNG is never a stale frame.
    const png = await fx.captureFrame({ format: "png" });
    await sink.write(frameName(index), png);
    onProgress?.(index + 1, frameCount);
  }
  return frameCount;
};

const pickDirectorySink = async (): Promise<FrameSink | null> => {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  const directory = await picker({ mode: "readwrite" });
  return {
    label: directory.name,
    async write(name, png) {
      const file = await directory.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(png);
      await writable.close();
    }
  };
};

const downloadSink: FrameSink = {
  label: "Downloads",
  async write(name, png) {
    const url = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    // Let the download start before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
};

const canPickDirectory = Boolean((window as DirectoryPickerWindow).showDirectoryPicker);
destination.textContent = canPickDirectory
  ? "Frames are written to a folder you choose."
  : "Frames are saved as individual downloads.";

let abort: AbortController | null = null;

const setBusy = (busy: boolean) => {
  exportButton.disabled = busy;
  cancelButton.disabled = !busy;
  resolutionSelect.disabled = busy;
  fpsSelect.disabled = busy;
  durationInput.disabled = busy;
  timeInput.disabled = busy;
};

exportButton.addEventListener("click", async () => {
  const fps = Number(fpsSelect.value);
  const frameCount = Math.max(1, Math.round(Number(durationInput.value) * fps));

  let sink: FrameSink | null;
  try {
    sink = canPickDirectory ? await pickDirectorySink() : downloadSink;
  } catch {
    // The user dismissed the folder picker.
    return;
  }
  if (!sink) return;

  abort = new AbortController();
  setBusy(true);
  progress.value = 0;
  const started = performance.now();

  try {
    const written = await exportSequence(sink, {
      fps,
      frameCount,
      signal: abort.signal,
      onProgress(done, total) {
        progress.value = done / total;
        status.textContent = `${done}/${total}`;
      }
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    status.textContent =
      written === frameCount ? `Done ${seconds}s` : `Stopped ${written}/${frameCount}`;
  } catch (error) {
    status.textContent = "Failed";
    console.error(error);
  } finally {
    abort = null;
    setBusy(false);
    preview();
  }
});

cancelButton.addEventListener("click", () => abort?.abort());

resolutionSelect.addEventListener("change", () => {
  fx.setResolution(parseResolution(resolutionSelect.value));
  preview();
});

durationInput.addEventListener("change", () => {
  timeInput.max = String(Math.max(0.1, Number(durationInput.value)));
  preview();
});

timeInput.addEventListener("input", preview);

window.__frapxCapture = { fx, exportSequence };

void fx.ready.then(preview);
