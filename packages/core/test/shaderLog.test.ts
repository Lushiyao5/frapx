import { describe, expect, it } from "vitest";
import { ShaderCompileError } from "../src/internal/errors";
import { parseShaderLog } from "../src/internal/shaderLog";

const source = ["precision mediump float;", "uniform float u_time;", "void main() {", "  gl_FragColor = vec4(x);", "}"].join(
  "\n"
);

describe("parseShaderLog", () => {
  it("locates ANGLE-style errors with two lines of context either side", () => {
    const log = [
      "ERROR: 0:4: 'x' : undeclared identifier",
      "ERROR: 0:4: 'constructor' : not enough data provided for construction",
      "ERROR: 0:4: '' : compilation terminated",
      ""
    ].join("\n");

    expect(parseShaderLog(log, source)).toEqual([
      {
        line: 4,
        message: "'x' : undeclared identifier",
        source: "  gl_FragColor = vec4(x);",
        context: [
          { line: 2, source: "uniform float u_time;" },
          { line: 3, source: "void main() {" },
          { line: 4, source: "  gl_FragColor = vec4(x);" },
          { line: 5, source: "}" }
        ]
      },
      expect.objectContaining({ line: 4, message: "'constructor' : not enough data provided for construction" })
    ]);
  });

  it("reads NVIDIA-style logs, skips warnings and duplicates, and clamps context at the start", () => {
    const log = [
      "0(1) : error C0000: syntax error, unexpected identifier",
      "0(1) : error C0000: syntax error, unexpected identifier",
      "0(2) : warning C7022: unrecognized profile specifier",
      "WARNING: 0:3: something harmless"
    ].join("\n");

    expect(parseShaderLog(log, source)).toEqual([
      {
        line: 1,
        message: "syntax error, unexpected identifier",
        source: "precision mediump float;",
        context: [
          { line: 1, source: "precision mediump float;" },
          { line: 2, source: "uniform float u_time;" },
          { line: 3, source: "void main() {" }
        ]
      }
    ]);
  });

  it("returns nothing for logs without locations, and an empty line past the end", () => {
    expect(parseShaderLog("Unknown shader compile error.", source)).toEqual([]);
    expect(parseShaderLog("ERROR: 0:40: 'main' : missing", source)[0]).toMatchObject({
      line: 40,
      source: "",
      context: []
    });
  });
});

describe("ShaderCompileError", () => {
  it("keeps the log as the message and defaults its details", () => {
    const plain = new ShaderCompileError("Failed to create WebGL program.");
    expect(plain).toMatchObject({ name: "ShaderCompileError", stage: null, lines: [] });

    const detailed = new ShaderCompileError("ERROR: 0:4: 'x'", {
      stage: "fragment",
      lines: parseShaderLog("ERROR: 0:4: 'x' : undeclared identifier", source)
    });
    expect(detailed.message).toBe("ERROR: 0:4: 'x'");
    expect(detailed.stage).toBe("fragment");
    expect(detailed.lines[0]?.line).toBe(4);
  });
});
