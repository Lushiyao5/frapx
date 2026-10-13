import { expect, test, type Page } from "@playwright/test";
import type { createShaderBackground } from "@frapx/fx-canvas";
import type { createPasses } from "../src";

type Win = typeof window & {
  __frapx: {
    createPasses: typeof createPasses;
    createShaderBackground: typeof createShaderBackground;
  };
};

const open = async (page: Page, { floatBlend = true } = {}) => {
  if (!floatBlend) {
    // Force the fallback that sums samples with a second pass.
    await page.addInitScript(() => {
      const original = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (
        this: WebGL2RenderingContext,
        name: string
      ) {
        return name === "EXT_float_blend" ? null : original.call(this, name);
      } as typeof original;
    });
  }
  await page.goto("/?test");
  await page.waitForFunction(() => (window as Win).__frapx !== undefined);
};

// Animated pattern with every channel in use, for comparing runtimes.
const pattern = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(
    0.5 + 0.5 * sin(uv.x * 23.0 + u_time),
    0.5 + 0.5 * cos(uv.y * 17.0 - u_time * 2.0),
    fract(uv.x * uv.y * 9.0 + u_time * 0.1),
    1.0
  );
}
`;

const jittered = pattern
  .replace("uniform float u_time;", "uniform float u_time;\nuniform vec2 u_jitter;")
  .replace("gl_FragCoord.xy / u_resolution", "(gl_FragCoord.xy + u_jitter) / u_resolution");

for (const format of ["rgba8", "rgba16f"] as const) {
  test(`one pass matches fx-canvas with the same shader (${format} output)`, async ({ page }) => {
    await open(page);
    const maxDiff = await page.evaluate(
      async ({ fragment, format }) => {
        const { createPasses, createShaderBackground } = (window as Win).__frapx;
        const options = { clock: "manual" as const, resolution: [96, 64] as const };
        const canvasFx = createShaderBackground({ ...options, fragment });
        const passesFx = createPasses({ ...options, passes: [{ name: "image", fragment, format }] });
        await Promise.all([canvasFx.ready, passesFx.ready]);
        canvasFx.setTime(1.25);
        passesFx.setTime(1.25);
        const a = await canvasFx.captureFrame({ format: "rgba8" });
        const b = await passesFx.captureFrame({ format: "rgba8" });
        canvasFx.destroy();
        passesFx.destroy();
        let max = 0;
        for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
        return max;
      },
      { fragment: pattern, format }
    );
    // Half-float storage can move a value across an 8-bit rounding boundary.
    expect(maxDiff).toBeLessThanOrEqual(format === "rgba8" ? 0 : 1);
  });
}

test("accumulated captures are deterministic", async ({ page }) => {
  await open(page);
  const same = await page.evaluate(async (fragment) => {
    const fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [64, 48],
      accumulation: { samples: 64, shutter: 0.5, fps: 30 },
      passes: [{ name: "image", fragment, accumulate: true, format: "rgba32f" }]
    });
    await fx.ready;
    fx.setTime(2);
    const first = await fx.captureFrame({ format: "rgba16f" });
    fx.setTime(3);
    await fx.captureFrame({ format: "rgba16f" });
    fx.setTime(2);
    const second = await fx.captureFrame({ format: "rgba16f" });
    fx.destroy();
    return first.length === second.length && first.every((value, i) => value === second[i]);
  }, jittered);
  expect(same).toBe(true);
});

for (const floatBlend of [true, false]) {
  test(`the mean of 2048 samples matches double precision (${floatBlend ? "blending" : "add pass"})`, async ({
    page
  }) => {
    await open(page, { floatBlend });
    const result = await page.evaluate(async () => {
      // Sample k writes a value that is exact in float32, so the GPU sum has
      // no input error and any bias comes from accumulation itself.
      const fragment = `#version 300 es
precision highp float;
uniform float u_sampleIndex;
out vec4 fragColor;
void main() {
  float k = u_sampleIndex;
  float v = 0.25 + mod(k * 37.0, 101.0) / 128.0;
  fragColor = vec4(v, v * 0.5, 1.0 - v * 0.25, 1.0);
}
`;
      const samples = 2048;
      const fx = (window as Win).__frapx.createPasses({
        clock: "manual",
        resolution: [8, 8],
        accumulation: { samples },
        passes: [{ name: "image", fragment, accumulate: true, format: "rgba32f" }]
      });
      await fx.ready;
      const pixels = await fx.captureFrame({ format: "rgba16f" });
      fx.destroy();
      let expected = 0;
      for (let k = 0; k < samples; k++) expected += 0.25 + ((k * 37) % 101) / 128;
      expected /= samples;
      return { r: pixels[0]!, g: pixels[1]!, b: pixels[2]!, a: pixels[3]!, expected };
    });
    expect(Math.abs(result.r / result.expected - 1)).toBeLessThan(1e-5);
    expect(Math.abs(result.g / (result.expected * 0.5) - 1)).toBeLessThan(1e-5);
    expect(Math.abs(result.b - (1 - result.expected * 0.25))).toBeLessThan(1e-5);
    expect(result.a).toBe(1);
  });
}

test("samples spread jitter and time over the shutter, and one sample is plain", async ({
  page
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const fragment = `#version 300 es
precision highp float;
uniform vec2 u_jitter;
uniform float u_time;
uniform float u_frameTime;
uniform float u_sampleCount;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_jitter, u_time - u_frameTime, u_sampleCount);
}
`;
    const fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [4, 4],
      accumulation: { samples: 1, shutter: 0.5, fps: 10 },
      passes: [{ name: "image", fragment, accumulate: true, format: "rgba32f" }]
    });
    await fx.ready;
    fx.setTime(4);
    const single = Array.from((await fx.captureFrame({ format: "rgba16f" })).subarray(0, 4));
    fx.setAccumulation({ samples: 256 });
    const many = Array.from((await fx.captureFrame({ format: "rgba16f" })).subarray(0, 4));
    fx.destroy();
    return { single, many };
  });
  expect(result.single).toEqual([0, 0, 0, 1]);
  // The means of the R3 sequence the samples follow (see src/internal/sampling.ts).
  const phi = 1.2207440846057596;
  const fract = (value: number) => value - Math.floor(value);
  const mean = [0, 0, 0];
  for (let k = 0; k < 256; k++) {
    mean[0]! += fract(0.5 + k / phi) - 0.5;
    mean[1]! += fract(0.5 + k / phi ** 2) - 0.5;
    mean[2]! += fract(fract(0.5 + k / phi ** 3) + 0.5) * (0.5 / 10);
  }
  expect(result.many[0]!).toBeCloseTo(mean[0]! / 256, 5);
  expect(result.many[1]!).toBeCloseTo(mean[1]! / 256, 5);
  expect(result.many[2]!).toBeCloseTo(mean[2]! / 256, 5);
  expect(result.many[3]).toBe(256);
});

test("a pass reading itself adds 1/1024 a frame and reaches 1.0 after 1024 frames", async ({
  page
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const fragment = `#version 300 es
precision highp float;
uniform sampler2D u_count;
out vec4 fragColor;
void main() {
  fragColor = texelFetch(u_count, ivec2(gl_FragCoord.xy), 0) + vec4(1.0 / 1024.0);
}
`;
    const fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [4, 4],
      passes: [{ name: "count", fragment, inputs: ["count"], format: "rgba32f" }]
    });
    await fx.ready;
    for (let frame = 1; frame < 1024; frame++) {
      fx.setTime(frame / 60);
      fx.render();
    }
    // Drawing the same time again redraws the frame without advancing.
    fx.render();
    fx.setTime(1024 / 60);
    const value = (await fx.captureFrame({ format: "rgba16f" }))[0];
    fx.resetFeedback();
    fx.setTime(2000);
    const afterReset = (await fx.captureFrame({ format: "rgba16f" }))[0];
    fx.destroy();
    return { value, afterReset };
  });
  expect(result.value).toBe(1);
  expect(result.afterReset).toBeCloseTo(1 / 1024, 7);
});

test("passes read earlier outputs from this frame, at their own scale", async ({ page }) => {
  await open(page);
  const pixel = await page.evaluate(async () => {
    const fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [64, 32],
      passes: [
        {
          name: "base",
          format: "rgba32f",
          fragment: `#version 300 es
precision highp float;
uniform float u_level;
out vec4 fragColor;
void main() { fragColor = vec4(u_level); }
`
        },
        {
          name: "half",
          format: "rgba32f",
          scale: 0.5,
          inputs: ["base"],
          fragment: `#version 300 es
precision highp float;
uniform sampler2D u_base;
uniform vec2 u_baseSize;
uniform vec2 u_resolution;
out vec4 fragColor;
void main() {
  fragColor = vec4(texture(u_base, vec2(0.5)).r * 2.0, u_resolution.x, u_baseSize.x, 1.0);
}
`
        },
        {
          name: "final",
          format: "rgba32f",
          inputs: ["half"],
          fragment: `
precision highp float;
uniform sampler2D u_half;
uniform vec2 u_halfSize;
void main() { gl_FragColor = vec4(texture2D(u_half, vec2(0.5)).rgb, u_halfSize.y); }
`
        }
      ],
      uniforms: { level: 0.25 }
    });
    await fx.ready;
    const data = await fx.captureFrame({ format: "rgba16f" });
    fx.destroy();
    return Array.from(data.subarray(0, 4));
  });
  expect(pixel).toEqual([0.5, 32, 64, 16]);
});

test("refines a still frame progressively and restarts when an input changes", async ({
  page
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const fragment = `#version 300 es
precision highp float;
uniform float u_level;
out vec4 fragColor;
void main() { fragColor = vec4(u_level); }
`;
    const progress: number[] = [];
    const fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [8, 8],
      accumulation: { samples: 6 },
      passes: [{ name: "image", fragment, accumulate: true }],
      uniforms: { level: 0.5 },
      onSample: ({ drawn, capturing }) => {
        if (!capturing) progress.push(drawn);
      }
    });
    await fx.ready;
    fx.render();
    const settle = () =>
      new Promise<void>((resolve) => {
        const check = () => (fx.samplesDrawn >= 6 ? resolve() : requestAnimationFrame(check));
        check();
      });
    await settle();
    const first = [...progress];
    progress.length = 0;
    fx.setUniform("level", 0.75);
    await settle();
    const second = [...progress];
    const value = (await fx.captureFrame({ format: "rgba16f" }))[0];
    fx.destroy();
    return { first, second, value };
  });
  expect(result.first).toEqual([1, 2, 3, 4, 5, 6]);
  expect(result.second).toEqual([1, 2, 3, 4, 5, 6]);
  expect(result.value).toBe(0.75);
});

test("an aborted capture stops between samples", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const controller = new AbortController();
    let drawn = 0;
    const fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [8, 8],
      accumulation: { samples: 50 },
      passes: [
        {
          name: "image",
          accumulate: true,
          fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }
`
        }
      ],
      onSample: (progress) => {
        drawn = progress.drawn;
        if (progress.drawn === 3) controller.abort(new Error("stop"));
      }
    });
    await fx.ready;
    const message = await fx
      .captureFrame({ format: "rgba8", signal: controller.signal })
      .then(() => "resolved", (error: Error) => error.message);
    const drawnWhenAborted = drawn;
    // The instance keeps working after an aborted capture.
    const after = (await fx.captureFrame({ format: "rgba8" }))[0];
    fx.destroy();
    return { message, drawnWhenAborted, after };
  });
  expect(result.message).toBe("stop");
  expect(result.drawnWhenAborted).toBe(3);
  expect(result.after).toBe(255);
});

test("is unsupported without WebGL2", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      return type === "webgl2" ? null : original.call(this, type as "2d", ...(rest as []));
    } as typeof original;
  });
  await open(page);
  const result = await page.evaluate(async () => {
    const fx = (window as Win).__frapx.createPasses({
      resolution: [8, 8],
      passes: [{ name: "image", fragment: "void main() { gl_FragColor = vec4(1.0); }" }]
    });
    const error = await fx.ready.then(() => null, (reason: Error) => reason.name);
    return { status: fx.status, error };
  });
  expect(result).toEqual({ status: "unsupported", error: "UnsupportedError" });
});

test("rejects invalid pass lists before creating anything", async ({ page }) => {
  await open(page);
  const message = await page.evaluate(() => {
    try {
      (window as Win).__frapx.createPasses({
        resolution: [8, 8],
        passes: [
          { name: "post", fragment: "void main() {}" },
          { name: "scene", fragment: "void main() {}", accumulate: true }
        ]
      });
      return "created";
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(message).toContain("must come before every pass that does not accumulate");
});

const sampleIndexShader = `#version 300 es
precision highp float;
uniform float u_sampleIndex;
uniform float u_level;
out vec4 fragColor;
void main() { fragColor = vec4(u_sampleIndex, u_level, 0.0, 1.0); }
`;

test("a capture starts over instead of adding to a partial preview", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (fragment) => {
    const fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [4, 4],
      accumulation: { samples: 4 },
      passes: [{ name: "image", fragment, accumulate: true, format: "rgba32f" }],
      uniforms: { level: 0 }
    });
    await fx.ready;
    fx.setTime(1);
    fx.render();
    const preview = fx.samplesDrawn;
    const captured = (await fx.captureFrame({ format: "rgba16f" }))[0];
    fx.destroy();
    return { preview, captured };
  }, sampleIndexShader);
  expect(result.preview).toBe(1);
  // Mean of sample indices 0..3.
  expect(result.captured).toBe(1.5);
});

test("keeps the inputs of a capture fixed and applies changes afterwards", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (fragment) => {
    let fx: ReturnType<Win["__frapx"]["createPasses"]>;
    fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [4, 4],
      accumulation: { samples: 8 },
      passes: [{ name: "image", fragment, accumulate: true, format: "rgba32f" }],
      uniforms: { level: 0.25 },
      onSample: ({ drawn, capturing }) => {
        if (capturing && drawn === 2) {
          fx.setUniform("level", 0.75);
          fx.setAccumulation({ samples: 2 });
        }
      }
    });
    await fx.ready;
    const during = Array.from((await fx.captureFrame({ format: "rgba16f" })).subarray(0, 2));
    const after = Array.from((await fx.captureFrame({ format: "rgba16f" })).subarray(0, 2));
    fx.destroy();
    return { during, after };
  }, sampleIndexShader);
  expect(result.during).toEqual([3.5, 0.25]);
  expect(result.after).toEqual([0.5, 0.75]);
});

test("refines in demand mode", async ({ page }) => {
  await open(page);
  const drawn = await page.evaluate(async (fragment) => {
    const fx = (window as Win).__frapx.createPasses({
      renderMode: "demand",
      resolution: [4, 4],
      accumulation: { samples: 5 },
      passes: [{ name: "image", fragment, accumulate: true }],
      uniforms: { level: 0 }
    });
    await fx.ready;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const value = fx.samplesDrawn;
    fx.destroy();
    return value;
  }, sampleIndexShader);
  expect(drawn).toBe(5);
});

test("refinement finishes a frame whose capture was aborted", async ({ page }) => {
  await open(page);
  const drawn = await page.evaluate(async (fragment) => {
    const controller = new AbortController();
    const fx = (window as Win).__frapx.createPasses({
      clock: "manual",
      resolution: [4, 4],
      accumulation: { samples: 6 },
      passes: [{ name: "image", fragment, accumulate: true }],
      uniforms: { level: 0 },
      onSample: ({ drawn, capturing }) => {
        if (capturing && drawn === 2) controller.abort();
      }
    });
    await fx.ready;
    fx.render();
    await fx.captureFrame({ signal: controller.signal }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const value = fx.samplesDrawn;
    fx.destroy();
    return value;
  }, sampleIndexShader);
  expect(drawn).toBe(6);
});
