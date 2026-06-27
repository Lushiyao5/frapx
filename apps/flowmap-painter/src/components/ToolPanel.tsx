import type { BrushSettings, BrushType } from "../hooks/useBrushEngine";

interface ToolPanelProps {
  brush: BrushSettings;
  onChange: (brush: BrushSettings) => void;
}

const BRUSH_TYPES: { value: BrushType; label: string; title: string }[] = [
  { value: "stroke", label: "Stroke", title: "Direction follows mouse stroke" },
  { value: "fixed", label: "Fixed", title: "Fixed direction (set angle below)" },
  { value: "vortex-cw", label: "Vortex ↻", title: "Clockwise vortex" },
  { value: "vortex-ccw", label: "Vortex ↺", title: "Counter-clockwise vortex" },
  { value: "radial-out", label: "Radial ↗", title: "Outward radial flow" },
  { value: "radial-in", label: "Radial ↙", title: "Inward radial flow" },
  { value: "smooth", label: "Smooth", title: "Blur / smooth existing flow" },
  { value: "erase", label: "Erase", title: "Reset flow to neutral" }
];

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
        <span className="tool-slider-value">
          {step < 1 ? value.toFixed(2) : Math.round(value)}
        </span>
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

function set<K extends keyof BrushSettings>(
  brush: BrushSettings,
  key: K,
  value: BrushSettings[K]
): BrushSettings {
  return { ...brush, [key]: value };
}

export function ToolPanel({ brush, onChange }: ToolPanelProps) {
  return (
    <aside className="tool-panel">
      <section className="tool-section">
        <h2 className="tool-section-title">Brush</h2>
        <div className="brush-grid">
          {BRUSH_TYPES.map(({ value, label, title }) => (
            <button
              key={value}
              type="button"
              className={`brush-btn${brush.type === value ? " brush-btn--active" : ""}`}
              title={title}
              onClick={() => { onChange(set(brush, "type", value)); }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="tool-section">
        <h2 className="tool-section-title">Settings</h2>
        <Slider
          label="Size"
          value={brush.size}
          min={4}
          max={512}
          step={1}
          onChange={(v) => { onChange(set(brush, "size", v)); }}
        />
        <Slider
          label="Strength"
          value={brush.strength}
          min={0.01}
          max={1}
          step={0.01}
          onChange={(v) => { onChange(set(brush, "strength", v)); }}
        />
        <Slider
          label="Hardness"
          value={brush.hardness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => { onChange(set(brush, "hardness", v)); }}
        />

        {brush.type === "fixed" && (
          <Slider
            label="Angle °"
            value={brush.fixedAngleDeg}
            min={0}
            max={359}
            step={1}
            onChange={(v) => { onChange(set(brush, "fixedAngleDeg", v)); }}
          />
        )}
      </section>

      <section className="tool-section">
        <h2 className="tool-section-title">Pressure</h2>
        <label className="tool-checkbox">
          <input
            type="checkbox"
            checked={brush.pressureSize}
            onChange={(e) => {
              onChange(set(brush, "pressureSize", e.currentTarget.checked));
            }}
          />
          Size
        </label>
        <label className="tool-checkbox">
          <input
            type="checkbox"
            checked={brush.pressureStrength}
            onChange={(e) => {
              onChange(
                set(brush, "pressureStrength", e.currentTarget.checked)
              );
            }}
          />
          Strength
        </label>
      </section>
    </aside>
  );
}
