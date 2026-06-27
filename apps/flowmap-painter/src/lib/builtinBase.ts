/** Generate built-in base textures for the flowmap preview */

export type BuiltinBaseId = "water" | "noise";

const cache = new Map<BuiltinBaseId, HTMLCanvasElement>();

function makeWater(): HTMLCanvasElement {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("No 2D context");
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v =
        0.5 +
        0.22 * Math.sin(x * 0.09 + y * 0.07) +
        0.15 * Math.sin(x * 0.21 - y * 0.16 + 1.4) +
        0.09 * Math.sin(x * 0.41 + y * 0.37 + 0.9) +
        0.04 * Math.sin(x * 0.78 - y * 0.62 + 2.1);
      const lum = Math.round(v * 90 + 90);
      const i = (y * size + x) * 4;
      d[i] = Math.round(lum * 0.55);
      d[i + 1] = Math.round(lum * 0.8);
      d[i + 2] = Math.min(255, Math.round(lum * 1.1 + 60));
      d[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return c;
}

function makeNoise(): HTMLCanvasElement {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("No 2D context");
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.abs(
        Math.sin(x * 0.11 + 0.3) * Math.cos(y * 0.13) +
          Math.sin(x * 0.34 + y * 0.28) * 0.5 +
          Math.sin(x * 0.07 - y * 0.09 + 1.2) * 0.3
      );
      const lum = Math.round(Math.min(1, v) * 200 + 30);
      const i = (y * size + x) * 4;
      d[i] = lum;
      d[i + 1] = lum;
      d[i + 2] = lum;
      d[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return c;
}

export function getBuiltinBase(id: BuiltinBaseId): HTMLCanvasElement {
  let c = cache.get(id);
  if (c === undefined) {
    c = id === "water" ? makeWater() : makeNoise();
    cache.set(id, c);
  }
  return c;
}
