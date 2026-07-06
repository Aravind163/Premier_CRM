// src/pages/EndUserDashboard.jsx
//
// End User (field officer) dashboard. All figures come from /api/dashboard
// and /api/complaints, which the backend already scopes to this user's
// assigned Taluk(s) — so no extra filtering needed here.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EndUserLayout from "../components/EndUserLayout";
import { useTheme } from "../ThemeContext";
import { getG, statusColor } from "../theme";
import API from "../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function formatRevenue(total) {
  if (total >= 10000000) return `₹${(total / 10000000).toFixed(2)}Cr`;
  if (total >= 100000)   return `₹${(total / 100000).toFixed(2)}L`;
  if (total >= 1000)     return `₹${(total / 1000).toFixed(1)}K`;
  return `₹${(total || 0).toLocaleString()}`;
}

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {(text || "—").charAt(0).toUpperCase() + (text || "—").slice(1)}
    </span>
  );
};

export default function EndUserDashboard() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [stats, setStats] = useState({ total_customers: null, active_orders: null, total_products: null, total_revenue: null });
  const [recentOrders, setRecentOrders] = useState([]);
  const [openComplaints, setOpenComplaints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (!role) { navigate("/login"); return; }
    if (role !== "end_user") { navigate("/dashboard"); return; }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [dashRes, complaintsRes] = await Promise.all([
          API.get("/dashboard"),
          API.get("/complaints"),
        ]);
        setStats(dashRes.data.stats || {});
        setRecentOrders(dashRes.data.recent_orders || []);
        const open = (complaintsRes.data || []).filter((c) => c.Status !== "Resolved").length;
        setOpenComplaints(open);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const S = {
    topBar: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 26 },
    heading: { fontFamily: FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: 0 },
    grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 },
    statCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "20px 20px 18px", position: "relative", overflow: "hidden", boxShadow: "0 4px 16px rgba(45,106,79,0.06)" },
    cardStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "14px 14px 0 0" },
    cardIcon: { fontSize: 20, marginBottom: 10, display: "block" },
    cardLabel: { fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" },
    cardValue: { fontSize: 26, fontWeight: 700, margin: 0, color: themeG.textMain, letterSpacing: "-0.5px" },

    quickRow: { display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" },
    quickCard: { flex: "1 1 200px", background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "18px 20px", cursor: "pointer", boxShadow: "0 3px 12px rgba(45,106,79,0.05)" },
    quickTitle: { fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: "0 0 4px" },
    quickSub: { fontSize: 12, color: themeG.textSub, margin: 0 },

    tableBox: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "22px 24px", boxShadow: "0 4px 16px rgba(45,106,79,0.06)" },
    tableTitle: { fontFamily: FONT, fontSize: 16, fontWeight: 600, margin: "0 0 14px", color: themeG.textMain },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "8px 12px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    td: { padding: "12px 12px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    emptyNote: { fontSize: 13, color: themeG.textSub, padding: "14px 0" },
  };

  return (
    <EndUserLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={S.topBar}>
        <div>
          <h1 style={S.heading}>Welcome, {user.name || "End User"}</h1>
          <p style={S.headingSub}>Here's what's happening in your area today.</p>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 20, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
          {error}
        </div>
      )}

      <div style={S.grid}>
        <div style={S.statCard}>
          <div style={{ ...S.cardStripe, background: "#2d6a4f" }} />
          <span style={S.cardIcon}>👥</span>
          <p style={S.cardLabel}>Customers (Area)</p>
          <p style={S.cardValue}>{loading ? "…" : stats.total_customers ?? 0}</p>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.cardStripe, background: "#d4a017" }} />
          <span style={S.cardIcon}>📦</span>
          <p style={S.cardLabel}>Active Orders</p>
          <p style={S.cardValue}>{loading ? "…" : stats.active_orders ?? 0}</p>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.cardStripe, background: "#3a9bd5" }} />
          <span style={S.cardIcon}>🧵</span>
          <p style={S.cardLabel}>Products Available</p>
          <p style={S.cardValue}>{loading ? "…" : stats.total_products ?? 0}</p>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.cardStripe, background: "#a03025" }} />
          <span style={S.cardIcon}>🛠️</span>
          <p style={S.cardLabel}>Open Complaints</p>
          <p style={S.cardValue}>{loading ? "…" : openComplaints ?? 0}</p>
        </div>
      </div>

      <div style={S.quickRow}>
        <div style={S.quickCard} onClick={() => navigate("/master/orders/add")}>
          <p style={S.quickTitle}>+ New Order</p>
          <p style={S.quickSub}>Place an order for a customer in your area</p>
        </div>
        <div style={S.quickCard} onClick={() => navigate("/end-user/enquiry")}>
          <p style={S.quickTitle}>Order Enquiry</p>
          <p style={S.quickSub}>See what's pending approval across your area</p>
        </div>
        <div style={S.quickCard} onClick={() => navigate("/end-user/complaints")}>
          <p style={S.quickTitle}>Complaints</p>
          <p style={S.quickSub}>Track complaints raised in your area</p>
        </div>
      </div>

      <div style={S.tableBox}>
        <h3 style={S.tableTitle}>Recent Orders in Your Area</h3>
        {loading ? (
          <p style={S.emptyNote}>Loading…</p>
        ) : recentOrders.length === 0 ? (
          <p style={S.emptyNote}>No orders yet.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Order</th>
                <th style={S.th}>Customer</th>
                <th style={S.th}>Product</th>
                <th style={S.th}>Amount</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id}>
                  <td style={S.td}>{o.id}</td>
                  <td style={S.td}>{o.customer}</td>
                  <td style={S.td}>{o.product}</td>
                  <td style={S.td}>{formatRevenue(parseFloat(o.amount) || 0)}</td>
                  <td style={S.td}><Badge text={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </EndUserLayout>
  );
}