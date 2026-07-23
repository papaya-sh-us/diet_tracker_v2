// ─────────────────────────────────────────────────────────────────────────────
// PHOTO COMPRESSION
//
// Every photo is shrunk before it is ever stored. Full-quality phone photos
// would be ~3MB each; at 4 angles a day that's ~4.4GB/year. These settings
// land around 180KB each, ~260MB/year, plus a tiny thumbnail for fast lists.
//
// Nothing full-size is ever written to disk.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_EDGE = 1080;    // longest side of the stored photo
export const THUMB_EDGE = 320;   // longest side of the thumbnail
export const QUALITY = 0.72;     // JPEG quality for the stored photo
export const THUMB_QUALITY = 0.6;

// Load a File into something canvas can draw.
// createImageBitmap with imageOrientation:"from-image" respects the EXIF
// rotation tag, which is what stops phone photos coming out sideways.
async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Some older browsers reject the options object — retry plain.
      try { return await createImageBitmap(file); } catch { /* fall through */ }
    }
  }
  // Fallback: <img> + object URL
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
    img.src = url;
  });
}

function scaledSize(w, h, maxEdge) {
  if (w <= maxEdge && h <= maxEdge) return { w, h };
  const ratio = w > h ? maxEdge / w : maxEdge / h;
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) };
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encoding failed"))),
      "image/jpeg",
      quality
    );
  });
}

async function render(img, maxEdge, quality) {
  const sw = img.width, sh = img.height;
  const { w, h } = scaledSize(sw, sh, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, quality);
  // Free the canvas early — mobile Safari is stingy with canvas memory.
  canvas.width = 0;
  canvas.height = 0;
  return { blob, width: w, height: h };
}

/**
 * Takes the File straight from an <input type="file">.
 * Returns everything the bodyPhotos store needs.
 */
export async function compressPhoto(file) {
  if (!file || !file.type?.startsWith("image/")) {
    throw new Error("That file isn't an image");
  }
  const img = await loadImage(file);
  try {
    const main = await render(img, MAX_EDGE, QUALITY);
    const thumb = await render(img, THUMB_EDGE, THUMB_QUALITY);
    return {
      blob: main.blob,
      thumb: thumb.blob,
      width: main.width,
      height: main.height,
      bytes: main.blob.size,
      originalBytes: file.size,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    if (typeof img.close === "function") img.close();  // release ImageBitmap
  }
}

export function formatBytes(n) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
