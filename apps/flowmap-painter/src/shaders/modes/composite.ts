import { glsl } from "@frapx/fx-canvas";
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
uniform float u_scale2;
uniform float u_speed2;
uniform float u_blend;

${flowLibGLSL}

void main() {
  // Layer 1: primary tiling and speed
  float t1 = u_time * u_flowSpeed;
  vec4 layer1 = sampleFlowAdvect(u_base, u_flow, v_uv, u_tiling, t1, u_flowStrength);

  // Layer 2: finer scale, independent speed, quarter-cycle phase offset for variety
  float t2 = u_time * u_speed2 + 0.25;
  vec4 layer2 = sampleFlowAdvect(u_base, u_flow, v_uv, u_tiling * u_scale2, t2, u_flowStrength * 0.5);

  // Multiply-style composite: deepens detail where both layers are bright
  vec4 multiplied = clamp(layer1 * layer2 * 2.0, 0.0, 1.0);
  fragColor = mix(layer1, multiplied, u_blend);
}
`;

export const compositeMode: PreviewMode = {
  id: "composite",
  label: "Composite",
  fragment,
  controls: [
    { key: "scale2", label: "Scale 2",  min: 1, max: 4, step: 0.25, default: 2.0 },
    { key: "speed2", label: "Speed 2",  min: 0, max: 3, step: 0.05, default: 1.0 },
    { key: "blend",  label: "Mix",      min: 0, max: 1, step: 0.05, default: 0.5 }
  ],
  defaults: { scale2: 2.0, speed2: 1.0, blend: 0.5 }
};
