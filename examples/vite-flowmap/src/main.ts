import { createShaderBackground, glsl } from "@frapx/shader";
import type { ShaderBackgroundInstance } from "@frapx/shader";
import { flowDecode, flowDistort } from "@frapx/shader-flowmap";
import "./styles.css";

declare global {
  interface Window {
    __frapxFlowmap?: ShaderBackgroundInstance;
    __frapxFlowmapSample?: { frames: number; pixel: number[] | null };
  }
}

window.__frapxFlowmapSample = { frames: 0, pixel: null };

// ---------------------------------------------------------------------------
// Procedurally generate a vortex flowmap and a base striped texture on CPU.
// Using canvas avoids committing binary assets to the repo.
// ---------------------------------------------------------------------------

/** Create an RG-encoded vortex flowmap in a canvas element.
 *  Encoding: R = 0.5 + dx*0.5, G = 0.5 - dy*0.5 (frapx convention). */
function makeVortexFlowCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * 2 - 1; // [-1, 1]
      const ny = (y / size) * 2 - 1;
      const len = Math.sqrt(nx * nx + ny * ny);

      // Clockwise tangent scaled by vortex strength, falloff near center/edge
      const strength = Math.exp(-len * 2.5) * (1 - Math.exp(-(len * 6)));
      const dx = ny / Math.max(len, 0.001) * strength;
      const dy = -nx / Math.max(len, 0.001) * strength;

      const idx = (y * size + x) * 4;
      // R = 0.5 + dx*0.5,  G = 0.5 - dy*0.5  (canvas Y negated → Y-up)
      img.data[idx]     = Math.round((0.5 + dx * 0.5) * 255);
      img.data[idx + 1] = Math.round((0.5 - dy * 0.5) * 255);
      img.data[idx + 2] = 0;
      img.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Create a base texture — horizontal stripes with slight color variation. */
function makeBaseCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (y / size + x / size * 0.2 + Math.sin(y / size * Math.PI * 8) * 0.05);
      const r = Math.round(10 + 60 * (0.5 + Math.sin(t * Math.PI * 2) * 0.5));
      const g = Math.round(30 + 100 * (0.5 + Math.sin(t * Math.PI * 2 + 1.0) * 0.5));
      const b = Math.round(80 + 120 * (0.5 + Math.sin(t * Math.PI * 2 + 2.0) * 0.5));
      const idx = (y * size + x) * 4;
      img.data[idx]     = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Flowmap fragment shader using @frapx/shader-flowmap snippets
// ---------------------------------------------------------------------------

const fragment = glsl`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_flow;
uniform sampler2D u_base;
uniform float u_time;
uniform float u_flowSpeed;
uniform float u_flowStrength;
uniform float u_tiling;

${flowDecode}
${flowDistort}

void main() {
  vec2 flow = frapx_flowDecode(u_flow, v_uv);
  vec2 uv   = v_uv * u_tiling;
  fragColor = frapx_flowDistort(u_base, flow, uv, u_time, u_flowSpeed, u_flowStrength);
}
`;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const flowCanvas = makeVortexFlowCanvas(512);
const baseCanvas = makeBaseCanvas(512);

const fx = createShaderBackground({
  target: "[data-hero]",
  fragment,
  textures: {
    // Canvas sources are uploaded with flipY:true by default — matches frapx encoding
    flow: { source: flowCanvas, filter: "nearest", wrap: "clamp" },
    base: { source: baseCanvas, filter: "linear", wrap: "repeat" }
  },
  uniforms: {
    flowSpeed: 0.3,
    flowStrength: 0.18,
    tiling: 2.5
  },
  debug: true,
  onAfterRender({ gl, width, height }) {
    const pixel = new Uint8Array(4);
    gl.readPixels(
      Math.floor(width / 2),
      Math.floor(height / 2),
      1, 1,
      gl.RGBA, gl.UNSIGNED_BYTE,
      pixel
    );
    window.__frapxFlowmapSample = {
      frames: (window.__frapxFlowmapSample?.frames ?? 0) + 1,
      pixel: Array.from(pixel)
    };
  }
});

window.__frapxFlowmap = fx;
