import type {
  GLContext,
  HostFrameState,
  RuntimeHostInstance,
  RuntimeHostOptions,
  ShaderStatus
} from "./types";
import { DestroyedError, TargetNotFoundError, UnsupportedError } from "./internal/errors";
import {
  resolveDpr,
  resizeCanvasToTarget,
  setupCanvas,
  type DomSetup
} from "./internal/dom";

const MAX_DELTA_SECONDS = 0.1;

type Gate = "offscreen" | "hidden" | "reducedMotion";

export const createRuntimeHost = (
  options: RuntimeHostOptions
): RuntimeHostInstance => {
  return new RuntimeHost(options);
};

class RuntimeHost implements RuntimeHostInstance {
  readonly ready: Promise<void>;

  private readonly options: RuntimeHostOptions;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private dom: DomSetup | null = null;
  private context: GLContext | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private rafId = 0;
  private running = false;
  private inRender = false;
  private destroyed = false;
  private gates = new Set<Gate>();
  private reducedMotionActive = false;
  private frame = 0;
  private elapsed = 0;
  private lastTimestamp = 0;
  private pixelRatio = 1;
  private width = 1;
  private height = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private pointer = { x: 0, y: 0, uvX: 0, uvY: 0, active: 0 };
  private removeListeners: Array<() => void> = [];
  private currentStatus: ShaderStatus = "idle";
  private contextRestoredShouldRun = false;

  constructor(options: RuntimeHostOptions) {
    this.options = options;
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    queueMicrotask(() => {
      void this.init();
    });
  }

  get canvas(): HTMLCanvasElement | null {
    return this.dom?.canvas ?? null;
  }

  get gl(): GLContext | null {
    return this.context;
  }

  get status(): ShaderStatus {
    return this.currentStatus;
  }

  get supported(): boolean {
    return !["unsupported", "destroyed"].includes(this.currentStatus);
  }

  start(): void {
    if (this.destroyed || this.currentStatus === "unsupported") return;
    this.running = true;
    this.reconcile();
  }

  stop(): void {
    this.running = false;
    this.cancelFrame();
    if (!this.destroyed && this.currentStatus !== "unsupported") {
      this.currentStatus = "paused";
    }
  }

  render(): void {
    if (
      this.destroyed ||
      !this.dom ||
      !this.context ||
      this.currentStatus === "unsupported" ||
      this.hasVisibilityBlock ||
      this.inRender
    )
      return;
    this.renderInternal(this.elapsed, 0);
  }

  resize(): void {
    if (this.destroyed || !this.dom) return;

    const prevWidth = this.width;
    const prevHeight = this.height;
    const prevViewportWidth = this.viewportWidth;
    const prevViewportHeight = this.viewportHeight;

    this.measureSize();

    const sizeChanged =
      this.width !== prevWidth ||
      this.height !== prevHeight ||
      this.viewportWidth !== prevViewportWidth ||
      this.viewportHeight !== prevViewportHeight;

    if (sizeChanged && this.context) {
      this.options.onResize?.({
        gl: this.context,
        canvas: this.dom.canvas,
        time: this.elapsed,
        delta: 0,
        frame: this.frame,
        width: this.width,
        height: this.height,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
        pixelRatio: this.pixelRatio,
        reducedMotion: this.reducedMotionActive,
        pointer: { ...this.pointer }
      });
    }

    if (this.options.renderMode === "demand" && !this.inRender) {
      this.render();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.cancelFrame();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();

    for (const remove of this.removeListeners) remove();
    this.removeListeners = [];

    this.context = null;

    if (this.dom?.createdCanvas) {
      this.dom.canvas.remove();
    }

    const dom = this.dom;
    if (dom?.restoredPosition !== null && dom && this.options.target) {
      (dom.target as HTMLElement).style.position = dom.restoredPosition!;
    }

    this.currentStatus = "destroyed";
    this.readyReject?.(new DestroyedError("Runtime host was destroyed."));
  }

  private get hasVisibilityBlock(): boolean {
    return this.gates.has("offscreen") || this.gates.has("hidden");
  }

  private get hasMotionBlock(): boolean {
    return (
      this.gates.has("reducedMotion") && this.options.renderMode !== "demand"
    );
  }

  private setGate(gate: Gate, closed: boolean): void {
    if (closed === this.gates.has(gate)) return;
    if (closed) this.gates.add(gate);
    else this.gates.delete(gate);
    this.reconcile();
  }

  private reconcile(): void {
    if (
      this.destroyed ||
      this.currentStatus === "unsupported" ||
      this.currentStatus === "error" ||
      this.currentStatus === "context-lost"
    ) {
      return;
    }

    if (this.running) {
      if (this.hasVisibilityBlock) {
        this.cancelFrame();
        this.currentStatus = "paused";
        return;
      }

      if (this.hasMotionBlock) {
        this.cancelFrame();
        this.currentStatus = "paused";
        this.renderStaticFrame();
        return;
      }

      this.currentStatus = "running";
      if (this.options.renderMode === "demand") this.render();
      else this.scheduleFrame();
      return;
    }

    if (this.options.renderMode === "demand") this.render();
  }

  private renderStaticFrame(): void {
    if (this.hasVisibilityBlock) return;
    this.renderInternal(this.elapsed, 0);
  }

  private renderInternal(time: number, delta: number): void {
    if (!this.dom || !this.context) return;
    const gl = this.context;

    this.inRender = true;
    this.measureSize();

    const state: HostFrameState = {
      gl,
      canvas: this.dom.canvas,
      time,
      delta,
      frame: this.frame,
      width: this.width,
      height: this.height,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      pixelRatio: this.pixelRatio,
      reducedMotion: this.reducedMotionActive,
      pointer: { ...this.pointer }
    };

    this.options.onDraw(state);
    this.frame++;
    this.inRender = false;
  }

  private measureSize(): void {
    if (!this.dom) return;
    this.pixelRatio = resolveDpr(this.options.dpr, this.options.maxDpr);
    const size = resizeCanvasToTarget(
      this.dom.canvas,
      this.dom.target,
      this.pixelRatio
    );
    this.width = size.width;
    this.height = size.height;
    this.viewportWidth = size.viewportWidth;
    this.viewportHeight = size.viewportHeight;
  }

  private scheduleFrame(): void {
    if (this.rafId || this.options.renderMode === "demand") return;

    this.rafId = requestAnimationFrame((timestamp) => {
      this.rafId = 0;
      if (!this.running || this.destroyed) return;

      const seconds = timestamp / 1000;
      const rawDelta = this.lastTimestamp ? seconds - this.lastTimestamp : 0;
      const delta = Math.min(Math.max(rawDelta, 0), MAX_DELTA_SECONDS);
      this.lastTimestamp = seconds;
      this.elapsed += delta;
      this.renderInternal(this.elapsed, delta);
      this.scheduleFrame();
    });
  }

  private cancelFrame(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.lastTimestamp = 0;
  }

  private async init(): Promise<void> {
    if (typeof window === "undefined" || typeof document === "undefined") {
      this.failUnsupported(new UnsupportedError("WebGL requires a browser."));
      return;
    }

    this.dom = setupCanvas({
      ...(this.options.target !== undefined && { target: this.options.target }),
      ...(this.options.canvas !== undefined && { canvas: this.options.canvas }),
      ...(this.options.layer !== undefined && { layer: this.options.layer }),
      ...(this.options.canvasClass !== undefined && { canvasClass: this.options.canvasClass }),
      ...(this.options.canvasStyle !== undefined && { canvasStyle: this.options.canvasStyle })
    });

    if (!this.dom) {
      this.failUnsupported(new TargetNotFoundError("Target or canvas not found."));
      return;
    }

    let gl: GLContext | null;
    try {
      gl = this.options.createContext(this.dom.canvas);
    } catch (error) {
      this.failUnsupported(
        error instanceof UnsupportedError
          ? error
          : new UnsupportedError(String(error))
      );
      return;
    }
    if (!gl) {
      this.failUnsupported(new UnsupportedError("WebGL is not supported."));
      return;
    }

    this.context = gl;
    this.currentStatus = "loading";

    try {
      this.setupDomObservers();
      this.setupContextEvents();
      this.measureSize();
      await this.options.onInit(gl, this.width, this.height);
      if (this.destroyed) return;
      this.currentStatus = "ready";
      this.readyResolve?.();
      this.options.onReady?.();

      if (this.running || (this.options.autoStart ?? true)) {
        this.start();
      } else if (this.options.renderMode === "demand") {
        this.render();
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private setupDomObservers(): void {
    if (!this.dom) return;

    if (this.options.autoResize ?? true) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(this.dom.target);
    }

    if (this.options.pauseWhenOffscreen ?? true) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        this.setGate("offscreen", !entry?.isIntersecting);
      });
      this.intersectionObserver.observe(this.dom.target);
    }

    if (this.options.pauseWhenHidden ?? true) {
      if (document.hidden) this.gates.add("hidden");
      const onVisibility = () => {
        this.setGate("hidden", document.hidden);
      };
      document.addEventListener("visibilitychange", onVisibility);
      this.removeListeners.push(() => {
        document.removeEventListener("visibilitychange", onVisibility);
      });
    }

    this.setupMotionObserver();

    const onPointerMove = (event: Event) => {
      if (!this.dom) return;
      const pointerEvent = event as PointerEvent;
      const rect = this.dom.target.getBoundingClientRect();
      const x = pointerEvent.clientX - rect.left;
      const y = pointerEvent.clientY - rect.top;
      this.pointer.x = x * this.pixelRatio;
      this.pointer.y = (rect.height - y) * this.pixelRatio;
      this.pointer.uvX = rect.width > 0 ? x / rect.width : 0;
      this.pointer.uvY = rect.height > 0 ? 1 - y / rect.height : 0;
      this.pointer.active = 1;

      if (this.options.renderMode === "demand") this.render();
    };
    const onPointerLeave = () => {
      this.pointer.active = 0;
      if (this.options.renderMode === "demand") this.render();
    };

    this.dom.target.addEventListener("pointermove", onPointerMove);
    this.dom.target.addEventListener("pointerenter", onPointerMove);
    this.dom.target.addEventListener("pointerleave", onPointerLeave);
    this.removeListeners.push(() => {
      this.dom?.target.removeEventListener("pointermove", onPointerMove);
      this.dom?.target.removeEventListener("pointerenter", onPointerMove);
      this.dom?.target.removeEventListener("pointerleave", onPointerLeave);
    });
  }

  private setupMotionObserver(): void {
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotionActive = query.matches;
    if (this.options.respectReducedMotion && query.matches) {
      this.gates.add("reducedMotion");
    }

    const onChange = (event: MediaQueryListEvent) => {
      this.reducedMotionActive = event.matches;
      if (this.options.respectReducedMotion) {
        this.setGate("reducedMotion", event.matches);
      } else if (this.options.renderMode === "demand") {
        this.render();
      }
    };

    query.addEventListener("change", onChange);
    this.removeListeners.push(() => {
      query.removeEventListener("change", onChange);
    });
  }

  private setupContextEvents(): void {
    if (!this.dom) return;

    const onLost = (event: Event) => {
      event.preventDefault();
      this.contextRestoredShouldRun = this.running;
      this.cancelFrame();
      this.context = null;
      this.currentStatus = "context-lost";
      this.options.onContextLost?.();
      this.options.onError?.(new UnsupportedError("WebGL context lost."));
    };

    const onRestored = () => {
      if (!this.dom || this.destroyed) return;
      const gl = this.options.createContext(this.dom.canvas);
      if (!gl) return;
      this.context = gl;

      const afterRestore = async () => {
        try {
          await this.options.onContextRestored?.(gl, this.width, this.height);
          if (this.contextRestoredShouldRun) this.start();
          else this.render();
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)));
        }
      };
      void afterRestore();
    };

    this.dom.canvas.addEventListener("webglcontextlost", onLost);
    this.dom.canvas.addEventListener("webglcontextrestored", onRestored);
    this.removeListeners.push(() => {
      this.dom?.canvas.removeEventListener("webglcontextlost", onLost);
      this.dom?.canvas.removeEventListener("webglcontextrestored", onRestored);
    });
  }

  private failUnsupported(error: Error): void {
    this.currentStatus = "unsupported";
    this.debugWarn(error.message);
    this.options.onError?.(error);
    this.readyReject?.(error);
  }

  private fail(error: Error): void {
    this.currentStatus = "error";
    this.debugWarn(error.message);
    this.options.onError?.(error);
    this.readyReject?.(error);
  }

  private debugWarn(message: string): void {
    if (this.options.debug) {
      console.warn(`[frapx/runtime] ${message}`);
    }
  }
}
