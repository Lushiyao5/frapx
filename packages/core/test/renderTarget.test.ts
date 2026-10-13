import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPingPong,
  createRenderTarget,
  supportsRenderTargetFormat
} from "../src/internal/renderTarget";
import { UnsupportedError } from "../src/internal/errors";
import type { GLContext } from "../src/types";

// --- Minimal WebGL mock -------------------------------------------------------

const createMockGl = ({
  webgl2 = false,
  colorBufferFloat = false,
  floatLinear = false
}: { webgl2?: boolean; colorBufferFloat?: boolean; floatLinear?: boolean } = {}) => {
  let textureId = 0;
  let framebufferId = 0;
  const gl: Record<string, unknown> = {
    FRAMEBUFFER: 36160,
    FRAMEBUFFER_COMPLETE: 36053,
    COLOR_ATTACHMENT0: 36064,
    COLOR_BUFFER_BIT: 16384,
    TEXTURE_2D: 3553,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    CLAMP_TO_EDGE: 33071,
    REPEAT: 10497,
    MIRRORED_REPEAT: 33648,
    LINEAR: 9729,
    NEAREST: 9728,
    RGBA: 6408,
    RGBA16F: 34842,
    RGBA32F: 34836,
    UNSIGNED_BYTE: 5121,
    HALF_FLOAT: 5131,
    FLOAT: 5126,
    createTexture: vi.fn(() => ({ id: `texture-${textureId++}` })),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    createFramebuffer: vi.fn(() => ({ id: `framebuffer-${framebufferId++}` })),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 36053),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    getExtension: vi.fn((name: string) =>
      (name === "EXT_color_buffer_float" && colorBufferFloat) ||
      (name === "OES_texture_float_linear" && floatLinear)
        ? {}
        : null
    )
  };
  if (webgl2) {
    gl.createVertexArray = vi.fn();
  }
  return gl as unknown as GLContext & Record<string, ReturnType<typeof vi.fn>>;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("supportsRenderTargetFormat", () => {
  it("always supports rgba8", () => {
    expect(supportsRenderTargetFormat(createMockGl(), "rgba8")).toBe(true);
  });

  it("needs WebGL2 and EXT_color_buffer_float for rgba16f", () => {
    expect(supportsRenderTargetFormat(createMockGl(), "rgba16f")).toBe(false);
    expect(
      supportsRenderTargetFormat(createMockGl({ webgl2: true }), "rgba16f")
    ).toBe(false);
    expect(
      supportsRenderTargetFormat(
        createMockGl({ webgl2: true, colorBufferFloat: true }),
        "rgba16f"
      )
    ).toBe(true);
  });
});

describe("createRenderTarget", () => {
  it("allocates rgba8 storage and clears it to the clear color", () => {
    const gl = createMockGl();
    const target = createRenderTarget(gl, 4, 2, { clearColor: [1, 0, 0, 1] });

    expect(target.format).toBe("rgba8");
    expect(target.width).toBe(4);
    expect(target.height).toBe(2);
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D, 0, gl.RGBA, 4, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    expect(gl.clearColor).toHaveBeenCalledWith(1, 0, 0, 1);
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
  });

  it("allocates half-float storage when rgba16f is supported", () => {
    const gl = createMockGl({ webgl2: true, colorBufferFloat: true });
    const target = createRenderTarget(gl, 4, 2, { format: "rgba16f" });

    expect(target.format).toBe("rgba16f");
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 2, 0, gl.RGBA, gl.HALF_FLOAT, null
    );
  });

  it("allocates float storage when rgba32f is supported", () => {
    const gl = createMockGl({ webgl2: true, colorBufferFloat: true });
    const target = createRenderTarget(gl, 4, 2, { format: "rgba32f" });

    expect(target.format).toBe("rgba32f");
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D, 0, gl.RGBA32F, 4, 2, 0, gl.RGBA, gl.FLOAT, null
    );
  });

  it("samples rgba32f with nearest filtering unless float linear filtering exists", () => {
    const plain = createMockGl({ webgl2: true, colorBufferFloat: true });
    createRenderTarget(plain, 4, 2, { format: "rgba32f" });
    expect(plain.texParameteri).toHaveBeenCalledWith(
      plain.TEXTURE_2D, plain.TEXTURE_MIN_FILTER, plain.NEAREST
    );

    const linear = createMockGl({ webgl2: true, colorBufferFloat: true, floatLinear: true });
    createRenderTarget(linear, 4, 2, { format: "rgba32f" });
    expect(linear.texParameteri).toHaveBeenCalledWith(
      linear.TEXTURE_2D, linear.TEXTURE_MIN_FILTER, linear.LINEAR
    );
  });

  it("warns and falls back to rgba8 when rgba16f is unsupported", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gl = createMockGl();
    const target = createRenderTarget(gl, 4, 2, { format: "rgba16f" });

    expect(target.format).toBe("rgba8");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D, 0, gl.RGBA, 4, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null
    );
  });

  it("throws UnsupportedError in strict mode", () => {
    const gl = createMockGl({ webgl2: true });
    expect(() =>
      createRenderTarget(gl, 4, 2, { format: "rgba16f", formatFallback: false })
    ).toThrow(UnsupportedError);
    expect(gl.createTexture).not.toHaveBeenCalled();
  });

  it("reallocates only when the size changes", () => {
    const gl = createMockGl();
    const target = createRenderTarget(gl, 4, 2);
    const first = target.texture;

    target.resize(4, 2);
    expect(gl.deleteTexture).not.toHaveBeenCalled();

    target.resize(8, 4);
    expect(gl.deleteTexture).toHaveBeenCalledWith(first);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(target.texture).not.toBe(first);
    expect([target.width, target.height]).toEqual([8, 4]);
  });

  it("releases GL objects when the framebuffer is incomplete", () => {
    const gl = createMockGl();
    gl.checkFramebufferStatus.mockReturnValue(0);

    expect(() => createRenderTarget(gl, 4, 2)).toThrow(/incomplete/);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
  });
});

describe("createPingPong", () => {
  it("swaps read and write targets", () => {
    const gl = createMockGl();
    const pingPong = createPingPong(gl, 4, 2);
    const { read, write } = pingPong;

    pingPong.swap();

    expect(pingPong.read).toBe(write);
    expect(pingPong.write).toBe(read);
  });

  it("warns once when both targets fall back", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pingPong = createPingPong(createMockGl(), 4, 2, { format: "rgba16f" });

    expect(pingPong.format).toBe("rgba8");
    expect(pingPong.read.format).toBe("rgba8");
    expect(pingPong.write.format).toBe("rgba8");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("clears, resizes and disposes both targets", () => {
    const gl = createMockGl();
    const pingPong = createPingPong(gl, 4, 2);
    gl.clear.mockClear();

    pingPong.clear();
    expect(gl.clear).toHaveBeenCalledTimes(2);

    pingPong.resize(8, 8);
    expect([pingPong.read.width, pingPong.write.height]).toEqual([8, 8]);

    gl.deleteTexture.mockClear();
    pingPong.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  });
});
