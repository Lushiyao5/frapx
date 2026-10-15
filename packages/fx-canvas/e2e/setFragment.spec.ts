import { expect, test, type Page } from "@playwright/test";

type Instance = {
  ready: Promise<void>;
  status: string;
  gl: WebGLRenderingContext | WebGL2RenderingContext | null;
  canvas: HTMLCanvasElement | null;
  setTime(seconds: number): void;
  render(): void;
  setFragment(fragment: string): (Error & { stage: string | null; lines: Array<{ line: number; source: string }> }) | null;
};

type Win = typeof window & { __frapxShader?: Instance };

// Red is the time's fractional part, so a swap that kept the clock shows it.
const timeAsRed = `precision mediump float;
uniform float u_time;
void main() {
  gl_FragColor = vec4(fract(u_time), 0.0, 1.0, 1.0);
}
`;

const open = async (page: Page, query = "") => {
  await page.goto(`/?clock=manual&res=32x18${query}`);
  await page.evaluate(async () => {
    await (window as Win).__frapxShader!.ready;
  });
};

// Draws and reads the centre pixel in the same task.
const renderPixel = (page: Page) =>
  page.evaluate(() => {
    const fx = (window as Win).__frapxShader!;
    fx.render();
    const scratch = document.createElement("canvas");
    scratch.width = fx.canvas!.width;
    scratch.height = fx.canvas!.height;
    const context = scratch.getContext("2d")!;
    context.drawImage(fx.canvas!, 0, 0);
    return Array.from(context.getImageData(16, 9, 1, 1).data);
  });

test("swaps the fragment shader and keeps the time", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as Win).__frapxShader!.setTime(0.25));
  const before = await renderPixel(page);

  const error = await page.evaluate(
    (fragment) => (window as Win).__frapxShader!.setFragment(fragment),
    timeAsRed
  );
  expect(error).toBeNull();
  const after = await renderPixel(page);
  expect(after).not.toEqual(before);
  expect(after[0]).toBeGreaterThanOrEqual(63);
  expect(after[0]).toBeLessThanOrEqual(65);
  expect(after.slice(1)).toEqual([0, 255, 255]);
});

test("keeps drawing the previous shader and reports located errors on a compile failure", async ({
  page
}) => {
  await open(page);
  await page.evaluate((fragment) => (window as Win).__frapxShader!.setFragment(fragment), timeAsRed);
  await page.evaluate(() => (window as Win).__frapxShader!.setTime(0.5));
  const working = await renderPixel(page);

  const broken = timeAsRed.replace("fract(u_time)", "fract(u_tiem)");
  const error = await page.evaluate((fragment) => {
    const result = (window as Win).__frapxShader!.setFragment(fragment);
    return result && { name: result.name, stage: result.stage, lines: result.lines };
  }, broken);

  expect(error).toMatchObject({ name: "ShaderCompileError", stage: "fragment" });
  expect(error!.lines[0]).toMatchObject({
    line: 4,
    source: "  gl_FragColor = vec4(fract(u_tiem), 0.0, 1.0, 1.0);"
  });
  expect(await renderPixel(page)).toEqual(working);
});

test("refuses GLSL ES 3.00 on an instance running on WebGL1", async ({ page }) => {
  await open(page);
  const message = await page.evaluate(() => {
    const result = (window as Win).__frapxShader!.setFragment(
      "#version 300 es\nprecision mediump float;\nout vec4 color;\nvoid main() { color = vec4(1.0); }\n"
    );
    return result?.message ?? null;
  });
  expect(message).toContain("needs WebGL2");
});

test("swaps to GLSL ES 3.00 on a WebGL2 instance", async ({ page }) => {
  await open(page, "&webgl2=1");
  const error = await page.evaluate(() =>
    (window as Win).__frapxShader!.setFragment(
      "#version 300 es\nprecision mediump float;\nout vec4 color;\nvoid main() { color = vec4(0.0, 1.0, 0.0, 1.0); }\n"
    )
  );
  expect(error).toBeNull();
  expect(await renderPixel(page)).toEqual([0, 255, 0, 255]);
});

test("keeps the feedback history across a swap", async ({ page }) => {
  await open(page, "&feedback=rgba8");
  await page.evaluate(() =>
    (window as Win).__frapxShader!.setFragment(
      "precision mediump float;\nvoid main() { gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0); }\n"
    )
  );
  expect(await renderPixel(page)).toEqual([0, 0, 255, 255]);

  // Passes the previous frame through: blue only if the history survived.
  const error = await page.evaluate(() =>
    (window as Win).__frapxShader!.setFragment(
      "precision mediump float;\nuniform sampler2D u_previousFrame;\nuniform vec2 u_resolution;\nvoid main() { gl_FragColor = texture2D(u_previousFrame, gl_FragCoord.xy / u_resolution); }\n"
    )
  );
  expect(error).toBeNull();
  expect(await renderPixel(page)).toEqual([0, 0, 255, 255]);
});

const green100 = "precision mediump float;\nvoid main() { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); }\n";

// Loses the context, runs `during` while it is lost, then restores it.
const loseAndRestore = async (page: Page, during: string | null) => {
  await page.evaluate(async (fragment) => {
    const fx = (window as Win).__frapxShader!;
    const extension = fx.gl!.getExtension("WEBGL_lose_context")!;
    const canvas = fx.canvas!;
    await new Promise<void>((resolve) => {
      canvas.addEventListener("webglcontextlost", () => resolve(), { once: true });
      extension.loseContext();
    });
    if (fragment !== null) (window as unknown as { swapResult: unknown }).swapResult = fx.setFragment(fragment);
    // Restoring is allowed only once the lost event has finished dispatching.
    await new Promise((resolve) => setTimeout(resolve, 0));
    extension.restoreContext();
  }, during);
  await page.waitForFunction(() => {
    const status = (window as Win).__frapxShader!.status;
    return status !== "context-lost" && status !== "loading";
  });
};

test("a WebGL2 instance swapped to GLSL ES 1.00 survives a context restore", async ({ page }) => {
  await open(page, "&webgl2=1");
  expect(await page.evaluate((fragment) => (window as Win).__frapxShader!.setFragment(fragment), green100)).toBeNull();
  await loseAndRestore(page, null);
  expect(await page.evaluate(() => (window as Win).__frapxShader!.status)).not.toBe("error");
  expect(await renderPixel(page)).toEqual([0, 255, 0, 255]);
});

test("a broken shader swapped in during a context loss falls back to the last working one", async ({
  page
}) => {
  await open(page);
  await page.evaluate((fragment) => (window as Win).__frapxShader!.setFragment(fragment), green100);
  await loseAndRestore(page, green100.replace("gl_FragColor", "gl_FragColour"));
  expect(await page.evaluate(() => (window as unknown as { swapResult: unknown }).swapResult)).toBeNull();
  expect(await page.evaluate(() => (window as Win).__frapxShader!.status)).not.toBe("error");
  expect(await renderPixel(page)).toEqual([0, 255, 0, 255]);
});
