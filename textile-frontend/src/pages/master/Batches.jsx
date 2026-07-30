// src/pages/master/Batches.jsx
//
// Marketing Review — Quantity Allocation + Final Approval console.
// One product currently has live customer demand (Orders in pending/
// approved/processing status); an Admin allocates available stock to each
// customer and clicks "Save & Submit Allocation" — that hands every touched
// row to a System Admin as Status = 'pending' (server-side, on
// product_allocations — see AllocationController@store). The System Admin
// then reviews each row with a tick (Approve) / cross (Reject) in the
// Actions column, can leave Remarks, and once a row is Approved can push it
// to ERP ("Transfer to ERP" -> ErpStatus = 'erp_so_created').
//
// Removed per the latest brief: the "Allot Stock to Customer" side-form,
// the bulk "Auto-Allocate <tab> Items" button, the illustrative Allocation
// Legend panel and Approval Workflow stepper panel — none of these are
// needed any more.
//
// "Inquiry No." is gone — every row now shows the real Order No. (the most
// recent Order's Code for that product+customer pair, resolved server-side
// in AllocationController@index).
//
// Allocation Status is role-specific:
//   - Admin sees a stock-position read: Fully Allocated / Partial
//     Allocated / Stock Shortage (purely a function of Allocated vs
//     Requested vs Available — no approve/reject button in this column).
//   - System Admin sees the real approval state, read-only: Pending /
//     Approved / Rejected (or "Not Submitted" if nothing's been saved for
//     that row yet) — changing it happens only via the Actions column.
//
// System Admin gets three extra columns:
//   1. Actions — a tick (Approve) / cross (Reject), enabled only while the
//      row is Pending. Calls PATCH /allocations/{id}/decision.
//   2. Remarks — a free-text field, saved on blur (independent of the
//      approve/reject decision — can be filled in at any time).
//   3. ERP SO Status — "Not Transferred" while not yet Approved, a
//      "Transfer to ERP" button once Approved (until pushed), then an
//      "ERP SO Created" badge. Calls POST /allocations/{id}/erp-transfer.
//
// A global search bar sits above the "Showing <tab> items only" note,
// searching product/customer name+code and Order No. across every visible
// row. Region now lists real taluks (GET /locations/taluks, aggregated
// across every district) and Sales Officer lists real End Users / Field
// Officers (GET /employees?role=end_user) — both filter the table.
//
// Product Wise View now has two distinct header states instead of one
// fixed thead: collapsed, the table only shows Product Code / Product
// Name / Sort No. / Shade No. (Sort No. mirrors the Product Catalog
// convention of using the Product Code; Shade No. falls back to the same
// rotating placeholder list used there when the backend hasn't set one,
// and is shown last, right next to Sort No.). Expanding a product inserts
// a per-customer detail sub-header directly above its rows — Order No.,
// Customer Name, Customer Code, Requested/Available/Allocated Qty, Total
// Value, Allocation Status, and (System Admin only) Actions / Remarks /
// ERP SO Status — followed by the matching detail rows.
//
// The four stat cards at the top are now: Pending Final Approval, Approved
// Orders Today, Total Order Value, ERP Transfer Pending — each with a
// "View Details" link that opens the Sales Order page pre-filtered to that
// exact slice (`/master/sales-order?view=...`).
//
// Save & Submit Allocation is joined by Save Draft (stores the in-progress
// qty/remarks edits to localStorage so a refresh doesn't lose them),
// Export Excel (CSV download of what's currently visible) and Print
// Summary (opens a print-formatted version of the same).
import { useEffect, useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, PackageCheck, Hourglass, Search,
  Shirt, Layers, Briefcase, LayoutGrid, Send, RotateCcw,
  Zap, ChevronRight, ChevronDown, Check, X, Package, CircleDot, Triangle,
  Footprints, Ruler, FileDown, Printer, FileText, ArrowUpRight, Truck,
} from "lucide-react";
import * as XLSX from "xlsx";
import Layout from "../../components/AppLayout";
import API from "../../services/api";

const ACTIVE_ORDER_STATUSES = ["pending", "approved", "processing"];

// Local draft of in-progress qty/remarks edits — purely a convenience so a
// refresh doesn't lose typing; "Save & Submit Allocation" is still what
// actually persists to the server.
const DRAFT_STORAGE_KEY = "premier_mr_draft";

// ── Category tabs ─────────────────────────────────────────────────────
const CLOTH_GROUPS = [
  { id: "dhoti", name: "Dhoti", match: ["dhoti", "dothi"], icon: Layers, color: "#1C7A4B", tagBg: "#DCF3E6", tagText: "#1C7A4B" },
  { id: "blouse", name: "Blouse", match: ["blouse"], icon: Shirt, color: "#1E5B95", tagBg: "#DCEAF7", tagText: "#1E5B95" },
  { id: "pant", name: "Pant", match: ["pant"], icon: Ruler, color: "#5B4B8C", tagBg: "#E7E1F5", tagText: "#5B4B8C" },
  { id: "shirt", name: "Shirt", match: ["shirt"], icon: Briefcase, color: "#B2622E", tagBg: "#F7E3D2", tagText: "#B2622E" },
  { id: "leggings", name: "Leggings", match: ["leggings"], icon: Footprints, color: "#2E7A72", tagBg: "#D9F0EC", tagText: "#2E7A72" },
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

// Sort No. mirrors the Product Catalog page's convention (Product Code
// doubles as the Sort No.). Shade No. uses the same rotating placeholder
// list as ProductCatalog.jsx / ProductSelection.jsx when the backend
// hasn't set a real one, so a product looks consistent across every screen
// it appears on.
const DUMMY_SHADE_NOS = ["SH-101", "SH-102", "SH-103", "SH-104", "SH-105", "SH-106"];
const sortNoFor = (product) => product?.Code || "—";
const shadeNoFor = (product, seed) => product?.ShadeNo || DUMMY_SHADE_NOS[seed % DUMMY_SHADE_NOS.length];

// Today's date as YYYY-MM-DD, for the "Approved Orders Today" stat.
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Batches() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const canManage = ["admin", "system_admin"].includes(role);
  const isSystemAdminRole = role === "system_admin";

  const CATEGORY_GROUPS = useMemo(() => getCategoryGroups(), []);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const [allocInputs, setAllocInputs] = useState({});
  const [remarksInputs, setRemarksInputs] = useState({});
  const [busyDecision, setBusyDecision] = useState(() => new Set()); // allocationIds mid-request
  const [expandedProducts, setExpandedProducts] = useState({});
  const [selectedRows, setSelectedRows] = useState(() => new Set());

  const [regionOptions, setRegionOptions] = useState([]);
  const [officerOptions, setOfficerOptions] = useState([]);

  // ---- Data loading -----------------------------------------------------
  const loadBoard = async () => {
    setLoading(true); setError("");
    try {
      const res = await API.get("/allocations/board");
      const productsData = res.data || [];

      const flat = [];
      productsData.forEach((p) => {
        const poolAvailable = p.poolAvailable;
        const subType = p.subType;
        (p.customers || []).forEach((c) => {
          const rowAvailable = poolAvailable + (c.allocatedQty || 0);
          flat.push({
            key: `${p.productId}-${c.customerId}`,
            productId: p.productId,
            customerId: c.customerId,
            orderNo: c.orderNo || `${p.code}/${c.code}`,
            productCode: p.code,
            productName: p.name,
            sortNo: sortNoFor(p),
            shadeNo: shadeNoFor(p, p.productId),
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
            status: c.status || null,
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
  const loadFilters = async () => {
    try {
      const res = await API.get("/locations/taluks/all");
      setRegionOptions(res.data || []);
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
  useEffect(() => { setSelectedRows(new Set()); }, [customerSearch, productSearch, inquiryDate, activeCat, viewBy, globalSearch, regionFilter, officerFilter]);

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
  const allocFor = (row) => allocInputs[row.key] ?? row.savedAllocated;
  const remarksFor = (row) => (row.key in remarksInputs ? remarksInputs[row.key] : (row.remarks || ""));

  const liveAvailableByProduct = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.productId)) map.set(r.productId, r.poolAvailable);
    });
    rows.forEach((r) => {
      const delta = allocFor(r) - r.savedAllocated;
      if (delta !== 0) map.set(r.productId, map.get(r.productId) - delta);
    });
    return map;
  }, [rows, allocInputs]);

  const setAlloc = (row, val) => {
    const liveAvailable = liveAvailableByProduct.get(row.productId) ?? row.poolAvailable;
    const cap = liveAvailable + allocFor(row);
    const clamped = Math.max(0, Math.min(Number(val) || 0, cap, row.requested));
    setAllocInputs((s) => ({ ...s, [row.key]: clamped }));
  };
  const autoAllocateRow = (row) => {
    const liveAvailable = liveAvailableByProduct.get(row.productId) ?? row.poolAvailable;
    const cap = liveAvailable + allocFor(row);
    setAlloc(row, Math.min(row.requested, cap));
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

  const transferErp = async (row) => {
    if (!row.allocationId || row.status !== "approved" || row.erpStatus === "erp_so_created") return;
    setBusyDecision((s) => new Set(s).add(row.allocationId));
    setError(""); setOk("");
    try {
      await API.post(`/allocations/${row.allocationId}/erp-transfer`);
      patchRowLocally(row.allocationId, { erpStatus: "erp_so_created", erpTransferredAt: new Date().toISOString() });
      setOk("Transferred to ERP.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to transfer to ERP.");
    } finally {
      setBusyDecision((s) => { const n = new Set(s); n.delete(row.allocationId); return n; });
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

  const bulkTransferErp = async (eligibleRows) => {
    if (eligibleRows.length === 0) return;
    setError(""); setOk("");
    try {
      await API.post("/allocations/bulk-erp-transfer", { ids: eligibleRows.map((r) => r.allocationId) });
      eligibleRows.forEach((r) => patchRowLocally(r.allocationId, { erpStatus: "erp_so_created", erpTransferredAt: new Date().toISOString() }));
      setOk(`${eligibleRows.length} row(s) transferred to ERP.`);
      setSelectedRows(new Set());
    } catch (err) {
      setError(err.response?.data?.message || "Failed to transfer the selected rows to ERP.");
    }
  };

  // ---- Filtering / sorting ------------------------------------------------
  const catCounts = useMemo(() => {
    const m = { all: rows.length };
    CATEGORY_GROUPS.forEach((g) => { m[g.id] = 0; });
    rows.forEach((r) => { m[r.group.id] = (m[r.group.id] || 0) + 1; });
    return m;
  }, [rows]);

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
    const sorted = [...list];
    if (viewBy === "customer") {
      sorted.sort((a, b) => a.customerName.localeCompare(b.customerName) || a.productCode.localeCompare(b.productCode));
    } else {
      sorted.sort((a, b) => a.productCode.localeCompare(b.productCode) || a.customerName.localeCompare(b.customerName));
    }
    return sorted;
  }, [rows, activeCat, globalSearch, customerSearch, productSearch, inquiryDate, regionFilter, officerFilter, viewBy]);

  const allRowsSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedRows.has(r.key));
  const someRowsSelected = visibleRows.some((r) => selectedRows.has(r.key));
  const selectedEligibleForDecision = visibleRows.filter((r) => selectedRows.has(r.key) && r.status === "pending" && r.allocationId);
  const selectedEligibleForErp = visibleRows.filter((r) => selectedRows.has(r.key) && r.status === "approved" && r.erpStatus !== "erp_so_created" && r.allocationId);

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
          poolAvailable: liveAvailableByProduct.get(r.productId) ?? r.poolAvailable,
          rows: [],
        });
      }
      map.get(r.productId).rows.push(r);
    });
    return Array.from(map.values());
  }, [visibleRows, liveAvailableByProduct]);

  const toggleProductExpanded = (productId) =>
    setExpandedProducts((s) => ({ ...s, [productId]: !s[productId] }));

  // Admin's read: purely a function of Allocated vs Requested vs Available.
  const stockStatus = (row, available, allocated) => {
    if (available <= 0 && allocated <= 0) return { label: "Stock Shortage", cls: "tag-hold" };
    if (allocated >= row.requested) return { label: "Fully Allocated", cls: "tag-approved" };
    return { label: "Partial Allocated", cls: "tag-pending" };
  };
  // System Admin's read: the real, server-persisted approval state.
  const approvalStatus = (row) => {
    if (!row.allocationId) return { label: "Not Submitted", cls: "tag-neutral" };
    if (row.status === "approved") return { label: "Approved", cls: "tag-approved" };
    if (row.status === "rejected") return { label: "Rejected", cls: "tag-hold" };
    return { label: "Pending", cls: "tag-pending" };
  };

  const totals = visibleRows.reduce((a, r) => {
    const allocated = allocFor(r);
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

  // ---- Four headline stats (page-wide, not just the active tab) ----------
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

  const goToSalesOrder = (view) => navigate(`/master/sales-order?view=${view}`);

  const activeCatLabel = activeCat === "all" ? null : CATEGORY_GROUPS.find((g) => g.id === activeCat)?.name;
  const showCatColumn = activeCat === "all";
  const sysAdminCols = isSystemAdminRole ? 4 : 0; // checkbox + Actions + Remarks + ERP SO Status
  const productColCount = (showCatColumn ? 9 : 8) + sysAdminCols;
  const customerColCount = (showCatColumn ? 11 : 10) + sysAdminCols;
  // How many extra (unlabeled) columns the wide, expanded detail rows need
  // beyond the 4 real Product Wise headers (Code/Name/Sort No/Shade No) —
  // used to keep the collapsed row AND the header row filling the same
  // total width, so the header never stretches its last real column to
  // cover that space.
  const productHeaderFillerCols = productColCount - (showSelection ? 1 : 0) - 4;

  // ---- Save / Reset / Draft / Export --------------------------------------
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
          allocations: productRows.map((r) => ({ customerId: r.customerId, allocatedQty: allocFor(r) })),
        });
      }
      // Any remarks typed in (System Admin) that haven't been blurred yet.
      await Promise.all(
        rows.filter((r) => r.allocationId && remarksFor(r) !== (r.remarks || ""))
          .map((r) => API.patch(`/allocations/${r.allocationId}/decision`, { remarks: remarksFor(r) }).catch(() => { }))
      );
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
      const allocated = allocFor(r);
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
      const allocated = allocFor(r);
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
          <StatCardV2 icon={Hourglass} label="Pending Final Approval" value={pendingFinalApprovalCount} accent="#D69426"
            onViewDetails={() => goToSalesOrder("pending_final_approval")} />
          <StatCardV2 icon={ClipboardList} label="Approved Orders Today" value={approvedTodayCount} accent="#2E6B9E"
            onViewDetails={() => goToSalesOrder("approved_today")} />
          <StatCardV2 icon={PackageCheck} label="Total Order Value" value={`₹${totalOrderValue.toLocaleString()}`} accent="#2E7A72"
            onViewDetails={() => goToSalesOrder("total_order_value")} />
          <StatCardV2 icon={Truck} label="ERP Transfer Pending" value={erpTransferPendingCount} accent="#B23A3A"
            onViewDetails={() => goToSalesOrder("erp_transfer_pending")} />
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
            <button className="btn btn-ghost btn-sm" onClick={() => { setCustomerSearch(""); setProductSearch(""); setInquiryDate(""); setRegionFilter(""); setOfficerFilter(""); setGlobalSearch(""); }}>Clear</button>
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
            searches product/customer name+code and Order No. across every
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

        <div className="mr-flex mr-items-center mr-gap-4 mr-mb-3 mr-flex-wrap mr-text-sm">
          <span className="text-slate mr-font-medium">View By:</span>
          <label className="mr-flex mr-items-center mr-gap-1 mr-cursor-pointer">
            <input type="radio" checked={viewBy === "product"} onChange={() => setViewBy("product")} /> Product Wise View
          </label>
          <label className="mr-flex mr-items-center mr-gap-1 mr-cursor-pointer">
            <input type="radio" checked={viewBy === "customer"} onChange={() => setViewBy("customer")} /> Customer Wise View
          </label>
          {activeCatLabel && (
            <span className="tag" style={{ background: CATEGORY_GROUPS.find((g) => g.id === activeCat)?.tagBg, color: CATEGORY_GROUPS.find((g) => g.id === activeCat)?.tagText }}>
              Showing {activeCatLabel} items only — other categories are hidden
            </span>
          )}
        </div>

        {showSelection && someRowsSelected && (
          <div
            className="card mr-p-2 mr-mb-3 mr-flex mr-items-center mr-gap-3 mr-flex-wrap"
            style={{ background: "rgba(46,107,158,0.06)", border: "1px solid rgba(46,107,158,0.25)" }}
          >
            <span className="mr-text-xs mr-font-semibold text-pine">{selectedRows.size} selected</span>
            <button
              className="btn btn-primary btn-sm"
              disabled={selectedEligibleForDecision.length === 0}
              onClick={() => bulkDecide("approved", selectedEligibleForDecision)}
              title={selectedEligibleForDecision.length === 0 ? "None of the selected rows are Pending" : undefined}
            >
              Approve {selectedEligibleForDecision.length || ""} Selected
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={selectedEligibleForDecision.length === 0}
              onClick={() => bulkDecide("rejected", selectedEligibleForDecision)}
            >
              Reject Selected
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={selectedEligibleForErp.length === 0}
              onClick={() => bulkTransferErp(selectedEligibleForErp)}
              title={selectedEligibleForErp.length === 0 ? "None of the selected rows are Approved & un-transferred" : undefined}
            >
              Transfer {selectedEligibleForErp.length || ""} to ERP
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRows(new Set())}>Clear selection</button>
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
                    <col style={{ width: 190 }} />
                    <col style={{ width: 420 }} />
                    <col style={{ width: 170 }} />
                    <col style={{ width: 170 }} />
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
                      <th>Product Code</th>
                      <th>Product Name</th>
                      <th>Sort No</th>
                      <th>Shade No</th>
                      {productHeaderFillerCols > 0 && <th colSpan={productHeaderFillerCols}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {productGroups.map((g) => {
                      const expanded = !!expandedProducts[g.productId];
                      const fillerCols = productHeaderFillerCols;
                      return (
                        <Fragment key={g.productId}>
                          <tr className="mr-product-group-row" onClick={() => toggleProductExpanded(g.productId)}>
                            {showSelection && <td></td>}
                            <td>
                              <span className="mr-flex mr-items-center mr-gap-2">
                                <span className="mr-product-chevron">
                                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </span>
                                <b className="text-pine">{g.productCode}</b>
                              </span>
                            </td>
                            <td className="mr-font-semibold text-pine">{g.productName}</td>
                            <td className="text-slate">{g.sortNo}</td>
                            <td className="text-slate">{g.shadeNo}</td>
                            {fillerCols > 0 && <td colSpan={fillerCols}></td>}
                          </tr>
                          {expanded && (
                            <tr className="mr-subhead-row">
                              {showSelection && <td></td>}
                              <td>Order No.</td>
                              <td>Customer Name</td>
                              <td>Customer Code</td>
                              {showCatColumn && <td>Category</td>}
                              <td className="mr-text-right">Requested Qty (Pcs)</td>
                              <td className="mr-text-right">Available Stock (Pcs)</td>
                              <td className="mr-text-right">Allocated Qty (Pcs)</td>
                              <td className="mr-text-right">Total Value (₹)</td>
                              <td>Allocation Status</td>
                              {isSystemAdminRole && <td>Actions</td>}
                              {isSystemAdminRole && <td>Remarks</td>}
                              {isSystemAdminRole && <td>ERP SO Status</td>}
                            </tr>
                          )}
                          {expanded && g.rows.map((r) => (
                            <AllocationRow
                              key={r.key}
                              r={r}
                              available={liveAvailableByProduct.get(r.productId) ?? r.poolAvailable}
                              showCatColumn={showCatColumn}
                              showProductCols={false}
                              canManage={canManage}
                              allocated={allocFor(r)}
                              onAlloc={(v) => setAlloc(r, v)}
                              onAutoAllocate={() => autoAllocateRow(r)}
                              statusTag={isSystemAdminRole ? approvalStatus(r) : stockStatus(r, liveAvailableByProduct.get(r.productId) ?? r.poolAvailable, allocFor(r))}
                              isSystemAdminRole={isSystemAdminRole}
                              busy={busyDecision.has(r.allocationId)}
                              onApprove={() => decideRow(r, "approved")}
                              onReject={() => decideRow(r, "rejected")}
                              remarksValue={remarksFor(r)}
                              onRemarksChange={(v) => setRemarksInputs((s) => ({ ...s, [r.key]: v }))}
                              onRemarksBlur={() => saveRemarks(r)}
                              onTransferErp={() => transferErp(r)}
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
                        <td colSpan={(showCatColumn ? 4 : 3) + (showSelection ? 1 : 0)}>Total</td>
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
                      <th>Order No.</th>
                      <th>Customer Name</th>
                      <th>Customer Code</th>
                      {showCatColumn && <th>Category</th>}
                      <th>Product Code</th>
                      <th>Product Description</th>
                      <th className="mr-text-right">Requested Qty (Pcs)</th>
                      <th className="mr-text-right">Available Stock (Pcs)</th>
                      <th className="mr-text-right">Allocated Qty (Pcs)</th>
                      <th className="mr-text-right">Total Value (₹)</th>
                      <th>Allocation Status</th>
                      {isSystemAdminRole && <th>Actions</th>}
                      {isSystemAdminRole && <th>Remarks</th>}
                      {isSystemAdminRole && <th>ERP SO Status</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <AllocationRow
                        key={r.key}
                        r={r}
                        available={liveAvailableByProduct.get(r.productId) ?? r.poolAvailable}
                        showCatColumn={showCatColumn}
                        showProductCols
                        canManage={canManage}
                        allocated={allocFor(r)}
                        onAlloc={(v) => setAlloc(r, v)}
                        onAutoAllocate={() => autoAllocateRow(r)}
                        statusTag={isSystemAdminRole ? approvalStatus(r) : stockStatus(r, liveAvailableByProduct.get(r.productId) ?? r.poolAvailable, allocFor(r))}
                        isSystemAdminRole={isSystemAdminRole}
                        busy={busyDecision.has(r.allocationId)}
                        onApprove={() => decideRow(r, "approved")}
                        onReject={() => decideRow(r, "rejected")}
                        remarksValue={remarksFor(r)}
                        onRemarksChange={(v) => setRemarksInputs((s) => ({ ...s, [r.key]: v }))}
                        onRemarksBlur={() => saveRemarks(r)}
                        onTransferErp={() => transferErp(r)}
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
              )}
            </div>

            {canManage && (
              <div className="mr-flex mr-flex-wrap mr-gap-2 mr-justify-center mr-sticky-actions">
                <button onClick={handleSaveDraft} className="btn btn-sm btn-draft"><FileText size={12} /> Save Draft</button>
                <button onClick={handleSaveAll} disabled={saving} className="btn btn-primary btn-sm">
                  <Send size={12} /> {saving ? "Saving…" : "Save & Submit Allocation"}
                </button>
                <button onClick={handleReset} className="btn btn-sm btn-reset"><RotateCcw size={12} /> Reset Allocation</button>
                <button onClick={handleExportExcel} className="btn btn-sm btn-excel"><FileDown size={12} /> Export Excel</button>
                <button onClick={handlePrintSummary} className="btn btn-sm btn-print"><Printer size={12} /> Print Summary</button>
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

// ── Shared allocation table row ─────────────────────────────────────────
function AllocationRow({
  r, available, showCatColumn, showProductCols, canManage, allocated, onAlloc, onAutoAllocate, statusTag,
  isSystemAdminRole, busy, onApprove, onReject, remarksValue, onRemarksChange, onRemarksBlur, onTransferErp,
  showSelection, selected, onToggleSelect,
}) {
  const value = allocated * r.price;
  const maxAlloc = Math.min(r.requested, available + allocated);
  const canDecide = isSystemAdminRole && r.allocationId && r.status === "pending";
  return (
    <tr>
      {showSelection && (
        <td>
          <input type="checkbox" checked={!!selected} onChange={onToggleSelect} aria-label={`Select allocation row ${r.orderNo}`} />
        </td>
      )}
      <td className="mr-text-xs mr-font-semibold text-pine mr-whitespace-nowrap">{r.orderNo}</td>
      <td className="mr-font-medium">{r.customerName}</td>
      <td className="mr-text-xs mr-whitespace-nowrap">{r.customerCode}</td>
      {showCatColumn && (
        <td><span className="tag mr-font-semibold" style={{ background: r.group.tagBg, color: r.group.tagText }}>{r.group.name}</span></td>
      )}
      {showProductCols && (
        <>
          <td className="mr-text-xs mr-whitespace-nowrap">{r.productCode}</td>
          <td className="mr-text-xs">{r.productName}</td>
        </>
      )}
      <td className="mr-font-semibold mr-text-right mr-tabular-nums">{r.requested}</td>
      <td className="mr-text-right mr-tabular-nums" style={{ color: available === 0 ? "#B23A3A" : available < 100 ? "#D69426" : undefined }}>
        {available}
      </td>
      <td className="mr-text-right">
        <div className="mr-flex mr-items-center mr-justify-end mr-gap-1">
          <input
            type="number" min={0} max={maxAlloc}
            value={allocated === 0 ? "" : allocated}
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
      </td>
      <td className="mr-text-right mr-tabular-nums">
        {value.toLocaleString()}
        {allocated < r.requested && (
          <div className="mr-text-xs" style={{ color: available === 0 ? "#B23A3A" : "#D69426" }}>
            Pending Qty: {r.requested - allocated} Pcs
          </div>
        )}
      </td>
      <td><span className={`tag ${statusTag.cls}`}>{statusTag.label}</span></td>
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
            <button onClick={onTransferErp} disabled={busy} className="btn btn-secondary btn-sm" style={{ padding: "3px 8px", fontSize: 11 }}>
              <ArrowUpRight size={11} /> Transfer to ERP
            </button>
          ) : (
            <span className="tag tag-neutral">Not Transferred</span>
          )}
        </td>
      )}
    </tr>
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