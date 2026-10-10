import { expect, test, type Page } from "@playwright/test";

type Instance = {
  status: string;
  canvas: HTMLCanvasElement | null;
  ready: Promise<void>;
  feedbackFormat: "rgba8" | "rgba16f" | null;
  render(): void;
  setTime(seconds: number): void;
  captureFrame(options?: { format?: string }): Promise<Blob | Uint8Array | Float32Array>;
};

type Win = typeof window & { __frapxShader?: Instance };

const waitReady = (page: Page) =>
  page.evaluate(async () => {
    await (window as Win).__frapxShader!.ready;
  });

// Returns [r, g, b, a] at the four corners, top-left first, clockwise.
const captureCorners = (page: Page) =>
  page.evaluate(async () => {
    const fx = (window as Win).__frapxShader!;
    const width = fx.canvas!.width;
    const height = fx.canvas!.height;
    const data = (await fx.captureFrame({ format: "rgba8" })) as Uint8Array;
    const at = (x: number, y: number) =>
      Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
    return [at(0, 0), at(width - 1, 0), at(width - 1, height - 1), at(0, height - 1)];
  });

// PNG stores width/height big-endian at bytes 16..24 of the IHDR chunk.
const pngInfo = (page: Page) =>
  page.evaluate(async () => {
    const blob = (await (window as Win).__frapxShader!.captureFrame()) as Blob;
    const view = new DataView(await blob.arrayBuffer());
    const bitmap = await createImageBitmap(blob);
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const context = scratch.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return {
      type: blob.type,
      width: view.getUint32(16),
      height: view.getUint32(20),
      topLeft: Array.from(context.getImageData(0, 0, 1, 1).data)
    };
  });

const near = (actual: number[], expected: number[], tolerance = 2) =>
  actual.every((value, index) => Math.abs(value - expected[index]!) <= tolerance);

for (const floatFeedback of [false, true]) {
  test(`captures rgba8 top row first (${floatFeedback ? "rgba16f feedback" : "no feedback"})`, async ({
    page
  }) => {
    // rgba16f feedback upgrades a GLSL ES 1.00 shader to a WebGL2 context and
    // reaches the canvas through the blit copy.
    await page.goto(
      `/?clock=manual&res=256x128&scene=gradient${floatFeedback ? "&feedback=rgba16f" : ""}`
    );
    await waitReady(page);

    const [topLeft, topRight, bottomRight, bottomLeft] = await captureCorners(page);
    // vec4(uv, 0, 1): x grows right, y grows up.
    expect(near(topLeft!, [0, 255, 0, 255])).toBe(true);
    expect(near(topRight!, [255, 255, 0, 255])).toBe(true);
    expect(near(bottomRight!, [255, 0, 0, 255])).toBe(true);
    expect(near(bottomLeft!, [0, 0, 0, 255])).toBe(true);
  });
}

test("captures a PNG at the fixed resolution without flipping", async ({ page }) => {
  await page.goto("/?clock=manual&res=256x128&scene=gradient");
  await waitReady(page);

  const info = await pngInfo(page);
  expect(info).toMatchObject({ type: "image/png", width: 256, height: 128 });
  expect(near(info.topLeft, [0, 255, 0, 255])).toBe(true);
});

test("captures a 4K PNG while the page shows a smaller canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?clock=manual&res=3840x2160&scene=gradient");
  await waitReady(page);

  const info = await pngInfo(page);
  expect(info).toMatchObject({ width: 3840, height: 2160 });
});

test("keeps the capture size when the viewport changes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?clock=manual&res=640x360");
  await waitReady(page);
  await page.setViewportSize({ width: 500, height: 900 });

  const length = await page.evaluate(async () => {
    const data = await (window as Win).__frapxShader!.captureFrame({ format: "rgba8" });
    return (data as Uint8Array).length;
  });
  expect(length).toBe(640 * 360 * 4);
});

test("captures while the tab is hidden under a realtime clock", async ({ page }) => {
  await page.goto("/?res=64x64&scene=gradient");
  await waitReady(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  const [topLeft] = await captureCorners(page);
  expect(near(topLeft!, [0, 255, 0, 255], 6)).toBe(true);
});

// Spec A4: 1024 additions of 1/1024 reach 1.0 in half float but not in 8 bits.
const accumulate = (page: Page, format: "rgba8" | "rgba16f") =>
  page.evaluate(async (captureFormat) => {
    const fx = (window as Win).__frapxShader!;
    for (let i = 0; i < 1023; i++) fx.render();
    // captureFrame draws the 1024th frame itself.
    const data = (await fx.captureFrame({ format: captureFormat })) as
      | Uint8Array
      | Float32Array;
    return Array.from(data.subarray(0, 4));
  }, format);

test("accumulates to 1.0 in an rgba16f feedback buffer", async ({ page }) => {
  await page.goto("/?clock=manual&res=16x16&scene=accumulate&feedback=rgba16f&strict=1");
  await waitReady(page);
  expect(await page.evaluate(() => (window as Win).__frapxShader!.feedbackFormat)).toBe(
    "rgba16f"
  );

  const pixel = await accumulate(page, "rgba16f");
  for (const channel of pixel) expect(channel).toBeCloseTo(1, 3);
});

test("does not accumulate small steps in an rgba8 feedback buffer", async ({ page }) => {
  await page.goto("/?clock=manual&res=16x16&scene=accumulate&feedback=rgba8");
  await waitReady(page);

  const pixel = await accumulate(page, "rgba8");
  expect(pixel).toEqual([0, 0, 0, 0]);
});

const hideColorBufferFloat = () => {
  const original = WebGL2RenderingContext.prototype.getExtension;
  WebGL2RenderingContext.prototype.getExtension = function (
    this: WebGL2RenderingContext,
    name: string
  ) {
    return name === "EXT_color_buffer_float" ? null : original.call(this, name);
  } as typeof original;
};

test("falls back to rgba8 with a warning when float buffers are missing", async ({
  page
}) => {
  await page.addInitScript(hideColorBufferFloat);
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });

  await page.goto("/?clock=manual&res=16x16&scene=accumulate&feedback=rgba16f");
  await waitReady(page);

  expect(await page.evaluate(() => (window as Win).__frapxShader!.feedbackFormat)).toBe(
    "rgba8"
  );
  expect(warnings.some((text) => text.includes("Falling back to rgba8"))).toBe(true);
  await expect(
    page.evaluate(() => (window as Win).__frapxShader!.captureFrame({ format: "rgba16f" }))
  ).rejects.toThrow(/rgba16f capture needs a float render target/);
});

test("fails as unsupported in strict mode when float buffers are missing", async ({
  page
}) => {
  await page.addInitScript(hideColorBufferFloat);
  await page.goto("/?clock=manual&res=16x16&scene=accumulate&feedback=rgba16f&strict=1");

  await expect
    .poll(() => page.evaluate(() => (window as Win).__frapxShader!.status))
    .toBe("unsupported");
});
