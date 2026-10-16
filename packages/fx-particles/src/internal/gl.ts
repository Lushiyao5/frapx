import { ShaderCompileError, collectUniformLocations, parseShaderLog } from "@frapx/core";
import { CORNER_ATTRIBUTE, STATE_ATTRIBUTES, STATE_FLOATS, STATE_VARYINGS } from "./shaders";

const STRIDE = STATE_FLOATS * 4;
// Fixed so both programs read a state buffer through the same layout.
const CORNER_LOCATION = STATE_ATTRIBUTES.length;

export type Program = {
  readonly program: WebGLProgram;
  readonly locations: ReadonlyMap<string, WebGLUniformLocation>;
  dispose(): void;
};

const compile = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new ShaderCompileError("Failed to create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new ShaderCompileError(log, {
      stage: type === gl.VERTEX_SHADER ? "vertex" : "fragment",
      lines: parseShaderLog(log, source)
    });
  }
  return shader;
};

/**
 * Links a program with the state attributes at fixed locations, capturing
 * the state varyings into one interleaved buffer when `feedback` is set.
 */
export const createProgram = (
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  feedback: boolean
): Program => {
  const vertexShader = compile(gl, gl.VERTEX_SHADER, vertex);
  let fragmentShader: WebGLShader;
  try {
    fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fragment);
  } catch (error) {
    gl.deleteShader(vertexShader);
    throw error;
  }
  const program = gl.createProgram();
  if (!program) throw new ShaderCompileError("Failed to create WebGL program.");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  STATE_ATTRIBUTES.forEach((name, index) => gl.bindAttribLocation(program, index, name));
  gl.bindAttribLocation(program, CORNER_LOCATION, CORNER_ATTRIBUTE);
  if (feedback) {
    gl.transformFeedbackVaryings(program, [...STATE_VARYINGS], gl.INTERLEAVED_ATTRIBS);
  }
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
    gl.deleteProgram(program);
    throw new ShaderCompileError(log, { stage: "link" });
  }
  return {
    program,
    locations: collectUniformLocations(gl, program),
    dispose: () => gl.deleteProgram(program)
  };
};

type StateBuffer = {
  buffer: WebGLBuffer;
  /** Reads this buffer as per-vertex input of the simulation. */
  simulate: WebGLVertexArrayObject;
  /** Reads this buffer as per-instance input of the quads. */
  draw: WebGLVertexArrayObject;
};

/**
 * Two state buffers that the simulation ping-pongs between with transform
 * feedback, and the instanced quads that draw the current one.
 */
export class ParticleState {
  readonly pool: number;
  private readonly gl: WebGL2RenderingContext;
  private readonly buffers: [StateBuffer, StateBuffer];
  private readonly corners: WebGLBuffer;
  private readonly feedback: WebGLTransformFeedback;
  private current = 0;

  constructor(gl: WebGL2RenderingContext, pool: number) {
    this.gl = gl;
    this.pool = pool;
    this.corners = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.buffers = [this.createBuffer(), this.createBuffer()];
    this.feedback = gl.createTransformFeedback()!;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** Kills every particle. */
  clear(): void {
    const gl = this.gl;
    for (const state of this.buffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
      // A fresh allocation is zero-filled: lifetime 0, never spawned.
      gl.bufferData(gl.ARRAY_BUFFER, this.pool * STRIDE, gl.DYNAMIC_COPY);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.current = 0;
  }

  /** Runs the bound simulation program once over every particle. */
  step(): void {
    const gl = this.gl;
    const source = this.buffers[this.current]!;
    const target = this.buffers[1 - this.current]!;
    gl.bindVertexArray(source.simulate);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.feedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, target.buffer);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.pool);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    // A buffer still bound for feedback cannot be read as a vertex attribute.
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    this.current = 1 - this.current;
  }

  /** Draws a quad per particle with the bound render program. */
  draw(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.buffers[this.current]!.draw);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.pool);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    for (const state of this.buffers) {
      gl.deleteVertexArray(state.simulate);
      gl.deleteVertexArray(state.draw);
      gl.deleteBuffer(state.buffer);
    }
    gl.deleteBuffer(this.corners);
    gl.deleteTransformFeedback(this.feedback);
  }

  private createBuffer(): StateBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.pool * STRIDE, gl.DYNAMIC_COPY);

    const pointAt = (divisor: number) => {
      STATE_ATTRIBUTES.forEach((_, index) => {
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index, 4, gl.FLOAT, false, STRIDE, index * 16);
        gl.vertexAttribDivisor(index, divisor);
      });
    };

    const simulate = gl.createVertexArray()!;
    gl.bindVertexArray(simulate);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    pointAt(0);

    const draw = gl.createVertexArray()!;
    gl.bindVertexArray(draw);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    pointAt(1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.enableVertexAttribArray(CORNER_LOCATION);
    gl.vertexAttribPointer(CORNER_LOCATION, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    return { buffer, simulate, draw };
  }
}
