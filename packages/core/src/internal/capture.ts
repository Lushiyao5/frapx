import type { GLContext } from "../types";

/**
 * Reads RGBA pixels from `framebuffer` (or the drawing buffer when `null`) and
 * returns them top row first. Must run in the same task as the draw when
 * reading the drawing buffer, since it is not preserved.
 */
export const readPixels = <T extends "rgba8" | "rgba16f">(
  gl: GLContext,
  framebuffer: WebGLFramebuffer | null,
  width: number,
  height: number,
  format: T
): T extends "rgba16f" ? Float32Array : Uint8Array => {
  const length = width * height * 4;
  const data =
    format === "rgba16f" ? new Float32Array(length) : new Uint8Array(length);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  // RGBA/FLOAT is the read combination EXT_color_buffer_float guarantees.
  gl.readPixels(
    0,
    0,
    width,
    height,
    gl.RGBA,
    format === "rgba16f" ? gl.FLOAT : gl.UNSIGNED_BYTE,
    data
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  flipRows(data, width * 4, height);
  return data as T extends "rgba16f" ? Float32Array : Uint8Array;
};

/** Encodes the canvas as PNG. The snapshot is taken synchronously. */
export const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode the canvas as PNG."));
    }, "image/png");
  });

// WebGL reads bottom-up; captures are top row first like images.
const flipRows = (
  data: Uint8Array | Float32Array,
  rowLength: number,
  rows: number
): void => {
  const temp = data.slice(0, rowLength);
  for (let top = 0, bottom = rows - 1; top < bottom; top++, bottom--) {
    const topStart = top * rowLength;
    const bottomStart = bottom * rowLength;
    temp.set(data.subarray(topStart, topStart + rowLength));
    data.copyWithin(topStart, bottomStart, bottomStart + rowLength);
    data.set(temp, bottomStart);
  }
};
