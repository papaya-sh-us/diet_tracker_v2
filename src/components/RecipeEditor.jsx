import { useState, useEffect } from "react";
import { C, scaleNutrients, scaleCost } from "../utils/helpers.js";
import { getAllFoods, saveRecipe, deleteRecipe } from "../db/database.js";
import { Button, Modal, NumberInput, TextInput } from "./UI.jsx";

// RecipeEditor — create or edit a recipe.
// A recipe has a name, a default serving count, and a list of ingredient {foodId, qty}.
// Logging 1 serving logs each ingredient at qty/servings.
export function RecipeEditor({ recipe, onClose, onSaved }) {
  const isNew = !recipe || recipe._new;
  const [name, setName] = useState(isNew ? "" : recipe.name);
  const [servings, setServings] = useState(isNew ? 1 : (recipe.servings || 1));
  const [ingredients, setIngredients] = useState(isNew ? [] : (recipe.ingredients || []));
  const [foods, setFoods] = useState([]);
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => { getAllFoods().then(setFoods); }, []);

  const filtered = search.trim()
    ? foods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const addIngredient = (food) => {
    setIngredients(prev => {
      if (prev.some(i => i.foodId === food.id)) return prev; // dedupe
      return [...prev, { foodId: food.id, qty: food.qty }];
    });
    setSearch(""); setShowPicker(false);
  };

  const removeIngredient = (foodId) => setIngredients(prev => prev.filter(i => i.foodId !== foodId));
  const updateQty = (foodId, qty) => setIngredients(prev => prev.map(i => i.foodId === foodId ? { ...i, qty } : i));

  // Totals for 1 serving
  const totals = ingredients.reduce((acc, ing) => {
    const food = foods.find(f => f.id === ing.foodId);
    if (!food) return acc;
    const n = scaleNutrients(food, ing.qty / servings);
    return { protein: acc.protein + n.protein, kcal: acc.kcal + n.kcal, cost: acc.cost + scaleCost(food, ing.qty / servings) };
  }, { protein: 0, kcal: 0, cost: 0 });

  async function handleSave() {
    if (!name.trim() || ingredients.length === 0) return;
    const rec = {
      id: isNew ? `recipe_${Date.now()}` : recipe.id,
      name: name.trim(),
      servings,
      ingredients,
    };
    await saveRecipe(rec);
    onSaved?.(); onClose();
  }

  async function handleDelete() {
    if (!window.confirm(`Delete recipe "${name}"?`)) return;
    await deleteRecipe(recipe.id);
    onSaved?.(); onClose();
  }

  return (
    <Modal onClose={onClose} maxWidth={480}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{isNew ? "New recipe" : "Edit recipe"}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Define ingredients + servings. When logged, the whole recipe counts as one item you can expand.</div>

      <label style={{ fontSize: 11, color: C.muted }}>Recipe name</label>
      <TextInput value={name} onChange={setName} style={{ marginBottom: 10 }} />

      <label style={{ fontSize: 11, color: C.muted }}>Servings this makes</label>
      <div style={{ marginBottom: 14 }}>
        <NumberInput value={servings} onChange={setServings} />
        <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Logging "1 serving" will count each ingredient divided by {servings}.</div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: C.accentDim, marginBottom: 6 }}>INGREDIENTS (total batch)</div>

      {ingredients.length === 0 && (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginBottom: 8 }}>No ingredients yet.</div>
      )}
      {ingredients.map(ing => {
        const food = foods.find(f => f.id === ing.foodId);
        if (!food) return null;
        return (
          <div key={ing.foodId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, background: C.surface, borderRadius: 8, padding: "7px 10px" }}>
            <div style={{ flex: 1, fontSize: 12, color: C.text }}>{food.name}</div>
            <NumberInput value={ing.qty} onChange={v => updateQty(ing.foodId, v)} style={{ width: 72 }} />
            <span style={{ fontSize: 11, color: C.muted }}>{food.unit}</span>
            <button onClick={() => removeIngredient(ing.foodId)} style={{ background: "none", border: "none", color: C.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        );
      })}

      {/* ingredient search */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setShowPicker(true); }}
          onFocus={() => setShowPicker(true)}
          placeholder="+ Search food to add…"
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
        {showPicker && filtered.length > 0 && (
          <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 70, background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 9, maxHeight: 200, overflowY: "auto", boxShadow: "0 6px 20px #0008" }}>
            {filtered.slice(0, 20).map(f => (
              <button key={f.id} onClick={() => addIngredient(f)} style={{ display: "block", width: "100%", padding: "9px 12px", border: "none", background: "transparent", color: C.text, cursor: "pointer", fontSize: 12, textAlign: "left" }}>
                {f.name} <span style={{ color: C.muted, fontSize: 10 }}>· {f.protein}g P · {f.kcal} kcal per {f.qty}{f.unit}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {ingredients.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: C.muted }}>
          Per serving: <span style={{ color: C.accent }}>{(totals.protein).toFixed(1)}g P</span> · <span style={{ color: C.info }}>{Math.round(totals.kcal)} kcal</span>
          {totals.cost > 0 && <> · <span style={{ color: C.orange }}>₹{totals.cost.toFixed(1)}</span></>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
        {!isNew && <Button variant="danger" onClick={handleDelete}>Delete</Button>}
        <Button variant="primary" onClick={handleSave} style={{ flex: 1 }} disabled={!name.trim() || ingredients.length === 0}>Save</Button>
      </div>
    </Modal>
  );
}

// RecipeItem — a logged recipe row. Expandable to show per-ingredient tweaks.
export function RecipeItem({ recipe, foodMap, entry, onUpdate, onRemove, onTogglePin, pinned, dragId }) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // useSortable pulled in here too so recipe rows participate in reorder
  // We import it dynamically to avoid hoisting issues — just use the hook directly.
  const { useState: _s, ..._ } = { useState };
  // Actually just import at top level in the real file — this is fine since RecipeItem is in the same file.

  const servings = entry.servings ?? 1;
  const ingredientQtys = entry.ingredientQtys || {};

  // Compute totals for this row
  let totalP = 0, totalK = 0, totalCost = 0;
  (recipe.ingredients || []).forEach(ing => {
    const food = foodMap[ing.foodId];
    if (!food) return;
    const baseQty = (ingredientQtyOverride(ing, ingredientQtys)) / (recipe.servings || 1) * servings;
    const n = scaleNutrients(food, baseQty);
    totalP += n.protein; totalK += n.kcal;
    totalCost += scaleCost(food, baseQty);
  });

  const checked = !!entry.checked;

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 10px",
        borderRadius: 10, transition: "background 0.12s",
        background: checked ? "rgba(200,245,90,0.07)" : "transparent",
        border: checked ? "1px solid rgba(200,245,90,0.20)" : "1px solid transparent",
      }}>
        {/* ⠿ handle placeholder — dragging managed in parent */}
        <div style={{ color: C.muted, fontSize: 14, lineHeight: "20px", padding: "2px 2px 0 0", userSelect: "none" }}>⠿</div>

        <div onClick={() => onUpdate({ checked: !checked })} style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
          border: `2px solid ${checked ? C.accent : C.border}`,
          background: checked ? C.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#0b0d0e", fontSize: 11, fontWeight: 800, cursor: "pointer",
        }}>{checked ? "✓" : ""}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span onClick={() => onUpdate({ checked: !checked })} style={{ fontSize: 13, fontWeight: 600, color: checked ? C.text : C.textMuted, cursor: "pointer" }}>{recipe.name}</span>
            <span style={{ fontSize: 9, color: C.purple, border: `1px solid ${C.purple}`, borderRadius: 4, padding: "0 4px" }}>RECIPE</span>
            {pinned && <span style={{ fontSize: 9, color: C.accent, border: `1px solid ${C.accentDark}`, borderRadius: 4, padding: "0 4px" }}>PIN</span>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
            <button onClick={() => setExpanded(o => !o)} style={{ fontSize: 11, color: expanded ? C.accent : C.muted, background: "transparent", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline dotted" }}>
              {servings} serving{servings !== 1 ? "s" : ""} {expanded ? "▲" : "▼"}
            </button>
            <span style={{ fontSize: 10, color: C.muted }}>·</span>
            <span style={{ fontSize: 11, color: C.accent, fontFamily: "monospace" }}>{totalP.toFixed(1)}g P</span>
            <span style={{ fontSize: 11, color: C.info, fontFamily: "monospace" }}>{Math.round(totalK)} kcal</span>
            {totalCost > 0 && <span style={{ fontSize: 10, color: C.orange, fontFamily: "monospace" }}>₹{totalCost.toFixed(1)}</span>}
          </div>

          {/* serving adjuster */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
            <button onClick={() => onUpdate({ servings: Math.max(0.5, +(servings - 0.5).toFixed(1)) })} style={qBtn()}>−</button>
            <input type="number" value={servings} min="0.5" step="0.5"
              onChange={e => onUpdate({ servings: parseFloat(e.target.value) || 1 })}
              style={{ width: 52, textAlign: "center", padding: "3px 4px", borderRadius: 5, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none" }} />
            <span style={{ fontSize: 11, color: C.muted }}>srv</span>
            <button onClick={() => onUpdate({ servings: +(servings + 0.5).toFixed(1) })} style={qBtn()}>+</button>
          </div>

          {/* expanded ingredient tweaks */}
          {expanded && (
            <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 5 }}>Tweak today's ingredient quantities:</div>
              {(recipe.ingredients || []).map(ing => {
                const food = foodMap[ing.foodId];
                if (!food) return null;
                const curQty = ingredientQtys[ing.foodId] ?? ing.qty;
                const changed = curQty !== ing.qty;
                return (
                  <div key={ing.foodId} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ flex: 1, fontSize: 11, color: C.text }}>{food.name}</span>
                    <button onClick={() => onUpdate({ ingredientQtys: { ...ingredientQtys, [ing.foodId]: Math.max(0, +(curQty - (curQty >= 10 ? 5 : 0.5)).toFixed(2)) } })} style={qBtn()}>−</button>
                    <input type="number" value={curQty} min="0" step="0.5"
                      onChange={e => onUpdate({ ingredientQtys: { ...ingredientQtys, [ing.foodId]: parseFloat(e.target.value) || 0 } })}
                      style={{ width: 52, textAlign: "center", padding: "3px 4px", borderRadius: 5, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 11, outline: "none" }} />
                    <span style={{ fontSize: 10, color: C.muted }}>{food.unit}</span>
                    <button onClick={() => onUpdate({ ingredientQtys: { ...ingredientQtys, [ing.foodId]: +(curQty + (curQty >= 10 ? 5 : 0.5)).toFixed(2) } })} style={qBtn()}>+</button>
                    {changed && (
                      <button onClick={() => { const next = { ...ingredientQtys }; delete next[ing.foodId]; onUpdate({ ingredientQtys: next }); }} style={{ fontSize: 10, color: C.accentDim, background: "transparent", border: "none", cursor: "pointer" }}>reset</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ⋯ kebab */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ padding: "3px 7px", borderRadius: 6, border: "none", background: menuOpen ? C.surface : "transparent", color: C.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>⋯</button>
          {menuOpen && (
            <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 60, background: C.cardElevated, border: `1px solid ${C.border}`, borderRadius: 9, padding: "4px 0", minWidth: 148, boxShadow: "0 4px 16px #0006" }}>
              {onTogglePin && (
                <button onClick={() => { onTogglePin(); setMenuOpen(false); }} style={mItem()}>
                  {pinned ? "📌 Unpin" : "📌 Pin (repeat daily)"}
                </button>
              )}
              {onRemove && (
                <button onClick={() => { onRemove(); setMenuOpen(false); }} style={{ ...mItem(), color: C.danger }}>✕ Remove</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ingredientQtyOverride(ing, overrides) {
  return overrides[ing.foodId] ?? ing.qty;
}

function qBtn() {
  return { width: 22, height: 22, borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" };
}
function mItem() {
  return { display: "block", width: "100%", padding: "9px 14px", border: "none", background: "transparent", color: C.text, cursor: "pointer", fontSize: 12, textAlign: "left", fontWeight: 500 };
}
