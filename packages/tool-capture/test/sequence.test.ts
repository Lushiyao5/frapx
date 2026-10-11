import type { ShaderBackgroundInstance } from "@frapx/fx-canvas";
import { describe, expect, it } from "vitest";
import { captureSequence } from "../src/sequence";
import type { CaptureTarget, ClockMode, FrameSink } from "../src/types";
import { decodePng16 } from "./helpers";

// A fx-canvas instance must satisfy the structural target without adapters.
type AssertAssignable<T extends CaptureTarget> = T;
export type FxCanvasIsATarget = AssertAssignable<ShaderBackgroundInstance>;

type Call = string;

const createTarget = (options: { clock?: ClockMode; width?: number; height?: number } = {}) => {
  const calls: Call[] = [];
  const width = options.width ?? 2;
  const height = options.height ?? 1;
  let time = 0;
  const target = {
    ready: Promise.resolve(),
    canvas: { width, height },
    clock: options.clock ?? "realtime",
    setClock(clock: ClockMode) {
      calls.push(`clock:${clock}`);
      target.clock = clock;
    },
    setTime(seconds: number) {
      calls.push(`time:${seconds}`);
      time = seconds;
    },
    resetFeedback() {
      calls.push("reset");
    },
    captureFrame: (async ({ format }: { format: "png" | "rgba16f" }) => {
      calls.push(`capture:${format}@${time}`);
      if (format === "png") return new Blob([`t=${time}`], { type: "image/png" });
      return new Float32Array(width * height * 4).fill(time);
    }) as CaptureTarget["captureFrame"]
  };
  return { target, calls };
};

const createMemorySink = () => {
  const files: Array<[string, Blob]> = [];
  const events: string[] = [];
  const sink: FrameSink<string[]> = {
    async write(name, data) {
      events.push(`write:${name}`);
      files.push([name, data]);
    },
    async close() {
      events.push("close");
      return files.map(([name]) => name);
    },
    abort(reason) {
      events.push(`abort:${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };
  return { sink, files, events };
};

describe("captureSequence", () => {
  it("writes each frame at frame / fps and resolves with the sink result", async () => {
    const { target, calls } = createTarget();
    const { sink, files } = createMemorySink();

    const names = await captureSequence(target, { sink, fps: 4, frameCount: 3, startFrame: 2 });

    expect(names).toEqual(["frame_00002.png", "frame_00003.png", "frame_00004.png"]);
    expect(await files[1]![1].text()).toBe("t=0.75");
    expect(calls).toEqual([
      "clock:manual",
      "reset",
      // Primed one frame back so the first u_delta is 1 / fps.
      "time:0.25",
      "time:0.5",
      "capture:png@0.5",
      "time:0.75",
      "capture:png@0.75",
      "time:1",
      "capture:png@1",
      "clock:realtime"
    ]);
  });

  it("keeps the manual clock when the target already uses it", async () => {
    const { target, calls } = createTarget({ clock: "manual" });
    await captureSequence(target, { sink: createMemorySink().sink, fps: 30, frameCount: 1 });
    expect(target.clock).toBe("manual");
    expect(calls).not.toContain("clock:realtime");
  });

  it("can skip the feedback reset and rename files", async () => {
    const { target, calls } = createTarget();
    const { sink } = createMemorySink();
    const names = await captureSequence(target, {
      sink,
      fps: 10,
      frameCount: 2,
      resetFeedback: false,
      fileName: (frame) => `shot-${frame}.png`
    });
    expect(names).toEqual(["shot-0.png", "shot-1.png"]);
    expect(calls).not.toContain("reset");
  });

  it("runs onBeforeFrame between setTime and the capture, and reports progress", async () => {
    const { target, calls } = createTarget();
    const progress: string[] = [];
    await captureSequence(target, {
      sink: createMemorySink().sink,
      fps: 2,
      frameCount: 2,
      async onBeforeFrame({ frame, time }) {
        await Promise.resolve();
        calls.push(`before:${frame}@${time}`);
      },
      onProgress: ({ frame, completed, total }) => progress.push(`${frame}:${completed}/${total}`)
    });
    expect(calls.slice(3, 6)).toEqual(["time:0", "before:0@0", "capture:png@0"]);
    expect(progress).toEqual(["0:1/2", "1:2/2"]);
  });

  it("encodes png16 frames from the float buffer at the canvas size", async () => {
    const { target, calls } = createTarget({ width: 3, height: 2 });
    const { sink, files } = createMemorySink();
    await captureSequence(target, { sink, fps: 4, frameCount: 1, startFrame: 1, format: "png16" });

    expect(calls).toContain("capture:rgba16f@0.25");
    const png = decodePng16(new Uint8Array(await files[0]![1].arrayBuffer()));
    expect(png).toMatchObject({ width: 3, height: 2, bitDepth: 16 });
    expect(png.samples[0]).toBe(Math.round(0.25 * 65535));
  });

  it("aborts the sink, restores the clock and rejects with the abort reason", async () => {
    const { target } = createTarget();
    const { sink, events } = createMemorySink();
    const controller = new AbortController();

    const run = captureSequence(target, {
      sink,
      fps: 30,
      frameCount: 5,
      signal: controller.signal,
      onProgress: ({ completed }) => {
        if (completed === 2) controller.abort(new Error("cancelled"));
      }
    });

    await expect(run).rejects.toThrow("cancelled");
    expect(events).toEqual([
      "write:frame_00000.png",
      "write:frame_00001.png",
      "abort:cancelled"
    ]);
    expect(target.clock).toBe("realtime");
  });

  it("aborts the sink when a capture fails", async () => {
    const { target } = createTarget();
    target.captureFrame = (async () => {
      throw new Error("no float buffer");
    }) as CaptureTarget["captureFrame"];
    const { sink, events } = createMemorySink();

    await expect(
      captureSequence(target, { sink, fps: 30, frameCount: 2, format: "png16" })
    ).rejects.toThrow("no float buffer");
    expect(events).toEqual(["abort:no float buffer"]);
    expect(target.clock).toBe("realtime");
  });

  it("does nothing when the signal is already aborted", async () => {
    const { target, calls } = createTarget();
    const controller = new AbortController();
    controller.abort(new Error("early"));
    await expect(
      captureSequence(target, {
        sink: createMemorySink().sink,
        fps: 30,
        frameCount: 1,
        signal: controller.signal
      })
    ).rejects.toThrow("early");
    expect(calls).toEqual([]);
  });

  it("validates the frame range", async () => {
    const { target } = createTarget();
    const { sink } = createMemorySink();
    await expect(captureSequence(target, { sink, fps: 0, frameCount: 1 })).rejects.toThrow(RangeError);
    await expect(captureSequence(target, { sink, fps: 30, frameCount: 0 })).rejects.toThrow(RangeError);
    await expect(captureSequence(target, { sink, fps: 30, frameCount: 1.5 })).rejects.toThrow(RangeError);
    await expect(
      captureSequence(target, { sink, fps: 30, frameCount: 1, startFrame: -1 })
    ).rejects.toThrow(RangeError);
  });
});
