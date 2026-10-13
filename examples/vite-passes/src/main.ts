import { createShaderBackground } from "@frapx/fx-canvas";
import { createPasses } from "@frapx/fx-passes";
import type { PassesInstance } from "@frapx/fx-passes";
import "./styles.css";

declare global {
  interface Window {
    // Read by the fx-passes e2e specs, which build their own instances.
    __frapx?: {
      createPasses: typeof createPasses;
      createShaderBackground: typeof createShaderBackground;
    };
    __passes?: PassesInstance;
  }
}

window.__frapx = { createPasses, createShaderBackground };

// A fan spinning fast enough to strobe at one sample per frame, with thin
// rings that alias without jitter. Values above 1 feed the glow pass.
const scene = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform vec2 u_jitter;
uniform float u_time;
out vec4 fragColor;

void main() {
  vec2 frag = gl_FragCoord.xy + u_jitter;
  vec2 p = (frag - 0.5 * u_resolution) / u_resolution.y;
  float r = length(p);
  float a = atan(p.y, p.x);

  float blades = step(0.5, fract((a + u_time * 7.0) * 6.0 / 6.2831853));
  float disc = step(0.12, r) * step(r, 0.42);
  float rings = step(0.9, fract(r * 48.0)) * step(r, 0.48);
  vec2 orbit = 0.33 * vec2(cos(u_time * 3.0), sin(u_time * 3.0));

  vec3 color = vec3(0.015, 0.02, 0.035);
  color = mix(color, vec3(2.4, 1.1, 0.3), blades * disc);
  color += vec3(0.15, 0.45, 0.9) * rings * 0.7;
  color += vec3(6.0, 4.5, 3.0) * step(length(p - orbit), 0.025);
  fragColor = vec4(color, 1.0);
}
`;

// Quarter-resolution blur of everything brighter than 1.
const glow = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int x = -4; x <= 4; x++) {
    for (int y = -4; y <= 4; y++) {
      float k = exp(-float(x * x + y * y) / 8.0);
      vec2 offset = vec2(x, y) * 1.5 / u_resolution;
      sum += max(texture(u_scene, uv + offset).rgb - 1.0, 0.0) * k;
      weight += k;
    }
  }
  fragColor = vec4(sum / weight, 1.0);
}
`;

const composite = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_glow;
uniform vec2 u_resolution;
out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 color = texture(u_scene, uv).rgb + texture(u_glow, uv).rgb * 3.0;
  color = color / (1.0 + color);
  fragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`;

const params = new URLSearchParams(window.location.search);

if (!params.has("test")) {
  const stage = document.querySelector<HTMLElement>("[data-stage]")!;
  const samplesInput = document.querySelector<HTMLInputElement>("[data-samples]")!;
  const samplesOutput = document.querySelector<HTMLOutputElement>("[data-samples-output]")!;
  const shutterInput = document.querySelector<HTMLInputElement>("[data-shutter]")!;
  const shutterOutput = document.querySelector<HTMLOutputElement>("[data-shutter-output]")!;
  const progress = document.querySelector<HTMLElement>("[data-progress]")!;
  const toggle = document.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const status = document.querySelector<HTMLElement>("[data-status]")!;

  const samples = () => 2 ** Number(samplesInput.value);
  const shutter = () => Number(shutterInput.value);

  const showProgress = (drawn: number, total: number) => {
    progress.textContent =
      fx.status === "running"
        ? "Playing · 1 sample per frame"
        : `${drawn < total ? "Refining" : "Done"} · ${drawn}/${total} samples`;
  };

  const fx = createPasses({
    target: stage,
    accumulation: { samples: samples(), shutter: shutter(), fps: 60 },
    passes: [
      { name: "scene", fragment: scene, accumulate: true },
      { name: "glow", fragment: glow, inputs: ["scene"], scale: 0.25 },
      { name: "final", fragment: composite, inputs: ["scene", "glow"], format: "rgba8" }
    ],
    onSample: ({ drawn, total }) => showProgress(drawn, total)
  });
  window.__passes = fx;

  const sync = () => {
    samplesOutput.value = String(samples());
    shutterOutput.value = shutter().toFixed(2);
    fx.setAccumulation({ samples: samples(), shutter: shutter() });
  };
  samplesInput.addEventListener("input", sync);
  shutterInput.addEventListener("input", sync);
  sync();

  toggle.addEventListener("click", () => {
    const running = fx.status === "running";
    if (running) fx.stop();
    else fx.start();
    toggle.textContent = running ? "Play" : "Pause";
    status.textContent = running ? "Paused" : "Running";
    status.classList.toggle("is-paused", running);
    showProgress(fx.samplesDrawn, fx.accumulation.samples);
  });
}
