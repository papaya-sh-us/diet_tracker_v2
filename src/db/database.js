// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT STORAGE LAYER (IndexedDB)
//
// Stores:
//   - foods       → editable food database (overrides + custom entries)
//   - dayLogs     → full meal-level detail per day
//   - dayTotals   → aggregated nutrient totals per day (kept forever)
//   - settings    → targets and preferences
//
// Public API:
//   await openDB()
//   await getAllFoods() / saveFood(food) / deleteFood(id)
//   await getDayLog(dateStr) / saveDayLog(dateStr, log)
//   await getDayTotals(dateStr) / saveDayTotals(dateStr, totals)
//   await getAllDayTotals()
//   await purgeOldLogs() — no-op, kept for compat
//   await getSettings() / saveSetting(key, value)
//   await exportAll() / importAll(data)
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = "yashus-tracker";
const DB_VERSION = 2;          // bumped to add recipes store
const STORES = {
  foods: "foods",
  dayLogs: "dayLogs",
  dayTotals: "dayTotals",
  settings: "settings",
  recipes: "recipes",          // NEW: recipe definitions
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
      if (!db.objectStoreNames.contains(STORES.recipes)) {
        db.createObjectStore(STORES.recipes, { keyPath: "id" });
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

// ─── RECIPES ─────────────────────────────────────────────────────
// A recipe: { id, name, servings, ingredients:[{foodId, qty}] }
// When logged, it's stored as a single row with rowType:"recipe" and recipeId.
// Per-day ingredient qty tweaks live in the row's state.ingredientQtys map.
export async function getAllRecipes() {
  const store = await tx(STORES.recipes);
  return promisifyRequest(store.getAll());
}

export async function saveRecipe(recipe) {
  const store = await tx(STORES.recipes, "readwrite");
  return promisifyRequest(store.put(recipe));
}

export async function deleteRecipe(id) {
  const store = await tx(STORES.recipes, "readwrite");
  return promisifyRequest(store.delete(id));
}

// ─── DAY LOGS (full detail) ──────────────────────────────────────
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

// ─── PURGE (no-op, kept for compat) ─────────────────────────────
export async function purgeOldLogs() { return; }

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

// ─── PINNED FOODS ────────────────────────────────────────────────
export async function getPinnedFoods() {
  const s = await getSettings();
  const p = s.pinnedFoods;
  return (p && typeof p === "object") ? p : {};
}
export async function savePinnedFoods(pins) {
  return saveSetting("pinnedFoods", pins);
}

// ─── CUSTOM NUTRIENTS ────────────────────────────────────────────
export async function getCustomNutrients() {
  const s = await getSettings();
  return Array.isArray(s.customNutrients) ? s.customNutrients : [];
}
export async function saveCustomNutrients(list) {
  return saveSetting("customNutrients", list);
}

// ─── VISIBLE NUTRIENT CARDS ──────────────────────────────────────
export async function getVisibleCards() {
  const s = await getSettings();
  return Array.isArray(s.visibleCards) ? s.visibleCards : null;
}
export async function saveVisibleCards(keys) {
  return saveSetting("visibleCards", keys);
}

// ─── EXPORT / IMPORT ────────────────────────────────────────────
export async function exportAll() {
  const [foods, logs, totals, settings, recipes] = await Promise.all([
    getAllFoods(),
    getAllDayLogs(),
    getAllDayTotals(),
    getSettings(),
    getAllRecipes(),
  ]);
  return { version: 2, exportedAt: new Date().toISOString(), foods, logs, totals, settings, recipes };
}

export async function importAll(data) {
  if (!data || (data.version !== 1 && data.version !== 2)) throw new Error("Invalid backup file");
  for (const f of (data.foods || [])) await saveFood(f);
  for (const l of (data.logs || [])) { const { date, ...rest } = l; await saveDayLog(date, rest); }
  for (const t of (data.totals || [])) { const { date, ...rest } = t; await saveDayTotals(date, rest); }
  for (const [k, v] of Object.entries(data.settings || {})) await saveSetting(k, v);
  for (const r of (data.recipes || [])) await saveRecipe(r);
}

// ─── SEEDING ────────────────────────────────────────────────────
export async function seedFoodsIfEmpty(initialFoods) {
  const existing = await getAllFoods();
  if (existing.length === 0) await saveFoodsBulk(initialFoods);
}
