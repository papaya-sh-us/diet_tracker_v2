import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// REORDERABLE LIST
//
// A drag-to-reorder list that works with touch (phone) and mouse (desktop),
// using pointer events directly — no external library needed.
//
// Dragging only starts from a handle you render yourself (via the
// `dragHandleProps` passed into renderItem), so tapping the rest of the row
// still works normally — checkboxes, buttons, etc. are unaffected.
//
// `items`      — the array to display, in current order
// `keyOf`      — function returning a stable unique key for each item
// `renderItem` — (item, dragHandleProps) => JSX for one row
// `onReorder`  — called with the reordered array once a drag ends
// ─────────────────────────────────────────────────────────────────────────────
export function ReorderableList({ items, keyOf, renderItem, onReorder }) {
  const [order, setOrder] = useState(() => items.map(keyOf));
  const [draggingKey, setDraggingKey] = useState(null);
  const itemMap = useRef({});
  const orderRef = useRef(order);
  orderRef.current = order;
  items.forEach(it => { itemMap.current[keyOf(it)] = it; });

  // Keep local order in sync if items are added/removed elsewhere (e.g. a new
  // food was added to this meal, or one was deleted) without losing the
  // current arrangement of everything else.
  useEffect(() => {
    const incoming = items.map(keyOf);
    setOrder(prev => {
      const kept = prev.filter(k => incoming.includes(k));
      const added = incoming.filter(k => !kept.includes(k));
      const next = [...kept, ...added];
      const same = next.length === prev.length && next.every((k, i) => k === prev[i]);
      return same ? prev : next;
    });
  }, [items, keyOf]);

  const startDrag = useCallback((key) => (e) => {
    e.preventDefault();
    setDraggingKey(key);
  }, []);

  useEffect(() => {
    if (!draggingKey) return;

    function pointFromEvent(e) {
      if (e.touches && e.touches[0]) return e.touches[0];
      if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0];
      return e;
    }

    function onMove(e) {
      e.preventDefault();
      const p = pointFromEvent(e);
      const el = document.elementFromPoint(p.clientX, p.clientY);
      const row = el?.closest("[data-reorder-key]");
      if (!row) return;
      const overKey = row.getAttribute("data-reorder-key");
      if (overKey === draggingKey) return;
      setOrder(prev => {
        const from = prev.indexOf(draggingKey);
        const to = prev.indexOf(overKey);
        if (from === -1 || to === -1 || from === to) return prev;
        const next = prev.slice();
        next.splice(from, 1);
        next.splice(to, 0, draggingKey);
        return next;
      });
    }

    function onUp() {
      setDraggingKey(null);
      onReorder(orderRef.current.map(k => itemMap.current[k]).filter(Boolean));
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [draggingKey, onReorder]);

  const ordered = order.map(k => itemMap.current[k]).filter(Boolean);

  return (
    <>
      {ordered.map(item => {
        const key = keyOf(item);
        const isDragging = draggingKey === key;
        return (
          <div key={key} data-reorder-key={key} style={{
            opacity: isDragging ? 0.45 : 1,
            transition: isDragging ? "none" : "opacity 0.15s",
          }}>
            {renderItem(item, {
              onPointerDown: startDrag(key),
              onTouchStart: startDrag(key),
              style: { touchAction: "none", cursor: "grab" },
            })}
          </div>
        );
      })}
    </>
  );
}
