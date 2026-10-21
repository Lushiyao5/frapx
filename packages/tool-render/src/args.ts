import { statSync } from "node:fs";
import { parseArgs } from "node:util";
import { isRoutePath } from "./server";
import type { BrowserName, Encoder, RenderOptions, SequenceFormat } from "./types";

/** A command-line mistake; the CLI prints it with the usage and exits with 2. */
export class UsageError extends Error {
  override name = "UsageError";
}

export const usage = `Usage: frapx-render <url | directory> --out <directory> [options]

Renders a page that calls registerRenderTarget() from @frapx/tool-capture,
frame by frame in a headless browser, and writes frame_00000.png ... to --out.
A directory is served over a local HTTP server (use a production build, such
as Vite's dist/, for long renders).

Options:
  -o, --out <dir>          Output directory (required)
      --path <route>       Route to open in a directory, e.g. /music (default: /)
  -r, --range <a-b>        Inclusive frame range (default: the page's duration)
      --fps <n>            Frame rate (default: the page's)
      --resolution <WxH>   Override the render size, e.g. 2560x1440
      --format <png|png16> 8-bit, or 16-bit from the float buffer (default: png)
  -s, --set <key=value>    Parameter for the page's prepare(); repeatable
      --resume             Skip frames already in --out (settings must match)
      --encode <preset>    prores or h264, encoded with ffmpeg afterwards; repeatable
      --audio <file>       Mux this audio into the encoded videos, cut to the range
      --strict-audio       Stop when the audio and the page's duration differ by over a frame
      --browser <name>     chrome (installed Google Chrome, default) or chromium
      --headed             Show the browser window
      --allow-software     Render even on a software WebGL renderer
      --timeout <seconds>  Wait for the page to register (default: 60)
  -h, --help               Show this help
  -v, --version            Show the version`;

export type ParsedArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "run"; options: RenderOptions };

const parseInteger = (flag: string, value: string, min: number): number => {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min) {
    throw new UsageError(`${flag} must be an integer of at least ${min}, got "${value}"`);
  }
  return number;
};

export const parseRange = (value: string): readonly [number, number] => {
  const match = /^(\d+)(?:-(\d+))?$/.exec(value);
  if (!match) throw new UsageError(`--range must look like 0-719 or 12, got "${value}"`);
  const first = parseInteger("--range", match[1]!, 0);
  const last = match[2] === undefined ? first : parseInteger("--range", match[2], 0);
  if (last < first) throw new UsageError(`--range ends before it starts: "${value}"`);
  return [first, last];
};

export const parseResolution = (value: string): readonly [number, number] => {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new UsageError(`--resolution must look like 2560x1440, got "${value}"`);
  return [parseInteger("--resolution", match[1]!, 1), parseInteger("--resolution", match[2]!, 1)];
};

export const parsePath = (value: string): string => {
  if (!isRoutePath(value)) throw new UsageError(`--path must start with a single /, got "${value}"`);
  return value;
};

const parseAudio = (values: readonly string[], encoding: boolean): string => {
  if (values.length > 1) throw new UsageError("Pass one --audio file");
  const file = values[0]!;
  if (!encoding) throw new UsageError("--audio is muxed into encoded videos, so it needs --encode");
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) throw new UsageError(`--audio file not found: ${file}`);
  return file;
};

const parseFps = (value: string): number => {
  const fps = Number(value);
  if (!/^\d+(\.\d+)?$/.test(value) || !(fps > 0)) {
    throw new UsageError(`--fps must be a positive number, got "${value}"`);
  }
  return fps;
};

const parseParams = (values: readonly string[]): Record<string, string> => {
  const params: Record<string, string> = {};
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator < 1) throw new UsageError(`--set must look like key=value, got "${value}"`);
    params[value.slice(0, separator)] = value.slice(separator + 1);
  }
  return params;
};

const oneOf = <T extends string>(flag: string, value: string, allowed: readonly T[]): T => {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new UsageError(`${flag} must be one of ${allowed.join(", ")}, got "${value}"`);
  }
  return value as T;
};

export const parseCliArgs = (argv: readonly string[]): ParsedArgs => {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        out: { type: "string", short: "o" },
        path: { type: "string" },
        range: { type: "string", short: "r" },
        fps: { type: "string" },
        resolution: { type: "string" },
        format: { type: "string" },
        set: { type: "string", short: "s", multiple: true },
        resume: { type: "boolean" },
        encode: { type: "string", multiple: true },
        audio: { type: "string", multiple: true },
        "strict-audio": { type: "boolean" },
        browser: { type: "string" },
        headed: { type: "boolean" },
        "allow-software": { type: "boolean" },
        timeout: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" }
      }
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return { kind: "help" };
  if (values.version) return { kind: "version" };

  if (positionals.length !== 1) {
    throw new UsageError(
      positionals.length === 0 ? "Missing the page URL or directory" : "Pass one URL or directory"
    );
  }
  if (!values.out) throw new UsageError("Missing --out <directory>");

  const encode = [
    ...new Set((values.encode ?? []).map((value) => oneOf<Encoder>("--encode", value, ["prores", "h264"])))
  ];
  const options: RenderOptions = {
    source: positionals[0]!,
    out: values.out,
    format: oneOf<SequenceFormat>("--format", values.format ?? "png", ["png", "png16"]),
    params: parseParams(values.set ?? []),
    resume: values.resume ?? false,
    encode,
    browser: oneOf<BrowserName>("--browser", values.browser ?? "chrome", ["chrome", "chromium"]),
    headed: values.headed ?? false,
    allowSoftware: values["allow-software"] ?? false,
    timeout: values.timeout === undefined ? 60 : parseInteger("--timeout", values.timeout, 1)
  };
  if (values.path !== undefined) options.path = parsePath(values.path);
  if (values.audio !== undefined) options.audio = parseAudio(values.audio, encode.length > 0);
  if (values["strict-audio"]) {
    if (options.audio === undefined) throw new UsageError("--strict-audio needs --audio <file>");
    options.strictAudio = true;
  }
  if (values.range !== undefined) options.range = parseRange(values.range);
  if (values.fps !== undefined) options.fps = parseFps(values.fps);
  if (values.resolution !== undefined) options.resolution = parseResolution(values.resolution);
  return { kind: "run", options };
};
