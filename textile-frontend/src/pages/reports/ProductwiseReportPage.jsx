// src/pages/reports/ProductWiseReportPage.jsx
//
// Report 4 of 6. Per-product performance filtered by Product Type and
// Shade No, showing:
//   - Received  = available stock on hand right now (Product.Quantity).
//   - Allocated = however much every customer has currently ordered for
//     that product, added up (every order still "live" — pending /
//     approved / processing — counts; dispatched/delivered/cancelled
//     orders don't, since that stock has already moved or the order fell
//     through).
//   - Pending   = what's left of the available stock once that ordered
//     quantity is set aside (Received − Allocated, floored at 0) — i.e.
//     the stock still free to be allotted to someone.
// Plus Sort No / Shade No per product, with a grand total row. Built from
// /orders and /products.
//
// CHANGES IN THIS VERSION:
//  - Added a Search bar (same pattern/style as the other reports),
//    matching against Product Name, Type, Sort No, and Shade No.
//  - Added an S.No column at the very start of the table (and export),
//    ahead of Sort No.
//  - Removed the bottom "Cancel" / reset-filters confirmation control.
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
  { key: "SNo", header: "S.No" }, { key: "SortNo", header: "Sort No" },
  { key: "ShadeNo", header: "Shade No" },
  { key: "Name", header: "Product Name" }, { key: "Type", header: "Type" },
  { key: "Received", header: "Received" }, { key: "Allocated", header: "Allocated" },
  { key: "Pending", header: "Pending" },
];

const DUMMY_SHADE_NOS = ["101", "102", "103", "104", "105", "106"];
function dummyShadeNo(product, i) {
  const num = product.ShadeNo || DUMMY_SHADE_NOS[i % DUMMY_SHADE_NOS.length];
  return `SHADE ${num}`;
}

// Orders still "live" — this is the same active-demand definition used
// across the rest of the CRM (Marketing Review, Allocation) — count
// towards a product's Allocated total. Dispatched/delivered orders have
// already left, and cancelled ones never happened, so neither ties up
// available stock any more.
const ACTIVE_ORDER_STATUSES = ["pending", "approved", "processing"];

// Month filter — same "MMM YYYY" convention used on the Sales Loss report,
// built off each order's CreatedAt.
function monthKey(dateStr) {
  const d = dateStr ? new Date(dateStr) : null;
  if (!d || isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function monthSortValue(dateStr) {
  const d = dateStr ? new Date(dateStr) : null;
  return d && !isNaN(d.getTime()) ? d.getFullYear() * 12 + d.getMonth() : -1;
}

export default function ProductWiseReportPage() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [typeFilter, setTypeFilter] = useState("All");
  const [shadeFilter, setShadeFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All"); // "All" = every month's orders combined
  const [search, setSearch] = useState("");

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

  // Every distinct month that has at least one order, oldest → newest, so
  // the Month dropdown can jump straight to any of them — "All" (the
  // default) keeps every month's orders combined, same as before.
  const monthOptions = useMemo(() => {
    const seen = new Map();
    orders.forEach((o) => {
      const key = monthKey(o.CreatedAt);
      if (!seen.has(key)) seen.set(key, monthSortValue(o.CreatedAt));
    });
    const months = Array.from(seen.entries()).sort((a, b) => a[1] - b[1]).map(([key]) => key);
    return ["All", ...months];
  }, [orders]);

  // Orders scoped to the selected month (or every order, if "All").
  const monthOrders = useMemo(
    () => (monthFilter === "All" ? orders : orders.filter((o) => monthKey(o.CreatedAt) === monthFilter)),
    [orders, monthFilter]
  );

  const allRows = useMemo(() => {
    const byCode = {};
    products.forEach((p, i) => {
      byCode[p.Code] = {
        code: p.Code,
        name: p.Name,
        type: p.SubType || p.Type || "—",
        sortNo: p.Code || "—",
        shadeNo: dummyShadeNo(p, i),
        received: parseInt(p.Quantity) || 0, // available stock on hand
        allocated: 0,
        pending: 0,
      };
    });
    monthOrders.forEach((o) => {
      const code = o.product?.Code || o.Product;
      if (!byCode[code]) return;
      const qty = parseInt(o.Quantity) || 0;
      const status = (o.Status || "").toLowerCase();
      // Allocated = total quantity every customer currently has on order
      // for this product (within the selected month), added up.
      if (ACTIVE_ORDER_STATUSES.includes(status)) byCode[code].allocated += qty;
    });
    Object.values(byCode).forEach((r) => {
      // Pending = available stock still free once the ordered quantity is
      // set aside — never shown negative (0 means fully committed/short).
      r.pending = Math.max(0, r.received - r.allocated);
    });
    return Object.values(byCode).sort((a, b) => b.received - a.received);
  }, [products, monthOrders]);

  const typeOptions = useMemo(
    () => ["All", ...Array.from(new Set(allRows.map((r) => r.type).filter(Boolean))).sort()],
    [allRows]
  );
  const shadeOptions = useMemo(
    () => ["All", ...Array.from(new Set(allRows.map((r) => r.shadeNo).filter(Boolean))).sort()],
    [allRows]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((r) => typeFilter === "All" || r.type === typeFilter)
      .filter((r) => shadeFilter === "All" || r.shadeNo === shadeFilter)
      .filter((r) => {
        if (!q) return true;
        return [r.name, r.type, r.sortNo, r.shadeNo]
          .some((v) => String(v ?? "").toLowerCase().includes(q));
      });
  }, [allRows, typeFilter, shadeFilter, search]);

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
          rows: rows.map((r, i) => ({
            SNo: i + 1, SortNo: r.sortNo, ShadeNo: r.shadeNo, Name: r.name, Type: r.type,
            Received: r.received, Allocated: r.allocated, Pending: r.pending,
          })),
        },
      ],
    });
  };

  const card = cardStyle(themeG);
  // Table header — sticky (so it stays put while the body scrolls inside
  // its own inner scrollbar below) and blue, as asked.
  const th = {
    textAlign: "left", fontSize: 11, color: "#EAF2FA", padding: "10px 12px",
    textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700,
    background: "linear-gradient(180deg, #1F5C99, #164672)",
    position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap",
  };
  const td = { padding: "10px 12px", fontSize: 13, color: themeG.textMain };
  // Total row — sticky at the bottom of the inner-scroll box, same idea as
  // the sticky thead at the top, so it never scrolls out of view.
  const totalTd = {
    ...td,
    position: "sticky",
    bottom: 0,
    zIndex: 2,
    background: isDark ? "#0F2138" : "#EAF2FA",
  };
  const filterSelect = { padding: "9px 12px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none", minWidth: 160 };
  const filterLabel = { fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" };
  const searchInput = { padding: "9px 12px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none", minWidth: 240 };

  return (
    <Layout pageTitle="Reports">
      <PageHeading themeG={themeG} title="Product Wise Pending Allocation Report" subtitle="Received, allocated, and pending quantity — filterable by product type and shade no." />

      {loading ? (
        <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading report…</p>
      ) : (
        <>
          {error && <div style={errorBoxStyle}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={filterLabel}>Search</label>
                <input
                  style={searchInput}
                  placeholder="Product name, type, sort no, shade no…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
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
              <div>
                <label style={filterLabel}>Month</label>
                <select style={filterSelect} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                  {monthOptions.map((m) => <option key={m} value={m}>{m === "All" ? "All Months" : m}</option>)}
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
              // Inner scrollbar: only ~10 products are visible at once,
              // the rest scroll inside this box — the header row above
              // stays pinned (sticky) the whole time.
              <div style={{ overflow: "auto", maxHeight: 460 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["S.No", "Sort No", "Shade No", "Product Name", "Type", "Received", "Allocated", "Pending"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.code} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}>{r.sortNo}</td>
                        <td style={td}>{r.shadeNo}</td>
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
                      <td style={{ ...totalTd, fontWeight: 800 }}>Total</td>
                      <td style={totalTd} />
                      <td style={totalTd} />
                      <td style={totalTd} />
                      <td style={{ ...totalTd, fontWeight: 800 }}>{totals.received.toLocaleString()}</td>
                      <td style={{ ...totalTd, fontWeight: 800, color: "#5B9BD9" }}>{totals.allocated.toLocaleString()}</td>
                      <td style={{ ...totalTd, fontWeight: 800, color: "#B23A3A" }}>{totals.pending.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}