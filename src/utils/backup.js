// ─────────────────────────────────────────────────────────────────────────────
// BACKUP
//
// Two separate exports, deliberately:
//
//   Data  → one small .json (every meal, weight, measurement, water,
//           supplement). A few hundred KB. This is the one to run often.
//   Photos → a .zip, in chunks. Photos are ~260MB/year of binary and cannot
//           go in the JSON — base64 would inflate them by a third and the
//           phone would run out of memory trying to build the string.
//
// Everything lives only in this browser. Clearing site data wipes it all.
// ─────────────────────────────────────────────────────────────────────────────

import {
  exportAll, importAll,
  getPhotoDates, getPhotosForDate,
} from "../db/database.js";
import { makeZip, blobToBytes } from "./zip.js";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ─── DATA (json) ─────────────────────────────────────────────────
export async function exportData() {
  const dump = await exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  triggerDownload(blob, `tracker-backup-${stamp()}.json`);
  return { bytes: blob.size, counts: summarise(dump) };
}

function summarise(d) {
  return {
    foods: d.foods?.length || 0,
    dayLogs: d.logs?.length || 0,
    dayTotals: d.totals?.length || 0,
    recipes: d.recipes?.length || 0,
    bodyLogs: d.bodyLogs?.length || 0,
    supplements: d.supplements?.length || 0,
  };
}

export async function importData(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON — is it the right backup file?");
  }
  await importAll(data);           // throws on unknown version
  return summarise(data);
}

// ─── PHOTOS (zip) ────────────────────────────────────────────────
// Chunked so the phone never holds more than a few dozen images in memory.
export async function exportPhotos({ chunkDays = 60, onProgress } = {}) {
  const dates = await getPhotoDates();
  if (!dates.length) throw new Error("No photos saved yet");

  const chunks = [];
  for (let i = 0; i < dates.length; i += chunkDays) {
    chunks.push(dates.slice(i, i + chunkDays));
  }

  let filesWritten = 0;
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const files = [];
    for (const date of chunk) {
      const photos = await getPhotosForDate(date);
      for (const p of photos) {
        if (!p.blob) continue;
        files.push({
          name: `${date}/${p.angle}.jpg`,
          data: await blobToBytes(p.blob),
          date: p.capturedAt ? new Date(p.capturedAt) : undefined,
        });
      }
      onProgress?.({
        phase: "reading",
        chunk: ci + 1,
        totalChunks: chunks.length,
        date,
      });
    }
    if (!files.length) continue;

    const suffix = chunks.length > 1
      ? `-${chunk[0]}_to_${chunk[chunk.length - 1]}`
      : "";
    const zip = makeZip(files);
    triggerDownload(zip, `tracker-photos${suffix}.zip`);
    filesWritten += files.length;

    onProgress?.({ phase: "saved", chunk: ci + 1, totalChunks: chunks.length });
    // Let the download settle before building the next one.
    await new Promise((r) => setTimeout(r, 800));
  }

  return { photos: filesWritten, zips: chunks.length };
}

// ─── STORAGE STATUS ──────────────────────────────────────────────
export async function storageStatus() {
  const out = { usage: null, quota: null, persisted: null, supported: false };
  if (!navigator.storage) return out;
  out.supported = true;
  try {
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      out.usage = est.usage ?? null;
      out.quota = est.quota ?? null;
    }
    if (navigator.storage.persisted) {
      out.persisted = await navigator.storage.persisted();
    }
  } catch { /* not fatal */ }
  return out;
}

// Ask the browser not to evict our data when the phone is low on space.
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
