import { createPasses, glsl, keyframes } from "@frapx/fx-passes";
import type { PassesInstance } from "@frapx/fx-passes";
import { raymarch, raymarchCamera, raymarchCameraUniforms } from "@frapx/glsl-raymarch";
import { sdf3d, sdfDomain } from "@frapx/glsl-sdf";
import { registerRenderTarget } from "@frapx/tool-capture";
import "./styles.css";

declare global {
  interface Window {
    // Read by verification scripts.
    __frapxTimeline?: { readonly fx: PassesInstance };
  }
}

const LOOP_SECONDS = 8;
const FPS = 30;

// A field of pillars the camera sweeps past. Nothing in the shader moves with
// u_time: all motion comes from the bound camera keyframes.
const scene = glsl`#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_jitter;
out vec4 fragColor;

${sdf3d}
${sdfDomain}
${raymarchCamera}
${raymarchCameraUniforms}
${raymarch}

float pillars(vec3 p) {
  vec3 q = p;
  q.xz = frapx_opRepeat(q.xz, vec2(2.0));
  return frapx_sdRoundBox(q - vec3(0.0, 0.2, 0.0), vec3(0.18, 1.2, 0.18), 0.05);
}

float frapx_map(vec3 p) {
  return min(pillars(p), p.y + 1.0);
}

void main() {
  vec3 rd = frapx_cameraRay(gl_FragCoord.xy + u_jitter, u_resolution);
  vec3 sky = mix(vec3(0.02, 0.03, 0.06), vec3(0.25, 0.3, 0.42), clamp(rd.y * 0.7 + 0.5, 0.0, 1.0));
  vec3 color = sky;
  float t = frapx_raymarch(u_camPos, rd, 0.0, 60.0);
  if (t > 0.0) {
    vec3 p = u_camPos + rd * t;
    vec3 n = frapx_normal(p, 0.0005 * t);
    vec3 light = normalize(vec3(-0.4, 0.8, 0.3));
    float diffuse = max(dot(n, light), 0.0) * frapx_softShadow(p + n * 0.01, light, 0.01, 10.0, 10.0);
    float floorMask = step(p.y, -0.99);
    vec3 albedo = mix(vec3(0.95, 0.5, 0.25), vec3(0.3), floorMask);
    color = albedo * (0.15 + 1.0 * diffuse);
    color = mix(color, sky, 1.0 - exp(-0.002 * t * t));
  }
  fragColor = vec4(color, 1.0);
}
`;

const display = glsl`#version 300 es
precision highp float;

uniform sampler2D u_scene;
out vec4 fragColor;

void main() {
  vec3 color = texelFetch(u_scene, ivec2(gl_FragCoord.xy), 0).rgb;
  fragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}
`;

// Positions loop: the last key repeats the first.
const camera = keyframes(
  {
    camPos: [
      [0, [-6, 0.4, 6]],
      [2, [0, 0.2, 1]],
      [4, [6, 1.2, -2]],
      [6, [1, 3.5, -7]],
      [8, [-6, 0.4, 6]]
    ],
    camTarget: [
      [0, [0, 0, 0]],
      [2, [4, 0.2, -3]],
      [4, [0, 0.5, -6]],
      [6, [-2, 0, 0]],
      [8, [0, 0, 0]]
    ],
    // Field of view eases; positions keep a constant speed per segment.
    fov: {
      keys: [
        [0, 0.9],
        [3, 1.2],
        [8, 0.9]
      ],
      ease: "smooth"
    }
  }
);

const playButton = document.querySelector<HTMLButtonElement>("[data-play]")!;
const timeInput = document.querySelector<HTMLInputElement>("[data-time]")!;
const timeOutput = document.querySelector<HTMLOutputElement>("[data-time-output]")!;
const samplesInput = document.querySelector<HTMLInputElement>("[data-samples]")!;
const samplesOutput = document.querySelector<HTMLOutputElement>("[data-samples-output]")!;
const shutterInput = document.querySelector<HTMLInputElement>("[data-shutter]")!;
const shutterOutput = document.querySelector<HTMLOutputElement>("[data-shutter-output]")!;

const fx = createPasses({
  target: "[data-stage]",
  clock: "manual",
  maxDpr: 1.5,
  accumulation: {
    samples: Number(samplesInput.value),
    shutter: Number(shutterInput.value),
    fps: FPS
  },
  passes: [
    { name: "scene", fragment: scene, accumulate: true, format: "rgba32f" },
    { name: "display", fragment: display, inputs: ["scene"] }
  ]
});
fx.bindUniforms(camera);

let time = Number(timeInput.value);
let playing = false;

const show = (next: number) => {
  time = ((next % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  timeInput.value = String(time);
  timeOutput.value = `${time.toFixed(2)} s`;
  fx.setTime(time);
  fx.render();
};

// Playing draws one sample a frame; a paused frame refines to all samples.
let last = 0;
const tick = (now: number) => {
  if (!playing) return;
  if (last) show(time + (now - last) / 1000);
  last = now;
  requestAnimationFrame(tick);
};

playButton.addEventListener("click", () => {
  playing = !playing;
  playButton.textContent = playing ? "Pause" : "Play";
  fx.setAccumulation({ samples: playing ? 1 : Number(samplesInput.value) });
  last = 0;
  if (playing) requestAnimationFrame(tick);
  else show(time);
});

timeInput.addEventListener("input", () => show(Number(timeInput.value)));

samplesInput.addEventListener("input", () => {
  samplesOutput.value = samplesInput.value;
  if (!playing) fx.setAccumulation({ samples: Number(samplesInput.value) });
});

shutterInput.addEventListener("input", () => {
  shutterOutput.value = shutterInput.value;
  fx.setAccumulation({ shutter: Number(shutterInput.value) });
});

// `frapx-render dist --set spp=64 --set shutter=0.5` renders the loop.
registerRenderTarget(fx, {
  fps: FPS,
  duration: LOOP_SECONDS,
  prepare({ params, fps }) {
    fx.setAccumulation({
      samples: Number(params.spp ?? samplesInput.value),
      shutter: Number(params.shutter ?? shutterInput.value),
      fps
    });
  }
});

window.__frapxTimeline = { fx };

void fx.ready.then(() => show(time));
