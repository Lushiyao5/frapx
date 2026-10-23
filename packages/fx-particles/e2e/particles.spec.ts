import { expect, test, type Page } from "@playwright/test";
import type { captureSequence, createZipSink } from "@frapx/tool-capture";
import type { createParticles, keyframes } from "../src";

type Win = typeof window & {
  __frapx: {
    createParticles: typeof createParticles;
    keyframes: typeof keyframes;
    captureSequence: typeof captureSequence;
    createZipSink: typeof createZipSink;
  };
};

const open = async (page: Page) => {
  await page.goto("/?test");
  await page.waitForFunction(() => (window as Win).__frapx !== undefined);
};

// Normal blending, a palette, spin, tumble and curl noise: the preset that
// exercises the most state. Pointer forces never act under a manual clock.
const BASE = {
  preset: "confetti",
  clock: "manual",
  resolution: [160, 90],
  forces: { pointer: { strength: 1, radius: 0.3 } }
} as const;

test("a frame is the same whether reached directly, step by step or by rewinding", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (base) => {
    const { createParticles } = (window as Win).__frapx;
    const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
    const direct = createParticles(base);
    const stepped = createParticles(base);
    await Promise.all([direct.ready, stepped.ready]);

    direct.setTime(1.5);
    const target = await direct.captureFrame({ format: "rgba8" });

    let last: Uint8Array = new Uint8Array();
    for (let frame = 0; frame <= 45; frame++) {
      stepped.setTime(frame / 30);
      last = await stepped.captureFrame({ format: "rgba8" });
    }

    direct.setTime(0.5);
    await direct.captureFrame({ format: "rgba8" });
    direct.setTime(1.5);
    const rewound = await direct.captureFrame({ format: "rgba8" });

    let covered = 0;
    for (let i = 3; i < target.length; i += 4) if (target[i]! > 0) covered++;
    direct.destroy();
    stepped.destroy();
    return { stepped: sameBytes(target, last), rewound: sameBytes(target, rewound), covered };
  }, BASE);
  expect(result.covered).toBeGreaterThan(20);
  expect(result.stepped).toBe(true);
  expect(result.rewound).toBe(true);
});

test("bound timelines replay the same way and change the result", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (base) => {
    const { createParticles, keyframes } = (window as Win).__frapx;
    const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
    const timeline = keyframes({
      rate: [
        [0, 5],
        [1, 120]
      ],
      gravity: [
        [0, [0, -0.15, 0]],
        [1.5, [0.3, 0.2, 0]]
      ]
    });
    const plain = createParticles(base);
    const direct = createParticles(base);
    const stepped = createParticles(base);
    await Promise.all([plain.ready, direct.ready, stepped.ready]);
    direct.bindUniforms(timeline);
    stepped.bindUniforms(timeline);

    plain.setTime(1.5);
    const unbound = await plain.captureFrame({ format: "rgba8" });
    direct.setTime(1.5);
    const target = await direct.captureFrame({ format: "rgba8" });
    let last: Uint8Array = new Uint8Array();
    for (let frame = 0; frame <= 45; frame += 5) {
      stepped.setTime(frame / 30);
      last = await stepped.captureFrame({ format: "rgba8" });
    }
    for (const instance of [plain, direct, stepped]) instance.destroy();
    return { stepped: sameBytes(target, last), differs: !sameBytes(target, unbound) };
  }, BASE);
  expect(result.stepped).toBe(true);
  expect(result.differs).toBe(true);
});

test("setUniform under a manual clock applies to the whole timeline", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (base) => {
    const { createParticles } = (window as Win).__frapx;
    const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
    const fx = createParticles(base);
    await fx.ready;
    fx.setTime(1);
    const original = await fx.captureFrame({ format: "rgba8" });
    fx.setUniform("gravity", [0, 0.4, 0]);
    const changed = await fx.captureFrame({ format: "rgba8" });
    fx.setUniform("gravity", [0, -0.15, 0]);
    const restored = await fx.captureFrame({ format: "rgba8" });
    fx.destroy();
    return { changed: !sameBytes(original, changed), restored: sameBytes(original, restored) };
  }, BASE);
  expect(result.changed).toBe(true);
  expect(result.restored).toBe(true);
});

test("a uniform changed during a capture's catch-up restarts it with the new value", async ({ page }) => {
  await open(page);
  const same = await page.evaluate(async (base) => {
    const { createParticles } = (window as Win).__frapx;
    const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
    // Particles that live through the whole replay, so steps run before the
    // change still show in the frame.
    const options = { ...base, lifetime: [60, 60] as [number, number], prewarm: 0 };
    const changed = createParticles(options);
    const reference = createParticles({ ...options, forces: { ...base.forces, gravity: [0.2, 0.1, 0] } });
    await Promise.all([changed.ready, reference.ready]);
    changed.setTime(30);
    reference.setTime(30);
    // 1,800 steps in batches with GPU waits between them; the change lands
    // in the second wait, mid-replay.
    const gl = changed.gl!;
    const fenceSync = gl.fenceSync.bind(gl);
    let waits = 0;
    gl.fenceSync = (condition, flags) => {
      waits++;
      if (waits === 2) changed.setUniform("gravity", [0.2, 0.1, 0]);
      return fenceSync(condition, flags);
    };
    const result = await changed.captureFrame({ format: "rgba8" });
    const expected = await reference.captureFrame({ format: "rgba8" });
    changed.destroy();
    reference.destroy();
    return sameBytes(result, expected);
  }, BASE);
  expect(same).toBe(true);
});

test("a new size under a manual clock replays the timeline", async ({ page }) => {
  await open(page);
  const same = await page.evaluate(async (base) => {
    const { createParticles } = (window as Win).__frapx;
    const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
    const resized = createParticles(base);
    const fresh = createParticles({ ...base, resolution: [90, 160] });
    await Promise.all([resized.ready, fresh.ready]);
    resized.setTime(1);
    await resized.captureFrame({ format: "rgba8" });
    resized.setResolution([90, 160]);
    resized.setTime(1.5);
    fresh.setTime(1.5);
    const a = await resized.captureFrame({ format: "rgba8" });
    const b = await fresh.captureFrame({ format: "rgba8" });
    resized.destroy();
    fresh.destroy();
    return sameBytes(a, b);
  }, BASE);
  expect(same).toBe(true);
});

test("prewarm fills the first frame; prewarm 0 starts empty", async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(async (base) => {
    const { createParticles } = (window as Win).__frapx;
    const covered = (pixels: Uint8Array) => {
      let count = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) count++;
      return count;
    };
    const warm = createParticles({ ...base, preset: "dust" });
    const cold = createParticles({ ...base, preset: "dust", prewarm: 0 });
    await Promise.all([warm.ready, cold.ready]);
    warm.setTime(0);
    cold.setTime(0);
    const result = {
      warm: covered(await warm.captureFrame({ format: "rgba8" })),
      cold: covered(await cold.captureFrame({ format: "rgba8" }))
    };
    warm.destroy();
    cold.destroy();
    return result;
  }, BASE);
  expect(counts.cold).toBe(0);
  expect(counts.warm).toBeGreaterThan(10);
});

test("a restored context replays to the same frame", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (base) => {
    const { createParticles } = (window as Win).__frapx;
    const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
    const fx = createParticles(base);
    await fx.ready;
    fx.setTime(1.5);
    const before = await fx.captureFrame({ format: "rgba8" });

    const lose = fx.gl!.getExtension("WEBGL_lose_context")!;
    const restored = new Promise<void>((resolve) => {
      fx.canvas!.addEventListener("webglcontextrestored", () => setTimeout(resolve, 50), { once: true });
    });
    lose.loseContext();
    // restoreContext() fails until the lost event has been dispatched.
    await new Promise((resolve) => setTimeout(resolve, 0));
    lose.restoreContext();
    await restored;

    const after = await fx.captureFrame({ format: "rgba8" });
    const status = fx.status;
    fx.destroy();
    return { same: sameBytes(before, after), status };
  }, BASE);
  expect(result.status).not.toBe("context-lost");
  expect(result.same).toBe(true);
});

test("a split capture sequence matches a single run", async ({ page }) => {
  await open(page);
  const same = await page.evaluate(async (base) => {
    const { createParticles, captureSequence } = (window as Win).__frapx;
    const collect = () => {
      const files = new Map<string, Blob>();
      return {
        files,
        sink: {
          async write(name: string, data: Blob) {
            files.set(name, data);
          },
          async close() {}
        }
      };
    };
    const whole = createParticles(base);
    const part = createParticles(base);
    await Promise.all([whole.ready, part.ready]);
    const a = collect();
    const b = collect();
    await captureSequence(whole, { sink: a.sink, fps: 30, frameCount: 8 });
    await captureSequence(part, { sink: b.sink, fps: 30, frameCount: 4, startFrame: 4 });
    whole.destroy();
    part.destroy();

    const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
    for (const [name, blob] of b.files) {
      const other = a.files.get(name);
      if (!other) return false;
      const [x, y] = [await bytes(blob), await bytes(other)];
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
    }
    return b.files.size === 4;
  }, BASE);
  expect(same).toBe(true);
});

test("rgba16f captures straight alpha at full precision", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (base) => {
    const { createParticles } = (window as Win).__frapx;
    const fx = createParticles({ ...base, preset: "snow", format: "rgba16f", formatFallback: false });
    await fx.ready;
    fx.setTime(1);
    const floats = await fx.captureFrame({ format: "rgba16f" });
    const premultiplied = await fx.captureFrame({ format: "rgba8" });
    fx.destroy();
    // Snow is white: straight color stays near 1 even where alpha is low,
    // while the premultiplied canvas darkens with alpha.
    let partial = 0;
    let worst = 0;
    for (let i = 0; i < floats.length; i += 4) {
      const alpha = floats[i + 3]!;
      if (alpha <= 0.05 || alpha >= 0.95) continue;
      partial++;
      worst = Math.max(worst, Math.abs(floats[i]! - 1));
      // The premultiplied canvas holds about color * alpha.
      worst = Math.max(worst, Math.abs(premultiplied[i]! / 255 - alpha) - 2 / 255);
    }
    return { length: floats.length, partial, worst };
  }, BASE);
  expect(result.length).toBe(160 * 90 * 4);
  expect(result.partial).toBeGreaterThan(20);
  expect(result.worst).toBeLessThan(0.02);
});

test("debug warns once when the rate outgrows the pool", async ({ page }) => {
  await open(page);
  const warnings = await page.evaluate(async (base) => {
    const { createParticles } = (window as Win).__frapx;
    const messages: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => messages.push(args.join(" "));
    try {
      // 10 per second living 2 seconds keeps 20 alive: more than the 16 slots,
      // though no single step spawns more than the pool.
      const fx = createParticles({ ...base, rate: 10, lifetime: [2, 2], maxParticles: 16, debug: true });
      await fx.ready;
      fx.setTime(1);
      await fx.captureFrame({ format: "rgba8" });
      fx.setTime(2);
      await fx.captureFrame({ format: "rgba8" });
      fx.destroy();
    } finally {
      console.warn = warn;
    }
    return messages.filter((message) => message.includes("pool"));
  }, BASE);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("Raise maxParticles");
});

test("is unsupported without WebGL2", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === "webgl2") return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await open(page);
  const status = await page.evaluate(async () => {
    const fx = (window as Win).__frapx.createParticles({ preset: "snow", resolution: [32, 32] });
    await fx.ready.catch(() => {});
    return fx.status;
  });
  expect(status).toBe("unsupported");
});

test("runs in realtime and keeps running after a far seek", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { createParticles } = (window as Win).__frapx;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0";
    document.body.append(host);
    const fx = createParticles({ target: host, preset: "sparkles" });
    await fx.ready;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const status = fx.status;
    // A far seek in realtime lands exactly once, then keeps running.
    fx.setTime(60);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = fx.status;
    fx.destroy();
    host.remove();
    return { status, after };
  });
  expect(result.status).toBe("running");
  expect(result.after).toBe("running");
});

test("follows a time source without stalling on far jumps", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { createParticles } = (window as Win).__frapx;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0";
    document.body.append(host);
    let now = 0;
    const fx = createParticles({ target: host, preset: "sparkles", timeSource: () => now });
    await fx.ready;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(200);

    // An exact seek to an hour in would run 216,000 steps in one frame.
    let longest = 0;
    let previous = performance.now();
    let watching = true;
    const watch = () => {
      const t = performance.now();
      longest = Math.max(longest, t - previous);
      previous = t;
      if (watching) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    now = 3600;
    await wait(200);
    now = 0.05;
    await wait(200);
    watching = false;

    const frame = await fx.captureFrame({ format: "rgba8" });
    let covered = 0;
    for (let i = 3; i < frame.length; i += 4) if (frame[i]! > 0) covered++;
    const status = fx.status;
    fx.destroy();
    host.remove();
    return { longest, covered, status };
  });
  expect(result.status).toBe("running");
  expect(result.longest).toBeLessThan(250);
  // Going back restarts from the prewarmed start, so the frame is not empty.
  expect(result.covered).toBeGreaterThan(0);
});
