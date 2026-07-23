import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getBodyLog, saveBodyLog, getAllBodyLogs,
  getBodyProfile, saveBodyProfile,
  getAllSupplements, saveSupplement, deleteSupplement,
  getPhotosForDate, savePhoto, deletePhoto,
  getSettings, saveSetting,
  PHOTO_ANGLES,
} from "../db/database.js";
import { C, todayKey, dateKey, parseDate, formatDateLong, formatDateShort } from "../utils/helpers.js";
import { allBodyFat, averageBodyFat, bodyFatSpread, bmi, calcAge } from "../utils/bodyFat.js";
import { compressPhoto, formatBytes } from "../utils/photos.js";
import { Button, Modal, TextInput } from "./UI.jsx";
import BodySettings from "./BodySettings.jsx";

const MEASUREMENTS = [
  { key: "neck",      label: "Neck",      bf: true },
  { key: "shoulders", label: "Shoulders" },
  { key: "chest",     label: "Chest" },
  { key: "waist",     label: "Waist",     bf: true },
  { key: "hip",       label: "Hip" },
  { key: "arm",       label: "Arm" },
  { key: "thigh",     label: "Thigh" },
  { key: "calf",      label: "Calf" },
];

const ANGLE_LABEL = { front: "Front", back: "Back", left: "Left", right: "Right" };
const WATER_STEPS = [250, 500, 1000];
const DEFAULT_WATER_TARGET = 3000;

// ─────────────────────────────────────────────────────────────────
export default function BodyLog() {
  const [ready, setReady] = useState(false);
  const [activeDate, setActiveDate] = useState(todayKey());
  const [entry, setEntry] = useState({ date: todayKey() });
  const [profile, setProfile] = useState({ heightCm: null, dob: null, sex: "male" });
  const [supplements, setSupplements] = useState([]);
  const [photos, setPhotos] = useState({});          // angle -> record
  const [allEntries, setAllEntries] = useState([]);
  const [waterTarget, setWaterTarget] = useState(DEFAULT_WATER_TARGET);

  const [showSettings, setShowSettings] = useState(false);
  const [showSupplementManager, setShowSupplementManager] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(null);   // { angle, url }
  const [busyAngle, setBusyAngle] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [showAllEntries, setShowAllEntries] = useState(false);

  const saveTimer = useRef(null);
  const urlsRef = useRef([]);

  const isToday = activeDate === todayKey();

  // ─── initial load ───
  useEffect(() => {
    (async () => {
      const [p, supps, s, list] = await Promise.all([
        getBodyProfile(), getAllSupplements(), getSettings(), getAllBodyLogs(),
      ]);
      setProfile(p);
      setSupplements(supps);
      setWaterTarget(Number(s.waterTargetMl) || DEFAULT_WATER_TARGET);
      setAllEntries(list);
      setReady(true);
    })();
  }, []);

  // ─── load the active date ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const e = await getBodyLog(activeDate);
      if (!cancelled) setEntry(e || { date: activeDate });
    })();
    return () => { cancelled = true; };
  }, [activeDate]);

  // ─── load photos for the active date, and clean up object URLs ───
  useEffect(() => {
    let cancelled = false;
    urlsRef.current.forEach(URL.revokeObjectURL);
    urlsRef.current = [];
    setPhotos({});
    (async () => {
      const recs = await getPhotosForDate(activeDate);
      if (cancelled) return;
      const map = {};
      for (const r of recs) {
        const thumbUrl = r.thumb ? URL.createObjectURL(r.thumb) : null;
        if (thumbUrl) urlsRef.current.push(thumbUrl);
        map[r.angle] = { ...r, thumbUrl };
      }
      setPhotos(map);
    })();
    return () => { cancelled = true; };
  }, [activeDate]);

  useEffect(() => () => urlsRef.current.forEach(URL.revokeObjectURL), []);

  // ─── debounced save; React state is the source of truth ───
  const commit = useCallback((next) => {
    setEntry(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveBodyLog(next.date, next);
      setAllEntries(await getAllBodyLogs());
    }, 400);
  }, []);

  const setField = (key, value) => commit({ ...entry, date: activeDate, [key]: value });
  const setMeasurement = (key, value) => commit({
    ...entry, date: activeDate,
    measurements: { ...(entry.measurements || {}), [key]: value },
  });

  const shiftDate = (delta) => {
    const d = parseDate(activeDate);
    d.setDate(d.getDate() + delta);
    const key = dateKey(d);
    if (key > todayKey()) return;
    setActiveDate(key);
  };

  // ─── derived ───
  const bfResults = useMemo(() => allBodyFat(entry, profile), [entry, profile]);
  const bfAvg = averageBodyFat(bfResults);
  const bfSpread = bodyFatSpread(bfResults);
  const theBmi = bmi(entry.weightKg, profile.heightCm);
  const waterTotal = (entry.water || []).reduce((a, w) => a + (w.ml || 0), 0);
  const takenIds = new Set((entry.supplements || []).map((s) => s.defId));
  const activeSupps = supplements.filter((s) => s.active !== false);

  const loggedEntries = useMemo(() => {
    return allEntries
      .filter((e) => e.weightKg != null || Object.values(e.measurements || {}).some((v) => v != null))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [allEntries]);

  // ─── water ───
  const addWater = (ml) => commit({
    ...entry, date: activeDate,
    water: [...(entry.water || []), { ts: Date.now(), ml }],
  });
  const undoWater = () => {
    const w = [...(entry.water || [])];
    w.pop();
    commit({ ...entry, date: activeDate, water: w });
  };

  // ─── supplements ───
  const toggleSupplement = (def) => {
    const taken = entry.supplements || [];
    const exists = taken.some((s) => s.defId === def.id);
    const next = exists
      ? taken.filter((s) => s.defId !== def.id)
      : [...taken, { defId: def.id, name: def.name, dose: def.dose, unit: def.unit, ts: Date.now() }];
    commit({ ...entry, date: activeDate, supplements: next });
  };

  // ─── photos ───
  const handlePhoto = async (angle, file) => {
    if (!file) return;
    setPhotoError("");
    setBusyAngle(angle);
    try {
      const shrunk = await compressPhoto(file);
      await savePhoto({ date: activeDate, angle, ...shrunk });
      const thumbUrl = URL.createObjectURL(shrunk.thumb);
      urlsRef.current.push(thumbUrl);
      setPhotos((p) => ({ ...p, [angle]: { date: activeDate, angle, ...shrunk, thumbUrl } }));
    } catch (err) {
      setPhotoError(err.message || "Couldn't save that photo");
    } finally {
      setBusyAngle(null);
    }
  };

  const openPhoto = (angle) => {
    const rec = photos[angle];
    if (!rec?.blob) return;
    const url = URL.createObjectURL(rec.blob);
    urlsRef.current.push(url);
    setViewPhoto({ angle, url, rec });
  };

  const removePhoto = async (angle) => {
    await deletePhoto(activeDate, angle);
    setPhotos((p) => { const n = { ...p }; delete n[angle]; return n; });
    setViewPhoto(null);
  };

  if (!ready) {
    return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading…</div>;
  }

  const needsProfile = !profile.heightCm;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,sans-serif", paddingBottom: 80 }}>

      {/* ─── Header ─── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "13px 14px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Body Log</div>
          <Button variant="ghost" onClick={() => setShowSettings(true)} style={{ padding: "7px 10px" }}>⚙</Button>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "13px 12px 0" }}>

        {/* ─── Date nav ─── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => shiftDate(-1)} style={navBtn()}>‹</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {isToday ? "Today" : formatDateLong(activeDate).split(",")[0]}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>{formatDateLong(activeDate)}</div>
          </div>
          <button onClick={() => shiftDate(1)} disabled={isToday} style={{ ...navBtn(), opacity: isToday ? 0.3 : 1 }}>›</button>
        </div>

        {needsProfile && (
          <Card>
            <div style={{ fontSize: 12, color: C.warn, marginBottom: 8 }}>
              Set your height and date of birth to enable body fat calculations.
            </div>
            <Button variant="primary" onClick={() => setShowSettings(true)}>Open settings</Button>
          </Card>
        )}

        {/* ─── Weight ─── */}
        <Card>
          <Label>Weight</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <NumField
              value={entry.weightKg ?? null}
              onChange={(v) => setField("weightKg", v)}
              placeholder="—"
              big
            />
            <span style={{ fontSize: 13, color: C.muted }}>kg</span>
            {theBmi != null && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>
                BMI <b style={{ color: C.text }}>{theBmi}</b>
              </span>
            )}
          </div>
        </Card>

        {/* ─── Measurements ─── */}
        <Card>
          <Label>Measurements <span style={{ color: C.muted, fontWeight: 400 }}>· cm</span></Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {MEASUREMENTS.map((m) => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.textMuted, width: 66, flexShrink: 0 }}>
                  {m.label}
                  {m.bf && <span title="used for body fat" style={{ color: C.accent, marginLeft: 3 }}>·</span>}
                </span>
                <NumField
                  value={entry.measurements?.[m.key] ?? null}
                  onChange={(v) => setMeasurement(m.key, v)}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </Card>

        {/* ─── Body fat ─── */}
        <Card>
          <Label>Body fat</Label>
          <div style={{ display: "flex", gap: 8 }}>
            {bfResults.map((r) => (
              <div key={r.key} style={{
                flex: 1, background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 11, padding: "10px 6px", textAlign: "center", minWidth: 0,
              }}>
                <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{r.label}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: r.value != null ? C.accent : C.muted, letterSpacing: -0.4, marginTop: 3 }}>
                  {r.value != null ? `${r.value}%` : "—"}
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 3, lineHeight: 1.3 }}>
                  {r.value != null && r.leanKg != null ? `${r.leanKg}kg lean` : r.note}
                </div>
              </div>
            ))}
          </div>
          {bfAvg != null && (
            <div style={{ marginTop: 9, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
              Average <b style={{ color: C.textMuted }}>{bfAvg}%</b>
              {bfSpread != null && <> · they disagree by {bfSpread} points, which is normal. No single one is the truth — watch all three move together over months.</>}
            </div>
          )}
        </Card>

        {/* ─── Water ─── */}
        <Card>
          <Label>Water</Label>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 9 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: waterTotal >= waterTarget ? C.accent : C.text, letterSpacing: -0.5 }}>
              {(waterTotal / 1000).toFixed(2)}
            </span>
            <span style={{ fontSize: 12, color: C.muted }}>/ {(waterTarget / 1000).toFixed(1)} L</span>
          </div>
          <div style={{ background: C.border, borderRadius: 99, height: 7, overflow: "hidden", marginBottom: 10 }}>
            <div style={{
              width: `${Math.min((waterTotal / waterTarget) * 100, 100)}%`, height: "100%",
              background: C.info, borderRadius: 99, transition: "width 0.35s ease",
            }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WATER_STEPS.map((ml) => (
              <Button key={ml} onClick={() => addWater(ml)} style={{ flex: 1, minWidth: 70 }}>+{ml}ml</Button>
            ))}
            <Button variant="ghost" onClick={undoWater} disabled={!(entry.water || []).length} style={{ padding: "9px 12px" }}>↶</Button>
          </div>
        </Card>

        {/* ─── Supplements ─── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <Label style={{ marginBottom: 0 }}>Supplements & meds</Label>
            <Button variant="ghost" onClick={() => setShowSupplementManager(true)} style={{ padding: "4px 9px", fontSize: 11 }}>Manage</Button>
          </div>
          {!activeSupps.length ? (
            <div style={{ fontSize: 11, color: C.muted }}>
              Nothing set up yet. Tap Manage to add what you take.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activeSupps.map((s) => {
                const on = takenIds.has(s.id);
                return (
                  <button key={s.id} onClick={() => toggleSupplement(s)} style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%",
                    padding: "9px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                    background: on ? "rgba(200,245,90,0.07)" : C.surface,
                    border: `1px solid ${on ? C.accentDark : C.border}`,
                    color: C.text, transition: "all 0.15s",
                  }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `1px solid ${on ? C.accent : C.border}`,
                      background: on ? C.accent : "transparent",
                      color: "#0b0d0e", fontSize: 12, fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{on ? "✓" : ""}</span>
                    <span style={{ fontSize: 13, flex: 1 }}>{s.name}</span>
                    {(s.dose || s.unit) && (
                      <span style={{ fontSize: 10, color: C.muted }}>{s.dose} {s.unit}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* ─── Photos ─── */}
        <Card>
          <Label>Photos</Label>
          <div style={{ display: "flex", gap: 7 }}>
            {PHOTO_ANGLES.map((angle) => (
              <PhotoSlot
                key={angle}
                angle={angle}
                rec={photos[angle]}
                busy={busyAngle === angle}
                onPick={(file) => handlePhoto(angle, file)}
                onOpen={() => openPhoto(angle)}
              />
            ))}
          </div>
          {photoError && <div style={{ fontSize: 11, color: C.danger, marginTop: 8 }}>{photoError}</div>}
          <div style={{ fontSize: 9, color: C.muted, marginTop: 8 }}>
            Shrunk to {formatBytes(180 * 1024)}-ish each on save. Tap a filled slot to view or replace.
          </div>
        </Card>

        {/* ─── Past entries ─── */}
        <Card>
          <Label>Past entries</Label>
          {!loggedEntries.length ? (
            <div style={{ fontSize: 11, color: C.muted }}>No weight or measurements logged yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {(showAllEntries ? loggedEntries : loggedEntries.slice(0, 12)).map((e) => (
                <button key={e.date} onClick={() => setActiveDate(e.date)} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "8px 4px", background: "transparent", cursor: "pointer",
                  border: "none", borderBottom: `1px solid ${C.border}`,
                  color: e.date === activeDate ? C.accent : C.text, textAlign: "left",
                }}>
                  <span style={{ fontSize: 11, width: 62, flexShrink: 0, color: C.muted }}>{formatDateShort(e.date)}</span>
                  <span style={{ fontSize: 12, width: 60, flexShrink: 0 }}>
                    {e.weightKg != null ? `${e.weightKg} kg` : "—"}
                  </span>
                  <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>
                    {e.measurements?.waist != null ? `waist ${e.measurements.waist}` : ""}
                  </span>
                </button>
              ))}
              {loggedEntries.length > 12 && (
                <Button variant="ghost" onClick={() => setShowAllEntries((v) => !v)} style={{ marginTop: 8, fontSize: 11 }}>
                  {showAllEntries ? "Show less" : `Show all ${loggedEntries.length}`}
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ─── Modals ─── */}
      {showSettings && (
        <BodySettings
          profile={profile}
          waterTarget={waterTarget}
          onSaveProfile={async (p) => { await saveBodyProfile(p); setProfile(await getBodyProfile()); }}
          onSaveWaterTarget={async (ml) => { await saveSetting("waterTargetMl", ml); setWaterTarget(ml); }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showSupplementManager && (
        <SupplementManager
          supplements={supplements}
          onSave={async (s) => { await saveSupplement(s); setSupplements(await getAllSupplements()); }}
          onDelete={async (id) => { await deleteSupplement(id); setSupplements(await getAllSupplements()); }}
          onClose={() => setShowSupplementManager(false)}
        />
      )}

      {viewPhoto && (
        <Modal onClose={() => setViewPhoto(null)} maxWidth={520}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {ANGLE_LABEL[viewPhoto.angle]} · {formatDateShort(activeDate)}
          </div>
          <img src={viewPhoto.url} alt={viewPhoto.angle} style={{ width: "100%", borderRadius: 10, display: "block" }} />
          <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
            {viewPhoto.rec?.width}×{viewPhoto.rec?.height} · {formatBytes(viewPhoto.rec?.bytes)}
            {viewPhoto.rec?.originalBytes ? ` · shrunk from ${formatBytes(viewPhoto.rec.originalBytes)}` : ""}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button variant="danger" onClick={() => removePhoto(viewPhoto.angle)} style={{ flex: 1 }}>Delete</Button>
            <Button onClick={() => setViewPhoto(null)} style={{ flex: 1 }}>Close</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
function PhotoSlot({ angle, rec, busy, onPick, onOpen }) {
  const ref = useRef();
  const filled = !!rec?.thumbUrl;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <input
        ref={ref} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onPick(f); }}
      />
      <button
        onClick={() => (filled ? onOpen() : ref.current.click())}
        disabled={busy}
        style={{
          width: "100%", aspectRatio: "3/4", borderRadius: 10, overflow: "hidden",
          background: filled ? "transparent" : C.surface,
          border: `1px solid ${filled ? C.accentDark : C.border}`,
          cursor: busy ? "wait" : "pointer", padding: 0, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {busy ? (
          <span style={{ fontSize: 10, color: C.muted }}>…</span>
        ) : filled ? (
          <img src={rec.thumbUrl} alt={angle} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <span style={{ fontSize: 16, color: C.muted }}>📷</span>
        )}
      </button>
      <div style={{ fontSize: 9, color: filled ? C.textMuted : C.muted, textAlign: "center", marginTop: 4 }}>
        {ANGLE_LABEL[angle]}
      </div>
      {filled && (
        <button
          onClick={() => ref.current.click()}
          style={{
            width: "100%", marginTop: 3, padding: "2px 0", fontSize: 9,
            background: "transparent", border: "none", color: C.muted, cursor: "pointer",
          }}
        >replace</button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
function SupplementManager({ supplements, onSave, onDelete, onClose }) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [unit, setUnit] = useState("mg");

  const add = () => {
    if (!name.trim()) return;
    onSave({
      id: `s_${Date.now()}`,
      name: name.trim(),
      dose: dose ? Number(dose) : null,
      unit: unit.trim() || null,
      active: true,
    });
    setName(""); setDose("");
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Supplements & meds</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {supplements.map((s) => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9,
            opacity: s.active === false ? 0.45 : 1,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12 }}>{s.name}</div>
              {(s.dose || s.unit) && <div style={{ fontSize: 10, color: C.muted }}>{s.dose} {s.unit}</div>}
            </div>
            <Button variant="ghost" onClick={() => onSave({ ...s, active: s.active === false })} style={{ padding: "3px 8px", fontSize: 10 }}>
              {s.active === false ? "Restore" : "Hide"}
            </Button>
            <Button variant="danger" onClick={() => onDelete(s.id)} style={{ padding: "3px 8px", fontSize: 10 }}>✕</Button>
          </div>
        ))}
        {!supplements.length && <div style={{ fontSize: 11, color: C.muted }}>Nothing added yet.</div>}
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 7 }}>Add new</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <div style={{ flex: 2 }}><TextInput value={name} onChange={setName} placeholder="Name" /></div>
        <div style={{ flex: 1 }}><TextInput value={dose} onChange={setDose} placeholder="Dose" /></div>
        <div style={{ width: 62 }}><TextInput value={unit} onChange={setUnit} placeholder="mg" /></div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" onClick={add} style={{ flex: 1 }}>Add</Button>
        <Button onClick={onClose} style={{ flex: 1 }}>Done</Button>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
        "Hide" keeps it out of the daily list but leaves your history alone. Deleting also leaves history intact —
        past days keep the name they were logged with.
      </div>
    </Modal>
  );
}

// ─── small shared bits ───────────────────────────────────────────
function Card({ children }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 13,
      padding: 13, marginBottom: 11,
    }}>{children}</div>
  );
}

function Label({ children, style = {} }) {
  return (
    <div style={{
      fontSize: 10, color: C.muted, textTransform: "uppercase",
      letterSpacing: 1, marginBottom: 9, fontWeight: 600, ...style,
    }}>{children}</div>
  );
}

// Number input that allows being genuinely empty (null), and doesn't fight
// you while typing "98." on the way to "98.5".
function NumField({ value, onChange, placeholder = "", big = false }) {
  const [raw, setRaw] = useState(value == null ? "" : String(value));

  useEffect(() => {
    const parsed = raw === "" ? null : parseFloat(raw);
    const current = Number.isFinite(parsed) ? parsed : null;
    if (current !== value) setRaw(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handle = (text) => {
    if (!/^\d*\.?\d*$/.test(text)) return;   // digits and one dot only
    setRaw(text);
    const parsed = text === "" ? null : parseFloat(text);
    onChange(Number.isFinite(parsed) ? parsed : null);
  };

  return (
    <input
      type="text" inputMode="decimal" value={raw} placeholder={placeholder}
      onChange={(e) => handle(e.target.value)}
      style={{
        padding: big ? "8px 10px" : "7px 9px",
        borderRadius: 7, fontSize: big ? 20 : 13, fontWeight: big ? 800 : 500,
        background: C.surface, border: `1px solid ${C.border}`, color: C.text,
        outline: "none", boxSizing: "border-box", width: "100%", minWidth: 0,
        letterSpacing: big ? -0.5 : 0,
      }}
    />
  );
}

function navBtn() {
  return {
    width: 34, height: 34, borderRadius: 9, background: "transparent",
    border: `1px solid ${C.border}`, color: C.text, cursor: "pointer", fontSize: 18,
  };
}
