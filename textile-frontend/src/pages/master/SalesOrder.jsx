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
//
// UOM / METER COLUMNS (latest): every view's table now shows UOM right
// after Product, and Meter (M) right after the Allocated/Qty column —
// mirrors the same two fields Marketing Review's Batches.jsx board
// already carries per row (r.uom / r.meters). This page is read-only, so
// both just render whatever the /allocations/list row already has via
// uomOf()/meterOf() below — same fallback-chain convention as
// subTypeOf()/orderNoOf() above, in case the backend ever sends a
// differently-cased field name for either.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Shirt, Layers, Briefcase, Ruler, LayoutGrid, Pencil } from "lucide-react";
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
  { id: "approved_today", label: "Approved Orders Today" },
  // { id: "total_order_value", label: "Total Order Value" },
  { id: "erp_transfer_pending", label: "ERP Transfer Pending" },
  // New — the mirror image of "ERP Transfer Pending": Approved rows that
  // HAVE already been pushed to ERP (erpStatus === 'erp_so_created'),
  // instead of ones still waiting on the "Transfer to ERP" click.
  { id: "erp_so_created", label: "ERP SO Created" },
  { id: "rejected_orders", label: "Rejected Orders" },
  { id: "edit_allocation", label: "Edit Allocation" },
];

// Admin's four drill-downs — match Admin's own stat cards on Marketing
// Review (Today's Inquiries / Pending Allocation / Available Stock /
// Awaiting Approval), which describe the allocation work still on
// Admin's plate rather than System Admin's final-approval workflow.
const ADMIN_VIEWS = [
  { id: "today_inquiries", label: "Today's Inquiries" },
  { id: "pending_allocation", label: "Pending Allocation" },
  // New — the mirror image of "Pending Allocation": lines where
  // Allocated Qty has actually caught up to Requested Qty. Purely
  // client-computed (see `visible` below), same as Pending Allocation.
  { id: "full_allocation", label: "Full Allocation" },
  { id: "awaiting_approval", label: "Awaiting Approval" },
  // Renamed from "Available Stock" — same view id (available_stock) so
  // Marketing Review's stat card link (goToSalesOrder("available_stock"))
  // and this page's own view-specific filtering/sorting logic below
  // don't need to change, only the label and its position in the tab row.
  { id: "available_stock", label: "All Allocation" },
];

// Super Admin — same read-only drill-downs as Admin's own, plus three of
// System Admin's ERP/rejection-tracking views tacked on so Super Admin
// can see that side of the pipeline too. Doesn't touch ADMIN_VIEWS or
// SYSADMIN_VIEWS above — those two keep their own separate lists.
const SUPERADMIN_VIEWS = [
  ...ADMIN_VIEWS,
  { id: "erp_transfer_pending", label: "ERP Transfer Pending" },
  { id: "erp_so_created", label: "ERP SO Created" },
  { id: "rejected_orders", label: "Rejected Orders" },
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

// Same label-only override used across every other page in the app —
// "Meter" is stored/matched exactly as before, only shown as "Mtr" here.
const UOM_LABEL_OVERRIDES = { Meter: "Mtr", Box: "Cases" };
function uomLabel(value) {
  return UOM_LABEL_OVERRIDES[value] || value;
}

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
  const isSuperAdminRole = role === "super_admin";
  const VIEWS = isSystemAdminRole ? SYSADMIN_VIEWS : isSuperAdminRole ? SUPERADMIN_VIEWS : ADMIN_VIEWS;
  const defaultViewId = VIEWS[0].id;

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const view = VIEWS.some((v) => v.id === searchParams.get("view"))
    ? searchParams.get("view")
    : defaultViewId;

  const isEditAlloc = view === "edit_allocation";
  const isRejectedView = view === "rejected_orders";
  // Views that behave like System Admin's ERP/approval-tracking screens —
  // used below to decide which columns/badges to show for the CURRENT
  // view, regardless of which role is looking at it, since Super Admin
  // now shares three of these views with System Admin.
  const isSysAdminStyleView = [
    "pending_final_approval", "approved_today",
    "erp_transfer_pending", "erp_so_created",
    "rejected_orders", "edit_allocation",
  ].includes(view);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busyIds, setBusyIds] = useState(() => new Set());

  // ── Edit Allocation (System Admin only) ──
  // Lets System Admin adjust an already-allocated order's Allocated Qty
  // / Meter after the fact — e.g. Admin only partially allocated it, or a
  // correction is needed once it's already sitting with System Admin.
  // Edit state is per-row (keyed by allocationId), so several rows can be
  // edited independently; nothing is sent to the server until "Approve"
  // is clicked on that specific row.
  const [editingRows, setEditingRows] = useState(() => new Set());
  const [editQtyInputs, setEditQtyInputs] = useState({});
  const [editMeterInputs, setEditMeterInputs] = useState({});
  const [savingEditId, setSavingEditId] = useState(null);

  // ── SubType lookup — fetched once from /products, keyed by product
  // Code, so every allocation row (which only carries productCode, not
  // a subType of its own) can still be grouped under the right pill. ──
  const [subTypeByCode, setSubTypeByCode] = useState({});

  // ── Type pills (flat row, same as CustomerOrders.jsx) ──
  const [activeType, setActiveType] = useState("all");

  // ── Search bar — shared across all four views, cleared on tab switch. ──
  const [search, setSearch] = useState("");

  // ── Date filter — Admin / System Admin / Super Admin, next to the
  // search bar. Overrides the hardcoded "today" the today_inquiries/
  // approved_today views send when a date is picked, and adds a date
  // filter to every other view too. Cleared on tab switch, same as
  // search. ──
  const [dateFilter, setDateFilter] = useState("");

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

  // Resolve a row's UOM and Meter — same fallback-chain pattern as
  // subTypeOf()/orderNoOf() above, so it stays in sync with whatever
  // Marketing Review's /allocations/board sends for these fields.
  const uomOf = (row) =>
    row.uom || row.UOM || row.Uom || null;

  const meterOf = (row) =>
    row.meters || row.Meters || row.meter || row.Meter || null;

  // Resolve a row's ERP transfer state — same fallback-chain pattern as
  // uomOf()/meterOf() above, in case the backend sends a differently
  // cased field name for this.
  const erpStatusOf = (row) =>
    row.erpStatus || row.ErpStatus || row.erp_status || null;

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params = {};
      // Keyed on the view id itself rather than role — Super Admin now
      // shares three of these views (erp_transfer_pending / erp_so_created
      // / rejected_orders) with System Admin, so this needs to fire for
      // both roles the same way instead of being gated behind
      // isSystemAdminRole.
      if (view === "pending_final_approval") params.status = "pending";
      if (view === "approved_today") { params.status = "approved"; params.date = todayStr(); }
      if (view === "erp_transfer_pending") { params.status = "approved"; params.erp_status = "not_transferred"; }
      if (view === "erp_so_created") { params.status = "approved"; params.erp_status = "erp_so_created"; }
      // "rejected_orders" — orders rejected via the "Reject" button on
      // the Pending Final Approval tab, which calls handleReject() ->
      // PATCH /allocations/{id}/decision with { status: "rejected" }
      // (the same endpoint/status Marketing Review's own reject action
      // uses). This must filter on "rejected", not "cancelled" —
      // "cancelled" is a different, separate status set only by
      // handleCancel()'s "Sale Loss" button (POST /allocations/{id}/cancel),
      // which pulls the order out of Sales Order entirely and logs it
      // as a loss instead. Rejected orders stay listed here.
      if (view === "rejected_orders") params.status = "rejected";
      // Admin / Super Admin's shared views. "pending_allocation" and
      // "available_stock" are computed/sorted client-side below (see
      // `visible`) rather than via a status param, since they're a
      // function of requested/available/allocated qty, not the approval
      // status field.
      if (view === "today_inquiries") params.date = todayStr();
      if (view === "awaiting_approval") params.status = "pending";
      // "pending_allocation" / "available_stock" / "full_allocation"
      // intentionally have no server-side filter — the full picture,
      // filtered/sorted below.
      // Manual date filter — takes precedence over the hardcoded
      // todayStr() above when the person picks a date.
      if (dateFilter) params.date = dateFilter;
      const res = await API.get("/allocations/list", { params });
      setRows(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load this list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view, dateFilter]);

  // Reset the Type pill and the search box whenever the tab (view)
  // changes — a Dhoti filter or search term picked under "Pending
  // Allocation" shouldn't silently keep narrowing "Available Stock" (or
  // a System Admin view) after switching tabs.
  useEffect(() => {
    setActiveType("all");
    setSearch("");
    setDateFilter("");
    setEditingRows(new Set());
    setEditQtyInputs({});
    setEditMeterInputs({});
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
      setRows((prev) => prev.filter((r) => r.allocationId !== row.allocationId));
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
    if (!window.confirm(`Cancel the order for ${row.customerName} — ${row.productName}? It will be removed from Sales Order.`)) return;
    setBusyIds((s) => new Set(s).add(row.allocationId));
    setError(""); setOk("");
    try {
      await API.post(`/allocations/${row.allocationId}/cancel`);
      navigate("/reports/sales-loss");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to cancel this order.");
      setBusyIds((s) => { const n = new Set(s); n.delete(row.allocationId); return n; });
    }
  };

  // ── Edit Allocation actions (System Admin only) ──
  const startEdit = (row) => {
    setEditingRows((s) => new Set(s).add(row.allocationId));
    setEditQtyInputs((s) => ({ ...s, [row.allocationId]: row.allocatedQty || 0 }));
    setEditMeterInputs((s) => ({ ...s, [row.allocationId]: meterOf(row) || "" }));
  };
  const cancelEdit = (row) => {
    setEditingRows((s) => { const n = new Set(s); n.delete(row.allocationId); return n; });
    setEditQtyInputs((s) => { const n = { ...s }; delete n[row.allocationId]; return n; });
    setEditMeterInputs((s) => { const n = { ...s }; delete n[row.allocationId]; return n; });
  };
  const setEditQty = (row, val) => {
    const max = row.requestedQty || 0;
    const clamped = Math.max(0, max > 0 ? Math.min(Number(val) || 0, max) : (Number(val) || 0));
    setEditQtyInputs((s) => ({ ...s, [row.allocationId]: clamped }));
  };
  // PATCHes the SAME allocation record Marketing Review reads/writes
  // (product_allocations, keyed by ProductId+OrderId) — so this edit
  // shows up there for both Admin and System Admin the next time that
  // page loads, not a page-local override.
  const approveEdit = async (row) => {
    const qty = editQtyInputs[row.allocationId] ?? row.allocatedQty ?? 0;
    const meter = editMeterInputs[row.allocationId] ?? (meterOf(row) || "");
    setSavingEditId(row.allocationId);
    setError(""); setOk("");
    try {
      await API.patch(`/allocations/${row.allocationId}/decision`, { allocatedQty: qty, meters: meter });
      // Re-fetch this page's own list from the server (not just an
      // optimistic local patch) so every other view/tab on THIS page
      // (Pending Final Approval, Approved Today, etc.) reflects the real
      // saved value the instant you switch to it, not a stale copy.
      await load();
      cancelEdit(row);
      setOk(`Updated allocation for ${row.productName} (${row.customerName}).`);
      // Marketing Review (Batches.jsx) fetches its own independent copy
      // of this data via loadBoard() — it won't know this edit happened
      // unless told to refetch. A same-tab SPA navigation there will
      // already trigger its own mount-time loadBoard(), but broadcast an
      // explicit refresh signal too, in case that page is already
      // mounted/cached in the background (e.g. kept-alive tabs) and
      // wouldn't otherwise remount and refetch on its own.
      window.dispatchEvent(new CustomEvent("premier-allocation-updated"));
      try { localStorage.setItem("premier_mr_dirty", String(Date.now())); } catch { /* ignore */ }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update this allocation.");
    } finally {
      setSavingEditId(null);
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
    // Admin's "Full Allocation" — the mirror image of Pending Allocation:
    // lines where Allocated Qty has reached (or somehow exceeds) what was
    // Requested. A row with 0 Requested is excluded — nothing to be
    // "full" against.
    if (view === "full_allocation") list = list.filter((r) => (r.requestedQty || 0) > 0 && (r.allocatedQty || 0) >= (r.requestedQty || 0));
    // Admin's "Available Stock" — same full list, ranked by what's left
    // to allocate rather than by value.
    if (view === "available_stock") list = [...list].sort((a, b) => (b.availableQty || 0) - (a.availableQty || 0));
    // System Admin's "ERP SO Created" — safety-net client filter on top
    // of the server-side erp_status param above, in case the backend
    // ever returns a slightly broader set for that param.
    if (view === "erp_so_created") list = list.filter((r) => erpStatusOf(r) === "erp_so_created");
    // Edit Allocation (System Admin) — only rows Admin has actually put
    // some stock against (partial or fully allocated). Nothing left at 0
    // has anything to edit.
    // Edit Allocation — only rows with actual stock allocated AND still
    // pending (approved/rejected rows have nothing left to edit here).
    if (view === "edit_allocation") list = list.filter((r) => (r.allocatedQty || 0) > 0 && r.status === "pending");
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
  // ERP SO Status badge — same visual language as statusBadge() above,
  // just for the erpStatus field (not_transferred / erp_so_created).
  const erpStatusBadge = (row) => {
    const st = erpStatusOf(row);
    if (st === "erp_so_created") {
      return <span style={{ background: "rgba(46,122,114,0.12)", color: "#1E7B4D", border: "1px solid #1E7B4D33", padding: "3px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>ERP SO Created</span>;
    }
    return <span style={{ background: "rgba(140,150,163,0.12)", color: "#526073", border: "1px solid #52607333", padding: "3px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>Not Transferred</span>;
  };

  const statusBadge = (status) => {
    const map = {
      pending: { bg: "rgba(214,148,38,0.12)", color: "#A8701F", label: "Pending" },
      approved: { bg: "rgba(46,122,114,0.12)", color: "#1E7B4D", label: "Approved" },
      rejected: { bg: "rgba(178,58,58,0.12)", color: "#B23A3A", label: "Lost" },
      // "cancelled" is the status handleCancel's endpoint is expected to
      // set — this is what the Rejected Orders tab's rows will carry.
      cancelled: { bg: "rgba(178,58,58,0.12)", color: "#B23A3A", label: "Rejected" },
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
  // "Awaiting Approval" is the one Admin/Super Admin view that still
  // reflects the real approval state (what's sitting with System
  // Admin), not stock position — so it, and every sysadmin-style view
  // (now shared by System Admin and Super Admin alike), use
  // statusBadge() instead.
  const rowStatusBadge = (row) =>
    (isSysAdminStyleView || view === "awaiting_approval") ? statusBadge(row.status) : stockPositionBadge(row);

  return (
    <Layout pageTitle="Sales Order">
      <h1 style={S.heading}>Order details</h1>
      <p style={S.headingSub}>
        {VIEWS.find((v) => v.id === view)?.label} — {isSysAdminStyleView ? "fed by Marketing Review's Final Approval workflow." : "fed by Marketing Review's allocation board."}
        {view === "total_order_value" && ` Total: ${fmtAmt(totalValueSum)} across ${rows.length} line(s).`}
        {view === "today_inquiries" && ` Total: ${rows.length} order line(s).`}
        {view === "pending_allocation" && ` Total: ${visible.length} line(s) still awaiting full allocation.`}
        {view === "full_allocation" && ` Total: ${visible.length} fully allocated line(s).`}
        {view === "available_stock" && ` Total available: ${totalAvailableSum.toLocaleString()} Pcs.`}
        {view === "awaiting_approval" && ` Total: ${rows.length} line(s) awaiting System Admin's decision.`}
        {view === "rejected_orders" && ` Total: ${rows.length} rejected order(s).`}
        {view === "erp_so_created" && ` Total: ${rows.length} order(s) transferred to ERP.`}
        {view === "edit_allocation" && ` Total: ${visible.length} allocated line(s) available to edit.`}
      </p>

      {/* ── View selector (dropdown, same VIEWS list Admin / System Admin
            / Super Admin already had) + search bar — sitting side by
            side instead of a separate button row above. Matches Order
            No, Customer, Customer Code, Product, and Product Code. ── */}
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
        <select
          value={view}
          onChange={(e) => setView(e.target.value)}
          style={S.viewSelect}
        >
          {VIEWS.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        {/* Date filter — Admin / System Admin / Super Admin all get this.
            Overrides the hardcoded "today" that today_inquiries/
            approved_today normally send. */}
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          style={S.dateInput}
        />
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
                  <th style={S.th}>Enquiry No</th>
                  {!isRejectedView && (<><th style={S.th}>Customer</th><th style={S.th}>Customer Code</th></>)}
                  <th style={S.th}>Product</th>
                  {(isEditAlloc || isRejectedView) && <th style={S.th}>Product Code</th>}
                  <th style={S.th}>UOM</th>
                  {!isEditAlloc && !isRejectedView && <th style={S.th}>Product Code</th>}
                  {(!isSysAdminStyleView || view === "edit_allocation") && <th style={S.th}>Requested Qty</th>}
                  {(!isSysAdminStyleView || view === "edit_allocation") && !isEditAlloc && view !== "available_stock" && <th style={S.th}>Available Stock</th>}
                  <th style={S.th}>Allocated Qty</th>
                  <th style={S.th}>Mtr</th>
                  {isSysAdminStyleView && <th style={S.th}>ERP SO Status</th>}
                  <th style={S.th}>Status</th>
                  {(view === "pending_final_approval" || view === "edit_allocation") && <th style={S.th}>Actions</th>}
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
                      {!isRejectedView && (
                        <>
                          <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{r.customerName}</td>
                          <td style={S.td}>{r.customerCode}</td>
                        </>
                      )}
                      <td style={S.td}>{r.productName}</td>
                      {(isEditAlloc || isRejectedView) && <td style={S.td}>{r.productCode}</td>}
                      <td style={S.td}>{uomOf(r) ? uomLabel(uomOf(r)) : "—"}</td>
                      {!isEditAlloc && !isRejectedView && <td style={S.td}>{r.productCode}</td>}
                      {(!isSysAdminStyleView || view === "edit_allocation") && <td style={S.td}>{r.requestedQty ?? "—"}</td>}
                      {(!isSysAdminStyleView || view === "edit_allocation") && !isEditAlloc && view !== "available_stock" && <td style={S.td}>{r.availableQty ?? "—"}</td>}
                      <td style={S.td}>
                        {view === "edit_allocation" && editingRows.has(r.allocationId) ? (
                          <input
                            type="number" min={0} max={r.requestedQty || undefined}
                            value={
                              (editQtyInputs[r.allocationId] ?? r.allocatedQty ?? 0) === 0
                                ? ""
                                : (editQtyInputs[r.allocationId] ?? r.allocatedQty ?? 0)
                            }
                            placeholder="0"
                            onChange={(e) => setEditQty(r, e.target.value)}
                            style={S.editInput}
                          />
                        ) : (
                          r.allocatedQty
                        )}
                      </td>
                      <td style={S.td}>
                        {view === "edit_allocation" && editingRows.has(r.allocationId) ? (
                          <input
                            type="text" placeholder="e.g. 5M"
                            value={editMeterInputs[r.allocationId] ?? ""}
                            onChange={(e) => setEditMeterInputs((s) => ({ ...s, [r.allocationId]: e.target.value }))}
                            style={{ ...S.editInput, textAlign: "center" }}
                          />
                        ) : (
                          meterOf(r) || "—"
                        )}
                      </td>
                      {isSysAdminStyleView && <td style={S.td}>{erpStatusBadge(r)}</td>}
                      <td style={S.td}>{rowStatusBadge(r)}</td>
                      {view === "pending_final_approval" && (
                        <td style={S.td}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => handleCancel(r)}
                              disabled={busy}
                              title="Cancel this order and log it in Sales Loss Report"
                              style={{ ...S.actionBtnReject, ...(busy ? S.actionBtnDisabled : {}) }}
                            >
                              Sale Loss
                            </button>
                            <button
                              onClick={() => handleReject(r)}
                              disabled={!canReject}
                              title={r.status === "pending" ? "Reject this order" : "Only a Pending order can be rejected"}
                              style={{ ...S.actionBtnCancel, ...(canReject ? {} : S.actionBtnDisabled) }}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      )}
                      {view === "edit_allocation" && (
                        <td style={S.td}>
                          {editingRows.has(r.allocationId) ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => approveEdit(r)}
                                disabled={savingEditId === r.allocationId}
                                style={{ ...S.actionBtnApprove, ...(savingEditId === r.allocationId ? S.actionBtnDisabled : {}) }}
                              >
                                {savingEditId === r.allocationId ? "Submitting…" : "Submit"}
                              </button>
                              <button
                                onClick={() => cancelEdit(r)}
                                disabled={savingEditId === r.allocationId}
                                style={{ ...S.actionBtnCancel, ...(savingEditId === r.allocationId ? S.actionBtnDisabled : {}) }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(r)} style={S.actionBtnEdit}>
                              <Pencil size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                              Edit
                            </button>
                          )}
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

    // ── View selector (dropdown) + search bar, side by side. Same look
    // as CustomerOrders.jsx's filterBar/searchWrap/searchIcon/searchInput. ──
    filterBar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 },
    viewSelect: {
      padding: "9px 14px", borderRadius: 10, border: `1px solid ${themeG.border}`,
      background: themeG.card, color: themeG.textMain, fontFamily: FONT, fontSize: 13,
      fontWeight: 600, outline: "none", cursor: "pointer", minWidth: 220,
    },
    searchWrap: { position: "relative", flex: "1 1 260px", maxWidth: 420 },
    searchIcon: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: themeG.textSub },
    searchInput: {
      width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 10,
      border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain,
      fontFamily: FONT, fontSize: 13, outline: "none",
    },
    dateInput: {
      padding: "9px 12px", borderRadius: 10, border: `1px solid ${themeG.border}`,
      background: themeG.card, color: themeG.textMain, fontFamily: FONT, fontSize: 13,
      outline: "none",
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
    table: { width: "100%", minWidth: 1180, tableLayout: "auto", borderCollapse: "collapse" },
    th: { textAlign: "center", fontSize: 10.5, color: "#FFFFFF", background: "#1F3A63", padding: "10px 16px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" },
    td: { padding: "10px 16px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}`, textAlign: "center", whiteSpace: "nowrap" },
    actionBtnReject: { padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(178,58,58,0.35)", background: "rgba(178,58,58,0.08)", color: "#B23A3A", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    actionBtnCancel: { padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(138,90,14,0.35)", background: "rgba(138,90,14,0.08)", color: "#8A5A0E", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    actionBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
    actionBtnEdit: { display: "inline-flex", alignItems: "center", padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(178,58,58,0.35)", background: "rgba(178,58,58,0.08)", color: "#B23A3A", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    actionBtnApprove: { padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(28,122,75,0.35)", background: "rgba(28,122,75,0.08)", color: "#1C7A4B", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    editInput: { width: 76, padding: "5px 8px", borderRadius: 7, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, fontFamily: FONT, fontSize: 13, outline: "none" },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
    alertError: { marginBottom: 18, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" },
    alertOk: { marginBottom: 18, background: "rgba(46,122,114,0.08)", border: "1px solid rgba(46,122,114,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1E7B4D" },
  };
}