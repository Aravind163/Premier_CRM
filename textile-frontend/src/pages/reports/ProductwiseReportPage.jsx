// src/pages/reports/ProductWiseReportPage.jsx
//
// Report 4 of 6. Per-product performance filtered by Product Type and
// Shade No, showing Received (stock on hand) / Allocated (approved or
// dispatched order qty) / Pending (pending order qty) per product, with
// a grand total row. Built from /orders and /products.
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../ThemeContext";
import Layout from "../../components/Layout";
import { getG } from "../../theme";
import API from "../../services/api";
import { exportReportToExcel } from "../../utils/excelIO";
import {
  FONT, ExportButton, PageHeading,
  cardStyle, errorBoxStyle, statCardStyle, todayStamp,
} from "./shared";

const PRODUCT_WISE_COLUMNS = [
  { key: "Name", header: "Product Name" }, { key: "Type", header: "Type" },
  { key: "Received", header: "Received" }, { key: "Allocated", header: "Allocated" },
  { key: "Pending", header: "Pending" },
];

const DUMMY_SHADE_NOS = ["101", "102", "103", "104", "105", "106"];
function dummyShadeNo(product, i) {
  const num = product.ShadeNo || DUMMY_SHADE_NOS[i % DUMMY_SHADE_NOS.length];
  return `SHADE ${num}`;
}

const ALLOCATED_STATUSES = ["approved", "dispatched", "completed"];
const PENDING_STATUSES = ["pending"];

export default function ProductWiseReportPage() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [typeFilter, setTypeFilter] = useState("All");
  const [shadeFilter, setShadeFilter] = useState("All");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [orderRes, productRes] = await Promise.all([API.get("/orders"), API.get("/products")]);
        setOrders(orderRes.data || []);
        setProducts(productRes.data || []);
      } catch {
        setError("Failed to load product-wise report data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allRows = useMemo(() => {
    const byCode = {};
    products.forEach((p, i) => {
      byCode[p.Code] = {
        code: p.Code,
        name: p.Name,
        type: p.SubType || p.Type || "—",
        shadeNo: dummyShadeNo(p, i),
        received: parseInt(p.Quantity) || 0,
        allocated: 0,
        pending: 0,
      };
    });
    orders.forEach((o) => {
      const code = o.product?.Code || o.Product;
      if (!byCode[code]) return;
      const qty = parseInt(o.Quantity) || 0;
      const status = (o.Status || "").toLowerCase();
      if (ALLOCATED_STATUSES.includes(status)) byCode[code].allocated += qty;
      else if (PENDING_STATUSES.includes(status)) byCode[code].pending += qty;
    });
    return Object.values(byCode).sort((a, b) => b.received - a.received);
  }, [products, orders]);

  const typeOptions = useMemo(
    () => ["All", ...Array.from(new Set(allRows.map((r) => r.type).filter(Boolean))).sort()],
    [allRows]
  );
  const shadeOptions = useMemo(
    () => ["All", ...Array.from(new Set(allRows.map((r) => r.shadeNo).filter(Boolean))).sort()],
    [allRows]
  );

  const rows = useMemo(
    () =>
      allRows
        .filter((r) => typeFilter === "All" || r.type === typeFilter)
        .filter((r) => shadeFilter === "All" || r.shadeNo === shadeFilter),
    [allRows, typeFilter, shadeFilter]
  );

  const totals = rows.reduce(
    (acc, r) => ({
      received: acc.received + r.received,
      allocated: acc.allocated + r.allocated,
      pending: acc.pending + r.pending,
    }),
    { received: 0, allocated: 0, pending: 0 }
  );

  const statCards = [
    { label: "Products Shown", value: rows.length, accent: "#2E7A72" },
    { label: "Total Received", value: totals.received.toLocaleString(), accent: themeG.accent },
    { label: "Total Allocated", value: totals.allocated.toLocaleString(), accent: "#5B9BD9" },
    { label: "Total Pending", value: totals.pending.toLocaleString(), accent: "#B23A3A" },
  ];

  const resetFilters = () => {
    setTypeFilter("All");
    setShadeFilter("All");
    setShowCancelConfirm(false);
  };

  const exportExcel = () => {
    exportReportToExcel({
      reportTitle: "Product Wise Report",
      filename: `product-wise-report-${todayStamp()}`,
      stats: statCards.map(({ label, value }) => ({ label, value })),
      breakdowns: [],
      tables: [
        {
          title: "Product Wise — Received / Allocated / Pending",
          columns: PRODUCT_WISE_COLUMNS,
          rows: rows.map((r) => ({
            Name: r.name, Type: r.type, Received: r.received, Allocated: r.allocated, Pending: r.pending,
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
      <PageHeading themeG={themeG} title="Product Wise Report" subtitle="Received, allocated, and pending quantity — filterable by product type and shade no." />

      {loading ? (
        <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading report…</p>
      ) : (
        <>
          {error && <div style={errorBoxStyle}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                <label style={filterLabel}>Product Type</label>
                <select style={filterSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={filterLabel}>Shade No</label>
                <select style={filterSelect} value={shadeFilter} onChange={(e) => setShadeFilter(e.target.value)}>
                  {shadeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <ExportButton onClick={exportExcel} disabled={rows.length === 0} themeG={themeG} />
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
            {rows.length === 0 ? (
              <p style={{ fontSize: 13, color: themeG.textSub, margin: 0 }}>No products match the current filters.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Product Name", "Type", "Received", "Allocated", "Pending"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                        <td style={td}>{r.name}</td>
                        <td style={td}>{r.type}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{r.received.toLocaleString()}</td>
                        <td style={{ ...td, color: "#5B9BD9", fontWeight: 700 }}>{r.allocated.toLocaleString()}</td>
                        <td style={{ ...td, color: "#B23A3A", fontWeight: 700 }}>{r.pending.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${themeG.border}` }}>
                      <td style={{ ...td, fontWeight: 800 }}>Total</td>
                      <td style={td} />
                      <td style={{ ...td, fontWeight: 800 }}>{totals.received.toLocaleString()}</td>
                      <td style={{ ...td, fontWeight: 800, color: "#5B9BD9" }}>{totals.allocated.toLocaleString()}</td>
                      <td style={{ ...td, fontWeight: 800, color: "#B23A3A" }}>{totals.pending.toLocaleString()}</td>
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