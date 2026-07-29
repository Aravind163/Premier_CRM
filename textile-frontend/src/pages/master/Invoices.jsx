// src/pages/master/Invoices.jsx
//
// Invoice pipeline (O2C Step 11). Tabs follow an order all the way through
// to billing:
//   1. Pending Invoice    — enquiries/orders awaiting approval (Status = pending)
//   2. Approved Invoice   — approved, not yet dispatched (Status = approved)
//   3. Dispatched Invoice — TWO groups live here:
//        a) dispatched orders with no invoice yet ("Generate Invoice" lives here)
//        b) invoices that have been marked PAID — once an ERP invoice is paid,
//           it moves out of "ERP Invoice" and lives here from then on, as a
//           read-only completed record.
//   4. ERP Invoice        — invoices issued but NOT YET paid (Status = issued).
//                            As soon as one is marked Paid it disappears from
//                            here and shows up under Dispatched Invoice instead.
//   5. All                — every stage above merged into one worklist
//
// A single search bar (top of the table) filters whichever tab is open by
// customer name or invoice/order number, plus a date filter — Today / This
// Week / This Month / a From–To date range — checked against each row's
// most relevant date (created, dispatched, or issued).
//
// An "Export to Excel" button downloads whatever rows are currently visible
// in the open tab (i.e. respects the active search + date filter).
import { useEffect, useMemo, useState } from "react";
import { exportRowsToExcel } from "../../utils/excelIO";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ── date helpers for the search bar's date filter ──
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d) => { // week starts Monday
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon=0 .. Sun=6
  x.setDate(x.getDate() - day);
  return x;
};
const startOfMonth = (d) => { const x = startOfDay(d); x.setDate(1); return x; };

function matchesDateFilter(dateVal, dateFilter, fromDate, toDate) {
  if (dateFilter === "all") return true;
  if (!dateVal) return false;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  if (dateFilter === "today") return startOfDay(d).getTime() === startOfDay(now).getTime();
  if (dateFilter === "week") return d >= startOfWeek(now) && d <= now;
  if (dateFilter === "month") return d >= startOfMonth(now) && d <= now;
  if (dateFilter === "custom") {
    if (!fromDate && !toDate) return true;
    const dd = startOfDay(d).getTime();
    if (fromDate) {
      const from = startOfDay(new Date(fromDate + "T00:00:00")).getTime();
      if (dd < from) return false;
    }
    if (toDate) {
      const to = startOfDay(new Date(toDate + "T00:00:00")).getTime();
      if (dd > to) return false;
    }
    return true;
  }
  return true;
}

// ── Vivid, high-contrast colors per status — deliberately more saturated
// than the app-wide statusColor() so this table's status column is easy
// to scan at a glance and each state reads as visually distinct. ──
const VIVID_STATUS = {
  pending:    { bg: "#FFF1C2", color: "#946200", border: "#F0B429" },
  approved:   { bg: "#D6E9FF", color: "#0B4EA2", border: "#3B82F6" },
  assigned:   { bg: "#E4DBFB", color: "#5B21B6", border: "#8B5CF6" },
  dispatched: { bg: "#E9DBFB", color: "#6D28D9", border: "#A855F7" },
  issued:     { bg: "#CFF7FA", color: "#0E7490", border: "#22D3EE" },
  paid:       { bg: "#CFF9E1", color: "#047857", border: "#10B981" },
  cancelled:  { bg: "#FFDCDC", color: "#B91C1C", border: "#EF4444" },
  declined:   { bg: "#FFDCDC", color: "#B91C1C", border: "#EF4444" },
  rejected:   { bg: "#FFDCDC", color: "#B91C1C", border: "#EF4444" },
};
const vividFor = (status) => VIVID_STATUS[(status || "").toLowerCase()] || { bg: "#E7EBF0", color: "#455165", border: "#C5CDD8" };

const STAGE_META = {
  pending:    { label: "Pending" },
  approved:   { label: "Approved" },
  dispatched: { label: "Dispatched" },
  invoice:    { label: "Invoice" },
};

const StageBadge = ({ stage, overrideStatus }) => {
  const m = STAGE_META[stage] || STAGE_META.pending;
  const v = vividFor(overrideStatus || (stage === "invoice" ? "issued" : stage));
  return (
    <span style={{ background: v.bg, color: v.color, border: `1.5px solid ${v.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
      {m.label}
    </span>
  );
};

const StatusPill = ({ status }) => {
  const v = vividFor(status);
  return (
    <span style={{ background: v.bg, color: v.color, border: `1.5px solid ${v.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: "capitalize" }}>
      {status}
    </span>
  );
};

export default function Invoices() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const role = localStorage.getItem("role") || "";
  const canAct = ["admin", "system_admin"].includes(role);
  const S = buildStyles(themeG);

  const [tab, setTab] = useState("dispatched"); // pending | approved | dispatched | invoices | all
  const [pendingOrders, setPendingOrders] = useState([]);
  const [approvedOrders, setApprovedOrders] = useState([]);
  const [dispatchedOrders, setDispatchedOrders] = useState([]); // eligible for invoicing (no invoice yet)
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  // ── Search + date filter (shared across every tab) ──
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all"); // all | today | week | month | custom
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [pend, appr, disp, inv] = await Promise.all([
        API.get("/orders", { params: { status: "pending" } }),
        API.get("/orders", { params: { status: "approved" } }),
        API.get("/invoices/eligible-orders"),
        API.get("/invoices"),
      ]);
      setPendingOrders(pend.data);
      setApprovedOrders(appr.data);
      setDispatchedOrders(disp.data);
      setInvoices(inv.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const generate = async (orderId) => {
    setBusyId(orderId); setError("");
    try {
      await API.post("/invoices", { orderId });
      await load();
      setTab("invoices");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to generate invoice.");
    } finally {
      setBusyId(null);
    }
  };

  const markPaid = async (id) => {
    setBusyId(id); setError("");
    try {
      await API.patch(`/invoices/${id}/status`, { status: "paid" });
      await load();
      // Once paid, this invoice's home is the Dispatched Invoice tab —
      // jump there so the change is visible immediately.
      setTab("dispatched");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update invoice.");
    } finally {
      setBusyId(null);
    }
  };

  // Split invoices: unpaid ("issued") stay under the ERP Invoice tab;
  // paid invoices move permanently into the Dispatched Invoice tab as a
  // completed record.
  const unpaidInvoices = useMemo(() => invoices.filter((i) => i.Status !== "paid"), [invoices]);
  const paidInvoices = useMemo(() => invoices.filter((i) => i.Status === "paid"), [invoices]);

  // ── Normalize every source into one row shape — powers search/date
  // filtering identically on every tab, and the merged "All" table. ──
  const rows = useMemo(() => {
    const pend = pendingOrders.map((o) => ({
      key: `pend-${o.Id}`, stage: "pending", code: o.Code,
      customer: o.customer?.Name ?? "—", product: o.product?.Name ?? "—",
      qty: o.Quantity, amount: o.TotalAmount, status: o.Status,
      date: o.CreatedAt, raw: o,
    }));
    const appr = approvedOrders.map((o) => ({
      key: `appr-${o.Id}`, stage: "approved", code: o.Code,
      customer: o.customer?.Name ?? "—", product: o.product?.Name ?? "—",
      qty: o.Quantity, amount: o.TotalAmount, status: o.Status,
      date: o.CreatedAt, raw: o,
    }));
    const disp = dispatchedOrders.map((o) => ({
      key: `disp-${o.Id}`, stage: "dispatched", code: o.Code,
      customer: o.customer?.Name ?? "—", product: o.product?.Name ?? "—",
      qty: o.Quantity, amount: o.TotalAmount, status: "dispatched",
      date: o.DispatchedAt, raw: o,
    }));
    const inv = invoices.map((i) => ({
      key: `inv-${i.Id}`, stage: "invoice", code: i.InvoiceNumber, orderCode: i.order?.Code,
      customer: i.customer?.Name ?? "—", product: i.order?.Code ? `Order ${i.order.Code}` : "—",
      amount: i.TotalAmount, status: i.Status,
      date: i.IssuedAt, raw: i,
    }));
    return { pend, appr, disp, inv, all: [...pend, ...appr, ...disp, ...inv] };
  }, [pendingOrders, approvedOrders, dispatchedOrders, invoices]);

  const applyFilters = (list) => {
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      const matchSearch = !q
        || (r.customer || "").toLowerCase().includes(q)
        || (r.code || "").toLowerCase().includes(q)
        || (r.orderCode || "").toLowerCase().includes(q);
      const matchDate = matchesDateFilter(r.date, dateFilter, fromDate, toDate);
      return matchSearch && matchDate;
    });
  };

  const visiblePending    = useMemo(() => applyFilters(rows.pend), [rows.pend, search, dateFilter, fromDate, toDate]);
  const visibleApproved   = useMemo(() => applyFilters(rows.appr), [rows.appr, search, dateFilter, fromDate, toDate]);
  const visibleDispatched = useMemo(() => applyFilters(rows.disp), [rows.disp, search, dateFilter, fromDate, toDate]);
  const visiblePaid       = useMemo(() => applyFilters(paidInvoices.map((i) => ({
    key: `paid-${i.Id}`, code: i.InvoiceNumber, orderCode: i.order?.Code,
    customer: i.customer?.Name ?? "—", amount: i.TotalAmount, status: i.Status,
    date: i.IssuedAt, raw: i,
  }))), [paidInvoices, search, dateFilter, fromDate, toDate]);
  const visibleInvoices   = useMemo(() => applyFilters(unpaidInvoices.map((i) => ({
    key: `inv-${i.Id}`, code: i.InvoiceNumber, orderCode: i.order?.Code,
    customer: i.customer?.Name ?? "—", amount: i.TotalAmount, status: i.Status,
    date: i.IssuedAt, raw: i,
  }))), [unpaidInvoices, search, dateFilter, fromDate, toDate]);
  const visibleAll        = useMemo(() => applyFilters(rows.all),  [rows.all, search, dateFilter, fromDate, toDate]);

  const TABS = [
    ["pending",    "Pending Invoice",    pendingOrders.length],
    ["approved",   "Approved Invoice",   approvedOrders.length],
    ["dispatched", "Dispatched Invoice", dispatchedOrders.length + paidInvoices.length],
    ["invoices",   "ERP Invoice",        unpaidInvoices.length],
    ["all",        "All",                rows.all.length],
  ];

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
  const fmtAmt = (a) => `₹${(parseFloat(a) || 0).toLocaleString()}`;

  const INVOICE_TAB_COLUMNS = {
    pending: [
      { key: "Order", header: "Order" }, { key: "Customer", header: "Customer" },
      { key: "Product", header: "Product" }, { key: "Qty", header: "Qty" },
      { key: "Amount", header: "Amount" }, { key: "Status", header: "Status" },
      { key: "Created", header: "Created" },
    ],
    approved: [
      { key: "Order", header: "Order" }, { key: "Customer", header: "Customer" },
      { key: "Product", header: "Product" }, { key: "Qty", header: "Qty" },
      { key: "Amount", header: "Amount" }, { key: "Status", header: "Status" },
      { key: "Created", header: "Created" },
    ],
    dispatched: [
      { key: "Order", header: "Order / Invoice" }, { key: "Customer", header: "Customer" },
      { key: "Product", header: "Product" }, { key: "Qty", header: "Qty" },
      { key: "Amount", header: "Amount" }, { key: "Status", header: "Status" },
      { key: "Date", header: "Date" },
    ],
    invoices: [
      { key: "InvoiceNo", header: "Invoice No." }, { key: "Order", header: "Order" },
      { key: "Customer", header: "Customer" }, { key: "SubTotal", header: "Sub Total" },
      { key: "Discount", header: "Discount" }, { key: "Total", header: "Total" },
      { key: "Status", header: "Status" }, { key: "Issued", header: "Issued" },
    ],
    all: [
      { key: "Stage", header: "Stage" }, { key: "RefNo", header: "Ref No." },
      { key: "Customer", header: "Customer" }, { key: "Detail", header: "Detail" },
      { key: "Amount", header: "Amount" }, { key: "Status", header: "Status" },
      { key: "Date", header: "Date" },
    ],
  };

  const exportToExcel = () => {
    let data = [];
    let sheetName = "Invoices";

    if (tab === "pending") {
      sheetName = "Pending Invoice";
      data = visiblePending.map((r) => ({
        Order: r.code, Customer: r.customer, Product: r.product,
        Qty: r.qty, Amount: r.amount, Status: r.status, Created: fmtDate(r.date),
      }));
    } else if (tab === "approved") {
      sheetName = "Approved Invoice";
      data = visibleApproved.map((r) => ({
        Order: r.code, Customer: r.customer, Product: r.product,
        Qty: r.qty, Amount: r.amount, Status: r.status, Created: fmtDate(r.date),
      }));
    } else if (tab === "dispatched") {
      sheetName = "Dispatched Invoice";
      const readyRows = visibleDispatched.map((r) => ({
        Order: r.code, Customer: r.customer, Product: r.product,
        Qty: r.qty, Amount: r.amount, Status: "dispatched", Date: fmtDate(r.date),
      }));
      const paidRows = visiblePaid.map((r) => ({
        Order: r.code, Customer: r.customer, Product: "—",
        Qty: "—", Amount: r.amount, Status: r.status, Date: fmtDate(r.date),
      }));
      data = [...readyRows, ...paidRows];
    } else if (tab === "invoices") {
      sheetName = "ERP Invoice";
      data = visibleInvoices.map((r) => {
        const inv = r.raw;
        return {
          InvoiceNo: inv.InvoiceNumber, Order: inv.order?.Code ?? "—",
          Customer: inv.customer?.Name ?? "—", SubTotal: inv.SubTotal,
          Discount: inv.DiscountAmount, Total: inv.TotalAmount,
          Status: inv.Status, Issued: fmtDate(inv.IssuedAt),
        };
      });
    } else {
      sheetName = "All";
      data = visibleAll.map((r) => ({
        Stage: STAGE_META[r.stage]?.label ?? r.stage, RefNo: r.code,
        Customer: r.customer, Detail: r.product || "—",
        Amount: r.amount, Status: r.status, Date: fmtDate(r.date),
      }));
    }

    if (data.length === 0) return;

    const stamp = new Date().toISOString().slice(0, 10);
    exportRowsToExcel(
      data,
      INVOICE_TAB_COLUMNS[tab] || INVOICE_TAB_COLUMNS.all,
      `${sheetName.replace(/\s+/g, "-").toLowerCase()}-${stamp}`,
      sheetName
    );
  };

  const currentVisibleCount = {
    pending: visiblePending.length,
    approved: visibleApproved.length,
    dispatched: visibleDispatched.length + visiblePaid.length,
    invoices: visibleInvoices.length,
    all: visibleAll.length,
  }[tab];

  return (
    <Layout pageTitle="Invoices">
      <h1 style={S.heading}>Invoices</h1>
      <p style={S.headingSub}>Full invoicing worklist — from a fresh enquiry through to a paid invoice. Once an ERP invoice is marked Paid, it moves here permanently under Dispatched Invoice.</p>

      {error && <div style={S.alertError}>{error}</div>}

      <div style={S.tabs}>
        {TABS.map(([key, label, count]) => (
          <button key={key} style={S.tabBtn(tab === key)} onClick={() => setTab(key)}>
            {label} ({count})
          </button>
        ))}
      </div>

      {/* ── Search + date filter bar ── */}
      <div style={S.searchBar}>
        <div style={S.searchInputWrap}>
          <SearchIcon />
          <input
            type="text"
            placeholder="Search customer name or invoice / order no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={S.searchInput}
          />
          {search && (
            <button onClick={() => setSearch("")} style={S.clearBtn} aria-label="Clear search">×</button>
          )}
        </div>

        <div style={S.dateGroup}>
          {[["all", "All Dates"], ["today", "Today"], ["week", "This Week"], ["month", "This Month"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setDateFilter(key); setFromDate(""); setToDate(""); }}
              style={S.dateBtn(dateFilter === key)}
            >
              {label}
            </button>
          ))}

          <div style={S.rangeWrap(dateFilter === "custom")}>
            <span style={S.rangeLabel}>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setDateFilter(e.target.value || toDate ? "custom" : "all"); }}
              style={S.dateInput(dateFilter === "custom")}
            />
            <span style={S.rangeLabel}>To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setDateFilter(e.target.value || fromDate ? "custom" : "all"); }}
              style={S.dateInput(dateFilter === "custom")}
            />
          </div>
        </div>

        <button
          style={S.exportBtn(currentVisibleCount === 0)}
          onClick={exportToExcel}
          disabled={currentVisibleCount === 0}
          title="Export the current tab's visible rows to Excel"
        >
          <ExcelIcon />
          Export to Excel
        </button>
      </div>

      <div style={S.card}>
        <div style={S.tableScroll}>
        {loading ? (
          <p style={S.empty}>Loading…</p>

        ) : tab === "pending" ? (
          visiblePending.length === 0 ? (
            <p style={S.empty}>No pending enquiries match this filter.</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Order</th><th style={S.th}>Customer</th><th style={S.th}>Product</th>
                  <th style={S.th}>Qty</th><th style={S.th}>Amount</th><th style={S.th}>Status</th><th style={S.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {visiblePending.map((r) => (
                  <tr key={r.key}>
                    <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{r.code}</td>
                    <td style={S.td}>{r.customer}</td>
                    <td style={S.td}>{r.product}</td>
                    <td style={S.td}>{r.qty}</td>
                    <td style={S.td}>{fmtAmt(r.amount)}</td>
                    <td style={S.td}><StageBadge stage="pending" /></td>
                    <td style={S.td}>{fmtDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )

        ) : tab === "approved" ? (
          visibleApproved.length === 0 ? (
            <p style={S.empty}>No approved orders match this filter.</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Order</th><th style={S.th}>Customer</th><th style={S.th}>Product</th>
                  <th style={S.th}>Qty</th><th style={S.th}>Amount</th><th style={S.th}>Status</th><th style={S.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {visibleApproved.map((r) => (
                  <tr key={r.key}>
                    <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{r.code}</td>
                    <td style={S.td}>{r.customer}</td>
                    <td style={S.td}>{r.product}</td>
                    <td style={S.td}>{r.qty}</td>
                    <td style={S.td}>{fmtAmt(r.amount)}</td>
                    <td style={S.td}><StageBadge stage="approved" /></td>
                    <td style={S.td}>{fmtDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )

        ) : tab === "dispatched" ? (
          (visibleDispatched.length === 0 && visiblePaid.length === 0) ? (
            <p style={S.empty}>Nothing here yet — dispatched orders awaiting invoicing, and paid invoices, both land in this tab.</p>
          ) : (
            <>
              {visibleDispatched.length > 0 && (
                <>
                  <p style={S.subheading}>Awaiting Invoice Generation</p>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Order</th><th style={S.th}>Customer</th><th style={S.th}>Product</th>
                        <th style={S.th}>Qty</th><th style={S.th}>Amount</th><th style={S.th}>Dispatched</th>
                        {canAct && <th style={S.th}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDispatched.map((r) => (
                        <tr key={r.key}>
                          <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{r.code}</td>
                          <td style={S.td}>{r.customer}</td>
                          <td style={S.td}>{r.product}</td>
                          <td style={S.td}>{r.qty}</td>
                          <td style={S.td}>{fmtAmt(r.amount)}</td>
                          <td style={S.td}>{fmtDate(r.date)}</td>
                          {canAct && (
                            <td style={S.td}>
                              <button style={S.actionBtn} disabled={busyId === r.raw.Id} onClick={() => generate(r.raw.Id)}>
                                {busyId === r.raw.Id ? "…" : "Generate Invoice"}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {visiblePaid.length > 0 && (
                <>
                  <p style={{ ...S.subheading, marginTop: visibleDispatched.length > 0 ? 22 : 0 }}>Paid — Completed</p>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Invoice No.</th><th style={S.th}>Order</th><th style={S.th}>Customer</th>
                        <th style={S.th}>Amount</th><th style={S.th}>Status</th><th style={S.th}>Paid / Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePaid.map((r) => (
                        <tr key={r.key}>
                          <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{r.code}</td>
                          <td style={S.td}>{r.orderCode ?? "—"}</td>
                          <td style={S.td}>{r.customer}</td>
                          <td style={{ ...S.td, fontWeight: 700 }}>{fmtAmt(r.amount)}</td>
                          <td style={S.td}><StatusPill status={r.status} /></td>
                          <td style={S.td}>{fmtDate(r.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )

        ) : tab === "invoices" ? (
          visibleInvoices.length === 0 ? (
            <p style={S.empty}>No unpaid ERP invoices match this filter.</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Invoice No.</th><th style={S.th}>Order</th><th style={S.th}>Customer</th>
                  <th style={S.th}>Amount</th><th style={S.th}>Status</th><th style={S.th}>Issued</th>
                  {canAct && <th style={S.th}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((r) => {
                  const inv = r.raw;
                  return (
                    <tr key={r.key}>
                      <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{inv.InvoiceNumber}</td>
                      <td style={S.td}>{inv.order?.Code ?? "—"}</td>
                      <td style={S.td}>{inv.customer?.Name ?? "—"}</td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{fmtAmt(inv.TotalAmount)}</td>
                      <td style={S.td}><StatusPill status={inv.Status} /></td>
                      <td style={S.td}>{fmtDate(inv.IssuedAt)}</td>
                      {canAct && (
                        <td style={S.td}>
                          <button style={S.actionBtn} disabled={busyId === inv.Id} onClick={() => markPaid(inv.Id)}>
                            {busyId === inv.Id ? "…" : "Mark Paid"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )

        ) : ( // tab === "all"
          visibleAll.length === 0 ? (
            <p style={S.empty}>Nothing matches this filter.</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Stage</th><th style={S.th}>Ref No.</th><th style={S.th}>Customer</th>
                  <th style={S.th}>Detail</th><th style={S.th}>Amount</th><th style={S.th}>Status</th><th style={S.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleAll.map((r) => (
                  <tr key={r.key}>
                    <td style={S.td}><StageBadge stage={r.stage} overrideStatus={r.status} /></td>
                    <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{r.code}</td>
                    <td style={S.td}>{r.customer}</td>
                    <td style={S.td}>{r.product || "—"}</td>
                    <td style={S.td}>{fmtAmt(r.amount)}</td>
                    <td style={S.td}><StatusPill status={r.status} /></td>
                    <td style={S.td}>{fmtDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        </div>
      </div>
    </Layout>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ExcelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="3" x2="8" y2="21" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

function buildStyles(themeG) {
  return {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 18px" },
    subheading: { fontSize: 12, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px", padding: "0 4px" },
    tabs: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
    tabBtn: (active) => ({ padding: "9px 16px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: active ? themeG.accent : themeG.card, color: active ? "#fff" : themeG.textMain, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }),

    searchBar: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 },
    searchInputWrap: { position: "relative", display: "flex", alignItems: "center", flex: "1 1 280px", minWidth: 240, color: themeG.textSub },
    searchInput: {
      width: "100%", boxSizing: "border-box", padding: "10px 34px", borderRadius: 10,
      border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT,
      background: themeG.card, outline: "none", color: themeG.textMain,
    },
    clearBtn: {
      position: "absolute", right: 8, background: "transparent", border: "none",
      color: themeG.textSub, fontSize: 17, lineHeight: 1, cursor: "pointer", padding: 4,
    },
    dateGroup: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
    dateBtn: (active) => ({
      padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
      cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
      background: active ? themeG.accent : themeG.card, color: active ? "#fff" : themeG.textSub,
      borderColor: active ? themeG.accent : themeG.border, whiteSpace: "nowrap",
    }),
    rangeWrap: (active) => ({
      display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 20,
      border: `1.5px solid ${active ? themeG.accent : themeG.border}`, background: themeG.card,
    }),
    rangeLabel: { fontSize: 11.5, fontWeight: 600, color: themeG.textSub, whiteSpace: "nowrap" },
    dateInput: (active) => ({
      padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${active ? themeG.accent : themeG.border}`,
      fontSize: 12.5, fontFamily: FONT, background: themeG.card, color: themeG.textMain, outline: "none",
    }),

    exportBtn: (disabled) => ({
      display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10,
      border: "none", background: disabled ? themeG.border : "#1E7B4D", color: "#fff",
      fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: FONT, whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1,
    }),

    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)", padding: 4 },
    tableScroll: { overflowX: "auto", padding: "10px 8px" },
    table: { width: "100%", tableLayout: "auto", borderCollapse: "collapse", marginBottom: 4 },
    th: { textAlign: "left", fontSize: 10.5, color: themeG.textLabel, padding: "9px 12px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    td: { padding: "10px 12px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
    actionBtn: { padding: "6px 14px", borderRadius: 8, border: "none", background: themeG.accent, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    alertError: { marginBottom: 18, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" },
  };
}