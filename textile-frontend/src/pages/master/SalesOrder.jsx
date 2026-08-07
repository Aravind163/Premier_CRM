// src/pages/master/SalesOrder.jsx
//
// Sales Order — rebuilt as four drill-down views, one per stat card on the
// Marketing Review page ("Pending Final Approval" / "Approved Orders
// Today" / "Total Order Value" / "ERP Transfer Pending"). Each card's
// "View Details" link opens this page with a `?view=` query param that
// selects one of the four tabs below; the tabs can also be switched by
// hand once you're here. Every view reads from the SAME allocations data
// Marketing Review writes to (GET /allocations/list) — this is no longer
// a plain "approved Orders" list.
//
// NOTE: Checkbox selection / bulk actions, the per-row Actions column,
// the Remarks column, and the ERP SO Status column have been removed.
// This page is now read-only — Approve / Reject / Transfer to ERP still
// live on the Marketing Review page.
//
// SEARCH BAR + TYPE PILLS (latest): brought in line with CustomerOrders.jsx
// / Batches.jsx instead of the old two-level Type-tab -> Sub-type-pill
// structure. Same search bar look (icon input, matches Order No /
// Customer / Customer Code / Product / Product Code) and a single flat
// row of pills — Dhoti / Blouse / Uniform Shirting / Uniform Suiting /
// Others, plus an "All" pill — using the identical match/groupFor()
// convention as CLOTH_GROUPS in CustomerOrders.jsx / Batches.jsx. Both
// are shared across all four views and reset whenever the tab (view)
// changes, same as before.
//
// ORDER NO COLUMN: added immediately after S.No in every view's table.
// Real allocation rows don't all agree on a single field name for this
// across the backend, so orderNoOf() below tries the common variants
// (orderNo / OrderNo / order_no / orderId / OrderId / orderNumber) the
// same way subTypeOf() already falls back across subType/SubType/etc.
//
// PRODUCT TYPE PILLS (fixed): the first attempt at this assumed each
// /allocations/list row already carried its own subType/category field
// — it doesn't, so the pills silently never had anything to group.
// Fixed by fetching /products separately (same call OrderList.jsx
// already makes) and building a productCode -> SubType lookup, since
// every product record does carry a real SubType (see ProductCatalog.jsx
// / ProductSelection.jsx, p.SubType). Each allocation row's subType is
// now resolved via r.productCode against that lookup, falling back to
// r.subType/r.SubType/r.category/r.Category if the row happens to
// already include one directly.
//
// REJECTED ORDERS TAB (new): a fifth System Admin view showing orders
// that were rejected via the "Reject" button on the Pending Final
// Approval tab (that button calls handleCancel -> POST
// /allocations/{id}/cancel, which — per the note on handleCancel below —
// is expected to set the allocation's status to "cancelled" once that
// endpoint exists on the backend). This tab just reads the same
// /allocations/list endpoint filtered to status=cancelled, so it'll
// start showing real rows as soon as that backend piece lands.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Shirt, Layers, Briefcase, Ruler, LayoutGrid } from "lucide-react";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// System Admin's five drill-downs — tied to the final approval + ERP
// handoff work that's theirs, plus a Rejected Orders tab covering
// orders rejected off the Pending Final Approval tab.
const SYSADMIN_VIEWS = [
  { id: "pending_final_approval", label: "Pending Final Approval" },
  { id: "approved_today",         label: "Approved Orders Today" },
  { id: "total_order_value",      label: "Total Order Value" },
  { id: "erp_transfer_pending",   label: "ERP Transfer Pending" },
  { id: "rejected_orders",        label: "Rejected Orders" },
];

// Admin's four drill-downs — match Admin's own stat cards on Marketing
// Review (Today's Inquiries / Pending Allocation / Available Stock /
// Awaiting Approval), which describe the allocation work still on
// Admin's plate rather than System Admin's final-approval workflow.
const ADMIN_VIEWS = [
  { id: "today_inquiries",   label: "Today's Inquiries" },
  { id: "pending_allocation", label: "Pending Allocation" },
  { id: "available_stock",   label: "Available Stock" },
  { id: "awaiting_approval", label: "Awaiting Approval" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Type pills — identical match/groupFor() convention as
// CLOTH_GROUPS in CustomerOrders.jsx / Batches.jsx, so a Sub Type
// resolves to the same pill everywhere it appears in the app. ──
const CLOTH_GROUPS = [
  { id: "dhoti", name: "Dhoti", match: ["dhoti", "dothi", "cotton dhoti grey", "cotton dhoti fabric"], icon: Layers, color: "#1C7A4B" },
  { id: "blouse", name: "Blouse", match: ["blouse"], icon: Shirt, color: "#1E5B95" },
  { id: "uniform_shirting", name: "Uniform Shirting", match: ["uniform shirting"], icon: Briefcase, color: "#B2622E" },
  { id: "uniform_suiting", name: "Uniform Suiting", match: ["uniform suiting"], icon: Ruler, color: "#5B4B8C" },
  { id: "others", name: "Others", match: ["others"], icon: LayoutGrid, color: "#D97706" },
];

const normalize = (v) => (v ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

const groupFor = (subType) => {
  const c = normalize(subType);
  if (!c) return CLOTH_GROUPS[CLOTH_GROUPS.length - 1]; // Others
  const exact = CLOTH_GROUPS.find((g) => g.match.includes(c));
  if (exact) return exact;
  const partial = CLOTH_GROUPS.find((g) => g.match.some((m) => c.includes(m) || m.includes(c)));
  return partial || CLOTH_GROUPS[CLOTH_GROUPS.length - 1];
};

export default function SalesOrder() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const S = buildStyles(themeG);

  const role = localStorage.getItem("role") || "";
  const isSystemAdminRole = role === "system_admin";
  const VIEWS = isSystemAdminRole ? SYSADMIN_VIEWS : ADMIN_VIEWS;
  const defaultViewId = VIEWS[0].id;

  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.some((v) => v.id === searchParams.get("view"))
    ? searchParams.get("view")
    : defaultViewId;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busyIds, setBusyIds] = useState(() => new Set());

  // ── SubType lookup — fetched once from /products, keyed by product
  // Code, so every allocation row (which only carries productCode, not
  // a subType of its own) can still be grouped under the right pill. ──
  const [subTypeByCode, setSubTypeByCode] = useState({});

  // ── Type pills (flat row, same as CustomerOrders.jsx) ──
  const [activeType, setActiveType] = useState("all");

  // ── Search bar — shared across all four views, cleared on tab switch. ──
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/products");
        const map = {};
        (res.data || []).forEach((p) => {
          if (p.Code) map[p.Code] = p.SubType;
        });
        setSubTypeByCode(map);
      } catch {
        // Non-fatal — if this fails, rows just fall back to "Others"
        // until the product list loads successfully.
      }
    })();
  }, []);

  // Resolve a row's sub-type: prefer a value already on the row itself
  // (in case the backend adds one later), otherwise look it up by
  // productCode against the /products map above.
  const subTypeOf = (row) =>
    row.subType || row.SubType || row.category || row.Category ||
    subTypeByCode[row.productCode] || subTypeByCode[row.ProductCode] || null;

  // Resolve a row's order number: real allocation records don't all
  // agree on a single field name for this, so try the common variants
  // before giving up — same fallback-chain approach as subTypeOf().
  const orderNoOf = (row) =>
    row.orderNo || row.OrderNo || row.order_no ||
    row.orderId || row.OrderId || row.orderNumber || null;

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params = {};
      if (isSystemAdminRole) {
        if (view === "pending_final_approval") params.status = "pending";
        if (view === "approved_today") { params.status = "approved"; params.date = todayStr(); }
        if (view === "erp_transfer_pending") { params.status = "approved"; params.erp_status = "not_transferred"; }
        // "total_order_value" intentionally has no status/erp filter — it's
        // the full picture, sorted by value.
        // "rejected_orders" — orders rejected off the Pending Final
        // Approval tab via handleCancel(), which is expected to set the
        // allocation's status to "cancelled" once its backend endpoint
        // (POST /allocations/{id}/cancel) is wired up. See the note on
        // handleCancel below.
        if (view === "rejected_orders") params.status = "cancelled";
      } else {
        // Admin's four views. "pending_allocation" and "available_stock"
        // are computed/sorted client-side below (see `visible`) rather
        // than via a status param, since they're a function of
        // requested/available/allocated qty, not the approval status
        // field. Backend param names here mirror the pattern already
        // used above (date/status/erp_status) — if /allocations/list
        // doesn't yet support `date` as a same-day inquiry filter, this
        // just falls back to the unfiltered list, matching what
        // Marketing Review's own inquiryDate filter already assumes.
        if (view === "today_inquiries") params.date = todayStr();
        if (view === "awaiting_approval") params.status = "pending";
        // "pending_allocation" / "available_stock" intentionally have no
        // server-side filter — the full picture, filtered/sorted below.
      }
      const res = await API.get("/allocations/list", { params });
      setRows(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load this list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view]);

  // Reset the Type pill and the search box whenever the tab (view)
  // changes — a Dhoti filter or search term picked under "Pending
  // Allocation" shouldn't silently keep narrowing "Available Stock" (or
  // a System Admin view) after switching tabs.
  useEffect(() => {
    setActiveType("all");
    setSearch("");
  }, [view]);

  const setView = (id) => setSearchParams(id === defaultViewId ? {} : { view: id });

  // Reject — same PATCH /allocations/{id}/decision endpoint Marketing
  // Review's tick/cross actions use, so a rejection made here shows up
  // everywhere else that reads allocation status (Marketing Review,
  // Order Status, the customer/end-user dashboards) — it's the same
  // shared record, not a page-local flag. Only a still-Pending row can be
  // rejected, matching the backend's existing rule.
  const handleReject = async (row) => {
    if (!row.allocationId || row.status !== "pending") return;
    if (!window.confirm(`Reject the order for ${row.customerName} — ${row.productName}?`)) return;
    setBusyIds((s) => new Set(s).add(row.allocationId));
    setError(""); setOk("");
    try {
      await API.patch(`/allocations/${row.allocationId}/decision`, { status: "rejected" });
      setRows((prev) => prev.map((r) => (r.allocationId === row.allocationId ? { ...r, status: "rejected" } : r)));
      setOk("Order rejected.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reject this order.");
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(row.allocationId); return n; });
    }
  };

  // Cancel — a distinct action from Reject: it pulls the order out of
  // Sales Order entirely and logs it as a loss, so it can show up on the
  // Sales Loss Report page (and, now, on this page's own Rejected Orders
  // tab). NOTE: this calls a new endpoint, POST /allocations/{id}/cancel,
  // which doesn't exist in the AllocationController shown so far — it
  // needs to be added there (set the allocation/Order to a 'cancelled'
  // state and write/expose a row the Sales Loss Report page's own query
  // reads from, as well as what the Rejected Orders tab above filters
  // /allocations/list on via status=cancelled). Once that endpoint
  // responds, the row is simply removed from this page's current list.
  const handleCancel = async (row) => {
    if (!row.allocationId) return;
    if (!window.confirm(`Cancel the order for ${row.customerName} — ${row.productName}? It will be removed from Sales Order .`)) return;
    setBusyIds((s) => new Set(s).add(row.allocationId));
    setError(""); setOk("");
    try {
      await API.post(`/allocations/${row.allocationId}/cancel`);
      setRows((prev) => prev.filter((r) => r.allocationId !== row.allocationId));
      // setOk("Order cancelled and moved to Sales Loss Report.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to cancel this order.");
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(row.allocationId); return n; });
    }
  };

  // ── Type pill counts (over the full row list for this view, unaffected
  // by search so switching pills never feels like it's fighting the
  // search box). ──
  const catCounts = useMemo(() => {
    const m = { all: rows.length };
    CLOTH_GROUPS.forEach((g) => { m[g.id] = 0; });
    rows.forEach((r) => { m[groupFor(subTypeOf(r)).id] = (m[groupFor(subTypeOf(r)).id] || 0) + 1; });
    return m;
  }, [rows, subTypeByCode]);

  const visible = useMemo(() => {
    let list = rows;

    // Search bar — matches Order No, Customer, Customer Code, Product,
    // and Product Code, case-insensitively. Applied before the pill
    // filter so search always narrows within whatever pill is active.
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const orderNo = String(orderNoOf(r) || "").toLowerCase();
        return (
          orderNo.includes(q) ||
          (r.customerName || "").toLowerCase().includes(q) ||
          (r.customerCode || "").toLowerCase().includes(q) ||
          (r.productName || "").toLowerCase().includes(q) ||
          (r.productCode || "").toLowerCase().includes(q)
        );
      });
    }

    // Type pill — narrows to rows whose resolved subType group matches
    // the selected pill.
    if (activeType !== "all") list = list.filter((r) => groupFor(subTypeOf(r)).id === activeType);
    if (view === "total_order_value") list = [...list].sort((a, b) => b.totalValue - a.totalValue);
    // Admin's "Pending Allocation" — lines where the allocated qty hasn't
    // caught up to what was requested yet (mirrors Marketing Review's own
    // allocFor(row) < row.requested check, just against the server's
    // saved allocatedQty here since there's no local draft on this page).
    if (view === "pending_allocation") list = list.filter((r) => (r.allocatedQty || 0) < (r.requestedQty || 0));
    // Admin's "Available Stock" — same full list, ranked by what's left
    // to allocate rather than by value.
    if (view === "available_stock") list = [...list].sort((a, b) => (b.availableQty || 0) - (a.availableQty || 0));
    return list;
  }, [rows, view, activeType, subTypeByCode, search]);

  const totalValueSum = useMemo(() => rows.reduce((a, r) => a + (r.totalValue || 0), 0), [rows]);
  const totalAvailableSum = useMemo(() => {
    // Sum available stock once per product, not once per row — several
    // rows (customers/orders) can share the same product's stock pool.
    const seen = new Map();
    rows.forEach((r) => { if (!seen.has(r.productCode)) seen.set(r.productCode, r.availableQty || 0); });
    return Array.from(seen.values()).reduce((a, v) => a + v, 0);
  }, [rows]);

  const fmtAmt = (a) => `₹${(parseFloat(a) || 0).toLocaleString()}`;
  const statusBadge = (status) => {
    const map = {
      pending:   { bg: "rgba(214,148,38,0.12)",  color: "#A8701F", label: "Pending" },
      approved:  { bg: "rgba(46,122,114,0.12)",  color: "#1E7B4D", label: "Approved" },
      rejected:  { bg: "rgba(178,58,58,0.12)",   color: "#B23A3A", label: "Lost" },
      // "cancelled" is the status handleCancel's endpoint is expected to
      // set — this is what the Rejected Orders tab's rows will carry.
      cancelled: { bg: "rgba(178,58,58,0.12)",   color: "#B23A3A", label: "Rejected" },
    };
    const st = map[status] || { bg: "rgba(140,150,163,0.12)", color: "#526073", label: status || "—" };
    return <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}33`, padding: "3px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>{st.label}</span>;
  };

  // Admin's read on a row — the same stock-position badge Marketing
  // Review shows Admin (Fully/Partial Allocated, Stock Shortage), not the
  // approval-state badge above. Mirrors stockStatus()/stockColor() in
  // Batches.jsx so the two pages agree.
  const stockPositionBadge = (row) => {
    const requested = row.requestedQty || 0;
    const available = row.availableQty || 0;
    const allocated = row.allocatedQty || 0;
    let label, color, bg;
    if (available <= 0 && allocated <= 0) { label = "Stock Shortage"; color = "#B23A3A"; bg = "rgba(178,58,58,0.12)"; }
    else if (allocated >= requested) { label = "Fully Allocated"; color = "#1C7A4B"; bg = "rgba(28,122,75,0.12)"; }
    else { label = "Partial Allocated"; color = "#8A5A0E"; bg = "rgba(138,90,14,0.12)"; }
    return <span style={{ background: bg, color, border: `1px solid ${color}33`, padding: "3px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>{label}</span>;
  };
  // "Awaiting Approval" is the one Admin view that still reflects the
  // real approval state (what's sitting with System Admin), not stock
  // position — so it uses statusBadge() like System Admin's views do.
  const rowStatusBadge = (row) =>
    (isSystemAdminRole || view === "awaiting_approval") ? statusBadge(row.status) : stockPositionBadge(row);

  return (
    <Layout pageTitle="Sales Order">
      <h1 style={S.heading}>Order details</h1>
      <p style={S.headingSub}>
        {VIEWS.find((v) => v.id === view)?.label} — {isSystemAdminRole ? "fed by Marketing Review's Final Approval workflow." : "fed by Marketing Review's allocation board."}
        {view === "total_order_value" && ` Total: ${fmtAmt(totalValueSum)} across ${rows.length} line(s).`}
        {view === "today_inquiries" && ` Total: ${rows.length} order line(s).`}
        {view === "pending_allocation" && ` Total: ${visible.length} line(s) still awaiting full allocation.`}
        {view === "available_stock" && ` Total available: ${totalAvailableSum.toLocaleString()} Pcs.`}
        {view === "awaiting_approval" && ` Total: ${rows.length} line(s) awaiting System Admin's decision.`}
        {view === "rejected_orders" && ` Total: ${rows.length} rejected order(s).`}
      </p>

      <div style={S.tabRow}>
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} style={{ ...S.tabBtn, ...(view === v.id ? S.tabBtnActive : {}) }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── Search bar — shared across all four views. Matches Order No,
            Customer, Customer Code, Product, and Product Code. Same look
            as CustomerOrders.jsx. ── */}
      <div style={S.filterBar}>
        <div style={S.searchWrap}>
          <Search size={14} style={S.searchIcon} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order no, customer, product, or code…"
            style={S.searchInput}
          />
        </div>
      </div>

      {error && <div style={S.alertError}>{error}</div>}
      {ok && <div style={S.alertOk}>{ok}</div>}

      {/* ── Type pills — Dhoti / Blouse / Uniform Shirting / Uniform
            Suiting / Others, plus All. Same flat-row convention as
            CustomerOrders.jsx / Batches.jsx. ── */}
      <div style={S.pillRow}>
        <button
          onClick={() => setActiveType("all")}
          style={S.pill(activeType === "all", "#0F2138")}
        >
          <LayoutGrid size={13} />
          All <span style={S.pillCount}>({catCounts.all || 0})</span>
        </button>
        {CLOTH_GROUPS.map((g) => {
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              onClick={() => setActiveType(g.id)}
              style={S.pill(activeType === g.id, g.color)}
            >
              <Icon size={13} />
              {g.name} <span style={S.pillCount}>({catCounts[g.id] || 0})</span>
            </button>
          );
        })}
      </div>

      <div style={S.card}>
        <div style={S.tableScroll}>
          {loading ? (
            <p style={S.empty}>Loading…</p>
          ) : visible.length === 0 ? (
            <p style={S.empty}>{search ? "No orders match your search." : "Nothing here right now."}</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>S.No</th>
                  <th style={S.th}>Order No</th>
                  <th style={S.th}>Customer</th><th style={S.th}>Customer Code</th>
                  <th style={S.th}>Product</th><th style={S.th}>Product Code</th>
                  {!isSystemAdminRole && <th style={S.th}>Requested Qty</th>}
                  {!isSystemAdminRole && <th style={S.th}>Available Stock</th>}
                  <th style={S.th}>{isSystemAdminRole ? "Qty" : "Allocated Qty"}</th>
                  <th style={S.th}>Status</th>
                  {view === "pending_final_approval" && <th style={S.th}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, idx) => {
                  const busy = busyIds.has(r.allocationId);
                  const canReject = r.status === "pending" && !busy;
                  return (
                    <tr key={r.allocationId}>
                      <td style={S.td}>{idx + 1}</td>
                      <td style={S.td}>{orderNoOf(r) || "—"}</td>
                      <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{r.customerName}</td>
                      <td style={S.td}>{r.customerCode}</td>
                      <td style={S.td}>{r.productName}</td>
                      <td style={S.td}>{r.productCode}</td>
                      {!isSystemAdminRole && <td style={S.td}>{r.requestedQty ?? "—"}</td>}
                      {!isSystemAdminRole && <td style={S.td}>{r.availableQty ?? "—"}</td>}
                      <td style={S.td}>{r.allocatedQty}</td>
                      <td style={S.td}>{rowStatusBadge(r)}</td>
                      {view === "pending_final_approval" && (
                        <td style={S.td}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => handleReject(r)}
                              disabled={!canReject}
                              title={r.status === "pending" ? "Reject this order" : "Only a Pending order can be rejected"}
                              style={{ ...S.actionBtnReject, ...(canReject ? {} : S.actionBtnDisabled) }}
                            >
                              Sale Loss
                            </button>
                            <button
                              onClick={() => handleCancel(r)}
                              disabled={busy}
                              title="Cancel this order and log it in Sales Loss Report"
                              style={{ ...S.actionBtnCancel, ...(busy ? S.actionBtnDisabled : {}) }}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}

function buildStyles(themeG) {
  return {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 14px" },

    tabRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
    tabBtn: { padding: "8px 14px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
    tabBtnActive: { background: themeG.accent, color: "#fff", borderColor: themeG.accent },

    // ── Search bar (shared across all four views) — same look as
    // CustomerOrders.jsx's filterBar/searchWrap/searchIcon/searchInput. ──
    filterBar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 },
    searchWrap: { position: "relative", flex: "1 1 260px", maxWidth: 420 },
    searchIcon: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: themeG.textSub },
    searchInput: {
      width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 10,
      border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain,
      fontFamily: FONT, fontSize: 13, outline: "none",
    },

    // ── Type pills (flat row, same as CustomerOrders.jsx) ──
    pillRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 },
    pill: (active, color) => ({
      display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20,
      border: active ? "none" : `1px solid ${themeG.border}`, cursor: "pointer", fontFamily: FONT,
      fontSize: 12.5, fontWeight: 700,
      background: active ? color : themeG.card, color: active ? "#fff" : themeG.textMain,
      boxShadow: active ? `0 3px 10px ${color}55` : "0 2px 6px rgba(15,33,56,0.06)",
    }),
    pillCount: { opacity: 0.85, fontWeight: 600 },

    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    // Shows roughly 10 data rows before scrolling; the header stays
    // pinned (position: sticky) while the body scrolls underneath it.
    tableScroll: { overflowX: "auto", overflowY: "auto", maxHeight: 460 },
    table: { width: "100%", tableLayout: "auto", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 10.5, color: "#FFFFFF", background: "#1F3A63", padding: "10px 12px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, position: "sticky", top: 0, zIndex: 1 },
    td: { padding: "10px 12px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    actionBtnReject: { padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(178,58,58,0.35)", background: "rgba(178,58,58,0.08)", color: "#B23A3A", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    actionBtnCancel: { padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(138,90,14,0.35)", background: "rgba(138,90,14,0.08)", color: "#8A5A0E", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    actionBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
    alertError: { marginBottom: 18, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" },
    alertOk: { marginBottom: 18, background: "rgba(46,122,114,0.08)", border: "1px solid rgba(46,122,114,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1E7B4D" },
  };
}