import { describe, expect, it } from "vitest";
import { UsageError, parseCliArgs, parseRange, parseResolution } from "../src/args";

const run = (...argv: string[]) => {
  const parsed = parseCliArgs(argv);
  if (parsed.kind !== "run") throw new Error(`expected run, got ${parsed.kind}`);
  return parsed.options;
};

describe("parseCliArgs", () => {
  it("fills defaults", () => {
    expect(run("dist", "--out", "frames")).toEqual({
      source: "dist",
      out: "frames",
      format: "png",
      params: {},
      resume: false,
      encode: [],
      browser: "chrome",
      headed: false,
      allowSoftware: false,
      timeout: 60
    });
  });

  it("reads every option", () => {
    expect(
      run(
        "http://127.0.0.1:5173/?res=96x54",
        "-o",
        "out",
        "-r",
        "10-19",
        "--fps",
        "29.97",
        "--resolution",
        "2560x1440",
        "--format",
        "png16",
        "-s",
        "spp=192",
        "--set",
        "mode=a=b",
        "--resume",
        "--encode",
        "prores",
        "--encode",
        "h264",
        "--encode",
        "prores",
        "--browser",
        "chromium",
        "--headed",
        "--allow-software",
        "--timeout",
        "5"
      )
    ).toEqual({
      source: "http://127.0.0.1:5173/?res=96x54",
      out: "out",
      range: [10, 19],
      fps: 29.97,
      resolution: [2560, 1440],
      format: "png16",
      params: { spp: "192", mode: "a=b" },
      resume: true,
      encode: ["prores", "h264"],
      browser: "chromium",
      headed: true,
      allowSoftware: true,
      timeout: 5
    });
  });

  it("answers help and version before checking the rest", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
  });

  it.each([
    [[]],
    [["dist"]],
    [["a", "b", "--out", "o"]],
    [["dist", "--out", "o", "--format", "jpg"]],
    [["dist", "--out", "o", "--encode", "av1"]],
    [["dist", "--out", "o", "--browser", "firefox"]],
    [["dist", "--out", "o", "--set", "=1"]],
    [["dist", "--out", "o", "--fps", "0"]],
    [["dist", "--out", "o", "--timeout", "0"]],
    [["dist", "--out", "o", "--unknown"]]
  ])("rejects %j", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
  });
});

describe("parseRange / parseResolution", () => {
  it("parses ranges and single frames", () => {
    expect(parseRange("0-719")).toEqual([0, 719]);
    expect(parseRange("12")).toEqual([12, 12]);
    expect(() => parseRange("9-3")).toThrow(UsageError);
    expect(() => parseRange("-3")).toThrow(UsageError);
  });

  it("parses WxH", () => {
    expect(parseResolution("2048x1080")).toEqual([2048, 1080]);
    expect(() => parseResolution("0x10")).toThrow(UsageError);
    expect(() => parseResolution("1920*1080")).toThrow(UsageError);
  });
});
