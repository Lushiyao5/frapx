import type { CanvasSizeOption } from "../App";

interface TopBarProps {
  canvasSize: CanvasSizeOption;
  seamless: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onCanvasSizeChange: (size: CanvasSizeOption) => void;
  onSeamlessToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpen: () => void;
  onExport: () => void;
}

const SIZE_OPTIONS: CanvasSizeOption[] = [512, 1024, 2048];

export function TopBar({
  canvasSize,
  seamless,
  canUndo,
  canRedo,
  onCanvasSizeChange,
  onSeamlessToggle,
  onUndo,
  onRedo,
  onOpen,
  onExport
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo">frapx</span>
        <span className="topbar-title">Flowmap Painter</span>
      </div>

      <div className="topbar-group">
        <label className="topbar-label" htmlFor="canvas-size">
          Size
        </label>
        <select
          id="canvas-size"
          className="topbar-select"
          value={canvasSize}
          onChange={(e) => {
            onCanvasSizeChange(Number(e.currentTarget.value) as CanvasSizeOption);
          }}
        >
          {SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="topbar-group">
        <button
          type="button"
          className={`topbar-toggle${seamless ? " topbar-toggle--active" : ""}`}
          onClick={onSeamlessToggle}
          title="Toggle seamless tiling mode"
        >
          Seamless
        </button>
      </div>

      <div className="topbar-group topbar-group--history">
        <button
          type="button"
          className="topbar-btn"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          className="topbar-btn"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl+Y)"
        >
          Redo
        </button>
      </div>

      <div className="topbar-group topbar-group--actions">
        <button
          type="button"
          className="topbar-btn"
          onClick={onOpen}
          title="Open existing flowmap PNG"
        >
          Open
        </button>
        <button
          type="button"
          className="topbar-btn topbar-btn--primary"
          onClick={onExport}
          title="Export as PNG"
        >
          Export PNG
        </button>
      </div>
    </header>
  );
}
