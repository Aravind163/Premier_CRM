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
  const [o2c, setO2c] = useState(null);
  const [o2cLoading, setO2cLoading] = useState(true);

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

    // ── O2C widget styles ──
    sectionTitle: { fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 20, fontWeight: 700, margin: "36px 0 4px", color: themeG.textMain },
    sectionSub: { fontSize: 12.5, color: themeG.textSub, margin: "0 0 16px" },
    miniGrid: (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, marginBottom: 22 }),
    miniCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 12, padding: "16px 18px", boxShadow: "0 3px 12px rgba(106,163,38,0.05)" },
    miniLabel: { fontSize: 11, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, margin: "0 0 6px" },
    miniValue: { fontSize: 22, fontWeight: 700, margin: 0, color: themeG.textMain },
    twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 },
    widgetBox: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 3px 12px rgba(106,163,38,0.05)", marginBottom: 22 },
    widgetTitle: { fontSize: 14.5, fontWeight: 700, color: themeG.textMain, margin: "0 0 12px" },
    smallTable: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
    smallTh: { textAlign: "left", padding: "6px 8px", color: themeG.textLabel, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${themeG.border}` },
    smallTd: { padding: "8px 8px", color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    emptyNote: { fontSize: 12.5, color: themeG.textSub, padding: "8px 0" },
    approxNote: { fontSize: 11, color: themeG.textSub, fontStyle: "italic", marginTop: 10 },
  };

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (!role) { navigate("/login"); return; }
    if (role === "customer") { navigate("/customer/dashboard"); return; }
    if (role === "end_user") { navigate("/end-user/dashboard"); return; }
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

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/dashboard/o2c");
        setO2c(res.data);
      } catch {
        // O2C widgets are supplementary — a failure here shouldn't block the
        // rest of the dashboard, so we just leave o2c null and hide the section.
      } finally {
        setO2cLoading(false);
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

      {/* ══════════════════ O2C Operations Dashboard ══════════════════ */}
      {!o2cLoading && o2c && (
        <>
          {/* 1. Enquiry Status */}
          <h2 style={styles.sectionTitle}>Enquiry Status</h2>
          <p style={styles.sectionSub}>Total enquiries and where they stand right now.</p>
          <div style={styles.miniGrid(4)}>
            {[
              ["Total", o2c.enquiryStatus.total, "#689f38"],
              ["Pending", o2c.enquiryStatus.pending, "#a3791f"],
              ["Approved+", o2c.enquiryStatus.approved, "#558b2f"],
              ["Rejected", o2c.enquiryStatus.rejected, "#a23528"],
            ].map(([label, val, color]) => (
              <div key={label} style={styles.miniCard}>
                <p style={styles.miniLabel}>{label}</p>
                <p style={{ ...styles.miniValue, color }}>{val}</p>
              </div>
            ))}
          </div>

          {/* 2. Total Orders Placed */}
          <h2 style={styles.sectionTitle}>Orders Placed</h2>
          <p style={styles.sectionSub}>Today: <strong>{o2c.ordersPlaced.today}</strong> order(s) placed.</p>
          <div style={styles.twoCol}>
            <div style={styles.widgetBox}>
              <p style={styles.widgetTitle}>Customer-wise (top 10)</p>
              {o2c.ordersPlaced.customerWise.length === 0 ? <p style={styles.emptyNote}>No data.</p> : (
                <table style={styles.smallTable}>
                  <thead><tr><th style={styles.smallTh}>Customer</th><th style={styles.smallTh}>Orders</th><th style={styles.smallTh}>Value</th></tr></thead>
                  <tbody>
                    {o2c.ordersPlaced.customerWise.map((c, i) => (
                      <tr key={i}><td style={styles.smallTd}>{c.customer}</td><td style={styles.smallTd}>{c.count}</td><td style={styles.smallTd}>₹{c.value.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={styles.widgetBox}>
              <p style={styles.widgetTitle}>Product-wise (top 10)</p>
              {o2c.ordersPlaced.productWise.length === 0 ? <p style={styles.emptyNote}>No data.</p> : (
                <table style={styles.smallTable}>
                  <thead><tr><th style={styles.smallTh}>Product</th><th style={styles.smallTh}>Orders</th><th style={styles.smallTh}>Qty</th></tr></thead>
                  <tbody>
                    {o2c.ordersPlaced.productWise.map((p, i) => (
                      <tr key={i}><td style={styles.smallTd}>{p.product}</td><td style={styles.smallTd}>{p.count}</td><td style={styles.smallTd}>{p.qty}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 3. Dispatch Status */}
          <h2 style={styles.sectionTitle}>Dispatch Status</h2>
          <div style={styles.miniGrid(3)}>
            {[
              ["Dispatched", o2c.dispatchStatus.dispatched, "#5a3d9e"],
              ["Pending Dispatch", o2c.dispatchStatus.pendingDispatch, "#a3791f"],
              ["Delivered", o2c.dispatchStatus.delivered, "#558b2f"],
            ].map(([label, val, color]) => (
              <div key={label} style={styles.miniCard}>
                <p style={styles.miniLabel}>{label}</p>
                <p style={{ ...styles.miniValue, color }}>{val}</p>
              </div>
            ))}
          </div>

          {/* 4. Previous Day Pending Dispatch + Aging */}
          <h2 style={styles.sectionTitle}>Pending Dispatch — Aging</h2>
          <div style={styles.miniGrid(3)}>
            {[
              ["0–1 days", o2c.pendingDispatchAging.buckets["0-1"], "#558b2f"],
              ["2–3 days", o2c.pendingDispatchAging.buckets["2-3"], "#a3791f"],
              ["4+ days (priority)", o2c.pendingDispatchAging.buckets["4+"], "#a23528"],
            ].map(([label, val, color]) => (
              <div key={label} style={styles.miniCard}>
                <p style={styles.miniLabel}>{label}</p>
                <p style={{ ...styles.miniValue, color }}>{val}</p>
              </div>
            ))}
          </div>
          <div style={styles.widgetBox}>
            <p style={styles.widgetTitle}>Oldest pending dispatch</p>
            {o2c.pendingDispatchAging.list.length === 0 ? <p style={styles.emptyNote}>Nothing pending dispatch 🎉</p> : (
              <table style={styles.smallTable}>
                <thead><tr><th style={styles.smallTh}>Order</th><th style={styles.smallTh}>Customer</th><th style={styles.smallTh}>Status</th><th style={styles.smallTh}>Days Pending</th></tr></thead>
                <tbody>
                  {o2c.pendingDispatchAging.list.map((r, i) => (
                    <tr key={i}><td style={styles.smallTd}>{r.code}</td><td style={styles.smallTd}>{r.customer}</td><td style={styles.smallTd}>{r.status}</td><td style={styles.smallTd}>{r.days}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 5. Stock Shortage */}
          <h2 style={styles.sectionTitle}>Enquiries Awaiting — Stock Shortage</h2>
          <div style={styles.widgetBox}>
            {o2c.stockShortage.length === 0 ? <p style={styles.emptyNote}>No enquiries currently blocked by stock shortage.</p> : (
              <table style={styles.smallTable}>
                <thead><tr><th style={styles.smallTh}>Order</th><th style={styles.smallTh}>Customer</th><th style={styles.smallTh}>Product</th><th style={styles.smallTh}>Requested</th><th style={styles.smallTh}>Available</th></tr></thead>
                <tbody>
                  {o2c.stockShortage.map((r, i) => (
                    <tr key={i}><td style={styles.smallTd}>{r.code}</td><td style={styles.smallTd}>{r.customer}</td><td style={styles.smallTd}>{r.product}</td><td style={styles.smallTd}>{r.requested}</td><td style={{ ...styles.smallTd, color: "#a23528", fontWeight: 600 }}>{r.available}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 6. Sales Loss */}
          <h2 style={styles.sectionTitle}>Sales Loss Indication</h2>
          <div style={styles.miniGrid(2)}>
            <div style={styles.miniCard}>
              <p style={styles.miniLabel}>Declined Enquiries</p>
              <p style={{ ...styles.miniValue, color: "#a23528" }}>{o2c.salesLoss.count}</p>
            </div>
            <div style={styles.miniCard}>
              <p style={styles.miniLabel}>Opportunity Value Lost</p>
              <p style={{ ...styles.miniValue, color: "#a23528" }}>₹{o2c.salesLoss.value.toLocaleString()}</p>
            </div>
          </div>
          {o2c.salesLoss.list.length > 0 && (
            <div style={styles.widgetBox}>
              <table style={styles.smallTable}>
                <thead><tr><th style={styles.smallTh}>Order</th><th style={styles.smallTh}>Customer</th><th style={styles.smallTh}>Value</th><th style={styles.smallTh}>Notes</th></tr></thead>
                <tbody>
                  {o2c.salesLoss.list.map((r, i) => (
                    <tr key={i}><td style={styles.smallTd}>{r.code}</td><td style={styles.smallTd}>{r.customer}</td><td style={styles.smallTd}>₹{r.value.toLocaleString()}</td><td style={styles.smallTd}>{r.notes || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 7. Invalid Indent List (possible duplicates) */}
          <h2 style={styles.sectionTitle}>Invalid Indent List</h2>
          <p style={styles.sectionSub}>Same customer + product with more than one pending enquiry — likely duplicates.</p>
          <div style={styles.widgetBox}>
            {o2c.possibleDuplicates.length === 0 ? <p style={styles.emptyNote}>No likely duplicate enquiries found.</p> : (
              <table style={styles.smallTable}>
                <thead><tr><th style={styles.smallTh}>Customer</th><th style={styles.smallTh}>Product</th><th style={styles.smallTh}>Pending Count</th></tr></thead>
                <tbody>
                  {o2c.possibleDuplicates.map((r, i) => (
                    <tr key={i}><td style={styles.smallTd}>{r.customer}</td><td style={styles.smallTd}>{r.product}</td><td style={{ ...styles.smallTd, fontWeight: 600 }}>{r.count}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 8. Long Pending Orders */}
          <h2 style={styles.sectionTitle}>Long Pending Orders</h2>
          <p style={styles.sectionSub}>Approved/processing for 3+ days without dispatch — needs escalation.</p>
          <div style={styles.widgetBox}>
            {o2c.longPendingOrders.length === 0 ? <p style={styles.emptyNote}>Nothing long-pending 🎉</p> : (
              <table style={styles.smallTable}>
                <thead><tr><th style={styles.smallTh}>Order</th><th style={styles.smallTh}>Customer</th><th style={styles.smallTh}>Status</th><th style={styles.smallTh}>Days Pending</th></tr></thead>
                <tbody>
                  {o2c.longPendingOrders.map((r, i) => (
                    <tr key={i}><td style={styles.smallTd}>{r.code}</td><td style={styles.smallTd}>{r.customer}</td><td style={styles.smallTd}>{r.status}</td><td style={{ ...styles.smallTd, color: "#a23528", fontWeight: 600 }}>{r.days}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p style={styles.approxNote}>{o2c.note}</p>
        </>
      )}
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