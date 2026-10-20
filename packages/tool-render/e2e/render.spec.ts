import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { ShaderBackgroundInstance } from "@frapx/fx-canvas";
import { render } from "../src/render";
import { serveDirectory } from "../src/server";
import type { StaticServer } from "../src/server";
import type { RenderEvent, RenderOptions } from "../src/types";

const dist = fileURLToPath(new URL("../../../examples/vite-capture/dist", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures", import.meta.url));

// CI renders on SwiftShader; the GPU check is covered by allowSoftware.
const options = (source: string, out: string, overrides: Partial<RenderOptions> = {}): RenderOptions => ({
  source,
  out,
  format: "png",
  params: {},
  resume: false,
  encode: [],
  browser: "chromium",
  headed: false,
  allowSoftware: true,
  timeout: 30,
  ...overrides
});

const renderCollecting = async (renderOptions: RenderOptions) => {
  const events: RenderEvent[] = [];
  const result = await render(renderOptions, { onEvent: (event) => events.push(event) });
  return { result, events };
};

const tempDir = () => mkdtemp(join(tmpdir(), "frapx-render-e2e-"));
const frameFiles = async (out: string) =>
  (await readdir(out)).filter((name) => name.startsWith("frame_")).sort();

type Win = typeof window & { __frapxCapture?: { readonly fx: ShaderBackgroundInstance } };

let fixtureServer: StaticServer;
test.beforeAll(async () => {
  fixtureServer = await serveDirectory(fixtures);
});
test.afterAll(() => fixtureServer.close());

test("renders a directory into PNGs that match captures made in the page", async ({ page }) => {
  const out = await tempDir();
  const { result, events } = await renderCollecting(
    options(dist, out, { range: [3, 5], resolution: [96, 54] })
  );

  expect(result).toMatchObject({ out, range: [3, 5], rendered: 3, videos: [] });
  expect(events[0]).toMatchObject({ type: "start", fps: 30, range: [3, 5], pending: 3 });
  expect(await frameFiles(out)).toEqual(["frame_00003.png", "frame_00004.png", "frame_00005.png"]);
  expect(JSON.parse(await readFile(join(out, "frapx-render.json"), "utf8"))).toMatchObject({
    tool: "@frapx/tool-render",
    source: dist,
    fps: 30,
    format: "png",
    resolution: [96, 54],
    range: [3, 5]
  });

  const server = await serveDirectory(dist);
  try {
    await page.goto(`${server.url}?res=96x54`);
    const direct = await page.evaluate(async () => {
      const { fx } = (window as Win).__frapxCapture!;
      await fx.ready;
      const frames: number[][] = [];
      for (const frame of [3, 4, 5]) {
        fx.setTime(frame / 30);
        const png = (await fx.captureFrame({ format: "png" })) as Blob;
        frames.push(Array.from(new Uint8Array(await png.arrayBuffer())));
      }
      return frames;
    });
    for (const [index, frame] of [3, 4, 5].entries()) {
      const file = await readFile(join(out, `frame_0000${frame}.png`));
      expect(file.equals(Buffer.from(direct[index]!))).toBe(true);
    }
  } finally {
    await server.close();
  }
});

test("prepare() switches the page to a float buffer for 16-bit frames", async () => {
  const out = await tempDir();
  await render(options(dist, out, { range: [0, 0], resolution: [32, 18], format: "png16" }));
  const png = await readFile(join(out, "frame_00000.png"));
  // IHDR: width, height, bit depth 16, color type 6 (RGBA).
  expect([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]]).toEqual([32, 18, 16, 6]);
});

test("resumes only the missing frames, and only with the same settings", async () => {
  const out = await tempDir();
  const base = options(dist, out, { range: [0, 3], resolution: [48, 27], params: { note: "a" } });
  await render(base);
  await rm(join(out, "frame_00001.png"));
  const kept = (await stat(join(out, "frame_00002.png"))).mtimeMs;

  await expect(render(base)).rejects.toThrow("Pass --resume");

  const { events } = await renderCollecting({ ...base, range: [0, 4], resume: true });
  expect(events[0]).toMatchObject({ type: "start", range: [0, 4], pending: 2 });
  expect(events.filter((event) => event.type === "frame").map((event) => event.frame)).toEqual([1, 4]);
  expect((await stat(join(out, "frame_00002.png"))).mtimeMs).toBe(kept);
  expect(JSON.parse(await readFile(join(out, "frapx-render.json"), "utf8")).range).toEqual([0, 4]);

  await expect(render({ ...base, resume: true, params: { note: "b" } })).rejects.toThrow(
    'params: {"note":"a"} → {"note":"b"}'
  );
});

test("opens the page again after a lost context, and gives up when it keeps failing", async () => {
  const out = await tempDir();
  const events: RenderEvent[] = [];
  await expect(
    render(options(`${fixtureServer.url}lose-context/`, out), { onEvent: (event) => events.push(event) })
  ).rejects.toThrow("Gave up after 3 failures in a row; last: the WebGL context was lost");

  expect(events.filter((event) => event.type === "retry")).toEqual([
    { type: "retry", reason: "the WebGL context was lost", attempt: 1 },
    { type: "retry", reason: "the WebGL context was lost", attempt: 2 }
  ]);
  // Frame 1 was written right before the loss each time, so it is not trusted.
  expect(await frameFiles(out)).toEqual(["frame_00000.png"]);
});

test("stops when the page reloads during the render", async () => {
  const out = await tempDir();
  await expect(render(options(`${fixtureServer.url}reload/`, out))).rejects.toThrow(
    "The page reloaded or navigated during the render"
  );
  expect(await frameFiles(out)).toEqual(["frame_00000.png", "frame_00001.png"]);
});

test("keeps rendering through same-document navigation", async () => {
  const out = await tempDir();
  const { result } = await renderCollecting(options(`${fixtureServer.url}push-state/`, out, { range: [0, 3] }));
  expect(result.rendered).toBe(4);
});

test("stops when the page's render() writes nothing", async () => {
  const out = await tempDir();
  await expect(render(options(`${fixtureServer.url}no-frames/`, out))).rejects.toThrow(
    "The page's render() finished without writing frame 0."
  );
});

test("reports a page that never registers", async () => {
  const out = await tempDir();
  await expect(
    render(options(`${fixtureServer.url}unregistered/`, out, { timeout: 1 }))
  ).rejects.toThrow("did not call registerRenderTarget() from @frapx/tool-capture within 1s");
});

test("renders at the page's declared resolution unless --resolution overrides it", async () => {
  const out = await tempDir();
  const source = `${fixtureServer.url}declared-size/`;
  const { events } = await renderCollecting(options(source, out));
  expect(events[0]).toMatchObject({ type: "start", resolution: [24, 16], range: [0, 2] });
  expect(JSON.parse(await readFile(join(out, "frapx-render.json"), "utf8")).resolution).toEqual([24, 16]);

  // Resuming without the flag matches the declared size it recorded.
  await rm(join(out, "frame_00001.png"));
  const resumed = await renderCollecting(options(source, out, { resume: true }));
  expect(resumed.events[0]).toMatchObject({ type: "start", resolution: [24, 16], pending: 1 });

  const overridden = await tempDir();
  const { events: overriddenEvents } = await renderCollecting(
    options(source, overridden, { resolution: [8, 6] })
  );
  expect(overriddenEvents[0]).toMatchObject({ type: "start", resolution: [8, 6] });
  expect(JSON.parse(await readFile(join(overridden, "frapx-render.json"), "utf8")).resolution).toEqual([8, 6]);
});
