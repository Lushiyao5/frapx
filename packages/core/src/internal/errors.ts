export class ShaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** One line of a shader compile error, located in the source that was compiled. */
export type ShaderErrorLine = {
  /** 1-based line in the compiled source (after `glsl` template interpolation). */
  line: number;
  message: string;
  /** That line of the source, or "" when the log points past the end. */
  source: string;
  /** Up to two lines either side, with their numbers, the error line included. */
  context: ReadonlyArray<{ line: number; source: string }>;
};

/** `"link"` for program link errors, which carry no line numbers. */
export type ShaderStage = "vertex" | "fragment" | "link";

export class UnsupportedError extends ShaderError {}
export class TargetNotFoundError extends ShaderError {}
export class ShaderCompileError extends ShaderError {
  /** The stage that failed, or `null` for errors not tied to compiling a shader. */
  readonly stage: ShaderStage | null;
  /** Errors located in the source, parsed from the driver's info log. Empty when it had none. */
  readonly lines: readonly ShaderErrorLine[];

  constructor(
    message: string,
    details: { stage?: ShaderStage; lines?: readonly ShaderErrorLine[] } = {}
  ) {
    super(message);
    this.stage = details.stage ?? null;
    this.lines = details.lines ?? [];
  }
}
export class TextureLoadError extends ShaderError {}
export class DestroyedError extends ShaderError {}
