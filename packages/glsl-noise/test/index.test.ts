import { describe, expect, it } from "vitest";
import {
  curl3d,
  fbm3d,
  noise3d,
  noise3dCommon,
  perlin3d,
  periodicPerlin3d,
  simplex3d,
  simplex3dGrad
} from "../src/index";

describe("@frapx/glsl-noise", () => {
  it("exports self-contained 3d noise snippets", () => {
    expect(simplex3d).toContain("float frapx_simplex3d(vec3 v)");
    expect(perlin3d).toContain("float frapx_perlin3d(vec3 P)");
    expect(periodicPerlin3d).toContain(
      "float frapx_periodicPerlin3d(vec3 P, vec3 rep)"
    );
    expect(fbm3d).toContain("float frapx_fbm3d(vec3 p)");
    expect(simplex3dGrad).toContain(
      "float frapx_simplex3dGrad(vec3 v, out vec3 gradient)"
    );
    expect(curl3d).toContain("vec3 frapx_curl3d(vec3 p)");
    expect(curl3d).toContain("float frapx_simplex3dGrad");
  });

  it("prefixes shared helper names", () => {
    expect(noise3dCommon).toContain("frapx_mod289");
    expect(noise3dCommon).toContain("frapx_permute");
    expect(noise3dCommon).not.toContain("float snoise");
    expect(noise3dCommon).not.toContain("float cnoise");
    expect(noise3dCommon).not.toContain("float pnoise");
  });

  it("provides a combined snippet for using multiple functions together", () => {
    expect(noise3d).toContain("float frapx_simplex3d");
    expect(noise3d).toContain("float frapx_perlin3d");
    expect(noise3d).toContain("float frapx_periodicPerlin3d");
    expect(noise3d).toContain("float frapx_fbm3d");
    expect(noise3d).toContain("float frapx_simplex3dGrad");
    expect(noise3d).toContain("vec3 frapx_curl3d");
  });
});
