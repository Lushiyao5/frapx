// Shared GLSL helpers — embedded verbatim into each mode's fragment shader.
// Insert via ${flowLibGLSL} before void main().
// Provides frapx_flowDecode and frapx_flowDistort (from package)
// plus a painter-specific sampleFlowAdvect convenience wrapper.

import { flowDecode, flowDistort } from "@frapx/shader-flowmap";

export const flowLibGLSL = `
${flowDecode}
${flowDistort}

// Painter convenience wrapper: decode + distort in one call.
// phase: u_time * speed. Untiled UV keeps phase noise stable across tiling changes.
vec4 sampleFlowAdvect(
  sampler2D base, sampler2D flowTex,
  vec2 uv, float tiling, float phase, float strength
) {
  vec2 flow = frapx_flowDecode(flowTex, uv);
  return frapx_flowDistort(base, flow, uv * tiling, uv, phase, 1.0, strength);
}
`;
