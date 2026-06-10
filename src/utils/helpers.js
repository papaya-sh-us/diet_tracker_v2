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

// Date keys use LOCAL time (not UTC). Using toISOString() previously shifted
// the key to UTC, so anything logged late at night in IST could land on the
// wrong calendar day. These build a true local midnight-to-midnight YYYY-MM-DD.
function localKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey() {
  return localKey(new Date());
}

export function dateKey(d) {
  return localKey(d);
}

export function parseDate(key) {
  return new Date(key + "T00:00:00");
}

export function daysBetween(a, b) {
  const ms = parseDate(b) - parseDate(a);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function isToday(key) {
  return key === todayKey();
}

export function isRecentlyDetailed(key) {
  // True if within last 2 days (full detail still kept)
  const diff = daysBetween(key, todayKey());
  return diff >= 0 && diff <= 2;
}

// Core nutrient keys present on every food.
export const CORE_KEYS = [
  "protein","kcal","satFat","carbs","fibre",
  "iron","calcium","b12","zinc","vitC","vitD",
];

// Scale a food's nutrients to a quantity over ANY set of keys (FIX #4).
// `keys` lets custom nutrients (sodium, magnesium, …) flow through; defaults
// to the core set for backward compatibility with existing callers.
export function scaleNutrients(food, qty, keys = CORE_KEYS) {
  if (!food) return {};
  const ratio = qty / food.qty;
  const decimals = { kcal: 1, calcium: 1, vitC: 1 };
  const out = {};
  for (const k of keys) {
    const dp = decimals[k] ?? 2;
    out[k] = +(((food[k] || 0) * ratio)).toFixed(dp);
  }
  return out;
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
