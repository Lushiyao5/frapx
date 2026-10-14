import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import type { Encoder } from "./types";

// Full-range RGB PNGs to limited-range BT.709 video, tagged so players agree.
// setparams tags the frames too: ffmpeg 8 lets untagged frame properties
// override -color_primaries / -color_trc, which then come out "unknown".
const SCALE = [
  "-vf",
  "scale=out_color_matrix=bt709:out_range=tv,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv"
];
const COLOR_TAGS = [
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709"
];

const PRESETS: Record<Encoder, { extension: string; codec: string[] }> = {
  // ProRes 422 HQ, 10-bit: an editing master.
  prores: {
    extension: ".mov",
    codec: ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"]
  },
  // High-quality H.264 for review and sharing.
  h264: {
    extension: ".mp4",
    codec: ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
  }
};

/** The video file an encoder writes into `out`, named after the directory. */
export const videoFileName = (out: string, encoder: Encoder): string =>
  join(out, `${basename(resolve(out))}${PRESETS[encoder].extension}`);

/** ffmpeg arguments to encode `frame_%05d.png` frames `first..last` in the working directory. */
export const ffmpegArgs = (
  encoder: Encoder,
  fps: number,
  range: readonly [number, number],
  output: string
): string[] => [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-framerate",
  String(fps),
  "-start_number",
  String(range[0]),
  "-i",
  "frame_%05d.png",
  "-frames:v",
  String(range[1] - range[0] + 1),
  ...SCALE,
  ...PRESETS[encoder].codec,
  ...COLOR_TAGS,
  output
];

const run = (args: string[], cwd?: string): Promise<{ code: number | null; stderr: string }> =>
  new Promise((resolveRun, reject) => {
    const child = spawn("ffmpeg", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolveRun({ code, stderr }));
  });

/** Throws when ffmpeg is not on PATH, so a long render does not end in a failed encode. */
export const assertFfmpeg = async (): Promise<void> => {
  try {
    const { code } = await run(["-version"]);
    if (code === 0) return;
  } catch {
    // Reported below.
  }
  throw new Error("--encode needs ffmpeg on PATH, but it could not be run.");
};

export const encodeVideo = async (
  out: string,
  encoder: Encoder,
  fps: number,
  range: readonly [number, number]
): Promise<string> => {
  const output = videoFileName(out, encoder);
  const { code, stderr } = await run(ffmpegArgs(encoder, fps, range, basename(output)), out);
  if (code !== 0) throw new Error(`ffmpeg (${encoder}) exited with ${code}:\n${stderr.trim()}`);
  return output;
};
