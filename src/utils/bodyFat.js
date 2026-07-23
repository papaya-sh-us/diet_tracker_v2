// ─────────────────────────────────────────────────────────────────────────────
// BODY COMPOSITION MATHS
//
// Nothing here is ever stored. Everything is computed on read from the raw
// measurements in bodyLog + heightCm/dob/sex in the body profile, so that
// correcting your height or fixing a formula retroactively fixes all history.
//
// All inputs are metric: cm and kg.
// Every function returns null rather than NaN when inputs are missing or
// physically impossible, so the UI can show "—" instead of garbage.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

// Sane physical ranges. These exist to catch typing errors — entering 985
// instead of 98.5 for waist would otherwise produce a wrong-but-believable
// body fat number rather than an obvious blank.
const RANGES = {
  heightCm: [100, 250],
  weightKg: [20, 400],
  waist: [30, 250],
  neck: [15, 80],
  hip: [40, 250],
};

function bounded(v, key) {
  const n = num(v);
  if (n === null) return null;
  const r = RANGES[key];
  if (r && (n < r[0] || n > r[1])) return null;
  return n;
}

// Body fat below ~2% or above ~70% means bad input, not a real reading.
const PLAUSIBLE_MIN = 2;
const PLAUSIBLE_MAX = 70;

function finish(value) {
  if (value === null || !isFinite(value)) return null;
  if (value < PLAUSIBLE_MIN || value > PLAUSIBLE_MAX) return null;
  return Math.round(value * 10) / 10;
}

// ─── AGE ─────────────────────────────────────────────────────────
// Age as of a given date (not today), so old entries stay correct.
export function calcAge(dob, onDate) {
  if (!dob) return null;
  const birth = new Date(dob);
  const when = onDate ? new Date(onDate) : new Date();
  if (isNaN(birth) || isNaN(when)) return null;
  let age = when.getFullYear() - birth.getFullYear();
  const m = when.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && when.getDate() < birth.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// ─── BMI ─────────────────────────────────────────────────────────
export function bmi(weightKg, heightCm) {
  const w = bounded(weightKg, "weightKg"), h = bounded(heightCm, "heightCm");
  if (!w || !h || h <= 0) return null;
  const m = h / 100;
  return Math.round((w / (m * m)) * 10) / 10;
}

// ─── NAVY METHOD ─────────────────────────────────────────────────
// Men:   needs waist, neck, height
// Women: needs waist, hip, neck, height
export function navyBodyFat({ waist, neck, hip, heightCm, sex = "male" }) {
  const W = bounded(waist, "waist"), N = bounded(neck, "neck");
  const H = bounded(heightCm, "heightCm"), Hp = bounded(hip, "hip");
  if (!W || !N || !H) return null;

  if (sex === "female") {
    if (!Hp) return null;
    const girth = W + Hp - N;
    if (girth <= 0) return null;
    const d = 1.29579 - 0.35004 * Math.log10(girth) + 0.22100 * Math.log10(H);
    return finish(495 / d - 450);
  }

  const girth = W - N;
  if (girth <= 0) return null;          // waist must exceed neck
  const d = 1.0324 - 0.19077 * Math.log10(girth) + 0.15456 * Math.log10(H);
  return finish(495 / d - 450);
}

// ─── RELATIVE FAT MASS (RFM) ─────────────────────────────────────
// Needs only height + waist. Tends to track better than Navy at
// higher body fat levels.
export function rfmBodyFat({ waist, heightCm, sex = "male" }) {
  const W = bounded(waist, "waist"), H = bounded(heightCm, "heightCm");
  if (!W || !H || W <= 0) return null;
  const base = sex === "female" ? 76 : 64;
  return finish(base - 20 * (H / W));
}

// ─── DEURENBERG (BMI-BASED) ──────────────────────────────────────
// Needs no tape at all — weight, height, age, sex. Useful precisely
// because it drifts differently from the two waist-based formulas.
export function deurenbergBodyFat({ weightKg, heightCm, age, sex = "male" }) {
  const b = bmi(weightKg, heightCm);
  const a = num(age);
  if (b === null || a === null) return null;
  const sexTerm = sex === "female" ? 0 : 1;
  return finish(1.20 * b + 0.23 * a - 10.8 * sexTerm - 5.4);
}

// ─── COMPOSITION FROM A BODY FAT % ───────────────────────────────
export function composition(weightKg, bodyFatPct) {
  const w = num(weightKg), bf = num(bodyFatPct);
  if (!w || bf === null) return { fatKg: null, leanKg: null };
  const fatKg = Math.round(w * (bf / 100) * 10) / 10;
  return { fatKg, leanKg: Math.round((w - fatKg) * 10) / 10 };
}

// ─── ALL THREE, SIDE BY SIDE ─────────────────────────────────────
// Returns a fixed-length array in a fixed order so the UI can render
// three columns that never jump around. Each result carries either a
// value, or a plain-English reason it can't be shown yet.
export function allBodyFat(entry = {}, profile = {}) {
  const m = entry.measurements || {};
  const heightCm = bounded(profile.heightCm, "heightCm");
  const sex = profile.sex || "male";
  const age = calcAge(profile.dob, entry.date);
  const weightKg = bounded(entry.weightKg, "weightKg");

  const missing = (...fields) => fields.filter(Boolean).join(" + ");

  const navy = navyBodyFat({ waist: m.waist, neck: m.neck, hip: m.hip, heightCm, sex });
  const rfm = rfmBodyFat({ waist: m.waist, heightCm, sex });
  const deur = deurenbergBodyFat({ weightKg, heightCm, age, sex });

  const need = (checks) => {
    const list = checks.filter(c => !c.ok).map(c => c.label);
    return list.length ? `Needs ${missing(...list)}` : "Check your numbers";
  };

  return [
    {
      key: "navy",
      label: "Navy",
      value: navy,
      ...composition(weightKg, navy),
      note: navy !== null ? "waist, neck, height" : need([
        { ok: !!bounded(m.waist, "waist"), label: "waist" },
        { ok: !!bounded(m.neck, "neck"), label: "neck" },
        ...(sex === "female" ? [{ ok: !!bounded(m.hip, "hip"), label: "hip" }] : []),
        { ok: !!heightCm, label: "height" },
      ]),
    },
    {
      key: "rfm",
      label: "RFM",
      value: rfm,
      ...composition(weightKg, rfm),
      note: rfm !== null ? "waist, height" : need([
        { ok: !!bounded(m.waist, "waist"), label: "waist" },
        { ok: !!heightCm, label: "height" },
      ]),
    },
    {
      key: "deurenberg",
      label: "BMI-based",
      value: deur,
      ...composition(weightKg, deur),
      note: deur !== null ? "weight, height, age" : need([
        { ok: !!weightKg, label: "weight" },
        { ok: !!heightCm, label: "height" },
        { ok: age !== null, label: "date of birth" },
      ]),
    },
  ];
}

// Average of whichever formulas actually produced a number.
export function averageBodyFat(results) {
  const vals = results.map(r => r.value).filter(v => v !== null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

// Spread between highest and lowest — a plain honesty signal for the UI.
export function bodyFatSpread(results) {
  const vals = results.map(r => r.value).filter(v => v !== null);
  if (vals.length < 2) return null;
  return Math.round((Math.max(...vals) - Math.min(...vals)) * 10) / 10;
}
