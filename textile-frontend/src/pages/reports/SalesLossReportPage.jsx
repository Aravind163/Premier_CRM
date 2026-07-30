// src/pages/reports/SalesLossReportPage.jsx
//
// Report 6 of 6. Monthly-wise breakdown of sales lost to declined/
// cancelled orders, filterable by product, with a grand total row.
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../ThemeContext";
import Layout from "../../components/Layout";
import { getG } from "../../theme";
import API from "../../services/api";
import { exportReportToExcel } from "../../utils/excelIO";
import {
  FONT, ExportButton, PageHeading,
  cardStyle, errorBoxStyle, statCardStyle, todayStamp, fmtAmt,
} from "./shared";

const SALES_LOSS_COLUMNS = [
  { key: "Month", header: "Month" }, { key: "CancelledOrders", header: "Cancelled Orders" },
  { key: "ValueLost", header: "Value Lost" },
];

const CANCELLED_STATUSES = ["declined", "rejected", "cancelled", "canceled"];

function monthKey(dateStr) {
  const d = dateStr ? new Date(dateStr) : null;
  if (!d || isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function monthSortValue(dateStr) {
  const d = dateStr ? new Date(dateStr) : null;
  return d && !isNaN(d.getTime()) ? d.getFullYear() * 12 + d.getMonth() : -1;
}

export default function SalesLossReportPage() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [productFilter, setProductFilter] = useState("All");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/orders");
        setAllOrders(res.data || []);
      } catch {
        setError("Failed to load sales loss report data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allLost = useMemo(
    () => allOrders.filter((o) => CANCELLED_STATUSES.includes((o.Status || "").toLowerCase())),
    [allOrders]
  );

  const productOptions = useMemo(
    () => ["All", ...Array.from(new Set(allLost.map((o) => o.product?.Name).filter(Boolean))).sort()],
    [allLost]
  );

  const lost = useMemo(
    () => (productFilter === "All" ? allLost : allLost.filter((o) => o.product?.Name === productFilter)),
    [allLost, productFilter]
  );

  const totalValueLost = lost.reduce((s, o) => s + (parseFloat(o.TotalAmount) || 0), 0);
  const avgValueLost = lost.length ? totalValueLost / lost.length : 0;
  const uniqueCustomers = new Set(lost.map((o) => o.customer?.Name).filter(Boolean)).size;

  // Monthly breakdown, oldest → newest. Built with a plain reduce
  // instead of the shared groupBy helper (that helper counts by key,
  // it doesn't collect items — using it here would have thrown).
  const monthly = useMemo(() => {
    const map = {};
    lost.forEach((o) => {
      const key = monthKey(o.CreatedAt);
      if (!map[key]) map[key] = { month: key, count: 0, value: 0, sortKey: monthSortValue(o.CreatedAt) };
      map[key].count += 1;
      map[key].value += parseFloat(o.TotalAmount) || 0;
    });
    return Object.values(map).sort((a, b) => a.sortKey - b.sortKey);
  }, [lost]);

  const statCards = [
    { label: "Cancelled Orders", value: lost.length, accent: "#B23A3A" },
    { label: "Total Value Lost", value: fmtAmt(totalValueLost), accent: "#B23A3A" },
    { label: "Avg Value Lost", value: fmtAmt(avgValueLost), accent: "#8A5A0E" },
    { label: "Customers Affected", value: uniqueCustomers, accent: themeG.accent },
  ];

  const resetFilters = () => {
    setProductFilter("All");
    setShowCancelConfirm(false);
  };

  const exportExcel = () => {
    exportReportToExcel({
      reportTitle: "Sales Loss Report",
      filename: `sales-loss-report-${todayStamp()}`,
      stats: statCards.map(({ label, value }) => ({ label, value })),
      breakdowns: [
        { title: "Cancelled Orders by Month", items: [...monthly.map((m) => ({ label: m.month, value: m.count })), { label: "Total", value: lost.length }] },
        { title: "Value Lost by Month", items: [...monthly.map((m) => ({ label: m.month, value: fmtAmt(m.value) })), { label: "Total", value: fmtAmt(totalValueLost) }] },
      ],
      tables: [
        {
          title: "Cancelled Orders — Monthly Breakdown",
          columns: SALES_LOSS_COLUMNS,
          rows: monthly.map((m) => ({ Month: m.month, CancelledOrders: m.count, ValueLost: fmtAmt(m.value) })),
        },
      ],
    });
  };

  const card = cardStyle(themeG);
  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 12px", borderBottom: "1px solid rgba(46,122,114,0.13)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const td = { padding: "10px 12px", fontSize: 13, color: themeG.textMain };
  const filterSelect = { padding: "9px 12px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none", minWidth: 200 };
  const filterLabel = { fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" };

  return (
    <Layout pageTitle="Reports">
      <PageHeading themeG={themeG} title="Sales Loss Report" subtitle="Cancelled orders and lost revenue, broken down month by month." />

      {loading ? (
        <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading report…</p>
      ) : (
        <>
          {error && <div style={errorBoxStyle}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={filterLabel}>Product</label>
              <select style={filterSelect} value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
                {productOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <ExportButton onClick={exportExcel} disabled={lost.length === 0} themeG={themeG} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {statCards.map((c) => (
              <div key={c.label} style={statCardStyle(themeG)}>
                <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{c.label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: c.accent, fontFamily: "'Space Grotesk', " + FONT }}>{c.value}</p>
              </div>
            ))}
          </div>

          <div style={card}>
            {monthly.length === 0 ? (
              <p style={{ fontSize: 13, color: themeG.textSub, margin: 0 }}>No sales lost — nothing cancelled. 🎉</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Month", "Cancelled Orders", "Value Lost"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {monthly.map((m) => (
                      <tr key={m.month} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                        <td style={td}>{m.month}</td>
                        <td style={td}>{m.count}</td>
                        <td style={{ ...td, fontWeight: 700, color: "#B23A3A" }}>{fmtAmt(m.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${themeG.border}` }}>
                      <td style={{ ...td, fontWeight: 800 }}>Total</td>
                      <td style={{ ...td, fontWeight: 800 }}>{lost.length}</td>
                      <td style={{ ...td, fontWeight: 800, color: "#B23A3A" }}>{fmtAmt(totalValueLost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: "transparent", color: themeG.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
              >
                Cancel
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: themeG.textMain, fontFamily: FONT }}>Reset the product filter on this report?</span>
                <button onClick={resetFilters} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#B23A3A", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Yes</button>
                <button onClick={() => setShowCancelConfirm(false)} style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${themeG.border}`, background: "transparent", color: themeG.textMain, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>No</button>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}