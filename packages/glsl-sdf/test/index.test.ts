import { describe, expect, it } from "vitest";
import { sdf, sdf2d, sdf3d, sdfDomain, sdfOps } from "../src/index";
import { sdfCases } from "./cases";

const DEFINITION =
  /^(float|vec2|vec3|vec4|mat2)\s+(\w+)\s*\(([^)]*)\)\s*\{/gm;

// Name plus parameter types, the part GLSL uses to tell overloads apart.
const signatures = (source: string): string[] =>
  Array.from(source.matchAll(DEFINITION), (match) => {
    const types = match[3]!
      .split(",")
      .map((param) => param.trim().split(/\s+/)[0])
      .join(",");
    return `${match[2]}(${types})`;
  });

const names = (source: string): string[] =>
  Array.from(source.matchAll(DEFINITION), (match) => match[2]!);

const groups = { sdf2d, sdf3d, sdfOps, sdfDomain };

describe("@frapx/glsl-sdf", () => {
  it("prefixes every function with frapx_", () => {
    const all = names(sdf);
    expect(all.length).toBeGreaterThan(30);
    for (const name of all) expect(name).toMatch(/^frapx_/);
  });

  it("never defines the same signature twice, so groups can be combined", () => {
    const all = signatures(sdf);
    expect(new Set(all).size).toBe(all.length);
  });

  it("combines every group into sdf", () => {
    const combined = signatures(sdf).sort();
    const separate = Object.values(groups).flatMap(signatures).sort();
    expect(combined).toEqual(separate);
  });

  it("keeps 2D and 3D primitives in their own groups", () => {
    expect(signatures(sdf2d)).toContain("frapx_sdBox(vec2,vec2)");
    expect(signatures(sdf3d)).toContain("frapx_sdBox(vec3,vec3)");
    expect(signatures(sdf2d).some((s) => s.includes("vec3"))).toBe(false);
  });

  it("stays valid in both GLSL ES 1.00 and 3.00", () => {
    const code = sdf.replace(/\/\/.*$/gm, "");
    // Built-ins missing from ES 1.00, and identifiers reserved in ES 3.00.
    expect(code).not.toMatch(/\bround\s*\(/);
    expect(code).not.toMatch(/\b(texture2D|gl_FragColor|#version|precision)\b/);
    expect(code).not.toMatch(/\b(sample|smooth|flat|input|output|half|filter)\b/);
  });

  it("has a GPU reference case for every function", () => {
    const tested = new Set(
      sdfCases.map((testCase) => /^(frapx_\w+)\(/.exec(testCase.expr)?.[1])
    );
    for (const name of new Set(names(sdf))) {
      expect(tested.has(name), `${name} has no case in test/cases.ts`).toBe(true);
    }
  });
});
