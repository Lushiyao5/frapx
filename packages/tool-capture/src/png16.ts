import { crc32 } from "./crc32";

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// 16-bit RGBA: 4 channels x 2 bytes.
const BYTES_PER_PIXEL = 8;
const PAETH = 4;

const ascii = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
};

const chunk = (type: string, data: Uint8Array): Uint8Array<ArrayBuffer> => {
  const typeBytes = ascii(type);
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  view.setUint32(8 + data.length, crc32(data, crc32(typeBytes)));
  return bytes;
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

const toUint16 = (value: number): number => {
  // NaN fails both comparisons and maps to 0.
  if (!(value > 0)) return 0;
  if (value >= 1) return 65535;
  return Math.round(value * 65535);
};

// Every scanline uses the Paeth filter: smooth gradients, which are what a
// 16-bit export is for, compress well under it.
const filterScanlines = (pixels: Float32Array, width: number, height: number) => {
  const stride = width * BYTES_PER_PIXEL;
  const out = new Uint8Array(height * (stride + 1));
  let previous = new Uint8Array(stride);
  let current = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const source = y * width * 4;
    for (let i = 0; i < width * 4; i++) {
      const value = toUint16(pixels[source + i]!);
      current[i * 2] = value >>> 8;
      current[i * 2 + 1] = value & 0xff;
    }

    const row = y * (stride + 1);
    out[row] = PAETH;
    for (let x = 0; x < stride; x++) {
      const left = x >= BYTES_PER_PIXEL ? current[x - BYTES_PER_PIXEL]! : 0;
      const upLeft = x >= BYTES_PER_PIXEL ? previous[x - BYTES_PER_PIXEL]! : 0;
      out[row + 1 + x] = current[x]! - paeth(left, previous[x]!, upLeft);
    }

    [previous, current] = [current, previous];
  }
  return out;
};

// CompressionStream("deflate") emits the zlib format that IDAT expects.
const deflate = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/**
 * Encodes RGBA float pixels (top row first, as returned by
 * `captureFrame({ format: "rgba16f" })`) as a 16-bit-per-channel PNG. Values
 * are clamped to 0–1 and stored as written, with no color conversion. Uses
 * the platform `CompressionStream`, so it needs no dependencies.
 */
export const encodePng16 = async (
  pixels: Float32Array,
  width: number,
  height: number
): Promise<Blob> => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`encodePng16() expects a positive integer size, got ${width}x${height}`);
  }
  if (pixels.length !== width * height * 4) {
    throw new RangeError(
      `encodePng16() expects ${width * height * 4} values for ${width}x${height} RGBA, got ${pixels.length}`
    );
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 16; // bit depth
  header[9] = 6; // color type: RGBA
  // Compression, filter and interlace methods stay 0.

  const compressed = await deflate(filterScanlines(pixels, width, height));
  const idatType = ascii("IDAT");
  const idatHead = new Uint8Array(8);
  new DataView(idatHead.buffer).setUint32(0, compressed.length);
  idatHead.set(idatType, 4);
  const idatTail = new Uint8Array(4);
  new DataView(idatTail.buffer).setUint32(0, crc32(compressed, crc32(idatType)));

  return new Blob(
    [
      SIGNATURE,
      chunk("IHDR", header),
      idatHead,
      compressed as Uint8Array<ArrayBuffer>,
      idatTail,
      chunk("IEND", new Uint8Array(0))
    ],
    { type: "image/png" }
  );
};
