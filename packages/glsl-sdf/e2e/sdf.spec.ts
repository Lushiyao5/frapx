import { expect, test, type Page } from "@playwright/test";
import { sdf, sdf2d, sdf3d, sdfDomain, sdfOps } from "../src/index";
import { sdfCases } from "../test/cases";

// Evaluates every reference case on the GPU: pixel i of a 1-row float target
// holds case i, read back with RGBA/FLOAT.

const TOLERANCE = 2e-4;

const toVec4 = (expr: string, components: number): string =>
  components === 1
    ? `vec4(${expr}, 0.0, 0.0, 0.0)`
    : components === 2
      ? `vec4(${expr}, 0.0, 0.0)`
      : `vec4(${expr}, 0.0)`;

const branches = sdfCases
  .map(
    (testCase, index) =>
      `${index ? "else " : ""}if (index == ${index}) value = ${toVec4(testCase.expr, testCase.expected.length)};`
  )
  .join("\n  ");

const evaluate100 = `precision highp float;
${sdf}
void main() {
  int index = int(gl_FragCoord.x);
  vec4 value = vec4(0.0);
  ${branches}
  gl_FragColor = value;
}`;

const evaluate300 = `#version 300 es
precision highp float;
out vec4 fragColor;
${sdf}
void main() {
  int index = int(gl_FragCoord.x);
  vec4 value = vec4(0.0);
  ${branches}
  fragColor = value;
}`;

const vertex100 = `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

const vertex300 = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

type EvalResult = { error: string } | { values: number[] };

const evaluateOnGpu = (page: Page, vertex: string, fragment: string, width: number) =>
  page.evaluate(
    ({ vertex, fragment, width }): EvalResult => {
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
      gl.viewport(0, 0, width, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const pixels = new Float32Array(width * 4);
      gl.readPixels(0, 0, width, 1, gl.RGBA, gl.FLOAT, pixels);
      return { values: Array.from(pixels) };
    },
    { vertex, fragment, width }
  );

test.beforeEach(async ({ page }) => {
  await page.setContent("<!doctype html><title>glsl-sdf</title>");
});

for (const [version, vertex, fragment] of [
  ["GLSL ES 1.00", vertex100, evaluate100],
  ["GLSL ES 3.00", vertex300, evaluate300]
] as const) {
  test(`matches the reference distances (${version})`, async ({ page }) => {
    const result = await evaluateOnGpu(page, vertex, fragment, sdfCases.length);
    if ("error" in result) throw new Error(result.error);

    const mismatches = sdfCases.flatMap((testCase, index) => {
      const actual = result.values.slice(index * 4, index * 4 + testCase.expected.length);
      const ok = testCase.expected.every(
        (value, component) => Math.abs(actual[component]! - value) <= TOLERANCE
      );
      return ok ? [] : [`${testCase.expr}: expected ${testCase.expected}, got ${actual}`];
    });
    expect(mismatches).toEqual([]);
  });
}

test("compiles each group on its own in a WebGL1 context", async ({ page }) => {
  const groups = { sdf2d, sdf3d, sdfOps, sdfDomain, sdf };
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
  }, groups);
  expect(logs).toEqual({});
});
