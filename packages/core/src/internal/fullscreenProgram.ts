import type { GLContext } from "../types";
import { collectUniformLocations } from "./uniforms";
import {
  createFullscreenBuffer,
  createProgram,
  defaultVertexShader,
  defaultVertexShader300,
  isGLSL300
} from "./webgl";

export type FullscreenProgram = {
  readonly program: WebGLProgram;
  /** Active uniform locations by name, array uniforms without `[0]`. */
  readonly locations: ReadonlyMap<string, WebGLUniformLocation>;
  /**
   * Binds the program, its quad buffer and `a_position`, so a draw is correct
   * whatever GL state user hooks left behind.
   */
  use(): void;
  /** Draws the fullscreen quad with the current GL state. */
  draw(): void;
  dispose(): void;
};

/**
 * Compiles `fragment` with a fullscreen-quad vertex shader (the GLSL ES 3.00
 * one when `fragment` starts with `#version 300 es`, unless `vertex` is
 * given) and leaves it bound.
 */
export const createFullscreenProgram = (
  gl: GLContext,
  fragment: string,
  vertex?: string
): FullscreenProgram => {
  const defaultVertex = isGLSL300(fragment)
    ? defaultVertexShader300
    : defaultVertexShader;
  const program = createProgram(gl, vertex ?? defaultVertex, fragment);
  gl.useProgram(program);
  const buffer = createFullscreenBuffer(gl, program);
  const attribLocation = gl.getAttribLocation(program, "a_position");
  const locations = collectUniformLocations(gl, program);

  return {
    program,
    locations,
    use() {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (attribLocation >= 0) {
        gl.enableVertexAttribArray(attribLocation);
        gl.vertexAttribPointer(attribLocation, 2, gl.FLOAT, false, 0, 0);
      }
    },
    draw() {
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    }
  };
};
