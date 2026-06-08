// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT STORAGE LAYER (IndexedDB)
//
// Stores:
//   - foods       → editable food database (overrides + custom entries)
//   - dayLogs     → full meal-level detail per day (auto-purged after 2 days)
//   - dayTotals   → aggregated nutrient totals per day (kept forever)
//   - settings    → targets and preferences
//
// Public API:
//   await openDB()
//   await getAllFoods() / saveFood(food) / deleteFood(id)
//   await getDayLog(dateStr) / saveDayLog(dateStr, log)
//   await getDayTotals(dateStr) / saveDayTotals(dateStr, totals)
//   await getAllDayTotals()
//   await purgeOldLogs() — call on app startup; keeps last 2 days + today
//   await getSettings() / saveSettings(settings)
//   await exportAll() / importAll(data)
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = "yashus-tracker";
const DB_VERSION = 1;
const STORES = {
  foods: "foods",
  dayLogs: "dayLogs",
  dayTotals: "dayTotals",
  settings: "settings",
};

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.foods)) {
        db.createObjectStore(STORES.foods, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.dayLogs)) {
        db.createObjectStore(STORES.dayLogs, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(STORES.dayTotals)) {
        db.createObjectStore(STORES.dayTotals, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
    };
  });
}

function tx(storeName, mode = "readonly") {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── FOODS ───────────────────────────────────────────────────────
export async function getAllFoods() {
  const store = await tx(STORES.foods);
  return promisifyRequest(store.getAll());
}

export async function getFood(id) {
  const store = await tx(STORES.foods);
  return promisifyRequest(store.get(id));
}

export async function saveFood(food) {
  const store = await tx(STORES.foods, "readwrite");
  return promisifyRequest(store.put(food));
}

export async function saveFoodsBulk(foods) {
  const store = await tx(STORES.foods, "readwrite");
  const promises = foods.map(f => promisifyRequest(store.put(f)));
  return Promise.all(promises);
}

export async function deleteFood(id) {
  const store = await tx(STORES.foods, "readwrite");
  return promisifyRequest(store.delete(id));
}

// ─── DAY LOGS (full detail; auto-purged) ────────────────────────
export async function getDayLog(date) {
  const store = await tx(STORES.dayLogs);
  return promisifyRequest(store.get(date));
}

export async function saveDayLog(date, log) {
  const store = await tx(STORES.dayLogs, "readwrite");
  return promisifyRequest(store.put({ date, ...log }));
}

export async function deleteDayLog(date) {
  const store = await tx(STORES.dayLogs, "readwrite");
  return promisifyRequest(store.delete(date));
}

export async function getAllDayLogs() {
  const store = await tx(STORES.dayLogs);
  return promisifyRequest(store.getAll());
}

// ─── DAY TOTALS (kept forever) ──────────────────────────────────
export async function getDayTotals(date) {
  const store = await tx(STORES.dayTotals);
  return promisifyRequest(store.get(date));
}

export async function saveDayTotals(date, totals) {
  const store = await tx(STORES.dayTotals, "readwrite");
  return promisifyRequest(store.put({ date, ...totals }));
}

export async function getAllDayTotals() {
  const store = await tx(STORES.dayTotals);
  return promisifyRequest(store.getAll());
}

// ─── PURGE (DISABLED) ───────────────────────────────────────────
// Previously this deleted full meal detail older than 2 days, which made past
// days read-only (you could see totals but not edit the meals). Your data is
// tiny — a detailed day is a few KB — so we now keep full detail for every day,
// making any past day fully editable. Kept as a no-op so existing callers work.
export async function purgeOldLogs() {
  return; // intentionally does nothing
}

// ─── SETTINGS ───────────────────────────────────────────────────
export async function getSettings() {
  const store = await tx(STORES.settings);
  const all = await promisifyRequest(store.getAll());
  const result = {};
  all.forEach(s => { result[s.key] = s.value; });
  return result;
}

export async function saveSetting(key, value) {
  const store = await tx(STORES.settings, "readwrite");
  return promisifyRequest(store.put({ key, value }));
}

// ─── PINNED FOODS (FIX #2) ──────────────────────────────────────
// Per-meal recurring foods. Stored as settings row "pinnedFoods":
//   { breakfast:[{foodId,qty}], lunch:[...], snack:[...], dinner:[...] }
export async function getPinnedFoods() {
  const s = await getSettings();
  const p = s.pinnedFoods;
  return (p && typeof p === "object") ? p : {};
}
export async function savePinnedFoods(pins) {
  return saveSetting("pinnedFoods", pins);
}

// ─── CUSTOM NUTRIENTS (FIX #4) ──────────────────────────────────
// Settings row "customNutrients": array of
//   { key, label, unit, target, type:"micro", custom:true }
export async function getCustomNutrients() {
  const s = await getSettings();
  return Array.isArray(s.customNutrients) ? s.customNutrients : [];
}
export async function saveCustomNutrients(list) {
  return saveSetting("customNutrients", list);
}

// ─── VISIBLE NUTRIENT CARDS (FIX #4) ────────────────────────────
// Which small cards show on the dashboard. Settings row "visibleCards".
export async function getVisibleCards() {
  const s = await getSettings();
  return Array.isArray(s.visibleCards) ? s.visibleCards : null;
}
export async function saveVisibleCards(keys) {
  return saveSetting("visibleCards", keys);
}

// ─── EXPORT / IMPORT ────────────────────────────────────────────
export async function exportAll() {
  const [foods, logs, totals, settings] = await Promise.all([
    getAllFoods(),
    getAllDayLogs(),
    getAllDayTotals(),
    getSettings(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    foods, logs, totals, settings,
  };
}

export async function importAll(data) {
  if (!data || data.version !== 1) throw new Error("Invalid backup file");
  // Foods
  for (const f of (data.foods || [])) await saveFood(f);
  // Logs
  for (const l of (data.logs || [])) {
    const { date, ...rest } = l;
    await saveDayLog(date, rest);
  }
  // Totals
  for (const t of (data.totals || [])) {
    const { date, ...rest } = t;
    await saveDayTotals(date, rest);
  }
  // Settings
  for (const [k, v] of Object.entries(data.settings || {})) {
    await saveSetting(k, v);
  }
}

// ─── SEEDING ────────────────────────────────────────────────────
export async function seedFoodsIfEmpty(initialFoods) {
  const existing = await getAllFoods();
  if (existing.length === 0) {
    await saveFoodsBulk(initialFoods);
  }
}
