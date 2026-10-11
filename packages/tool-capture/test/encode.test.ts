import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "../src/crc32";
import { encodePng16 } from "../src/png16";
import { createZipSink, createZipWriter } from "../src/zip";
import { decodePng16, readZip } from "./helpers";

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const text = (value: string) => new Blob([value]);

const hasPython = (() => {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// Lists entries and verifies every CRC with Python's zipfile, an independent reader.
const pythonZipCheck = (zip: Uint8Array): Array<[string, string]> => {
  const dir = mkdtempSync(join(tmpdir(), "frapx-zip-"));
  try {
    const path = join(dir, "test.zip");
    writeFileSync(path, zip);
    const script = [
      "import json, sys, zipfile",
      "z = zipfile.ZipFile(sys.argv[1])",
      "assert z.testzip() is None",
      "print(json.dumps([[i.filename, z.read(i).decode()] for i in z.infolist()]))"
    ].join("\n");
    return JSON.parse(execFileSync("python3", ["-c", script, path], { encoding: "utf8" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("continues across buffers", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(crc32(bytes.subarray(4), crc32(bytes.subarray(0, 4)))).toBe(0xcbf43926);
  });
});

describe("encodePng16", () => {
  it("stores 16-bit RGBA samples top row first", async () => {
    const width = 3;
    const height = 2;
    const pixels = new Float32Array([
      0, 0.5, 1, 1, 0.25, 0.75, 1 / 65535, 1, 0.1, 0.2, 0.3, 0.4,
      0.9, 0.8, 0.7, 0.6, 0.123456, 0.654321, 0.999, 0.001, 1, 0, 0, 1
    ]);
    const png = decodePng16(await bytesOf(await encodePng16(pixels, width, height)));

    expect(png).toMatchObject({ width, height, bitDepth: 16, colorType: 6 });
    expect(Array.from(png.samples)).toEqual(Array.from(pixels, (v) => Math.round(v * 65535)));
  });

  it("clamps out-of-range values and maps NaN to 0", async () => {
    const pixels = new Float32Array([-0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]);
    const png = decodePng16(await bytesOf(await encodePng16(pixels, 1, 1)));
    expect(Array.from(png.samples)).toEqual([0, 65535, 0, 65535]);
  });

  it("round-trips a gradient wider than one filter step", async () => {
    const width = 64;
    const height = 16;
    const pixels = new Float32Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      pixels.set([x / (width - 1), y / (height - 1), (x * y) / 1000, 1], i * 4);
    }
    const png = decodePng16(await bytesOf(await encodePng16(pixels, width, height)));
    expect(Array.from(png.samples)).toEqual(
      Array.from(pixels, (v) => Math.round(Math.min(Math.max(v, 0), 1) * 65535))
    );
  });

  it("rejects a size that does not match the data", async () => {
    await expect(encodePng16(new Float32Array(8), 3, 1)).rejects.toThrow(RangeError);
    await expect(encodePng16(new Float32Array(0), 0, 0)).rejects.toThrow(RangeError);
  });
});

describe("createZipSink", () => {
  it("stores entries in order with their CRCs", async () => {
    const sink = createZipSink({ date: new Date(2026, 9, 11, 12, 30, 10) });
    await sink.write("frame_00000.png", text("first"));
    await sink.write("frame_00001.png", text("second"));
    const zip = await bytesOf(await sink.close());

    const { entries, zip64 } = readZip(zip);
    expect(zip64).toBe(false);
    expect(entries.map((entry) => entry.name)).toEqual(["frame_00000.png", "frame_00001.png"]);
    expect(new TextDecoder().decode(entries[1]!.data)).toBe("second");
    expect(entries[0]!.crc).toBe(crc32(new TextEncoder().encode("first")));
  });

  it.skipIf(!hasPython)("is readable by an independent ZIP reader", async () => {
    const sink = createZipSink();
    await sink.write("a.txt", text("alpha"));
    await sink.write("フレーム.txt", text("beta"));
    expect(pythonZipCheck(await bytesOf(await sink.close()))).toEqual([
      ["a.txt", "alpha"],
      ["フレーム.txt", "beta"]
    ]);
  });

  it.skipIf(!hasPython)("writes ZIP64 records past the limits", async () => {
    // Lowered limits put every entry after the first past "4 GiB".
    const sink = createZipWriter(new Date(2026, 0, 1), { size: 40, count: 2 });
    await sink.write("one.txt", text("1"));
    await sink.write("two.txt", text("22"));
    await sink.write("three.txt", text("333"));
    const zip = await bytesOf(await sink.close());

    const { entries, zip64 } = readZip(zip);
    expect(zip64).toBe(true);
    expect(entries.map((entry) => new TextDecoder().decode(entry.data))).toEqual(["1", "22", "333"]);
    expect(pythonZipCheck(zip)).toEqual([
      ["one.txt", "1"],
      ["two.txt", "22"],
      ["three.txt", "333"]
    ]);
  });

  it("rejects duplicate names and writes after close", async () => {
    const sink = createZipSink();
    await sink.write("a.png", text("a"));
    await expect(sink.write("a.png", text("b"))).rejects.toThrow(/Duplicate/);
    await sink.close();
    await expect(sink.write("b.png", text("b"))).rejects.toThrow(/closed/);
  });

  it("drops a write that finishes after abort", async () => {
    const sink = createZipSink();
    const pending = sink.write("a.png", text("a"));
    await sink.abort?.(new Error("stop"));
    await expect(pending).rejects.toThrow(/aborted/);
    await expect(sink.close()).rejects.toThrow(/aborted/);
  });
});
