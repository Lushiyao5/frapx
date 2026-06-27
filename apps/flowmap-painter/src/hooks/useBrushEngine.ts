import { type RefObject, useEffect, useRef } from "react";
import { getBrushSprite, type SpriteBrushType } from "../lib/brushSprites";
import { encodeDir, NEUTRAL_R, NEUTRAL_G } from "../lib/encoding";
import { seamlessPositions } from "../lib/seamless";

export type BrushType =
  | "stroke"
  | "fixed"
  | "vortex-cw"
  | "vortex-ccw"
  | "radial-out"
  | "radial-in"
  | "smooth"
  | "erase";

export interface BrushSettings {
  type: BrushType;
  size: number;
  strength: number;
  hardness: number;
  fixedAngleDeg: number;
  pressureSize: boolean;
  pressureStrength: boolean;
}

interface BrushEngineCallbacks {
  onStrokeStart: () => void;
  onStamp: () => void;
  onStrokeEnd: () => void;
}

// Minimum movement between stamps (fraction of brush size), capped to an absolute max
const SPACING_FACTOR = 0.15;
const MAX_SPACING = 16; // px cap so large brushes stay responsive
// How much to steer the smoothed heading toward the current segment direction per stamp.
// Range 0–1: lower = smoother but slower to follow curves; higher = more responsive but noisier.
const DIR_SMOOTH = 0.25;

/** Box-blur the RG channels in a canvas region (smooth brush) */
function applyBoxBlur(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number
): void {
  const r = Math.floor(radius);
  const sx = Math.max(0, Math.floor(cx - r));
  const sy = Math.max(0, Math.floor(cy - r));
  const ex = Math.min(ctx.canvas.width - 1, Math.ceil(cx + r));
  const ey = Math.min(ctx.canvas.height - 1, Math.ceil(cy + r));
  const sw = ex - sx + 1;
  const sh = ey - sy + 1;
  if (sw < 3 || sh < 3) return;

  const imageData = ctx.getImageData(sx, sy, sw, sh);
  const src = imageData.data;
  const tmp = new Uint8ClampedArray(src.length);

  const ksize = Math.max(3, Math.round(r / 3) | 1); // odd kernel size
  const khalf = (ksize - 1) >> 1;

  // Horizontal pass (only R and G channels)
  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      let sumR = 0;
      let sumG = 0;
      for (let k = -khalf; k <= khalf; k++) {
        const kx = Math.max(0, Math.min(sw - 1, px + k));
        const ki = (py * sw + kx) * 4;
        sumR += src[ki] ?? NEUTRAL_R;
        sumG += (src[ki + 1]) ?? NEUTRAL_G;
      }
      const ti = (py * sw + px) * 4;
      tmp[ti] = Math.round(sumR / ksize);
      tmp[ti + 1] = Math.round(sumG / ksize);
      tmp[ti + 2] = src[ti + 2] ?? 0;
      tmp[ti + 3] = src[ti + 3] ?? 255;
    }
  }

  // Vertical pass
  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      let sumR = 0;
      let sumG = 0;
      for (let k = -khalf; k <= khalf; k++) {
        const ky = Math.max(0, Math.min(sh - 1, py + k));
        const ki = (ky * sw + px) * 4;
        sumR += tmp[ki] ?? NEUTRAL_R;
        sumG += (tmp[ki + 1]) ?? NEUTRAL_G;
      }
      const ti = (py * sw + px) * 4;
      src[ti] = Math.round(sumR / ksize);
      src[ti + 1] = Math.round(sumG / ksize);
    }
  }

  ctx.putImageData(imageData, sx, sy);
}

/** Draw a single stamp at (x, y) on the 2D canvas */
function drawStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  brush: BrushSettings,
  dx: number, // canvas-space direction (unit vector)
  dy: number,
  pressure: number
): void {
  const effectStrength =
    brush.strength * (brush.pressureStrength ? pressure : 1.0);
  const effectRadius =
    (brush.size / 2) *
    (brush.pressureSize ? Math.max(0.2, pressure) : 1.0);

  if (effectRadius < 1) return;

  if (brush.type === "smooth") {
    applyBoxBlur(ctx, x, y, effectRadius);
    return;
  }

  const isSprite =
    brush.type === "vortex-cw" ||
    brush.type === "vortex-ccw" ||
    brush.type === "radial-out" ||
    brush.type === "radial-in";

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = effectStrength;

  if (isSprite) {
    const sprite = getBrushSprite(
      brush.type as SpriteBrushType,
      Math.round(effectRadius),
      brush.hardness
    );
    ctx.drawImage(
      sprite,
      Math.round(x - effectRadius),
      Math.round(y - effectRadius)
    );
  } else {
    // Flat-color brush (stroke, fixed, erase)
    let r: number;
    let g: number;

    if (brush.type === "erase") {
      r = NEUTRAL_R;
      g = NEUTRAL_G;
    } else {
      [r, g] = encodeDir(dx, dy);
    }

    const grad = ctx.createRadialGradient(
      x,
      y,
      effectRadius * brush.hardness,
      x,
      y,
      effectRadius
    );
    grad.addColorStop(0, `rgb(${r},${g},0)`);
    grad.addColorStop(1, `rgba(${r},${g},0,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, effectRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Attaches pointer-event-based brush painting to a canvas ref.
 * Calls onStrokeStart before the first stamp of each stroke,
 * onStamp after each individual stamp, and onStrokeEnd on pointer up.
 */
export function useBrushEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  brush: BrushSettings,
  seamless: boolean,
  canvasSize: number,
  callbacks: BrushEngineCallbacks
): void {
  // Keep latest values in refs so event handlers don't need re-registration
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const seamlessRef = useRef(seamless);
  seamlessRef.current = seamless;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const maybeCanvas = canvasRef.current;
    if (maybeCanvas === null) return;
    // Alias as non-null so inner functions inherit the narrowed type
    const canvas: HTMLCanvasElement = maybeCanvas;

    let isDown = false;
    let lastX = 0;
    let lastY = 0;
    let lastDx = 1;   // smoothed heading (unit vector)
    let lastDy = 0;
    let distAccum = 0;
    let prevPressure = 0.5;
    let dirInit = false; // whether the heading has been seeded for this stroke
    let ctxCache: CanvasRenderingContext2D | null = null;

    function getCtx(): CanvasRenderingContext2D | null {
      if (ctxCache !== null) return ctxCache;
      ctxCache = canvas.getContext("2d");
      return ctxCache;
    }

    function getScaledPos(e: PointerEvent): [number, number] {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
    }

    function stamp(x: number, y: number, pressure: number): void {
      const ctx = getCtx();
      if (ctx === null) return;
      const b = brushRef.current;
      const cs = canvasSizeRef.current;
      const sm = seamlessRef.current;

      let dx: number;
      let dy: number;

      if (b.type === "fixed") {
        const rad = (b.fixedAngleDeg * Math.PI) / 180;
        dx = Math.cos(rad);
        dy = Math.sin(rad);
      } else {
        dx = lastDx;
        dy = lastDy;
      }

      const positions = sm
        ? seamlessPositions(x, y, b.size / 2, cs)
        : ([[x, y]] as const);

      for (const [px, py] of positions) {
        drawStamp(ctx, px, py, b, dx, dy, pressure);
      }

      callbacksRef.current.onStamp();
    }

    function handleDown(e: PointerEvent): void {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      isDown = true;
      distAccum = 0;
      dirInit = false;
      const [x, y] = getScaledPos(e);
      lastX = x;
      lastY = y;
      prevPressure = e.pressure > 0 ? e.pressure : 0.5;
      callbacksRef.current.onStrokeStart();
      const b = brushRef.current;
      // stroke brush follows movement; defer its first stamp until a heading exists
      // (otherwise a lone click inherits the previous stroke's stale direction).
      if (b.type !== "stroke") {
        stamp(x, y, prevPressure);
      }
    }

    function handleMove(e: PointerEvent): void {
      if (!isDown) return;
      const raw = e.getCoalescedEvents?.() ?? [];
      const events: PointerEvent[] = raw.length > 0 ? raw : [e];
      const b = brushRef.current;
      const spacing = Math.max(1, Math.min(b.size * SPACING_FACTOR, MAX_SPACING));

      for (const ce of events) {
        const [x, y] = getScaledPos(ce);
        const pressure = ce.pressure > 0 ? ce.pressure : 0.5;

        const x0 = lastX;
        const y0 = lastY;
        const ddx = x - x0;
        const ddy = y - y0;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);

        // Compute this segment's raw direction without immediately overwriting the heading.
        let segDx = lastDx;
        let segDy = lastDy;
        if (dist > 0) {
          segDx = ddx / dist;
          segDy = ddy / dist;
          // Seed the heading on the very first directed sample so there's no lag at stroke start.
          if (!dirInit) {
            lastDx = segDx;
            lastDy = segDy;
            dirInit = true;
            // cover the deferred stroke start point with the now-known heading
            if (b.type === "stroke") stamp(x0, y0, prevPressure);
          }
        }

        // Walk the segment from (x0,y0) to (x,y), stamping at equal intervals.
        // Before each stamp, steer the smoothed heading toward the segment direction (EMA).
        // This keeps adjacent stamps close in angle, preventing RGB cancellation / muddy bands.
        let travel = spacing - distAccum;
        while (travel <= dist) {
          const f = travel / dist;
          lastDx += (segDx - lastDx) * DIR_SMOOTH;
          lastDy += (segDy - lastDy) * DIR_SMOOTH;
          const hlen = Math.hypot(lastDx, lastDy) || 1;
          lastDx /= hlen;
          lastDy /= hlen;
          stamp(x0 + ddx * f, y0 + ddy * f, prevPressure + (pressure - prevPressure) * f);
          travel += spacing;
        }
        distAccum = dist - (travel - spacing);

        lastX = x;
        lastY = y;
        prevPressure = pressure;
      }
    }

    function handleUp(): void {
      if (!isDown) return;
      isDown = false;
      callbacksRef.current.onStrokeEnd();
    }

    canvas.addEventListener("pointerdown", handleDown);
    canvas.addEventListener("pointermove", handleMove);
    canvas.addEventListener("pointerup", handleUp);
    canvas.addEventListener("pointercancel", handleUp);

    return () => {
      canvas.removeEventListener("pointerdown", handleDown);
      canvas.removeEventListener("pointermove", handleMove);
      canvas.removeEventListener("pointerup", handleUp);
      canvas.removeEventListener("pointercancel", handleUp);
    };
  }, [canvasRef]); // canvasRef identity should be stable
}
