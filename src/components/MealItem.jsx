import { useState, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { C, scaleNutrients, scaleCost } from "../utils/helpers.js";
import { ConfidenceBadge } from "./UI.jsx";

// A single food row inside a meal block — supports drag-to-reorder via dnd-kit.
// pin/remove actions are now in a ⋯ kebab menu to keep the handle visible.
export default function MealItem({
  food, entry, onUpdate, onRemove, onTogglePin, pinned = false,
  dragId,    // string id passed to useSortable
}) {
  const [showQty, setShowQty] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const qty = entry.qty ?? food.qty;
  const checked = !!entry.checked;
  const n = scaleNutrients(food, qty);
  const cost = scaleCost(food, qty);

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: dragId || food.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  // Close menu when clicking outside
  const handleMenuBlur = (e) => {
    if (!menuRef.current?.contains(e.relatedTarget)) setMenuOpen(false);
  };

  return (
    <div ref={setNodeRef} style={{ ...style, marginBottom: 4 }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 10px",
        borderRadius: 10, transition: "background 0.12s",
        background: checked ? "rgba(200,245,90,0.07)" : "transparent",
        border: checked ? "1px solid rgba(200,245,90,0.20)" : "1px solid transparent",
        position: "relative",
      }}>

        {/* ⠿ drag handle */}
        <div {...attributes} {...listeners} style={{
          cursor: isDragging ? "grabbing" : "grab",
          color: C.muted, fontSize: 14, lineHeight: "20px",
          padding: "2px 2px 0 0", flexShrink: 0, userSelect: "none",
          touchAction: "none",
        }}>⠿</div>

        {/* checkbox */}
        <div onClick={() => onUpdate({ checked: !checked })} style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
          border: `2px solid ${checked ? C.accent : C.border}`,
          background: checked ? C.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#0b0d0e", fontSize: 11, fontWeight: 800, cursor: "pointer",
        }}>{checked ? "✓" : ""}</div>

        {/* name + qty + macros */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => onUpdate({ checked: !checked })} style={{
            fontSize: 13, fontWeight: 600,
            color: checked ? C.text : C.textMuted,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          }}>
            {food.name}
            <ConfidenceBadge confidence={food.confidence} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
            <button onClick={() => setShowQty(o => !o)} style={{
              fontSize: 11, color: showQty ? C.accent : C.muted,
              background: "transparent", border: "none", cursor: "pointer", padding: 0,
              textDecoration: "underline dotted",
            }}>{qty} {food.unit}</button>
            <span style={{ fontSize: 10, color: C.muted }}>·</span>
            <span style={{ fontSize: 11, color: C.accent, fontFamily: "monospace" }}>{n.protein}g P</span>
            <span style={{ fontSize: 11, color: C.info, fontFamily: "monospace" }}>{Math.round(n.kcal)} kcal</span>
            {cost > 0 && <span style={{ fontSize: 10, color: C.orange, fontFamily: "monospace" }}>₹{cost}</span>}
          </div>

          {showQty && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
              <button onClick={() => onUpdate({ qty: Math.max(0.5, +(qty - (qty >= 10 ? 5 : 0.5)).toFixed(2)) })} style={qtyBtn()}>−</button>
              <input type="number" value={qty} step={qty >= 10 ? 5 : 0.5} min="0"
                onChange={e => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
                style={{
                  width: 60, textAlign: "center", padding: "3px 4px", borderRadius: 5,
                  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                  fontSize: 12, outline: "none",
                }} />
              <span style={{ fontSize: 11, color: C.muted }}>{food.unit}</span>
              <button onClick={() => onUpdate({ qty: +(qty + (qty >= 10 ? 5 : 0.5)).toFixed(2) })} style={qtyBtn()}>+</button>
              {qty !== food.qty && (
                <button onClick={() => onUpdate({ qty: food.qty })} style={{
                  fontSize: 10, color: C.accentDim, background: "transparent",
                  border: "none", cursor: "pointer", marginLeft: 2,
                }}>reset</button>
              )}
            </div>
          )}
        </div>

        {/* ⋯ kebab menu */}
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }} onBlur={handleMenuBlur} tabIndex={-1}>
          <button onClick={() => setMenuOpen(o => !o)} style={{
            padding: "3px 7px", borderRadius: 6, border: "none",
            background: menuOpen ? C.surface : "transparent",
            color: C.muted, cursor: "pointer", fontSize: 16, lineHeight: 1,
          }}>⋯</button>
          {menuOpen && (
            <div style={{
              position: "absolute", right: 0, top: "100%", zIndex: 60,
              background: C.cardElevated, border: `1px solid ${C.border}`,
              borderRadius: 9, padding: "4px 0", minWidth: 148, boxShadow: "0 4px 16px #0006",
            }}>
              {onTogglePin && (
                <button onClick={() => { onTogglePin(); setMenuOpen(false); }} style={menuItem()}>
                  {pinned ? "📌 Unpin (stop repeating)" : "📌 Pin (repeat daily)"}
                </button>
              )}
              {onRemove && (
                <button onClick={() => { onRemove(); setMenuOpen(false); }} style={{ ...menuItem(), color: C.danger }}>
                  ✕ Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact read-only row for past-day summary (no drag handle needed)
export function SummaryRow({ food, row }) {
  const n = scaleNutrients(food, row.qty);
  const cost = scaleCost(food, row.qty);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
      <span style={{ color: C.accent, fontSize: 13 }}>✓</span>
      <div style={{ flex: 1, fontSize: 13, color: C.text }}>{food.name}
        <span style={{ color: C.muted, fontSize: 11 }}> · {row.qty} {food.unit}</span>
      </div>
      <span style={{ fontSize: 11, color: C.accent, fontFamily: "monospace" }}>{n.protein}g</span>
      <span style={{ fontSize: 11, color: C.info, fontFamily: "monospace" }}>{Math.round(n.kcal)} kcal</span>
      {cost > 0 && <span style={{ fontSize: 10, color: C.orange, fontFamily: "monospace" }}>₹{cost}</span>}
    </div>
  );
}

function qtyBtn() {
  return {
    width: 24, height: 24, borderRadius: 5,
    border: `1px solid ${C.border}`, background: C.surface, color: C.text,
    cursor: "pointer", fontSize: 13,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}
function menuItem() {
  return {
    display: "block", width: "100%", padding: "9px 14px", border: "none",
    background: "transparent", color: C.text, cursor: "pointer", fontSize: 12,
    textAlign: "left", fontWeight: 500,
  };
}
