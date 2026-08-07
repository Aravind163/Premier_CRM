// src/pages/master/Batches.jsx
//
// Marketing Review — Quantity Allocation + Final Approval console.
// One product currently has live customer demand (Orders in pending/
// approved/processing status); an Admin allocates available stock to each
// customer and clicks "Approval" — that hands every touched row to a
// System Admin as Status = 'pending' (server-side, on product_allocations
// — see AllocationController@store). The System Admin then reviews each
// row with a tick (Approve) / cross (Reject) in the Actions column, can
// leave Remarks, and — once a row is Approved — uses the separate
// "Transfer to ERP" button to push it to ERP (ErpStatus flips to
// 'erp_so_created' only on that explicit click, not automatically the
// moment a row is Approved).
//
// Removed per the latest brief: the "Allot Stock to Customer" side-form,
// the bulk "Auto-Allocate <tab> Items" button, the illustrative Allocation
// Legend panel and Approval Workflow stepper panel — none of these are
// needed any more.
//
// "Inquiry No." is gone — every row now shows the real Order No. Each
// active Order is its own row (a customer with two separate Orders for
// the same product shows up as two lines, not merged into one) — resolved
// server-side in AllocationController@index.
//
// ── PER-ORDER ALLOCATION (fixed) ────────────────────────────────────────
// Previously the underlying allocation (qty/status/remarks/ERP state) was
// still tracked per (Product, Customer) only, with no OrderId on
// product_allocations — so a customer with two active Orders for the same
// product had both rows read off the SAME allocation record. That caused
// two visible bugs:
//   - A brand-new Order could show up already "Rejected" (or carrying a
//     stray Allocated Qty) purely because it inherited an older, unrelated
//     Order's saved status/qty for that customer+product.
//   - Requested vs Allocated could visibly disagree (e.g. "Requested 10,
//     Allocated 12") because the 12 was really the SUM across two orders,
//     shown against just one of their Requested figures.
// Fix: product_allocations now carries OrderId, and the server keys every
// allocation lookup/write by (ProductId, OrderId) — see
// AllocationController@store / @index / @board / @decision etc. Each
// Order is now fully independent: its own AllocatedQty, its own Status,
// its own ERP state. This file's handleSaveAll() below sends one entry
// per Order (orderId + customerId + allocatedQty) instead of the old
// "aggregate by customerId" workaround.
//
// Allocation Status is role-specific:
//   - Admin sees a stock-position read: Fully Allocated / Partial
//     Allocated / Not Allocated / Stock Shortage (purely a function of
//     Allocated vs Requested vs Available — no approve/reject button in
//     this column). Not Allocated = nothing allocated yet but stock is
//     available; Stock Shortage = nothing allocated and none available
//     either. Fully Allocated = green, Partial Allocated = orange, Not
//     Allocated = neutral grey, Stock Shortage = red; the Available Stock
//     figure right next to it is tinted the same color so the two always
//     agree at a glance (see stockColor()).
//   - System Admin sees the real approval state, read-only: Pending /
//     Approved / Rejected (or "Not Submitted" if nothing's been saved for
//     that row yet) — changing it happens only via the Actions column.
//
// System Admin gets three extra columns:
//   1. Actions — a tick (Approve) / cross (Reject), enabled only while the
//      row is Pending. Calls PATCH /allocations/{id}/decision.
//   2. Remarks — a free-text field, saved on blur (independent of the
//      approve/reject decision — can be filled in at any time).
//   3. ERP SO Status — read-only, three states: "Not Transferred" (not
//      yet Approved), "Ready for ERP" (ticked/Approved but not yet
//      pushed), and "ERP SO Created" (after the separate "Transfer to
//      ERP" button pushes every Approved, not-yet-transferred row to ERP
//      in one batch — POST /allocations/bulk-erp-transfer). Approving a
//      row (tick) only sets its Status to Approved and flips this column
//      to "Ready for ERP" — the ERP handoff itself is a later, deliberate
//      click on its own button.
//
// ── CARRY-OVER ALLOCATION FIX ────────────────────────────────────────
// A row's underlying `savedAllocated` figure is CUMULATIVE — it's every
// unit ever allocated to that Order, not just "what's still outstanding".
// Before this fix, the qty input box always showed that full cumulative
// figure, which meant: allocate 700 of 800 → approve → transfer to ERP →
// come back later and the box still shows 700 (correct so far), but
// there's no way to tell the difference between "700 is still sitting
// there waiting to be dealt with" and "700 has ALREADY been fully
// approved + pushed to ERP, and only the remaining 100 is new work".
// Editing the box in that second case silently overwrote the server's
// stored qty with box-value-only instead of adding to it.
//
// Fix: once a row has erpStatus === 'erp_so_created' AND there is still
// outstanding qty against the order (savedAllocated < requested), the
// input box represents a fresh INCREMENT on top of the locked-in base,
// starting at 0 — see allocFor() vs totalAllocFor() below. allocFor() is
// what the editable <input> shows/edits; totalAllocFor() is the real
// cumulative total and is what every other calculation (available stock,
// pending qty, value, status badge, and the payload sent to the server on
// Approval) must use. This also depends on the backend flipping
// ErpStatus back off 'erp_so_created' the next time AllocatedQty
// increases past what was actually transferred — see the note above
// handleSaveAll().
//
// ── "FULLY ALLOCATED BUT BOX SHOWS 0" FIX ─────────────────────────────
// The carry-over reset above used to fire for ANY row at
// erpStatus === 'erp_so_created', including ones that were already fully
// allocated (savedAllocated >= requested) — there's no "new work" left
// on those, so resetting the box to 0 made a row tagged "Fully Allocated"
// look like nothing had been allocated at all (the box, the badge, and
// the Total Value column all visually disagreed). Fixed by only treating
// the row as "start a fresh increment at 0" when it's BOTH at ERP AND
// still short of its requested qty.
//
// ── FULLY-ALLOCATED ROWS ARE NOW VIEW-ONLY (latest) ───────────────────
// Any row whose real cumulative total (totalAllocFor(r)) has reached its
// Requested Qty — for EITHER role, not just Admin — no longer shows an
// editable input at all. It renders as a plain colored number instead
// (green, matching the "Fully Allocated" tag color everywhere else on
// this page), since there's nothing left to type and an editable-but-
// always-clamped-to-max box was misleading. See isFullyAllocated in
// AllocationRow below.
//
// ── PENDING / PARTIALLY ALLOCATED FIRST ─────────────────────────────
// Rows now sort with the ones that still need attention at the very top,
// both in Customer Wise View (visibleRows) and Product Wise View
// (productGroups):
//   - System Admin: Not Submitted / Pending decisions first, then
//     anything still short of its requested qty, then everything else
//     (Approved/Rejected AND fully allocated).
//   - Admin: Not Allocated / Stock Shortage / Partial Allocated first,
//     then Fully Allocated.
// See rowPriority()/groupPriority() below. This is a pure display sort —
// it doesn't change what's selected, saved, or how filters work.
//
// A global search bar sits above the "Showing <tab> items only" note,
// searching product/customer name+code and Order No. across every visible
// row. Region now lists real taluks (GET /locations/taluks, aggregated
// across every district) and Sales Officer lists real End Users / Field
// Officers (GET /employees?role=end_user) — both filter the table.
//
// Product Wise View's header (S.No / Sort No. / Shade No. / Product Code /
// Product Name / Requested / Available / Allocated / Total Value /
// Allocation Status, plus System Admin's Actions / Remarks / ERP SO
// Status) is now ALWAYS fully visible — every product's row shows real
// totals added up across every customer on it, not just Code/Sort/Shade
// with everything else hidden behind a click. Clicking a product still
// expands it to show the per-customer breakdown underneath (Order No.,
// Customer Name, Customer Code, and that customer's own figures), but you
// no longer have to expand just to see a product's numbers. Customer Wise
// View leads with S.No / Order No. / Customer Code / Product Code before
// Customer Name / Product Description. System Admin's Actions cell on the
// totals row is a bulk Approve/Reject scoped to that product's own
// Pending rows; Remarks shows a filled-count (editing stays per-customer,
// inside the expanded rows); ERP SO Status shows "ERP SO Created" once
// every customer on that product has been transferred, "Partially
// Transferred" if only some have, else "Not Transferred". Sort No. is a
// plain running sequence (1, 2, 3…) ordered by Product Code — deliberately
// its own value, not a repeat of the Code; Shade No. falls back to the
// same rotating placeholder list used there when the backend hasn't set
// one. S.No is a simple 1-based row/group index over whatever is currently
// visible (filters/search applied) — purely cosmetic, distinct from Sort
// No. The Product Wise View's expand/collapse chevron now sits in the
// S.No cell (before the row number) rather than next to the Product Code,
// so it's the first thing in the row.
//
// Whenever a row sits between "some allocated" and "fully allocated", a
// dismiss-free alert strip lists every such order (product, order no,
// customer, and the exact remaining/pending qty) right above the table,
// so a partially-fulfilled order is never quietly missed — see
// partialAlerts below. This uses the same requested-vs-allocated math the
// table itself uses, so it also reflects unsaved in-progress edits.
//
// ── NEW ALERT STRIPS (latest) ─────────────────────────────────────────
// System Admin now also sees three more dismiss-free strips, same style
// as partialAlerts: Approved orders, Rejected orders, and orders with
// ERP SO Created — see approvedAlerts / rejectedAlerts / erpCreatedAlerts
// below. Admin (who has no Remarks column of their own — that's System-
// Admin-only) instead sees a strip surfacing any row they've allocated
// stock to that System Admin has left a remark on, so that feedback
// isn't otherwise invisible to them — see adminRemarksAlerts below.
//
// ── ALERTS NOW A POPUP MODAL (latest) ───────────────────────────────
// The above alert strips (partialAlerts / approvedAlerts / rejectedAlerts
// / erpCreatedAlerts / adminRemarksAlerts) no longer render as
// always-visible inline cards above the table. Instead they're grouped
// into a single centered popup dialog (AlertModal below) with OK / Cancel
// buttons that either dismisses it — it auto-opens once after the board
// finishes loading if there's anything to show (see the alertModalOpen
// effect), rather than permanently occupying space on the page.
//
// The four stat cards at the top are ROLE-SPECIFIC (see the two mockups):
//   - System Admin: Pending Final Approval / Approved Orders Today /
//     Total Order Value / ERP Transfer Pending — reflecting the final
//     approval + ERP handoff work that's theirs alone.
//   - Admin: Today's Inquiries / Pending Allocation / Available Stock /
//     Awaiting Approval — reflecting the allocation work that's theirs:
//     how much fresh demand came in, how much of it still needs stock
//     allocated, how much stock is left to allocate with, and how much
//     of what they've already submitted is still sitting with the System
//     Admin. Each card still has a "View Details" link that opens the
//     Sales Order page (`/master/sales-order?view=...`), but Admin's four
//     cards point at a *different* set of view ids than System Admin's —
//     see SalesOrder.jsx, which now branches its tabs/columns by role too.
import { useEffect, useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, PackageCheck, Hourglass, Search,
  Shirt, Layers, Briefcase, LayoutGrid, Send, RotateCcw,
  Zap, ChevronRight, ChevronDown, Check, X, Package, CircleDot, Triangle,
  Ruler, FileDown, Printer, FileText, ArrowUpRight, Truck, AlertTriangle,
} from "lucide-react";
import * as XLSX from "xlsx";
import Layout from "../../components/AppLayout";
import API from "../../services/api";

const ACTIVE_ORDER_STATUSES = ["pending", "approved", "processing"];

// Local draft of in-progress qty/remarks edits — purely a convenience so a
// refresh doesn't lose typing; "Approval" is still what actually persists
// to the server.
const DRAFT_STORAGE_KEY = "premier_mr_draft";

// Allocation Status filter — options shown in the dropdown embedded in
// the table's "Allocation Status" column header, mapped straight onto
// each row's underlying r.status value (pending / approved / rejected).
// Available to both Admin and System Admin, independent of which
// role-specific badge (stock-position vs approval-state) is shown in the
// table body itself.
const ALLOCATION_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

// ── Category tabs ─────────────────────────────────────────────────────
const CLOTH_GROUPS = [
  { id: "dhoti", name: "Dhoti", match: ["dhoti", "dothi", "cotton dhoti grey", "cotton dhoti fabric"], icon: Layers, color: "#1C7A4B", tagBg: "#DCF3E6", tagText: "#1C7A4B" },
  { id: "blouse", name: "Blouse", match: ["blouse"], icon: Shirt, color: "#1E5B95", tagBg: "#DCEAF7", tagText: "#1E5B95" },
  { id: "uniform_shirting", name: "Uniform Shirting", match: ["uniform shirting"], icon: Briefcase, color: "#B2622E", tagBg: "#F7E3D2", tagText: "#B2622E" },
  { id: "uniform_suiting", name: "Uniform Suiting", match: ["uniform suiting"], icon: Ruler, color: "#5B4B8C", tagBg: "#E7E1F5", tagText: "#5B4B8C" },
  { id: "others", name: "Others", match: ["others"], icon: LayoutGrid, color: "#D97706", tagBg: "#FBEAD3", tagText: "#D97706" },
];
const YARN_GROUPS = [
  { id: "bundle", name: "Bundle", match: ["bundle"], icon: Package, color: "#1E5B95", tagBg: "#DCEAF7", tagText: "#1E5B95" },
  { id: "hank", name: "Hank", match: ["hank"], icon: CircleDot, color: "#1C7A4B", tagBg: "#DCF3E6", tagText: "#1C7A4B" },
  { id: "cone", name: "Cone", match: ["cone"], icon: Triangle, color: "#5B4B8C", tagBg: "#E7E1F5", tagText: "#5B4B8C" },
];

const CUSTOM_SUBTYPES_KEY = "premier_custom_subtypes";
const FALLBACK_TAB_COLORS = [
  { color: "#7A5C1C", tagBg: "#F5EBD2", tagText: "#7A5C1C" },
  { color: "#3A6B8C", tagBg: "#DCEEF7", tagText: "#3A6B8C" },
  { color: "#8C3A5C", tagBg: "#F7DCE9", tagText: "#8C3A5C" },
];

function getCategoryGroups() {
  const topCat = (localStorage.getItem("premier_category") || "cloth").toLowerCase();
  const base = topCat === "yarn" ? YARN_GROUPS : CLOTH_GROUPS;

  let custom = {};
  try {
    const raw = localStorage.getItem(CUSTOM_SUBTYPES_KEY);
    custom = raw ? (JSON.parse(raw)[topCat] || {}) : {};
  } catch {
    custom = {};
  }
  const extra = Object.keys(custom)
    .filter((key) => !base.some((g) => g.id === key.toLowerCase()))
    .map((key, i) => ({
      id: key.toLowerCase(),
      name: custom[key]?.label || key,
      match: [key.toLowerCase()],
      icon: LayoutGrid,
      ...FALLBACK_TAB_COLORS[i % FALLBACK_TAB_COLORS.length],
    }));

  return [...base, ...extra];
}

const normalize = (v) => (v ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

const groupFor = (subType, groups) => {
  const c = normalize(subType);
  if (!c) return groups[groups.length - 1];
  const exact = groups.find((g) => g.match.includes(c));
  if (exact) return exact;
  const partial = groups.find((g) => g.match.some((m) => c.includes(m) || m.includes(c)));
  return partial || groups[groups.length - 1];
};
const warehouseFor = (subType) =>
  normalize(subType) === "blouse" ? "Rack Stock" : "EB4 Dispatch Warehouse";

// Sort No. is a running sequence number computed in loadBoard() (ordered
// by Product Code, but a distinct value from it — see sortNoByProduct).
// Shade No. uses the same rotating placeholder list as ProductCatalog.jsx
// / ProductSelection.jsx when the backend hasn't set a real one, so a
// product looks consistent across every screen it appears on.
const DUMMY_SHADE_NOS = ["SH-101", "SH-102", "SH-103", "SH-104", "SH-105", "SH-106"];
// Fallback only — used if a product somehow isn't in the sortNoByProduct
// map built in loadBoard(). The real Sort No. is a running sequence
// number (1, 2, 3…), not the Product Code.
const sortNoFallback = (product) => product?.Code || "—";
const shadeNoFor = (product, seed) => product?.ShadeNo || DUMMY_SHADE_NOS[seed % DUMMY_SHADE_NOS.length];

// Today's date as YYYY-MM-DD, for the "Approved Orders Today" /
// "Today's Inquiries" stats.
const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Stock-position read (Admin's "Allocation Status") ───────────────────
// Fully Allocated = green, Partial Allocated = orange, Not Allocated =
// neutral grey (stock is there, nothing's been assigned to this order
// yet), Stock Shortage = red (nothing allocated AND nothing available).
// Pure functions (no component state), so both the main table and the
// standalone AllocationRow component below can share them, and the
// Available Stock figure can be tinted with the exact same scale via
// stockColor() — see the hex values below, which mirror the .tag-success /
// .tag-pending / .tag-hold / .tag-neutral text colors in index.css.
const stockStatus = (row, available, allocated) => {
  if (allocated <= 0) {
    if (available <= 0) return { label: "Stock Shortage", cls: "tag-hold" };
    return { label: "Not Allocated", cls: "tag-neutral" };
  }
  if (allocated >= row.requested) return { label: "Fully Allocated", cls: "tag-success" };
  return { label: "Partial Allocated", cls: "tag-pending" };
};
const groupStockStatus = (g) => {
  if (g.allocatedSum <= 0) {
    if (g.poolAvailable <= 0) return { label: "Stock Shortage", cls: "tag-hold" };
    return { label: "Not Allocated", cls: "tag-neutral" };
  }
  if (g.allocatedSum >= g.requestedSum) return { label: "Fully Allocated", cls: "tag-success" };
  return { label: "Partial Allocated", cls: "tag-pending" };
};
const stockColor = (requested, available, allocated) => {
  if (allocated <= 0) {
    if (available <= 0) return "#B23A3A"; // matches .tag-hold — Stock Shortage
    return "#6B7785"; // matches .tag-neutral — Not Allocated
  }
  if (allocated >= requested) return "#1C7A4B"; // matches .tag-success — Fully Allocated
  return "#8A5A0E"; // matches .tag-pending — Partial Allocated
};

export default function Batches() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const canManage = ["admin", "system_admin"].includes(role);
  const isSystemAdminRole = role === "system_admin";

  const CATEGORY_GROUPS = useMemo(() => getCategoryGroups(), []);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferringErp, setTransferringErp] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [activeCat, setActiveCat] = useState(() => CATEGORY_GROUPS[0]?.id || "all");
  const [viewBy, setViewBy] = useState("customer");
  const [globalSearch, setGlobalSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [inquiryDate, setInquiryDate] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [officerFilter, setOfficerFilter] = useState("");
  const [allocStatusFilter, setAllocStatusFilter] = useState("");
  const [allocInputs, setAllocInputs] = useState({});
  const [remarksInputs, setRemarksInputs] = useState({});
  const [busyDecision, setBusyDecision] = useState(() => new Set()); // allocationIds mid-request
  const [expandedProducts, setExpandedProducts] = useState({});
  const [selectedRows, setSelectedRows] = useState(() => new Set());

  const [regionOptions, setRegionOptions] = useState([]);
  const [officerOptions, setOfficerOptions] = useState([]);

  // Popup alert modal — replaces the old always-visible inline strips.
  // Auto-opens once (per board load) if there's anything worth showing.
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  // ---- Data loading -----------------------------------------------------
  const loadBoard = async () => {
    setLoading(true); setError("");
    try {
      const boardRes = await API.get("/allocations/board");
      const activeProducts = boardRes.data?.products || [];

      const flat = [];
      activeProducts.forEach((p) => {
        const poolAvailable = Math.max(0, (p.availableQty || 0) - (p.totalAllocated || 0));
        const subType = p.subType || p.category;
        (p.customers || []).forEach((c) => {
          const rowAvailable = poolAvailable + (c.allocatedQty || 0);
          flat.push({
            // Each active Order is now its own row (see
            // AllocationController@index) — key by order, not just
            // customer, so two Orders from the same customer for the
            // same product don't collide/merge in the UI.
            key: `${p.productId}-${c.customerId}-${c.orderId ?? c.orderNo ?? ""}`,
            productId: p.productId,
            customerId: c.customerId,
            orderId: c.orderId || null,
            orderNo: c.orderNo || `${p.code}/${c.code}`,
            productCode: p.code,
            productName: p.name,
            sortNo: p.sortNo ?? sortNoFallback({ Code: p.code }),
            shadeNo: shadeNoFor({ ShadeNo: p.shadeNo }, p.productId),
            category: subType,
            group: groupFor(subType, CATEGORY_GROUPS),
            customerName: c.name,
            customerCode: c.code,
            district: c.district || "",
            taluk: c.taluk || "",
            officerName: c.officerName || "",
            requested: c.orderedQty,
            inquiryDate: c.inquiryDate || null,
            savedAllocated: c.allocatedQty,
            rowAvailable,
            poolAvailable,
            price: p.price || 0,
            warehouse: warehouseFor(subType),
            allocationId: c.allocationId || null,
            status: c.status || null, // pending | approved | rejected | null (not submitted)
            remarks: c.remarks || "",
            erpStatus: c.erpStatus || "not_transferred",
            decidedAt: c.decidedAt || null,
            erpTransferredAt: c.erpTransferredAt || null,
          });
        });
      });
      setRows(flat);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load Marketing Review data.");
    } finally {
      setLoading(false);
    }
  };

  // Region = real taluks, aggregated across every district. Sales Officer
  // = real End Users ("Field Officers") — both power the filter dropdowns.
  // One call each now (no more looping districts one at a time to build
  // up the combined taluk list).
  const loadFilters = async () => {
    try {
      const talukRes = await API.get("/locations/taluks/all");
      setRegionOptions(talukRes.data || []);
    } catch {
      setRegionOptions([]);
    }
    try {
      const empRes = await API.get("/employees", { params: { role: "end_user" } });
      const employees = empRes.data?.data || empRes.data || [];
      setOfficerOptions(employees.map((e) => e.Name || e.name).filter(Boolean));
    } catch {
      setOfficerOptions([]);
    }
  };

  useEffect(() => { loadBoard(); loadFilters(); }, []);
  useEffect(() => { setSelectedRows(new Set()); }, [customerSearch, productSearch, inquiryDate, activeCat, viewBy, globalSearch, regionFilter, officerFilter, allocStatusFilter]);

  // Restore any local draft (qty/remarks not yet Saved & Submitted).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.allocInputs) setAllocInputs(draft.allocInputs);
        if (draft.remarksInputs) setRemarksInputs(draft.remarksInputs);
      }
    } catch {
      // ignore malformed/missing draft
    }
  }, []);

  // ---- Allocation input helpers ------------------------------------------
  // allocFor(row): what the EDITABLE INPUT BOX shows.
  //
  // Only ADMIN's box treats an already-fully-transferred base as "locked
  // in" and starts a fresh increment at 0 — Admin is the one creating new
  // allocations on top of it (see the carry-over-fix note at the top of
  // this file). System Admin never allocates new stock here — they only
  // Approve/Reject/Remark/Transfer — so their box (and every read that
  // depends on it) must always show the REAL, already-submitted total.
  // Resetting it to 0 for System Admin was a bug: a row would show "802
  // total, 0 allocated" in their view even though 802 was genuinely
  // sitting there waiting on their decision.
  //
  // NEW: the increment-starts-at-0 behavior only kicks in when the row is
  // BOTH at ERP AND still short of its requested qty. A row that's
  // already fully allocated (savedAllocated >= requested) has nothing
  // left to add — showing 0 there was the bug reported: it made a row
  // tagged "Fully Allocated" look like nothing had been allocated. Such a
  // row now renders as a plain view-only value in AllocationRow below
  // (see isFullyAllocated), so this only matters for rows that still have
  // outstanding qty.
  const allocFor = (row) => {
    if (row.key in allocInputs) return allocInputs[row.key];
    if (isSystemAdminRole) return row.savedAllocated;
    const hasOutstanding = row.savedAllocated < row.requested;
    return row.erpStatus === "erp_so_created" && hasOutstanding ? 0 : row.savedAllocated;
  };

  // totalAllocFor(row): the REAL cumulative allocated qty for this row —
  // base (already-transferred) + whatever fresh increment sits in Admin's
  // box right now. Every calculation OTHER than Admin's input box itself
  // (available stock, pending qty, value, status badge, the payload sent
  // to the server) must use this, not allocFor().
  const totalAllocFor = (row) => {
    const boxValue = allocFor(row);
    if (isSystemAdminRole) return boxValue; // already the real total for this role
    const hasOutstanding = row.savedAllocated < row.requested;
    return row.erpStatus === "erp_so_created" && hasOutstanding ? row.savedAllocated + boxValue : boxValue;
  };

  const remarksFor = (row) => (row.key in remarksInputs ? remarksInputs[row.key] : (row.remarks || ""));

  // Returns just the single MOST RECENT entry from a list, instead of the
  // whole list — the alert popup shows one line per category (the latest
  // update), not a running history of every order that ever qualified.
  // Sorts by dateField (e.g. decidedAt / erpTransferredAt) when present;
  // falls back to the last item in the list (most recently appended) when
  // no timestamp is available on these entries.
  const mostRecentOne = (list, dateField) => {
    if (list.length === 0) return [];
    if (dateField) {
      const sorted = [...list].sort((a, b) => new Date(b[dateField] || 0) - new Date(a[dateField] || 0));
      return [sorted[0]];
    }
    return [list[list.length - 1]];
  };

  const liveAvailableByProduct = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.productId)) map.set(r.productId, r.poolAvailable);
    });
    rows.forEach((r) => {
      // Compare against the REAL total (base + increment), not just the
      // box value, so an already-transferred base doesn't get double
      // subtracted from — or wrongly credited back to — the live pool.
      const delta = totalAllocFor(r) - r.savedAllocated;
      if (delta !== 0) map.set(r.productId, map.get(r.productId) - delta);
    });
    return map;
  }, [rows, allocInputs]);

  const setAlloc = (row, val) => {
    const liveAvailable = liveAvailableByProduct.get(row.productId) ?? row.poolAvailable;
    const currentBoxVal = allocFor(row);
    // Stock cap: how much more can be added on top of what's already
    // "spent" by this row's current box value.
    const cap = liveAvailable + currentBoxVal;
    // Requested cap: for Admin, once the base is locked in (already at
    // ERP) AND there's still outstanding qty, the box represents a fresh
    // increment and can only cover what's still outstanding against the
    // order — not the full requested qty again. System Admin's box
    // always represents the full total (see allocFor), so it's capped at
    // the full requested qty.
    const hasOutstanding = row.savedAllocated < row.requested;
    const requestedCap = (!isSystemAdminRole && row.erpStatus === "erp_so_created" && hasOutstanding)
      ? Math.max(0, row.requested - row.savedAllocated)
      : row.requested;
    const clamped = Math.max(0, Math.min(Number(val) || 0, cap, requestedCap));
    setAllocInputs((s) => ({ ...s, [row.key]: clamped }));
  };
  const autoAllocateRow = (row) => {
    const liveAvailable = liveAvailableByProduct.get(row.productId) ?? row.poolAvailable;
    const currentBoxVal = allocFor(row);
    const cap = liveAvailable + currentBoxVal;
    const hasOutstanding = row.savedAllocated < row.requested;
    const requestedCap = (!isSystemAdminRole && row.erpStatus === "erp_so_created" && hasOutstanding)
      ? Math.max(0, row.requested - row.savedAllocated)
      : row.requested;
    setAlloc(row, Math.min(requestedCap, cap));
  };

  // ---- Final Approval actions (System Admin) -----------------------------
  const patchRowLocally = (allocationId, patch) => {
    setRows((prev) => prev.map((r) => (r.allocationId === allocationId ? { ...r, ...patch } : r)));
  };

  const decideRow = async (row, decision) => {
    if (!row.allocationId || row.status !== "pending") return;
    setBusyDecision((s) => new Set(s).add(row.allocationId));
    setError(""); setOk("");
    try {
      await API.patch(`/allocations/${row.allocationId}/decision`, { status: decision });
      patchRowLocally(row.allocationId, { status: decision, decidedAt: new Date().toISOString() });
      setOk(decision === "approved" ? "Row approved." : "Row rejected.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save the decision.");
    } finally {
      setBusyDecision((s) => { const n = new Set(s); n.delete(row.allocationId); return n; });
    }
  };
  const saveRemarks = async (row) => {
    if (!row.allocationId) return;
    const text = remarksFor(row);
    if (text === (row.remarks || "")) return; // nothing changed
    try {
      await API.patch(`/allocations/${row.allocationId}/decision`, { remarks: text });
      patchRowLocally(row.allocationId, { remarks: text });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save remarks.");
    }
  };

  // ---- Row selection (System Admin only) ---------------------------------
  const showSelection = isSystemAdminRole;

  const toggleSelectAllRows = (visibleKeys, allCurrentlySelected) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (allCurrentlySelected) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };
  const toggleOneRow = (key) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const bulkDecide = async (decision, eligibleRows) => {
    if (eligibleRows.length === 0) return;
    setError(""); setOk("");
    try {
      await API.post("/allocations/bulk-decision", {
        ids: eligibleRows.map((r) => r.allocationId),
        status: decision,
      });
      eligibleRows.forEach((r) => patchRowLocally(r.allocationId, { status: decision, decidedAt: new Date().toISOString() }));
      setOk(`${eligibleRows.length} row(s) ${decision}.`);
      setSelectedRows(new Set());
    } catch (err) {
      setError(err.response?.data?.message || "Failed to apply the bulk decision.");
    }
  };

  // ---- Filtering / sorting ------------------------------------------------
  const catCounts = useMemo(() => {
    const m = { all: rows.length };
    CATEGORY_GROUPS.forEach((g) => { m[g.id] = 0; });
    rows.forEach((r) => { m[r.group.id] = (m[r.group.id] || 0) + 1; });
    return m;
  }, [rows]);

  // Priority bucket for a single row — 0 sorts before 1, i.e. shows up
  // FIRST in the table. See the "PENDING / PARTIALLY ALLOCATED FIRST"
  // note at the top of this file.
  //   - System Admin: anything not yet submitted or still Pending, OR
  //     still short of its requested qty (allocated < requested), is
  //     urgent (0). Fully-decided AND fully-allocated rows sink to the
  //     bottom (1).
  //   - Admin: Not Allocated / Stock Shortage / Partial Allocated (i.e.
  //     allocated < requested) is urgent (0); Fully Allocated sinks (1).
  // Uses totalAllocFor() so in-progress (unsaved) edits are reflected
  // immediately, same as the status badges and alert strip do.
  const rowPriority = (r) => {
    const allocated = totalAllocFor(r);
    if (isSystemAdminRole) {
      if (!r.allocationId || r.status === "pending") return 0;
      if (allocated < r.requested) return 0;
      return 1;
    }
    return allocated < r.requested ? 0 : 1;
  };

  const visibleRows = useMemo(() => {
    let list = rows;
    if (activeCat !== "all") list = list.filter((r) => r.group.id === activeCat);
    if (globalSearch.trim()) {
      const q = globalSearch.trim().toLowerCase();
      list = list.filter((r) =>
        r.productName.toLowerCase().includes(q) || r.productCode.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) || r.customerCode.toLowerCase().includes(q) ||
        (r.orderNo || "").toLowerCase().includes(q));
    }
    if (customerSearch.trim()) {
      const q = customerSearch.trim().toLowerCase();
      list = list.filter((r) => r.customerName.toLowerCase().includes(q) || r.customerCode.toLowerCase().includes(q));
    }
    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      list = list.filter((r) => r.productName.toLowerCase().includes(q) || r.productCode.toLowerCase().includes(q));
    }
    if (inquiryDate) {
      list = list.filter((r) => r.inquiryDate === inquiryDate);
    }
    if (regionFilter) {
      list = list.filter((r) => r.taluk === regionFilter);
    }
    if (officerFilter) {
      list = list.filter((r) => r.officerName === officerFilter);
    }
    if (allocStatusFilter) {
      list = list.filter((r) => (r.status || "").toLowerCase() === allocStatusFilter);
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      const pa = rowPriority(a), pb = rowPriority(b);
      if (pa !== pb) return pa - pb; // Pending / Partial first
      return viewBy === "customer"
        ? (a.customerName.localeCompare(b.customerName) || a.productCode.localeCompare(b.productCode))
        : (a.productCode.localeCompare(b.productCode) || a.customerName.localeCompare(b.customerName));
    });
    return sorted;
  }, [rows, activeCat, globalSearch, customerSearch, productSearch, inquiryDate, regionFilter, officerFilter, allocStatusFilter, viewBy, allocInputs]);

  const allRowsSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedRows.has(r.key));
  const selectedEligibleForDecision = visibleRows.filter((r) => selectedRows.has(r.key) && r.status === "pending" && r.allocationId);

  // ---- Partial-allocation alerts ------------------------------------
  // Every visible order that has *some* stock allocated but not all of
  // it (i.e. strictly between "Not Allocated" and "Fully Allocated")
  // shows up here — product, order no, customer and the exact remaining
  // qty still owed to that order. Uses totalAllocFor() so it reflects
  // in-progress edits AND an already-transferred base, not just what's
  // sitting in the input box.
  const partialAlerts = useMemo(() => {
    return visibleRows
      .map((r) => ({ r, allocated: totalAllocFor(r) }))
      .filter(({ r, allocated }) => allocated > 0 && allocated < r.requested)
      .map(({ r, allocated }) => ({
        key: r.key,
        productName: r.productName,
        orderNo: r.orderNo,
        customerName: r.customerName,
        remaining: r.requested - allocated,
      }));
  }, [visibleRows, allocInputs]);

  // ---- Approved / Rejected / ERP SO Created alerts (System Admin) ----
  // Same "grouped into the popup" pattern as partialAlerts above, scoped
  // to the currently visible (filtered/searched) rows — gives System
  // Admin a running summary of what they've already decided without
  // having to scroll the full table looking for it.
  const approvedAlerts = useMemo(
    () => visibleRows.filter((r) => r.status === "approved"),
    [visibleRows]
  );
  const rejectedAlerts = useMemo(
    () => visibleRows.filter((r) => r.status === "rejected"),
    [visibleRows]
  );
  const erpCreatedAlerts = useMemo(
    () => visibleRows.filter((r) => r.erpStatus === "erp_so_created"),
    [visibleRows]
  );

  // ---- Admin's remarks alert ------------------------------------------
  // Admin's own table has no Remarks column (that's System-Admin-only),
  // so anything System Admin wrote back on a row Admin allocated stock to
  // would otherwise be invisible to Admin entirely. Surfaces any visible
  // row Admin has put stock against that also carries a remark.
  const adminRemarksAlerts = useMemo(() => {
    if (isSystemAdminRole) return [];
    return visibleRows.filter((r) => totalAllocFor(r) > 0 && (r.remarks || "").trim());
  }, [visibleRows, isSystemAdminRole, allocInputs]);

  // Auto-open the popup once (per board load) if there's anything to show.
  useEffect(() => {
    if (loading) return;
    const hasAlerts = isSystemAdminRole
      ? partialAlerts.length + approvedAlerts.length + rejectedAlerts.length + erpCreatedAlerts.length > 0
      : partialAlerts.length + adminRemarksAlerts.length > 0;
    if (hasAlerts) setAlertModalOpen(true);
    // eslint-disable-next-line
  }, [loading]);

  // ---- Product Wise View grouping ------------------------------------
  const productGroups = useMemo(() => {
    const map = new Map();
    visibleRows.forEach((r) => {
      if (!map.has(r.productId)) {
        map.set(r.productId, {
          productId: r.productId,
          productCode: r.productCode,
          productName: r.productName,
          sortNo: r.sortNo,
          shadeNo: r.shadeNo,
          category: r.category,
          group: r.group,
          poolAvailable: liveAvailableByProduct.get(r.productId) ?? r.poolAvailable,
          requestedSum: 0,
          allocatedSum: 0,
          valueSum: 0,
          rows: [],
        });
      }
      const entry = map.get(r.productId);
      const allocated = totalAllocFor(r);
      entry.requestedSum += r.requested;
      entry.allocatedSum += allocated;
      entry.valueSum += allocated * r.price;
      entry.rows.push(r);
    });
    // Pending / partially-allocated products first — see the
    // "PENDING / PARTIALLY ALLOCATED FIRST" note at the top of this file.
    // A product is "urgent" (0) if ANY of its rows are still urgent, so a
    // product with even one unresolved order stays near the top.
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      const pa = a.rows.some((r) => rowPriority(r) === 0) ? 0 : 1;
      const pb = b.rows.some((r) => rowPriority(r) === 0) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.productCode.localeCompare(b.productCode);
    });
    return groups;
  }, [visibleRows, liveAvailableByProduct, allocInputs]);

  const toggleProductExpanded = (productId) =>
    setExpandedProducts((s) => ({ ...s, [productId]: !s[productId] }));

  // Same read as stockStatus()/groupStockStatus() above, but rolled up
  // across every customer on that product — a single badge when they all
  // agree, otherwise a "Mixed" badge with a small breakdown underneath.
  // System Admin's read: the real, server-persisted approval state.
  const approvalStatus = (row) => {
    if (!row.allocationId) return { label: "Not Submitted", cls: "tag-neutral" };
    if (row.status === "approved") return { label: "Approved", cls: "tag-approved" };
    if (row.status === "rejected") return { label: "Rejected", cls: "tag-hold" };
    return { label: "Pending", cls: "tag-pending" };
  };
  const groupApprovalStatus = (g) => {
    const labels = g.rows.map((r) => approvalStatus(r).label);
    const unique = Array.from(new Set(labels));
    if (unique.length === 1) {
      const only = g.rows[0] ? approvalStatus(g.rows[0]) : { label: unique[0], cls: "tag-neutral" };
      return only;
    }
    const counts = {};
    labels.forEach((l) => { counts[l] = (counts[l] || 0) + 1; });
    return { label: "Mixed", cls: "tag-pending", detail: Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ") };
  };
  // ERP SO Status rolled up across the whole product.
  //   - "Not Transferred": nothing submitted, or none of the submitted
  //     rows are Approved yet (still with System Admin or rejected).
  //   - "Ready for ERP": every submitted row is Approved but none have
  //     been pushed to ERP yet — the tick alone doesn't create the SO,
  //     it just makes the row eligible; "Transfer to ERP" is the actual
  //     handoff.
  //   - "Partially Ready" / "Partially Transferred": a mix.
  //   - "ERP SO Created": every submitted row has been transferred.
  const groupErpStatus = (g) => {
    const submitted = g.rows.filter((r) => r.allocationId);
    if (submitted.length === 0) return { label: "Not Transferred", cls: "tag-neutral" };
    const allTransferred = submitted.every((r) => r.erpStatus === "erp_so_created");
    if (allTransferred) return { label: "ERP SO Created", cls: "tag-approved" };
    const anyTransferred = submitted.some((r) => r.erpStatus === "erp_so_created");
    if (anyTransferred) return { label: "Partially Transferred", cls: "tag-pending" };
    const pendingErp = submitted.filter((r) => r.erpStatus !== "erp_so_created");
    const allReady = pendingErp.every((r) => r.status === "approved");
    if (allReady) return { label: "Ready for ERP", cls: "tag-pending" };
    const anyReady = pendingErp.some((r) => r.status === "approved");
    if (anyReady) return { label: "Partially Ready", cls: "tag-pending" };
    return { label: "Not Transferred", cls: "tag-neutral" };
  };

  const totals = visibleRows.reduce((a, r) => {
    const allocated = totalAllocFor(r);
    return {
      requested: a.requested + r.requested,
      allocated: a.allocated + allocated,
      value: a.value + allocated * r.price,
    };
  }, { requested: 0, allocated: 0, value: 0 });

  const distinctCustomers = new Set(visibleRows.map((r) => r.customerCode)).size;
  const distinctProductsAvailable = useMemo(() => {
    return visibleRows.reduce((map, r) => {
      if (!map.has(r.productId)) {
        map.set(r.productId, liveAvailableByProduct.get(r.productId) ?? (r.rowAvailable - r.savedAllocated));
      }
      return map;
    }, new Map());
  }, [visibleRows, liveAvailableByProduct]);
  const totalStockScope = Array.from(distinctProductsAvailable.values()).reduce((a, v) => a + v, 0);

  // ---- System Admin's four headline stats (page-wide, not just the
  // active tab) — Pending Final Approval / Approved Orders Today / Total
  // Order Value / ERP Transfer Pending. -------------------------------
  const pendingFinalApprovalCount = useMemo(() => rows.filter((r) => r.status === "pending").length, [rows]);
  const approvedTodayCount = useMemo(
    () => rows.filter((r) => r.status === "approved" && (r.decidedAt || "").slice(0, 10) === todayStr()).length,
    [rows]
  );
  const totalOrderValue = useMemo(() => rows.reduce((a, r) => a + r.savedAllocated * r.price, 0), [rows]);
  const erpTransferPendingCount = useMemo(
    () => rows.filter((r) => r.status === "approved" && r.erpStatus !== "erp_so_created").length,
    [rows]
  );

  // ---- Admin's four headline stats (page-wide, not just the active tab)
  // — Today's Inquiries / Pending Allocation / Available Stock / Awaiting
  // Approval. Distinct from System Admin's set above: these describe the
  // allocation work still on Admin's own plate, not the final-approval /
  // ERP-handoff work that belongs to System Admin.
  //   - Today's Inquiries: every active Order line currently on this
  //     board (the day's live demand Admin needs to work through).
  //   - Pending Allocation: lines where the allocated qty hasn't yet
  //     caught up to the requested qty (still needs stock assigned).
  //   - Available Stock: total unallocated stock left across every
  //     product currently on the board (the pool Admin is allocating
  //     from), not scoped to the active category tab or search.
  //   - Awaiting Approval: lines Admin has already submitted ("Approval")
  //     that are still sitting with System Admin as Status = Pending —
  //     same underlying figure as pendingFinalApprovalCount above, just
  //     framed from Admin's side of the workflow.
  const todayInquiriesCount = rows.length;
  const pendingAllocationCount = useMemo(
    () => rows.filter((r) => totalAllocFor(r) < r.requested).length,
    [rows, allocInputs]
  );
  const totalAvailableStockAll = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.productId)) map.set(r.productId, liveAvailableByProduct.get(r.productId) ?? r.poolAvailable);
    });
    return Array.from(map.values()).reduce((a, v) => a + v, 0);
  }, [rows, liveAvailableByProduct]);
  const awaitingApprovalCount = pendingFinalApprovalCount;

  const goToSalesOrder = (view) => navigate(`/master/sales-order?view=${view}`);

  const activeCatLabel = activeCat === "all" ? null : CATEGORY_GROUPS.find((g) => g.id === activeCat)?.name;
  const showCatColumn = activeCat === "all";
  const sysAdminCols = isSystemAdminRole ? 4 : 0; // customer-wise: checkbox + Actions + Remarks + ERP SO Status
  const customerColCount = (showCatColumn ? 12 : 11) + sysAdminCols;
  // Product Wise: S.No + 4 identity columns (Code/Sort No/Shade No/Name
  // collapsed — OrderNo/CustomerName/CustomerCode/spacer when a product is
  // expanded) + optional Category + 5 shared data columns (Requested/
  // Available/Allocated/Value/Status) + (System Admin) Actions/Remarks/ERP
  // SO Status + the select-all checkbox. Every row shape (collapsed
  // totals, sub-header, detail) uses this same column count so they all
  // line up.
  const productColCount = (showSelection ? 1 : 0) + 1 + 4 + (showCatColumn ? 1 : 0) + 5 + (isSystemAdminRole ? 3 : 0);

  // ---- Save / Reset / Draft / Export --------------------------------------
  //
  // IMPORTANT: sends totalAllocFor(r) — the REAL cumulative total (locked
  // base + new increment) — not allocFor(r) (which is just what's sitting
  // in the box). Sending only the box value here is exactly what was
  // causing the 700 to disappear: once the base was locked in at ERP, the
  // box legitimately shows 0/100 for "new work", but the server's
  // AllocatedQty field needs the full 800, not the box's 100.
  //
  // ── PER-ORDER PAYLOAD (fixed) ────────────────────────────────────────
  // Each row is now sent as its OWN entry — orderId + customerId +
  // allocatedQty — instead of the old "aggregate every row by customerId
  // into one number" workaround. That workaround existed because the
  // server used to track only one allocation record per (Product,
  // Customer); it's what caused a customer's second Order for the same
  // product to silently overwrite (or be overwritten by) the first one's
  // qty/status. Now that product_allocations carries OrderId
  // (AllocationController@store keys on (ProductId, OrderId)), every
  // Order gets its own independent record, so each row can — and must —
  // be sent separately.
  const handleSaveAll = async () => {
    setSaving(true); setError(""); setOk("");
    try {
      const byProduct = new Map();
      rows.forEach((r) => {
        if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
        byProduct.get(r.productId).push(r);
      });
      for (const [productId, productRows] of byProduct.entries()) {
        await API.post("/allocations", {
          productId,
          allocations: productRows
            .filter((r) => r.orderId) // every active row should carry an Order id
            .map((r) => ({
              orderId: r.orderId,
              customerId: r.customerId,
              allocatedQty: totalAllocFor(r),
            })),
        });
      }
      // Any remarks typed in (System Admin) that haven't been blurred yet.
      await Promise.all(
        rows.filter((r) => r.allocationId && remarksFor(r) !== (r.remarks || ""))
          .map((r) => API.patch(`/allocations/${r.allocationId}/decision`, { remarks: remarksFor(r) }).catch(() => {}))
      );
      // ERP transfer is a separate, deliberate step now — see
      // handleTransferToErp(); Approval only saves qty/remarks and submits
      // touched rows to System Admin.
      setOk("Allocation saved & submitted for approval.");
      setAllocInputs({});
      setRemarksInputs({});
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      await loadBoard();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save allocation.");
    } finally {
      setSaving(false);
    }
  };

  // System Admin only — pushes every already-Approved, not-yet-transferred
  // row to ERP in one batch. Kept fully separate from Approval: approving
  // a row (tick in Actions) never triggers this on its own any more.
  const handleTransferToErp = async () => {
    const readyForErp = rows.filter((r) => r.allocationId && r.status === "approved" && r.erpStatus !== "erp_so_created");
    if (readyForErp.length === 0) return;
    setTransferringErp(true); setError(""); setOk("");
    try {
      await API.post("/allocations/bulk-erp-transfer", { ids: readyForErp.map((r) => r.allocationId) });
      setOk(`${readyForErp.length} row(s) transferred to ERP.`);
      await loadBoard();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to transfer to ERP.");
    } finally {
      setTransferringErp(false);
    }
  };

  // The bottom-left "Approval" button now does double duty for System
  // Admin: if any rows are checkbox-selected (and at least one of them is
  // actually Pending), it runs the same bulk-approve that used to live in
  // its own "Approve Selected" toolbar. Otherwise it falls through to the
  // normal handleSaveAll() flow (Admin's save-and-submit).
  const handleApprovalClick = () => {
    if (isSystemAdminRole && selectedEligibleForDecision.length > 0) {
      bulkDecide("approved", selectedEligibleForDecision);
      return;
    }
    handleSaveAll();
  };

  const handleReset = () => { setAllocInputs({}); setRemarksInputs({}); };

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ allocInputs, remarksInputs }));
      setOk("Draft saved on this device.");
    } catch {
      setError("Could not save draft (browser storage unavailable).");
    }
  };

  const handleExportExcel = () => {
    const data = visibleRows.map((r) => {
      const available = liveAvailableByProduct.get(r.productId) ?? r.poolAvailable;
      const allocated = totalAllocFor(r);
      const status = isSystemAdminRole ? approvalStatus(r).label : stockStatus(r, available, allocated).label;
      const row = {
        "Order No": r.orderNo,
        "Customer Name": r.customerName,
        "Customer Code": r.customerCode,
        "Product Code": r.productCode,
        "Product Description": r.productName,
        "Requested Qty": r.requested,
        "Available Stock": available,
        "Allocated Qty": allocated,
        "Total Value": Number((allocated * r.price).toFixed(2)),
        "Status": status,
      };
      if (isSystemAdminRole) {
        row["Remarks"] = remarksFor(r);
        row["ERP SO Status"] = r.erpStatus === "erp_so_created" ? "ERP SO Created" : "Not Transferred";
      }
      return row;
    });
    const sheet = XLSX.utils.json_to_sheet(data);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Marketing Review");
    XLSX.writeFile(book, "marketing-review.xlsx");
  };

  const handlePrintSummary = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const rowsHtml = visibleRows.map((r) => {
      const available = liveAvailableByProduct.get(r.productId) ?? r.poolAvailable;
      const allocated = totalAllocFor(r);
      const status = isSystemAdminRole ? approvalStatus(r).label : stockStatus(r, available, allocated).label;
      return `<tr><td>${r.orderNo}</td><td>${r.customerName}</td><td>${r.customerCode}</td><td>${r.productCode}</td><td>${r.productName}</td><td style="text-align:right">${r.requested}</td><td style="text-align:right">${available}</td><td style="text-align:right">${allocated}</td><td style="text-align:right">${(allocated * r.price).toLocaleString()}</td><td>${status}</td></tr>`;
    }).join("");
    win.document.write(`<html><head><title>Marketing Review Summary</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#0F2138}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #DBE3EC;padding:6px 8px;text-align:left}
      th{background:#122C48;color:#fff}
      h1{font-size:18px}</style></head><body>
      <h1>Marketing Review — Allocation Summary</h1>
      <p>Total Requested: ${totals.requested} Pcs · Total Allocated: ${totals.allocated} Pcs · Total Value: ₹${totals.value.toLocaleString()}</p>
      <table><thead><tr><th>Order No</th><th>Customer</th><th>Code</th><th>Product Code</th><th>Product</th><th>Requested</th><th>Available</th><th>Allocated</th><th>Value (₹)</th><th>Status</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <Layout pageTitle="Marketing Review">
      <div className="font-body">
        <div className="mr-grid mr-grid-4 mr-mb-5">
          {isSystemAdminRole ? (
            <>
              <StatCardV2 icon={Hourglass} label="Pending Final Approval" value={pendingFinalApprovalCount} accent="#D69426"
                onViewDetails={() => goToSalesOrder("pending_final_approval")} />
              <StatCardV2 icon={ClipboardList} label="Approved Orders Today" value={approvedTodayCount} accent="#2E6B9E"
                onViewDetails={() => goToSalesOrder("approved_today")} />
              <StatCardV2 icon={PackageCheck} label="Total Order Value" value={`₹${totalOrderValue.toLocaleString()}`} accent="#2E7A72"
                onViewDetails={() => goToSalesOrder("total_order_value")} />
              <StatCardV2 icon={Truck} label="ERP Transfer Pending" value={erpTransferPendingCount} accent="#B23A3A"
                onViewDetails={() => goToSalesOrder("erp_transfer_pending")} />
            </>
          ) : (
            <>
              <StatCardV2 icon={ClipboardList} label="Today's Inquiries" value={todayInquiriesCount} accent="#2E6B9E"
                onViewDetails={() => goToSalesOrder("today_inquiries")} />
              <StatCardV2 icon={Hourglass} label="Pending Allocation" value={pendingAllocationCount} accent="#D69426"
                onViewDetails={() => goToSalesOrder("pending_allocation")} />
              <StatCardV2 icon={PackageCheck} label="Available Stock" value={`${totalAvailableStockAll.toLocaleString()} Pcs`} accent="#2E7A72"
                onViewDetails={() => goToSalesOrder("available_stock")} />
              <StatCardV2 icon={Hourglass} label="Awaiting Approval" value={awaitingApprovalCount} accent="#B23A3A"
                onViewDetails={() => goToSalesOrder("awaiting_approval")} />
            </>
          )}
        </div>

        {error && <div className="tag tag-hold mr-mb-4" style={{ display: "block", padding: "10px 14px" }}>{error}</div>}
        {ok && <div className="tag tag-approved mr-mb-4" style={{ display: "block", padding: "10px 14px" }}>{ok}</div>}

        <div className="card mr-p-3 mr-mb-4">
          <div style={{ display: "flex", flexWrap: "nowrap", gap: "12px", overflowX: "auto" }}>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Inquiry Date</label>
              <input type="date" className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} value={inquiryDate} onChange={(e) => setInquiryDate(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Customer Name</label>
              <input type="text" placeholder="Search Customer" className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Product</label>
              <input type="text" placeholder="Search Product" className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Region</label>
              <select className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
                <option value="">All Regions</option>
                {regionOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Sales Officer</label>
              <select className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} value={officerFilter} onChange={(e) => setOfficerFilter(e.target.value)}>
                <option value="">All</option>
                {officerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="mr-flex mr-items-center mr-gap-2" style={{ marginTop: 20 }}>
            <button className="btn btn-primary btn-sm" onClick={loadBoard}><Search size={12} /> Search</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCustomerSearch(""); setProductSearch(""); setInquiryDate(""); setRegionFilter(""); setOfficerFilter(""); setGlobalSearch(""); setAllocStatusFilter(""); }}>Clear</button>
          </div>
        </div>

        <div className="mr-flex mr-gap-3 mr-flex-wrap mr-mb-4">
          {CATEGORY_GROUPS.map((g) => {
            const Icon = g.icon;
            const active = activeCat === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setActiveCat(g.id)}
                className={`cat-tab ${active ? "active" : ""}`}
                style={{ background: g.color, boxShadow: active ? `0 0 0 2px ${g.color}, 0 0 0 4px #ffffff55` : undefined }}
              >
                <span className="cat-tab-icon"><Icon size={15} color="#fff" /></span>
                <span className="mr-text-left">
                  {g.name}
                  <span className="cat-tab-count">{catCounts[g.id] || 0} Order Lines</span>
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setActiveCat("all")}
            className={`cat-tab ${activeCat === "all" ? "active" : ""}`}
            style={{ background: "#0F2138" }}
          >
            <span className="cat-tab-icon"><LayoutGrid size={15} color="#fff" /></span>
            <span className="mr-text-left">All Orders<span className="cat-tab-count">{catCounts.all || 0} Order Lines</span></span>
          </button>
        </div>

        {/* Global search — sits above the "Showing <tab> items only" note,
            searching product/customer name+code and Order No. across every
            visible row regardless of the field-specific filters above. */}
        <div className="mr-mb-3" style={{ position: "relative", maxWidth: 420 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8C96A3" }} />
          <input
            type="text"
            placeholder="Search product, customer or order no…"
            className="field"
            style={{ width: "100%", boxSizing: "border-box", paddingLeft: 34 }}
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
        </div>

        {/* Alerts (partial allocations, and role-specific approved /
            rejected / ERP-created / remarks summaries) now live in a
            single popup dialog instead of inline strips — see AlertModal
            below. It auto-opens once the board finishes loading if
            there's anything to show; re-open manually if needed. */}
        {/* {(partialAlerts.length > 0 || approvedAlerts.length > 0 || rejectedAlerts.length > 0 || erpCreatedAlerts.length > 0 || adminRemarksAlerts.length > 0) && (
          <div className="mr-mb-3">
            <button className="btn btn-ghost btn-sm" onClick={() => setAlertModalOpen(true)}>
              <AlertTriangle size={12} /> View Alerts
            </button>
          </div>
        )} */}

        <AlertModal
          open={alertModalOpen}
          onClose={() => setAlertModalOpen(false)}
          sections={[
            {
              icon: AlertTriangle, color: "#B2622E",
              title: `${partialAlerts.length} order${partialAlerts.length === 1 ? "" : "s"} partially allocated — stock still owed`,
              items: mostRecentOne(partialAlerts, null),
              renderItem: (a) => (
                <>
                  <b className="text-pine">{a.productName}</b> — Order <b>{a.orderNo}</b> ({a.customerName}):{" "}
                  <span style={{ color: "#B2622E", fontWeight: 600 }}>{a.remaining} Pcs pending</span>
                </>
              ),
            },
            ...(isSystemAdminRole ? [
              {
                icon: Check, color: "#1C7A4B",
                title: `${approvedAlerts.length} order${approvedAlerts.length === 1 ? "" : "s"} approved`,
                items: mostRecentOne(approvedAlerts, "decidedAt"),
                renderItem: (r) => (
                  <>
                    <b className="text-pine">{r.productName}</b> — Order <b>{r.orderNo}</b> ({r.customerName}):{" "}
                    <span style={{ color: "#1C7A4B", fontWeight: 600 }}>{r.savedAllocated} Pcs</span>
                  </>
                ),
              },
              {
                icon: X, color: "#B23A3A",
                title: `${rejectedAlerts.length} order${rejectedAlerts.length === 1 ? "" : "s"} rejected`,
                items: mostRecentOne(rejectedAlerts, "decidedAt"),
                renderItem: (r) => (
                  <>
                    <b className="text-pine">{r.productName}</b> — Order <b>{r.orderNo}</b> ({r.customerName})
                  </>
                ),
              },
              {
                icon: Truck, color: "#2E6B9E",
                title: `${erpCreatedAlerts.length} order${erpCreatedAlerts.length === 1 ? "" : "s"} — ERP SO Created`,
                items: mostRecentOne(erpCreatedAlerts, "erpTransferredAt"),
                renderItem: (r) => (
                  <>
                    <b className="text-pine">{r.productName}</b> — Order <b>{r.orderNo}</b> ({r.customerName}):{" "}
                    <span style={{ fontWeight: 600 }}>{r.savedAllocated} Pcs</span>
                  </>
                ),
              },
            ] : [
              {
                icon: FileText, color: "#5B4B8C",
                title: `${adminRemarksAlerts.length} order${adminRemarksAlerts.length === 1 ? "" : "s"} — System Admin left remarks`,
                items: mostRecentOne(adminRemarksAlerts, null),
                renderItem: (r) => (
                  <>
                    <b className="text-pine">{r.productName}</b> — Order <b>{r.orderNo}</b> ({r.customerName}),{" "}
                    <span style={{ fontWeight: 600 }}>{totalAllocFor(r)} Pcs</span> allocated — "{r.remarks}"
                  </>
                ),
              },
            ]),
          ]}
        />

        {/* View By switch + Export Excel / Print Summary sit directly
            above the table; the "Showing <tab> items only" note sits right
            underneath them, in that same middle band between the filters
            and the table. */}
        <div className="mr-flex mr-items-center mr-gap-4 mr-mb-3 mr-flex-wrap mr-text-sm">
          <span className="text-slate mr-font-medium">View By:</span>
          <label className="mr-flex mr-items-center mr-gap-1 mr-cursor-pointer">
            <input type="radio" checked={viewBy === "product"} onChange={() => setViewBy("product")} /> Product Wise View
          </label>
          <label className="mr-flex mr-items-center mr-gap-1 mr-cursor-pointer">
            <input type="radio" checked={viewBy === "customer"} onChange={() => setViewBy("customer")} /> Customer Wise View
          </label>
          <div className="mr-flex mr-gap-2" style={{ marginLeft: "auto" }}>
            <button onClick={handleExportExcel} className="btn btn-sm btn-excel"><FileDown size={12} /> Export Excel</button>
            <button onClick={handlePrintSummary} className="btn btn-sm btn-print"><Printer size={12} /> Print Summary</button>
          </div>
        </div>
        {activeCatLabel && (
          <div className="mr-mb-3">
            {/* <span className="tag" style={{ background: CATEGORY_GROUPS.find((g) => g.id === activeCat)?.tagBg, color: CATEGORY_GROUPS.find((g) => g.id === activeCat)?.tagText }}>
              Showing {activeCatLabel} items only — other categories are hidden
            </span> */}
          </div>
        )}

        <div className="mr-lg-grid-main">
          <div className="card mr-p-3" style={{ minWidth: 0 }}>
            <div className="mr-overflow-x-auto mr-table-viewport">
            {loading ? (
              <p className="mr-text-center mr-text-sm text-slate mr-py-8">Loading…</p>
            ) : viewBy === "product" ? (
              <table className="data-dark mr-w-full mr-product-table">
                <colgroup>
                  {showSelection && <col style={{ width: 40 }} />}
                  <col style={{ width: 56 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 260 }} />
                  {showCatColumn && <col style={{ width: 110 }} />}
                  <col style={{ width: 110 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 130 }} />
                  {isSystemAdminRole && <col style={{ width: 170 }} />}
                  {isSystemAdminRole && <col style={{ width: 150 }} />}
                  {isSystemAdminRole && <col style={{ width: 90 }} />}
                </colgroup>
                <thead>
                  <tr>
                    {showSelection && (
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          checked={allRowsSelected}
                          onChange={() => toggleSelectAllRows(visibleRows.map((r) => r.key), allRowsSelected)}
                          aria-label="Select all visible rows"
                        />
                      </th>
                    )}
                    <th>S.No</th>
                    <th>Sort No</th>
                    <th>Shade No</th>
                    <th>Product Code</th>
                    <th>Product Name</th>
                    {showCatColumn && <th>Category</th>}
                    <th className="mr-text-right">Requested Qty (Pcs)</th>
                    <th className="mr-text-right">Available Stock (Pcs)</th>
                    <th className="mr-text-right">Allocated Qty (Pcs)</th>
                    <th className="mr-text-right">Total Value (₹)</th>
                    <th><AllocationStatusHeaderFilter value={allocStatusFilter} onChange={setAllocStatusFilter} /></th>
                    {isSystemAdminRole && <th>Remarks</th>}
                    {isSystemAdminRole && <th>ERP SO Status</th>}
                    {isSystemAdminRole && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {productGroups.map((g, gIdx) => {
                    const expanded = !!expandedProducts[g.productId];
                    const groupStatusTag = isSystemAdminRole ? groupApprovalStatus(g) : groupStockStatus(g);
                    const groupPendingRows = g.rows.filter((r) => r.status === "pending" && r.allocationId);
                    const remarksFilledCount = g.rows.filter((r) => (remarksFor(r) || "").trim()).length;
                    const groupErpTag = groupErpStatus(g);
                    const groupPendingQty = g.requestedSum - g.allocatedSum;
                    return (
                      <Fragment key={g.productId}>
                        {/* Always-visible totals row — every customer for
                            this product added together. Click anywhere on
                            it to expand the per-customer breakdown below.
                            The expand/collapse chevron lives in the S.No
                            cell, before the row number. */}
                        <tr className="mr-product-group-row" onClick={() => toggleProductExpanded(g.productId)}>
                          {showSelection && <td></td>}
                          <td className="text-slate">
                            <span className="mr-flex mr-items-center mr-gap-2">
                              <span className="mr-product-chevron">
                                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </span>
                              {gIdx + 1}
                            </span>
                          </td>
                          <td className="text-slate">{g.sortNo}</td>
                          <td className="text-slate">{g.shadeNo}</td>
                          <td>
                            <b className="text-pine">{g.productCode}</b>
                          </td>
                          <td className="mr-font-semibold text-pine">{g.productName}</td>
                          {showCatColumn && (
                            <td><span className="tag mr-font-semibold" style={{ background: g.group.tagBg, color: g.group.tagText }}>{g.group.name}</span></td>
                          )}
                          <td className="mr-font-semibold mr-text-right mr-tabular-nums">{g.requestedSum}</td>
                          <td className="mr-text-right mr-tabular-nums" style={{ color: stockColor(g.requestedSum, g.poolAvailable, g.allocatedSum) }}>
                            {g.poolAvailable}
                          </td>
                          <td className="mr-text-right mr-tabular-nums">{g.allocatedSum}</td>
                          <td className="mr-text-right mr-tabular-nums">
                            ₹{g.valueSum.toLocaleString()}
                            {groupPendingQty > 0 && g.allocatedSum > 0 && (
                              <div className="mr-text-xs" style={{ color: "#D69426" }}>
                                Pending Qty: {groupPendingQty} Pcs
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`tag ${groupStatusTag.cls}`}>{groupStatusTag.label}</span>
                            {groupStatusTag.detail && <div className="mr-text-xs text-slate">{groupStatusTag.detail}</div>}
                          </td>
                          {isSystemAdminRole && (
                            <td className="mr-text-xs text-slate mr-whitespace-nowrap">{remarksFilledCount}/{g.rows.length} added</td>
                          )}
                          {isSystemAdminRole && (
                            <td className="mr-text-xs mr-whitespace-nowrap"><span className={`tag ${groupErpTag.cls}`}>{groupErpTag.label}</span></td>
                          )}
                          {isSystemAdminRole && (
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="mr-flex mr-gap-1">
                                <button
                                  onClick={() => bulkDecide("approved", groupPendingRows)}
                                  disabled={groupPendingRows.length === 0}
                                  title={groupPendingRows.length ? `Approve ${groupPendingRows.length} pending row(s) for this product` : "No pending rows for this product"}
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: "3px 7px" }}
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  onClick={() => bulkDecide("rejected", groupPendingRows)}
                                  disabled={groupPendingRows.length === 0}
                                  title={groupPendingRows.length ? `Reject ${groupPendingRows.length} pending row(s) for this product` : "No pending rows for this product"}
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: "3px 7px", color: "#B23A3A" }}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                        {/* Sub-header — only shown once expanded, labels the
                            per-customer identity columns just below. */}
                        {expanded && (
                          <tr className="mr-subhead-row">
                            {showSelection && <td></td>}
                            <td></td>
                            <td>Order No.</td>
                            <td>Customer Name</td>
                            <td>Customer Code</td>
                            <td></td>
                            {showCatColumn && <td>Category</td>}
                            <td className="mr-text-right">Requested Qty (Pcs)</td>
                            <td className="mr-text-right">Available Stock (Pcs)</td>
                            <td className="mr-text-right">Allocated Qty (Pcs)</td>
                            <td className="mr-text-right">Total Value (₹)</td>
                            <td>Allocation Status</td>
                            {isSystemAdminRole && <td>Remarks</td>}
                            {isSystemAdminRole && <td>ERP SO Status</td>}
                            {isSystemAdminRole && <td>Actions</td>}
                          </tr>
                        )}
                        {expanded && g.rows.map((r) => (
                          <AllocationRow
                            key={r.key}
                            r={r}
                            sNo={null}
                            available={liveAvailableByProduct.get(r.productId) ?? r.poolAvailable}
                            showCatColumn={showCatColumn}
                            showProductCols={false}
                            canManage={canManage}
                            inputValue={allocFor(r)}
                            allocated={totalAllocFor(r)}
                            onAlloc={(v) => setAlloc(r, v)}
                            onAutoAllocate={() => autoAllocateRow(r)}
                            statusTag={isSystemAdminRole ? approvalStatus(r) : stockStatus(r, liveAvailableByProduct.get(r.productId) ?? r.poolAvailable, totalAllocFor(r))}
                            isSystemAdminRole={isSystemAdminRole}
                            busy={busyDecision.has(r.allocationId)}
                            onApprove={() => decideRow(r, "approved")}
                            onReject={() => decideRow(r, "rejected")}
                            remarksValue={remarksFor(r)}
                            onRemarksChange={(v) => setRemarksInputs((s) => ({ ...s, [r.key]: v }))}
                            onRemarksBlur={() => saveRemarks(r)}
                            showSelection={showSelection}
                            selected={selectedRows.has(r.key)}
                            onToggleSelect={() => toggleOneRow(r.key)}
                          />
                        ))}
                      </Fragment>
                    );
                  })}
                  {productGroups.length === 0 && (
                    <tr><td colSpan={productColCount} className="mr-text-center mr-text-sm text-slate mr-py-8">No active order demand in this view.</td></tr>
                  )}
                </tbody>
                {productGroups.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={(showCatColumn ? 6 : 5) + (showSelection ? 1 : 0)}>Total</td>
                      <td className="mr-text-right mr-tabular-nums">{totals.requested}</td>
                      <td></td>
                      <td className="mr-text-right mr-tabular-nums">{totals.allocated}</td>
                      <td className="mr-text-right mr-tabular-nums">₹{totals.value.toLocaleString()}</td>
                      <td></td>
                      {isSystemAdminRole && <><td></td><td></td><td></td></>}
                    </tr>
                  </tfoot>
                )}
              </table>
            ) : (
              <table className="data-dark mr-w-full">

                <thead>
                  <tr>
                    {showSelection && (
                      <th style={{ width: 34 }}>
                        <input
                          type="checkbox"
                          checked={allRowsSelected}
                          onChange={() => toggleSelectAllRows(visibleRows.map((r) => r.key), allRowsSelected)}
                          aria-label="Select all visible rows"
                        />
                      </th>
                    )}
                    <th>S.No</th>
                    <th>Order No.</th>
                    <th>Customer Code</th>
                    <th>Product Code</th>
                    <th>Customer Name</th>
                    <th>Product Description</th>
                    {showCatColumn && <th>Category</th>}
                    <th className="mr-text-right">Requested Qty (Pcs)</th>
                    <th className="mr-text-right">Available Stock (Pcs)</th>
                    <th className="mr-text-right">Allocated Qty (Pcs)</th>
                    <th className="mr-text-right">Total Value (₹)</th>
                    <th><AllocationStatusHeaderFilter value={allocStatusFilter} onChange={setAllocStatusFilter} /></th>
                    {isSystemAdminRole && <th>Remarks</th>}
                    {isSystemAdminRole && <th>ERP SO Status</th>}
                    {isSystemAdminRole && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, idx) => (
                    <AllocationRow
                      key={r.key}
                      r={r}
                      sNo={idx + 1}
                      available={liveAvailableByProduct.get(r.productId) ?? r.poolAvailable}
                      showCatColumn={showCatColumn}
                      showProductCols
                      canManage={canManage}
                      inputValue={allocFor(r)}
                      allocated={totalAllocFor(r)}
                      onAlloc={(v) => setAlloc(r, v)}
                      onAutoAllocate={() => autoAllocateRow(r)}
                      statusTag={isSystemAdminRole ? approvalStatus(r) : stockStatus(r, liveAvailableByProduct.get(r.productId) ?? r.poolAvailable, totalAllocFor(r))}
                      isSystemAdminRole={isSystemAdminRole}
                      busy={busyDecision.has(r.allocationId)}
                      onApprove={() => decideRow(r, "approved")}
                      onReject={() => decideRow(r, "rejected")}
                      remarksValue={remarksFor(r)}
                      onRemarksChange={(v) => setRemarksInputs((s) => ({ ...s, [r.key]: v }))}
                      onRemarksBlur={() => saveRemarks(r)}
                      showSelection={showSelection}
                      selected={selectedRows.has(r.key)}
                      onToggleSelect={() => toggleOneRow(r.key)}
                    />
                  ))}
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={customerColCount} className="mr-text-center mr-text-sm text-slate mr-py-8">No active order demand in this view.</td></tr>
                  )}
                </tbody>
                {visibleRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={(showCatColumn ? 7 : 6) + (showSelection ? 1 : 0)}>Total</td>
                      <td className="mr-text-right mr-tabular-nums">{totals.requested}</td>
                      <td></td>
                      <td className="mr-text-right mr-tabular-nums">{totals.allocated}</td>
                      <td className="mr-text-right mr-tabular-nums">₹{totals.value.toLocaleString()}</td>
                      <td></td>
                      {isSystemAdminRole && <><td></td><td></td><td></td></>}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
            </div>

            {canManage && (
              <div className="mr-flex mr-flex-wrap mr-gap-2 mr-justify-center mr-sticky-actions">
                <button onClick={handleApprovalClick} disabled={saving} className="btn btn-primary btn-sm">
                  <Send size={12} />{" "}
                  {saving
                    ? "Saving…"
                    : isSystemAdminRole && selectedEligibleForDecision.length > 0
                      ? `Approve ${selectedEligibleForDecision.length} Selected`
                      : "Approval"}
                </button>
                <button onClick={handleReset} className="btn btn-sm btn-reset"><RotateCcw size={12} /> Reset Allocation</button>
                {isSystemAdminRole && (
                  <button
                    onClick={handleTransferToErp}
                    disabled={transferringErp || erpTransferPendingCount === 0}
                    title={erpTransferPendingCount === 0 ? "No Approved rows waiting for ERP transfer" : `Transfer ${erpTransferPendingCount} Approved row(s) to ERP`}
                    className="btn btn-sm btn-erp"
                  >
                    <Truck size={12} /> {transferringErp ? "Transferring…" : "Transfer to ERP"}
                  </button>
                )}
                <button onClick={handleSaveDraft} className="btn btn-sm btn-draft"><FileText size={12} /> Save Draft</button>
              </div>
            )}
          </div>

          <div className="mr-flex-col mr-gap-4">
            <SummaryPanel
              title="Allocation Summary"
              rows={[
                { label: "Total Customers", value: distinctCustomers },
                { label: "Total Requested Qty", value: `${totals.requested} Pcs` },
                { label: "Total Allocated Qty", value: `${totals.allocated} Pcs` },
                { label: "Balance Stock", value: `${totalStockScope.toLocaleString()} Pcs` },
                { label: "Pending Final Approval", value: `${pendingFinalApprovalCount} Line(s)`, color: "#D69426" },
                { label: "Total Allocation Value (₹)", value: `₹${totals.value.toLocaleString()}`, color: "#2E7A72" },
              ]}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ── Popup alert modal (replaces the old always-visible inline strips) ──
// Groups every alert category (partial allocations, and — depending on
// role — approved/rejected/ERP-created or remarks-from-System-Admin) into
// one centered dialog with a dimmed backdrop. Renders nothing if there's
// nothing to show. Both OK and Cancel simply dismiss it; clicking the
// backdrop also dismisses it.
function AlertModal({ open, onClose, sections }) {
  const visibleSections = sections.filter((s) => s.items.length > 0);
  if (!open || visibleSections.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,33,56,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 520, width: "92%", maxHeight: "80vh", overflowY: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px", color: "#0F2138" }}>Updates on this page</h3>
        {visibleSections.map((s, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div className="mr-flex mr-items-center mr-gap-2 mr-mb-2">
              <s.icon size={14} color={s.color} />
              <span className="mr-text-sm mr-font-semibold" style={{ color: s.color }}>{s.title}</span>
            </div>
            <div className="mr-flex-col mr-gap-1">
              {s.items.map((item, j) => (
                <div key={j} className="mr-text-xs text-slate">{s.renderItem(item)}</div>
              ))}
            </div>
          </div>
        ))}
        <div className="mr-flex mr-gap-2 mr-justify-center" style={{ marginTop: 20 }}>
          <button className="btn btn-primary btn-sm" onClick={onClose}>OK</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Shared allocation table row ─────────────────────────────────────────
// `inputValue` = what the editable qty box shows/edits (an increment once
// the row is already at ERP and still has outstanding qty). `allocated`
// = the REAL cumulative total (base + increment) — used for the value
// column, Pending Qty text, and (via the parent's statusTag calc) the
// status badge.
function AllocationRow({
  r, sNo, available, showCatColumn, showProductCols, canManage, inputValue, allocated, onAlloc, onAutoAllocate, statusTag,
  isSystemAdminRole, busy, onApprove, onReject, remarksValue, onRemarksChange, onRemarksBlur,
  showSelection, selected, onToggleSelect,
}) {
  const value = allocated * r.price;
  // Cap on the INPUT BOX itself: how much more can still be typed in,
  // given remaining stock and (for Admin, if the base is already at ERP
  // and there's still outstanding qty) remaining outstanding qty against
  // the order. System Admin's box always represents the full total, so
  // it's capped at the full requested qty instead.
  const hasOutstanding = r.savedAllocated < r.requested;
  const requestedCap = (!isSystemAdminRole && r.erpStatus === "erp_so_created" && hasOutstanding)
    ? Math.max(0, r.requested - r.savedAllocated)
    : r.requested;
  const maxAlloc = Math.min(requestedCap, available + inputValue);
  const canDecide = isSystemAdminRole && r.allocationId && r.status === "pending";
  // Fully allocated — for EITHER role — once the real cumulative total
  // has reached the requested qty, there's nothing left to type. Shown as
  // a plain colored value instead of an editable input; the color matches
  // the "Fully Allocated" tag used everywhere else on this page.
  const isFullyAllocated = r.requested > 0 && allocated >= r.requested;
  return (
    <tr>
      {showSelection && (
        <td>
          <input type="checkbox" checked={!!selected} onChange={onToggleSelect} aria-label={`Select allocation row ${r.orderNo}`} />
        </td>
      )}
      <td className="text-slate">{sNo != null ? sNo : ""}</td>
      <td className="mr-text-xs mr-font-semibold text-pine mr-whitespace-nowrap">{r.orderNo}</td>
      {showProductCols ? (
        <>
          <td className="mr-text-xs mr-whitespace-nowrap">{r.customerCode}</td>
          <td className="mr-text-xs mr-whitespace-nowrap">{r.productCode}</td>
          <td className="mr-font-medium">{r.customerName}</td>
          <td className="mr-text-xs">{r.productName}</td>
        </>
      ) : (
        <>
          <td className="mr-font-medium">{r.customerName}</td>
          <td className="mr-text-xs mr-whitespace-nowrap">{r.customerCode}</td>
          <td></td> {/* spacer — lines up with the group row's Product Name column */}
        </>
      )}
      {showCatColumn && (
        <td><span className="tag mr-font-semibold" style={{ background: r.group.tagBg, color: r.group.tagText }}>{r.group.name}</span></td>
      )}
      <td className="mr-font-semibold mr-text-right mr-tabular-nums">{r.requested}</td>
      <td className="mr-text-right mr-tabular-nums" style={{ color: stockColor(r.requested, available, allocated) }}>
        {available}
      </td>
      <td className="mr-text-right">
        {isFullyAllocated ? (
          <span className="mr-font-semibold mr-tabular-nums" style={{ color: "#1C7A4B" }}>
            {allocated}
          </span>
        ) : (
          <div className="mr-flex mr-items-center mr-justify-end mr-gap-1">
            <input
              type="number" min={0} max={maxAlloc}
              value={inputValue === 0 ? "" : inputValue}
              placeholder="0"
              disabled={!canManage}
              onChange={(e) => onAlloc(e.target.value)}
              className="field mr-text-right" style={{ width: 64, padding: "4px 6px" }}
            />
            {canManage && (
              <button title={`Allocate max (${maxAlloc})`} onClick={onAutoAllocate} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
                <Zap size={12} />
              </button>
            )}
          </div>
        )}
      </td>
      <td className="mr-text-right mr-tabular-nums">
        {value.toLocaleString()}
        {allocated < r.requested && allocated > 0 && (
          <div className="mr-text-xs" style={{ color: "#D69426" }}>
            Pending Qty: {r.requested - allocated} Pcs
          </div>
        )}
        {allocated === 0 && (
          <div className="mr-text-xs" style={{ color: available === 0 ? "#B23A3A" : "#6B7785" }}>
            Pending Qty: {r.requested} Pcs
          </div>
        )}
      </td>
      <td><span className={`tag ${statusTag.cls}`}>{statusTag.label}</span></td>
      {isSystemAdminRole && (
        <td style={{ minWidth: 140 }}>
          <input
            type="text"
            placeholder="Add remarks…"
            className="field mr-text-xs"
            style={{ width: "100%", padding: "4px 6px" }}
            value={remarksValue}
            onChange={(e) => onRemarksChange(e.target.value)}
            onBlur={onRemarksBlur}
            disabled={!r.allocationId}
          />
        </td>
      )}
      {isSystemAdminRole && (
        <td className="mr-text-xs mr-whitespace-nowrap">
          {r.erpStatus === "erp_so_created" ? (
            <span className="tag tag-approved">ERP SO Created</span>
          ) : r.status === "approved" ? (
            <span className="tag tag-pending">Ready for ERP</span>
          ) : (
            <span className="tag tag-neutral">Not Transferred</span>
          )}
        </td>
      )}
      {isSystemAdminRole && (
        <td>
          <div className="mr-flex mr-gap-1">
            <button
              onClick={onApprove}
              disabled={!canDecide || busy}
              title={canDecide ? "Approve" : "Only a Pending row can be actioned"}
              className="btn btn-primary btn-sm"
              style={{ padding: "3px 7px" }}
            >
              <Check size={12} />
            </button>
            <button
              onClick={onReject}
              disabled={!canDecide || busy}
              title={canDecide ? "Reject" : "Only a Pending row can be actioned"}
              className="btn btn-ghost btn-sm"
              style={{ padding: "3px 7px", color: "#B23A3A" }}
            >
              <X size={12} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

// Allocation Status filter dropdown, embedded directly in the blue table
// header cell instead of living in the filter bar above the table — same
// options (All / Pending / Approved / Rejected), same underlying
// allocStatusFilter state, just relocated so it reads as "filter this
// column" rather than a generic top-of-page filter. Clicks/changes are
// stopped from bubbling since some header rows sit inside clickable
// (expand/collapse) table structures elsewhere on this page.
function AllocationStatusHeaderFilter({ value, onChange }) {
  return (
    <div className="mr-flex-col" style={{ gap: 4, alignItems: "flex-start" }}>
      <span>Allocation Status</span>
      <select
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: "none",
          letterSpacing: "normal",
          padding: "2px 4px",
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.35)",
          background: "rgba(255,255,255,0.08)",
          color: "#fff",
          outline: "none",
          cursor: "pointer",
        }}
      >
        {ALLOCATION_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} style={{ color: "#0F2138" }}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function StatCardV2({ icon: Icon, label, value, accent, onViewDetails }) {
  return (
    <div className="stat-v2" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <div className="mr-flex mr-items-center mr-gap-3">
        <div className="stat-v2-icon" style={{ background: `${accent}1E` }}>
          <Icon size={19} color={accent} />
        </div>
        <div className="mr-flex-col mr-min-w-0">
          <div className="stat-v2-label">{label}</div>
          <div className="stat-v2-value" style={{ color: accent }}>{value}</div>
        </div>
      </div>
      {onViewDetails && (
        <button onClick={onViewDetails} className="stat-v2-link" style={{ background: "none", border: "none", cursor: "pointer", color: accent, padding: 0 }}>
          View Details <ArrowUpRight size={12} />
        </button>
      )}
    </div>
  );
}

function SummaryPanel({ title, rows }) {
  return (
    <div className="summary-panel">
      {title && <div className="mr-font-semibold mr-text-sm mr-mb-2 text-pine">{title}</div>}
      {rows.map((r, i) => (
        <div className="summary-row" key={i}>
          <span className="label">{r.label}</span>
          <span className="value" style={r.color ? { color: r.color } : undefined}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}