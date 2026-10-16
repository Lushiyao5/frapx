import { expect, test, type Page } from "@playwright/test";
import { curl3d, fbm3d, noise3d, perlin3d, periodicPerlin3d, simplex3d, simplex3dGrad } from "../src/index";

// Evaluates `vec4 sample(vec3 p)` on the GPU at COUNT pseudo-random points in
// [-10, 10]^3: pixel i of a 1-row float target holds point i.

const COUNT = 256;
// Central-difference step. Large enough that float32 rounding stays small
// next to the differences, small enough that truncation error does too.
const H = 1e-3;

const program = (body: string) => `#version 300 es
precision highp float;
out vec4 fragColor;
${noise3d}
${body}
void main() {
  float i = floor(gl_FragCoord.x);
  vec3 p = fract(vec3(0.6180339, 0.7548776, 0.5698403) * (i + 1.0)) * 20.0 - 10.0;
  fragColor = sampleAt(p);
}`;

const vertex = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

type EvalResult = { error: string } | { values: number[] };

const evaluateOnGpu = (page: Page, fragment: string): Promise<EvalResult> =>
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
    { vertex, fragment, width: COUNT }
  );

const run = async (page: Page, body: string): Promise<number[][]> => {
  const result = await evaluateOnGpu(page, program(body));
  if ("error" in result) throw new Error(result.error);
  return Array.from({ length: COUNT }, (_, i) => result.values.slice(i * 4, i * 4 + 4));
};

const length3 = (v: number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);

test.beforeEach(async ({ page }) => {
  await page.setContent("<!doctype html><title>glsl-noise</title>");
});

test("frapx_simplex3dGrad returns the same value as frapx_simplex3d", async ({ page }) => {
  const rows = await run(
    page,
    `vec4 sampleAt(vec3 p) {
      vec3 g;
      return vec4(frapx_simplex3dGrad(p, g), frapx_simplex3d(p), 0.0, 0.0);
    }`
  );
  const worst = Math.max(...rows.map(([grad, plain]) => Math.abs(grad! - plain!)));
  expect(worst).toBeLessThan(1e-5);
});

test("frapx_simplex3dGrad's gradient matches central differences", async ({ page }) => {
  const rows = await run(
    page,
    `vec4 sampleAt(vec3 p) {
      vec3 g;
      frapx_simplex3dGrad(p, g);
      const float h = ${H.toFixed(6)};
      vec3 fd = vec3(
        frapx_simplex3d(p + vec3(h, 0.0, 0.0)) - frapx_simplex3d(p - vec3(h, 0.0, 0.0)),
        frapx_simplex3d(p + vec3(0.0, h, 0.0)) - frapx_simplex3d(p - vec3(0.0, h, 0.0)),
        frapx_simplex3d(p + vec3(0.0, 0.0, h)) - frapx_simplex3d(p - vec3(0.0, 0.0, h))
      ) / (2.0 * h);
      return vec4(g - fd, length(g));
    }`
  );
  const scale = Math.max(...rows.map((row) => row[3]!));
  const worst = Math.max(...rows.map(length3));
  expect(scale).toBeGreaterThan(1);
  expect(worst / scale).toBeLessThan(1e-2);
});

test("frapx_curl3d is divergence-free", async ({ page }) => {
  // Divergence by central differences, next to the size of the derivatives
  // it sums, so a field that merely happens to be small does not pass.
  const rows = await run(
    page,
    `vec4 sampleAt(vec3 p) {
      const float h = ${H.toFixed(6)};
      float dx = frapx_curl3d(p + vec3(h, 0.0, 0.0)).x - frapx_curl3d(p - vec3(h, 0.0, 0.0)).x;
      float dy = frapx_curl3d(p + vec3(0.0, h, 0.0)).y - frapx_curl3d(p - vec3(0.0, h, 0.0)).y;
      float dz = frapx_curl3d(p + vec3(0.0, 0.0, h)).z - frapx_curl3d(p - vec3(0.0, 0.0, h)).z;
      return vec4((dx + dy + dz) / (2.0 * h), (abs(dx) + abs(dy) + abs(dz)) / (2.0 * h), length(frapx_curl3d(p)), 0.0);
    }`
  );
  const worstDivergence = Math.max(...rows.map((row) => Math.abs(row[0]!)));
  const derivativeScale = rows.reduce((sum, row) => sum + row[1]!, 0) / COUNT;
  const magnitudes = rows.map((row) => row[2]!);
  // Recorded in the report; the README quotes the curl's typical length.
  test.info().annotations.push({
    type: "measured",
    description: `|div| max ${worstDivergence.toExponential(2)}, mean |dCi/dxi| ${derivativeScale.toFixed(2)}, |curl| max ${Math.max(...magnitudes).toFixed(2)} mean ${(magnitudes.reduce((a, b) => a + b, 0) / COUNT).toFixed(2)}`
  });
  expect(derivativeScale).toBeGreaterThan(1);
  expect(worstDivergence / derivativeScale).toBeLessThan(1e-2);
});

test("compiles each snippet on its own in a WebGL1 context", async ({ page }) => {
  const groups = { simplex3d, simplex3dGrad, curl3d, perlin3d, periodicPerlin3d, fbm3d, noise3d };
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
