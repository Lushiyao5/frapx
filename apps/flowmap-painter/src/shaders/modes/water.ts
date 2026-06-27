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
uniform float u_noiseAmount;
uniform float u_noiseFreq;
uniform float u_wobble;

${flowLibGLSL}

void main() {
  const float PI2 = 6.28318530;

  // Time-varying sine/cosine noise perturbation
  float nx = sin(v_uv.x * u_noiseFreq * PI2 + u_time * 0.7)
           * cos(v_uv.y * u_noiseFreq * PI2 * 0.8 + u_time * 0.5);
  float ny = cos(v_uv.x * u_noiseFreq * PI2 * 0.9 + u_time * 0.6)
           * sin(v_uv.y * u_noiseFreq * PI2 + u_time * 0.8);
  vec2 noiseVec = vec2(nx, ny) * u_noiseAmount * 0.3;

  // Perturb sample UV for surface shimmer
  vec2 sampleUV = v_uv + noiseVec * u_wobble * 0.05;

  // Add noise contribution to decoded flow direction
  vec2 f = decodeFlow(texture(u_flow, sampleUV).rg) + noiseVec;
  float w = flowEdgeWeight(length(f));
  vec2 fd = f * w;

  float dither = screenDither();
  float t = u_time * u_flowSpeed + dither * 0.1;
  float p0 = fract(t);
  float p1 = fract(t + 0.5);

  vec2 buv = sampleUV * u_tiling;
  vec4 c0 = texture(u_base, buv - fd * p0 * u_flowStrength);
  vec4 c1 = texture(u_base, buv - fd * p1 * u_flowStrength);

  float blend = smoothstep(0.3, 0.7, abs(p0 - 0.5) * 2.0);
  fragColor = mix(c0, c1, blend);
}
`;

export const waterMode: PreviewMode = {
  id: "water",
  label: "Water",
  fragment,
  controls: [
    { key: "noiseAmount", label: "Noise Amount", min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: "noiseFreq",   label: "Noise Freq",   min: 1, max: 8, step: 0.5,  default: 3.0 },
    { key: "wobble",      label: "Wobble",       min: 0, max: 1, step: 0.05, default: 0.5 }
  ],
  defaults: { noiseAmount: 0.4, noiseFreq: 3.0, wobble: 0.5 }
};
