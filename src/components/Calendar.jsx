import { useState, useEffect } from "react";
import { C, parseDate, dateKey, todayKey, isRecentlyDetailed, formatDateLong } from "../utils/helpers.js";
import { getAllDayTotals } from "../db/database.js";
import { Button } from "./UI.jsx";

const START_DATE = "2026-05-01";  // calendar starts here
const DAY_NAMES = ["S","M","T","W","T","F","S"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

export default function Calendar({ onSelectDate, onClose }) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [totalsMap, setTotalsMap] = useState({});

  useEffect(() => {
    getAllDayTotals().then(all => {
      const map = {};
      all.forEach(t => { map[t.date] = t; });
      setTotalsMap(map);
    });
  }, []);

  const startDate = parseDate(START_DATE);

  const goPrev = () => {
    const m = new Date(viewMonth);
    m.setMonth(m.getMonth() - 1);
    if (m >= new Date(startDate.getFullYear(), startDate.getMonth(), 1)) setViewMonth(m);
  };
  const goNext = () => {
    const m = new Date(viewMonth);
    m.setMonth(m.getMonth() + 1);
    const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (m <= todayMonth) setViewMonth(m);
  };

  // Build grid cells
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = todayKey();
  const startStr = START_DATE;

  return (
    <div style={{
      position:"fixed", inset:0, background:C.bg, zIndex:120,
      display:"flex", flexDirection:"column",
    }}>
      {/* header */}
      <div style={{
        padding:"14px 16px", borderBottom:`1px solid ${C.border}`,
        background:C.surface, display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div style={{fontSize:15, fontWeight:700, color:C.text}}>Calendar</div>
        <Button variant="ghost" onClick={onClose} style={{padding:"6px 12px"}}>Close</Button>
      </div>

      <div style={{flex:1, overflowY:"auto", padding:"16px"}}>
        <div style={{maxWidth:500, margin:"0 auto"}}>

          {/* month nav */}
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            marginBottom:14, padding:"8px 4px",
          }}>
            <button onClick={goPrev} style={{
              background:"transparent", border:`1px solid ${C.border}`, color:C.text,
              padding:"6px 12px", borderRadius:8, cursor:"pointer", fontSize:14,
            }}>‹</button>
            <div style={{fontSize:16, fontWeight:700, color:C.text}}>
              {MONTH_NAMES[month]} {year}
            </div>
            <button onClick={goNext} style={{
              background:"transparent", border:`1px solid ${C.border}`, color:C.text,
              padding:"6px 12px", borderRadius:8, cursor:"pointer", fontSize:14,
            }}>›</button>
          </div>

          {/* day labels */}
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4, marginBottom:6,
          }}>
            {DAY_NAMES.map((d,i) => (
              <div key={i} style={{
                textAlign:"center", fontSize:11, color:C.muted, fontWeight:600, padding:4,
              }}>{d}</div>
            ))}
          </div>

          {/* grid */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:5}}>
            {cells.map((d, i) => {
              if (d === null) return <div key={i}/>;
              const cellDate = new Date(year, month, d);
              const cellKey = dateKey(cellDate);
              const tooEarly = cellKey < startStr;
              const inFuture = cellKey > todayStr;
              const isToday = cellKey === todayStr;
              const recent = isRecentlyDetailed(cellKey);
              const hasData = totalsMap[cellKey];

              return (
                <button key={i}
                  onClick={() => !tooEarly && !inFuture && onSelectDate(cellKey)}
                  disabled={tooEarly || inFuture}
                  style={{
                    aspectRatio:"1/1", borderRadius:9, cursor: (tooEarly||inFuture)?"not-allowed":"pointer",
                    background: isToday ? C.accent : hasData ? C.card : C.surface,
                    border: `1px solid ${isToday ? C.accent : hasData ? C.accentDim : C.border}`,
                    color: isToday ? "#0b0d0e" : tooEarly || inFuture ? C.muted : C.text,
                    fontSize:13, fontWeight: isToday ? 800 : 600,
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                    padding:0, opacity: tooEarly || inFuture ? 0.3 : 1,
                    position:"relative",
                  }}>
                  <span>{d}</span>
                  {hasData && (
                    <span style={{
                      fontSize:8, color: isToday ? "#0b0d0e" : C.accentDim,
                      marginTop:1,
                    }}>{Math.round(hasData.kcal)}</span>
                  )}
                  {recent && hasData && (
                    <span style={{
                      position:"absolute", top:3, right:4, fontSize:7,
                      color: isToday ? "#0b0d0e" : C.muted,
                    }}>●</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* legend */}
          <div style={{marginTop:18, padding:12, background:C.card, borderRadius:10,
            border:`1px solid ${C.border}`, fontSize:11, color:C.muted}}>
            <div style={{marginBottom:6, fontWeight:600, color:C.text}}>Legend</div>
            <div>📅 Tap any date with data to view that day's intake</div>
            <div>● = Full meal detail available (last 2 days + today)</div>
            <div>Older dates show daily totals only</div>
          </div>

        </div>
      </div>
    </div>
  );
}
