/** Pre-generated brush sprites for direction-varying brush types */

export type SpriteBrushType =
  | "vortex-cw"
  | "vortex-ccw"
  | "radial-out"
  | "radial-in";

const cache = new Map<string, HTMLCanvasElement>();

function cacheKey(
  type: SpriteBrushType,
  radius: number,
  hardness: number
): string {
  return `${type}:${radius}:${hardness.toFixed(2)}`;
}

/**
 * Generate a sprite canvas for a direction-varying brush.
 * Each pixel: RGB = encoded flowmap direction, A = brush shape alpha mask.
 */
function generateSprite(
  type: SpriteBrushType,
  radius: number,
  hardness: number
): HTMLCanvasElement {
  const size = radius * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("No 2D context");

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Center-relative coordinates
      const cx = px - radius + 0.5;
      const cy = py - radius + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);

      if (dist > radius) continue;

      // Alpha falloff based on hardness
      const t = dist / radius;
      const softRange = 1.0 - hardness;
      const alpha =
        softRange < 0.001
          ? 1.0
          : t <= hardness
            ? 1.0
            : 1.0 - (t - hardness) / softRange;

      // Direction based on brush type
      let dx = 0;
      let dy = 0;

      if (dist > 0.001) {
        const nx = cx / dist;
        const ny = cy / dist;

        switch (type) {
          case "radial-out":
            dx = nx;
            dy = ny;
            break;
          case "radial-in":
            dx = -nx;
            dy = -ny;
            break;
          case "vortex-cw":
            // Rotate outward normal 90° clockwise
            dx = ny;
            dy = -nx;
            break;
          case "vortex-ccw":
            // Rotate outward normal 90° counter-clockwise
            dx = -ny;
            dy = nx;
            break;
        }
      }

      // Encode: R=0.5+dx/2, G=0.5-dy/2 (negate canvas Y for WebGL)
      const r = Math.max(0, Math.min(255, Math.round(127.5 + dx * 127.5)));
      const g = Math.max(0, Math.min(255, Math.round(127.5 - dy * 127.5)));

      const idx = (py * size + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = 0;
      data[idx + 3] = Math.round(Math.max(0, alpha) * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Get (or generate and cache) a brush sprite canvas */
export function getBrushSprite(
  type: SpriteBrushType,
  radius: number,
  hardness: number
): HTMLCanvasElement {
  const k = cacheKey(type, radius, hardness);
  let sprite = cache.get(k);
  if (sprite === undefined) {
    sprite = generateSprite(type, radius, hardness);
    cache.set(k, sprite);
  }
  return sprite;
}
