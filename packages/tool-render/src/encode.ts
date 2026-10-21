import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import type { Encoder } from "./types";

// Full-range RGB PNGs to limited-range BT.709 video, tagged so players agree.
// setparams tags the frames too: ffmpeg 8 lets untagged frame properties
// override -color_primaries / -color_trc, which then come out "unknown".
// Chroma subsampling needs even sizes, so an odd edge gains one black pixel.
const SCALE = [
  "-vf",
  "pad=ceil(iw/2)*2:ceil(ih/2)*2,scale=out_color_matrix=bt709:out_range=tv,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv"
];
const COLOR_TAGS = [
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709"
];

const PRESETS: Record<Encoder, { extension: string; codec: string[]; audio: string[] }> = {
  // ProRes 422 HQ, 10-bit: an editing master, with uncompressed audio.
  prores: {
    extension: ".mov",
    codec: ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"],
    audio: ["-c:a", "pcm_s24le"]
  },
  // High-quality H.264 for review and sharing.
  h264: {
    extension: ".mp4",
    codec: ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    audio: ["-c:a", "aac", "-b:a", "320k"]
  }
};

/** The video file an encoder writes into `out`, named after the directory. */
export const videoFileName = (out: string, encoder: Encoder): string =>
  join(out, `${basename(resolve(out))}${PRESETS[encoder].extension}`);

/**
 * ffmpeg arguments to encode `frame_%05d.png` frames `first..last` in the
 * working directory, with `audio` (an absolute path) cut to the same span.
 */
export const ffmpegArgs = (
  encoder: Encoder,
  fps: number,
  range: readonly [number, number],
  output: string,
  audio?: string
): string[] => {
  const frames = range[1] - range[0] + 1;
  return [
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
    ...(audio === undefined
      ? []
      : ["-ss", String(range[0] / fps), "-t", String(frames / fps), "-i", audio, "-map", "0:v", "-map", "1:a"]),
    "-frames:v",
    String(frames),
    ...SCALE,
    ...PRESETS[encoder].codec,
    ...(audio === undefined ? [] : PRESETS[encoder].audio),
    ...COLOR_TAGS,
    output
  ];
};

const run = (
  args: string[],
  cwd?: string,
  command = "ffmpeg"
): Promise<{ code: number | null; stdout: string; stderr: string }> =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolveRun({ code, stdout, stderr }));
  });

/**
 * Throws when ffmpeg (and, for `--audio`, ffprobe) is not on PATH, so a long
 * render does not end in a failed encode.
 */
export const assertFfmpeg = async (probe = false): Promise<void> => {
  for (const command of probe ? ["ffmpeg", "ffprobe"] : ["ffmpeg"]) {
    try {
      const { code } = await run(["-version"], undefined, command);
      if (code === 0) continue;
    } catch {
      // Reported below.
    }
    throw new Error(`${command === "ffmpeg" ? "--encode" : "--audio"} needs ${command} on PATH, but it could not be run.`);
  }
};

/** The duration of an audio file in seconds, read with ffprobe. */
export const probeDuration = async (file: string): Promise<number> => {
  const { code, stdout, stderr } = await run(
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    undefined,
    "ffprobe"
  );
  const seconds = Number(stdout.trim());
  if (code !== 0 || !Number.isFinite(seconds)) {
    throw new Error(`ffprobe could not read the duration of ${file}:\n${stderr.trim()}`);
  }
  return seconds;
};

/** Describes how `audio` seconds miss the page's `duration`, or returns null within one frame. */
export const audioDurationMismatch = (audio: number, duration: number, fps: number): string | null => {
  const difference = audio - duration;
  // ffprobe reports microseconds; the margin keeps exactly one frame inside.
  if (Math.abs(difference) <= 1 / fps + 1e-6) return null;
  const ms = (seconds: number) => `${(seconds * 1000).toFixed(1)} ms`;
  return `The audio is ${audio.toFixed(3)} s, ${ms(Math.abs(difference))} ${
    difference < 0 ? "shorter" : "longer"
  } than the page's ${duration.toFixed(3)} s (${(Math.abs(difference) * fps).toFixed(1)} frames at ${fps} fps).`;
};

export const encodeVideo = async (
  out: string,
  encoder: Encoder,
  fps: number,
  range: readonly [number, number],
  audio?: string
): Promise<string> => {
  const output = videoFileName(out, encoder);
  // "./" keeps a name starting with "-" from reading as an option.
  const { code, stderr } = await run(ffmpegArgs(encoder, fps, range, `./${basename(output)}`, audio), out);
  if (code !== 0) throw new Error(`ffmpeg (${encoder}) exited with ${code}:\n${stderr.trim()}`);
  return output;
};
