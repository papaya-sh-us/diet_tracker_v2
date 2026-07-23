import { useState } from "react";
import DietApp from "./App.jsx";
import BodyLog from "./components/BodyLog.jsx";
import { C } from "./utils/helpers.js";

// The tab bar lives here so App.jsx never has to change. Diet stays exactly
// the app it already was — this just decides which screen is on top.
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "◎", ready: false },
  { id: "diet",      label: "Diet",      icon: "◍", ready: true },
  { id: "body",      label: "Body",      icon: "◐", ready: true },
  { id: "exercise",  label: "Exercise",  icon: "◔", ready: false },
];

export default function Shell() {
  const [tab, setTab] = useState("diet");
  // Screens are mounted on first visit and then kept alive, so switching tabs
  // doesn't reload data or lose what you were in the middle of typing.
  const [visited, setVisited] = useState({ diet: true });

  const go = (id) => {
    setTab(id);
    setVisited((v) => (v[id] ? v : { ...v, [id]: true }));
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {visited.diet && <div style={{ display: tab === "diet" ? "block" : "none" }}><DietApp /></div>}
      {visited.body && <div style={{ display: tab === "body" ? "block" : "none" }}><BodyLog /></div>}

      {(tab === "dashboard" || tab === "exercise") && (
        <div style={{
          minHeight: "100vh", background: C.bg, color: C.muted,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontFamily: "system-ui,sans-serif", padding: 40, textAlign: "center",
        }}>
          {TABS.find((t) => t.id === tab)?.label} module — coming next.
        </div>
      )}

      {/* ─── Bottom tab bar ─── */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100,
        background: C.surface, borderTop: `1px solid ${C.border}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex" }}>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                style={{
                  flex: 1, background: "transparent", border: "none", cursor: "pointer",
                  padding: "8px 2px 9px", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 3,
                  color: on ? C.accent : (t.ready ? C.muted : "#4a5559"),
                  fontFamily: "system-ui,sans-serif",
                }}
              >
                <span style={{ fontSize: 17, lineHeight: 1 }}>{t.icon}</span>
                <span style={{ fontSize: 9.5, fontWeight: on ? 700 : 500, letterSpacing: 0.2 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
