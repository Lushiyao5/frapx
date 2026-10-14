import { describe, expect, it } from "vitest";
import { ffmpegArgs, videoFileName } from "../src/encode";

describe("ffmpegArgs", () => {
  it("encodes the range from its first frame with BT.709 tags", () => {
    const args = ffmpegArgs("prores", 30, [120, 239], "frames.mov");
    expect(args.slice(0, 13)).toEqual([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      "30",
      "-start_number",
      "120",
      "-i",
      "frame_%05d.png",
      "-frames:v",
      "120",
      "-vf"
    ]);
    expect(args).toContain("prores_ks");
    expect(args).toContain("yuv422p10le");
    const filter = args[args.indexOf("-vf") + 1]!;
    // Odd sizes are padded to even ones for chroma subsampling.
    expect(filter.startsWith("pad=ceil(iw/2)*2:ceil(ih/2)*2,")).toBe(true);
    expect(filter).toContain("setparams=color_primaries=bt709:color_trc=bt709");
    expect(args[args.length - 1]).toBe("frames.mov");
  });

  it("uses yuv420p H.264 with faststart", () => {
    const args = ffmpegArgs("h264", 24, [0, 9], "frames.mp4");
    expect(args).toEqual(expect.arrayContaining(["libx264", "yuv420p", "+faststart"]));
  });
});

describe("videoFileName", () => {
  it("names the video after the output directory", () => {
    expect(videoFileName("/renders/poolrooms-4k", "prores")).toBe("/renders/poolrooms-4k/poolrooms-4k.mov");
    expect(videoFileName("/renders/poolrooms-4k/", "h264")).toBe("/renders/poolrooms-4k/poolrooms-4k.mp4");
  });
});
