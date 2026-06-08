import { useState } from "react";
import { C, scaleNutrients } from "../utils/helpers.js";
import { ConfidenceBadge } from "./UI.jsx";

export default function MealItem({
  food, entry, onUpdate, onRemove, onTogglePin, pinned = false,
}) {
  const [showQty, setShowQty] = useState(false);

  const qty = entry.qty ?? food.qty;
  const checked = !!entry.checked;
  const n = scaleNutrients(food, qty);

  return (
    <div style={{marginBottom:4}}>
      <div style={{
        display:"flex", alignItems:"flex-start", gap:8, padding:"9px 10px",
        borderRadius:10, transition:"background 0.12s",
        background: checked ? "rgba(200,245,90,0.07)" : "transparent",
        border: checked ? "1px solid rgba(200,245,90,0.20)" : "1px solid transparent",
      }}>
        <div onClick={() => onUpdate({ checked: !checked })} style={{
          width:20, height:20, borderRadius:5, flexShrink:0, marginTop:1,
          border: `2px solid ${checked ? C.accent : C.border}`,
          background: checked ? C.accent : "transparent",
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"#0b0d0e", fontSize:11, fontWeight:800, cursor:"pointer",
        }}>{checked ? "✓" : ""}</div>

        <div style={{flex:1, minWidth:0}}>
          <div onClick={() => onUpdate({ checked: !checked })} style={{
            fontSize:13, fontWeight:600,
            color: checked ? C.text : C.textMuted,
            cursor:"pointer", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap",
          }}>
            {food.name}
            <ConfidenceBadge confidence={food.confidence}/>
          </div>

          <div style={{display:"flex", alignItems:"center", gap:6, marginTop:2, flexWrap:"wrap"}}>
            <button onClick={() => setShowQty(o => !o)} style={{
              fontSize:11, color: showQty ? C.accent : C.muted,
              background:"transparent", border:"none", cursor:"pointer", padding:0,
              textDecoration:"underline dotted",
            }}>{qty} {food.unit}</button>
            <span style={{fontSize:10, color:C.muted}}>·</span>
            <span style={{fontSize:11, color:C.accent, fontFamily:"monospace"}}>{n.protein}g P</span>
            <span style={{fontSize:11, color:C.info, fontFamily:"monospace"}}>{Math.round(n.kcal)} kcal</span>
            <span style={{fontSize:10, color:C.muted, fontFamily:"monospace"}}>{n.satFat}g SF</span>
          </div>

          {showQty && (
            <div style={{display:"flex", alignItems:"center", gap:5, marginTop:6}}>
              <button onClick={() => onUpdate({ qty: Math.max(0.5, +(qty - (qty>=10?5:0.5)).toFixed(2)) })} style={qtyBtn()}>−</button>
              <input type="number" value={qty} step={qty>=10?5:0.5} min="0"
                onChange={e => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
                style={{width:60, textAlign:"center", padding:"3px 4px", borderRadius:5,
                  background:C.surface, border:`1px solid ${C.border}`, color:C.text,
                  fontSize:12, outline:"none"}}/>
              <span style={{fontSize:11, color:C.muted}}>{food.unit}</span>
              <button onClick={() => onUpdate({ qty: +(qty + (qty>=10?5:0.5)).toFixed(2) })} style={qtyBtn()}>+</button>
              {qty !== food.qty && (
                <button onClick={() => onUpdate({ qty: food.qty })} style={{
                  fontSize:10, color:C.accentDim, background:"transparent",
                  border:"none", cursor:"pointer", marginLeft:2,
                }}>reset</button>
              )}
            </div>
          )}
        </div>

        {onTogglePin && (
          <button onClick={onTogglePin} title={pinned ? "Unpin (stop repeating daily)" : "Pin (repeat every day)"} style={{
            padding:"3px 6px", borderRadius:6, border:"none",
            background:"transparent", cursor:"pointer", fontSize:13,
            color: pinned ? C.accent : C.muted, opacity: pinned ? 1 : 0.45,
          }}>📌</button>
        )}

        {onRemove && (
          <button onClick={onRemove} style={{
            padding:"3px 6px", borderRadius:6, border:"none",
            background:"transparent", color:C.muted, cursor:"pointer", fontSize:12,
          }}>✕</button>
        )}
      </div>
    </div>
  );
}

function qtyBtn() {
  return {
    width:24, height:24, borderRadius:5,
    border:`1px solid ${C.border}`, background:C.surface, color:C.text,
    cursor:"pointer", fontSize:13,
    display:"flex", alignItems:"center", justifyContent:"center",
  };
}
