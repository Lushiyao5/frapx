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

${flowLibGLSL}

void main() {
  float dither = screenDither();
  float t = u_time * u_flowSpeed + dither * 0.1;
  fragColor = sampleFlowAdvect(u_base, u_flow, v_uv, u_tiling, t, u_flowStrength);
}
`;

export const advectMode: PreviewMode = {
  id: "advect",
  label: "Advect",
  fragment,
  controls: [],
  defaults: {}
};
