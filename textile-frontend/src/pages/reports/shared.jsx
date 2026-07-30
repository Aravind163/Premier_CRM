// src/pages/reports/shared.jsx
//
// Common pieces used by every report sub-page (Enquiry Order, Overdue,
// Data, Product Wise, Ageing, Sales Loss). Previously these all lived
// inline in one Reports.jsx behind in-page pill tabs — now each report
// is its own routed page (see Layout.jsx sidebar), so the shared bits
// live here instead of being copy-pasted six times.

export const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const cardStyle = (themeG) => ({ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 22, boxShadow: "0 4px 16px rgba(46,122,114,0.05)" });
export const cardTitleStyle = (themeG) => ({ fontFamily: FONT, fontSize: 15, fontWeight: 600, margin: "0 0 14px", color: themeG.textMain });
export const statCardStyle = (themeG) => ({ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 4px 16px rgba(46,122,114,0.05)" });
export const errorBoxStyle = { marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A", fontFamily: FONT };

export function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

// Like groupBy but sums a numeric value instead of counting.
export function sumByKey(arr, keyFn, valFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    acc[k] = (acc[k] || 0) + (valFn(item) || 0);
    return acc;
  }, {});
}

/** A bordered box with a title and a plain list of "label — value" rows.
 *  No charts/graphs anywhere on Reports by design. */
export function ListBox({ title, items, themeG, emptyText = "No data yet." }) {
  return (
    <div style={cardStyle(themeG)}>
      {title && <h3 style={cardTitleStyle(themeG)}>{title}</h3>}
      {items.length === 0 ? (
        <p style={{ color: themeG.textSub, fontSize: 13, fontFamily: FONT, margin: 0 }}>{emptyText}</p>
      ) : (
        <div>
          {items.map((it, i) => (
            <div
              key={it.label + i}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 2px", borderBottom: i < items.length - 1 ? `1px solid ${themeG.border}` : "none",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: themeG.textMain, fontFamily: FONT, textTransform: "capitalize" }}>
                {it.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color, flexShrink: 0 }} />}
                {it.label}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: it.color || themeG.textMain, fontFamily: FONT, whiteSpace: "nowrap" }}>{it.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExcelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="3" x2="8" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

export function ExportButton({ onClick, disabled, themeG, label = "Export to Excel" }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, border: "none",
        background: disabled ? themeG.border : "#1E7B4D", color: "#fff", fontSize: 13, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT, opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap",
      }}
    >
      <ExcelIcon /> {label}
    </button>
  );
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
export const todayStamp = () => new Date().toISOString().slice(0, 10);
export const fmtAmt = (a) => `₹${(parseFloat(a) || 0).toLocaleString()}`;

export function PageHeading({ themeG, title, subtitle }) {
  return (
    <>
      <h1 style={{ fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 13, color: themeG.textSub, margin: "0 0 20px" }}>{subtitle}</p>}
    </>
  );
}