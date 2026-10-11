const glsl = String.raw;

// The groups never define the same signature twice. raymarchCameraUniforms
// builds on raymarchCamera, so include it after that group.

export const raymarchLicense = glsl`
// Adapted from Inigo Quilez's Shadertoy shaders.
// License: MIT, Copyright (c) 2013-2020 Inigo Quilez.
// Sources and license text: LICENSES/iq-raymarch-MIT.txt in @frapx/glsl-raymarch.
`;

/**
 * Sphere tracing against a user-defined `float frapx_map(vec3 p)`, plus
 * normals, soft shadows and ambient occlusion. The map is forward declared, so
 * define it anywhere in the shader. Loop limits are macros; `#define` them
 * before this snippet to override the defaults.
 */
export const raymarch = glsl`
${raymarchLicense}

#ifndef FRAPX_RAYMARCH_STEPS
#define FRAPX_RAYMARCH_STEPS 128
#endif

// Hit threshold relative to the distance travelled (absolute below t = 1).
#ifndef FRAPX_RAYMARCH_PRECISION
#define FRAPX_RAYMARCH_PRECISION 0.0005
#endif

#ifndef FRAPX_SHADOW_STEPS
#define FRAPX_SHADOW_STEPS 64
#endif

#ifndef FRAPX_AO_SAMPLES
#define FRAPX_AO_SAMPLES 5
#endif

float frapx_map(vec3 p);

// Distance along rd to the first hit, or -1.0 when nothing is hit before tmax
// or within FRAPX_RAYMARCH_STEPS steps.
float frapx_raymarch(vec3 ro, vec3 rd, float tmin, float tmax) {
  float t = tmin;
  for (int i = 0; i < FRAPX_RAYMARCH_STEPS; i++) {
    float d = frapx_map(ro + rd * t);
    if (abs(d) < FRAPX_RAYMARCH_PRECISION * max(t, 1.0)) return t;
    t += d;
    if (t > tmax) break;
  }
  return -1.0;
}

// Surface normal from four map samples (tetrahedron technique).
// eps: sampling offset, e.g. 0.0005 * t for a hit at distance t.
vec3 frapx_normal(vec3 p, float eps) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * frapx_map(p + k.xyy * eps) +
    k.yyx * frapx_map(p + k.yyx * eps) +
    k.yxy * frapx_map(p + k.yxy * eps) +
    k.xxx * frapx_map(p + k.xxx * eps)
  );
}

// 0 in full shadow, 1 fully lit. Offset ro from the surface along its normal
// (e.g. p + n * 0.01) so the march does not hit its own origin. k: penumbra
// sharpness, larger is harder (around 8 to 32).
float frapx_softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0;
  float t = tmin;
  float ph = 1e10;
  for (int i = 0; i < FRAPX_SHADOW_STEPS; i++) {
    float h = frapx_map(ro + rd * t);
    if (h < 0.0) {
      res = 0.0;
      break;
    }
    // Closest approach between this sample and the previous one. When the
    // previous sphere lies inside this one (e.g. marching straight away from
    // a plane) there is no such point, so fall back to the plain estimate.
    float y = h * h / (2.0 * ph);
    if (y < h && y < t) {
      res = min(res, k * sqrt(h * h - y * y) / (t - y));
    } else {
      res = min(res, k * h / max(t, 1e-4));
    }
    ph = h;
    t += max(h, FRAPX_RAYMARCH_PRECISION * max(t, 1.0));
    if (res < 1e-4 || t > tmax) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

// 0 fully occluded, 1 open. Samples the map along the normal n up to radius
// away from the surface point p.
float frapx_ao(vec3 p, vec3 n, float radius) {
  float occ = 0.0;
  float total = 0.0;
  float weight = 1.0;
  for (int i = 0; i < FRAPX_AO_SAMPLES; i++) {
    float h = radius * float(i + 1) / float(FRAPX_AO_SAMPLES);
    occ += (h - frapx_map(p + n * h)) * weight;
    total += h * weight;
    weight *= 0.95;
  }
  return clamp(1.0 - occ / total, 0.0, 1.0);
}
`;

/**
 * Camera rays from pixel coordinates. World up is +y. fov is the vertical
 * field of view in radians.
 */
export const raymarchCamera = glsl`
${raymarchLicense}

// Columns: right, up, forward (towards target). roll, in radians, turns the
// camera counter-clockwise as seen from behind it, so the image turns
// clockwise. Undefined when looking straight up or down, or when eye equals
// target.
mat3 frapx_lookAt(vec3 eye, vec3 target, float roll) {
  vec3 forward = normalize(target - eye);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  float c = cos(roll);
  float s = sin(roll);
  return mat3(c * right + s * up, c * up - s * right, forward);
}

// Pass gl_FragCoord.xy (plus any sub-pixel jitter) and u_resolution.
vec3 frapx_cameraRay(vec2 fragCoord, vec2 resolution, mat3 camera, float fov) {
  vec2 uv = (fragCoord - 0.5 * resolution) / resolution.y;
  return normalize(camera * vec3(uv, 0.5 / tan(0.5 * fov)));
}

vec3 frapx_cameraRay(vec2 fragCoord, vec2 resolution, vec3 eye, vec3 target, float fov) {
  return frapx_cameraRay(fragCoord, resolution, frapx_lookAt(eye, target, 0.0), fov);
}
`;

/**
 * Standard camera uniforms. Set `camPos`, `camTarget` and `fov` from
 * JavaScript; the ray origin is u_camPos. Include after `raymarchCamera`.
 */
export const raymarchCameraUniforms = glsl`
uniform vec3 u_camPos;
uniform vec3 u_camTarget;
uniform float u_fov;

vec3 frapx_cameraRay(vec2 fragCoord, vec2 resolution) {
  return frapx_cameraRay(fragCoord, resolution, u_camPos, u_camTarget, u_fov);
}
`;
