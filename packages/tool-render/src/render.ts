import { rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import type { Browser, Page, Route } from "playwright-core";
import type { RenderHost, RenderJob } from "@frapx/tool-capture";
import { assertFfmpeg, encodeVideo } from "./encode";
import {
  contiguousRuns,
  frameFileName,
  openOutput,
  parseFrameFileName,
  planFrames,
  writeFrame,
  writeManifest
} from "./output";
import type { RenderSettings } from "./output";
import { serveDirectory } from "./server";
import type { StaticServer } from "./server";
import type { RenderEvent, RenderOptions, RenderResult } from "./types";

// What registerRenderTarget() sets in the page. Not declared globally, so the
// published types do not reference @frapx/tool-capture.
type PageGlobal = { __frapxRender?: RenderHost };

const ENDPOINT_PATH = "/__frapx-render";
const MAX_CONSECUTIVE_FAILURES = 3;
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** A failure the render survives by opening the page again. */
class RecoverableError extends Error {
  constructor(
    message: string,
    /** The last frame written before the failure may be wrong and is rendered again. */
    readonly distrustLastFrame = false
  ) {
    super(message);
  }
}

const navigationError = () =>
  new Error(
    "The page reloaded or navigated during the render, so later frames could come from different code (a dev server's hot reload?). Render a production build, and continue with --resume."
  );

type Session = {
  page: Page;
  /** Rejects with the first failure the page reports. */
  failed: Promise<never>;
  failure: Error | null;
  written: number;
  lastWritten: number | null;
  close(): Promise<void>;
};

// Read through a call: TypeScript keeps a property narrowed across awaits.
const failureOf = (session: Session): Error | null => session.failure;

type SessionHandlers = {
  timeout: number;
  onPageError(message: string): void;
  onFrame(route: Route, session: Session): Promise<void>;
};

const launchBrowser = async (options: RenderOptions): Promise<Browser> => {
  try {
    return await chromium.launch({
      ...(options.browser === "chrome" ? { channel: "chrome" } : {}),
      headless: !options.headed,
      // Playwright would otherwise exit the process on Ctrl-C; the caller's
      // signal stops the render and closes the browser instead.
      handleSIGINT: false,
      // A covered or minimized headed window must not slow the render down.
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding"
      ]
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new Error(
      options.browser === "chrome"
        ? `Could not start Google Chrome (${reason}). Install Chrome, or pass --browser chromium after running \`npx playwright install chromium\`.`
        : `Could not start Chromium (${reason}). Install it with \`npx playwright install chromium\`.`
    );
  }
};

const openSession = async (
  browser: Browser,
  url: string,
  handlers: SessionHandlers
): Promise<Session> => {
  // A service worker would answer the frame POSTs before page.route() sees them.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  let reject!: (error: Error) => void;
  const failed = new Promise<never>((_, rejectFailed) => {
    reject = rejectFailed;
  });
  failed.catch(() => {});
  let loaded = false;
  let closing = false;

  const session: Session = {
    page,
    failed,
    failure: null,
    written: 0,
    lastWritten: null,
    async close() {
      closing = true;
      await context.close().catch(() => {});
    }
  };
  const fail = (error: Error) => {
    if (closing || session.failure) return;
    session.failure = error;
    reject(error);
  };

  page.on("crash", () => fail(new RecoverableError("the page crashed")));
  page.on("close", () => fail(new RecoverableError("the page closed")));
  page.on("pageerror", (error) => handlers.onPageError(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") handlers.onPageError(message.text());
  });

  await page.exposeFunction("__frapxRenderContextLost", () =>
    fail(new RecoverableError("the WebGL context was lost", true))
  );
  // Runs once per new document, so history.pushState() and hash changes pass.
  await page.exposeFunction("__frapxRenderDocument", () => {
    if (loaded) fail(navigationError());
  });
  await page.addInitScript(() => {
    if (window === window.top) {
      void (globalThis as unknown as { __frapxRenderDocument(): Promise<void> }).__frapxRenderDocument();
    }
    // Capture phase: the event does not bubble from the canvas.
    addEventListener(
      "webglcontextlost",
      () => {
        void (globalThis as unknown as { __frapxRenderContextLost(): Promise<void> }).__frapxRenderContextLost();
      },
      true
    );
  });
  await page.route(
    (target) => target.pathname.startsWith(`${ENDPOINT_PATH}/`),
    (route) => handlers.onFrame(route, session)
  );

  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => (globalThis as PageGlobal).__frapxRender !== undefined, undefined, {
      timeout: handlers.timeout * 1000
    });
  } catch (error) {
    await session.close();
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `${url} did not call registerRenderTarget() from @frapx/tool-capture within ${handlers.timeout}s.`
      );
    }
    throw error;
  }
  const version = await page.evaluate(() => (globalThis as PageGlobal).__frapxRender!.version);
  if (version !== 1) {
    await session.close();
    throw new Error(`The page speaks render protocol version ${String(version)}; this CLI speaks 1.`);
  }
  loaded = true;
  return session;
};

const readRenderer = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });

/** Turns a rejected evaluation into the session's failure, a recoverable crash, or a page error. */
const classify = (error: unknown, session: Session): Error => {
  if (session.failure) return session.failure;
  const message = error instanceof Error ? error.message : String(error);
  // The evaluation can fail before the new document reports itself.
  if (/Execution context was destroyed/i.test(message)) return navigationError();
  if (session.page.isClosed() || /Target (page, context or browser )?(has been )?closed|crashed/i.test(message)) {
    return new RecoverableError("the page crashed");
  }
  return new Error(message.replace(/^page\.evaluate: /, ""));
};

const resolveSource = async (
  source: string
): Promise<{ url: string; id: string; server: StaticServer | null }> => {
  const info = await stat(source).catch(() => null);
  if (info?.isDirectory()) {
    const server = await serveDirectory(source);
    return { url: server.url, id: resolve(source), server };
  }
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`${source} is neither a directory nor a URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http(s) URLs and directories can be rendered, got ${source}.`);
  }
  return { url: url.href, id: url.href, server: null };
};

const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("The render was stopped.", "AbortError");

/**
 * Renders the frames of a page that called `registerRenderTarget()` into
 * `options.out`, skipping existing frames with `resume`, opening the page
 * again after a crash or a lost WebGL context, and encoding videos at the end.
 */
export const render = async (
  options: RenderOptions,
  hooks: { signal?: AbortSignal; onEvent?: (event: RenderEvent) => void } = {}
): Promise<RenderResult> => {
  const { signal, onEvent } = hooks;
  const out = resolve(options.out);
  if (options.encode.length > 0) await assertFfmpeg();
  signal?.throwIfAborted();

  const state = await openOutput(out);
  const source = await resolveSource(options.source);
  let browser: Browser | null = null;
  let session: Session | null = null;

  const stopped = new Promise<never>((_, reject) => {
    if (!signal) return;
    if (signal.aborted) reject(abortError(signal));
    signal.addEventListener("abort", () => reject(abortError(signal)), { once: true });
  });
  stopped.catch(() => {});

  try {
    browser = await launchBrowser(options);
    let expected = new Set<number>();
    let completed = 0;
    let total = 0;
    let started = 0;

    const handlers: SessionHandlers = {
      timeout: options.timeout,
      onPageError: (message) => onEvent?.({ type: "page-error", message }),
      async onFrame(route, current) {
        const request = route.request();
        const rest = new URL(request.url()).pathname.slice(ENDPOINT_PATH.length + 1);
        if (request.method() !== "POST" || !rest.startsWith("frame/")) {
          await route.fulfill({ status: 404 });
          return;
        }
        const name = decodeURIComponent(rest.slice("frame/".length));
        const frame = parseFrameFileName(name);
        if (frame === null || !expected.has(frame)) {
          await route.fulfill({ status: 400, body: `Unexpected frame ${name}` });
          return;
        }
        if (current.failure) {
          // Read after the context was lost, so possibly blank.
          await route.fulfill({ status: 409, body: current.failure.message });
          return;
        }
        const body = request.postDataBuffer();
        if (!body || body.length === 0) {
          await route.fulfill({ status: 400, body: `Empty frame ${name}` });
          return;
        }
        try {
          await writeFrame(out, name, body);
        } catch (error) {
          await route.fulfill({ status: 500, body: error instanceof Error ? error.message : String(error) });
          return;
        }
        // The context may have been lost while this frame was being written.
        const lateFailure = failureOf(current);
        if (lateFailure) {
          await rm(join(out, name), { force: true });
          await route.fulfill({ status: 409, body: lateFailure.message });
          return;
        }
        expected.delete(frame);
        current.written++;
        current.lastWritten = frame;
        completed++;
        onEvent?.({
          type: "frame",
          frame,
          completed,
          total,
          secondsPerFrame: (performance.now() - started) / 1000 / completed
        });
        await route.fulfill({ status: 204 });
      }
    };

    session = await Promise.race([openSession(browser, source.url, handlers), stopped]);
    const renderer = await readRenderer(session.page);
    if (!renderer) throw new Error("WebGL is not available in this browser.");
    if (SOFTWARE_RENDERER.test(renderer) && !options.allowSoftware) {
      throw new Error(
        `WebGL runs on a software renderer (${renderer}), which is far too slow for rendering. Use a GPU (try --headed or --browser chrome), or pass --allow-software.`
      );
    }

    const described = await session.page.evaluate(() => (globalThis as PageGlobal).__frapxRender!.describe());
    const fps = options.fps ?? described.fps;
    const range = options.range ?? ([0, Math.max(1, Math.round(described.duration * fps)) - 1] as const);
    const settings: RenderSettings = {
      source: source.id,
      fps,
      format: options.format,
      resolution: options.resolution ?? null,
      params: options.params
    };
    const pending = planFrames(state, settings, range, options.resume, out);
    const saved = state.manifest?.range;
    await writeManifest(out, {
      tool: "@frapx/tool-render",
      version: 1,
      ...settings,
      range: saved ? [Math.min(saved[0], range[0]), Math.max(saved[1], range[1])] : range
    });

    expected = new Set(pending);
    total = pending.length;
    started = performance.now();
    onEvent?.({ type: "start", url: source.url, renderer, fps, range, pending: total });

    const endpoint = new URL(ENDPOINT_PATH, source.url).href;
    let failures = 0;
    while (expected.size > 0) {
      signal?.throwIfAborted();
      const current: Session =
        session ?? (await Promise.race([openSession(browser, source.url, handlers), stopped]));
      session = current;
      try {
        for (const [startFrame, frameCount] of contiguousRuns([...expected].sort((a, b) => a - b))) {
          const job: RenderJob = {
            startFrame,
            frameCount,
            fps,
            format: options.format,
            resolution: settings.resolution,
            params: settings.params,
            endpoint
          };
          const evaluation = current.page.evaluate(
            (next) => (globalThis as PageGlobal).__frapxRender!.render(next),
            job
          );
          evaluation.catch(() => {});
          await Promise.race([evaluation, current.failed, stopped]);
          for (let frame = startFrame; frame < startFrame + frameCount; frame++) {
            if (expected.has(frame)) {
              throw new Error(`The page's render() finished without writing frame ${frame}.`);
            }
          }
        }
      } catch (error) {
        if (signal?.aborted) throw abortError(signal);
        const failure = classify(error, current);
        if (!(failure instanceof RecoverableError)) throw failure;

        const distrusted = failure.distrustLastFrame ? current.lastWritten : null;
        if (distrusted !== null) {
          await rm(join(out, frameFileName(distrusted)), { force: true });
          expected.add(distrusted);
          completed--;
        }
        // A frame rendered again does not count as progress, or a context
        // lost on the same frame every time would retry forever.
        const progressed = current.written - (distrusted === null ? 0 : 1) > 0;
        failures = progressed ? 1 : failures + 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          throw new Error(`Gave up after ${failures} failures in a row; last: ${failure.message}.`);
        }
        onEvent?.({ type: "retry", reason: failure.message, attempt: failures });
        await current.close();
        session = null;
      }
    }

    await session?.close();
    session = null;
    await browser.close();
    browser = null;

    const videos: string[] = [];
    for (const encoder of options.encode) {
      signal?.throwIfAborted();
      const file = await encodeVideo(out, encoder, fps, range);
      videos.push(file);
      onEvent?.({ type: "encode", encoder, file });
    }
    return { out, range, rendered: completed, videos };
  } finally {
    await session?.close();
    await browser?.close().catch(() => {});
    await source.server?.close();
  }
};
