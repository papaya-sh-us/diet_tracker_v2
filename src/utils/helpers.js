// Theme tokens
export const C = {
  bg:           "#0b0d0e",
  surface:      "#111415",
  card:         "#171b1c",
  cardElevated: "#1d2224",
  border:       "#232a2d",
  borderHover:  "#2e3a3d",
  accent:       "#c8f55a",
  accentDim:    "#8aad2e",
  accentDark:   "#5a7019",
  text:         "#e4eaec",
  textMuted:    "#9ba8ad",
  muted:        "#6b7f85",
  danger:       "#f87171",
  warn:         "#fbbf24",
  info:         "#60a5fa",
  veg:          "#4ade80",
  orange:       "#f97316",
  purple:       "#a78bfa",
  pink:         "#f472b6",
};

// Date keys use LOCAL time (not UTC).
function localKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey() { return localKey(new Date()); }
export function dateKey(d) { return localKey(d); }
export function parseDate(key) { return new Date(key + "T00:00:00"); }

export function daysBetween(a, b) {
  const ms = parseDate(b) - parseDate(a);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function isToday(key) { return key === todayKey(); }

export function isRecentlyDetailed(key) {
  const diff = daysBetween(key, todayKey());
  return diff >= 0 && diff <= 2;
}

// Core nutrient keys present on every food.
export const CORE_KEYS = [
  "protein","kcal","satFat","carbs","fibre",
  "iron","calcium","b12","zinc","vitC","vitD",
];

// Scale a food's nutrients to a quantity over ANY set of keys.
export function scaleNutrients(food, qty, keys = CORE_KEYS) {
  if (!food) return {};
  const ratio = qty / (food.qty || 100);
  const decimals = { kcal: 1, calcium: 1, vitC: 1 };
  const out = {};
  for (const k of keys) {
    const dp = decimals[k] ?? 2;
    out[k] = +(((food[k] || 0) * ratio)).toFixed(dp);
  }
  return out;
}

// Scale cost: costPer100 is ₹ per food.qty units (not per 100g).
// Returns cost in ₹ for a given qty logged.
export function scaleCost(food, qty) {
  if (!food || !food.costPer100) return 0;
  const ratio = qty / (food.qty || 100);
  return +(food.costPer100 * ratio).toFixed(2);
}

export function emptyTotals(keys = CORE_KEYS) {
  const t = {};
  for (const k of keys) t[k] = 0;
  return t;
}

export function addTotals(a, b, keys) {
  const allKeys = keys || Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  const result = {};
  for (const k of allKeys) {
    result[k] = +((a[k] || 0) + (b[k] || 0)).toFixed(2);
  }
  return result;
}

export function formatDateLong(key) {
  return parseDate(key).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export function formatDateShort(key) {
  return parseDate(key).toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });
}

// Compute aggregate nutrients for a recipe given ingredient foods and a qty
// scale factor. ingredientQtys overrides the recipe's default per-ingredient qty.
export function recipeNutrients(recipe, foodMap, scaleFactor = 1, keys = CORE_KEYS, ingredientQtyOverrides = {}) {
  const out = emptyTotals(keys);
  if (!recipe || !recipe.ingredients) return out;
  recipe.ingredients.forEach(ing => {
    const food = foodMap[ing.foodId];
    if (!food) return;
    const qty = (ingredientQtyOverrides[ing.foodId] ?? ing.qty) * scaleFactor;
    const n = scaleNutrients(food, qty, keys);
    keys.forEach(k => { out[k] = +((out[k] || 0) + (n[k] || 0)).toFixed(2); });
  });
  return out;
}

export function recipeCost(recipe, foodMap, scaleFactor = 1, ingredientQtyOverrides = {}) {
  if (!recipe || !recipe.ingredients) return 0;
  let total = 0;
  recipe.ingredients.forEach(ing => {
    const food = foodMap[ing.foodId];
    if (!food) return;
    const qty = (ingredientQtyOverrides[ing.foodId] ?? ing.qty) * scaleFactor;
    total += scaleCost(food, qty);
  });
  return +total.toFixed(2);
}
