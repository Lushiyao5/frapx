import { describe, expect, it } from "vitest";
import { flowDecode, flowDistort } from "../src/index";

describe("@frapx/shader-flowmap", () => {
  it("flowDecode exports the frapx_flowDecode function signature", () => {
    expect(flowDecode).toContain("vec2 frapx_flowDecode(sampler2D flowTex, vec2 uv)");
  });

  it("flowDecode applies the RG decode formula", () => {
    // Must decode with * 2.0 - 1.0 to recover signed [-1,1] velocity
    expect(flowDecode).toContain("* 2.0 - 1.0");
    expect(flowDecode).toContain(".rg");
  });

  it("flowDistort exports the frapx_flowDistort function signature", () => {
    expect(flowDistort).toContain("vec4 frapx_flowDistort(");
    expect(flowDistort).toContain("sampler2D base");
    expect(flowDistort).toContain("vec2 flow");
  });

  it("flowDistort uses two-phase cross-fade to avoid stretching", () => {
    // Two phases offset by 0.5 in the animation cycle
    expect(flowDistort).toContain("fract(t)");
    expect(flowDistort).toContain("fract(t + 0.5)");
    expect(flowDistort).toContain("mix(c0, c1");
    expect(flowDistort).toContain("abs(p0 - 0.5) * 2.0");
  });

  it("both exports use frapx_ prefix to avoid GLSL global name collisions", () => {
    expect(flowDecode).not.toMatch(/^vec2 flow/m);
    expect(flowDistort).not.toMatch(/^vec4 flow/m);
    expect(flowDecode).toContain("frapx_");
    expect(flowDistort).toContain("frapx_");
  });
});
