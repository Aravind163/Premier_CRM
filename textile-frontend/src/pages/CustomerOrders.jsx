// src/pages/CustomerOrders.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/CustomerLayout";
import { useTheme } from "../ThemeContext";
import { getG, statusColor } from "../theme";
import API from "../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TABLE_HEADERS = ["Sort No", "Shade No", "Product Description", "UOM", "Qty", "Color", "Type", "Status"];

// ── Same dummy-fallback helpers as ProductCatalog.jsx, so an order's
// product row looks identical whether it's shown on the catalog page or
// here. Real field wins when the backend supplies it; otherwise falls
// back to a representative placeholder derived from the row index, same
// as the catalog. Kept self-contained (no cross-file import) since that
// import was what broke the build earlier.
function dummyUom(subType) {
  const u = (subType || "").toLowerCase();
  if (u.includes("shirting") || u.includes("suiting") || u.includes("blouse")) return "m";
  return "pcs";
}
const DUMMY_SWATCHES = ["#8FD9A8", "#7FD1E0", "#E893C9", "#9A9AA5", "#F0A15C", "#B7A6E0"];
const DUMMY_TYPES = ["BLD & DYED", "Bld/Dyed", "R.Blue/G.Blue", "Fiber Dyed", "YD Dyed", "YD Slub", "3.7 & 7.4", "8*137 (Box)", "Spl Maroon"];
const DUMMY_SHADE_NOS = ["101", "102", "103", "104", "105", "106"];

function dummyType(product, i) {
  return product.Type || DUMMY_TYPES[i % DUMMY_TYPES.length];
}
function dummyShadeNo(product, i) {
  const num = product.ShadeNo || DUMMY_SHADE_NOS[i % DUMMY_SHADE_NOS.length];
  return `SHADE ${num}`;
}
function dummyDescription(product, i) {
  return `SHADING FABRIC ${dummyShadeNo(product, i)}`;
}

const Badge = ({ text, colorFn }) => {
  const s = colorFn(text || "—");
  return (
    <span style={{ ...s, padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${s.border}`, fontFamily: FONT }}>
      {(text || "—").charAt(0).toUpperCase() + (text || "—").slice(1)}
    </span>
  );
};

export default function CustomerOrders() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const styles = {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 28, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 22px" },
    tableBox: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    tableScroll: { overflowX: "auto" },
    table: { width: "100%", minWidth: 900, borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 13px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(91,155,217,0.04)", fontFamily: FONT, whiteSpace: "nowrap" },
    td: { padding: "12px 13px", fontSize: 13.5, color: themeG.textMain, borderBottom: "1px solid rgba(46,122,114,0.06)", fontFamily: FONT, whiteSpace: "nowrap" },
    tdWrap: { padding: "12px 13px", fontSize: 13, color: themeG.textSub, borderBottom: "1px solid rgba(46,122,114,0.06)", fontFamily: FONT, whiteSpace: "normal", maxWidth: 220 },
    swatch: (c) => ({ width: 18, height: 18, borderRadius: "50%", background: c, border: "1.5px solid rgba(0,0,0,0.14)", display: "inline-block", verticalAlign: "middle" }),
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/orders");
        setOrders(res.data);
      } catch {
        setError("Failed to load your orders. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <CustomerLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 style={styles.heading}>My Orders</h1>
      <p style={styles.headingSub}>All the orders you've placed.</p>

      {error && (
        <div style={{ marginBottom: 20, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}

      <div style={styles.tableBox}>
        <div style={styles.tableScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                {TABLE_HEADERS.map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={TABLE_HEADERS.length} style={{ ...styles.td, textAlign: "center", padding: 30 }}>Loading your orders…</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={TABLE_HEADERS.length} style={{ ...styles.td, textAlign: "center", padding: 30 }}>No orders yet.</td></tr>
              ) : orders.map((o, i) => {
                const p = o.product || {};
                const swatch = p.Color || DUMMY_SWATCHES[i % DUMMY_SWATCHES.length];
                return (
                  <tr key={o.Id}>
                    <td style={{ ...styles.td, color: themeG.accent, fontWeight: 700 }}>{p.Code || o.Code || "—"}</td>
                    <td style={styles.td}>{dummyShadeNo(p, i)}</td>
                    <td style={styles.tdWrap}>{dummyDescription(p, i)}</td>
                    <td style={styles.td}>{dummyUom(p.SubType)}</td>
                    <td style={styles.td}>{o.Quantity}</td>
                    <td style={styles.td}><div style={styles.swatch(swatch)} /></td>
                    <td style={styles.td}>{dummyType(p, i)}</td>
                    <td style={styles.td}><Badge text={o.Status} colorFn={statusColor} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 13px", borderTop: `1px solid ${themeG.border}`, fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>
          Showing {orders.length} order{orders.length !== 1 ? "s" : ""}
        </div>
      </div>
    </CustomerLayout>
  );
}