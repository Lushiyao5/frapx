import { sdf } from "@frapx/glsl-sdf";
import { describe, expect, it } from "vitest";
import { raymarch, raymarchCamera, raymarchCameraUniforms } from "../src/index";
import { raymarchCases, uniformCases } from "./cases";

const DEFINITION =
  /^(float|vec2|vec3|vec4|mat2|mat3)\s+(\w+)\s*\(([^)]*)\)\s*\{/gm;

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

const all = `${raymarchCamera}\n${raymarchCameraUniforms}\n${raymarch}`;

describe("@frapx/glsl-raymarch", () => {
  it("prefixes every function with frapx_", () => {
    const defined = names(all);
    expect(defined.length).toBeGreaterThan(5);
    for (const name of defined) expect(name).toMatch(/^frapx_/);
  });

  it("never defines the same signature twice, so groups can be combined", () => {
    const defined = signatures(all);
    expect(new Set(defined).size).toBe(defined.length);
  });

  it("does not collide with @frapx/glsl-sdf", () => {
    const ours = new Set(names(all));
    const shared = names(sdf).filter((name) => ours.has(name));
    expect(shared).toEqual([]);
  });

  it("forward declares frapx_map once, in raymarch only", () => {
    const declaration = /^float frapx_map\(vec3 p\);$/gm;
    expect(raymarch.match(declaration)).toHaveLength(1);
    expect(raymarchCamera).not.toMatch(/frapx_map/);
    expect(raymarchCameraUniforms).not.toMatch(/frapx_map/);
    expect(signatures(all)).not.toContain("frapx_map(vec3)");
  });

  it("guards every macro so it can be overridden", () => {
    const defines = Array.from(raymarch.matchAll(/^#define (\w+)/gm), (match) => match[1]!);
    expect(defines).toEqual([
      "FRAPX_RAYMARCH_STEPS",
      "FRAPX_RAYMARCH_PRECISION",
      "FRAPX_SHADOW_STEPS",
      "FRAPX_AO_SAMPLES"
    ]);
    for (const name of defines) expect(raymarch).toContain(`#ifndef ${name}\n#define ${name} `);
  });

  it("declares exactly the standard camera uniforms", () => {
    const uniforms = Array.from(
      `${raymarch}\n${raymarchCamera}\n${raymarchCameraUniforms}`.matchAll(/^uniform \w+ (\w+);/gm),
      (match) => match[1]
    );
    expect(uniforms).toEqual(["u_camPos", "u_camTarget", "u_fov"]);
  });

  it("stays valid in both GLSL ES 1.00 and 3.00", () => {
    const code = all.replace(/\/\/.*$/gm, "");
    // Built-ins missing from ES 1.00, and identifiers reserved in ES 3.00.
    expect(code).not.toMatch(/\bround\s*\(/);
    expect(code).not.toMatch(/\b(texture2D|gl_FragColor|#version|precision)\b/);
    expect(code).not.toMatch(/\b(sample|smooth|flat|input|output|half|filter)\b/);
  });

  it("has a GPU reference case for every function", () => {
    const tested = new Set(
      [...raymarchCases, ...uniformCases].map(
        (testCase) => /^(frapx_\w+)\(/.exec(testCase.expr)?.[1]
      )
    );
    for (const name of new Set(names(all))) {
      expect(tested.has(name), `${name} has no case in test/cases.ts`).toBe(true);
    }
  });
});
