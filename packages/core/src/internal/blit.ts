import type { GLContext } from "../types";
import {
  createFullscreenBuffer,
  createProgram,
  defaultVertexShader,
  defaultVertexShader300,
  isWebGL2Context
} from "./webgl";

const blitFragmentShader = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}
`;

const blitFragmentShader300 = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_uv);
}
`;

export type Blitter = {
  /**
   * Draws `texture` as a fullscreen quad into `target` (or the default
   * framebuffer when `target` is `null`), setting the viewport to
   * `width`/`height` first. Does not save or restore any other GL state.
   */
  blit(
    texture: WebGLTexture,
    target: WebGLFramebuffer | null,
    width: number,
    height: number
  ): void;
  /** Releases the GL resources owned by this blitter. */
  dispose(): void;
};

/**
 * Creates a reusable fullscreen-quad "blit" utility: draws a texture into a
 * framebuffer (or the canvas) using a minimal passthrough shader. Intended
 * for hand-rolled multi-pass/FBO pipelines; frapx's own multi-pass features
 * are built on the same primitive.
 */
export const createBlitter = (gl: GLContext): Blitter => {
  const program = createProgram(
    gl,
    isWebGL2Context(gl) ? defaultVertexShader300 : defaultVertexShader,
    isWebGL2Context(gl) ? blitFragmentShader300 : blitFragmentShader
  );
  const buffer = createFullscreenBuffer(gl, program);
  const textureUniform = gl.getUniformLocation(program, "u_texture");

  return {
    blit(
      texture: WebGLTexture,
      target: WebGLFramebuffer | null,
      width: number,
      height: number
    ): void {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);

      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const location = gl.getAttribLocation(program, "a_position");
      if (location >= 0) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (textureUniform) {
        gl.uniform1i(textureUniform, 0);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose(): void {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    }
  };
};
