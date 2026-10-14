import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANIFEST,
  compareSettings,
  contiguousRuns,
  frameFileName,
  openOutput,
  parseFrameFileName,
  planFrames,
  writeFrame,
  writeManifest
} from "../src/output";
import type { Manifest, RenderSettings } from "../src/output";

const settings: RenderSettings = {
  source: "/work/dist",
  fps: 30,
  format: "png",
  resolution: [3840, 2160],
  params: { spp: "192", mode: "path" }
};
const manifest: Manifest = { tool: "@frapx/tool-render", version: 1, ...settings, range: [0, 9] };
const temp = () => mkdtemp(join(tmpdir(), "frapx-render-"));

describe("frame names", () => {
  it("round-trips, padding to five digits like tool-capture", () => {
    expect(frameFileName(7)).toBe("frame_00007.png");
    expect(frameFileName(123456)).toBe("frame_123456.png");
    expect(parseFrameFileName("frame_00007.png")).toBe(7);
    expect(parseFrameFileName(".frame_00007.png.tmp")).toBeNull();
    expect(parseFrameFileName("frame_7.jpg")).toBeNull();
  });
});

describe("compareSettings", () => {
  it("ignores parameter order and reports each difference", () => {
    expect(compareSettings(settings, { ...settings, params: { mode: "path", spp: "192" } })).toEqual([]);
    expect(
      compareSettings(settings, { ...settings, fps: 24, resolution: null, params: { spp: "64" } })
    ).toEqual([
      "fps: 30 → 24",
      "resolution: [3840,2160] → null",
      'params: {"mode":"path","spp":"192"} → {"spp":"64"}'
    ]);
  });
});

describe("planFrames", () => {
  const state = (frames: number[], saved: Manifest | null = manifest) => ({
    manifest: saved,
    frames: new Set(frames)
  });

  it("renders everything into an empty directory", () => {
    expect(planFrames(state([], null), settings, [2, 4], false, "out")).toEqual([2, 3, 4]);
  });

  it("refuses a directory with frames or a manifest unless resuming", () => {
    expect(() => planFrames(state([1], null), settings, [0, 3], false, "out")).toThrow("--resume");
    expect(() => planFrames(state([]), settings, [0, 3], false, "out")).toThrow("--resume");
  });

  it("resumes the missing frames, including gaps, when the settings match", () => {
    expect(planFrames(state([0, 1, 3, 9]), settings, [0, 5], true, "out")).toEqual([2, 4, 5]);
  });

  it("refuses to resume with different settings or without a manifest", () => {
    expect(() =>
      planFrames(state([0]), { ...settings, format: "png16" }, [0, 5], true, "out")
    ).toThrow('format: "png" → "png16"');
    expect(() => planFrames(state([0], null), settings, [0, 5], true, "out")).toThrow(MANIFEST);
  });

  it("resumes into an empty directory as a fresh render", () => {
    expect(planFrames(state([], null), settings, [0, 1], true, "out")).toEqual([0, 1]);
  });
});

describe("contiguousRuns", () => {
  it("splits sorted frames into runs", () => {
    expect(contiguousRuns([2, 4, 5, 6, 9])).toEqual([
      [2, 1],
      [4, 3],
      [9, 1]
    ]);
    expect(contiguousRuns([])).toEqual([]);
  });
});

describe("openOutput / writeFrame / writeManifest", () => {
  it("creates the directory and round-trips the manifest", async () => {
    const out = join(await temp(), "nested", "frames");
    expect(await openOutput(out)).toEqual({ manifest: null, frames: new Set() });
    await writeManifest(out, manifest);
    await writeFrame(out, "frame_00003.png", new Uint8Array([1, 2, 3]));
    expect(await openOutput(out)).toEqual({ manifest, frames: new Set([3]) });
    expect((await readdir(out)).sort()).toEqual(["frame_00003.png", MANIFEST]);
  });

  it("removes temporary files a killed run left behind", async () => {
    const out = await temp();
    await writeFile(join(out, ".frame_00004.png.tmp"), "partial");
    await writeFile(join(out, "notes.txt"), "keep");
    expect((await openOutput(out)).frames.size).toBe(0);
    expect(await readdir(out)).toEqual(["notes.txt"]);
  });

  it("rejects a foreign JSON file in place of the manifest", async () => {
    const out = await temp();
    await writeFile(join(out, MANIFEST), JSON.stringify({ hello: "world" }));
    await expect(openOutput(out)).rejects.toThrow("not a frapx-render manifest");
  });
});
