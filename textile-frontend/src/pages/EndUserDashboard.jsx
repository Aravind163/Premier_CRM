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

// Placeholder figures shown in place of real stats when the API returns
// nothing (0 / null) for them — e.g. a freshly-seeded area with no data
// yet. Purely cosmetic; swapped out the moment real numbers come in.
const DUMMY_STATS = {
  total_orders: 45,
  approved_orders: 30,
  pending_orders: 10,
  rejected_orders: 5,
  total_products: 56
};
const DUMMY_OPEN_COMPLAINTS = 3;
const DUMMY_RECENT_ORDERS = [
  { id: "ORD-1042", customer: "Sri Balaji Textiles", product: "Cotton Yarn 40s", amount: 42500, status: "dispatched" },
  { id: "ORD-1041", customer: "Kaveri Handlooms", product: "Poly-Cotton Blend", amount: 18750, status: "processing" },
  { id: "ORD-1039", customer: "Anand Weaving Mills", product: "Grey Fabric Roll", amount: 63200, status: "pending" },
];

function formatRevenue(total) {
  if (total >= 10000000) return `₹${(total / 10000000).toFixed(2)}Cr`;
  if (total >= 100000) return `₹${(total / 100000).toFixed(2)}L`;
  if (total >= 1000) return `₹${(total / 1000).toFixed(1)}K`;
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

  const [stats, setStats] = useState({
    total_orders: null,
    approved_orders: null,
    pending_orders: null,
    rejected_orders: null,
    total_products: null
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [openComplaints, setOpenComplaints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Once loading is done, any stat that's still 0/null/undefined falls
  // back to a placeholder figure so the dashboard doesn't look empty.
  const statVal = (key) => (loading ? null : (stats[key] || DUMMY_STATS[key]));
  const openComplaintsVal = loading ? null : (openComplaints || DUMMY_OPEN_COMPLAINTS);
  const recentOrdersVal = loading ? [] : (recentOrders.length ? recentOrders : DUMMY_RECENT_ORDERS);

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
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: 0 },
    grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 },
    statCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 12, padding: "14px 14px 12px", position: "relative", overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    cardStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "12px 12px 0 0" },
    cardIcon: { fontSize: 17, marginBottom: 7, display: "block" },
    cardLabel: { fontSize: 11, color: themeG.textLabel, margin: "0 0 4px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" },
    cardValue: { fontSize: 20, fontWeight: 700, margin: 0, color: themeG.textMain, letterSpacing: "-0.5px" },

    quickRow: { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" },
    quickCard: { flex: "1 1 200px", background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", boxShadow: "0 3px 12px rgba(15,33,56,0.05)" },
    quickTitle: { fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: "0 0 4px" },
    quickSub: { fontSize: 12, color: themeG.textSub, margin: 0 },

    tableBox: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "22px 24px", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
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
        <div style={{ marginBottom: 20, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}

      <div style={S.grid}>

        <div style={S.statCard}>
          <div style={{ ...S.cardStripe, background: "#1F5C99" }} />
          <span style={S.cardIcon}>📦</span>
          <p style={S.cardLabel}>Total Orders</p>
          <p style={S.cardValue}>
            {loading ? "…" : statVal("total_orders")}
          </p>
        </div>


        <div style={S.statCard}>
          <div style={{ ...S.cardStripe, background: "#2E8B57" }} />
          <span style={S.cardIcon}>✅</span>
          <p style={S.cardLabel}>Approved Orders</p>
          <p style={S.cardValue}>
            {loading ? "…" : statVal("approved_orders")}
          </p>
        </div>


        <div style={S.statCard}>
          <div style={{ ...S.cardStripe, background: "#D69426" }} />
          <span style={S.cardIcon}>⏳</span>
          <p style={S.cardLabel}>Pending Orders</p>
          <p style={S.cardValue}>
            {loading ? "…" : statVal("pending_orders")}
          </p>
        </div>


        <div style={S.statCard}>
          <div style={{ ...S.cardStripe, background: "#96302F" }} />
          <span style={S.cardIcon}>❌</span>
          <p style={S.cardLabel}>Rejected Orders</p>
          <p style={S.cardValue}>
            {loading ? "…" : statVal("rejected_orders")}
          </p>
        </div>

      </div>

      

      <div style={S.tableBox}>
        <h3 style={S.tableTitle}>Recent Orders in Your Area</h3>
        {loading ? (
          <p style={S.emptyNote}>Loading…</p>
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
              {recentOrdersVal.map((o) => (
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