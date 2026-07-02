// src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { useTheme } from "../ThemeContext";
import { getG } from "../theme";
import API from "../services/api";

const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");

import logo from '/premier-icon.png'

const ACTIVE_STATUSES = ["pending", "approved", "processing"];

function formatRevenue(total) {
  const themeG = getThemeColors();
  if (total >= 10000000) return `₹${(total / 10000000).toFixed(2)}Cr`;
  if (total >= 100000)   return `₹${(total / 100000).toFixed(2)}L`;
  if (total >= 1000)     return `₹${(total / 1000).toFixed(1)}K`;
  return `₹${total.toLocaleString()}`;
}

export default function Dashboard() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [stats, setStats] = useState({
    customers: null,
    activeOrders: null,
    products: null,
    revenue: null,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const styles = {
    topBar: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 30 },
    heading: { fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: 0 },
    liveBadge: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#3d5a1f", background: "rgba(124,179,66,0.12)", border: "1px solid rgba(124,179,66,0.28)", padding: "5px 14px", borderRadius: 20 },
    liveDot: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#7cb342" },
    grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 30 },
    statCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "20px 20px 18px", position: "relative", overflow: "hidden", boxShadow: "0 4px 16px rgba(106,163,38,0.06)" },
    cardStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "14px 14px 0 0" },
    cardIconRow: { marginBottom: 10 },
    cardIcon: { fontSize: 20 },
    cardLabel: { fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" },
    cardValue: { fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" },
    tableBox: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "24px 26px", boxShadow: "0 4px 16px rgba(106,163,38,0.06)" },
    tableHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
    tableTitle: { fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 17, fontWeight: 600, margin: 0, color: themeG.textMain },
    tableCount: { fontSize: 12, color: themeG.textSub, background: "rgba(124,179,66,0.09)", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(124,179,66,0.18)" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "8px 12px", borderBottom: "1px solid rgba(106,163,38,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 },
    tr: { borderBottom: "1px solid rgba(106,163,38,0.08)" },
    td: { padding: "13px 12px", fontSize: 14, color: "#4a5a3a" },
    statusBadge: { padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  };

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (!role) { navigate("/login"); return; }
    if (role === "customer") { navigate("/customer/dashboard"); return; }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [custRes, prodRes, orderRes] = await Promise.all([
          API.get("/customers"),
          API.get("/products"),
          API.get("/orders"),
        ]);

        const customers = custRes.data;
        const products = prodRes.data;
        const orders = orderRes.data;

        const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.Status));
        const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.TotalAmount) || 0), 0);

        setStats({
          customers: customers.length,
          activeOrders: activeOrders.length,
          products: products.length,
          revenue: formatRevenue(totalRevenue),
        });

        setRecentOrders(
          orders.slice(0, 4).map((o) => ({
            id: o.Code,
            customer: o.customer?.Name ?? "—",
            product: o.product?.Name ?? "—",
            amount: `₹${(parseFloat(o.TotalAmount) || 0).toLocaleString()}`,
            status: o.Status,
          }))
        );
      } catch (err) {
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statCards = [
    { label: "Total Customers", value: loading ? "—" : (stats.customers ?? 0).toLocaleString(), icon: "👥", accent: "#7cb342" },
    { label: "Active Orders",   value: loading ? "—" : (stats.activeOrders ?? 0).toLocaleString(), icon: "📦", accent: "#558b2f" },
    { label: "Products",        value: loading ? "—" : (stats.products ?? 0).toLocaleString(), icon: "🧵", accent: "#9ccc65" },
    { label: "Revenue",         value: loading ? "—" : stats.revenue, icon: "📈", accent: "#689f38" },
  ];


  return (
    <Layout>
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* Top bar */}
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.heading}>Dashboard</h1>
          <p style={styles.headingSub}>Welcome back, {user.name || "Super Admin"}</p>
        </div>
        <div style={styles.liveBadge}>
          <span style={styles.liveDot} />
          Live
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 20, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={styles.grid}>
        {statCards.map((card) => (
          <div key={card.label} style={styles.statCard}>
            <div style={{ ...styles.cardStripe, background: card.accent }} />
            <div style={styles.cardIconRow}>
              <span style={styles.cardIcon}>{card.icon}</span>
            </div>
            <p style={styles.cardLabel}>{card.label}</p>
            <p style={{ ...styles.cardValue, color: card.accent }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent orders table */}
      <div style={styles.tableBox}>
        <div style={styles.tableHeader}>
          <h2 style={styles.tableTitle}>Recent Orders</h2>
          <span style={styles.tableCount}>{recentOrders.length} records</span>
        </div>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Order ID", "Customer", "Product", "Amount", "Status"].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...styles.td, textAlign: "center", padding: 30 }}>Loading recent orders…</td></tr>
            ) : recentOrders.length === 0 ? (
              <tr><td colSpan={5} style={{ ...styles.td, textAlign: "center", padding: 30 }}>No orders yet.</td></tr>
            ) : recentOrders.map((o) => (
              <tr key={o.id} style={styles.tr}>
                <td style={{ ...styles.td, color: "#558b2f", fontWeight: 600 }}>{o.id}</td>
                <td style={styles.td}>{o.customer}</td>
                <td style={styles.td}>{o.product}</td>
                <td style={{ ...styles.td, fontWeight: 600, color: "#33401f" }}>{o.amount}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.statusBadge, ...statusStyle(o.status) }}>
                    {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

function statusStyle(s) {
  const themeG = getThemeColors();
  if (s === "delivered")  return { background: "rgba(124,179,66,0.14)",  color: "#558b2f",  border: "1px solid rgba(124,179,66,0.30)" };
  if (s === "pending")    return { background: "rgba(200,160,40,0.12)",  color: "#a3791f",  border: "1px solid rgba(200,160,40,0.28)" };
  if (s === "declined")   return { background: "rgba(192,57,43,0.10)",   color: "#a23528",  border: "1px solid rgba(192,57,43,0.26)" };
  return                         { background: "rgba(124,179,66,0.08)",  color: "#689f38",  border: "1px solid rgba(124,179,66,0.20)" };
}

const DS = {
  bg: "#f0f5f1", card: "#ffffff",
  border: "rgba(106,163,38,0.16)",
  textMain: "#1a3d2b", textSub: "#4a7a5a", textLabel: "#5c6b4d",
};