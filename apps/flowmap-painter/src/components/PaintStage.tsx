import type { BrushSettings } from "../hooks/useBrushEngine";
import { useBrushEngine } from "../hooks/useBrushEngine";

interface PaintStageProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  brush: BrushSettings;
  seamless: boolean;
  canvasSize: number;
  refImageUrl: string | null;
  refOpacity: number;
  showRgViz: boolean;
  onStrokeStart: () => void;
  onStamp: () => void;
  onStrokeEnd: () => void;
}

export function PaintStage({
  canvasRef,
  brush,
  seamless,
  canvasSize,
  refImageUrl,
  refOpacity,
  showRgViz,
  onStrokeStart,
  onStamp,
  onStrokeEnd
}: PaintStageProps) {
  useBrushEngine(canvasRef, brush, seamless, canvasSize, {
    onStrokeStart,
    onStamp,
    onStrokeEnd
  });

  return (
    <div className="paint-stage">
      {refImageUrl !== null && (
        <img
          className="paint-stage-ref"
          src={refImageUrl}
          alt="Reference"
          style={{ opacity: refOpacity }}
          draggable={false}
        />
      )}
      <canvas
        ref={canvasRef}
        className={`paint-stage-canvas${showRgViz ? " paint-stage-canvas--rgviz" : ""}`}
        style={{ touchAction: "none" }}
        aria-label="Flowmap paint canvas"
      />
    </div>
  );
}
