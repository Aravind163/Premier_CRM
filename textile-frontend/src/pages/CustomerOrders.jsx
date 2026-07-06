// src/pages/CustomerOrders.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/CustomerLayout";
import { useTheme } from "../ThemeContext";
import { getG, statusColor } from "../theme";
import API from "../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Tracking (dispatch/delivery details) only makes sense once an order has
// actually shipped — before that there's nothing to track yet. So the
// "Track" link on this page is only enabled for these statuses; pending /
// approved / processing show a disabled state explaining why.
const TRACKABLE_STATUSES = ["dispatched", "delivered"];

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
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

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "customer") { navigate("/login"); return; }
    (async () => {
      try {
        const res = await API.get("/orders");
        setOrders(res.data);
      } catch {
        setError("Failed to load your orders.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const S = {
    heading: { fontFamily: FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 24px" },
    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(45,106,79,0.06)" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 16px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(45,106,79,0.04)" },
    td: { padding: "13px 16px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    trackBtn: { background: "transparent", border: `1px solid ${themeG.accent}`, borderRadius: 6, padding: "4px 12px", fontSize: 11.5, color: themeG.accent, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
    trackBtnDisabled: { background: "transparent", border: `1px solid ${themeG.border}`, borderRadius: 6, padding: "4px 12px", fontSize: 11.5, color: themeG.textSub, fontWeight: 600, cursor: "not-allowed", fontFamily: FONT },
  };

  return (
    <CustomerLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 style={S.heading}>My Orders</h1>
      <p style={S.headingSub}>All the enquiries you've placed. Tracking details are available once an order has shipped.</p>

      {error && (
        <div style={{ marginBottom: 20, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
          {error}
        </div>
      )}

      <div style={S.card}>
        <table style={S.table}>
          <thead>
            <tr>
              {["Order", "Product", "Color", "Size", "Qty", "Amount", "Status"].map((h) => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...S.td, textAlign: "center", padding: 30 }}>Loading orders…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={8} style={{ ...S.td, textAlign: "center", padding: 30 }}>You have no orders yet — head to the Product Catalog to place an enquiry.</td></tr>
            ) : orders.map((o) => {
              const status = (o.Status || "").toLowerCase();
              const canTrack = TRACKABLE_STATUSES.includes(status);
              return (
                <tr key={o.Id}>
                  <td style={{ ...S.td, fontWeight: 600, color: themeG.accent }}>{o.Code}</td>
                  <td style={S.td}>{o.product?.Name || "—"}</td>
                  <td style={S.td}>{o.OrderDetails?.Color || "—"}</td>
                  <td style={S.td}>{o.OrderDetails?.Size || "—"}</td>
                  <td style={S.td}>{o.Quantity}</td>
                  <td style={S.td}>₹{parseFloat(o.TotalAmount || 0).toLocaleString()}</td>
                  <td style={S.td}><Badge text={o.Status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CustomerLayout>
  );
}