import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SequenceFormat } from "./types";

export const MANIFEST = "frapx-render.json";
const FRAME = /^frame_(\d+)\.png$/;
const TEMP = /^\.frame_\d+\.png\.tmp$/;

export const frameFileName = (frame: number): string =>
  `frame_${String(frame).padStart(5, "0")}.png`;

export const parseFrameFileName = (name: string): number | null => {
  const match = FRAME.exec(name);
  return match ? Number(match[1]) : null;
};

/** The settings that decide what a frame looks like. Resuming requires them to match. */
export type RenderSettings = {
  source: string;
  fps: number;
  format: SequenceFormat;
  resolution: readonly [number, number] | null;
  params: Readonly<Record<string, string>>;
};

export type Manifest = RenderSettings & {
  tool: "@frapx/tool-render";
  version: 1;
  range: readonly [number, number];
};

const sortedEntries = (params: Readonly<Record<string, string>>) =>
  Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** Describes each setting that differs, or returns an empty list. */
export const compareSettings = (saved: RenderSettings, current: RenderSettings): string[] => {
  const differences: string[] = [];
  const check = (name: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      differences.push(`${name}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
  };
  check("source", saved.source, current.source);
  check("fps", saved.fps, current.fps);
  check("format", saved.format, current.format);
  check("resolution", saved.resolution, current.resolution);
  check("params", Object.fromEntries(sortedEntries(saved.params)), Object.fromEntries(sortedEntries(current.params)));
  return differences;
};

const isManifest = (value: unknown): value is Manifest =>
  typeof value === "object" &&
  value !== null &&
  (value as { tool?: unknown }).tool === "@frapx/tool-render" &&
  (value as { version?: unknown }).version === 1;

export type OutputState = {
  manifest: Manifest | null;
  /** Frame numbers with a complete file. */
  frames: Set<number>;
};

/** Creates `out`, removes temporary files a killed run left behind, and reads what is there. */
export const openOutput = async (out: string): Promise<OutputState> => {
  await mkdir(out, { recursive: true });
  const names = await readdir(out);
  await Promise.all(names.filter((name) => TEMP.test(name)).map((name) => rm(join(out, name), { force: true })));

  const frames = new Set<number>();
  for (const name of names) {
    const frame = parseFrameFileName(name);
    if (frame !== null) frames.add(frame);
  }

  let manifest: Manifest | null = null;
  if (names.includes(MANIFEST)) {
    const parsed: unknown = JSON.parse(await readFile(join(out, MANIFEST), "utf8"));
    if (!isManifest(parsed)) throw new Error(`${join(out, MANIFEST)} is not a frapx-render manifest`);
    manifest = parsed;
  }
  return { manifest, frames };
};

/**
 * Decides which frames of `range` to render, or throws when the output
 * directory holds a different render (or any render without `resume`).
 */
export const planFrames = (
  state: OutputState,
  settings: RenderSettings,
  range: readonly [number, number],
  resume: boolean,
  out: string
): number[] => {
  if (!resume) {
    if (state.manifest || state.frames.size > 0) {
      throw new Error(
        `${out} already holds frames. Pass --resume to continue that render, or choose an empty directory.`
      );
    }
  } else if (state.manifest) {
    const differences = compareSettings(state.manifest, settings);
    if (differences.length > 0) {
      throw new Error(
        `--resume: the settings differ from ${MANIFEST} in ${out}:\n  ${differences.join("\n  ")}`
      );
    }
  } else if (state.frames.size > 0) {
    throw new Error(`--resume: ${out} holds frames but no ${MANIFEST}, so their settings are unknown.`);
  }

  const pending: number[] = [];
  for (let frame = range[0]; frame <= range[1]; frame++) {
    if (!state.frames.has(frame)) pending.push(frame);
  }
  return pending;
};

/** Splits sorted frame numbers into contiguous `[start, count]` runs. */
export const contiguousRuns = (frames: readonly number[]): Array<[number, number]> => {
  const runs: Array<[number, number]> = [];
  for (const frame of frames) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === frame) last[1]++;
    else runs.push([frame, 1]);
  }
  return runs;
};

export const writeManifest = async (out: string, manifest: Manifest): Promise<void> => {
  const temp = join(out, `.${MANIFEST}.tmp`);
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temp, join(out, MANIFEST));
};

/** Writes through a temporary file, so a killed run never leaves a truncated frame. */
export const writeFrame = async (out: string, name: string, data: Uint8Array): Promise<void> => {
  const temp = join(out, `.${name}.tmp`);
  try {
    await writeFile(temp, data);
    await rename(temp, join(out, name));
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
};
