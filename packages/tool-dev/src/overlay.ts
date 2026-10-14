/** The parts of `ShaderCompileError` the overlay reads; any `Error` also fits. */
export type OverlayError = {
  readonly name?: string;
  readonly message: string;
  readonly stage?: string | null;
  readonly lines?: ReadonlyArray<{
    readonly line: number;
    readonly message: string;
    readonly context: ReadonlyArray<{ readonly line: number; readonly source: string }>;
  }>;
};

export type ErrorOverlayOptions = {
  /** Where the overlay is attached. Defaults to `document.body`. */
  parent?: HTMLElement;
  /** Edge of the viewport it sits on. Defaults to `"top"`. */
  position?: "top" | "bottom";
};

export type ErrorOverlay = {
  /** Shows `error`, replacing whatever was shown. Non-`Error` values show as text. */
  show(error: unknown): void;
  /** Hides the overlay; `show()` brings it back. */
  clear(): void;
  /** Removes the overlay from the page. */
  destroy(): void;
  readonly visible: boolean;
};

const STYLE = `
:host { all: initial; }
.panel {
  position: fixed; left: 0; right: 0; z-index: 2147483647;
  max-height: 60vh; overflow: auto; box-sizing: border-box;
  padding: 12px 16px 16px; background: rgba(24, 8, 10, 0.94); color: #f5e9ea;
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  border-bottom: 2px solid #ff5c6c; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
}
.panel[data-position="bottom"] { bottom: 0; border-bottom: 0; border-top: 2px solid #ff5c6c; }
.panel[data-position="top"] { top: 0; }
.header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
.title { color: #ff8f9b; font-weight: 700; }
.note { color: #b9a5a8; flex: 1; }
.close {
  all: unset; cursor: pointer; padding: 0 6px; color: #f5e9ea; font-size: 18px; line-height: 1;
}
.close:focus-visible { outline: 2px solid #ff8f9b; }
.entry { margin: 10px 0 0; }
.message { color: #ffd2d7; margin-bottom: 4px; }
.code { margin: 0; padding: 6px 0; background: rgba(0, 0, 0, 0.35); border-radius: 4px; }
.row { display: flex; white-space: pre; }
.row[data-error] { background: rgba(255, 92, 108, 0.25); }
.number { min-width: 4ch; padding: 0 12px 0 8px; text-align: right; color: #8f7d80; user-select: none; }
.row[data-error] .number { color: #ff8f9b; }
.raw { margin: 0; white-space: pre-wrap; }
`;

const isOverlayError = (value: unknown): value is OverlayError =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { message?: unknown }).message === "string";

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  // Text only: shader sources and driver logs are never parsed as HTML.
  if (text !== undefined) node.textContent = text;
  return node;
};

const STAGE_NAMES: Record<string, string> = {
  vertex: "vertex shader",
  fragment: "fragment shader",
  link: "program link"
};

/**
 * Creates an overlay that shows shader compile errors on the page, with the
 * lines they point at, for hot reloading with `setFragment()`. It lives in a
 * shadow root, so page styles neither leak in nor out. Nothing is shown until
 * `show()` is called.
 */
export const createErrorOverlay = (options: ErrorOverlayOptions = {}): ErrorOverlay => {
  const host = document.createElement("frapx-error-overlay");
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const panel = element("section", "panel");
  panel.dataset.position = options.position ?? "top";
  panel.setAttribute("role", "alert");
  panel.hidden = true;
  root.append(style, panel);
  (options.parent ?? document.body).append(host);

  let visible = false;

  const render = (error: unknown) => {
    const header = element("div", "header");
    const details = isOverlayError(error) ? error : { name: "Error", message: String(error) };
    const stage = details.stage ? STAGE_NAMES[details.stage] ?? details.stage : null;
    header.append(
      element("span", "title", details.name ?? "Error"),
      element("span", "note", stage ?? "")
    );
    const close = element("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.addEventListener("click", () => overlay.clear());
    header.append(close);

    const body: HTMLElement[] = [];
    const lines = details.lines ?? [];
    for (const entry of lines) {
      const block = element("div", "entry");
      block.append(element("div", "message", `line ${entry.line}: ${entry.message}`));
      const code = element("pre", "code");
      for (const { line, source } of entry.context) {
        const row = element("div", "row");
        if (line === entry.line) row.dataset.error = "";
        row.append(element("span", "number", String(line)), element("span", "source", source));
        code.append(row);
      }
      if (entry.context.length > 0) block.append(code);
      body.push(block);
    }
    // Without located lines, the driver's log is the best there is.
    if (body.length === 0) body.push(element("pre", "raw", details.message));
    panel.replaceChildren(header, ...body);
  };

  const overlay: ErrorOverlay = {
    show(error) {
      render(error);
      panel.hidden = false;
      visible = true;
    },
    clear() {
      panel.hidden = true;
      panel.replaceChildren();
      visible = false;
    },
    destroy() {
      overlay.clear();
      host.remove();
    },
    get visible() {
      return visible;
    }
  };
  return overlay;
};
