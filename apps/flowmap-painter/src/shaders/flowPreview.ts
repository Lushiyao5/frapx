import { glsl } from "@frapx/shader";
import { flowDecode, flowDistort } from "@frapx/shader-flowmap";

// Two-phase flow distortion preview shader.
// GLSL functions and encoding convention are provided by @frapx/shader-flowmap.
export const flowPreviewFragment = glsl`#version 300 es
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
