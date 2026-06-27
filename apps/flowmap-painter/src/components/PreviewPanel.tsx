import type { PreviewSettings, UsePreviewResult } from "../hooks/usePreview";
import { PREVIEW_MODES, getMode } from "../shaders/modes/index";
import type { PreviewModeId } from "../shaders/modes/index";

interface PreviewPanelProps {
  settings: PreviewSettings;
  previewResult: UsePreviewResult;
  refImageUrl: string | null;
  refOpacity: number;
  showRgViz: boolean;
  onChange: (settings: PreviewSettings) => void;
  onRefImageChange: (url: string | null) => void;
  onRefOpacityChange: (v: number) => void;
  onRgVizToggle: () => void;
  onBaseUpload: (file: File) => void;
}

function set<K extends keyof PreviewSettings>(
  s: PreviewSettings,
  key: K,
  value: PreviewSettings[K]
): PreviewSettings {
  return { ...s, [key]: value };
}

function setMode(s: PreviewSettings, id: PreviewModeId): PreviewSettings {
  return { ...s, mode: id, modeParams: { ...getMode(id).defaults } };
}

function setModeParam(s: PreviewSettings, key: string, value: number): PreviewSettings {
  return { ...s, modeParams: { ...s.modeParams, [key]: value } };
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="tool-slider">
      <span className="tool-slider-label">
        {label}
        <span className="tool-slider-value">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => { onChange(Number(e.currentTarget.value)); }}
      />
    </label>
  );
}

export function PreviewPanel({
  settings,
  previewResult,
  refImageUrl,
  refOpacity,
  showRgViz,
  onChange,
  onRefImageChange,
  onRefOpacityChange,
  onRgVizToggle,
  onBaseUpload
}: PreviewPanelProps) {
  const { containerRef, status, error } = previewResult;

  const handleBaseFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file !== undefined) {
      onBaseUpload(file);
      onChange(set(settings, "base", "uploaded"));
    }
    e.currentTarget.value = "";
  };

  const handleRefFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file !== undefined) {
      const url = URL.createObjectURL(file);
      onRefImageChange(url);
    }
    e.currentTarget.value = "";
  };

  return (
    <div className="preview-panel">
      <div className="preview-viewport-wrap">
      <div
        className="preview-viewport"
        ref={containerRef}
        aria-label={`Flow preview (${status})`}
      >
        {(status === "loading" || status === "idle") && (
          <div className="preview-loading">Loading…</div>
        )}
        {status === "unsupported" && (
          <div className="preview-error">WebGL2 not supported on this device</div>
        )}
        {status === "error" && (
          <div className="preview-error">
            {error?.message ?? "WebGL error — check console"}
          </div>
        )}
      </div>
      </div>

      <div className="preview-controls">
        <section className="tool-section">
          <h2 className="tool-section-title">Preview</h2>
          <div className="preview-base-row">
            {PREVIEW_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`brush-btn${settings.mode === m.id ? " brush-btn--active" : ""}`}
                onClick={() => { onChange(setMode(settings, m.id)); }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Slider
            label="Speed"
            value={settings.flowSpeed}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => { onChange(set(settings, "flowSpeed", v)); }}
          />
          <Slider
            label="Strength"
            value={settings.flowStrength}
            min={0.01}
            max={0.8}
            step={0.01}
            onChange={(v) => { onChange(set(settings, "flowStrength", v)); }}
          />
          <Slider
            label="Tiling"
            value={settings.tiling}
            min={1}
            max={8}
            step={0.5}
            onChange={(v) => { onChange(set(settings, "tiling", v)); }}
          />
          {getMode(settings.mode).controls.map((ctrl) => (
            <Slider
              key={ctrl.key}
              label={ctrl.label}
              value={settings.modeParams[ctrl.key] ?? ctrl.default}
              min={ctrl.min}
              max={ctrl.max}
              step={ctrl.step}
              onChange={(v) => { onChange(setModeParam(settings, ctrl.key, v)); }}
            />
          ))}
        </section>

        <section className="tool-section">
          <h2 className="tool-section-title">Base Texture</h2>
          <div className="preview-base-row">
            <button
              type="button"
              className={`brush-btn${settings.base === "water" ? " brush-btn--active" : ""}`}
              onClick={() => { onChange(set(settings, "base", "water")); }}
            >
              Water
            </button>
            <button
              type="button"
              className={`brush-btn${settings.base === "noise" ? " brush-btn--active" : ""}`}
              onClick={() => { onChange(set(settings, "base", "noise")); }}
            >
              Noise
            </button>
            <button
              type="button"
              className={`brush-btn${settings.base === "checker" ? " brush-btn--active" : ""}`}
              onClick={() => { onChange(set(settings, "base", "checker")); }}
            >
              Checker
            </button>
            <label
              className={`brush-btn${settings.base === "uploaded" ? " brush-btn--active" : ""}`}
              title="Upload custom base texture"
            >
              Upload
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleBaseFileChange}
              />
            </label>
          </div>
        </section>

        <section className="tool-section">
          <h2 className="tool-section-title">Reference Image</h2>
          <div className="preview-base-row">
            <label className="brush-btn" title="Load reference image">
              Load
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleRefFileChange}
              />
            </label>
            {refImageUrl !== null && (
              <button
                type="button"
                className="brush-btn"
                onClick={() => { onRefImageChange(null); }}
              >
                Clear
              </button>
            )}
          </div>
          {refImageUrl !== null && (
            <label className="tool-slider">
              <span className="tool-slider-label">
                Opacity
                <span className="tool-slider-value">
                  {refOpacity.toFixed(2)}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={refOpacity}
                onChange={(e) => {
                  onRefOpacityChange(Number(e.currentTarget.value));
                }}
              />
            </label>
          )}
        </section>

        <section className="tool-section">
          <h2 className="tool-section-title">Visualize</h2>
          <button
            type="button"
            className={`topbar-toggle${showRgViz ? " topbar-toggle--active" : ""}`}
            onClick={onRgVizToggle}
            title="Show raw RG flow direction colors"
          >
            RG viz
          </button>
        </section>
      </div>
    </div>
  );
}
