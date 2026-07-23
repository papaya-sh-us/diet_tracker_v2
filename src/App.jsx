import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import {
  C, todayKey, dateKey, parseDate, scaleNutrients, scaleCost,
  emptyTotals, addTotals, formatDateLong, recipeNutrients, recipeCost,
} from "./utils/helpers.js";
import { FOOD_DB, NUTRIENTS } from "./data/foodDatabase.js";
import { DEFAULT_MEALS, MEAL_EMOJI_CHOICES, DEFAULT_TARGETS } from "./data/mealPlan.js";
import {
  openDB, seedFoodsIfEmpty, getAllFoods, getDayLog, saveDayLog, saveDayTotals,
  getSettings, saveSetting, purgeOldLogs,
  getPinnedFoods, savePinnedFoods,
  getCustomNutrients, saveCustomNutrients,
  getVisibleCards, saveVisibleCards, exportAll, importAll,
  getAllRecipes, saveRecipe as dbSaveRecipe,
} from "./db/database.js";
import { Button, Modal, NumberInput } from "./components/UI.jsx";
import MealItem, { SummaryRow } from "./components/MealItem.jsx";
import { RecipeEditor, RecipeItem } from "./components/RecipeEditor.jsx";
import Calendar from "./components/Calendar.jsx";
import { FoodPicker, FoodEditor } from "./components/FoodPicker.jsx";

function buildNutrients(custom) { return [...NUTRIENTS, ...custom]; }

// ─── Row types in a meal ──────────────────────────────────────────────────────
// A "row" can be a food or a recipe. In pins, a recipe pin has { recipeId, servings }.
// In oneoff, { key, foodId?, recipeId?, qty?, servings? }
// In state, keyed by row.key, may have { checked, qty, servings, ingredientQtys }

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [foods, setFoods]   = useState([]);
  const [foodMap, setFoodMap] = useState({});
  const [recipes, setRecipes] = useState([]);
  const [recipeMap, setRecipeMap] = useState({});
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [pins, setPins]     = useState({});
  const [days, setDays]     = useState({});
  const [meals, setMeals]   = useState(DEFAULT_MEALS);
  const [customNutrients, setCustomNutrients] = useState([]);
  const [visibleCards, setVisibleCards] = useState(["satFat","fibre","iron","calcium","b12","vitD"]);
  // cardAdjustments: { [dateKey]: { [cardKey]: number } }
  const [cardAdjustments, setCardAdjustments] = useState({});

  const [activeDate, setActiveDate] = useState(todayKey());
  const [loadedDates, setLoadedDates] = useState({});
  const [editingPast, setEditingPast] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDB, setShowDB] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showMealManager, setShowMealManager] = useState(false);
  const [showRecipeEditor, setShowRecipeEditor] = useState(null); // null or recipe obj
  const [picker, setPicker] = useState(null);  // { mealId }
  const [editingFood, setEditingFood] = useState(null);
  const [adjustCard, setAdjustCard] = useState(null); // { key, label, unit }
  // drag state for small cards
  const [cardDragActive, setCardDragActive] = useState(null);
  // Whether the small nutrient cards are in "manage" state (remove ✕ visible,
  // dragging enabled). Off by default; a long-press on any card turns it on
  // for all of them together, a tap on any card turns it back off.
  const [cardsEditMode, setCardsEditMode] = useState(false);

  const allNutrients = useMemo(() => buildNutrients(customNutrients), [customNutrients]);
  const nutrientKeys = useMemo(() => allNutrients.map(n => n.key), [allNutrients]);
  const isToday = activeDate === todayKey();
  const showEditable = isToday || editingPast;

  // dnd-kit sensors for the food rows inside meals — unaffected by card edit mode
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 450, tolerance: 8 } }),
  );
  // Separate sensors for the small nutrient cards. Dragging on these is fully
  // disabled per-card (see SortableSmallCard's `disabled` option) until
  // cardsEditMode is on, so once it IS on, activation can be near-instant —
  // the long-press to enter the mode already served as the "are you sure"
  // gesture, so requiring a second long wait to actually drag would feel redundant.
  const cardSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: cardsEditMode ? 4 : 10 } }),
    useSensor(TouchSensor, { activationConstraint: cardsEditMode ? { delay: 50, tolerance: 8 } : { delay: 450, tolerance: 8 } }),
  );

  useEffect(() => {
    async function init() {
      await openDB();
      await seedFoodsIfEmpty(FOOD_DB);
      await purgeOldLogs();
      const allFoods = await getAllFoods();
      setFoods(allFoods);
      const fm = {}; allFoods.forEach(f => fm[f.id] = f); setFoodMap(fm);
      const allRecs = await getAllRecipes();
      setRecipes(allRecs);
      const rm = {}; allRecs.forEach(r => rm[r.id] = r); setRecipeMap(rm);
      const settings = await getSettings();
      if (settings.targets) setTargets({ ...DEFAULT_TARGETS, ...settings.targets });
      setCustomNutrients(await getCustomNutrients());
      const vc = await getVisibleCards(); if (vc) setVisibleCards(vc);
      if (settings.meals && Array.isArray(settings.meals) && settings.meals.length) setMeals(settings.meals);
      const p = await getPinnedFoods();
      setPins(p && typeof p === "object" ? p : {});
      if (settings.cardAdjustments) setCardAdjustments(settings.cardAdjustments);
      const today = todayKey();
      const existing = await getDayLog(today);
      if (existing && existing.dayState) setDays({ [today]: existing.dayState });
      else if (existing && existing.items) setDays({ [today]: migrateLegacyDay(existing) });
      setLoadedDates({ [today]: true });
      setInitialized(true);
    }
    init();
  }, []);

  const refreshFoods = useCallback(async () => {
    const all = await getAllFoods();
    setFoods(all);
    const fm = {}; all.forEach(f => fm[f.id] = f); setFoodMap(fm);
  }, []);

  const refreshRecipes = useCallback(async () => {
    const all = await getAllRecipes();
    setRecipes(all);
    const rm = {}; all.forEach(r => rm[r.id] = r); setRecipeMap(rm);
  }, []);

  useEffect(() => { if (initialized) saveSetting("targets", targets); }, [initialized, targets]);
  useEffect(() => { if (initialized) saveSetting("meals", meals); }, [initialized, meals]);
  useEffect(() => { if (initialized) savePinnedFoods(pins); }, [initialized, pins]);
  useEffect(() => { if (initialized) saveCustomNutrients(customNutrients); }, [initialized, customNutrients]);
  useEffect(() => { if (initialized) saveVisibleCards(visibleCards); }, [initialized, visibleCards]);
  useEffect(() => { if (initialized) saveSetting("cardAdjustments", cardAdjustments); }, [initialized, cardAdjustments]);

  // ─── Build meal rows ──────────────────────────────────────────────────────
  // Each row: { key, type:"food"|"recipe", foodId?, recipeId?, qty?, servings?,
  //             checked, pinned, ingredientQtys? }
  const getMealRows = useCallback((mealId) => {
    const day = days[activeDate] || {};
    const sec = day[mealId] || {};
    const state = sec.state || {};
    const oneoff = sec.oneoff || [];
    const rows = [];
    const seen = {};

    (pins[mealId] || []).forEach(p => {
      seen[p.foodId || p.recipeId] = (seen[p.foodId || p.recipeId] || 0) + 1;
      const refId = p.foodId || p.recipeId;
      const key = `pin_${refId}_${seen[refId]}`;
      const st = state[key] || {};
      if (p.recipeId) {
        rows.push({ key, type: "recipe", recipeId: p.recipeId, servings: st.servings ?? p.servings ?? 1, checked: !!st.checked, pinned: true, ingredientQtys: st.ingredientQtys || {} });
      } else {
        rows.push({ key, type: "food", foodId: p.foodId, qty: st.qty ?? p.qty, checked: !!st.checked, pinned: true });
      }
    });

    oneoff.forEach(o => {
      const st = state[o.key] || {};
      if (o.recipeId) {
        rows.push({ key: o.key, type: "recipe", recipeId: o.recipeId, servings: st.servings ?? o.servings ?? 1, checked: !!st.checked, pinned: false, ingredientQtys: st.ingredientQtys || {} });
      } else {
        rows.push({ key: o.key, type: "food", foodId: o.foodId, qty: st.qty ?? o.qty, checked: !!st.checked, pinned: false });
      }
    });
    return rows;
  }, [days, pins, activeDate]);

  // ─── Totals across all meals ──────────────────────────────────────────────
  const totals = useMemo(() => {
    let t = emptyTotals(nutrientKeys);
    meals.forEach(meal => {
      getMealRows(meal.id).forEach(row => {
        if (!row.checked) return;
        if (row.type === "recipe") {
          const recipe = recipeMap[row.recipeId]; if (!recipe) return;
          const n = recipeNutrients(recipe, foodMap, row.servings / (recipe.servings || 1), nutrientKeys, row.ingredientQtys || {});
          t = addTotals(t, n, nutrientKeys);
        } else {
          const food = foodMap[row.foodId]; if (!food) return;
          const n = scaleNutrients(food, row.qty, nutrientKeys);
          t = addTotals(t, n, nutrientKeys);
        }
      });
    });
    // apply card adjustments for today
    const adj = cardAdjustments[activeDate] || {};
    nutrientKeys.forEach(k => {
      if (adj[k]) t[k] = +((t[k] || 0) + adj[k]).toFixed(2);
    });
    // also protein + kcal adjustments
    if (adj.protein) t.protein = +((t.protein || 0) + adj.protein).toFixed(2);
    if (adj.kcal) t.kcal = +((t.kcal || 0) + adj.kcal).toFixed(1);
    return t;
  }, [getMealRows, foodMap, recipeMap, nutrientKeys, meals, cardAdjustments, activeDate]);

  // Total cost
  const totalCost = useMemo(() => {
    let c = 0;
    meals.forEach(meal => {
      getMealRows(meal.id).forEach(row => {
        if (!row.checked) return;
        if (row.type === "recipe") {
          const recipe = recipeMap[row.recipeId]; if (!recipe) return;
          c += recipeCost(recipe, foodMap, row.servings / (recipe.servings || 1), row.ingredientQtys || {});
        } else {
          const food = foodMap[row.foodId]; if (!food) return;
          c += scaleCost(food, row.qty);
        }
      });
    });
    const adj = (cardAdjustments[activeDate] || {}).cost || 0;
    return +(c + adj).toFixed(2);
  }, [getMealRows, foodMap, recipeMap, meals, cardAdjustments, activeDate]);

  // ─── Date loading / saving ────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    if (loadedDates[activeDate]) return;
    let cancelled = false;
    (async () => {
      const log = await getDayLog(activeDate);
      if (cancelled) return;
      const dayState = (log && log.dayState) ? log.dayState
                     : (log && log.items) ? migrateLegacyDay(log)
                     : {};
      setDays(prev => ({ ...prev, [activeDate]: dayState }));
      setLoadedDates(prev => ({ ...prev, [activeDate]: true }));
    })();
    return () => { cancelled = true; };
  }, [initialized, activeDate, loadedDates]);

  useEffect(() => {
    if (!initialized) return;
    if (!loadedDates[activeDate]) return;
    const dayState = days[activeDate] || {};
    saveDayLog(activeDate, { dayState });
    saveDayTotals(activeDate, totals);
  }, [initialized, days, activeDate, totals, loadedDates]);

  useEffect(() => { setEditingPast(false); }, [activeDate]);

  // ─── Row state mutations ──────────────────────────────────────────────────
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
      day[mealId].state[key] = { checked: true, qty: food.qty };
      return { ...prev, [activeDate]: day };
    });
  };

  const addRecipeOneoff = (mealId, recipe) => {
    setDays(prev => {
      const day = structuredClone(prev[activeDate] || {});
      day[mealId] = day[mealId] || { state: {}, oneoff: [] };
      const key = `oneoff_${recipe.id}_${Date.now()}`;
      day[mealId].oneoff = [...(day[mealId].oneoff || []), { key, recipeId: recipe.id, servings: 1 }];
      day[mealId].state[key] = { checked: true, servings: 1, ingredientQtys: {} };
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
      // unpin → convert to oneoff
      setPins(prev => {
        const next = structuredClone(prev);
        const seen = {};
        next[mealId] = (next[mealId] || []).filter(p => {
          const refId = p.foodId || p.recipeId;
          seen[refId] = (seen[refId] || 0) + 1;
          return `pin_${refId}_${seen[refId]}` !== row.key;
        });
        return next;
      });
      setDays(prev => {
        const day = structuredClone(prev[activeDate] || {});
        day[mealId] = day[mealId] || { state: {}, oneoff: [] };
        const nk = `oneoff_${row.foodId || row.recipeId}_${Date.now()}`;
        if (row.type === "recipe") {
          day[mealId].oneoff = [...(day[mealId].oneoff || []), { key: nk, recipeId: row.recipeId, servings: row.servings }];
          day[mealId].state[nk] = { checked: row.checked, servings: row.servings, ingredientQtys: row.ingredientQtys || {} };
        } else {
          day[mealId].oneoff = [...(day[mealId].oneoff || []), { key: nk, foodId: row.foodId, qty: row.qty }];
          day[mealId].state[nk] = { checked: row.checked, qty: row.qty };
        }
        return { ...prev, [activeDate]: day };
      });
    } else {
      // pin → move to pins, remove from oneoff
      setPins(prev => {
        const next = structuredClone(prev);
        if (row.type === "recipe") {
          next[mealId] = [...(next[mealId] || []), { recipeId: row.recipeId, servings: row.servings }];
        } else {
          next[mealId] = [...(next[mealId] || []), { foodId: row.foodId, qty: row.qty }];
        }
        return next;
      });
      setDays(prev => {
        const day = structuredClone(prev[activeDate] || {});
        if (day[mealId]) day[mealId].oneoff = (day[mealId].oneoff || []).filter(o => o.key !== row.key);
        return { ...prev, [activeDate]: day };
      });
    }
  };

  // ─── Drag-to-reorder within a meal ───────────────────────────────────────
  // Row order = pins first (ordered), then oneoffs (ordered).
  // We expose a flat sorted list per meal and allow drag within it.
  // Dragging a pin reorders pins; dragging an oneoff reorders oneoffs.
  // Cross-group drags are not supported (pins stay above oneoffs).

  const handleDragEnd = (mealId, event) => {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;

    const rows = getMealRows(mealId);
    const oldIdx = rows.findIndex(r => r.key === active.id);
    const newIdx = rows.findIndex(r => r.key === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const activeRow = rows[oldIdx];
    const overRow = rows[newIdx];

    // Only reorder within same group (both pinned or both oneoff)
    if (activeRow.pinned !== overRow.pinned) return;

    if (activeRow.pinned) {
      setPins(prev => {
        const next = structuredClone(prev);
        const pinList = next[mealId] || [];
        // find pin-group indices
        const pinRows = rows.filter(r => r.pinned);
        const pOld = pinRows.findIndex(r => r.key === active.id);
        const pNew = pinRows.findIndex(r => r.key === over.id);
        next[mealId] = arrayMove(pinList, pOld, pNew);
        return next;
      });
    } else {
      setDays(prev => {
        const day = structuredClone(prev[activeDate] || {});
        const sec = day[mealId] || { state: {}, oneoff: [] };
        const oneoffs = sec.oneoff || [];
        const oOld = oneoffs.findIndex(o => o.key === active.id);
        const oNew = oneoffs.findIndex(o => o.key === over.id);
        if (oOld === -1 || oNew === -1) return prev;
        sec.oneoff = arrayMove(oneoffs, oOld, oNew);
        day[mealId] = sec;
        return { ...prev, [activeDate]: day };
      });
    }
  };

  // ─── Small card drag reorder ──────────────────────────────────────────────
  const handleCardDragEnd = (event) => {
    const { active, over } = event;
    setCardDragActive(null);
    if (!active || !over || active.id === over.id) return;
    setVisibleCards(prev => {
      const oldIdx = prev.indexOf(active.id);
      const newIdx = prev.indexOf(over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  // ─── Card adjustment (press-hold) ────────────────────────────────────────
  const setCardAdj = (key, delta) => {
    setCardAdjustments(prev => {
      const dayAdj = { ...(prev[activeDate] || {}) };
      const cur = dayAdj[key] || 0;
      const next = +(cur + delta).toFixed(2);
      if (next === 0) { delete dayAdj[key]; } else { dayAdj[key] = next; }
      return { ...prev, [activeDate]: dayAdj };
    });
  };

  const removeCardAdj = (key) => {
    setCardAdjustments(prev => {
      const dayAdj = { ...(prev[activeDate] || {}) };
      delete dayAdj[key];
      return { ...prev, [activeDate]: dayAdj };
    });
  };

  // ─── Date navigation ──────────────────────────────────────────────────────
  const shiftDate = (delta) => {
    const d = parseDate(activeDate); d.setDate(d.getDate() + delta);
    setActiveDate(dateKey(d));
  };

  // ─── Meal management ──────────────────────────────────────────────────────
  const addMeal = (label, emoji, time) => {
    const id = "meal_" + Date.now();
    setMeals(prev => [...prev, { id, label: label || "New meal", emoji: emoji || "🍽️", time: time || "" }]);
  };
  const updateMeal = (id, patch) => setMeals(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const removeMeal = (id) => {
    setMeals(prev => prev.filter(m => m.id !== id));
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
    return <div style={{ minHeight: "100vh", background: C.bg, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>Loading…</div>;
  }

  const todayAdj = cardAdjustments[activeDate] || {};

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,sans-serif", paddingBottom: 48 }}>
      {/* ─── Header ─── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "13px 14px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Nutrition Tracker</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="ghost" onClick={() => setShowDB(true)} style={{ padding: "7px 10px" }}>🍎</Button>
            <Button variant="ghost" onClick={() => setShowRecipeEditor({ _new: true })} style={{ padding: "7px 10px" }}>📋</Button>
            <Button variant="ghost" onClick={() => setShowCalendar(true)} style={{ padding: "7px 10px" }}>📅</Button>
            <Button variant="ghost" onClick={() => setShowSettings(true)} style={{ padding: "7px 10px" }}>⚙</Button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "13px 12px 0" }}>
        {/* ─── Date nav ─── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => shiftDate(-1)} style={navBtn()}>‹</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {isToday ? "Today" : formatDateLong(activeDate).split(",")[0]}
              {!isToday && !editingPast && <span style={{ marginLeft: 6, fontSize: 9, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 4px" }}>SUMMARY</span>}
              {!isToday && editingPast && <span style={{ marginLeft: 6, fontSize: 9, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "0 4px" }}>EDITING</span>}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>{formatDateLong(activeDate)}</div>
          </div>
          <button onClick={() => !isToday && shiftDate(1)} disabled={isToday} style={{ ...navBtn(), opacity: isToday ? 0.3 : 1 }}>›</button>
        </div>

        {!isToday && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {!editingPast
              ? <button onClick={() => setEditingPast(true)} style={{ flex: 1, padding: "6px", borderRadius: 8, fontSize: 11, background: C.accent, border: "none", color: "#0b0d0e", fontWeight: 700, cursor: "pointer" }}>✎ Edit this day</button>
              : <button onClick={() => setEditingPast(false)} style={{ flex: 1, padding: "6px", borderRadius: 8, fontSize: 11, background: "transparent", border: `1px solid ${C.accent}`, color: C.accent, fontWeight: 700, cursor: "pointer" }}>✓ Done editing</button>
            }
          </div>
        )}

        {/* ─── Dashboard cards ─── */}
        <div style={{ marginBottom: 14 }}>
          {/* Cost card — always first */}
          <div style={{ marginBottom: 8 }}>
            <PressHoldCard
              onTapEdit={() => setAdjustCard({ key: "cost", label: "Cost", unit: "₹" })}
              adj={todayAdj.cost || 0}
              onRemoveAdj={() => removeCardAdj("cost")}
            >
              <BigCard label="Cost" value={`₹${totalCost.toFixed(0)}`} sub="" pct={0} color={C.orange} noBar />
            </PressHoldCard>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <PressHoldCard onTapEdit={() => setAdjustCard({ key: "protein", label: "Protein", unit: "g" })} adj={todayAdj.protein || 0} onRemoveAdj={() => removeCardAdj("protein")}>
              <BigCard label="Protein" value={`${Math.round(totals.protein)}g`} sub={`/ ${targets.protein}g`} pct={pctOf(totals.protein, targets.protein)} color={C.accent} />
            </PressHoldCard>
            <PressHoldCard onTapEdit={() => setAdjustCard({ key: "kcal", label: "Calories", unit: "kcal" })} adj={todayAdj.kcal || 0} onRemoveAdj={() => removeCardAdj("kcal")}>
              <BigCard label="Calories" value={Math.round(totals.kcal)} sub={`/ ${targets.kcal}`} pct={pctOf(totals.kcal, targets.kcal)} color={C.info} />
            </PressHoldCard>
          </div>

          {/* Small draggable nutrient cards */}
          <DndContext sensors={cardSensors} collisionDetection={closestCenter}
            onDragStart={e => setCardDragActive(e.active.id)}
            onDragEnd={handleCardDragEnd}
            onDragCancel={() => setCardDragActive(null)}>
            <SortableContext items={visibleCards} strategy={rectSortingStrategy}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {visibleCards.map(key => {
                  const n = allNutrients.find(x => x.key === key); if (!n) return null;
                  const v = +(totals[key] || 0).toFixed(1);
                  const tgt = targets[key] ?? n.target ?? 0;
                  const adj = todayAdj[key] || 0;
                  return (
                    <SortableSmallCard key={key} n={n} value={v} pct={pctOf(v, tgt)}
                      adj={adj}
                      onRemove={() => setVisibleCards(prev => prev.filter(k => k !== key))}
                      onTapEdit={() => setAdjustCard({ key, label: n.label, unit: n.unit || "" })}
                      onRemoveAdj={() => removeCardAdj(key)}
                      editMode={cardsEditMode}
                      onEnterEditMode={() => setCardsEditMode(true)}
                      onExitEditMode={() => setCardsEditMode(false)}
                    />
                  );
                })}
                <button onClick={() => setShowCardPicker(true)} style={{ flex: "1 1 28%", minWidth: 92, minHeight: 60, borderRadius: 10, border: `1px dashed ${C.borderHover || C.border}`, background: "transparent", color: C.accentDim, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>+ add card</button>
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* ─── Meals ─── */}
        {meals.map(meal => {
          const rows = getMealRows(meal.id);
          let mp = 0, mk = 0, mc = 0;
          rows.forEach(r => {
            if (!r.checked) return;
            if (r.type === "recipe") {
              const rec = recipeMap[r.recipeId]; if (!rec) return;
              const n = recipeNutrients(rec, foodMap, r.servings / (rec.servings || 1), ["protein","kcal"], r.ingredientQtys || {});
              mp += n.protein; mk += n.kcal;
              mc += recipeCost(rec, foodMap, r.servings / (rec.servings || 1), r.ingredientQtys || {});
            } else {
              const f = foodMap[r.foodId]; if (!f) return;
              const n = scaleNutrients(f, r.qty, ["protein","kcal"]); mp += n.protein; mk += n.kcal;
              mc += scaleCost(f, r.qty);
            }
          });

          return (
            <div key={meal.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{meal.emoji}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{meal.label}</div>
                    {meal.time ? <div style={{ fontSize: 11, color: C.muted }}>{meal.time}</div> : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 12, fontFamily: "monospace", alignItems: "center" }}>
                  <span style={{ color: C.accent }}>{mp.toFixed(0)}g P</span>
                  <span style={{ color: C.info }}>{Math.round(mk)} kcal</span>
                  {mc > 0 && <span style={{ color: C.orange, fontSize: 11 }}>₹{mc.toFixed(0)}</span>}
                </div>
              </div>

              <div style={{ padding: "6px" }}>
                {showEditable ? (
                  <>
                    {rows.length === 0 && (
                      <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", padding: "8px 8px" }}>No foods yet. Add one below.</div>
                    )}
                    <DndContext sensors={sensors} collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(meal.id, e)}>
                      <SortableContext items={rows.map(r => r.key)} strategy={verticalListSortingStrategy}>
                        {rows.map(row => {
                          if (row.type === "recipe") {
                            const recipe = recipeMap[row.recipeId]; if (!recipe) return null;
                            return (
                              <RecipeItem key={row.key} recipe={recipe} foodMap={foodMap}
                                entry={{ checked: row.checked, servings: row.servings, ingredientQtys: row.ingredientQtys }}
                                pinned={row.pinned}
                                dragId={row.key}
                                onUpdate={(patch) => setRowState(meal.id, row.key, patch)}
                                onTogglePin={() => togglePin(meal.id, row)}
                                onRemove={!row.pinned ? () => removeOneoff(meal.id, row.key) : undefined}
                              />
                            );
                          }
                          const food = foodMap[row.foodId]; if (!food) return null;
                          return (
                            <MealItem key={row.key} food={food} entry={{ checked: row.checked, qty: row.qty }}
                              pinned={row.pinned}
                              dragId={row.key}
                              onUpdate={(patch) => setRowState(meal.id, row.key, patch)}
                              onTogglePin={() => togglePin(meal.id, row)}
                              onRemove={!row.pinned ? () => removeOneoff(meal.id, row.key) : undefined}
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>

                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button onClick={() => setPicker({ mealId: meal.id })} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, border: `1px dashed ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12 }}>+ Add food</button>
                      <button onClick={() => setPicker({ mealId: meal.id, mode: "recipe" })} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, border: `1px dashed ${C.purple}`, background: "transparent", color: C.purple, cursor: "pointer", fontSize: 12 }}>+ Add recipe</button>
                    </div>
                  </>
                ) : (
                  (() => {
                    const eaten = rows.filter(r => r.checked);
                    if (eaten.length === 0) return <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", padding: "8px 8px" }}>Nothing logged for this meal.</div>;
                    return eaten.map(row => {
                      if (row.type === "recipe") {
                        const recipe = recipeMap[row.recipeId]; if (!recipe) return null;
                        return (
                          <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                            <span style={{ color: C.accent, fontSize: 13 }}>✓</span>
                            <div style={{ flex: 1, fontSize: 13, color: C.text }}>{recipe.name}
                              <span style={{ color: C.muted, fontSize: 11 }}> · {row.servings} serving{row.servings !== 1 ? "s" : ""}</span>
                              <span style={{ fontSize: 9, color: C.purple, border: `1px solid ${C.purple}`, borderRadius: 4, padding: "0 3px", marginLeft: 5 }}>RECIPE</span>
                            </div>
                          </div>
                        );
                      }
                      const food = foodMap[row.foodId]; if (!food) return null;
                      return <SummaryRow key={row.key} food={food} row={row} />;
                    });
                  })()
                )}
              </div>
            </div>
          );
        })}

        {showEditable && (
          <button onClick={() => setShowMealManager(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "10px", borderRadius: 11, border: `1px solid ${C.border}`, background: C.card, color: C.accentDim, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>⚙ Manage meals (add / remove / rename / time)</button>
        )}

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 10, color: C.muted }}>
          {isToday ? "Data stored locally · Auto-saves" : editingPast ? "Editing a past day · changes save automatically" : 'Read-only summary · tap "Edit this day" to change it'}
        </div>
      </div>

      {/* ─── Modals ─── */}
      {showMealManager && <MealManager meals={meals} onAdd={addMeal} onUpdate={updateMeal} onRemove={removeMeal} onClose={() => setShowMealManager(false)} />}
      {showCalendar && <Calendar onClose={() => setShowCalendar(false)} onSelectDate={(d) => { setActiveDate(d); setShowCalendar(false); }} />}
      {showSettings && <SettingsModal targets={targets} onSaveTargets={setTargets} allNutrients={allNutrients} onClose={() => setShowSettings(false)} onImport={refreshFoods} />}
      {showDB && <FoodPicker mode="manage" allNutrients={allNutrients} customNutrients={customNutrients} setCustomNutrients={setCustomNutrients} onClose={() => setShowDB(false)} onPick={(food) => setEditingFood(food)} />}
      {showRecipeEditor && <RecipeEditor recipe={showRecipeEditor} onClose={() => setShowRecipeEditor(null)} onSaved={refreshRecipes} />}
      {picker && picker.mode === "recipe" && (
        <RecipePicker recipes={recipes} onClose={() => setPicker(null)} onPick={(rec) => { addRecipeOneoff(picker.mealId, rec); setPicker(null); }} onNew={() => { setPicker(null); setShowRecipeEditor({ _new: true }); }} />
      )}
      {picker && !picker.mode && (
        <FoodPicker mode="pick" allNutrients={allNutrients} customNutrients={customNutrients} setCustomNutrients={setCustomNutrients} onClose={() => setPicker(null)} onPick={(food) => { addOneoff(picker.mealId, food); setPicker(null); }} />
      )}
      {editingFood && <FoodEditor food={editingFood} allNutrients={allNutrients} customNutrients={customNutrients} setCustomNutrients={setCustomNutrients} onClose={() => setEditingFood(null)} onSaved={refreshFoods} />}
      {showCardPicker && <CardPicker allNutrients={allNutrients} visibleCards={visibleCards} customNutrients={customNutrients} setCustomNutrients={setCustomNutrients} onAdd={(key) => { setVisibleCards(prev => [...prev, key]); setShowCardPicker(false); }} onClose={() => setShowCardPicker(false)} />}
      {adjustCard && (
        <CardAdjustModal
          cardKey={adjustCard.key} label={adjustCard.label} unit={adjustCard.unit}
          currentAdj={(cardAdjustments[activeDate] || {})[adjustCard.key] || 0}
          onAdjust={(delta) => setCardAdj(adjustCard.key, delta)}
          onRemove={() => removeCardAdj(adjustCard.key)}
          onClose={() => setAdjustCard(null)}
        />
      )}
    </div>
  );
}

// ─── Tap-to-edit wrapper (Cost / Protein / Calories cards) ────────────────────
function PressHoldCard({ children, onTapEdit, adj, onRemoveAdj }) {
  return (
    <div style={{ flex: 1, position: "relative", userSelect: "none", cursor: "pointer" }}
      onClick={onTapEdit}>
      {children}
      {adj !== 0 && (
        <div style={{ position: "absolute", bottom: 5, right: 6, fontSize: 9, color: adj > 0 ? C.veg : C.danger, background: C.bg, borderRadius: 4, padding: "1px 4px", border: `1px solid ${adj > 0 ? C.veg : C.danger}`, display: "flex", alignItems: "center", gap: 3 }}>
          {adj > 0 ? "+" : ""}{adj}
          <span onClick={(e) => { e.stopPropagation(); onRemoveAdj(); }} style={{ cursor: "pointer", opacity: 0.7, marginLeft: 2 }}>×</span>
        </div>
      )}
    </div>
  );
}

// ─── Sortable small card ──────────────────────────────────────────────────────
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableSmallCard({ n, value, pct, adj, onRemove, onTapEdit, onRemoveAdj, editMode, onEnterEditMode, onExitEditMode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: n.key, disabled: !editMode });
  const met = n.lessIsBetter ? (value <= (n.target || Infinity)) : (value >= (n.target || 0));
  const timerRef = useRef(null);
  const justLongPressedRef = useRef(false); // suppresses the click that follows a long-press release

  // Slow the repositioning animation down (dnd-kit defaults to ~200ms) so
  // neighboring cards drift into place calmly instead of snapping instantly.
  const slowedTransition = transition ? transition.replace(/[\d.]+ms/, "320ms") : transition;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: slowedTransition,
    opacity: isDragging ? 0.4 : 1,
    flex: "1 1 28%", minWidth: 92, position: "relative",
    touchAction: "none",
  };

  // Manual long-press detection, only active while NOT already in edit mode
  // (once in edit mode, dnd-kit's own sensors take over the same gesture for
  // dragging, so we don't want two systems racing for the same press).
  const startPress = () => {
    if (editMode) return;
    justLongPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      justLongPressedRef.current = true;
      onEnterEditMode();
    }, 500);
  };
  const cancelPress = () => clearTimeout(timerRef.current);

  const handleClick = () => {
    if (justLongPressedRef.current) {
      // This click is just the release-tail of the long-press that already
      // opened edit mode — ignore it so it doesn't immediately close again.
      justLongPressedRef.current = false;
      return;
    }
    if (editMode) onExitEditMode();
    else onTapEdit();
  };

  return (
    <div ref={setNodeRef} style={style}
      onPointerDown={startPress} onPointerUp={cancelPress} onPointerLeave={cancelPress}
      onTouchStart={startPress} onTouchEnd={cancelPress} onTouchCancel={cancelPress}>
      <div {...attributes} {...listeners} onClick={handleClick}
        style={{ background: C.card, border: `1px solid ${n.custom ? C.purple : met ? "rgba(74,222,128,0.3)" : C.border}`, borderRadius: 10, padding: "8px 10px", cursor: editMode ? "grab" : "pointer" }}>
        <div style={{ fontSize: 10, color: C.muted, display: "flex", justifyContent: "space-between" }}>
          <span>{n.label}{n.custom ? <span style={{ color: C.purple }}> ◆</span> : ""}</span>
          <span>{pct}%</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace", color: met ? C.veg : C.text }}>
          {value}<span style={{ fontSize: 9, color: C.muted }}> {n.unit}</span>
        </div>
      </div>
      {/* Remove button only appears once a long-press has put the row into
          manage mode — tapping any card exits the mode and hides it again. */}
      {editMode && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove card" style={{ position: "absolute", top: -7, right: -7, width: 18, height: 18, borderRadius: 99, background: C.danger, color: "#0b0d0e", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 800, lineHeight: 1 }}>×</button>
      )}
      {adj !== 0 && (
        <div style={{ position: "absolute", bottom: 4, right: 5, fontSize: 8, color: adj > 0 ? C.veg : C.danger, background: C.bg, borderRadius: 3, padding: "0 3px", border: `1px solid ${adj > 0 ? C.veg : C.danger}`, display: "flex", alignItems: "center", gap: 2 }}>
          {adj > 0 ? "+" : ""}{adj}
          <span onClick={(e) => { e.stopPropagation(); onRemoveAdj(); }} style={{ cursor: "pointer" }}>×</span>
        </div>
      )}
    </div>
  );
}

// ─── Card adjustment modal ────────────────────────────────────────────────────
function CardAdjustModal({ cardKey, label, unit, currentAdj, onAdjust, onRemove, onClose }) {
  const [delta, setDelta] = useState(0);
  const step = unit === "kcal" ? 10 : unit === "g" ? 1 : unit === "₹" ? 5 : 1;

  return (
    <Modal onClose={onClose} maxWidth={320}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Adjust {label}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>Add an extra amount on top of logged foods. This is reversible — shows as a chip on the card.</div>
      {currentAdj !== 0 && (
        <div style={{ background: C.surface, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: C.muted }}>Current adjustment:</span>
          <span style={{ color: currentAdj > 0 ? C.veg : C.danger, fontWeight: 700 }}>{currentAdj > 0 ? "+" : ""}{currentAdj} {unit}</span>
          <button onClick={() => { onRemove(); onClose(); }} style={{ fontSize: 11, color: C.danger, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, justifyContent: "center" }}>
        <button onClick={() => setDelta(d => +(d - step).toFixed(2))} style={adjBtn()}>−{step}</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: delta > 0 ? C.veg : delta < 0 ? C.danger : C.muted, fontFamily: "monospace" }}>{delta > 0 ? "+" : ""}{delta}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{unit}</div>
        </div>
        <button onClick={() => setDelta(d => +(d + step).toFixed(2))} style={adjBtn()}>+{step}</button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
        <Button variant="primary" onClick={() => { if (delta !== 0) onAdjust(delta); onClose(); }} style={{ flex: 1 }} disabled={delta === 0}>Apply +{delta > 0 ? delta : delta} {unit}</Button>
      </div>
    </Modal>
  );
}

// ─── Recipe picker modal ──────────────────────────────────────────────────────
function RecipePicker({ recipes, onClose, onPick, onNew }) {
  const [search, setSearch] = useState("");
  const filtered = search.trim() ? recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : recipes;
  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 140, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Pick a recipe</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" onClick={onNew} style={{ padding: "6px 11px" }}>+ New recipe</Button>
          <Button variant="ghost" onClick={onClose} style={{ padding: "6px 12px" }}>Close</Button>
        </div>
      </div>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipes…"
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "30px 14px", textAlign: "center", color: C.muted, fontSize: 13 }}>
            No recipes yet.<br />
            <Button variant="primary" onClick={onNew} style={{ marginTop: 14 }}>+ Create a recipe</Button>
          </div>
        )}
        {filtered.map(r => (
          <div key={r.id} onClick={() => onPick(r)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, marginBottom: 5, cursor: "pointer", background: C.card, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 9, color: C.purple, border: `1px solid ${C.purple}`, borderRadius: 4, padding: "0 4px" }}>RECIPE</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.name}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{r.servings} serving{r.servings !== 1 ? "s" : ""} · {r.ingredients?.length || 0} ingredients</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BigCard ──────────────────────────────────────────────────────────────────
function BigCard({ label, value, sub, pct, color, noBar }) {
  return (
    <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: -0.5 }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: C.muted }}>{sub}</span>}
      </div>
      {!noBar && (
        <div style={{ marginTop: 8, height: 6, borderRadius: 99, background: C.border, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: pct > 100 ? C.danger : color }} />
        </div>
      )}
    </div>
  );
}

// ─── MealManager ─────────────────────────────────────────────────────────────
function MealManager({ meals, onAdd, onUpdate, onRemove, onClose }) {
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("🍽️");
  const [time, setTime] = useState("");
  const add = () => { if (!label.trim()) return; onAdd(label.trim(), emoji, time); setLabel(""); setTime(""); setEmoji("🍽️"); };
  return (
    <Modal onClose={onClose} maxWidth={460}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Manage meals</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>Add, rename, set a time, or remove meals. Changes apply to every day.</div>
      {meals.map(m => (
        <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={m.emoji} onChange={e => onUpdate(m.id, { emoji: e.target.value })} style={{ ...inp(), width: 54, fontSize: 16 }}>
              {MEAL_EMOJI_CHOICES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={m.label} onChange={e => onUpdate(m.id, { label: e.target.value })} style={{ ...inp(), flex: 1 }} />
            <button onClick={() => { if (window.confirm(`Remove "${m.label}"?`)) onRemove(m.id); }}
              style={{ padding: "6px 9px", borderRadius: 7, border: `1px solid ${C.danger}`, background: "transparent", color: C.danger, cursor: "pointer", fontSize: 11 }}>Remove</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Time (optional):</span>
            <input value={m.time || ""} onChange={e => onUpdate(m.id, { time: e.target.value })} placeholder="e.g. 7:00 AM" style={{ ...inp(), flex: 1 }} />
          </div>
        </div>
      ))}
      <div style={{ marginTop: 14, padding: 11, borderRadius: 10, background: C.surface, border: `1px dashed ${C.accentDim}` }}>
        <div style={{ fontSize: 11, color: C.accentDim, fontWeight: 700, marginBottom: 8 }}>+ Add a meal</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select value={emoji} onChange={e => setEmoji(e.target.value)} style={{ ...inp(), width: 54, fontSize: 16 }}>
            {MEAL_EMOJI_CHOICES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Meal name" style={{ ...inp(), flex: "1 1 50%" }} />
          <input value={time} onChange={e => setTime(e.target.value)} placeholder="Time (optional)" style={{ ...inp(), flex: "1 1 30%" }} />
          <button onClick={add} style={{ flex: "1 1 100%", marginTop: 6, padding: "9px", borderRadius: 8, background: C.accent, color: "#0b0d0e", border: "none", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Add meal</button>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 14 }}>
        <Button variant="primary" onClick={onClose} style={{ flex: 1 }}>Done</Button>
      </div>
    </Modal>
  );
}

// ─── CardPicker ───────────────────────────────────────────────────────────────
function CardPicker({ allNutrients, visibleCards, customNutrients, setCustomNutrients, onAdd, onClose }) {
  const available = allNutrients.filter(n => !["protein","kcal"].includes(n.key) && !visibleCards.includes(n.key));
  const [label, setLabel] = useState(""); const [unit, setUnit] = useState("mg"); const [target, setTarget] = useState("");
  const addNew = () => {
    const key = label.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || allNutrients.some(n => n.key === key)) return;
    setCustomNutrients(prev => [...prev, { key, label: label.trim(), unit, target: parseFloat(target) || 0, type: "micro", custom: true }]);
    onAdd(key);
  };
  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Add a nutrient card</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Tap a nutrient to show it on the dashboard, or create a new one.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
        {available.map(n => (
          <button key={n.key} onClick={() => onAdd(n.key)} style={{ padding: "8px 12px", borderRadius: 9, background: C.card, border: `1px solid ${n.custom ? C.purple : C.border}`, color: n.custom ? C.purple : C.text, cursor: "pointer", fontSize: 12 }}>+ {n.label}{n.custom ? " ◆" : ""}</button>
        ))}
        {available.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>All nutrients are already shown.</div>}
      </div>
      <div style={{ paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.purple, fontWeight: 700, marginBottom: 8 }}>◆ Create a new nutrient</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Name (Magnesium)" style={{ ...inp(), flex: "1 1 45%" }} />
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="unit" style={{ ...inp(), flex: "1 1 20%" }} />
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="target" style={{ ...inp(), flex: "1 1 25%" }} />
          <button onClick={addNew} style={{ flex: "1 1 100%", marginTop: 6, padding: "9px", borderRadius: 8, background: C.purple, color: "#0b0d0e", border: "none", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Add &amp; show card</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── SettingsModal ────────────────────────────────────────────────────────────
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
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Settings &amp; Targets</div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Daily Targets</div>
      {allNutrients.map(n => (
        <div key={n.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
          <label style={{ fontSize: 11, color: n.custom ? C.purple : C.muted, flex: 1 }}>{n.label}{n.custom ? " ◆" : ""} ({n.unit || "kcal"})</label>
          <div style={{ width: 100 }}><NumberInput value={form[n.key] ?? n.target ?? 0} onChange={v => setForm(p => ({ ...p, [n.key]: v }))} /></div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
        <Button variant="primary" onClick={() => { onSaveTargets(form); onClose(); }} style={{ flex: 1 }}>Save</Button>
      </div>
      <div style={{ height: 1, background: C.border, margin: "18px 0 12px" }} />
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Data</div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="default" onClick={handleExport} style={{ flex: 1 }}>⬇ Export backup</Button>
        <Button variant="default" onClick={handleImport} style={{ flex: 1 }}>⬆ Import backup</Button>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>Backups are JSON files. Importing merges with current data.</div>
    </Modal>
  );
}

// ─── migrateLegacyDay ─────────────────────────────────────────────────────────
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
function navBtn() { return { width: 34, height: 34, borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.text, cursor: "pointer", fontSize: 18 }; }
function inp() { return { padding: "7px 9px", borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none" }; }
function adjBtn() { return { width: 56, height: 40, borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer", fontSize: 13, fontWeight: 700 }; }
