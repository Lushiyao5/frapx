import { inflateSync } from "node:zlib";
import { crc32 } from "../src/crc32";

export type DecodedPng = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** Big-endian 16-bit samples, RGBA, top row first. */
  samples: Uint16Array;
};

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// A reference decoder for 16-bit RGBA PNGs that supports every filter type,
// so the tests do not just mirror the encoder's own choice.
export const decodePng16 = (bytes: Uint8Array): DecodedPng => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = Array.from(bytes.subarray(0, 8));
  if (signature.join() !== "137,80,78,71,13,10,26,10") throw new Error("Not a PNG");

  let offset = 8;
  let header: Omit<DecodedPng, "samples"> | null = null;
  const idat: Uint8Array[] = [];
  for (;;) {
    const length = view.getUint32(offset);
    const typeAndData = bytes.subarray(offset + 4, offset + 8 + length);
    const type = String.fromCharCode(...typeAndData.subarray(0, 4));
    const data = typeAndData.subarray(4);
    if (view.getUint32(offset + 8 + length) !== crc32(typeAndData)) {
      throw new Error(`Bad CRC in ${type}`);
    }
    offset += 12 + length;
    if (type === "IHDR") {
      const ihdr = new DataView(data.buffer, data.byteOffset, data.byteLength);
      header = {
        width: ihdr.getUint32(0),
        height: ihdr.getUint32(4),
        bitDepth: data[8]!,
        colorType: data[9]!
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!header) throw new Error("Missing IHDR");

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 8;
  const stride = header.width * bpp;
  const pixels = new Uint8Array(header.height * stride);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? pixels[y * stride + x - bpp]! : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp]! : 0;
      const predictor =
        filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }

  const samples = new Uint16Array(pixels.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = (pixels[i * 2]! << 8) | pixels[i * 2 + 1]!;
  }
  return { ...header, samples };
};

export type ZipEntry = { name: string; crc: number; offset: number; data: Uint8Array };

// Reads the central directory, following ZIP64 records when present.
export const readZip = (bytes: Uint8Array): { entries: ZipEntry[]; zip64: boolean } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error("Missing end record");

  let count = view.getUint16(end + 10, true);
  let centralOffset = view.getUint32(end + 16, true);
  const locator = end - 20;
  const zip64 = locator >= 0 && view.getUint32(locator, true) === 0x07064b50;
  if (zip64) {
    const record = Number(view.getBigUint64(locator + 8, true));
    if (view.getUint32(record, true) !== 0x06064b50) throw new Error("Bad ZIP64 record");
    count = Number(view.getBigUint64(record + 32, true));
    centralOffset = Number(view.getBigUint64(record + 48, true));
  }

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Bad central record");
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    let offset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (offset === 0xffffffff) {
      const extra = cursor + 46 + nameLength;
      if (view.getUint16(extra, true) !== 0x0001) throw new Error("Missing ZIP64 extra");
      offset = Number(view.getBigUint64(extra + 4, true));
    }
    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error("Bad local header");
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + localExtra;
    entries.push({ name, crc, offset, data: bytes.subarray(start, start + size) });
    cursor += 46 + nameLength + extraLength;
  }
  return { entries, zip64 };
};
