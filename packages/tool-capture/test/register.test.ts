import type { ShaderBackgroundInstance } from "@frapx/fx-canvas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerRenderTarget } from "../src/register";
import type { CaptureTarget, ClockMode, RenderJob } from "../src/types";

// Instances must stay targets with the optional setResolution() added.
type AssertAssignable<T extends CaptureTarget> = T;
export type FxCanvasIsAResizableTarget = AssertAssignable<ShaderBackgroundInstance>;

const createTarget = (name = "a") => {
  const calls: string[] = [];
  let time = 0;
  const target = {
    ready: Promise.resolve(),
    canvas: { width: 4, height: 2 },
    clock: "manual" as ClockMode,
    setClock(clock: ClockMode) {
      target.clock = clock;
    },
    setTime(seconds: number) {
      time = seconds;
    },
    setResolution(resolution: readonly [number, number] | null) {
      calls.push(`${name}:resolution:${resolution?.join("x")}`);
      if (resolution) target.canvas = { width: resolution[0], height: resolution[1] };
    },
    captureFrame: (async () => {
      calls.push(`${name}:capture@${time}`);
      return new Blob([`t=${time}`], { type: "image/png" });
    }) as CaptureTarget["captureFrame"]
  };
  return { target, calls };
};

const job = (overrides: Partial<RenderJob> = {}): RenderJob => ({
  startFrame: 2,
  frameCount: 2,
  fps: 10,
  format: "png",
  resolution: null,
  params: {},
  endpoint: "/__frapx-render",
  ...overrides
});

const stubFetch = (status = 204) => {
  const posts: Array<[string, string]> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: Blob }) => {
      posts.push([url, await init.body.text()]);
      return new Response(status === 204 ? null : "disk full", { status });
    })
  );
  return posts;
};

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.__frapxRender = undefined;
});

describe("registerRenderTarget", () => {
  it("publishes a host that renders a range to the endpoint", async () => {
    const { target } = createTarget();
    const posts = stubFetch();
    registerRenderTarget(target, { fps: 30, duration: 4 });

    const host = globalThis.__frapxRender!;
    expect(host.version).toBe(1);
    expect(host.describe()).toEqual({ fps: 30, duration: 4 });

    const size = await host.render(job());
    expect(size).toEqual({ width: 4, height: 2 });
    expect(posts).toEqual([
      ["/__frapx-render/frame/frame_00002.png", "t=0.2"],
      ["/__frapx-render/frame/frame_00003.png", "t=0.3"]
    ]);
  });

  it("runs prepare, then applies the resolution to the instance the getter returns", async () => {
    const first = createTarget("a");
    const second = createTarget("b");
    let current: CaptureTarget = first.target;
    stubFetch();
    const prepared: unknown[] = [];
    registerRenderTarget(() => current, {
      fps: 30,
      duration: 1,
      async prepare(context) {
        prepared.push(context);
        current = second.target;
      }
    });

    const size = await globalThis.__frapxRender!.render(
      job({ resolution: [8, 6], params: { spp: "16" }, frameCount: 1 })
    );

    expect(prepared).toEqual([{ params: { spp: "16" }, fps: 10, format: "png", resolution: [8, 6] }]);
    expect(first.calls).toEqual([]);
    expect(second.calls).toEqual(["b:resolution:8x6", "b:capture@0.2"]);
    expect(size).toEqual({ width: 8, height: 6 });
  });

  it("rejects a resolution override on a target that cannot resize", async () => {
    const { target } = createTarget();
    const { setResolution: _, ...fixed } = target;
    stubFetch();
    registerRenderTarget(fixed, { fps: 30, duration: 1 });
    await expect(globalThis.__frapxRender!.render(job({ resolution: [8, 6] }))).rejects.toThrow(
      "cannot change its resolution"
    );
  });

  it("fails the job when the endpoint refuses a frame", async () => {
    const { target } = createTarget();
    stubFetch(500);
    registerRenderTarget(target, { fps: 30, duration: 1 });
    await expect(globalThis.__frapxRender!.render(job())).rejects.toThrow("500 disk full");
  });

  it("stops a running job on abort() and allows the next one", async () => {
    const { target } = createTarget();
    stubFetch();
    registerRenderTarget(target, { fps: 30, duration: 1 });
    const host = globalThis.__frapxRender!;

    const running = host.render(job({ frameCount: 100 }));
    await expect(host.render(job())).rejects.toThrow("already running");
    host.abort();
    await expect(running).rejects.toThrow("stopped");
    await expect(host.render(job({ frameCount: 1 }))).resolves.toEqual({ width: 4, height: 2 });
  });

  it("removes only its own registration", () => {
    const unregisterFirst = registerRenderTarget(createTarget().target, { fps: 30, duration: 1 });
    const unregisterSecond = registerRenderTarget(createTarget().target, { fps: 24, duration: 1 });
    unregisterFirst();
    expect(globalThis.__frapxRender?.describe().fps).toBe(24);
    unregisterSecond();
    expect(globalThis.__frapxRender).toBeUndefined();
  });

  it("validates its options", () => {
    const { target } = createTarget();
    expect(() => registerRenderTarget(target, { fps: 0, duration: 1 })).toThrow(RangeError);
    expect(() => registerRenderTarget(target, { fps: 30, duration: Number.NaN })).toThrow(RangeError);
    expect(() => registerRenderTarget(target, { fps: 30, duration: 1, resolution: [0, 720] })).toThrow(
      RangeError
    );
    expect(() =>
      registerRenderTarget(target, { fps: 30, duration: 1, resolution: [1920.5, 1080] })
    ).toThrow(RangeError);
  });

  it("describes a declared resolution and renders at it unless the job overrides it", async () => {
    stubFetch();
    const { target, calls } = createTarget();
    const prepared: Array<readonly [number, number] | null> = [];
    registerRenderTarget(target, {
      fps: 10,
      duration: 1,
      resolution: [16, 9],
      prepare: ({ resolution }) => {
        prepared.push(resolution);
      }
    });
    const host = globalThis.__frapxRender!;
    expect(host.describe()).toEqual({ fps: 10, duration: 1, resolution: [16, 9] });

    expect(await host.render(job({ frameCount: 1 }))).toEqual({ width: 16, height: 9 });
    expect(await host.render(job({ frameCount: 1, resolution: [8, 6] }))).toEqual({ width: 8, height: 6 });
    expect(prepared).toEqual([[16, 9], [8, 6]]);
    expect(calls.filter((call) => call.includes("resolution"))).toEqual([
      "a:resolution:16x9",
      "a:resolution:8x6"
    ]);
  });
});
