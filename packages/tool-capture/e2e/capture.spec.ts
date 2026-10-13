import { expect, test, type Page } from "@playwright/test";
import type { ShaderBackgroundInstance } from "@frapx/fx-canvas";
import type { captureSequence, createZipSink } from "../src/index";
import { decodePng16, readZip } from "../test/helpers";

// Runs against examples/vite-capture, which exposes its live instance.
type Win = typeof window & {
  __frapxCapture?: {
    readonly fx: ShaderBackgroundInstance;
    captureSequence: typeof captureSequence;
    createZipSink: typeof createZipSink;
  };
};

const waitReady = (page: Page) =>
  page.evaluate(async () => {
    await (window as Win).__frapxCapture!.fx.ready;
  });

test("writes a PNG sequence into a ZIP that matches direct captures", async ({ page }) => {
  await page.goto("/?res=96x54");
  await waitReady(page);

  const result = await page.evaluate(async () => {
    const { fx, captureSequence, createZipSink } = (window as Win).__frapxCapture!;
    const bytes = async (blob: Blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));

    fx.setClock("realtime");
    const zip = await captureSequence(fx, {
      sink: createZipSink(),
      fps: 10,
      frameCount: 3,
      startFrame: 4
    });
    const clockAfter = fx.clock;

    fx.setClock("manual");
    const direct: number[][] = [];
    for (const frame of [4, 5, 6]) {
      fx.setTime(frame / 10);
      direct.push(await bytes(await fx.captureFrame({ format: "png" })));
    }
    return { zip: await bytes(zip), zipType: zip.type, direct, clockAfter };
  });

  expect(result.zipType).toBe("application/zip");
  expect(result.clockAfter).toBe("realtime");
  const { entries } = readZip(new Uint8Array(result.zip));
  expect(entries.map((entry) => entry.name)).toEqual([
    "frame_00004.png",
    "frame_00005.png",
    "frame_00006.png"
  ]);
  entries.forEach((entry, index) => {
    expect(Buffer.from(entry.data).equals(Buffer.from(result.direct[index]!))).toBe(true);
  });
  // The scene animates, so consecutive frames must differ.
  expect(Buffer.from(entries[0]!.data).equals(Buffer.from(entries[1]!.data))).toBe(false);
});

test("writes 16-bit PNGs that hold the float buffer values", async ({ page }) => {
  await page.goto("/?res=64x36&format=png16");
  await waitReady(page);

  const result = await page.evaluate(async () => {
    const { fx, captureSequence, createZipSink } = (window as Win).__frapxCapture!;
    const zip = await captureSequence(fx, {
      sink: createZipSink(),
      fps: 10,
      frameCount: 1,
      startFrame: 3,
      format: "png16"
    });

    fx.setTime(0.3);
    const floats = await fx.captureFrame({ format: "rgba16f" });

    // The browser must decode the file too; it reduces it to 8 bits.
    const zipBytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(zipBytes.buffer);
    const start = 30 + view.getUint16(26, true);
    const png = new Blob([zipBytes.subarray(start, start + view.getUint32(18, true))], {
      type: "image/png"
    });
    const bitmap = await createImageBitmap(png);
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const context = scratch.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);

    return {
      feedbackFormat: fx.feedbackFormat,
      zip: Array.from(zipBytes),
      floats: Array.from(floats as Float32Array),
      decoded8: Array.from(context.getImageData(0, 0, bitmap.width, bitmap.height).data)
    };
  });

  expect(result.feedbackFormat).toBe("rgba16f");
  const [entry] = readZip(new Uint8Array(result.zip)).entries;
  expect(entry!.name).toBe("frame_00003.png");
  const png = decodePng16(entry!.data);
  expect(png).toMatchObject({ width: 64, height: 36, bitDepth: 16, colorType: 6 });

  const expected = result.floats.map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 65535));
  expect(Array.from(png.samples)).toEqual(expected);
  // Real 16-bit data, not 8-bit values scaled up (those are multiples of 257).
  expect(expected.filter((v) => v % 257 !== 0).length).toBeGreaterThan(expected.length / 4);

  result.decoded8.forEach((value, index) => {
    expect(Math.abs(value - expected[index]! / 257)).toBeLessThanOrEqual(1);
  });
});
