import { useState, useEffect } from "react";
import { C } from "../utils/helpers.js";
import { calcAge } from "../utils/bodyFat.js";
import { Button, Modal, TextInput } from "./UI.jsx";
import { formatBytes } from "../utils/photos.js";
import {
  exportData, importData, exportPhotos,
  storageStatus, requestPersistence,
} from "../utils/backup.js";

export default function BodySettings({ profile, waterTarget, onSaveProfile, onSaveWaterTarget, onClose }) {
  const [height, setHeight] = useState(profile.heightCm != null ? String(profile.heightCm) : "");
  const [dob, setDob] = useState(profile.dob || "");
  const [sex, setSex] = useState(profile.sex || "male");
  const [water, setWater] = useState(String(waterTarget));

  const [storage, setStorage] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => { storageStatus().then(setStorage); }, []);

  const age = calcAge(dob);

  const save = async () => {
    await onSaveProfile({
      heightCm: height === "" ? null : parseFloat(height),
      dob: dob || null,
      sex,
    });
    const w = parseInt(water, 10);
    if (Number.isFinite(w) && w > 0) await onSaveWaterTarget(w);
    onClose();
  };

  const doExportData = async () => {
    setBusy("data"); setStatus("");
    try {
      const r = await exportData();
      setStatus(`Saved ${formatBytes(r.bytes)} — ${r.counts.dayLogs} diet days, ${r.counts.bodyLogs} body entries, ${r.counts.foods} foods.`);
    } catch (e) {
      setStatus(e.message || "Export failed");
    } finally { setBusy(""); }
  };

  const doExportPhotos = async () => {
    setBusy("photos"); setStatus("Reading photos…");
    try {
      const r = await exportPhotos({
        onProgress: (p) => {
          if (p.phase === "reading") setStatus(`Reading ${p.date}… (part ${p.chunk} of ${p.totalChunks})`);
          if (p.phase === "saved") setStatus(`Saved part ${p.chunk} of ${p.totalChunks}`);
        },
      });
      setStatus(`Done — ${r.photos} photos across ${r.zips} zip file${r.zips > 1 ? "s" : ""}.`);
    } catch (e) {
      setStatus(e.message || "Photo export failed");
    } finally { setBusy(""); }
  };

  const doImport = async (file) => {
    if (!file) return;
    setBusy("import"); setStatus("");
    try {
      const c = await importData(file);
      setStatus(`Imported ${c.dayLogs} diet days, ${c.bodyLogs} body entries, ${c.foods} foods. Reload the app to see everything.`);
    } catch (e) {
      setStatus(e.message || "Import failed");
    } finally { setBusy(""); }
  };

  const doPersist = async () => {
    const ok = await requestPersistence();
    setStorage(await storageStatus());
    setStatus(ok
      ? "Storage is now marked persistent — the browser won't quietly evict your data."
      : "The browser declined for now. It often grants this once the app is installed to your home screen.");
  };

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Body settings</div>

      {/* ─── Profile ─── */}
      <Section>Profile</Section>
      <Row label="Height (cm)">
        <TextInput value={height} onChange={setHeight} placeholder="179" />
      </Row>
      <Row label="Date of birth">
        <input
          type="date" value={dob} onChange={(e) => setDob(e.target.value)}
          style={{
            padding: "7px 9px", borderRadius: 7, fontSize: 13, width: "100%",
            background: C.surface, border: `1px solid ${C.border}`, color: C.text,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </Row>
      {age != null && (
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, marginLeft: 92 }}>
          Age {age} — stored as a birthday, so old entries stay correct as you get older.
        </div>
      )}
      <Row label="Sex">
        <div style={{ display: "flex", gap: 6 }}>
          {["male", "female"].map((s) => (
            <Button key={s} variant={sex === s ? "primary" : "default"} onClick={() => setSex(s)} style={{ flex: 1, fontSize: 12 }}>
              {s === "male" ? "Male" : "Female"}
            </Button>
          ))}
        </div>
      </Row>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Height and age feed the body fat formulas. Change them and every past entry recalculates —
        nothing is frozen with an old number baked in.
      </div>

      {/* ─── Water ─── */}
      <Section>Daily water target</Section>
      <Row label="Target (ml)">
        <TextInput value={water} onChange={setWater} placeholder="3000" />
      </Row>

      {/* ─── Backup ─── */}
      <Section>Backup</Section>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, lineHeight: 1.55 }}>
        Everything lives only in this browser. If you clear site data, or the phone reclaims space,
        it is all gone with no way back. Export regularly.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
        <Button onClick={doExportData} disabled={!!busy}>
          {busy === "data" ? "Exporting…" : "⬇ Export data (.json)"}
        </Button>
        <Button onClick={doExportPhotos} disabled={!!busy}>
          {busy === "photos" ? "Exporting…" : "⬇ Export photos (.zip)"}
        </Button>
        <label style={{
          display: "block", padding: "9px 14px", borderRadius: 9, textAlign: "center",
          border: `1px solid ${C.border}`, background: C.card, color: C.text,
          fontSize: 13, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
        }}>
          ⬆ Import data (.json)
          <input
            type="file" accept="application/json,.json" style={{ display: "none" }} disabled={!!busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; doImport(f); }}
          />
        </label>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Import merges into what's already here — it adds and overwrites by date, it never wipes.
      </div>

      {/* ─── Storage ─── */}
      <Section>Storage</Section>
      {storage?.supported ? (
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 9, lineHeight: 1.6 }}>
          Using <b style={{ color: C.text }}>{formatBytes(storage.usage)}</b>
          {storage.quota ? <> of about {formatBytes(storage.quota)} available</> : null}.<br />
          Eviction protection: <b style={{ color: storage.persisted ? C.accent : C.warn }}>
            {storage.persisted ? "on" : "off"}
          </b>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 9 }}>
          This browser doesn't report storage usage.
        </div>
      )}
      {storage?.supported && !storage.persisted && (
        <Button onClick={doPersist} style={{ width: "100%", marginBottom: 10 }}>
          Ask browser to protect this data
        </Button>
      )}

      {status && (
        <div style={{
          fontSize: 11, color: C.text, background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "9px 10px", marginBottom: 12, lineHeight: 1.5,
        }}>{status}</div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" onClick={save} style={{ flex: 1 }}>Save</Button>
        <Button onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
      </div>
    </Modal>
  );
}

function Section({ children }) {
  return (
    <div style={{
      fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1,
      fontWeight: 600, marginBottom: 9, marginTop: 4,
      borderTop: `1px solid ${C.border}`, paddingTop: 12,
    }}>{children}</div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
      <span style={{ fontSize: 11, color: C.textMuted, width: 82, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
