import { crc32 } from "./crc32";
import type { FrameSink } from "./types";

export type ZipSinkOptions = {
  /** Modification time stored for every entry. Defaults to when the sink is created. */
  date?: Date;
};

type Entry = {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
};

const UINT32_MAX = 0xffffffff;
const UINT16_MAX = 0xffff;
// General purpose flag bit 11: file names are UTF-8.
const UTF8_FLAG = 0x0800;
const VERSION_DEFAULT = 20;
const VERSION_ZIP64 = 45;

const dosDateTime = (date: Date): { time: number; day: number } => {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
};

/**
 * Builds a stored (uncompressed) ZIP. `zip64Limit` is the size at which
 * offsets and counts switch to ZIP64 fields; tests lower it to exercise them.
 * @internal
 */
export const createZipWriter = (
  date: Date,
  zip64Limit = { size: UINT32_MAX, count: UINT16_MAX }
): FrameSink<Blob> => {
  const { time, day } = dosDateTime(date);
  const encoder = new TextEncoder();
  const names = new Set<string>();
  const entries: Entry[] = [];
  let parts: BlobPart[] = [];
  let offset = 0;
  let state: "open" | "closed" | "aborted" = "open";

  const assertOpen = () => {
    if (state !== "open") throw new Error(`The ZIP sink is ${state}.`);
  };

  return {
    async write(name, data) {
      assertOpen();
      if (names.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
      // Frames are far below 4 GiB, so local headers never need ZIP64 sizes.
      if (data.size >= UINT32_MAX) {
        throw new RangeError(`ZIP entries must be smaller than 4 GiB: ${name}`);
      }
      names.add(name);

      const bytes = new Uint8Array(await data.arrayBuffer());
      assertOpen();
      const encodedName = encoder.encode(name);
      const header = new Uint8Array(30 + encodedName.length);
      const view = new DataView(header.buffer);
      const crc = crc32(bytes);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, VERSION_DEFAULT, true);
      view.setUint16(6, UTF8_FLAG, true);
      view.setUint16(8, 0, true); // stored
      view.setUint16(10, time, true);
      view.setUint16(12, day, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.size, true);
      view.setUint32(22, data.size, true);
      view.setUint16(26, encodedName.length, true);
      view.setUint16(28, 0, true);
      header.set(encodedName, 30);

      entries.push({ name: encodedName, crc, size: data.size, offset });
      // Keep the Blob itself rather than the copy, which the browser may page out.
      parts.push(header, data);
      offset += header.length + data.size;
    },

    async close() {
      assertOpen();
      state = "closed";

      const centralOffset = offset;
      let centralSize = 0;
      for (const entry of entries) {
        const zip64 = entry.offset >= zip64Limit.size;
        const extraLength = zip64 ? 12 : 0;
        const record = new Uint8Array(46 + entry.name.length + extraLength);
        const view = new DataView(record.buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, VERSION_ZIP64, true); // made by
        view.setUint16(6, zip64 ? VERSION_ZIP64 : VERSION_DEFAULT, true);
        view.setUint16(8, UTF8_FLAG, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, time, true);
        view.setUint16(14, day, true);
        view.setUint32(16, entry.crc, true);
        view.setUint32(20, entry.size, true);
        view.setUint32(24, entry.size, true);
        view.setUint16(28, entry.name.length, true);
        view.setUint16(30, extraLength, true);
        // Comment length, disk number and attributes stay 0.
        view.setUint32(42, zip64 ? UINT32_MAX : entry.offset, true);
        record.set(entry.name, 46);
        if (zip64) {
          const extra = 46 + entry.name.length;
          view.setUint16(extra, 0x0001, true);
          view.setUint16(extra + 2, 8, true);
          view.setBigUint64(extra + 4, BigInt(entry.offset), true);
        }
        parts.push(record);
        centralSize += record.length;
      }

      const needsZip64 =
        entries.length >= zip64Limit.count ||
        centralOffset >= zip64Limit.size ||
        centralSize >= zip64Limit.size;

      if (needsZip64) {
        const record = new Uint8Array(56 + 20);
        const view = new DataView(record.buffer);
        view.setUint32(0, 0x06064b50, true);
        view.setBigUint64(4, 44n, true); // size of the rest of the record
        view.setUint16(12, VERSION_ZIP64, true);
        view.setUint16(14, VERSION_ZIP64, true);
        // Disk numbers stay 0.
        view.setBigUint64(24, BigInt(entries.length), true);
        view.setBigUint64(32, BigInt(entries.length), true);
        view.setBigUint64(40, BigInt(centralSize), true);
        view.setBigUint64(48, BigInt(centralOffset), true);
        // Locator.
        view.setUint32(56, 0x07064b50, true);
        view.setBigUint64(64, BigInt(centralOffset + centralSize), true);
        view.setUint32(72, 1, true); // total disks
        parts.push(record);
      }

      const end = new Uint8Array(22);
      const view = new DataView(end.buffer);
      const count = needsZip64 ? UINT16_MAX : entries.length;
      view.setUint32(0, 0x06054b50, true);
      view.setUint16(8, count, true);
      view.setUint16(10, count, true);
      view.setUint32(12, needsZip64 ? UINT32_MAX : centralSize, true);
      view.setUint32(16, needsZip64 ? UINT32_MAX : centralOffset, true);
      parts.push(end);

      const blob = new Blob(parts, { type: "application/zip" });
      parts = [];
      return blob;
    },

    abort() {
      if (state !== "open") return;
      state = "aborted";
      parts = [];
    }
  };
};

/**
 * Collects frames into one uncompressed ZIP held in memory; `close()` resolves
 * with the ZIP Blob. Long 4K sequences can exceed available memory, so prefer
 * a folder sink for those. Writes ZIP64 records past 4 GiB or 65,535 frames.
 */
export const createZipSink = (options: ZipSinkOptions = {}): FrameSink<Blob> =>
  createZipWriter(options.date ?? new Date());
