import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import { raymarch, raymarchCamera, raymarchCameraUniforms } from "@frapx/glsl-raymarch";
import { sdf3d, sdfDomain, sdfOps } from "@frapx/glsl-sdf";
import "./styles.css";

// The scene lives in frapx_map; glsl-raymarch supplies the march, normals,
// shadows, occlusion and the camera ray. Lighting stays here.
const fragment = glsl`
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_shadowK;
uniform float u_aoRadius;

${sdf3d}
${sdfOps}
${sdfDomain}
${raymarchCamera}
${raymarchCameraUniforms}
${raymarch}

float objects(vec3 p) {
  vec3 center = p - vec3(0.0, 0.12 * sin(u_time * 0.8), 0.0);
  float sphere = frapx_sdSphere(center - vec3(0.0, 0.25, 0.0), 0.7);
  vec3 slabP = center - vec3(0.0, -0.35, 0.0);
  slabP.xz = frapx_rotate(slabP.xz, u_time * 0.25);
  float slab = frapx_sdRoundBox(slabP, vec3(0.85, 0.22, 0.85), 0.08);
  float body = frapx_opSmoothUnion(sphere, slab, 0.25);

  vec3 ringP = p - vec3(0.0, 0.25, 0.0);
  ringP.xy = frapx_rotate(ringP.xy, 0.45);
  ringP.xz = frapx_rotate(ringP.xz, u_time * 0.4);
  float ring = frapx_sdTorus(ringP, vec2(1.35, 0.06));

  vec3 pillarP = p;
  pillarP.xz = frapx_opRepeatLimited(pillarP.xz, vec2(2.6), vec2(1.0));
  float pillars = frapx_sdCapsule(pillarP, vec3(0.0, -1.0, 0.0), vec3(0.0, 0.6, 0.0), 0.12);
  // Keep the center cell free for the main body.
  pillars = max(pillars, 1.0 - length(p.xz));

  return min(min(body, ring), pillars);
}

float floorPlane(vec3 p) {
  return p.y + 1.0;
}

float frapx_map(vec3 p) {
  return min(objects(p), floorPlane(p));
}

void main() {
  vec3 rd = frapx_cameraRay(gl_FragCoord.xy, u_resolution);
  vec3 sky = mix(vec3(0.03, 0.04, 0.07), vec3(0.18, 0.22, 0.3), clamp(rd.y * 0.8 + 0.4, 0.0, 1.0));
  vec3 color = sky;

  float t = frapx_raymarch(u_camPos, rd, 0.0, 40.0);
  if (t > 0.0) {
    vec3 p = u_camPos + rd * t;
    vec3 n = frapx_normal(p, 0.0005 * t);
    vec3 light = normalize(vec3(0.55, 0.8, 0.35));

    float shadow = frapx_softShadow(p + n * 0.01, light, 0.01, 12.0, u_shadowK);
    float occlusion = frapx_ao(p, n, u_aoRadius);
    float diffuse = max(dot(n, light), 0.0) * shadow;
    float specular = pow(max(dot(reflect(-light, n), -rd), 0.0), 32.0) * shadow;

    float checker = mod(floor(p.x * 1.5) + floor(p.z * 1.5), 2.0);
    // Hits land within a distance-relative threshold, so pick the material by
    // which surface is closer rather than by a fixed height.
    bool onFloor = floorPlane(p) < objects(p);
    vec3 albedo = onFloor ? vec3(0.32) * (0.8 + 0.2 * checker) : vec3(0.9, 0.55, 0.3);
    color = albedo * (0.25 * occlusion * (0.6 + 0.4 * n.y) + 1.1 * diffuse) + 0.4 * specular;
    color = mix(color, sky, 1.0 - exp(-0.004 * t * t));
  }

  gl_FragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}
`;

const panel = document.querySelector<HTMLElement>("[data-panel]")!;
const fov = document.querySelector<HTMLInputElement>("[data-fov]")!;
const shadow = document.querySelector<HTMLInputElement>("[data-shadow]")!;
const ao = document.querySelector<HTMLInputElement>("[data-ao]")!;
const fovOutput = document.querySelector<HTMLOutputElement>("[data-fov-output]")!;
const shadowOutput = document.querySelector<HTMLOutputElement>("[data-shadow-output]")!;
const aoOutput = document.querySelector<HTMLOutputElement>("[data-ao-output]")!;

const target = [0, 0, 0] as const;
const orbit = { yaw: 0.6, pitch: 0.35, radius: 6.5 };

const cameraPosition = (): [number, number, number] => [
  target[0] + orbit.radius * Math.cos(orbit.pitch) * Math.sin(orbit.yaw),
  target[1] + orbit.radius * Math.sin(orbit.pitch),
  target[2] + orbit.radius * Math.cos(orbit.pitch) * Math.cos(orbit.yaw)
];

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const background = createShaderBackground({
  target: panel,
  fragment,
  uniforms: {
    camPos: cameraPosition(),
    camTarget: target,
    fov: toRadians(Number(fov.value)),
    shadowK: Number(shadow.value),
    aoRadius: Number(ao.value)
  },
  // Raymarching is expensive; cap the resolution on dense screens.
  maxDpr: 1.5
});

let drag: { x: number; y: number; id: number } | null = null;

panel.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
  panel.setPointerCapture(event.pointerId);
  panel.classList.add("is-dragging");
});

panel.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  orbit.yaw -= (event.clientX - drag.x) * 0.008;
  // Stay clear of straight up/down, where the camera basis is undefined.
  orbit.pitch = Math.min(1.35, Math.max(0.02, orbit.pitch + (event.clientY - drag.y) * 0.006));
  drag.x = event.clientX;
  drag.y = event.clientY;
  background.setUniform("camPos", cameraPosition());
});

const endDrag = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  drag = null;
  panel.classList.remove("is-dragging");
};
panel.addEventListener("pointerup", endDrag);
panel.addEventListener("pointercancel", endDrag);

fov.addEventListener("input", () => {
  fovOutput.value = `${fov.value}°`;
  background.setUniform("fov", toRadians(Number(fov.value)));
});

shadow.addEventListener("input", () => {
  shadowOutput.value = shadow.value;
  background.setUniform("shadowK", Number(shadow.value));
});

ao.addEventListener("input", () => {
  aoOutput.value = Number(ao.value).toFixed(2);
  background.setUniform("aoRadius", Number(ao.value));
});
