import { glsl } from "@frapx/shader";
import { flowLibGLSL } from "../lib";
import type { PreviewMode } from "./types";

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
uniform float u_density;
uniform float u_trailLength;
uniform float u_particleSpeed;

${flowLibGLSL}

void main() {
  float dither = screenDither();
  float t = u_time * u_flowSpeed + dither * 0.1;
  // Subtle advected background at reduced strength
  vec4 bg = sampleFlowAdvect(u_base, u_flow, v_uv, u_tiling, t, u_flowStrength * 0.35);

  float cellSize = 1.0 / u_density;
  float brightness = 0.0;

  // Check 3×3 neighborhood to avoid clipping at cell boundaries
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      vec2 cellId = floor(v_uv * u_density) + vec2(float(dx), float(dy));

      // Per-cell random position and time-phase offset
      float h1 = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
      float h2 = fract(sin(dot(cellId, vec2(269.5, 183.3))) * 85734.2);

      vec2 origin = clamp((cellId + vec2(h1, h2)) * cellSize, 0.0, 1.0);

      // Animate particle along the local flow direction
      float phase = fract(u_time * u_particleSpeed + h1);
      vec2 flowDir = decodeFlow(texture(u_flow, origin).rg);
      float w = flowEdgeWeight(length(flowDir));
      vec2 particlePos = origin + flowDir * w * phase * u_trailLength * 0.3;

      // Smooth radial falloff
      float dist = length(v_uv - particlePos);
      float r = cellSize * 0.15;
      brightness += 1.0 - smoothstep(0.0, r, dist);
    }
  }

  brightness = clamp(brightness, 0.0, 1.0);
  fragColor = mix(bg, vec4(1.0), brightness * 0.85);
}
`;

export const particlesMode: PreviewMode = {
  id: "particles",
  label: "Particles",
  fragment,
  controls: [
    { key: "density",       label: "Density",        min: 4,   max: 20, step: 1,   default: 10 },
    { key: "trailLength",   label: "Trail Length",   min: 0,   max: 1,  step: 0.05, default: 0.6 },
    { key: "particleSpeed", label: "Particle Speed", min: 0.1, max: 3,  step: 0.1,  default: 1.0 }
  ],
  defaults: { density: 10, trailLength: 0.6, particleSpeed: 1.0 }
};
