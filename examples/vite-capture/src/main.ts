import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import type { Resolution, ShaderBackgroundInstance } from "@frapx/fx-canvas";
import {
  canPickDirectory,
  captureSequence,
  createZipSink,
  downloadBlob,
  pickDirectorySink
} from "@frapx/tool-capture";
import type { CaptureProgress, SequenceFormat } from "@frapx/tool-capture";
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

type Destination = "folder" | "zip";

declare global {
  interface Window {
    // Read by the @frapx/tool-capture E2E tests.
    __frapxCapture?: {
      readonly fx: ShaderBackgroundInstance;
      captureSequence: typeof captureSequence;
      createZipSink: typeof createZipSink;
    };
  }
}

const stage = document.querySelector<HTMLElement>("[data-stage]")!;
const resolutionSelect = document.querySelector<HTMLSelectElement>("[data-resolution]")!;
const formatSelect = document.querySelector<HTMLSelectElement>("[data-format]")!;
const destinationSelect = document.querySelector<HTMLSelectElement>("[data-destination]")!;
const fpsSelect = document.querySelector<HTMLSelectElement>("[data-fps]")!;
const durationInput = document.querySelector<HTMLInputElement>("[data-duration]")!;
const timeInput = document.querySelector<HTMLInputElement>("[data-time]")!;
const timeOutput = document.querySelector<HTMLOutputElement>("[data-time-output]")!;
const note = document.querySelector<HTMLElement>("[data-note]")!;
const exportButton = document.querySelector<HTMLButtonElement>("[data-export]")!;
const cancelButton = document.querySelector<HTMLButtonElement>("[data-cancel]")!;
const progress = document.querySelector<HTMLProgressElement>("[data-progress]")!;
const status = document.querySelector<HTMLElement>("[data-status]")!;

const parseResolution = (value: string): Resolution => {
  const [width, height] = value.split("x").map(Number);
  return [width!, height!];
};

// ?res=WxH and ?format=png16 preset the controls.
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
if (params.get("format") === "png16") formatSelect.value = "png16";

const folderOption = destinationSelect.querySelector<HTMLOptionElement>('option[value="folder"]')!;
if (!canPickDirectory()) {
  folderOption.disabled = true;
  destinationSelect.value = "zip";
}

const describe = () => {
  const format = formatSelect.value === "png16" ? "16-bit PNGs" : "PNGs";
  note.textContent =
    destinationSelect.value === "folder"
      ? `${format} are written to a folder you choose.`
      : `${format} are collected into one ZIP and downloaded. Long 4K exports need a lot of memory.`;
};

// The manual clock never animates on its own: every frame is an explicit
// setTime() + render() (or captureFrame()), so exports are deterministic.
// 16-bit export reads the float feedback buffer, so that mode allocates one
// and fails instead of silently falling back to 8 bits.
const createFx = (format: SequenceFormat) =>
  createShaderBackground({
    target: stage,
    fragment,
    clock: "manual",
    resolution: parseResolution(resolutionSelect.value),
    ...(format === "png16"
      ? { feedback: { format: "rgba16f" as const, formatFallback: false } }
      : {})
  });

let fx = createFx(formatSelect.value as SequenceFormat);

const preview = () => {
  const time = Number(timeInput.value);
  timeOutput.value = `${time.toFixed(2)}s`;
  fx.setTime(time);
  fx.render();
};

const switchFormat = async (format: SequenceFormat) => {
  fx.destroy();
  fx = createFx(format);
  try {
    await fx.ready;
  } catch {
    // Without WebGL2 + EXT_color_buffer_float there is no float buffer.
    formatSelect.value = "png";
    status.textContent = "No 16-bit";
    fx.destroy();
    fx = createFx("png");
    await fx.ready;
  }
  describe();
  preview();
};

let abort: AbortController | null = null;

const setBusy = (busy: boolean) => {
  exportButton.disabled = busy;
  cancelButton.disabled = !busy;
  for (const control of [resolutionSelect, formatSelect, destinationSelect, fpsSelect]) {
    control.disabled = busy;
  }
  durationInput.disabled = busy;
  timeInput.disabled = busy;
};

exportButton.addEventListener("click", async () => {
  const fps = Number(fpsSelect.value);
  const frameCount = Math.max(1, Math.round(Number(durationInput.value) * fps));
  const format = formatSelect.value as SequenceFormat;
  const destination = destinationSelect.value as Destination;

  let folder: Awaited<ReturnType<typeof pickDirectorySink>> | null = null;
  if (destination === "folder") {
    try {
      folder = await pickDirectorySink();
    } catch {
      // The user dismissed the folder picker.
      return;
    }
  }

  abort = new AbortController();
  setBusy(true);
  progress.value = 0;
  const started = performance.now();
  const options = {
    fps,
    frameCount,
    format,
    signal: abort.signal,
    onProgress({ completed, total }: CaptureProgress) {
      progress.value = completed / total;
      status.textContent = `${completed}/${total}`;
    }
  };

  try {
    if (folder) {
      await captureSequence(fx, { ...options, sink: folder });
    } else {
      const zip = await captureSequence(fx, { ...options, sink: createZipSink() });
      const [width, height] = parseResolution(resolutionSelect.value);
      downloadBlob(zip, `frapx-${width}x${height}-${fps}fps.zip`);
    }
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    status.textContent = `Done ${seconds}s`;
  } catch (error) {
    if (abort.signal.aborted) {
      status.textContent = `Stopped ${Math.round(progress.value * frameCount)}/${frameCount}`;
    } else {
      status.textContent = "Failed";
      console.error(error);
    }
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

formatSelect.addEventListener("change", () => {
  void switchFormat(formatSelect.value as SequenceFormat);
});

destinationSelect.addEventListener("change", describe);

durationInput.addEventListener("change", () => {
  timeInput.max = String(Math.max(0.1, Number(durationInput.value)));
  preview();
});

timeInput.addEventListener("input", preview);

window.__frapxCapture = {
  get fx() {
    return fx;
  },
  captureSequence,
  createZipSink
};

describe();
void fx.ready.then(preview, () => {
  // Opened with ?format=png16 where float buffers are unavailable.
  status.textContent = "No 16-bit";
  formatSelect.value = "png";
  void switchFormat("png");
});
