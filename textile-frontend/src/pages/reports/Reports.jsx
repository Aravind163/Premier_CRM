// src/pages/reports/Reports.jsx
//
// One Reports page, three sub-pages selected by pill tabs:
//   1. Enquiry Order Report — the Order Enquiry pipeline (pending →
//      assigned → approved/declined), conversion rate, breakdowns.
//   2. Overdue Report       — same data that powers the Credit Limit
//      page, presented as a report.
//   3. Data Report          — the original Products / Orders / Employees
//      reports, now living together behind one inner pill toggle instead
//      of three separate sidebar links.
//
// No charts/graphs anywhere on this page by design — every breakdown is
// a plain list of "label — count" rows inside a bordered box, and every
// sub-page has its own Excel download button next to its filters.
//
// Every export button downloads the FULL page content — stat cards,
// breakdown boxes, and the underlying table — via exportReportToExcel,
// not just the raw table rows.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../ThemeContext";
import Layout from "../../components/Layout";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";
import { exportReportToExcel } from "../../utils/excelIO";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ─── shared small pieces ────────────────────────────────────────────────
const cardStyle = (themeG) => ({ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 22, boxShadow: "0 4px 16px rgba(46,122,114,0.05)" });
const cardTitleStyle = (themeG) => ({ fontFamily: FONT, fontSize: 15, fontWeight: 600, margin: "0 0 14px", color: themeG.textMain });
const statCardStyle = (themeG) => ({ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 4px 16px rgba(46,122,114,0.05)" });
const errorBoxStyle = { marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A", fontFamily: FONT };

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

/** A bordered box with a title and a plain list of "label — value" rows.
 *  This replaces every chart/graph on the page — same information, just
 *  as a list instead of a visual. */
function ListBox({ title, items, themeG, emptyText = "No data yet." }) {
  return (
    <div style={cardStyle(themeG)}>
      {title && <h3 style={cardTitleStyle(themeG)}>{title}</h3>}
      {items.length === 0 ? (
        <p style={{ color: themeG.textSub, fontSize: 13, fontFamily: FONT, margin: 0 }}>{emptyText}</p>
      ) : (
        <div>
          {items.map((it, i) => (
            <div
              key={it.label + i}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 2px", borderBottom: i < items.length - 1 ? `1px solid ${themeG.border}` : "none",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: themeG.textMain, fontFamily: FONT, textTransform: "capitalize" }}>
                {it.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color, flexShrink: 0 }} />}
                {it.label}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: it.color || themeG.textMain, fontFamily: FONT, whiteSpace: "nowrap" }}>{it.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportButton({ onClick, disabled, themeG, label = "Export to Excel" }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, border: "none",
        background: disabled ? themeG.border : "#1E7B4D", color: "#fff", fontSize: 13, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT, opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap",
      }}
    >
      <ExcelIcon /> {label}
    </button>
  );
}

function ExcelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="3" x2="8" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const todayStamp = () => new Date().toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════════════════
// 1. ENQUIRY ORDER REPORT
// ═══════════════════════════════════════════════════════════════════════
const ENQUIRY_COLUMNS = [
  { key: "Code", header: "Order No." }, { key: "Customer", header: "Customer" },
  { key: "Product", header: "Product" }, { key: "Status", header: "Status" },
  { key: "AssignedTo", header: "Assigned To" }, { key: "CreatedAt", header: "Created" },
];

function EnquiryOrderReport({ themeG }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/orders", { params: { status_in: "pending,assigned,approved,declined,processing" } });
        setOrders(res.data || []);
      } catch {
        setError("Failed to load enquiry report data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading report…</p>;

  const statusCounts = groupBy(orders, (o) => o.Status);
  const converted = (statusCounts.approved || 0) + (statusCounts.processing || 0);
  const conversionRate = orders.length ? Math.round((converted / orders.length) * 100) : 0;
  const byAssignee = groupBy(orders.filter((o) => o.assignee), (o) => o.assignee?.name || o.assignee?.email || "—");
  const byDate = groupBy(orders, (o) => (o.CreatedAt ? fmtDate(o.CreatedAt) : "—"));
  const byDateSorted = Object.entries(byDate).sort((a, b) => new Date(a[0]) - new Date(b[0]));

  const statCards = [
    { label: "Total Enquiries", value: orders.length, accent: "#2E7A72" },
    { label: "Pending / Assigned", value: (statusCounts.pending || 0) + (statusCounts.assigned || 0), accent: "#8A5A0E" },
    { label: "Conversion Rate", value: `${conversionRate}%`, accent: themeG.accent },
    { label: "Declined", value: statusCounts.declined || 0, accent: "#B23A3A" },
  ];

  const exportExcel = () => {
    exportReportToExcel({
      reportTitle: "Enquiry Order Report",
      filename: `enquiry-order-report-${todayStamp()}`,
      stats: statCards.map(({ label, value }) => ({ label, value })),
      breakdowns: [
        { title: "By Status", items: Object.entries(statusCounts).map(([s, count]) => ({ label: s, value: count })) },
        { title: "By Assigned Staff", items: Object.entries(byAssignee).map(([name, count]) => ({ label: name, value: count })) },
        { title: "Received By Day", items: byDateSorted.map(([day, count]) => ({ label: day, value: count })) },
      ],
      tables: [
        {
          title: "Enquiry Orders",
          columns: ENQUIRY_COLUMNS,
          rows: orders.map((o) => ({
            Code: o.Code, Customer: o.customer?.Name ?? "—", Product: o.product?.Name ?? "—",
            Status: o.Status, AssignedTo: o.assignee?.name || o.assignee?.email || "—",
            CreatedAt: fmtDate(o.CreatedAt),
          })),
        },
      ],
    });
  };

  return (
    <>
      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <ExportButton onClick={exportExcel} disabled={orders.length === 0} themeG={themeG} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {statCards.map((c) => (
          <div key={c.label} style={statCardStyle(themeG)}>
            <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: c.accent, fontFamily: "'Space Grotesk', " + FONT }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        <ListBox
          title="By Status"
          themeG={themeG}
          items={Object.entries(statusCounts).map(([s, count]) => ({ label: s, value: count, color: statusColor(s).color }))}
        />
        <ListBox
          title="By Assigned Staff"
          themeG={themeG}
          items={Object.entries(byAssignee).map(([name, count]) => ({ label: name, value: count }))}
          emptyText="Nothing assigned yet."
        />
        <ListBox
          title="Received By Day"
          themeG={themeG}
          items={byDateSorted.slice(-8).map(([day, count]) => ({ label: day, value: count }))}
        />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 2. OVERDUE REPORT (reuses the Credit Limit data as a report view)
// ═══════════════════════════════════════════════════════════════════════
const OVERDUE_REPORT_COLUMNS = [
  { key: "Customer", header: "Customer" }, { key: "Code", header: "Code" },
  { key: "District", header: "District" }, { key: "Taluk", header: "Taluk" },
  { key: "Outstanding", header: "Outstanding" }, { key: "Order", header: "Order" },
  { key: "BalanceDue", header: "Balance Due" }, { key: "PaymentDueDate", header: "Payment Due Date" },
  { key: "DaysOverdue", header: "Days Overdue" },
];

function OverdueReport({ themeG }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [minDays, setMinDays] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/credit-limit");
        setRows(res.data || []);
      } catch {
        setError("Failed to load overdue report data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => rows.filter((r) => r.maxDaysOverdue >= minDays), [rows, minDays]);
  const totalOutstanding = visible.reduce((s, r) => s + (r.orders?.reduce((os, o) => os + o.balanceDue, 0) || 0), 0);
  const totalOrders = visible.reduce((s, r) => s + (r.orders?.length || 0), 0);
  const over90 = rows.filter((r) => r.maxDaysOverdue >= 90).length;

  const fmtAmt = (a) => `₹${(parseFloat(a) || 0).toLocaleString()}`;

  const filterLabel = minDays === 0 ? "All" : `${minDays}+ days`;

  const exportExcel = () => {
    const data = [];
    visible.forEach((r) => (r.orders || []).forEach((o) => {
      data.push({
        Customer: r.customerName, Code: r.customerCode, District: r.district, Taluk: r.taluk,
        Outstanding: r.outstanding, Order: o.code, BalanceDue: o.balanceDue,
        PaymentDueDate: o.paymentDueDate, DaysOverdue: o.daysOverdue,
      });
    }));

    exportReportToExcel({
      reportTitle: "Overdue Report",
      filename: `overdue-report-${todayStamp()}`,
      stats: [
        { label: "Filter Applied", value: filterLabel },
        { label: "Customers Overdue", value: rows.length },
        { label: "Total Outstanding", value: fmtAmt(totalOutstanding) },
        { label: "Overdue Orders", value: totalOrders },
        { label: "90+ Days", value: over90 },
      ],
      tables: [
        { title: "Overdue Orders", columns: OVERDUE_REPORT_COLUMNS, rows: data },
      ],
    });
  };

  if (loading) return <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading report…</p>;

  const card = cardStyle(themeG), statCard = statCardStyle(themeG);
  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 12px", borderBottom: "1px solid rgba(46,122,114,0.13)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const td = { padding: "10px 12px", fontSize: 13, color: themeG.textMain };

  return (
    <>
      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        {[
          { label: "Customers Overdue", value: rows.length, accent: "#8A5A0E" },
          { label: "Total Outstanding", value: fmtAmt(totalOutstanding), accent: "#B23A3A" },
          { label: "Overdue Orders", value: totalOrders, accent: themeG.accent },
          { label: "90+ Days", value: over90, accent: "#96302F" },
        ].map((c) => (
          <div key={c.label} style={statCard}>
            <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: c.accent, fontFamily: "'Space Grotesk', " + FONT }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[[0, "All"], [30, "30+ days"], [60, "60+ days"], [90, "90+ days"]].map(([days, label]) => (
          <button key={days} onClick={() => setMinDays(days)}
            style={{ padding: "8px 14px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              background: minDays === days ? themeG.accent : themeG.card, color: minDays === days ? "#fff" : themeG.textSub,
              borderColor: minDays === days ? themeG.accent : themeG.border }}>
            {label}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <ExportButton onClick={exportExcel} disabled={visible.length === 0} themeG={themeG} />
        </div>
      </div>

      <div style={card}>
        {visible.length === 0 ? (
          <p style={{ fontSize: 13, color: themeG.textSub, margin: 0 }}>Nobody matches this filter. 🎉</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["Customer", "Area", "Outstanding", "Worst Overdue", "Overdue Orders"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.customerId} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{r.customerName}</div>
                      <div style={{ fontSize: 11, color: themeG.textSub }}>{r.customerCode}</div>
                    </td>
                    <td style={td}>{r.taluk || r.district || "—"}</td>
                    <td style={{ ...td, fontWeight: 700, color: "#B23A3A" }}>{fmtAmt(r.outstanding)}</td>
                    <td style={td}>{r.maxDaysOverdue} day{r.maxDaysOverdue === 1 ? "" : "s"} exceeded</td>
                    <td style={td}>{r.orders?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. DATA REPORT (Products / Orders / Employees — the original 3 pages)
// ═══════════════════════════════════════════════════════════════════════
const LOW_STOCK_THRESHOLD = 50;

const PRODUCT_COLUMNS = [
  { key: "Code", header: "Code" }, { key: "Name", header: "Name" },
  { key: "SubType", header: "Sub-type" }, { key: "Quality", header: "Quality" },
  { key: "Price", header: "Price" }, { key: "Quantity", header: "Quantity" }, { key: "Status", header: "Status" },
];
const LOW_STOCK_COLUMNS = [
  { key: "Code", header: "Code" }, { key: "Name", header: "Name" },
  { key: "Quantity", header: "Quantity" }, { key: "Status", header: "Status" },
];

function DataReportProducts({ themeG }) {
  const navigate = useNavigate();
  const tab = localStorage.getItem("premier_category") || "cloth";
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try { setAllProducts((await API.get("/products")).data); }
      catch { setError("Failed to load product report data."); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p style={{ color: themeG.textSub }}>Loading report…</p>;

  const products = allProducts.filter((p) => p.Category === tab);
  const totalQty = products.reduce((s, p) => s + (parseInt(p.Quantity) || 0), 0);
  const totalValue = products.reduce((s, p) => s + (parseFloat(p.Price) || 0) * (parseInt(p.Quantity) || 0), 0);
  const lowStock = products.filter((p) => p.Quantity <= LOW_STOCK_THRESHOLD);
  const subTypeCounts = groupBy(products, (p) => p.SubType);
  const qualityCounts = groupBy(products, (p) => p.Quality);
  const qualityColor = { premium: "#2E7A72", standard: "#5B9BD9", economy: "#D69426" };

  const exportExcel = () => {
    exportReportToExcel({
      reportTitle: `Product Report (${tab === "cloth" ? "Cloth" : "Yarn"})`,
      filename: `product-report-${tab}-${todayStamp()}`,
      stats: [
        { label: "Total Products", value: products.length },
        { label: "Units in Stock", value: totalQty },
        { label: "Inventory Value", value: `₹${totalValue.toLocaleString()}` },
        { label: "Low Stock Items", value: lowStock.length },
      ],
      breakdowns: [
        { title: "Products by Sub-type", items: Object.entries(subTypeCounts).map(([t, count]) => ({ label: t, value: count })) },
        { title: "Products by Quality Grade", items: Object.entries(qualityCounts).map(([q, count]) => ({ label: q, value: count })) },
      ],
      tables: [
        {
          title: `Low Stock Alert (≤ ${LOW_STOCK_THRESHOLD} units)`,
          columns: LOW_STOCK_COLUMNS,
          rows: lowStock.map((p) => ({ Code: p.Code, Name: p.Name, Quantity: p.Quantity, Status: p.Status })),
        },
        {
          title: `All ${tab === "cloth" ? "Cloth" : "Yarn"} Products`,
          columns: PRODUCT_COLUMNS,
          rows: products.map((p) => ({
            Code: p.Code, Name: p.Name, SubType: p.SubType, Quality: p.Quality,
            Price: p.Price, Quantity: p.Quantity, Status: p.Status,
          })),
        },
      ],
    });
  };

  const card = cardStyle(themeG), cardTitle = cardTitleStyle(themeG), statCard = statCardStyle(themeG);
  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 12px", borderBottom: "1px solid rgba(46,122,114,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 };
  const td = { padding: "11px 12px", fontSize: 13.5, color: themeG.textMain };

  return (
    <>
      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: themeG.card, border: `1px solid ${themeG.border}` }}>
          <span style={{ fontSize: 18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Products</span>
        </div>
        <span style={{ fontSize: 12, color: themeG.accent, cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("/select-category")}>Switch category</span>
        <div style={{ marginLeft: "auto" }}>
          <ExportButton onClick={exportExcel} disabled={products.length === 0} themeG={themeG} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Products", value: products.length, accent: "#2E7A72" },
          { label: "Units in Stock", value: totalQty.toLocaleString(), accent: "#1E4A45" },
          { label: "Inventory Value", value: `₹${totalValue.toLocaleString()}`, accent: "#5B9BD9" },
          { label: "Low Stock Items", value: lowStock.length, accent: lowStock.length > 0 ? "#B23A3A" : "#2E7A72" },
        ].map((c) => (
          <div key={c.label} style={statCard}>
            <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: c.accent }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <ListBox
          title="Products by Sub-type"
          themeG={themeG}
          items={Object.entries(subTypeCounts).map(([t, count]) => ({ label: t, value: count }))}
        />
        <ListBox
          title="Products by Quality Grade"
          themeG={themeG}
          items={Object.entries(qualityCounts).map(([q, count]) => ({ label: q, value: count, color: qualityColor[q] || "#2E7A72" }))}
        />
      </div>

      <div style={card}>
        <h3 style={cardTitle}>Low Stock Alert (≤ {LOW_STOCK_THRESHOLD} units)</h3>
        {lowStock.length === 0 ? (
          <p style={{ fontSize: 13, color: themeG.textSub }}>All products are well-stocked. 🎉</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Code", "Name", "Quantity", "Status"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {lowStock.map((p) => (
                <tr key={p.Id} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                  <td style={td}>{p.Code}</td><td style={td}>{p.Name}</td>
                  <td style={{ ...td, fontWeight: 700, color: "#B23A3A" }}>{p.Quantity}</td><td style={td}>{p.Status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

const ORDER_COLUMNS = [
  { key: "Code", header: "Order No." }, { key: "Customer", header: "Customer" },
  { key: "Product", header: "Product" }, { key: "Quantity", header: "Quantity" },
  { key: "TotalAmount", header: "Total Amount" }, { key: "Status", header: "Status" },
  { key: "PaymentStatus", header: "Payment Status" }, { key: "CreatedAt", header: "Created" },
];

function DataReportOrders({ themeG }) {
  const navigate = useNavigate();
  const tab = localStorage.getItem("premier_category") || "cloth";
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try { setAllOrders((await API.get("/orders")).data); }
      catch { setError("Failed to load order report data."); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p style={{ color: themeG.textSub }}>Loading report…</p>;

  const orders = allOrders.filter((o) => o.Category === tab);
  const statusCounts = groupBy(orders, (o) => o.Status);
  const paymentCounts = groupBy(orders, (o) => o.PaymentStatus);
  const subTypeCounts = groupBy(orders, (o) => o.SubType || "—");
  const totalRevenue = orders.reduce((s, o) => s + (parseFloat(o.TotalAmount) || 0), 0);
  const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;
  const byDate = groupBy(orders, (o) => (o.CreatedAt ? fmtDate(o.CreatedAt) : "—"));
  const byDateSorted = Object.entries(byDate).sort((a, b) => new Date(a[0]) - new Date(b[0]));

  const exportExcel = () => {
    exportReportToExcel({
      reportTitle: `Order Report (${tab === "cloth" ? "Cloth" : "Yarn"})`,
      filename: `order-report-${tab}-${todayStamp()}`,
      stats: [
        { label: "Total Orders", value: orders.length },
        { label: "Total Revenue", value: `₹${totalRevenue.toLocaleString()}` },
        { label: "Avg Order Value", value: `₹${avgOrderValue.toFixed(0)}` },
        { label: "Pending Orders", value: statusCounts.pending || 0 },
      ],
      breakdowns: [
        { title: "Orders by Status", items: Object.entries(statusCounts).map(([s, count]) => ({ label: s, value: count })) },
        { title: "Orders by Payment Status", items: Object.entries(paymentCounts).map(([p, count]) => ({ label: p, value: count })) },
        { title: "By Sub-type", items: Object.entries(subTypeCounts).map(([st, count]) => ({ label: st, value: count })) },
        { title: "Received By Day", items: byDateSorted.map(([day, count]) => ({ label: day, value: count })) },
      ],
      tables: [
        {
          title: `All ${tab === "cloth" ? "Cloth" : "Yarn"} Orders`,
          columns: ORDER_COLUMNS,
          rows: orders.map((o) => ({
            Code: o.Code, Customer: o.customer?.Name ?? "—", Product: o.product?.Name ?? "—",
            Quantity: o.Quantity, TotalAmount: o.TotalAmount, Status: o.Status,
            PaymentStatus: o.PaymentStatus, CreatedAt: fmtDate(o.CreatedAt),
          })),
        },
      ],
    });
  };

  const statCard = statCardStyle(themeG);

  return (
    <>
      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: themeG.card, border: `1px solid ${themeG.border}` }}>
          <span style={{ fontSize: 18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Orders</span>
        </div>
        <span style={{ fontSize: 12, color: themeG.accent, cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("/select-category")}>Switch category</span>
        <div style={{ marginLeft: "auto" }}>
          <ExportButton onClick={exportExcel} disabled={orders.length === 0} themeG={themeG} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Orders", value: orders.length, accent: "#2E7A72" },
          { label: "Total Revenue", value: `₹${totalRevenue.toLocaleString()}`, accent: "#1E4A45" },
          { label: "Avg Order Value", value: `₹${avgOrderValue.toFixed(0)}`, accent: "#5B9BD9" },
          { label: "Pending Orders", value: statusCounts.pending || 0, accent: "#8A5A0E" },
        ].map((c) => (
          <div key={c.label} style={statCard}>
            <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: c.accent, fontFamily: "'Space Grotesk', " + FONT }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <ListBox
          title="Orders by Status"
          themeG={themeG}
          items={Object.entries(statusCounts).map(([status, count]) => ({ label: status, value: count, color: statusColor(status).color }))}
        />
        <ListBox
          title="Orders by Payment Status"
          themeG={themeG}
          items={Object.entries(paymentCounts).map(([p, count]) => ({ label: p, value: count, color: statusColor(p === "paid" ? "approved" : p === "unpaid" ? "declined" : "pending").color }))}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <ListBox
          title="By Sub-type"
          themeG={themeG}
          items={Object.entries(subTypeCounts).map(([st, count]) => ({ label: st, value: count }))}
          emptyText="No orders yet."
        />
        <ListBox
          title="Received By Day"
          themeG={themeG}
          items={byDateSorted.slice(-8).map(([day, count]) => ({ label: day, value: count }))}
        />
      </div>
    </>
  );
}

const EMPLOYEE_COLUMNS = [
  { key: "Name", header: "Name" }, { key: "Designation", header: "Designation" },
  { key: "District", header: "District" }, { key: "Status", header: "Status" },
  { key: "JoinedAt", header: "Joined" },
];

function DataReportEmployees({ themeG }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try { setEmployees((await API.get("/employees")).data); }
      catch { setError("Failed to load employee report data."); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading report…</p>;

  const statusCounts = groupBy(employees, (e) => e.Status);
  const districtCounts = groupBy(employees, (e) => e.District);
  const designationCounts = groupBy(employees, (e) => e.Designation);

  const exportExcel = () => {
    exportReportToExcel({
      reportTitle: "Employee Report",
      filename: `employee-report-${todayStamp()}`,
      stats: [
        { label: "Total Employees", value: employees.length },
        { label: "Approved", value: statusCounts.approved || 0 },
        { label: "Pending Approval", value: statusCounts.pending || 0 },
      ],
      breakdowns: [
        { title: "By Status", items: Object.entries(statusCounts).map(([s, count]) => ({ label: s, value: count })) },
        { title: "By District", items: Object.entries(districtCounts).map(([d, count]) => ({ label: d, value: count })) },
        { title: "By Designation", items: Object.entries(designationCounts).map(([d, count]) => ({ label: d, value: count })) },
      ],
      tables: [
        {
          title: "All Employees",
          columns: EMPLOYEE_COLUMNS,
          rows: employees.map((e) => ({
            Name: e.Name, Designation: e.Designation, District: e.District,
            Status: e.Status, JoinedAt: fmtDate(e.JoinedAt),
          })),
        },
      ],
    });
  };

  const statCard = statCardStyle(themeG);

  return (
    <>
      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <ExportButton onClick={exportExcel} disabled={employees.length === 0} themeG={themeG} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Employees", value: employees.length, accent: "#2E7A72" },
          { label: "Approved", value: statusCounts.approved || 0, accent: themeG.accent },
          { label: "Pending Approval", value: statusCounts.pending || 0, accent: "#8A5A0E" },
        ].map((c) => (
          <div key={c.label} style={statCard}>
            <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: c.accent, fontFamily: "'Space Grotesk', " + FONT }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        <ListBox
          title="By Status"
          themeG={themeG}
          items={Object.entries(statusCounts).map(([s, count]) => ({ label: s, value: count, color: statusColor(s).color }))}
        />
        <ListBox
          title="By District"
          themeG={themeG}
          items={Object.entries(districtCounts).map(([d, count]) => ({ label: d, value: count }))}
        />
        <ListBox
          title="By Designation"
          themeG={themeG}
          items={Object.entries(designationCounts).map(([d, count]) => ({ label: d, value: count }))}
        />
      </div>
    </>
  );
}

function DataReport({ themeG }) {
  const [pill, setPill] = useState("orders"); // products | orders | employees
  const pillBtn = (active) => ({
    padding: "8px 16px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
    background: active ? themeG.accent : themeG.card, color: active ? "#fff" : themeG.textSub, borderColor: active ? themeG.accent : themeG.border,
  });

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["products", "Products"], ["orders", "Orders"], ["employees", "Employees"]].map(([key, label]) => (
          <button key={key} onClick={() => setPill(key)} style={pillBtn(pill === key)}>{label}</button>
        ))}
      </div>
      {pill === "products" && <DataReportProducts themeG={themeG} />}
      {pill === "orders" && <DataReportOrders themeG={themeG} />}
      {pill === "employees" && <DataReportEmployees themeG={themeG} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PAGE SHELL
// ═══════════════════════════════════════════════════════════════════════
export default function Reports() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const [section, setSection] = useState("data"); // enquiry | overdue | data

  const tabBtn = (active) => ({
    padding: "10px 18px", borderRadius: 10, border: `1px solid ${themeG.border}`, cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
    background: active ? themeG.accent : themeG.card, color: active ? "#fff" : themeG.textMain,
  });

  return (
    <Layout pageTitle="Reports">
      <h1 style={{ fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" }}>Reports</h1>
      <p style={{ fontSize: 13, color: themeG.textSub, margin: "0 0 20px" }}>Enquiry pipeline, overdue payments, and the underlying products/orders/employees data — all in one place.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <button style={tabBtn(section === "enquiry")} onClick={() => setSection("enquiry")}>Enquiry Order Report</button>
        <button style={tabBtn(section === "overdue")} onClick={() => setSection("overdue")}>Overdue Report</button>
        <button style={tabBtn(section === "data")} onClick={() => setSection("data")}>Data Report</button>
      </div>

      {section === "enquiry" && <EnquiryOrderReport themeG={themeG} />}
      {section === "overdue" && <OverdueReport themeG={themeG} />}
      {section === "data" && <DataReport themeG={themeG} />}
    </Layout>
  );
}