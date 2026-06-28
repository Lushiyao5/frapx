import { describe, expect, it } from "vitest";
import { flowDecode, flowDistort } from "../src/index";

function decodeByte(value: number): number {
  const centered = value - 128;
  const scale = centered >= 0 ? 127 : 128;
  return Math.max(-1, Math.min(1, centered / scale));
}

describe("@frapx/shader-flowmap", () => {
  it("exports the namespaced flow decode function", () => {
    expect(flowDecode).toContain("vec2 frapx_flowDecode(sampler2D flowTex, vec2 uv)");
    expect(flowDecode).not.toMatch(/^vec2 flow/m);
  });

  it("decodes the Painter's 8-bit neutral and endpoints exactly", () => {
    expect(decodeByte(0)).toBe(-1);
    expect(decodeByte(128)).toBe(0);
    expect(decodeByte(255)).toBe(1);
    expect(flowDecode).toContain("* 255.0 - 128.0");
    expect(flowDecode).toContain("vec2(128.0), vec2(127.0)");
    expect(flowDecode).toContain("clamp(centered / scale, -1.0, 1.0)");
  });

  it("keeps decoded magnitude monotonic across every 8-bit value", () => {
    const decoded = Array.from({ length: 256 }, (_, value) => decodeByte(value));
    for (let i = 1; i < decoded.length; i += 1) {
      expect(decoded[i]).toBeGreaterThan(decoded[i - 1] ?? -Infinity);
    }
  });

  it("provides the seven-argument overload with separate base and phase UVs", () => {
    expect(flowDistort).toContain(
      "sampler2D base, vec2 flow, vec2 baseUv, vec2 phaseUv"
    );
    expect(flowDistort).toContain("vec3(phaseUv * 2.0, tau * 0.25)");
    expect(flowDistort).toContain("texture(base, baseUv - flow * p0 * strength)");
  });

  it("retains the six-argument overload for compatibility", () => {
    expect(flowDistort).toContain("sampler2D base, vec2 flow, vec2 baseUv,");
    expect(flowDistort).toContain(
      "frapx_flowDistort(base, flow, baseUv, baseUv, time, speed, strength)"
    );
  });

  it("uses three-phase normalised tent blend to reduce ghost smear", () => {
    // Three phases spaced 1/3 apart
    expect(flowDistort).toContain("fract(t)");
    expect(flowDistort).toContain("fract(t + 1.0 / 3.0)");
    expect(flowDistort).toContain("fract(t + 2.0 / 3.0)");
    // Tent weight: zero at boundary (p=0,1), peaks at mid-life
    expect(flowDistort).toContain("1.0 - abs(2.0 * p0 - 1.0)");
    expect(flowDistort).toContain("1.0 - abs(2.0 * p1 - 1.0)");
    expect(flowDistort).toContain("1.0 - abs(2.0 * p2 - 1.0)");
    // Normalised blend (wsum never zero)
    expect(flowDistort).toContain("wsum = w0 + w1 + w2");
    expect(flowDistort).toContain("/ wsum");
  });

  it("bounds temporal phase modulation away from reversal", () => {
    const maxValueNoiseDerivative = 1.5;
    const phaseAmplitude = 0.4;
    const timeFrequency = 0.25;
    const minimumPhaseDerivative =
      1 - maxValueNoiseDerivative * phaseAmplitude * timeFrequency;

    expect(minimumPhaseDerivative).toBeCloseTo(0.85);
    expect(minimumPhaseDerivative).toBeGreaterThan(0);
    expect(flowDistort).toContain("0.4 * (frapx_flowValueNoise3");
    expect(flowDistort).toContain("tau * 0.25");
  });

  it("uses a self-contained arithmetic hash without screen-space dither or sin", () => {
    expect(flowDistort).toContain("fract(p * 0.1031)");
    expect(flowDistort).not.toContain("sin(");
    expect(flowDistort).not.toContain("gl_FragCoord");
  });

  it("preserves flow magnitude without an extra edge-weight remap", () => {
    expect(flowDistort).not.toContain("smoothstep(0.0, 0.2");
    expect(flowDistort).not.toContain("length(flow)");
  });
});
