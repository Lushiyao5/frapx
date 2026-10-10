import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import { sdf2d, sdf3d, sdfDomain, sdfOps } from "@frapx/glsl-sdf";
import "./styles.css";

// 2D: shapes smoothly merged into one field, drawn with distance bands.
const fragment2d = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointerUv;
uniform float u_pointerActive;
uniform float u_time;
uniform float u_blend;

${sdf2d}
${sdfOps}
${sdfDomain}

const float SCALE = 2.0;

vec2 toScene(vec2 uv) {
  return (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * SCALE;
}

float scene(vec2 p) {
  vec2 boxP = frapx_rotate(p - vec2(-0.42, -0.05), u_time * 0.4);
  float box = frapx_sdRoundBox(boxP, vec2(0.24), vec4(0.12, 0.02, 0.02, 0.12));
  float hexagon = frapx_sdHexagon(frapx_rotate(p - vec2(0.42, 0.0), -u_time * 0.3), 0.2);
  float triangle = frapx_sdEquilateralTriangle(
    p - vec2(0.0, 0.3 + 0.08 * sin(u_time)),
    0.18
  );
  float arc = frapx_sdArc(p - vec2(0.0, -0.32), 1.2 + 0.4 * sin(u_time * 0.7), 0.2, 0.025);

  float d = frapx_opSmoothUnion(box, hexagon, u_blend);
  d = frapx_opSmoothUnion(d, triangle, u_blend);
  d = frapx_opUnion(d, arc);

  float cursor = frapx_sdCircle(p - toScene(u_pointerUv), 0.1);
  return mix(d, frapx_opSmoothUnion(d, cursor, u_blend), u_pointerActive);
}

void main() {
  vec2 p = toScene(gl_FragCoord.xy / u_resolution);
  float d = scene(p);

  vec3 color = d > 0.0 ? vec3(0.95, 0.62, 0.32) : vec3(0.55, 0.82, 1.0);
  color *= 1.0 - exp(-5.0 * abs(d));
  color *= 0.82 + 0.18 * cos(140.0 * d);
  float edge = SCALE / u_resolution.y * 1.5;
  color = mix(color, vec3(1.0), 1.0 - smoothstep(0.0, edge, abs(d)));
  gl_FragColor = vec4(color, 1.0);
}
`;

// 3D: a twisted, carved box with a ring and a limited grid of studs.
const fragment3d = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_blend;
uniform float u_twist;

${sdf3d}
${sdfOps}
${sdfDomain}

float map(vec3 p) {
  vec3 center = p - vec3(0.0, 0.1, 0.0);
  vec3 twisted = frapx_opTwist(center, u_twist * sin(u_time * 0.6));
  float box = frapx_sdRoundBox(twisted, vec3(0.42, 0.85, 0.42), 0.08);
  float hole = frapx_sdSphere(center - vec3(0.0, 0.45 * sin(u_time * 0.8), 0.0), 0.42);
  float body = frapx_opSmoothSubtract(box, hole, u_blend);

  vec3 ringP = center;
  ringP.yz = frapx_rotate(ringP.yz, 1.1 + u_time * 0.5);
  float ring = frapx_sdTorus(ringP, vec2(1.15, 0.06));
  body = frapx_opSmoothUnion(body, ring, u_blend);

  vec3 studP = p - vec3(0.0, -0.85, 0.0);
  studP.xz = frapx_opRepeatLimited(studP.xz, vec2(0.6), vec2(4.0));
  float studs = frapx_sdOctahedron(studP, 0.15);

  return min(min(body, studs), p.y + 1.0);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

float softShadow(vec3 origin, vec3 direction) {
  float result = 1.0;
  float t = 0.02;
  for (int i = 0; i < 40; i++) {
    float h = map(origin + direction * t);
    result = min(result, 8.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (result < 0.001 || t > 8.0) break;
  }
  return clamp(result, 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float orbit = 0.7 + u_time * 0.12;
  vec3 origin = vec3(5.8 * sin(orbit), 2.4, 5.8 * cos(orbit));
  vec3 forward = normalize(vec3(0.0, -0.1, 0.0) - origin);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 direction = normalize(forward * 1.9 + uv.x * right + uv.y * up);

  // Twist distorts distances, so march with shortened steps.
  float t = 0.0;
  float hit = -1.0;
  for (int i = 0; i < 160; i++) {
    float d = map(origin + direction * t);
    if (d < 0.0005 * max(t, 1.0)) {
      hit = t;
      break;
    }
    t += d * 0.7;
    if (t > 20.0) break;
  }

  vec3 sky = mix(vec3(0.04, 0.05, 0.08), vec3(0.16, 0.2, 0.28), clamp(direction.y + 0.5, 0.0, 1.0));
  vec3 color = sky;

  if (hit > 0.0) {
    vec3 p = origin + direction * hit;
    vec3 n = calcNormal(p);
    vec3 light = normalize(vec3(0.5, 0.9, 0.3));
    float diffuse = clamp(dot(n, light), 0.0, 1.0) * softShadow(p + n * 0.003, light);
    float checker = mod(floor(p.x * 2.0) + floor(p.z * 2.0), 2.0);
    vec3 albedo = p.y < -0.99 ? vec3(0.26) * (0.85 + 0.15 * checker) : vec3(0.35, 0.72, 0.95);
    float specular = pow(clamp(dot(reflect(-light, n), -direction), 0.0, 1.0), 24.0);
    color = albedo * (0.18 + 1.05 * diffuse) + specular * diffuse * 0.5;
    color = mix(color, sky, 1.0 - exp(-0.005 * hit * hit));
  }

  gl_FragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}
`;

const blend = document.querySelector<HTMLInputElement>("[data-blend]")!;
const twist = document.querySelector<HTMLInputElement>("[data-twist]")!;
const blendOutput = document.querySelector<HTMLOutputElement>("[data-blend-output]")!;
const twistOutput = document.querySelector<HTMLOutputElement>("[data-twist-output]")!;

const shared = { blend: Number(blend.value) };

const flat = createShaderBackground({
  target: "[data-panel-2d]",
  fragment: fragment2d,
  uniforms: shared
});

const solid = createShaderBackground({
  target: "[data-panel-3d]",
  fragment: fragment3d,
  uniforms: { ...shared, twist: Number(twist.value) },
  // Raymarching is the expensive half; cap the resolution on dense screens.
  maxDpr: 1.5
});

blend.addEventListener("input", () => {
  const value = Number(blend.value);
  blendOutput.value = value.toFixed(2);
  flat.setUniform("blend", value);
  solid.setUniform("blend", value);
});

twist.addEventListener("input", () => {
  const value = Number(twist.value);
  twistOutput.value = value.toFixed(2);
  solid.setUniform("twist", value);
});
