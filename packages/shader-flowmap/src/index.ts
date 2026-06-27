// GLSL ES 3.00 (WebGL2) flowmap helpers.
// Assumes flow textures are uploaded with flipY:true (the default in @frapx/shader).
// Encoding convention: R = 0.5 + dx*0.5, G = 0.5 - dy*0.5 (Y-flipped to match WebGL Y-up).
// Neutral (no flow) = rgb(128, 128, 0).

const glsl = String.raw;

/**
 * Unpack an RG-encoded flow texture into a signed velocity vector.
 *
 * Decodes the frapx flowmap convention:
 *   R = 0.5 + dx*0.5
 *   G = 0.5 - dy*0.5  (canvas Y negated to match WebGL Y-up)
 *
 * Assumes the texture is uploaded with flipY:true.
 * Returns a vec2 in [-1, 1] x [-1, 1] representing the flow direction/speed.
 *
 * GLSL ES 3.00 required.
 */
export const flowDecode = glsl`
vec2 frapx_flowDecode(sampler2D flowTex, vec2 uv) {
  return texture(flowTex, uv).rg * 2.0 - 1.0;
}`;

/**
 * Two-phase advection of a base texture along a precomputed flow vector.
 *
 * Cross-fades two scroll phases (offset by 0.5 in cycle) to avoid the
 * infinite-stretching artifact that a single-phase scroll produces.
 * The blend weight makes each phase smoothly peak at its midpoint.
 *
 * Parameters:
 *   base     — texture to distort
 *   flow     — signed flow vector from frapx_flowDecode (or any [-1,1] vec2)
 *   uv       — texture coordinates (apply tiling before calling if needed)
 *   time     — elapsed time in seconds (e.g. u_time)
 *   speed    — flow animation speed multiplier
 *   strength — distortion magnitude
 *
 * GLSL ES 3.00 required.
 */
export const flowDistort = glsl`
vec4 frapx_flowDistort(
  sampler2D base, vec2 flow, vec2 uv,
  float time, float speed, float strength
) {
  float t  = time * speed;
  float p0 = fract(t);
  float p1 = fract(t + 0.5);
  vec4 c0  = texture(base, uv - flow * p0 * strength);
  vec4 c1  = texture(base, uv - flow * p1 * strength);
  return mix(c0, c1, abs(p0 - 0.5) * 2.0);
}`;
