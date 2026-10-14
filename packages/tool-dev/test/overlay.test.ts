import { ShaderCompileError } from "@frapx/fx-canvas";
import { afterEach, describe, expect, it } from "vitest";
import { createErrorOverlay } from "../src";

const overlayRoot = () => document.querySelector("frapx-error-overlay")?.shadowRoot ?? null;
const panel = () => overlayRoot()!.querySelector<HTMLElement>(".panel")!;

const compileError = new ShaderCompileError("ERROR: 0:3: 'u_tiem' : undeclared identifier", {
  stage: "fragment",
  lines: [
    {
      line: 3,
      message: "'u_tiem' : undeclared identifier",
      source: "  float t = u_tiem;",
      context: [
        { line: 1, source: "uniform float u_time;" },
        { line: 2, source: "void main() {" },
        { line: 3, source: "  float t = u_tiem;" },
        { line: 4, source: "}" }
      ]
    }
  ]
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("createErrorOverlay", () => {
  it("stays hidden until an error is shown", () => {
    const overlay = createErrorOverlay();
    expect(overlay.visible).toBe(false);
    expect(panel().hidden).toBe(true);
  });

  it("shows located errors with numbered context and the error row marked", () => {
    const overlay = createErrorOverlay();
    overlay.show(compileError);

    expect(overlay.visible).toBe(true);
    expect(panel().hidden).toBe(false);
    expect(panel().getAttribute("role")).toBe("alert");
    expect(panel().querySelector(".title")!.textContent).toBe("ShaderCompileError");
    expect(panel().querySelector(".note")!.textContent).toBe("fragment shader");
    expect(panel().querySelector(".message")!.textContent).toBe("line 3: 'u_tiem' : undeclared identifier");

    const rows = [...panel().querySelectorAll(".row")];
    expect(rows.map((row) => row.querySelector(".number")!.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(rows.map((row) => row.hasAttribute("data-error"))).toEqual([false, false, true, false]);
    expect(rows[2]!.querySelector(".source")!.textContent).toBe("  float t = u_tiem;");
  });

  it("falls back to the raw message without located lines, and to text for non-errors", () => {
    const overlay = createErrorOverlay();
    overlay.show(new Error("Failed to create WebGL program."));
    expect(panel().querySelector(".raw")!.textContent).toBe("Failed to create WebGL program.");

    overlay.show("plain string");
    expect(panel().querySelector(".title")!.textContent).toBe("Error");
    expect(panel().querySelector(".raw")!.textContent).toBe("plain string");
  });

  it("never parses shader text as HTML", () => {
    const overlay = createErrorOverlay();
    overlay.show(new Error("<img src=x onerror=alert(1)>"));
    expect(panel().querySelector("img")).toBeNull();
    expect(panel().querySelector(".raw")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("clears, can be dismissed, and is removed by destroy()", () => {
    const overlay = createErrorOverlay({ position: "bottom" });
    expect(panel().dataset.position).toBe("bottom");
    overlay.show(compileError);
    panel().querySelector<HTMLButtonElement>(".close")!.click();
    expect(overlay.visible).toBe(false);
    expect(panel().hidden).toBe(true);

    overlay.show(compileError);
    overlay.clear();
    expect(panel().childElementCount).toBe(0);

    overlay.destroy();
    expect(overlayRoot()).toBeNull();
  });

  it("attaches to the given parent", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    createErrorOverlay({ parent });
    expect(parent.querySelector("frapx-error-overlay")).not.toBeNull();
  });
});
