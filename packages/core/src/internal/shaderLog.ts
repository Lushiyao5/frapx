import type { ShaderErrorLine } from "./errors";

// Browsers translate shaders through ANGLE: "ERROR: 0:12: 'x' : undeclared identifier".
const ANGLE_STYLE = /^\s*ERROR:\s*\d+:(\d+):\s*(.*)$/;
// Native NVIDIA-style drivers: "0(12) : error C1008: undefined variable".
const NVIDIA_STYLE = /^\s*\d+\((\d+)\)\s*:\s*error\s*\w*\s*:\s*(.*)$/i;
// Follow-up noise after the real error.
const NOISE = /compilation terminated|^\s*''\s*:\s*$/i;

const CONTEXT_LINES = 2;

/**
 * Finds the errors in a shader info log and attaches the source lines they
 * point at. Lines the log does not locate are left out; the log itself stays
 * the error message.
 */
export const parseShaderLog = (log: string, source: string): ShaderErrorLine[] => {
  const sourceLines = source.split(/\r?\n/);
  const lineAt = (line: number) => sourceLines[line - 1] ?? "";
  const results: ShaderErrorLine[] = [];
  const seen = new Set<string>();

  for (const entry of log.split(/\r?\n/)) {
    const match = ANGLE_STYLE.exec(entry) ?? NVIDIA_STYLE.exec(entry);
    if (!match) continue;
    const line = Number(match[1]);
    const message = match[2]!.trim();
    if (!message || NOISE.test(message)) continue;
    const key = `${line}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const context: Array<{ line: number; source: string }> = [];
    const first = Math.max(1, line - CONTEXT_LINES);
    const last = Math.min(sourceLines.length, line + CONTEXT_LINES);
    for (let current = first; current <= last; current++) {
      context.push({ line: current, source: lineAt(current) });
    }
    results.push({ line, message, source: lineAt(line), context });
  }
  return results;
};
