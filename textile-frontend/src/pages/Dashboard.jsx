// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { useTheme } from "../ThemeContext";
import API from "../services/api";
import { DonutChart, BarChart, GroupedBarChart } from "../components/charts/MiniCharts";

const PENDING_STATUSES   = ["pending"];
const APPROVED_STATUSES  = ["approved", "processing", "dispatched", "delivered"];
const ACTIVE_STATUSES    = ["pending", "approved", "processing"];

/* ────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS — same forest/ochre/indigo "operations ledger" system
   used elsewhere on this dashboard, so the page matches the rest of the app.
   ──────────────────────────────────────────────────────────────────────── */
function getTokens(isDark) {
  return isDark
    ? {
        bg: "#10160f", card: "#171f16", cardAlt: "#1c251a",
        border: "rgba(233,238,224,0.10)", borderStrong: "rgba(233,238,224,0.18)",
        ink: "#eef0e8", inkSub: "#9fae9a", inkFaint: "#6d7d6a",
        forest: "#7bb27a", ochre: "#d3ab5c", indigo: "#9098d1", danger: "#dd8478", sage: "#5f8a63",
      }
    : {
        bg: "#f6f6f1", card: "#fdfdfa", cardAlt: "#f1f2ec",
        border: "rgba(24,32,20,0.10)", borderStrong: "rgba(24,32,20,0.16)",
        ink: "#1a2419", inkSub: "#5b6b58", inkFaint: "#8a9686",
        forest: "#2f5d3a", ochre: "#8f6a26", indigo: "#454d80", danger: "#963831", sage: "#3f6b45",
      };
}

const FONT_HEAD = "'Fraunces', 'Georgia', serif";
const FONT_UI = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_MONO = "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace";

function formatRevenue(total) {
  if (total >= 10000000) return `₹${(total / 10000000).toFixed(2)}Cr`;
  if (total >= 100000)   return `₹${(total / 100000).toFixed(2)}L`;
  if (total >= 1000)     return `₹${(total / 1000).toFixed(1)}K`;
  return `₹${total.toLocaleString()}`;
}

function statusTone(s, t) {
  const v = (s || "").toLowerCase();
  if (v === "delivered" || v === "approved") return t.forest;
  if (v === "dispatched")  return t.indigo;
  if (v === "processing")  return t.indigo;
  if (v === "pending")     return t.ochre;
  if (v === "declined")    return t.danger;
  return t.inkSub;
}

const daysSince = (dateStr) => {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
};

/* Minimal line icons — no emoji, stroke-based, single color via currentColor. */
const IconClipboard = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <rect x="6" y="4.5" width="12" height="17" rx="1.6" /><path d="M9 4.5V3.3a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 3.3v1.2" />
    <path d="M9 11h6M9 14.3h6M9 17.6h4" opacity="0.6" />
  </svg>
);
const IconCheck = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.6 2.6L16.2 9" />
  </svg>
);
const IconX = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" />
  </svg>
);
const IconCrate = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <path d="M3 8.2 12 4l9 4.2v9.6L12 22l-9-4.2z" /><path d="M3 8.2 12 12l9-4" /><path d="M12 12v10" opacity="0.55" />
  </svg>
);
const IconTruck = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <rect x="2.5" y="7" width="11" height="9" rx="1" /><path d="M13.5 10h4l3 3v3h-7z" />
    <circle cx="6.5" cy="18" r="1.7" /><circle cx="16.5" cy="18" r="1.7" />
  </svg>
);
const IconClock = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
  </svg>
);
const IconTrend = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <path d="M3.5 17 9 10.5l4 3.5L20.5 6" /><path d="M14.5 6H20.5V12" opacity="0.7" />
  </svg>
);
const IconTimer = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
    <path d="M10 2h4M12 2v3" /><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2" />
  </svg>
);
const IconRefresh = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...p}>
    <path d="M20 11A8 8 0 1 0 18.5 16" /><path d="M20 5v6h-6" />
  </svg>
);

const MOTION_CSS = `
@keyframes pdFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pdShimmer { 0% { background-position: -180px 0; } 100% { background-position: 180px 0; } }
@keyframes pdSpin { to { transform: rotate(360deg); } }
.pd-fade-up { animation: pdFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
.pd-skel { background-size: 400px 100%; animation: pdShimmer 1.4s ease-in-out infinite; border-radius: 4px; }
.pd-refresh:hover { border-color: var(--pd-strong); }
.pd-refresh:active { transform: scale(0.96); }
.pd-refresh:focus-visible, .pd-row:focus-visible { outline: 2px solid var(--pd-forest); outline-offset: 2px; }
.pd-spin { animation: pdSpin 0.7s linear infinite; }
.pd-row:hover { background: var(--pd-cardalt); }
.pd-stat:hover { border-color: var(--pd-strong); }
@media (prefers-reduced-motion: reduce) { .pd-fade-up, .pd-skel, .pd-spin { animation: none; } }
`;

export default function Dashboard() {
  const { isDark } = useTheme();
  const t = getTokens(isDark);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const styles = {
    page: { "--pd-strong": t.borderStrong, "--pd-cardalt": t.cardAlt, "--pd-forest": t.forest },
    topBar: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 34, gap: 16, flexWrap: "wrap", borderBottom: `1px solid ${t.border}`, paddingBottom: 20 },
    heading: { fontFamily: FONT_HEAD, fontSize: 32, fontWeight: 600, margin: 0, color: t.ink, letterSpacing: "-0.01em" },
    headingSub: { fontFamily: FONT_UI, fontSize: 13, color: t.inkSub, margin: "6px 0 0" },
    topBarRight: { display: "flex", alignItems: "center", gap: 14 },
    liveWrap: { display: "flex", alignItems: "center", gap: 7, fontFamily: FONT_MONO, fontSize: 11.5, color: t.inkSub },
    liveDot: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: loading ? t.ochre : t.forest },
    lastUpdated: { fontFamily: FONT_MONO, fontSize: 11, color: t.inkFaint },
    refreshBtn: { display: "flex", alignItems: "center", gap: 7, fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 600, color: t.ink, background: "transparent", border: `1px solid ${t.border}`, padding: "7px 14px", borderRadius: 8, cursor: "pointer" },

    statStrip: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: `1px solid ${t.border}`, borderRadius: 10, marginBottom: 18, overflow: "hidden" },
    statCell: { padding: "20px 22px", borderRight: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`, background: t.card },
    statTop: { display: "flex", alignItems: "center", gap: 8, color: t.inkFaint, marginBottom: 14 },
    statLabel: { fontFamily: FONT_UI, fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: t.inkFaint },
    statValue: { fontFamily: FONT_MONO, fontSize: 24, fontWeight: 600, color: t.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" },
    statSub: { fontFamily: FONT_UI, fontSize: 11, color: t.inkFaint, margin: "6px 0 0" },

    sectionHead: { display: "flex", alignItems: "baseline", gap: 12, margin: "40px 0 4px" },
    stageNum: { fontFamily: FONT_MONO, fontSize: 12, color: t.inkFaint, letterSpacing: "0.04em" },
    sectionTitle: { fontFamily: FONT_HEAD, fontSize: 21, fontWeight: 600, margin: 0, color: t.ink },
    sectionSub: { fontFamily: FONT_UI, fontSize: 12.5, color: t.inkSub, margin: "6px 0 16px" },

    chartRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "stretch", marginBottom: 22 },
    chartCard: { background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "center" },
    twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 },
    widgetBox: { background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: "19px 21px", marginBottom: 22 },
    widgetTitle: { fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 700, color: t.ink, margin: "0 0 12px" },
    emptyNote: { fontFamily: FONT_UI, fontSize: 12.5, color: t.inkSub, padding: "6px 0" },
    approxNote: { fontFamily: FONT_UI, fontSize: 11.5, color: t.inkFaint, fontStyle: "italic", marginTop: 12 },
    miniGrid: (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 22 }),
    miniCard: { background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: "15px 17px" },
    miniLabel: { fontFamily: FONT_UI, fontSize: 10.5, color: t.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, margin: "0 0 8px" },
    miniValue: { fontFamily: FONT_MONO, fontSize: 21, fontWeight: 600, margin: 0, fontVariantNumeric: "tabular-nums" },

    tableBox: { background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: "22px 24px", marginBottom: 8, overflowX: "auto" },
    table: { width: "100%", borderCollapse: "collapse", fontFamily: FONT_UI, fontSize: 12.5 },
    th: { textAlign: "left", padding: "8px 10px", color: t.inkFaint, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${t.border}` },
    td: { padding: "9px 10px", borderTop: `1px solid ${t.border}`, color: t.ink },
    mono: { fontFamily: FONT_MONO },
  };

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (!role) { navigate("/login"); return; }
    if (role === "customer") { navigate("/customer/dashboard"); return; }
    if (role === "end_user") { navigate("/end-user/dashboard"); return; }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [custRes, prodRes, orderRes] = await Promise.all([
          API.get("/customers"), API.get("/products"), API.get("/orders"),
        ]);
        setCustomers(custRes.data || []);
        setProducts(prodRes.data || []);
        setOrders(orderRes.data || []);
        setLastUpdated(new Date());
      } catch {
        setError("Couldn't load dashboard data. Check your connection and try refreshing.");
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshTick]);

  /* ── Normalize orders once ─────────────────────────────────────────── */
  const rows = useMemo(() => orders.map((o) => ({
    id: o.Code, dbId: o.Id,
    customer: o.customer?.Name ?? "—",
    customerId: o.customer?.Id ?? o.CustomerId,
    product: o.product?.Name ?? "—",
    productCode: o.product?.Code ?? o.ProductCode,
    qty: o.Quantity || 0,
    amount: parseFloat(o.TotalAmount) || 0,
    status: (o.Status || "").toLowerCase(),
    date: o.CreatedAt,
  })), [orders]);

  /* ── Stat strip ───────────────────────────────────────────────────── */
  const pendingCount  = rows.filter((r) => PENDING_STATUSES.includes(r.status)).length;
  const approvedCount = rows.filter((r) => APPROVED_STATUSES.includes(r.status)).length;
  const declinedCount = rows.filter((r) => r.status === "declined").length;
  const dispatchedOnlyCount = rows.filter((r) => r.status === "dispatched").length;
  const deliveredCount = rows.filter((r) => r.status === "delivered").length;
  const dispatchedCount = dispatchedOnlyCount + deliveredCount;
  const processingCount = rows.filter((r) => r.status === "processing").length;
  const pendingDispatchCount = rows.filter((r) => r.status === "approved" || r.status === "processing").length;
  const totalRevenue = rows.reduce((s, r) => s + r.amount, 0);

  const agingBuckets = useMemo(() => {
    const active = rows.filter((r) => ACTIVE_STATUSES.includes(r.status));
    return {
      "0-1": active.filter((r) => daysSince(r.date) <= 1).length,
      "2-3": active.filter((r) => daysSince(r.date) >= 2 && daysSince(r.date) <= 3).length,
      "4+": active.filter((r) => daysSince(r.date) >= 4).length,
    };
  }, [rows]);
  const agingPending = agingBuckets["0-1"] > 0 || true ? rows.filter((r) => ACTIVE_STATUSES.includes(r.status) && daysSince(r.date) >= 1 && daysSince(r.date) <= 2).length : 0;
  const longPendingAll = rows.filter((r) => ACTIVE_STATUSES.includes(r.status) && daysSince(r.date) >= 3)
    .map((r) => ({ ...r, days: daysSince(r.date) }))
    .sort((a, b) => b.days - a.days);

  /* ── Product-wise order demand (qty) ─────────────────────────────── */
  const productSummary = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      if (!map[r.product]) map[r.product] = { product: r.product, qty: 0 };
      map[r.product].qty += r.qty;
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [rows]);

  /* ── Stock shortage (active demand vs. product stock) ───────────────── */
  const stockShortage = useMemo(() => {
    const demand = {};
    rows.filter((r) => ACTIVE_STATUSES.includes(r.status)).forEach((r) => {
      demand[r.productCode] = (demand[r.productCode] || 0) + r.qty;
    });
    return Object.entries(demand)
      .map(([code, requested]) => {
        const p = products.find((p) => p.Code === code);
        const available = parseFloat(p?.Quantity) || 0;
        return { code, product: p?.Name || code, requested, available };
      })
      .filter((r) => r.requested > r.available)
      .sort((a, b) => (b.requested - b.available) - (a.requested - a.available));
  }, [rows, products]);

  const declinedOrders = rows.filter((r) => r.status === "declined");
  const salesLossCount = declinedCount + stockShortage.length;
  const salesLossValue =
    declinedOrders.reduce((s, r) => s + r.amount, 0) +
    stockShortage.reduce((s, r) => {
      const p = products.find((p) => p.Code === r.code);
      return s + (parseFloat(p?.Price) || 0) * (r.requested - r.available);
    }, 0);
  const salesLossByCustomer = useMemo(() => {
    const map = {};
    declinedOrders.forEach((r) => {
      if (!map[r.customer]) map[r.customer] = { customer: r.customer, value: 0 };
      map[r.customer].value += r.amount;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [declinedOrders]);

  /* ── Customer-wise order summary ─────────────────────────────────── */
  const customerSummary = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      if (!map[r.customer]) map[r.customer] = { customer: r.customer, orders: 0, value: 0 };
      map[r.customer].orders += 1;
      map[r.customer].value += r.amount;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [rows]);

  const formattedLastUpdated = lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  const statCards = [
    { label: "Total Orders", value: rows.length, sub: `${dispatchedCount} dispatched`, Icon: IconClipboard, accent: t.ink },
    { label: "Approved Orders", value: approvedCount, sub: "Past pending review", Icon: IconCheck, accent: t.forest },
    { label: "Declined Orders", value: declinedCount, sub: "Rejected at review", Icon: IconX, accent: t.danger },
    { label: "Processing", value: processingCount, sub: "In fulfilment, not dispatched", Icon: IconCrate, accent: t.indigo },
    { label: "Dispatched", value: dispatchedCount, sub: "Shipped or delivered", Icon: IconTruck, accent: t.indigo },
    { label: "Aging Pending Dispatch", value: agingPending, sub: "1–2 days since placed", Icon: IconClock, accent: t.ochre },
    { label: "Sales Loss Indicators", value: salesLossCount, sub: formatRevenue(salesLossValue) + " estimated", Icon: IconTrend, accent: t.danger },
    { label: "Long Pending Orders", value: longPendingAll.length, sub: "3+ days, not dispatched", Icon: IconTimer, accent: t.inkSub },
  ];

  return (
    <Layout>
      <style>{MOTION_CSS}</style>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />

      <div style={styles.page}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.heading}>Dashboard</h1>
            <p style={styles.headingSub}>Welcome back, {user.name || "Super Admin"}</p>
          </div>
          <div style={styles.topBarRight}>
            {formattedLastUpdated && !loading && <span style={styles.lastUpdated}>upd. {formattedLastUpdated}</span>}
            <span style={styles.liveWrap}><span style={styles.liveDot} />{loading ? "syncing" : "live"}</span>
            <button type="button" className="pd-refresh" style={styles.refreshBtn} onClick={() => setRefreshTick((n) => n + 1)} disabled={loading} aria-label="Refresh dashboard data">
              <IconRefresh className={loading ? "pd-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: 22, background: isDark ? "rgba(221,132,120,0.08)" : "rgba(150,56,49,0.06)", border: `1px solid ${t.danger}33`, borderRadius: 8, padding: "11px 15px", fontFamily: FONT_UI, fontSize: 13, color: t.danger, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span>{error}</span>
            <button type="button" onClick={() => setRefreshTick((n) => n + 1)} style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 600, color: t.danger, background: "transparent", border: `1px solid ${t.danger}55`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", flexShrink: 0 }}>
              Try again
            </button>
          </div>
        )}

        {/* Stat strip */}
        <div style={styles.statStrip}>
          {statCards.map((card, i) => (
            <div key={card.label} className="pd-fade-up pd-stat" style={{ ...styles.statCell, borderRight: (i % 4 === 3) ? "none" : styles.statCell.borderRight, borderBottom: i >= 4 ? "none" : styles.statCell.borderBottom, animationDelay: `${i * 45}ms` }}>
              <div style={styles.statTop}><card.Icon style={{ color: card.accent }} /><span style={styles.statLabel}>{card.label}</span></div>
              {loading ? (
                <div className="pd-skel" style={{ height: 24, width: "55%", background: `linear-gradient(90deg, ${t.border} 25%, ${t.borderStrong} 37%, ${t.border} 63%)` }} aria-hidden="true" />
              ) : (
                <p style={styles.statValue}>{card.value}</p>
              )}
              {!loading && <p style={styles.statSub}>{card.sub}</p>}
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="pd-skel" style={{ height: 20, width: 180, background: `linear-gradient(90deg, ${t.border} 25%, ${t.borderStrong} 37%, ${t.border} 63%)` }} aria-hidden="true" />
            <div style={styles.miniGrid(4)}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="pd-skel" style={{ height: 64, borderRadius: 8, background: `linear-gradient(90deg, ${t.border} 25%, ${t.borderStrong} 37%, ${t.border} 63%)` }} aria-hidden="true" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 01 · Order status breakdown */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>01</span><h2 style={styles.sectionTitle}>Order Status Breakdown</h2></div>
            <p style={styles.sectionSub}>Pending review, approved onward, and declined — across all orders.</p>
            <div style={styles.chartRow}>
              <div style={styles.miniGrid(4)}>
                {[["Total", rows.length, t.ink], ["Pending", pendingCount, t.ochre], ["Approved+", approvedCount, t.forest], ["Declined", declinedCount, t.danger]].map(([label, val, color]) => (
                  <div key={label} style={styles.miniCard}><p style={styles.miniLabel}>{label}</p><p style={{ ...styles.miniValue, color }}>{val}</p></div>
                ))}
              </div>
              <div style={styles.chartCard}>
                <DonutChart size={140} thickness={17} textColor={t.ink} subColor={t.inkSub}
                  data={[
                    { label: "Pending", value: pendingCount, color: t.ochre },
                    { label: "Approved+", value: approvedCount, color: t.forest },
                    { label: "Declined", value: declinedCount, color: t.danger },
                  ]} />
              </div>
            </div>

            {/* 02 · Orders placed */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>02</span><h2 style={styles.sectionTitle}>Orders Placed</h2></div>
            <p style={styles.sectionSub}>{formatRevenue(totalRevenue)} in total order value across {rows.length} order(s).</p>
            <div style={styles.twoCol}>
              <div style={styles.widgetBox}>
                <p style={styles.widgetTitle}>Customer-wise (top 6)</p>
                {customerSummary.length === 0 ? <p style={styles.emptyNote}>No data yet.</p> : (
                  <BarChart height={160} barWidth={54} textColor={t.ink} subColor={t.inkSub}
                    data={customerSummary.slice(0, 6).map((c, i) => ({ label: c.customer, value: Math.round(c.value), color: [t.forest, t.sage, t.ochre, t.indigo, t.danger, t.inkSub][i % 6] }))} />
                )}
              </div>
              <div style={styles.widgetBox}>
                <p style={styles.widgetTitle}>Product-wise (top 6, by quantity)</p>
                {productSummary.length === 0 ? <p style={styles.emptyNote}>No data yet.</p> : (
                  <BarChart height={160} barWidth={54} textColor={t.ink} subColor={t.inkSub}
                    data={productSummary.slice(0, 6).map((p, i) => ({ label: p.product, value: p.qty, color: [t.sage, t.ochre, t.indigo, t.forest, t.danger, t.inkSub][i % 6] }))} />
                )}
              </div>
            </div>

            {/* 03 · Dispatch status */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>03</span><h2 style={styles.sectionTitle}>Dispatch Status</h2></div>
            <p style={styles.sectionSub}>Where approved orders currently sit in fulfilment.</p>
            <div style={styles.chartRow}>
              <div style={styles.miniGrid(3)}>
                {[["Dispatched", dispatchedOnlyCount, t.indigo], ["Pending dispatch", pendingDispatchCount, t.ochre], ["Delivered", deliveredCount, t.forest]].map(([label, val, color]) => (
                  <div key={label} style={styles.miniCard}><p style={styles.miniLabel}>{label}</p><p style={{ ...styles.miniValue, color }}>{val}</p></div>
                ))}
              </div>
              <div style={styles.chartCard}>
                <DonutChart size={120} thickness={15} textColor={t.ink} subColor={t.inkSub}
                  data={[
                    { label: "Dispatched", value: dispatchedOnlyCount, color: t.indigo },
                    { label: "Pending", value: pendingDispatchCount, color: t.ochre },
                    { label: "Delivered", value: deliveredCount, color: t.forest },
                  ]} />
              </div>
            </div>

            {/* 04 · Pending dispatch aging */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>04</span><h2 style={styles.sectionTitle}>Pending Dispatch — Aging</h2></div>
            <p style={styles.sectionSub}>Active orders (pending, approved, processing) grouped by days since placed.</p>
            <div style={styles.chartRow}>
              <div style={styles.miniGrid(3)}>
                {[["0–1 days", agingBuckets["0-1"], t.forest], ["2–3 days", agingBuckets["2-3"], t.ochre], ["4+ days (priority)", agingBuckets["4+"], t.danger]].map(([label, val, color]) => (
                  <div key={label} style={styles.miniCard}><p style={styles.miniLabel}>{label}</p><p style={{ ...styles.miniValue, color }}>{val}</p></div>
                ))}
              </div>
              <div style={styles.chartCard}>
                <BarChart height={130} barWidth={40} textColor={t.ink} subColor={t.inkSub}
                  data={[
                    { label: "0–1d", value: agingBuckets["0-1"], color: t.forest },
                    { label: "2–3d", value: agingBuckets["2-3"], color: t.ochre },
                    { label: "4+d", value: agingBuckets["4+"], color: t.danger },
                  ]} />
              </div>
            </div>

            {/* 05 · Stock shortage */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>05</span><h2 style={styles.sectionTitle}>Stock Shortage</h2></div>
            <p style={styles.sectionSub}>Active-order demand (pending, approved, processing) vs. current product stock.</p>
            <div style={styles.widgetBox}>
              {stockShortage.length === 0 ? <p style={styles.emptyNote}>No shortages currently.</p> : (
                <GroupedBarChart height={180} textColor={t.ink} subColor={t.inkSub}
                  series={[{ label: "Requested", color: t.ochre }, { label: "Available", color: t.danger }]}
                  data={stockShortage.slice(0, 6).map((r) => ({ label: r.product, values: [r.requested, r.available] }))} />
              )}
            </div>
            <div style={styles.tableBox}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Product</th><th style={styles.th}>Requested</th><th style={styles.th}>Available</th><th style={styles.th}>Shortfall</th></tr></thead>
                <tbody>
                  {stockShortage.map((r) => (
                    <tr key={r.code} className="pd-row">
                      <td style={styles.td}>{r.product}</td>
                      <td style={{ ...styles.td, ...styles.mono }}>{r.requested}</td>
                      <td style={{ ...styles.td, ...styles.mono }}>{r.available}</td>
                      <td style={{ ...styles.td, ...styles.mono, color: t.danger, fontWeight: 600 }}>{r.requested - r.available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stockShortage.length === 0 && <p style={styles.emptyNote}>Nothing short right now.</p>}
            </div>

            {/* 06 · Sales loss */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>06</span><h2 style={styles.sectionTitle}>Sales Loss</h2></div>
            <p style={styles.sectionSub}>Declined orders plus demand that current stock can't cover.</p>
            <div style={styles.chartRow}>
              <div style={styles.miniGrid(2)}>
                <div style={styles.miniCard}><p style={styles.miniLabel}>Declined orders</p><p style={{ ...styles.miniValue, color: t.danger }}>{declinedCount}</p></div>
                <div style={styles.miniCard}><p style={styles.miniLabel}>Value lost (est.)</p><p style={{ ...styles.miniValue, color: t.danger }}>{formatRevenue(salesLossValue)}</p></div>
              </div>
              {salesLossByCustomer.length > 0 && (
                <div style={styles.chartCard}>
                  <BarChart height={130} barWidth={30} textColor={t.ink} subColor={t.inkSub}
                    data={salesLossByCustomer.slice(0, 6).map((r) => ({ label: r.customer, value: Math.round(r.value), color: t.danger }))} />
                </div>
              )}
            </div>

            {/* 07 · Declined orders detail */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>07</span><h2 style={styles.sectionTitle}>Declined Orders</h2></div>
            <p style={styles.sectionSub}>Orders rejected at review — {formatRevenue(declinedOrders.reduce((s, r) => s + r.amount, 0))} in lost value.</p>
            <div style={{ ...styles.tableBox, marginBottom: 30 }}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Order</th><th style={styles.th}>Customer</th><th style={styles.th}>Product</th><th style={styles.th}>Amount</th></tr></thead>
                <tbody>
                  {declinedOrders.map((r) => (
                    <tr key={r.id} className="pd-row">
                      <td style={{ ...styles.td, ...styles.mono, fontSize: 11.5 }}>{r.id}</td>
                      <td style={styles.td}>{r.customer}</td><td style={styles.td}>{r.product}</td>
                      <td style={{ ...styles.td, ...styles.mono }}>₹{r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {declinedCount === 0 && <p style={styles.emptyNote}>No declined orders.</p>}
            </div>

            {/* 08 · Long pending orders */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>08</span><h2 style={styles.sectionTitle}>Long Pending Orders</h2></div>
            <p style={styles.sectionSub}>Pending, approved, or processing — 3+ days since placed, not yet dispatched.</p>
            <div style={styles.widgetBox}>
              {longPendingAll.length === 0 ? <p style={styles.emptyNote}>Nothing long-pending — all clear.</p> : (
                <BarChart height={140} barWidth={30} textColor={t.ink} subColor={t.inkSub}
                  data={longPendingAll.slice(0, 6).map((r) => ({ label: r.customer, value: r.days, color: t.danger }))} />
              )}
            </div>
            <div style={styles.tableBox}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Order</th><th style={styles.th}>Customer</th><th style={styles.th}>Status</th><th style={styles.th}>Days pending</th></tr></thead>
                <tbody>
                  {longPendingAll.map((r) => (
                    <tr key={r.id} className="pd-row">
                      <td style={{ ...styles.td, ...styles.mono, fontSize: 11.5 }}>{r.id}</td>
                      <td style={styles.td}>{r.customer}</td>
                      <td style={styles.td}><span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, textTransform: "capitalize", color: statusTone(r.status, t) }}>{r.status}</span></td>
                      <td style={{ ...styles.td, ...styles.mono }}>{r.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {longPendingAll.length === 0 && <p style={styles.emptyNote}>Nothing long-pending — all clear.</p>}
            </div>

            {/* 09 · Customer-wise order summary */}
            <div style={styles.sectionHead}><span style={styles.stageNum}>09</span><h2 style={styles.sectionTitle}>Customer-wise Order Summary</h2></div>
            <div style={{ ...styles.tableBox, marginBottom: 30 }}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Customer</th><th style={styles.th}>Orders</th><th style={styles.th}>Value</th></tr></thead>
                <tbody>
                  {customerSummary.map((c) => (
                    <tr key={c.customer} className="pd-row">
                      <td style={styles.td}>{c.customer}</td>
                      <td style={{ ...styles.td, ...styles.mono }}>{c.orders}</td>
                      <td style={{ ...styles.td, ...styles.mono }}>₹{Math.round(c.value).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {customerSummary.length === 0 && <p style={styles.emptyNote}>No sales orders yet.</p>}
            </div>

            <p style={styles.approxNote}>
              All figures computed live from /customers, /products and /orders — status thresholds:
              pending/approved/processing = active, dispatched/delivered = closed.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}