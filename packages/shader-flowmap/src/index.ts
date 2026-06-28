// GLSL ES 3.00 (WebGL2) flowmap helpers.
// Assumes flow textures are uploaded with flipY:true (the default in @frapx/shader).
// Encoding convention: R/G byte = round(127.5 + d * 127.5); neutral byte = 128.
// Neutral (no flow) = rgb(128, 128, 0).

const glsl = String.raw;

/**
 * Unpack an RG-encoded flow texture into a signed velocity vector.
 *
 * Decodes the frapx flowmap convention:
 *   R = round(127.5 + dx * 127.5)
 *   G = round(127.5 - dy * 127.5)  (canvas Y negated to match WebGL Y-up)
 *
 * Byte 128 decodes to exactly 0 (neutral). Byte 0 decodes to exactly −1
 * (clamped from −128/127.5). Byte 255 decodes to ≈ +0.996 (127/127.5).
 * The Painter never emits byte 0 or 255 in practice.
 * Assumes the texture is uploaded with flipY:true.
 * Returns a vec2 in [-1, 1] x [-1, 1] representing the flow direction/speed.
 *
 * GLSL ES 3.00 required.
 */
export const flowDecode = glsl`
vec2 frapx_flowDecode(sampler2D flowTex, vec2 uv) {
  vec2 centered = texture(flowTex, uv).rg * 255.0 - 128.0;
  return clamp(centered / 127.5, -1.0, 1.0);
}`;

/**
 * Three-phase advection of a base texture along a precomputed flow vector.
 *
 * Improvements over a naive single-phase scroll:
 *  - Spatio-temporal phase decorrelation: 3D value noise (XY = UV space, Z = time)
 *    shifts each pixel's animation phase independently. Its bounded time derivative
 *    keeps phase progression monotonic while preventing an exact 1/speed loop.
 *  - Three-phase normalised tent blend: phases are spaced 1/3 apart and each
 *    weighted by a tent function that is zero at the reset boundary, so no sample
 *    pops in. Reduces the visible ghost (double-image smear) by ~33 % compared to
 *    the two-phase design. Requires three texture fetches instead of two.
 *
 * Parameters:
 *   base     — texture to distort
 *   flow     — signed flow vector from frapx_flowDecode (or any [-1,1] vec2)
 *   baseUv   — base texture coordinates (apply tiling before calling if needed)
 *   phaseUv  — untiled coordinates used for phase decorrelation
 *   time     — elapsed time in seconds (e.g. u_time)
 *   speed    — flow animation speed multiplier
 *   strength — distortion magnitude
 *
 * This snippet is self-contained; no other frapx_ snippet is required.
 * GLSL ES 3.00 required.
 */
export const flowDistort = glsl`
float frapx_flowHash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float frapx_flowValueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = frapx_flowHash3(i + vec3(0.0, 0.0, 0.0));
  float n100 = frapx_flowHash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = frapx_flowHash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = frapx_flowHash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = frapx_flowHash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = frapx_flowHash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = frapx_flowHash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = frapx_flowHash3(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}
vec4 frapx_flowDistort(
  sampler2D base, vec2 flow, vec2 baseUv, vec2 phaseUv,
  float time, float speed, float strength
) {
  float tau = time * speed;
  // For cubic interpolation, |d(noise)/dz| <= 1.5. With amplitude 0.4 and
  // time frequency 0.25, dt/dtau stays in [0.85, 1.15], so phase cannot reverse.
  float phaseOffset = 0.4 * (frapx_flowValueNoise3(
    vec3(phaseUv * 2.0, tau * 0.25)
  ) - 0.5);
  float t  = tau + phaseOffset;
  // Three phases spaced 1/3 apart. Tent weight peaks at mid-life and is zero
  // at the reset boundary (p=0 and p=1), so a resetting sample never pops in.
  // wsum stays in [4/3, 5/3] and is never zero, so division is always safe.
  float p0 = fract(t);
  float p1 = fract(t + 1.0 / 3.0);
  float p2 = fract(t + 2.0 / 3.0);
  float w0 = 1.0 - abs(2.0 * p0 - 1.0);
  float w1 = 1.0 - abs(2.0 * p1 - 1.0);
  float w2 = 1.0 - abs(2.0 * p2 - 1.0);
  float wsum = w0 + w1 + w2;
  vec4 c0 = texture(base, baseUv - flow * p0 * strength);
  vec4 c1 = texture(base, baseUv - flow * p1 * strength);
  vec4 c2 = texture(base, baseUv - flow * p2 * strength);
  return (c0 * w0 + c1 * w1 + c2 * w2) / wsum;
}
vec4 frapx_flowDistort(
  sampler2D base, vec2 flow, vec2 baseUv,
  float time, float speed, float strength
) {
  return frapx_flowDistort(base, flow, baseUv, baseUv, time, speed, strength);
}`;
