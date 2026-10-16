import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import { createParticles, keyframes, presets } from "@frapx/fx-particles";
import type { ParticlePresetName, ParticlesInstance } from "@frapx/fx-particles";
import { captureSequence, createZipSink, registerRenderTarget } from "@frapx/tool-capture";
import "./styles.css";

declare global {
  interface Window {
    // Read by the fx-particles e2e specs, which build their own instances.
    __frapx?: {
      createParticles: typeof createParticles;
      keyframes: typeof keyframes;
      captureSequence: typeof captureSequence;
      createZipSink: typeof createZipSink;
    };
    __particles?: ParticlesInstance;
  }
}

window.__frapx = { createParticles, keyframes, captureSequence, createZipSink };

const params = new URLSearchParams(window.location.search);
const PRESETS = Object.keys(presets) as ParticlePresetName[];
const FPS = 30;
const DURATION = 10;

const isPreset = (value: string | null | undefined): value is ParticlePresetName =>
  (PRESETS as string[]).includes(value ?? "");

// `?res=1920x1080` renders at a fixed size, as frapx-render does.
const parseResolution = (value: string | null): readonly [number, number] | undefined => {
  const match = value?.match(/^(\d+)x(\d+)$/);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? [width, height] : undefined;
};

if (!params.has("test")) {
  const stage = document.querySelector<HTMLElement>("[data-stage]")!;
  const presetsField = document.querySelector<HTMLFieldSetElement>("[data-presets]")!;
  const pointerInput = document.querySelector<HTMLInputElement>("[data-pointer]")!;
  const info = document.querySelector<HTMLElement>("[data-info]")!;
  const toggle = document.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const status = document.querySelector<HTMLElement>("[data-status]")!;
  const resolution = parseResolution(params.get("res"));

  // A night-sky gradient behind the particle layer, in its own canvas.
  createShaderBackground({
    target: stage,
    fragment: glsl`
      precision highp float;
      uniform vec2 u_resolution;
      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        vec3 top = vec3(0.04, 0.05, 0.11);
        vec3 bottom = vec3(0.13, 0.09, 0.2);
        vec3 color = mix(bottom, top, smoothstep(0.0, 1.0, uv.y));
        color += vec3(0.08, 0.05, 0.12) * exp(-length(uv - vec2(0.5, 0.0)) * 3.0);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    renderMode: "demand"
  });

  let preset: ParticlePresetName = isPreset(params.get("preset")) ? (params.get("preset") as ParticlePresetName) : "snow";
  let particles: ParticlesInstance | null = null;

  const create = () => {
    particles?.destroy();
    particles = createParticles({
      target: stage,
      layer: "overlay",
      preset,
      ...(pointerInput.checked && { forces: { pointer: { strength: 0.6, radius: 0.18 } } }),
      ...(resolution && { resolution }),
      // 16-bit capture for `frapx-render --format png16`.
      format: "rgba16f",
      debug: true
    });
    window.__particles = particles;
    void particles.ready.then(() => {
      info.textContent = `${particles!.maxParticles.toLocaleString()} particle pool · ${particles!.simulationRate} steps/s`;
    });
    toggle.textContent = "Pause";
    status.textContent = "Running";
    status.classList.remove("is-paused");
  };

  for (const name of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.textContent = name;
    button.dataset.preset = name;
    button.setAttribute("aria-pressed", String(name === preset));
    button.addEventListener("click", () => {
      preset = name;
      for (const other of presetsField.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
        other.setAttribute("aria-pressed", String(other.dataset.preset === name));
      }
      create();
    });
    presetsField.append(button);
  }

  pointerInput.addEventListener("change", create);

  toggle.addEventListener("click", () => {
    if (!particles) return;
    const running = particles.status === "running";
    if (running) particles.stop();
    else particles.start();
    toggle.textContent = running ? "Play" : "Pause";
    status.textContent = running ? "Paused" : "Running";
    status.classList.toggle("is-paused", running);
  });

  create();

  // `frapx-render <url> --set preset=confetti --format png16` renders the
  // particle layer alone, with alpha, for compositing over other footage.
  registerRenderTarget(() => particles!, {
    fps: FPS,
    duration: DURATION,
    async prepare({ params: renderParams }) {
      if (isPreset(renderParams.preset) && renderParams.preset !== preset) {
        preset = renderParams.preset;
        create();
      }
    }
  });
}
