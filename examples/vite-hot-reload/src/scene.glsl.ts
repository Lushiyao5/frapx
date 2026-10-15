import { glsl } from "@frapx/fx-canvas";
import { sdf2d } from "@frapx/glsl-sdf";

// Edit and save: main.ts swaps this in with setFragment(). Break it on
// purpose (misspell a name) to see the error overlay.
export const fragment = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

${sdf2d}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float d = frapx_sdCircle(p, 0.28 + 0.04 * sin(u_time * 2.0));
  vec3 inside = vec3(0.98, 0.45, 0.25);
  vec3 outside = vec3(0.08, 0.12, 0.2) + 0.06 * cos(40.0 * d - u_time * 3.0);
  vec3 color = mix(inside, outside, smoothstep(0.0, 0.004, d));
  gl_FragColor = vec4(color, 1.0);
}
`;
