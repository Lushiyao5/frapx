import { describe, expect, it } from "vitest";
import { flowDecode, flowDistort } from "../src/index";

// Reference JS implementation of the decode spec (mirrors the GLSL).
function decodeByte(value: number): number {
  return Math.max(-1, Math.min(1, (value - 128) / 127.5));
}

describe("@frapx/shader-flowmap", () => {
  // --- Public API surface ---

  it("exports the namespaced flow decode function", () => {
    expect(flowDecode).toContain("vec2 frapx_flowDecode(sampler2D flowTex, vec2 uv)");
    expect(flowDecode).not.toMatch(/^vec2 flow/m);
  });

  it("exports both flowDistort overloads (7-arg and 6-arg)", () => {
    expect(flowDistort).toContain(
      "sampler2D base, vec2 flow, vec2 baseUv, vec2 phaseUv"
    );
    expect(flowDistort).toContain(
      "sampler2D base, vec2 flow, vec2 baseUv,"
    );
    // 6-arg delegates to 7-arg (same baseUv for both coords)
    expect(flowDistort).toContain(
      "frapx_flowDistort(base, flow, baseUv, baseUv, time, speed, strength)"
    );
  });

  it("uses frapx_ namespace prefix to prevent GLSL global name collisions", () => {
    expect(flowDecode).toContain("frapx_flowDecode");
    expect(flowDistort).toContain("frapx_flowDistort");
    expect(flowDecode).not.toMatch(/^vec2 flow/m);
    expect(flowDistort).not.toMatch(/^vec4 flow/m);
    expect(flowDistort).not.toContain("sin(");
    expect(flowDistort).not.toContain("gl_FragCoord");
  });

  // --- Decode numeric spec (verifiable in JS) ---
  // These assert the mathematical contract of the decode formula.
  // GLSL correctness is validated by e2e (real WebGL compile + readPixels).

  it("decodes the Painter's 8-bit neutral byte (128) to exactly 0", () => {
    expect(decodeByte(128)).toBe(0);
    expect(flowDecode).toContain("255.0 - 128.0");
    expect(flowDecode).toContain("/ 127.5");
  });

  it("clamps byte 0 to -1; byte 255 maps to ≈ +0.996 (127/127.5)", () => {
    // Byte 0: -128/127.5 ≈ -1.004 → clamped to -1 exactly.
    expect(decodeByte(0)).toBe(-1);
    // Byte 255: 127/127.5 ≈ 0.9961 — below +1, no clamp needed.
    // The Painter never emits these extreme bytes in practice.
    expect(decodeByte(255)).toBeCloseTo(127 / 127.5, 5);
  });

  it("keeps decoded magnitude strictly monotonic across all 256 byte values", () => {
    const decoded = Array.from({ length: 256 }, (_, v) => decodeByte(v));
    for (let i = 1; i < decoded.length; i += 1) {
      expect(decoded[i]).toBeGreaterThan(decoded[i - 1] ?? -Infinity);
    }
  });
});
