import { useState, useEffect, useMemo, useCallback } from "react";
import {
  C, todayKey, dateKey, parseDate, scaleNutrients, emptyTotals, addTotals,
  formatDateLong,
} from "./utils/helpers.js";
import { FOOD_DB, NUTRIENTS } from "./data/foodDatabase.js";
import { DEFAULT_MEALS, MEAL_EMOJI_CHOICES, DEFAULT_TARGETS } from "./data/mealPlan.js";
import {
  openDB, seedFoodsIfEmpty, getAllFoods, getDayLog, saveDayLog, saveDayTotals,
  getSettings, saveSetting, purgeOldLogs,
  getPinnedFoods, savePinnedFoods,
  getCustomNutrients, saveCustomNutrients,
  getVisibleCards, saveVisibleCards, exportAll, importAll,
} from "./db/database.js";
import { Button, Modal, NumberInput } from "./components/UI.jsx";
import MealItem from "./components/MealItem.jsx";
import Calendar from "./components/Calendar.jsx";
import { FoodPicker, FoodEditor } from "./components/FoodPicker.jsx";

function buildNutrients(custom) { return [...NUTRIENTS, ...custom]; }

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [foods, setFoods]   = useState([]);
  const [foodMap, setFoodMap] = useState({});
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [pins, setPins]     = useState({});
  const [days, setDays]     = useState({});
  const [meals, setMeals]   = useState(DEFAULT_MEALS);
  const [customNutrients, setCustomNutrients] = useState([]);
  const [visibleCards, setVisibleCards] = useState(["satFat","fibre","iron","calcium","b12","vitD"]);

  const [activeDate, setActiveDate] = useState(todayKey());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDB, setShowDB] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showMealManager, setShowMealManager] = useState(false);
  const [picker, setPicker] = useState(null);
  const [editingFood, setEditingFood] = useState(null);

  const allNutrients = useMemo(() => buildNutrients(customNutrients), [customNutrients]);
  const nutrientKeys = useMemo(() => allNutrients.map(n => n.key), [allNutrients]);
  const isToday = activeDate === todayKey();

  useEffect(() => {
    async function init() {
      await openDB();
      await seedFoodsIfEmpty(FOOD_DB);
      await purgeOldLogs();
      const allFoods = await getAllFoods();
      setFoods(allFoods);
      const fm = {}; allFoods.forEach(f => fm[f.id] = f); setFoodMap(fm);
      const settings = await getSettings();
      if (settings.targets) setTargets({ ...DEFAULT_TARGETS, ...settings.targets });
      setCustomNutrients(await getCustomNutrients());
      const vc = await getVisibleCards(); if (vc) setVisibleCards(vc);
      if (settings.meals && Array.isArray(settings.meals) && settings.meals.length) setMeals(settings.meals);
      const p = await getPinnedFoods();
      setPins(p && typeof p === "object" ? p : {});
      const today = todayKey();
      const existing = await getDayLog(today);
      if (existing && existing.dayState) setDays({ [today]: existing.dayState });
      else if (existing && existing.items) setDays({ [today]: migrateLegacyDay(existing) });
      setInitialized(true);
    }
    init();
  }, []);

  const refreshFoods = useCallback(async () => {
    const all = await getAllFoods();
    setFoods(all);
    const fm = {}; all.forEach(f => fm[f.id] = f); setFoodMap(fm);
  }, []);

  useEffect(() => { if (initialized) saveSetting("targets", targets); }, [initialized, targets]);
  useEffect(() => { if (initialized) saveSetting("meals", meals); }, [initialized, meals]);
  useEffect(() => { if (initialized) savePinnedFoods(pins); }, [initialized, pins]);
  useEffect(() => { if (initialized) saveCustomNutrients(customNutrients); }, [initialized, customNutrients]);
  useEffect(() => { if (initialized) saveVisibleCards(visibleCards); }, [initialized, visibleCards]);

  const getMealRows = useCallback((mealId) => {
    const day = days[activeDate] || {};
    const sec = day[mealId] || {};
    const state = sec.state || {};
    const oneoff = sec.oneoff || [];
    const rows = [];
    const seen = {};
    (pins[mealId] || []).forEach(p => {
      seen[p.foodId] = (seen[p.foodId] || 0) + 1;
      const key = `pin_${p.foodId}_${seen[p.foodId]}`;
      const st = state[key] || {};
      rows.push({ key, foodId: p.foodId, qty: st.qty ?? p.qty, checked: !!st.checked, pinned: true });
    });
    oneoff.forEach(o => {
      const st = state[o.key] || {};
      rows.push({ key: o.key, foodId: o.foodId, qty: st.qty ?? o.qty, checked: !!st.checked, pinned: false });
    });
    return rows;
  }, [days, pins, activeDate]);

  const totals = useMemo(() => {
    let t = emptyTotals(nutrientKeys);
    meals.forEach(meal => {
      getMealRows(meal.id).forEach(row => {
        if (!row.checked) return;
        const food = foodMap[row.foodId]; if (!food) return;
        const n = scaleNutrients(food, row.qty, nutrientKeys);
        t = addTotals(t, n, nutrientKeys);
      });
    });
    return t;
  }, [getMealRows, foodMap, nutrientKeys, meals]);

  useEffect(() => {
    if (!initialized) return;
    const dayState = days[activeDate] || {};
    saveDayLog(activeDate, { dayState });
    saveDayTotals(activeDate, totals);
  }, [initialized, days, activeDate, totals]);

  const setRowState = (mealId, key, patch) => {
    setDays(prev => {
      const day = structuredClone(prev[activeDate] || {});
      day[mealId] = day[mealId] || { state: {}, oneoff: [] };
      day[mealId].state = day[mealId].state || {};
      day[mealId].state[key] = { ...(day[mealId].state[key] || {}), ...patch };
      return { ...prev, [activeDate]: day };
    });
  };
  const addOneoff = (mealId, food) => {
    setDays(prev => {
      const day = structuredClone(prev[activeDate] || {});
      day[mealId] = day[mealId] || { state: {}, oneoff: [] };
      const key = `oneoff_${food.id}_${Date.now()}`;
      day[mealId].oneoff = [...(day[mealId].oneoff || []), { key, foodId: food.id, qty: food.qty }];
      day[mealId].state = day[mealId].state || {};
      day[mealId].state[key] = { checked: true, qty: food.qty };
      return { ...prev, [activeDate]: day };
    });
  };
  const removeOneoff = (mealId, key) => {
    setDays(prev => {
      const day = structuredClone(prev[activeDate] || {});
      if (day[mealId]) {
        day[mealId].oneoff = (day[mealId].oneoff || []).filter(o => o.key !== key);
        if (day[mealId].state) delete day[mealId].state[key];
      }
      return { ...prev, [activeDate]: day };
    });
  };

  const togglePin = (mealId, row) => {
    if (row.pinned) {
      setPins(prev => {
        const next = structuredClone(prev);
        const seen = {};
        next[mealId] = (next[mealId] || []).filter(p => {
          seen[p.foodId] = (seen[p.foodId] || 0) + 1;
          return `pin_${p.foodId}_${seen[p.foodId]}` !== row.key;
        });
        return next;
      });
      setDays(prev => {
        const day = structuredClone(prev[activeDate] || {});
        day[mealId] = day[mealId] || { state: {}, oneoff: [] };
        const nk = `oneoff_${row.foodId}_${Date.now()}`;
        day[mealId].oneoff = [...(day[mealId].oneoff || []), { key: nk, foodId: row.foodId, qty: row.qty }];
        day[mealId].state = day[mealId].state || {};
        day[mealId].state[nk] = { checked: row.checked, qty: row.qty };
        return { ...prev, [activeDate]: day };
      });
    } else {
      setPins(prev => {
        const next = structuredClone(prev);
        next[mealId] = [...(next[mealId] || []), { foodId: row.foodId, qty: row.qty }];
        return next;
      });
      setDays(prev => {
        const day = structuredClone(prev[activeDate] || {});
        if (day[mealId]) day[mealId].oneoff = (day[mealId].oneoff || []).filter(o => o.key !== row.key);
        return { ...prev, [activeDate]: day };
      });
    }
  };

  const shiftDate = (delta) => {
    const d = parseDate(activeDate); d.setDate(d.getDate() + delta);
    setActiveDate(dateKey(d));
  };

  // ── meal management (#3): add / remove / rename / set time. Applies to all days. ──
  const addMeal = (label, emoji, time) => {
    const id = "meal_" + Date.now();
    setMeals(prev => [...prev, { id, label: label || "New meal", emoji: emoji || "🍽️", time: time || "" }]);
  };
  const updateMeal = (id, patch) => setMeals(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const removeMeal = (id) => {
    setMeals(prev => prev.filter(m => m.id !== id));
    // clean up pins + day-state for that meal
    setPins(prev => { const n = { ...prev }; delete n[id]; return n; });
    setDays(prev => {
      const next = {};
      for (const [date, day] of Object.entries(prev)) {
        const d = { ...day }; delete d[id]; next[date] = d;
      }
      return next;
    });
  };

  if (!initialized) {
    return <div style={{ minHeight:"100vh", background:C.bg, color:C.muted,
      display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>Loading…</div>;
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,sans-serif", paddingBottom:48 }}>
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"13px 14px", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ maxWidth:600, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:1.2 }}>Yashus · Nutrition Tracker</div>
            <div style={{ fontSize:13, color:C.muted }}>Tap a meal item's 📌 to repeat it daily</div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <Button variant="ghost" onClick={() => setShowDB(true)} style={{ padding:"7px 10px" }}>🍎</Button>
            <Button variant="ghost" onClick={() => setShowCalendar(true)} style={{ padding:"7px 10px" }}>📅</Button>
            <Button variant="ghost" onClick={() => setShowSettings(true)} style={{ padding:"7px 10px" }}>⚙</Button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:600, margin:"0 auto", padding:"13px 12px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <button onClick={() => shiftDate(-1)} style={navBtn()}>‹</button>
          <div style={{ flex:1, textAlign:"center" }}>
            <div style={{ fontSize:14, fontWeight:700 }}>
              {isToday ? "Today" : formatDateLong(activeDate).split(",")[0]}
              {!isToday && <span style={{ marginLeft:6, fontSize:9, color:C.warn, border:`1px solid ${C.warn}`, borderRadius:4, padding:"0 4px" }}>EDITABLE</span>}
            </div>
            <div style={{ fontSize:11, color:C.muted }}>{formatDateLong(activeDate)}</div>
          </div>
          <button onClick={() => !isToday && shiftDate(1)} disabled={isToday} style={{ ...navBtn(), opacity:isToday?0.3:1 }}>›</button>
        </div>
        {!isToday && (
          <button onClick={() => setActiveDate(todayKey())} style={{ width:"100%", marginBottom:12, padding:"6px", borderRadius:8, fontSize:11, background:"transparent", border:`1px solid ${C.border}`, color:C.accentDim, cursor:"pointer" }}>← Back to today</button>
        )}

        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <BigCard label="Protein" value={`${Math.round(totals.protein)}g`} sub={`/ ${targets.protein}g`} pct={pctOf(totals.protein, targets.protein)} color={C.accent}/>
            <BigCard label="Calories" value={Math.round(totals.kcal)} sub={`/ ${targets.kcal}`} pct={pctOf(totals.kcal, targets.kcal)} color={C.info}/>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {visibleCards.map(key => {
              const n = allNutrients.find(x => x.key === key); if (!n) return null;
              const v = +(totals[key] || 0).toFixed(1);
              const tgt = targets[key] ?? n.target ?? 0;
              return <SmallCard key={key} n={n} value={v} pct={pctOf(v, tgt)} onRemove={() => setVisibleCards(prev => prev.filter(k => k !== key))}/>;
            })}
            <button onClick={() => setShowCardPicker(true)} style={{ flex:"1 1 28%", minWidth:92, minHeight:60, borderRadius:10, border:`1px dashed ${C.borderHover || C.border}`, background:"transparent", color:C.accentDim, cursor:"pointer", fontSize:12, fontWeight:600 }}>+ add card</button>
          </div>
        </div>

        {meals.map(meal => {
          const rows = getMealRows(meal.id);
          let mp = 0, mk = 0;
          rows.forEach(r => { if (!r.checked) return; const f = foodMap[r.foodId]; if (!f) return; const n = scaleNutrients(f, r.qty, ["protein","kcal"]); mp += n.protein; mk += n.kcal; });
          return (
            <div key={meal.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, marginBottom:12, overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>{meal.emoji}</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700 }}>{meal.label}</div>
                    {meal.time ? <div style={{ fontSize:11, color:C.muted }}>{meal.time}</div> : null}
                  </div>
                </div>
                <div style={{ display:"flex", gap:10, fontSize:12, fontFamily:"monospace" }}>
                  <span style={{ color:C.accent }}>{mp.toFixed(0)}g P</span>
                  <span style={{ color:C.info }}>{Math.round(mk)} kcal</span>
                </div>
              </div>
              <div style={{ padding:"6px" }}>
                {rows.length === 0 && (
                  <div style={{ fontSize:11, color:C.muted, fontStyle:"italic", padding:"8px 8px" }}>No foods yet. Add one below, then 📌 it to repeat daily.</div>
                )}
                {rows.map(row => {
                  const food = foodMap[row.foodId]; if (!food) return null;
                  const isPalya = food.category === "leaf" || food.category === "veg";
                  return (
                    <MealItem key={row.key} food={food} entry={{ checked: row.checked, qty: row.qty }} pinned={row.pinned}
                      onUpdate={(patch) => setRowState(meal.id, row.key, patch)}
                      onTogglePin={() => togglePin(meal.id, row)}
                      onRemove={!row.pinned ? () => removeOneoff(meal.id, row.key) : undefined}
                      isPalya={isPalya}/>
                  );
                })}
                <button onClick={() => setPicker({ mealId: meal.id })} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"8px 10px", borderRadius:9, border:`1px dashed ${C.border}`, background:"transparent", color:C.muted, cursor:"pointer", fontSize:12, marginTop:4 }}>+ Add food from database</button>
              </div>
            </div>
          );
        })}

        <button onClick={() => setShowMealManager(true)} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:"100%", padding:"10px", borderRadius:11, border:`1px solid ${C.border}`, background:C.card, color:C.accentDim, cursor:"pointer", fontSize:12, fontWeight:600 }}>⚙ Manage meals (add / remove / rename / time)</button>

        <div style={{ textAlign:"center", marginTop:18, fontSize:10, color:C.muted }}>Data stored locally · Auto-saves · Every day editable</div>
      </div>

      {showMealManager && <MealManager meals={meals} onAdd={addMeal} onUpdate={updateMeal} onRemove={removeMeal} onClose={() => setShowMealManager(false)}/>}
      {showCalendar && <Calendar onClose={() => setShowCalendar(false)} onSelectDate={(d) => { setActiveDate(d); setShowCalendar(false); }}/>}
      {showSettings && <SettingsModal targets={targets} onSaveTargets={setTargets} allNutrients={allNutrients} onClose={() => setShowSettings(false)} onImport={refreshFoods}/>}
      {showDB && <FoodPicker mode="manage" allNutrients={allNutrients} customNutrients={customNutrients} setCustomNutrients={setCustomNutrients} onClose={() => setShowDB(false)} onPick={(food) => setEditingFood(food)}/>}
      {picker && <FoodPicker mode="pick" allNutrients={allNutrients} customNutrients={customNutrients} setCustomNutrients={setCustomNutrients} onClose={() => setPicker(null)} onPick={(food) => { addOneoff(picker.mealId, food); setPicker(null); }}/>}
      {editingFood && <FoodEditor food={editingFood} allNutrients={allNutrients} customNutrients={customNutrients} setCustomNutrients={setCustomNutrients} onClose={() => setEditingFood(null)} onSaved={refreshFoods}/>}
      {showCardPicker && <CardPicker allNutrients={allNutrients} visibleCards={visibleCards} customNutrients={customNutrients} setCustomNutrients={setCustomNutrients} onAdd={(key) => { setVisibleCards(prev => [...prev, key]); setShowCardPicker(false); }} onClose={() => setShowCardPicker(false)}/>}
    </div>
  );
}

function BigCard({ label, value, sub, pct, color }) {
  return (
    <div style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:13, padding:"12px 14px" }}>
      <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
        <span style={{ fontSize:24, fontWeight:800, color, letterSpacing:-0.5 }}>{value}</span>
        <span style={{ fontSize:11, color:C.muted }}>{sub}</span>
      </div>
      <div style={{ marginTop:8, height:6, borderRadius:99, background:C.border, overflow:"hidden" }}>
        <div style={{ width:`${Math.min(pct,100)}%`, height:"100%", background: pct>100?C.danger:color }}/>
      </div>
    </div>
  );
}

function SmallCard({ n, value, pct, onRemove }) {
  const [hover, setHover] = useState(false);
  const met = n.lessIsBetter ? (value <= (n.target || Infinity)) : (value >= (n.target || 0));
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} style={{ flex:"1 1 28%", minWidth:92, background:C.card, position:"relative", border:`1px solid ${n.custom?C.purple:met?"rgba(74,222,128,0.3)":C.border}`, borderRadius:10, padding:"8px 10px" }}>
      <div style={{ fontSize:10, color:C.muted, display:"flex", justifyContent:"space-between" }}>
        <span>{n.label}{n.custom?<span style={{color:C.purple}}> ◆</span>:""}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ fontSize:15, fontWeight:700, fontFamily:"monospace", color: met?C.veg:C.text }}>
        {value}<span style={{ fontSize:9, color:C.muted }}> {n.unit}</span>
      </div>
      {hover && <button onClick={onRemove} title="Remove card" style={{ position:"absolute", top:-7, right:-7, width:18, height:18, borderRadius:99, background:C.danger, color:"#0b0d0e", border:"none", cursor:"pointer", fontSize:11, fontWeight:800, lineHeight:1 }}>×</button>}
    </div>
  );
}

function MealManager({ meals, onAdd, onUpdate, onRemove, onClose }) {
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("🍽️");
  const [time, setTime] = useState("");
  const add = () => { if (!label.trim()) return; onAdd(label.trim(), emoji, time); setLabel(""); setTime(""); setEmoji("🍽️"); };
  return (
    <Modal onClose={onClose} maxWidth={460}>
      <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Manage meals</div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>Add, rename, set a time, or remove meals. Changes apply to every day. Time is optional.</div>

      {meals.map(m => (
        <div key={m.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <select value={m.emoji} onChange={e => onUpdate(m.id, { emoji: e.target.value })} style={{ ...inp(), width:54, fontSize:16 }}>
              {MEAL_EMOJI_CHOICES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={m.label} onChange={e => onUpdate(m.id, { label: e.target.value })} style={{ ...inp(), flex:1 }}/>
            <button onClick={() => { if (window.confirm(`Remove "${m.label}"? Its pinned foods and logged entries for this meal will be removed from all days.`)) onRemove(m.id); }}
              style={{ padding:"6px 9px", borderRadius:7, border:`1px solid ${C.danger}`, background:"transparent", color:C.danger, cursor:"pointer", fontSize:11 }}>Remove</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:7 }}>
            <span style={{ fontSize:11, color:C.muted }}>Time (optional):</span>
            <input value={m.time || ""} onChange={e => onUpdate(m.id, { time: e.target.value })} placeholder="e.g. 7:00 AM" style={{ ...inp(), flex:1 }}/>
          </div>
        </div>
      ))}

      <div style={{ marginTop:14, padding:11, borderRadius:10, background:C.surface, border:`1px dashed ${C.accentDim}` }}>
        <div style={{ fontSize:11, color:C.accentDim, fontWeight:700, marginBottom:8 }}>+ Add a meal</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <select value={emoji} onChange={e => setEmoji(e.target.value)} style={{ ...inp(), width:54, fontSize:16 }}>
            {MEAL_EMOJI_CHOICES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Meal name (e.g. Supper)" style={{ ...inp(), flex:"1 1 50%" }}/>
          <input value={time} onChange={e => setTime(e.target.value)} placeholder="Time (optional)" style={{ ...inp(), flex:"1 1 30%" }}/>
          <button onClick={add} style={{ flex:"1 1 100%", marginTop:6, padding:"9px", borderRadius:8, background:C.accent, color:"#0b0d0e", border:"none", fontWeight:700, cursor:"pointer", fontSize:12 }}>Add meal</button>
        </div>
      </div>
      <div style={{ display:"flex", marginTop:14 }}>
        <Button variant="primary" onClick={onClose} style={{ flex:1 }}>Done</Button>
      </div>
    </Modal>
  );
}

function CardPicker({ allNutrients, visibleCards, customNutrients, setCustomNutrients, onAdd, onClose }) {
  const available = allNutrients.filter(n => !["protein","kcal"].includes(n.key) && !visibleCards.includes(n.key));
  const [label, setLabel] = useState(""); const [unit, setUnit] = useState("mg"); const [target, setTarget] = useState("");
  const addNew = () => {
    const key = label.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || allNutrients.some(n => n.key === key)) return;
    setCustomNutrients(prev => [...prev, { key, label:label.trim(), unit, target:parseFloat(target)||0, type:"micro", custom:true }]);
    onAdd(key);
  };
  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Add a nutrient card</div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:12 }}>Tap a nutrient to show it on the dashboard, or create a new one.</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:14 }}>
        {available.map(n => (
          <button key={n.key} onClick={() => onAdd(n.key)} style={{ padding:"8px 12px", borderRadius:9, background:C.card, border:`1px solid ${n.custom?C.purple:C.border}`, color: n.custom?C.purple:C.text, cursor:"pointer", fontSize:12 }}>+ {n.label}{n.custom?" ◆":""}</button>
        ))}
        {available.length === 0 && <div style={{ fontSize:12, color:C.muted }}>All nutrients are already shown.</div>}
      </div>
      <div style={{ paddingTop:14, borderTop:`1px solid ${C.border}` }}>
        <div style={{ fontSize:11, color:C.purple, fontWeight:700, marginBottom:8 }}>◆ Create a new nutrient</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Name (Magnesium)" style={{ ...inp(), flex:"1 1 45%" }}/>
          <input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="unit" style={{ ...inp(), flex:"1 1 20%" }}/>
          <input type="number" value={target} onChange={e=>setTarget(e.target.value)} placeholder="target" style={{ ...inp(), flex:"1 1 25%" }}/>
          <button onClick={addNew} style={{ flex:"1 1 100%", marginTop:6, padding:"9px", borderRadius:8, background:C.purple, color:"#0b0d0e", border:"none", fontWeight:700, cursor:"pointer", fontSize:12 }}>Add &amp; show card</button>
        </div>
      </div>
    </Modal>
  );
}

function SettingsModal({ targets, onSaveTargets, allNutrients, onClose, onImport }) {
  const [form, setForm] = useState({ ...targets });
  async function handleExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `yashus-tracker-backup-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  function handleImport() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try { await importAll(JSON.parse(await file.text())); onImport?.(); alert("Backup imported. Reload the page."); }
      catch (err) { alert("Import failed: " + err.message); }
    };
    input.click();
  }
  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Settings &amp; Targets</div>
      <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>Daily Targets</div>
      {allNutrients.map(n => (
        <div key={n.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
          <label style={{ fontSize:11, color: n.custom?C.purple:C.muted, flex:1 }}>{n.label}{n.custom?" ◆":""} ({n.unit || "kcal"})</label>
          <div style={{ width:100 }}><NumberInput value={form[n.key] ?? n.target ?? 0} onChange={v => setForm(p => ({ ...p, [n.key]: v }))}/></div>
        </div>
      ))}
      <div style={{ display:"flex", gap:8, marginTop:14 }}>
        <Button variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Button>
        <Button variant="primary" onClick={() => { onSaveTargets(form); onClose(); }} style={{ flex:1 }}>Save</Button>
      </div>
      <div style={{ height:1, background:C.border, margin:"18px 0 12px" }}/>
      <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>Data</div>
      <div style={{ display:"flex", gap:8 }}>
        <Button variant="default" onClick={handleExport} style={{ flex:1 }}>⬇ Export backup</Button>
        <Button variant="default" onClick={handleImport} style={{ flex:1 }}>⬆ Import backup</Button>
      </div>
      <div style={{ fontSize:10, color:C.muted, marginTop:10, lineHeight:1.5 }}>Backups are JSON files — keep them safe on Google Drive. Importing merges with current data.</div>
    </Modal>
  );
}

function migrateLegacyDay(log) {
  const out = {};
  const items = log.items || {};
  Object.entries(items).forEach(([key, entry]) => {
    const mealId = entry.mealId || "breakfast";
    out[mealId] = out[mealId] || { state: {}, oneoff: [] };
    const newKey = `oneoff_${entry.foodId}_${key}`;
    out[mealId].oneoff.push({ key: newKey, foodId: entry.foodId, qty: entry.qty });
    out[mealId].state[newKey] = { checked: !!entry.checked, qty: entry.qty };
  });
  return out;
}

const pctOf = (v, t) => t ? Math.round((v / t) * 100) : 0;
function navBtn() { return { width:34, height:34, borderRadius:9, background:"transparent", border:`1px solid ${C.border}`, color:C.text, cursor:"pointer", fontSize:18 }; }
function inp() { return { padding:"7px 9px", borderRadius:7, background:C.surface, border:`1px solid ${C.border}`, color:C.text, fontSize:12, outline:"none" }; }
