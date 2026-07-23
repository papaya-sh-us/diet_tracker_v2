// ─────────────────────────────────────────────────────────────────────────────
// MINIMAL ZIP WRITER
//
// Photos are already JPEG-compressed, so re-compressing them inside a zip
// gains nothing. This writes a "stored" (uncompressed) zip, which means we
// need no external library at all — no npm install, nothing extra to break.
//
// Produces a standard zip that Windows Explorer, macOS, 7-Zip and Android
// file managers all open normally.
// ─────────────────────────────────────────────────────────────────────────────

// CRC-32 table, built once.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// DOS date/time format used inside zip headers.
function dosDateTime(date) {
  const d = date || new Date();
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const day = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, day };
}

function writeU16(view, offset, value) { view.setUint16(offset, value, true); }
function writeU32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

/**
 * files: [{ name: "2026-07-23/front.jpg", data: Uint8Array, date?: Date }]
 * Returns a Blob of type application/zip.
 */
export function makeZip(files) {
  const encoder = new TextEncoder();
  const entries = files.map(f => {
    const nameBytes = encoder.encode(f.name);
    return {
      nameBytes,
      data: f.data,
      crc: crc32(f.data),
      dt: dosDateTime(f.date),
      offset: 0,
    };
  });

  // ── Local file headers + data ──
  const localParts = [];
  let offset = 0;
  for (const e of entries) {
    e.offset = offset;
    const header = new ArrayBuffer(30);
    const v = new DataView(header);
    writeU32(v, 0, 0x04034b50);      // local file header signature
    writeU16(v, 4, 20);              // version needed
    writeU16(v, 6, 0);               // flags
    writeU16(v, 8, 0);               // method 0 = stored
    writeU16(v, 10, e.dt.time);
    writeU16(v, 12, e.dt.day);
    writeU32(v, 14, e.crc);
    writeU32(v, 18, e.data.length);  // compressed size
    writeU32(v, 22, e.data.length);  // uncompressed size
    writeU16(v, 26, e.nameBytes.length);
    writeU16(v, 28, 0);              // extra field length
    localParts.push(new Uint8Array(header), e.nameBytes, e.data);
    offset += 30 + e.nameBytes.length + e.data.length;
  }

  // ── Central directory ──
  const centralParts = [];
  let centralSize = 0;
  for (const e of entries) {
    const header = new ArrayBuffer(46);
    const v = new DataView(header);
    writeU32(v, 0, 0x02014b50);      // central directory signature
    writeU16(v, 4, 20);              // version made by
    writeU16(v, 6, 20);              // version needed
    writeU16(v, 8, 0);               // flags
    writeU16(v, 10, 0);              // method 0 = stored
    writeU16(v, 12, e.dt.time);
    writeU16(v, 14, e.dt.day);
    writeU32(v, 16, e.crc);
    writeU32(v, 20, e.data.length);
    writeU32(v, 24, e.data.length);
    writeU16(v, 28, e.nameBytes.length);
    writeU16(v, 30, 0);              // extra
    writeU16(v, 32, 0);              // comment
    writeU16(v, 34, 0);              // disk number
    writeU16(v, 36, 0);              // internal attrs
    writeU32(v, 38, 0);              // external attrs
    writeU32(v, 42, e.offset);       // offset of local header
    centralParts.push(new Uint8Array(header), e.nameBytes);
    centralSize += 46 + e.nameBytes.length;
  }

  // ── End of central directory ──
  const end = new ArrayBuffer(22);
  const ev = new DataView(end);
  writeU32(ev, 0, 0x06054b50);
  writeU16(ev, 4, 0);
  writeU16(ev, 6, 0);
  writeU16(ev, 8, entries.length);
  writeU16(ev, 10, entries.length);
  writeU32(ev, 12, centralSize);
  writeU32(ev, 16, offset);          // offset of central directory
  writeU16(ev, 20, 0);

  return new Blob([...localParts, ...centralParts, new Uint8Array(end)], {
    type: "application/zip",
  });
}

export async function blobToBytes(blob) {
  // Blob.arrayBuffer() is missing on older Safari, so fall back to FileReader.
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read image data"));
    reader.readAsArrayBuffer(blob);
  });
}
