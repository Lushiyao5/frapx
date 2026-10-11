import { expect, test, type Page } from "@playwright/test";
import { raymarch, raymarchCamera, raymarchCameraUniforms } from "../src/index";
import {
  cameraUniforms,
  raymarchCases,
  sceneMap,
  uniformCases,
  type RaymarchCase
} from "../test/cases";

// Evaluates every reference case on the GPU: pixel i of a 1-row float target
// holds case i, read back with RGBA/FLOAT.

const TOLERANCE = 2e-4;

const toVec4 = (expr: string, components: number): string =>
  components === 1 ? `vec4(${expr}, 0.0, 0.0, 0.0)` : `vec4(${expr}, 0.0)`;

const branches = (cases: RaymarchCase[]): string =>
  cases
    .map(
      (testCase, index) =>
        `${index ? "else " : ""}if (index == ${index}) value = ${toVec4(testCase.expr, testCase.expected.length)};`
    )
    .join("\n  ");

type Version = "100" | "300";

const fragment = (version: Version, declarations: string, cases: RaymarchCase[]): string =>
  version === "100"
    ? `precision highp float;
${declarations}
void main() {
  int index = int(gl_FragCoord.x);
  vec4 value = vec4(0.0);
  ${branches(cases)}
  gl_FragColor = value;
}`
    : `#version 300 es
precision highp float;
out vec4 fragColor;
${declarations}
void main() {
  int index = int(gl_FragCoord.x);
  vec4 value = vec4(0.0);
  ${branches(cases)}
  fragColor = value;
}`;

const vertex: Record<Version, string> = {
  "100": `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`,
  "300": `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`
};

type EvalResult = { error: string } | { values: number[] };

const evaluateOnGpu = (
  page: Page,
  vertex: string,
  fragment: string,
  width: number,
  uniforms: Record<string, number[]> = {}
) =>
  page.evaluate(
    ({ vertex, fragment, width, uniforms }): EvalResult => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      if (!gl) return { error: "WebGL2 is unavailable" };
      if (!gl.getExtension("EXT_color_buffer_float")) {
        return { error: "EXT_color_buffer_float is unavailable" };
      }

      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) ?? "compile failed");
        }
        return shader;
      };

      const program = gl.createProgram()!;
      try {
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      } catch (error) {
        return { error: String(error) };
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return { error: gl.getProgramInfoLog(program) ?? "link failed" };
      }

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

      gl.useProgram(program);
      for (const [name, value] of Object.entries(uniforms)) {
        const uniform = gl.getUniformLocation(program, name);
        if (value.length === 1) gl.uniform1fv(uniform, value);
        else gl.uniform3fv(uniform, value);
      }
      gl.viewport(0, 0, width, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const pixels = new Float32Array(width * 4);
      gl.readPixels(0, 0, width, 1, gl.RGBA, gl.FLOAT, pixels);
      return { values: Array.from(pixels) };
    },
    { vertex, fragment, width, uniforms }
  );

const mismatches = (cases: RaymarchCase[], values: number[]): string[] =>
  cases.flatMap((testCase, index) => {
    const actual = values.slice(index * 4, index * 4 + testCase.expected.length);
    const tolerance = testCase.tolerance ?? TOLERANCE;
    const ok = testCase.expected.every(
      (value, component) => Math.abs(actual[component]! - value) <= tolerance
    );
    return ok ? [] : [`${testCase.expr}: expected ${testCase.expected}, got ${actual}`];
  });

test.beforeEach(async ({ page }) => {
  await page.setContent("<!doctype html><title>glsl-raymarch</title>");
});

for (const version of ["100", "300"] as const) {
  const label = version === "100" ? "GLSL ES 1.00" : "GLSL ES 3.00";

  // frapx_map is forward declared, so it may be defined after the snippet or
  // before it.
  for (const [order, declarations] of [
    ["map defined after", `${raymarchCamera}\n${raymarch}\n${sceneMap}`],
    ["map defined before", `${sceneMap}\n${raymarchCamera}\n${raymarch}`]
  ] as const) {
    test(`matches the reference values (${label}, ${order})`, async ({ page }) => {
      const result = await evaluateOnGpu(
        page,
        vertex[version],
        fragment(version, declarations, raymarchCases),
        raymarchCases.length
      );
      if ("error" in result) throw new Error(result.error);
      expect(mismatches(raymarchCases, result.values)).toEqual([]);
    });
  }

  test(`reads the standard camera uniforms (${label})`, async ({ page }) => {
    const result = await evaluateOnGpu(
      page,
      vertex[version],
      fragment(version, `${raymarchCamera}\n${raymarchCameraUniforms}`, uniformCases),
      uniformCases.length,
      cameraUniforms
    );
    if ("error" in result) throw new Error(result.error);
    expect(mismatches(uniformCases, result.values)).toEqual([]);
  });
}

test("takes loop limits from macros defined before the snippet", async ({ page }) => {
  // From z = 50 the march needs two steps: one to reach the sphere, one to
  // confirm the hit.
  const far: RaymarchCase[] = [
    { expr: "frapx_raymarch(vec3(0.0, 0.0, 50.0), vec3(0.0, 0.0, -1.0), 0.0, 100.0)", expected: [49] }
  ];
  const run = (prelude: string) =>
    evaluateOnGpu(page, vertex["300"], fragment("300", `${prelude}\n${raymarch}\n${sceneMap}`, far), 1);

  const defaults = await run("");
  if ("error" in defaults) throw new Error(defaults.error);
  expect(mismatches(far, defaults.values)).toEqual([]);

  const oneStep = await run("#define FRAPX_RAYMARCH_STEPS 1");
  if ("error" in oneStep) throw new Error(oneStep.error);
  expect(oneStep.values[0]).toBe(-1);
});

test("compiles each group in a WebGL1 context", async ({ page }) => {
  const sources = {
    raymarch: `${raymarch}\n${sceneMap}`,
    raymarchCamera,
    raymarchCameraUniforms: `${raymarchCamera}\n${raymarchCameraUniforms}`,
    all: `${raymarchCamera}\n${raymarchCameraUniforms}\n${raymarch}\n${sceneMap}`
  };
  const logs = await page.evaluate((sources) => {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return { webgl: "WebGL1 is unavailable" };
    const result: Record<string, string> = {};
    for (const [name, source] of Object.entries(sources)) {
      const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(
        shader,
        `precision highp float;\n${source}\nvoid main() { gl_FragColor = vec4(0.0); }`
      );
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        result[name] = gl.getShaderInfoLog(shader) ?? "compile failed";
      }
    }
    return result;
  }, sources);
  expect(logs).toEqual({});
});
