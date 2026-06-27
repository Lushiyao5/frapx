// Shared GLSL helpers — embedded verbatim into each mode's fragment shader.
// Insert via ${flowLibGLSL} before void main().
// All functions declared in dependency order.

export const flowLibGLSL = /* glsl */`
// Decode RG-encoded direction to signed vec2 in [-1, 1].
// Encoding: R = 0.5 + dx*0.5, G = 0.5 - dy*0.5 (canvas Y negated)
vec2 decodeFlow(vec2 rg) {
  return rg * 2.0 - 1.0;
}

// Per-pixel dither in [-0.5, 0.5] via stable hash of gl_FragCoord.
// Breaks spatially coherent phase pulsing in multi-pixel advection.
float screenDither() {
  return fract(sin(dot(gl_FragCoord.xy, vec2(127.1, 311.7))) * 43758.5453) - 0.5;
}

// Smooth ramp [0, 1] that tapers displacement to zero near neutral flow.
// Eliminates hard edge between static (neutral RG=0.5,0.5) and painted regions.
float flowEdgeWeight(float flowLen) {
  return smoothstep(0.0, 0.2, flowLen);
}

// Improved two-phase flow advection.
// t: animated time phase; include screenDither() offset before calling.
// Uses smoothstep-shaped blend to soften the triangle-wave seam.
vec4 sampleFlowAdvect(
  sampler2D base,
  sampler2D flowTex,
  vec2 uv,
  float tiling,
  float t,
  float strength
) {
  vec2 f = decodeFlow(texture(flowTex, uv).rg);
  vec2 fd = f * flowEdgeWeight(length(f));

  float p0 = fract(t);
  float p1 = fract(t + 0.5);

  vec2 buv = uv * tiling;
  vec4 c0 = texture(base, buv - fd * p0 * strength);
  vec4 c1 = texture(base, buv - fd * p1 * strength);

  // Smoothstep triangle wave: flatter at 0/1, sharper cross-fade in the middle
  float blend = smoothstep(0.3, 0.7, abs(p0 - 0.5) * 2.0);
  return mix(c0, c1, blend);
}
`;
