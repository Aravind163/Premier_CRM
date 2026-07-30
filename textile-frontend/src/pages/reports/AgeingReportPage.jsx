// src/pages/reports/AgeingReportPage.jsx
//
// Report 5 of 6. Ageing of overdue balances, filterable by Customer,
// Product Name, and Product Type — bucketed into Below 2 / 2–5 / 5–10 /
// 10–30 / More than 30 days, with a Total row. Same /credit-limit data
// as the Overdue Report.
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

const AGEING_BUCKETS = [
  { key: "lt2", label: "Below 2 days", test: (d) => d < 2 },
  { key: "2-5", label: "2–5 days", test: (d) => d >= 2 && d <= 5 },
  { key: "5-10", label: "5–10 days", test: (d) => d > 5 && d <= 10 },
  { key: "10-30", label: "10–30 days", test: (d) => d > 10 && d <= 30 },
  { key: "30+", label: "More than 30 days", test: (d) => d > 30 },
];
const bucketFor = (days) => AGEING_BUCKETS.find((b) => b.test(days))?.label || "—";
const bucketAccent = {
  "Below 2 days": "#2E7A72", "2–5 days": "#5B9BD9", "5–10 days": "#8A5A0E",
  "10–30 days": "#D69426", "More than 30 days": "#B23A3A",
};

const AGEING_COLUMNS = [
  { key: "Customer", header: "Customer" }, { key: "Product", header: "Product" },
  { key: "ProductType", header: "Product Type" }, { key: "Code", header: "Order Code" },
  { key: "BalanceDue", header: "Balance Due" }, { key: "DaysOverdue", header: "Days Overdue" },
  { key: "Bucket", header: "Ageing Bucket" },
];

export default function AgeingReportPage() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [customerFilter, setCustomerFilter] = useState("All");
  const [productFilter, setProductFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/credit-limit");
        setRows(res.data || []);
      } catch {
        setError("Failed to load ageing report data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allFlatOrders = useMemo(() => {
    const out = [];
    rows.forEach((r) =>
      (r.orders || []).forEach((o) => {
        if (o.daysOverdue >= 1) {
          out.push({
            customer: r.customerName,
            code: o.code,
            balanceDue: o.balanceDue,
            paymentDueDate: o.paymentDueDate,
            daysOverdue: o.daysOverdue,
            bucket: bucketFor(o.daysOverdue),
            product: o.product?.Name || o.productName || o.code,
            productType: o.product?.SubType || o.product?.Type || o.productType || "—",
          });
        }
      })
    );
    return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [rows]);

  const customerOptions = useMemo(
    () => ["All", ...Array.from(new Set(allFlatOrders.map((o) => o.customer).filter(Boolean))).sort()],
    [allFlatOrders]
  );
  const productOptions = useMemo(
    () => ["All", ...Array.from(new Set(allFlatOrders.map((o) => o.product).filter(Boolean))).sort()],
    [allFlatOrders]
  );
  const typeOptions = useMemo(
    () => ["All", ...Array.from(new Set(allFlatOrders.map((o) => o.productType).filter(Boolean))).sort()],
    [allFlatOrders]
  );

  const flatOrders = useMemo(
    () =>
      allFlatOrders
        .filter((o) => customerFilter === "All" || o.customer === customerFilter)
        .filter((o) => productFilter === "All" || o.product === productFilter)
        .filter((o) => typeFilter === "All" || o.productType === typeFilter),
    [allFlatOrders, customerFilter, productFilter, typeFilter]
  );

  const bucketCounts = AGEING_BUCKETS.reduce((acc, b) => {
    acc[b.label] = flatOrders.filter((o) => o.bucket === b.label).length;
    return acc;
  }, {});
  const bucketValue = AGEING_BUCKETS.reduce((acc, b) => {
    acc[b.label] = flatOrders.filter((o) => o.bucket === b.label).reduce((s, o) => s + (o.balanceDue || 0), 0);
    return acc;
  }, {});
  const totalCount = flatOrders.length;
  const totalValue = flatOrders.reduce((s, o) => s + (o.balanceDue || 0), 0);

  const statCards = [
    { label: "Overdue Orders", value: totalCount, accent: themeG.accent },
    { label: "Below 2 Days", value: bucketCounts["Below 2 days"] || 0, accent: "#2E7A72" },
    { label: "More Than 30 Days", value: bucketCounts["More than 30 days"] || 0, accent: "#B23A3A" },
    { label: "Total Value Overdue", value: fmtAmt(totalValue), accent: "#8A5A0E" },
  ];

  const resetFilters = () => {
    setCustomerFilter("All");
    setProductFilter("All");
    setTypeFilter("All");
    setShowCancelConfirm(false);
  };

  const exportExcel = () => {
    exportReportToExcel({
      reportTitle: "Ageing Report",
      filename: `ageing-report-${todayStamp()}`,
      stats: statCards.map(({ label, value }) => ({ label, value })),
      breakdowns: [
        { title: "Orders by Ageing Bucket", items: [...AGEING_BUCKETS.map((b) => ({ label: b.label, value: bucketCounts[b.label] || 0 })), { label: "Total", value: totalCount }] },
        { title: "Value by Ageing Bucket", items: [...AGEING_BUCKETS.map((b) => ({ label: b.label, value: fmtAmt(bucketValue[b.label] || 0) })), { label: "Total", value: fmtAmt(totalValue) }] },
      ],
      tables: [
        {
          title: "Overdue Orders — Ageing Detail",
          columns: AGEING_COLUMNS,
          rows: flatOrders.map((o) => ({
            Customer: o.customer, Product: o.product, ProductType: o.productType, Code: o.code,
            BalanceDue: fmtAmt(o.balanceDue), DaysOverdue: o.daysOverdue, Bucket: o.bucket,
          })),
        },
      ],
    });
  };

  const card = cardStyle(themeG);
  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 12px", borderBottom: "1px solid rgba(46,122,114,0.13)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const td = { padding: "10px 12px", fontSize: 13, color: themeG.textMain };
  const filterSelect = { padding: "9px 12px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none", minWidth: 160 };
  const filterLabel = { fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" };

  return (
    <Layout pageTitle="Reports">
      <PageHeading themeG={themeG} title="Ageing Report" subtitle="Overdue balances by customer, product, and product type — bucketed by days overdue." />

      {loading ? (
        <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading report…</p>
      ) : (
        <>
          {error && <div style={errorBoxStyle}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                <label style={filterLabel}>Customer Name</label>
                <select style={filterSelect} value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
                  {customerOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={filterLabel}>Product Name</label>
                <select style={filterSelect} value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
                  {productOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={filterLabel}>Product Type</label>
                <select style={filterSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <ExportButton onClick={exportExcel} disabled={flatOrders.length === 0} themeG={themeG} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {statCards.map((c) => (
              <div key={c.label} style={statCardStyle(themeG)}>
                <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{c.label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: c.accent, fontFamily: "'Space Grotesk', " + FONT }}>{c.value}</p>
              </div>
            ))}
          </div>

          <div style={{ ...card, marginBottom: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: "0 0 14px", fontFamily: FONT }}>Ageing Buckets</p>
            {flatOrders.length === 0 ? (
              <p style={{ fontSize: 13, color: themeG.textSub, margin: 0 }}>No overdue orders match the current filters.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Bucket", "Orders", "Value"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {AGEING_BUCKETS.map((b) => (
                    <tr key={b.key} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                      <td style={{ ...td, fontWeight: 700, color: bucketAccent[b.label] }}>{b.label}</td>
                      <td style={td}>{bucketCounts[b.label] || 0}</td>
                      <td style={td}>{fmtAmt(bucketValue[b.label] || 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${themeG.border}` }}>
                    <td style={{ ...td, fontWeight: 800 }}>Total</td>
                    <td style={{ ...td, fontWeight: 800 }}>{totalCount}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmtAmt(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div style={card}>
            {flatOrders.length === 0 ? (
              <p style={{ fontSize: 13, color: themeG.textSub, margin: 0 }}>Nothing overdue right now. 🎉</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Customer", "Product", "Product Type", "Order Code", "Balance Due", "Days Overdue", "Bucket"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {flatOrders.map((o, i) => (
                      <tr key={o.code + i} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                        <td style={td}>{o.customer}</td>
                        <td style={td}>{o.product}</td>
                        <td style={td}>{o.productType}</td>
                        <td style={td}>{o.code}</td>
                        <td style={{ ...td, fontWeight: 700, color: "#B23A3A" }}>{fmtAmt(o.balanceDue)}</td>
                        <td style={td}>{o.daysOverdue}</td>
                        <td style={{ ...td, fontWeight: 700, color: bucketAccent[o.bucket] || themeG.textMain }}>{o.bucket}</td>
                      </tr>
                    ))}
                  </tbody>
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
                <span style={{ fontSize: 13, color: themeG.textMain, fontFamily: FONT }}>Reset all filters on this report?</span>
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