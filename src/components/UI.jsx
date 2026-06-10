import { useState, useRef } from "react";
import { C } from "../utils/helpers.js";
import { CONFIDENCE_BADGES } from "../data/foodDatabase.js";

export function Pill({ label, value, unit, color, flex = 1 }) {
  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11,
      padding: "9px 10px", minWidth: 64, flex,
    }}>
      <span style={{ fontSize:17, fontWeight:800, color, letterSpacing:-0.3 }}>{value}</span>
      <span style={{ fontSize:9, color:C.muted, marginTop:1 }}>{unit}</span>
      <span style={{ fontSize:10, color:C.muted, marginTop:2 }}>{label}</span>
    </div>
  );
}

export function Bar({ pct, color }) {
  const over = pct > 100;
  return (
    <div style={{ background:C.border, borderRadius:99, height:7, flex:1, overflow:"hidden" }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`, height:"100%", borderRadius:99,
        background: over ? C.danger : color, transition: "width 0.35s ease",
      }}/>
    </div>
  );
}

export function ConfidenceBadge({ confidence }) {
  const b = CONFIDENCE_BADGES[confidence] || CONFIDENCE_BADGES.estimated;
  return (
    <span title={b.label} style={{
      fontSize:10, padding:"1px 5px", borderRadius:99,
      background:"rgba(255,255,255,0.04)", color: b.color,
    }}>{b.emoji}</span>
  );
}

export function Button({ children, onClick, variant = "default", style = {}, disabled }) {
  const variants = {
    default: { bg: C.card, color: C.text, border: C.border },
    primary: { bg: C.accent, color: "#0b0d0e", border: C.accent },
    danger:  { bg: "transparent", color: C.danger, border: C.danger },
    ghost:   { bg: "transparent", color: C.muted, border: C.border },
  };
  const v = variants[variant] || variants.default;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:"9px 14px", borderRadius:9, border:`1px solid ${v.border}`,
      background:v.bg, color:v.color, cursor: disabled?"not-allowed":"pointer",
      fontSize:13, fontWeight: variant==="primary"?700:500,
      opacity: disabled ? 0.5 : 1,
      transition:"all 0.15s", ...style,
    }}>
      {children}
    </button>
  );
}

export function Modal({ children, onClose, maxWidth = 420 }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", padding:14,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={{
        background:C.card, border:`1px solid ${C.border}`, borderRadius:16,
        padding:20, width:"100%", maxWidth, maxHeight:"92vh", overflowY:"auto",
      }}>
        {children}
      </div>
    </div>
  );
}

export function PhotoButton({ url, onUpload, onView, compact = false }) {
  const ref = useRef();
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment"
        style={{display:"none"}}
        onChange={e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => onUpload(ev.target.result);
          reader.readAsDataURL(file);
        }}/>
      <button onClick={() => url ? onView() : ref.current.click()} style={{
        padding: compact ? "3px 6px" : "5px 8px", borderRadius:6,
        border:`1px solid ${C.border}`, background:C.surface,
        color: url ? C.accent : C.muted, cursor:"pointer",
        fontSize:11, flexShrink:0,
      }}>
        {url ? "📷✓" : "📷"}
      </button>
    </>
  );
}

export function NumberInput({ value, onChange, min = 0, step = "any", style = {} }) {
  return (
    <input type="number" value={value} min={min} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{
        padding:"7px 9px", borderRadius:7, fontSize:13,
        background:C.surface, border:`1px solid ${C.border}`, color:C.text,
        outline:"none", boxSizing:"border-box", width:"100%", ...style,
      }}/>
  );
}

export function TextInput({ value, onChange, placeholder, style = {} }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding:"7px 9px", borderRadius:7, fontSize:13,
        background:C.surface, border:`1px solid ${C.border}`, color:C.text,
        outline:"none", boxSizing:"border-box", width:"100%", ...style,
      }}/>
  );
}
