/** Neutral flowmap: no flow direction */
export const NEUTRAL_R = 128;
export const NEUTRAL_G = 128;
export const NEUTRAL_CSS = `rgb(${NEUTRAL_R},${NEUTRAL_G},0)`;

/**
 * Encode a canvas-space direction (x right=+, y down=+) to [R, G] 8-bit values.
 * Canvas Y is negated so G increases in WebGL Y-up space — stroke downward on
 * screen → flow goes downward visually in the preview.
 */
export function encodeDir(dx: number, dy: number): [number, number] {
  const r = Math.max(0, Math.min(255, Math.round(127.5 + dx * 127.5)));
  const g = Math.max(0, Math.min(255, Math.round(127.5 - dy * 127.5)));
  return [r, g];
}

/** Export a canvas as a PNG Blob */
export function exportPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob !== null) {
        resolve(blob);
      } else {
        reject(new Error("canvas.toBlob returned null"));
      }
    }, "image/png");
  });
}

/** Load a PNG File into a canvas (stretched to canvas dimensions) */
export async function loadPngToCanvas(
  file: File,
  canvas: HTMLCanvasElement
): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => { resolve(); };
      img.onerror = () => { reject(new Error("Failed to load image")); };
      img.src = url;
    });
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("No 2D context on canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Load an image File and return a data URL (for storing in state) */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(reader.result as string); };
    reader.onerror = () => { reject(new Error("FileReader failed")); };
    reader.readAsDataURL(file);
  });
}
