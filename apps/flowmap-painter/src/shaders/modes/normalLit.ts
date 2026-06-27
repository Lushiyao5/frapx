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
uniform float u_lightAngle;
uniform float u_lightIntensity;
uniform float u_specular;
uniform float u_ambient;

${flowLibGLSL}

void main() {
  float dither = screenDither();
  float t = u_time * u_flowSpeed + dither * 0.1;
  vec4 baseColor = sampleFlowAdvect(u_base, u_flow, v_uv, u_tiling, t, u_flowStrength);

  // Reconstruct surface normal from flow direction
  vec2 flowRaw = decodeFlow(texture(u_flow, v_uv).rg);
  float w = flowEdgeWeight(length(flowRaw));
  vec2 n2 = flowRaw * w * 0.7;
  float nz = sqrt(max(0.001, 1.0 - dot(n2, n2)));
  vec3 N = normalize(vec3(n2.x, n2.y, nz));

  // Light direction from angle with a fixed upward elevation
  float rad = u_lightAngle * (3.14159265 / 180.0);
  vec3 L = normalize(vec3(cos(rad), sin(rad), 0.7));
  // Blinn-Phong half-vector (viewer is at +Z)
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 64.0) * u_specular;
  float lighting = u_ambient + diff * u_lightIntensity + spec;

  fragColor = vec4(baseColor.rgb * lighting, baseColor.a);
}
`;

export const normalLitMode: PreviewMode = {
  id: "normalLit",
  label: "Normal Lit",
  fragment,
  controls: [
    { key: "lightAngle",     label: "Light Angle",     min: 0,   max: 360, step: 5,    default: 45 },
    { key: "lightIntensity", label: "Light Intensity", min: 0,   max: 3,   step: 0.05, default: 1.2 },
    { key: "specular",       label: "Specular",        min: 0,   max: 1,   step: 0.05, default: 0.5 },
    { key: "ambient",        label: "Ambient",         min: 0,   max: 0.5, step: 0.01, default: 0.1 }
  ],
  defaults: { lightAngle: 45, lightIntensity: 1.2, specular: 0.5, ambient: 0.1 }
};
