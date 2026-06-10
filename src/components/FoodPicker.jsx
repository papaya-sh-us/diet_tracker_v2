import { useState, useEffect, useMemo } from "react";
import { C } from "../utils/helpers.js";
import { FOOD_CATEGORIES, CONFIDENCE_BADGES } from "../data/foodDatabase.js";
import { getAllFoods, saveFood, deleteFood } from "../db/database.js";
import { Button, Modal, NumberInput, TextInput, ConfidenceBadge } from "./UI.jsx";

// Picker — search/browse foods. mode="pick" selects into a meal; mode="manage"
// opens each food for editing. Both can add a new custom food.
export function FoodPicker({ onPick, onClose, mode = "pick", allNutrients, customNutrients, setCustomNutrients }) {
  const [foods, setFoods] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState(null);

  useEffect(() => { refresh(); }, []);
  async function refresh() { setFoods(await getAllFoods()); }

  const filtered = useMemo(() => {
    let f = foods;
    if (category !== "all") f = f.filter(x => x.category === category);
    if (search.trim()) { const q = search.toLowerCase(); f = f.filter(x => x.name.toLowerCase().includes(q)); }
    return f.slice().sort((a,b) => a.name.localeCompare(b.name));
  }, [foods, search, category]);

  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:140, display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}`, background:C.surface,
        display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <div style={{ fontSize:15, fontWeight:700, color:C.text }}>
          {mode === "manage" ? "Food database" : "Pick a food"}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Button variant="primary" onClick={() => setEditing({ _new:true })} style={{ padding:"6px 11px" }}>+ Add food</Button>
          <Button variant="ghost" onClick={onClose} style={{ padding:"6px 12px" }}>Close</Button>
        </div>
      </div>

      <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}` }}>
        <TextInput value={search} onChange={setSearch} placeholder="Search foods…"/>
        <div style={{ display:"flex", gap:4, marginTop:10, overflowX:"auto", paddingBottom:4 }}>
          {[{ id:"all", name:"All", emoji:"🌍" }, ...FOOD_CATEGORIES].map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              padding:"5px 10px", borderRadius:99, border:`1px solid ${C.border}`,
              background: category===c.id ? C.accent : C.card, color: category===c.id ? "#0b0d0e" : C.muted,
              cursor:"pointer", fontSize:11, fontWeight:600, whiteSpace:"nowrap", flexShrink:0 }}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"8px 12px" }}>
        <div style={{ maxWidth:600, margin:"0 auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding:"30px 14px", textAlign:"center", color:C.muted, fontSize:13 }}>
              No foods found.<br/>
              <Button variant="primary" onClick={() => setEditing({ _new:true })} style={{ marginTop:14 }}>+ Add custom food</Button>
            </div>
          )}
          {filtered.map(food => (
            <div key={food.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
              borderRadius:10, marginBottom:5, cursor:"pointer", background:C.card, border:`1px solid ${C.border}` }}
              onClick={() => (mode === "manage" ? setEditing(food) : onPick(food))}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text, display:"flex", alignItems:"center", gap:6 }}>
                  {food.name}
                  <ConfidenceBadge confidence={food.confidence}/>
                </div>
                <div style={{ fontSize:11, color:C.muted }}>
                  per {food.qty}{food.unit?` ${food.unit}`:""} · {food.protein}g P · {food.kcal} kcal
                </div>
              </div>
              {mode === "pick" && (
                <button onClick={(e) => { e.stopPropagation(); setEditing(food); }} style={{
                  padding:"4px 8px", borderRadius:6, border:`1px solid ${C.border}`,
                  background:"transparent", color:C.muted, cursor:"pointer", fontSize:11 }}>edit</button>
              )}
              {mode === "manage" && (
                <span style={{ fontSize:11, color:C.accentDim, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 8px" }}>edit</span>
              )}
            </div>
          ))}
          <Button variant="ghost" onClick={() => setEditing({ _new:true })} style={{ width:"100%", marginTop:12 }}>+ Add new food to database</Button>
        </div>
      </div>

      {editing && (
        <FoodEditor food={editing} allNutrients={allNutrients} customNutrients={customNutrients}
          setCustomNutrients={setCustomNutrients} onClose={() => setEditing(null)} onSaved={refresh}/>
      )}
    </div>
  );
}

// Editor — create or edit a food. Renders ALL nutrients (core + custom) and lets
// you add brand-new nutrient fields inline (FIX #4).
export function FoodEditor({ food, onClose, onSaved, allNutrients = [], customNutrients = [], setCustomNutrients }) {
  const isNew = food._new;
  const nutrients = allNutrients.length ? allNutrients : [];

  function makeBlank() {
    const b = { id:`custom_${Date.now()}`, name:"", category:"prepared", qty:100, unit:"g", confidence:"custom", notes:"" };
    nutrients.forEach(n => b[n.key] = 0);
    return b;
  }
  const [form, setForm] = useState(isNew ? makeBlank() : { ...food });
  const [nl, setNl] = useState(""); const [nu, setNu] = useState("mg"); const [nv, setNv] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const addNutrientField = () => {
    const key = nl.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || !nl.trim()) return;
    if (setCustomNutrients && !nutrients.some(n => n.key === key)) {
      setCustomNutrients(prev => [...prev, { key, label:nl.trim(), unit:nu, target:0, type:"micro", custom:true }]);
    }
    set(key, parseFloat(nv) || 0);
    setNl(""); setNv("");
  };

  async function handleSave() {
    if (!form.name.trim()) return;
    if (!isNew && form.confidence !== "custom" && (form.protein !== food.protein || form.kcal !== food.kcal || form.qty !== food.qty)) {
      form.confidence = "custom";
    }
    await saveFood(form);
    onSaved?.(); onClose();
  }
  async function handleDelete() {
    if (!window.confirm("Delete this food?")) return;
    await deleteFood(form.id); onSaved?.(); onClose();
  }

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>{isNew ? "Add Food" : "Edit Food"}</div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:12 }}>Values per stated quantity.</div>

      {/* Scan nutrition label — placeholder until the AI/OCR layer is added */}
      <button onClick={() => alert("📷 Label scanning is coming with the AI update. For now, enter values manually below.")} style={{
        display:"flex", alignItems:"center", justifyContent:"center", gap:8, width:"100%",
        padding:"11px", borderRadius:10, marginBottom:14, cursor:"pointer",
        background:"transparent", border:`1px dashed ${C.accentDim}`, color:C.accentDim, fontSize:13, fontWeight:600,
      }}>📷 Scan nutrition label <span style={{ fontSize:10, opacity:0.7 }}>(coming soon)</span></button>

      <label style={{ fontSize:11, color:C.muted }}>Name</label>
      <TextInput value={form.name} onChange={v => set("name", v)} style={{ marginBottom:10 }}/>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
        <div><label style={{ fontSize:11, color:C.muted }}>Qty</label><NumberInput value={form.qty} onChange={v => set("qty", v)}/></div>
        <div><label style={{ fontSize:11, color:C.muted }}>Unit</label><TextInput value={form.unit} onChange={v => set("unit", v)}/></div>
        <div>
          <label style={{ fontSize:11, color:C.muted }}>Category</label>
          <select value={form.category} onChange={e => set("category", e.target.value)} style={{ width:"100%", padding:"7px 9px", borderRadius:7, fontSize:13, background:C.surface, border:`1px solid ${C.border}`, color:C.text, outline:"none" }}>
            {FOOD_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize:11, color:C.muted, margin:"4px 0 6px", fontWeight:600 }}>NUTRIENTS</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
        {nutrients.map(n => (
          <div key={n.key}>
            <label style={{ fontSize:11, color: n.custom?C.purple:C.muted }}>{n.label}{n.custom?" ◆":""} ({n.unit || "kcal"})</label>
            <NumberInput value={form[n.key] ?? 0} onChange={v => set(n.key, v)}/>
          </div>
        ))}
      </div>

      <div style={{ padding:11, borderRadius:10, background:C.surface, border:`1px dashed ${C.purple}`, marginBottom:12 }}>
        <div style={{ fontSize:11, color:C.purple, fontWeight:700, marginBottom:7 }}>◆ Add a nutrient not listed above (Sodium, Magnesium…)</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <input value={nl} onChange={e=>setNl(e.target.value)} placeholder="Name" style={inpEd("1 1 42%")}/>
          <input value={nu} onChange={e=>setNu(e.target.value)} placeholder="unit" style={inpEd("1 1 18%")}/>
          <input type="number" value={nv} onChange={e=>setNv(e.target.value)} placeholder="amount" style={inpEd("1 1 22%")}/>
          <button onClick={addNutrientField} style={{ flex:"1 1 100%", marginTop:6, padding:"8px", borderRadius:8, background:C.purple, color:"#0b0d0e", border:"none", fontWeight:700, cursor:"pointer", fontSize:12 }}>Add nutrient field</button>
        </div>
      </div>

      <label style={{ fontSize:11, color:C.muted }}>Confidence</label>
      <select value={form.confidence} onChange={e => set("confidence", e.target.value)} style={{ width:"100%", padding:"7px 9px", borderRadius:7, fontSize:13, background:C.surface, border:`1px solid ${C.border}`, color:C.text, outline:"none", marginBottom:10 }}>
        {Object.entries(CONFIDENCE_BADGES).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
      </select>

      <label style={{ fontSize:11, color:C.muted }}>Notes</label>
      <TextInput value={form.notes || ""} onChange={v => set("notes", v)} style={{ marginBottom:14 }}/>

      <div style={{ display:"flex", gap:8 }}>
        <Button variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Button>
        {!isNew && form.confidence === "custom" && <Button variant="danger" onClick={handleDelete}>Delete</Button>}
        <Button variant="primary" onClick={handleSave} style={{ flex:1 }}>Save</Button>
      </div>
    </Modal>
  );
}

function inpEd(flex) {
  return { flex, padding:"7px 9px", borderRadius:7, background:C.card, border:`1px solid ${C.border}`, color:C.text, fontSize:12, outline:"none" };
}
