import { useCallback, useEffect, useRef, useState } from "react";
import type { BrushSettings } from "./hooks/useBrushEngine";
import { useHistory } from "./hooks/useHistory";
import { usePreview } from "./hooks/usePreview";
import type { PreviewSettings } from "./hooks/usePreview";
import { NEUTRAL_CSS } from "./lib/encoding";
import { exportPng, loadPngToCanvas, fileToDataUrl } from "./lib/encoding";
import { TopBar } from "./components/TopBar";
import { ToolPanel } from "./components/ToolPanel";
import { PaintStage } from "./components/PaintStage";
import { PreviewPanel } from "./components/PreviewPanel";

export type CanvasSizeOption = 512 | 1024 | 2048;

const lsKey = (size: CanvasSizeOption) => `frapx-flowmap-${size}`;

const DEFAULT_BRUSH: BrushSettings = {
  type: "stroke",
  size: 60,
  strength: 0.8,
  hardness: 0.3,
  fixedAngleDeg: 0,
  pressureSize: true,
  pressureStrength: true
};

const DEFAULT_PREVIEW: PreviewSettings = {
  mode: "advect",
  modeParams: {},
  base: "checker",
  uploadedBaseUrl: null,
  flowSpeed: 0.5,
  flowStrength: 0.2,
  tiling: 2
};

export default function App() {
  const [brush, setBrush] = useState<BrushSettings>(DEFAULT_BRUSH);
  const [canvasSize, setCanvasSize] = useState<CanvasSizeOption>(1024);
  const [seamless, setSeamless] = useState(false);
  const [preview, setPreview] = useState<PreviewSettings>(DEFAULT_PREVIEW);
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [refOpacity, setRefOpacity] = useState(0.4);
  const [showRgViz, setShowRgViz] = useState(false);

  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const history = useHistory(paintCanvasRef);
  const previewResult = usePreview(paintCanvasRef, seamless, preview);

  // Keep latest stable refs for initCanvas (avoids stale closure deps)
  const historyRef = useRef(history);
  historyRef.current = history;
  const updateFlowRef = useRef(previewResult.updateFlow);
  updateFlowRef.current = previewResult.updateFlow;

  /** Initialize (or resize) the canvas and restore from localStorage if available */
  const initCanvas = useCallback((size: CanvasSizeOption) => {
    const canvas = paintCanvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = NEUTRAL_CSS;
    ctx.fillRect(0, 0, size, size);

    historyRef.current.clear();

    const saved = localStorage.getItem(lsKey(size));
    if (saved !== null) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, size, size);
        updateFlowRef.current();
      };
      img.src = saved;
    } else {
      updateFlowRef.current();
    }
  }, []); // stable — uses only refs

  // Initialize on mount and on canvas size change
  useEffect(() => {
    initCanvas(canvasSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize]); // initCanvas is stable

  // Keyboard Undo / Redo
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        historyRef.current.undo();
        updateFlowRef.current();
      } else if (
        (mod && e.key === "y") ||
        (mod && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        historyRef.current.redo();
        updateFlowRef.current();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => { window.removeEventListener("keydown", handleKey); };
  }, []);

  const autoSave = useCallback(() => {
    const canvas = paintCanvasRef.current;
    if (canvas === null) return;
    try {
      localStorage.setItem(lsKey(canvasSize), canvas.toDataURL());
    } catch {
      // Storage quota exceeded — silently ignore
    }
  }, [canvasSize]);

  const handleStrokeStart = useCallback(() => {
    historyRef.current.snapshot();
  }, []);

  const handleStamp = useCallback(() => {
    updateFlowRef.current();
  }, []);

  const handleStrokeEnd = useCallback(() => {
    autoSave();
  }, [autoSave]);

  const handleCanvasSizeChange = useCallback(
    (size: CanvasSizeOption) => {
      if (size === canvasSize) return;
      if (!confirm(`Resize to ${size}×${size}? Current content will be cleared.`))
        return;
      setCanvasSize(size);
    },
    [canvasSize]
  );

  const handleExport = useCallback(async () => {
    const canvas = paintCanvasRef.current;
    if (canvas === null) return;
    const blob = await exportPng(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowmap_${canvasSize}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [canvasSize]);

  const handleOpen = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file === undefined) return;
      const canvas = paintCanvasRef.current;
      if (canvas === null) return;
      historyRef.current.snapshot();
      loadPngToCanvas(file, canvas)
        .then(() => {
          updateFlowRef.current();
          autoSave();
        })
        .catch((err: unknown) => {
          console.error("Failed to open flowmap:", err);
        });
    };
    input.click();
  }, [autoSave]);

  const handleBaseUpload = useCallback(async (file: File) => {
    const url = await fileToDataUrl(file);
    setPreview((prev) => ({ ...prev, uploadedBaseUrl: url, base: "uploaded" }));
  }, []);

  const handleRefImageChange = useCallback(
    (url: string | null) => {
      if (refImageUrl !== null) URL.revokeObjectURL(refImageUrl);
      setRefImageUrl(url);
    },
    [refImageUrl]
  );

  return (
    <div className="app">
      <TopBar
        canvasSize={canvasSize}
        seamless={seamless}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onCanvasSizeChange={handleCanvasSizeChange}
        onSeamlessToggle={() => { setSeamless((s) => !s); }}
        onUndo={() => {
          history.undo();
          previewResult.updateFlow();
        }}
        onRedo={() => {
          history.redo();
          previewResult.updateFlow();
        }}
        onOpen={handleOpen}
        onExport={() => { void handleExport(); }}
      />

      <main className="app-main">
        <ToolPanel brush={brush} onChange={setBrush} />

        <PaintStage
          canvasRef={paintCanvasRef}
          brush={brush}
          seamless={seamless}
          canvasSize={canvasSize}
          refImageUrl={refImageUrl}
          refOpacity={refOpacity}
          showRgViz={showRgViz}
          onStrokeStart={handleStrokeStart}
          onStamp={handleStamp}
          onStrokeEnd={handleStrokeEnd}
        />

        <PreviewPanel
          settings={preview}
          previewResult={previewResult}
          refImageUrl={refImageUrl}
          refOpacity={refOpacity}
          showRgViz={showRgViz}
          onChange={setPreview}
          onRefImageChange={handleRefImageChange}
          onRefOpacityChange={setRefOpacity}
          onRgVizToggle={() => { setShowRgViz((v) => !v); }}
          onBaseUpload={(file) => { void handleBaseUpload(file); }}
        />
      </main>
    </div>
  );
}
