// CRC-32 (IEEE 802.3), shared by the PNG chunk checksums and ZIP entries.

let table: Uint32Array | null = null;

const getTable = (): Uint32Array => {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
};

/**
 * Returns the CRC-32 of `data`. Pass a previous result as `crc` to continue a
 * checksum across several buffers.
 */
export const crc32 = (data: Uint8Array, crc = 0): number => {
  const lookup = getTable();
  let c = ~crc;
  for (let i = 0; i < data.length; i++) {
    c = lookup[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return ~c >>> 0;
};
