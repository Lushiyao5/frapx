import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShaderBackground } from "../src";
import type { RenderState } from "../src";

// --- Controllable browser-environment harness -------------------------------
// Mirrors the harness in lifecycle.test.ts, trimmed to what resize needs.

const createMockGl = () => {
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ACTIVE_UNIFORMS: 35718,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    COLOR_BUFFER_BIT: 16384,
    FRAMEBUFFER: 36160,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    createShader: vi.fn(() => ({ id: "shader" })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    createProgram: vi.fn(() => ({ id: "program" })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_p: unknown, parameter: number) =>
      parameter === 35718 ? 0 : true
    ),
    getProgramInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({ id: "buffer" })),
    deleteBuffer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getActiveUniform: vi.fn(() => null),
    getUniformLocation: vi.fn(() => null),
    getParameter: vi.fn(() => 8),
    bindFramebuffer: vi.fn(),
    viewport: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn()
  };
  return gl as unknown as WebGLRenderingContext;
};

class Canvas {
  width = 32;
  height = 16;
  clientWidth = 32;
  clientHeight = 16;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = { add: vi.fn() };
  readonly gl = createMockGl();

  getContext(): WebGLRenderingContext {
    return this.gl;
  }

  getBoundingClientRect(): DOMRect {
    return {
      width: this.clientWidth,
      height: this.clientHeight,
      left: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  remove(): void {}
}

let rafCallbacks: Array<(t: number) => void> = [];

beforeEach(() => {
  rafCallbacks = [];

  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    matchMedia: () => ({
      matches: false,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  });
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal("HTMLImageElement", class {});
  vi.stubGlobal("HTMLCanvasElement", Canvas);
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const create = (
  canvas: Canvas,
  overrides: Partial<Parameters<typeof createShaderBackground>[0]> = {}
) =>
  createShaderBackground({
    canvas: canvas as unknown as HTMLCanvasElement,
    fragment: "void main() { gl_FragColor = vec4(1.0); }",
    ...overrides
  });

describe("onResize", () => {
  it("does not fire on initial setup", async () => {
    const onResize = vi.fn();
    const canvas = new Canvas();
    const fx = create(canvas, { onResize });
    await fx.ready;

    expect(onResize).not.toHaveBeenCalled();
  });

  it("fires with an up-to-date RenderState when the observed size changes", async () => {
    const onResize = vi.fn();
    const canvas = new Canvas();
    const fx = create(canvas, { onResize });
    await fx.ready;

    canvas.width = 64;
    canvas.height = 32;
    canvas.clientWidth = 64;
    canvas.clientHeight = 32;
    fx.resize();

    expect(onResize).toHaveBeenCalledTimes(1);
    const state = onResize.mock.calls[0]?.[0] as RenderState;
    expect(state.width).toBe(64);
    expect(state.height).toBe(32);
    expect(state.gl).toBe(canvas.gl);
    expect(state.instance).toBe(fx);
  });

  it("does not fire again when the size is unchanged", async () => {
    const onResize = vi.fn();
    const canvas = new Canvas();
    const fx = create(canvas, { onResize });
    await fx.ready;

    fx.resize();

    expect(onResize).not.toHaveBeenCalled();
  });
});
