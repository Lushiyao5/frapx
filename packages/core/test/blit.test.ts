import { describe, expect, it, vi } from "vitest";
import { createBlitter } from "../src/internal/blit";
import type { GLContext } from "../src/types";

// --- Minimal WebGL mock -------------------------------------------------------

const createMockGl = (webgl2 = false) => {
  const gl: Record<string, unknown> = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    FRAMEBUFFER: 36160,
    TEXTURE0: 33984,
    TEXTURE_2D: 3553,
    createShader: vi.fn(() => ({ id: "shader" })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    createProgram: vi.fn(() => ({ id: "program" })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
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
    getUniformLocation: vi.fn(() => ({ id: "u_texture" })),
    bindFramebuffer: vi.fn(),
    viewport: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    uniform1i: vi.fn(),
    drawArrays: vi.fn()
  };
  if (webgl2) {
    gl.createVertexArray = vi.fn(() => ({ id: "vao" }));
  }
  return gl as unknown as GLContext;
};

describe("createBlitter", () => {
  it("creates a program and fullscreen buffer once", () => {
    const gl = createMockGl();
    createBlitter(gl);

    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("uses the WebGL1 passthrough shader when the context is not WebGL2", () => {
    const gl = createMockGl(false);
    createBlitter(gl);

    const sources = (gl.shaderSource as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[1] as string
    );
    expect(sources.some((src) => src.includes("#version 300 es"))).toBe(false);
  });

  it("uses the WebGL2 passthrough shader when the context supports it", () => {
    const gl = createMockGl(true);
    createBlitter(gl);

    const sources = (gl.shaderSource as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[1] as string
    );
    expect(sources.some((src) => src.includes("#version 300 es"))).toBe(true);
  });

  it("blit() binds the target, sets the viewport, and draws a fullscreen quad", () => {
    const gl = createMockGl();
    const blitter = createBlitter(gl);
    const texture = { id: "texture" } as unknown as WebGLTexture;
    const target = { id: "fbo" } as unknown as WebGLFramebuffer;

    blitter.blit(texture, target, 640, 480);

    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, target);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(gl.useProgram).toHaveBeenCalled();
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE0);
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, texture);
    expect(gl.uniform1i).toHaveBeenCalled();
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6);
  });

  it("blit() with target=null binds the default framebuffer", () => {
    const gl = createMockGl();
    const blitter = createBlitter(gl);
    const texture = { id: "texture" } as unknown as WebGLTexture;

    blitter.blit(texture, null, 100, 100);

    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null);
  });

  it("dispose() releases the program and buffer", () => {
    const gl = createMockGl();
    const blitter = createBlitter(gl);

    blitter.dispose();

    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
  });
});
