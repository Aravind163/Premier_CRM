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
// "Transfer to ERP" button to push it to ERP.
//
// Each active Order is its own row, and every allocation is keyed by
// (ProductId, OrderId) on the server, so orders never share qty/status.
//
// Allocation Status is role-specific:
//   - Admin: stock-position read (Fully / Partial / Not Allocated /
//     Stock Shortage).
//   - System Admin: real approval state (Pending / Approved / Rejected /
//     Not Submitted), changed only via the Actions column.
//
// System Admin gets extra columns: Actions, Remarks, ERP SO Status.
//
// Meter column: free-text manual figure per order. Admin edits it (until
// the row is submitted); System Admin only reads it. Available Stock is
// consumed at (Allocated Cases × Allocated Mtr); a row with no Mtr does
// not draw down stock.
//
// Carry-over: savedAllocated is cumulative. For Admin, the qty box is
// always a fresh increment starting at 0; totalAllocFor() is the real
// total (saved + box) and is what every calculation and the save payload
// use. Once Admin has submitted a real number for a row it locks (Cases
// and Meter) until System Admin rejects it.
//
// Rows needing attention sort first (rowPriority). Alerts (partial,
// approved, rejected, ERP created, remarks) show in one popup modal.
// Header filters: UOM and Allocation Status.
//
// ── CHANGE: CD Flag is now a per-row dropdown ──
// The CD Flag cell in every ROW (Customer Wise rows and the expanded
// per-customer rows in Product Wise) is a Yes/No <select>, defaulting to
// "No". State lives in cdFlagInputs (keyed by row.key) and is included in
// Save Draft / Reset. The header cell is unchanged, and a product's
// collapsed totals row shows "—" (one product spans many orders, so it
// can't have a single value). The choice is client-side only for now — it
// is not yet sent to the server on Approval.
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, PackageCheck, Hourglass, Search,
  Shirt, Layers, Briefcase, LayoutGrid, Send, RotateCcw,
  Zap, ChevronRight, ChevronDown, Check, X, Package, CircleDot, Triangle,
  Ruler, FileDown, Printer, FileText, ArrowUpRight, Truck, AlertTriangle,
  ShoppingCart,
} from "lucide-react";
import * as XLSX from "xlsx";
import Layout from "../../components/AppLayout";
import API from "../../services/api";

const ACTIVE_ORDER_STATUSES = ["pending", "approved", "processing"];

// Local draft of in-progress edits — purely a convenience so a refresh
// doesn't lose typing; "Approval" is still what persists to the server.
const DRAFT_STORAGE_KEY = "premier_mr_draft";

const ADMIN_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "fully_allocated", label: "Fully Allocated" },
  { value: "partial_allocated", label: "Partial Allocated" },
  { value: "not_allocated", label: "Not Allocated" },
  { value: "stock_shortage", label: "Stock Shortage" },
];
const SYSADMIN_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

// UOM label override — filtering/storage still uses the real value.
const UOM_LABEL_OVERRIDES = { Meter: "Mtr", Box: "Cases" };
function uomLabel(value) {
  return UOM_LABEL_OVERRIDES[value] || value;
}

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

// Shade No. uses the same rotating placeholder list as the catalog pages
// when the backend hasn't set a real one.
const DUMMY_SHADE_NOS = ["SH-101", "SH-102", "SH-103", "SH-104", "SH-105", "SH-106"];
const sortNoFallback = (product) => product?.Code || "—";
const shadeNoFor = (product, seed) => product?.ShadeNo || DUMMY_SHADE_NOS[seed % DUMMY_SHADE_NOS.length];

// ── Dummy Tax / Payment / Delivery Point (CD Flag is now a real dropdown) ──
const DUMMY_TAX = ["5%", "12%", "18%", "28%"];
const DUMMY_PAYMENT_TERMS = ["Advance", "Credit 15 Days", "Credit 30 Days", "Credit 45 Days"];
const DUMMY_DELIVERY_POINTS = ["Madurai Warehouse", "EB4 Dispatch Warehouse", "Customer Godown", "Direct Ex-Mill"];
function seedFromKey(key) {
  let h = 0;
  const s = String(key || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const dummyTax = (key) => DUMMY_TAX[seedFromKey(key) % DUMMY_TAX.length];
const dummyPayment = (key) => DUMMY_PAYMENT_TERMS[seedFromKey(`${key}-pay`) % DUMMY_PAYMENT_TERMS.length];
const dummyDeliveryPoint = (key) => DUMMY_DELIVERY_POINTS[seedFromKey(`${key}-dp`) % DUMMY_DELIVERY_POINTS.length];

const todayStr = () => new Date().toISOString().slice(0, 10);

const formatEnquiryDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB");
};

const stockStatusKey = (row, available, allocated) => {
  if (allocated <= 0) {
    if (available <= 0) return "stock_shortage";
    return "not_allocated";
  }
  if (allocated >= row.requested) return "fully_allocated";
  return "partial_allocated";
};
const STOCK_STATUS_META = {
  stock_shortage: { label: "Stock Shortage", cls: "tag-hold" },
  not_allocated: { label: "Not Allocated", cls: "tag-neutral" },
  fully_allocated: { label: "Fully Allocated", cls: "tag-success" },
  partial_allocated: { label: "Partial Allocated", cls: "tag-pending" },
};
const approvalStatusKey = (row) => {
  if (!row.allocationId) return "not_submitted";
  if (row.status === "approved") return "approved";
  if (row.status === "rejected") return "rejected";
  return "pending";
};
const APPROVAL_STATUS_META = {
  not_submitted: { label: "Not Submitted", cls: "tag-neutral" },
  pending: { label: "Pending", cls: "tag-pending" },
  approved: { label: "Approved", cls: "tag-approved" },
  rejected: { label: "Rejected", cls: "tag-hold" },
};
const stockStatus = (row, available, allocated) => STOCK_STATUS_META[stockStatusKey(row, available, allocated)];
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
    if (available <= 0) return "#B23A3A"; // Stock Shortage
    return "#6B7785"; // Not Allocated
  }
  if (allocated >= requested) return "#1C7A4B"; // Fully Allocated
  return "#8A5A0E"; // Partial Allocated
};

// Allocated Mtr acts as a per-case stock multiplier (default 1 when blank,
// used for cap calculations only).
const numOr1 = (v) => {
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return !isNaN(n) && n > 0 ? n : 1;
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
  const [enquiryNoSearch, setEnquiryNoSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [inquiryDate, setInquiryDate] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [officerFilter, setOfficerFilter] = useState("");
  const [allocStatusFilter, setAllocStatusFilter] = useState("");
  const [uomStatusFilter, setUomStatusFilter] = useState("");
  const [allocInputs, setAllocInputs] = useState({});
  const [remarksInputs, setRemarksInputs] = useState({});
  // Meter (M) — free-text manual figure per order/row, keyed by row.key.
  const [meterInputs, setMeterInputs] = useState({});
  // CD Flag — per-row Yes/No dropdown, keyed by row.key. Defaults to "No"
  // until changed (see cdFlagFor()).
  const [cdFlagInputs, setCdFlagInputs] = useState({});
  const [busyDecision, setBusyDecision] = useState(() => new Set()); // allocationIds mid-request
  const [expandedProducts, setExpandedProducts] = useState({});
  const [selectedRows, setSelectedRows] = useState(() => new Set());

  const [regionOptions, setRegionOptions] = useState([]);
  const [officerOptions, setOfficerOptions] = useState([]);

  // Popup alert modal — auto-opens once (per board load) if there's anything to show.
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  // ---- Data loading -----------------------------------------------------
  const loadBoard = async () => {
    setLoading(true); setError("");
    try {
      const boardRes = await API.get("/allocations/board");
      const activeProducts = boardRes.data?.products || [];

      const flat = [];
      activeProducts.forEach((p) => {
        const subType = p.subType || p.category;
        const productUom = p.uom || p.UOM || "";
        const customersArr = p.customers || [];
        // Available Stock is consumed at (Allocated Cases × Allocated Mtr);
        // a row with Mtr blank hasn't consumed anything yet.
        const meterMultOf = (c) => {
          const n = parseFloat(String(c.meters || "").replace(/[^\d.]/g, ""));
          return !isNaN(n) && n > 0 ? n : 0;
        };
        const totalConsumed = customersArr.reduce((sum, c) => sum + (c.allocatedQty || 0) * meterMultOf(c), 0);
        const poolAvailable = Math.max(0, (p.availableQty || 0) - totalConsumed);
        customersArr.forEach((c) => {
          const rowAvailable = poolAvailable + (c.allocatedQty || 0) * meterMultOf(c);
          // Each row prefers its own order-level UOM, falling back to the
          // product's master UOM.
          const uom = c.uom || productUom;
          flat.push({
            key: `${p.productId}-${c.customerId}-${c.orderId ?? c.orderNo ?? ""}`,
            productId: p.productId,
            customerId: c.customerId,
            orderId: c.orderId || null,
            orderNo: c.orderNo || `${p.code}/${c.code}`,
            productCode: p.code,
            productName: p.name,
            uom,
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
            meters: c.meters || "",
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

  // Region = real taluks; Sales Officer = real End Users.
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
  useEffect(() => { setSelectedRows(new Set()); }, [customerSearch, enquiryNoSearch, productSearch, inquiryDate, activeCat, viewBy, globalSearch, regionFilter, officerFilter, allocStatusFilter, uomStatusFilter]);

  // Re-fetch when Order Details' "Edit Allocation" tab (SalesOrder.jsx)
  // signals a change — same-tab custom event or cross-tab storage event.
  useEffect(() => {
    const refresh = () => loadBoard();
    const onStorage = (e) => { if (e.key === "premier_mr_dirty") refresh(); };
    window.addEventListener("premier-allocation-updated", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("premier-allocation-updated", refresh);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line
  }, []);

  // System Admin only ever reviews lines Admin has actually submitted
  // with real quantity; Admin keeps using the full, unfiltered `rows`.
  const boardRows = useMemo(() => {
    if (!isSystemAdminRole) return rows;
    return rows.filter((r) => r.allocationId && r.savedAllocated > 0);
  }, [rows, isSystemAdminRole]);

  // Restore any local draft ONCE, and ONLY for rows still live on today's board.
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current || rows.length === 0) return;
    draftRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        const liveKeys = new Set(rows.map((r) => r.key));
        const keepLive = (obj) =>
          Object.fromEntries(Object.entries(obj || {}).filter(([k]) => liveKeys.has(k)));
        if (draft.allocInputs) setAllocInputs(keepLive(draft.allocInputs));
        if (draft.remarksInputs) setRemarksInputs(keepLive(draft.remarksInputs));
        if (draft.meterInputs) setMeterInputs(keepLive(draft.meterInputs));
        if (draft.cdFlagInputs) setCdFlagInputs(keepLive(draft.cdFlagInputs));
      }
    } catch {
      // ignore malformed/missing draft
    }
  }, [rows]);

  // ---- Allocation input helpers ------------------------------------------
  // allocFor(row): what the editable "Allocated Cases" box shows. Admin's
  // box always starts at 0 (a fresh increment) until Admin types; System
  // Admin sees the real saved total.
  const allocFor = (row) => {
    if (row.key in allocInputs) return allocInputs[row.key];
    if (isSystemAdminRole) return row.savedAllocated;
    return 0;
  };

  // totalAllocFor(row): the REAL cumulative total (saved + box for Admin).
  // Every calculation other than the box itself uses this.
  const totalAllocFor = (row) => {
    const boxValue = allocFor(row);
    if (isSystemAdminRole) return boxValue;
    return row.savedAllocated + boxValue;
  };

  const remarksFor = (row) => (row.key in remarksInputs ? remarksInputs[row.key] : (row.remarks || ""));

  // meterFor(row): blank for rows with nothing allocated yet.
  const meterFor = (row) => {
    if (row.key in meterInputs) return meterInputs[row.key];
    if (!isSystemAdminRole && row.savedAllocated === 0) return "";
    return row.meters || "";
  };

  // CD Flag for a row — "No" unless changed.
  const cdFlagFor = (row) => cdFlagInputs[row.key] ?? "No";

  // Returns just the single MOST RECENT entry from a list.
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
      // Available Stock only moves once BOTH Allocated Cases and
      // Allocated Mtr are entered on the row (Cases × Mtr).
      const meterRaw = parseFloat(String(meterFor(r)).replace(/[^\d.]/g, ""));
      const meterMult = !isNaN(meterRaw) && meterRaw > 0 ? meterRaw : 0;
      const delta = (totalAllocFor(r) - r.savedAllocated) * meterMult;
      if (delta !== 0) map.set(r.productId, map.get(r.productId) - delta);
    });
    return map;
  }, [rows, allocInputs, meterInputs]);

  const setAlloc = (row, val) => {
    const liveAvailable = liveAvailableByProduct.get(row.productId) ?? row.poolAvailable;
    const currentBoxVal = allocFor(row);
    const meterMult = numOr1(meterFor(row));
    const cap = Math.floor((liveAvailable + currentBoxVal * meterMult) / meterMult);
    // Admin's box is a fresh increment, so it can only cover what's still
    // outstanding; System Admin's box is the full total.
    const requestedCap = isSystemAdminRole
      ? row.requested
      : Math.max(0, row.requested - row.savedAllocated);
    const clamped = Math.max(0, Math.min(Number(val) || 0, cap, requestedCap));
    setAllocInputs((s) => ({ ...s, [row.key]: clamped }));
  };
  const autoAllocateRow = (row) => {
    const liveAvailable = liveAvailableByProduct.get(row.productId) ?? row.poolAvailable;
    const currentBoxVal = allocFor(row);
    const meterMult = numOr1(meterFor(row));
    const cap = Math.floor((liveAvailable + currentBoxVal * meterMult) / meterMult);
    const requestedCap = isSystemAdminRole
      ? row.requested
      : Math.max(0, row.requested - row.savedAllocated);
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
      loadStockSummary();
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
      loadStockSummary();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to apply the bulk decision.");
    }
  };

  // Rows still "live" once already-handled ones are removed; category tab
  // counts are built from this so a badge matches what you'll see.
  const activeRows = useMemo(() => {
    if (!isSystemAdminRole) {
      return boardRows.filter((r) => !(r.allocationId && r.savedAllocated >= r.requested));
    }
    return boardRows.filter((r) => r.erpStatus !== "erp_so_created");
  }, [boardRows, isSystemAdminRole]);

  const catCounts = useMemo(() => {
    const m = { all: activeRows.length };
    CATEGORY_GROUPS.forEach((g) => { m[g.id] = 0; });
    activeRows.forEach((r) => { m[r.group.id] = (m[r.group.id] || 0) + 1; });
    return m;
  }, [activeRows, CATEGORY_GROUPS]);

  const enquiryNoOptions = useMemo(
    () => Array.from(new Set(boardRows.map((r) => r.orderNo).filter(Boolean))),
    [boardRows]
  );
  const customerNameOptions = useMemo(
    () => Array.from(new Set(boardRows.map((r) => r.customerName).filter(Boolean))),
    [boardRows]
  );

  // UOM filter options: live values merged with the canonical set so the
  // dropdown is never just "All".
  const UOM_FILTER_FALLBACK = ["Box", "Pieces", "Meter"];
  const uomOptions = useMemo(() => {
    const fromData = boardRows.map((r) => r.uom).filter(Boolean);
    const merged = Array.from(new Set([...fromData, ...UOM_FILTER_FALLBACK])).sort();
    return merged.map((u) => ({ value: u, label: UOM_LABEL_OVERRIDES[u] || u }));
  }, [boardRows]);

  // Sort position uses the SAVED allocation, so a row doesn't jump while
  // being edited.
  const rowPriority = (r) => {
    if (isSystemAdminRole) {
      if (!r.allocationId || r.status === "pending") return 0;
      if (r.savedAllocated < r.requested) return 0;
      return 1;
    }
    return r.savedAllocated < r.requested ? 0 : 1;
  };

  const visibleRows = useMemo(() => {
    let list = activeRows;
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
    if (enquiryNoSearch.trim()) {
      const q = enquiryNoSearch.trim().toLowerCase();
      list = list.filter((r) => (r.orderNo || "").toLowerCase().includes(q));
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
      list = list.filter((r) => {
        if (isSystemAdminRole) return approvalStatusKey(r) === allocStatusFilter;
        const available = liveAvailableByProduct.get(r.productId) ?? r.poolAvailable;
        return stockStatusKey(r, available, totalAllocFor(r)) === allocStatusFilter;
      });
    }
    if (uomStatusFilter) {
      list = list.filter((r) => r.uom === uomStatusFilter);
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
  }, [activeRows, activeCat, globalSearch, customerSearch, productSearch, inquiryDate, regionFilter, officerFilter, allocStatusFilter, uomStatusFilter, enquiryNoSearch, viewBy, allocInputs, liveAvailableByProduct]);
  const allRowsSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedRows.has(r.key));
  const selectedEligibleForDecision = visibleRows.filter((r) => selectedRows.has(r.key) && r.status === "pending" && r.allocationId);

  // ---- Partial-allocation alerts ------------------------------------
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
          uom: r.uom,
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
    // A product is "urgent" (0) if ANY of its rows are still urgent.
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      const pa = a.rows.some((r) => rowPriority(r) === 0) ? 0 : 1;
      const pb = b.rows.some((r) => rowPriority(r) === 0) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.productCode.localeCompare(b.productCode);
    });
    return groups;
  }, [visibleRows, liveAvailableByProduct, allocInputs]);

  // Sum of every valid numeric Meter value across a product group's rows.
  const groupMeterTotal = (g) => {
    const vals = g.rows
      .map((r) => parseFloat(String(meterFor(r)).replace(/[^\d.]/g, "")))
      .filter((v) => !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  const toggleProductExpanded = (productId) =>
    setExpandedProducts((s) => ({ ...s, [productId]: !s[productId] }));

  const approvalStatus = (row) => APPROVAL_STATUS_META[approvalStatusKey(row)];
  // Rolled-up approval status for a product group: Pending beats
  // Approved beats Rejected.
  const groupApprovalStatus = (g) => {
    const keys = g.rows.map((r) => approvalStatusKey(r));
    if (keys.some((k) => k === "pending" || k === "not_submitted")) {
      return APPROVAL_STATUS_META.pending;
    }
    if (keys.some((k) => k === "approved")) {
      return APPROVAL_STATUS_META.approved;
    }
    return APPROVAL_STATUS_META.rejected;
  };

  // ERP SO Status rolled up across the whole product.
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

  // ---- System Admin's four headline stats (page-wide) ----------------
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

  // ---- Admin's four headline stats (page-wide) -----------------------
  const todayInquiriesCount = rows.length;
  const pendingAllocationCount = useMemo(
    () => rows.filter((r) => totalAllocFor(r) < r.requested).length,
    [rows, allocInputs]
  );

  // Grand total stock per garment type — fetched on mount and re-fetched
  // after an allocation is saved/approved.
  const CAT_TO_STOCK_LABEL = {
    dhoti: "Dhoti", blouse: "Blouse", uniform_shirting: "Uniform Shirting",
    uniform_suiting: "Uniform Suiting", others: "Others", all: "all",
  };
  const [stockSummary, setStockSummary] = useState({});
  const loadStockSummary = () => {
    API.get("/products/available-stock-summary")
      .then((res) => setStockSummary(res.data || {}))
      .catch(() => {}); // card just shows 0 if this fails — non-critical
  };
  useEffect(() => { loadStockSummary(); }, []);
  const totalAvailableStockAll = stockSummary[CAT_TO_STOCK_LABEL[activeCat] || "all"] || 0;

  const awaitingApprovalCount = pendingFinalApprovalCount;

  const goToSalesOrder = (view) => navigate(`/master/sales-order?view=${view}`);

  const activeCatLabel = activeCat === "all" ? null : CATEGORY_GROUPS.find((g) => g.id === activeCat)?.name;
  const showCatColumn = activeCat === "all";
  const customerColCount = isSystemAdminRole
    ? 18 + (showCatColumn ? 1 : 0)
    : 16 + (showCatColumn ? 1 : 0);
  const productColCount = (showSelection ? 1 : 0) + 1 + 1 + 4 + 1 + (showCatColumn ? 1 : 0) + 5 + 4 + (isSystemAdminRole ? 3 : 0);

  // ---- Save / Reset / Draft / Export --------------------------------------
  //
  // Sends totalAllocFor(r) — the REAL cumulative total — not just the box
  // value. Each row is sent as its own entry (orderId + customerId +
  // allocatedQty + meters), and only rows Admin typed a NEW number into
  // THIS SESSION are submitted.
  //
  // NOTE: cdFlag is not sent yet. To persist it, add `cdFlag: cdFlagFor(r)`
  // to the allocation entry below and a matching column on the backend.
  const handleSaveAll = async () => {
    setSaving(true); setError(""); setOk("");
    try {
      const byProduct = new Map();
      rows.forEach((r) => {
        if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
        byProduct.get(r.productId).push(r);
      });

      // Track per-product results so one failure doesn't abort the rest.
      const productErrors = [];
      let anySubmitted = false;

      for (const [productId, productRows] of byProduct.entries()) {
        const toSubmit = productRows.filter(
          (r) => r.orderId && r.key in allocInputs && Number(allocInputs[r.key]) > 0
        );
        if (toSubmit.length === 0) continue;
        try {
          await API.post("/allocations", {
            productId,
            allocations: toSubmit.map((r) => ({
              orderId: r.orderId,
              customerId: r.customerId,
              allocatedQty: totalAllocFor(r),
              meters: meterFor(r),
            })),
          });
          anySubmitted = true;
        } catch (err) {
          const productName = productRows[0]?.productName || `Product ${productId}`;
          const msg = err.response?.data?.message || "Failed to save.";
          productErrors.push(`${productName}: ${msg}`);
        }
      }

      // Any remarks typed in (System Admin) that haven't been blurred yet.
      await Promise.all(
        rows.filter((r) => r.allocationId && remarksFor(r) !== (r.remarks || ""))
          .map((r) => API.patch(`/allocations/${r.allocationId}/decision`, { remarks: remarksFor(r) }).catch(() => { }))
      );

      // ERP transfer is a separate, deliberate step — see handleTransferToErp().
      if (anySubmitted) {
        setAllocInputs({});
        setRemarksInputs({});
        setMeterInputs({});
        setCdFlagInputs({});
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        // Signal any open System Admin tabs to refresh their board.
        try { localStorage.setItem("premier_mr_dirty", Date.now().toString()); } catch { /* ignore */ }
        await loadBoard();
        loadStockSummary();
      }

      if (productErrors.length > 0) {
        setError(
          (anySubmitted ? "Some products saved. Errors:\n" : "") +
          productErrors.join("\n")
        );
      } else {
        setOk("Allocation saved & submitted for approval.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save allocation.");
    } finally {
      setSaving(false);
    }
  };

  // System Admin only — pushes every already-Approved, not-yet-transferred
  // row to ERP in one batch.
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

  // For System Admin with checkbox-selected Pending rows, "Approval" runs
  // a bulk-approve; otherwise it's Admin's save-and-submit.
  const handleApprovalClick = () => {
    if (isSystemAdminRole && selectedEligibleForDecision.length > 0) {
      bulkDecide("approved", selectedEligibleForDecision);
      return;
    }
    handleSaveAll();
  };

  const handleReset = () => { setAllocInputs({}); setRemarksInputs({}); setMeterInputs({}); setCdFlagInputs({}); };

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ allocInputs, remarksInputs, meterInputs, cdFlagInputs }));
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
        "UOM": r.uom ? uomLabel(r.uom) : "",
        "Requested Qty": r.requested,
        "Available Stock": available,
        "Allocated Qty": allocated,
        "Meter (M)": meterFor(r),
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
      return `<tr><td>${r.orderNo}</td><td>${r.customerName}</td><td>${r.customerCode}</td><td>${r.productCode}</td><td>${r.productName}</td><td>${r.uom ? uomLabel(r.uom) : "—"}</td><td style="text-align:right">${r.requested}</td><td style="text-align:right">${available}</td><td style="text-align:right">${allocated}</td><td style="text-align:center">${meterFor(r) || "—"}</td><td>${status}</td></tr>`;
    }).join("");
    win.document.write(`<html><head><title>Marketing Review Summary</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#0F2138}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #DBE3EC;padding:6px 8px;text-align:left}
      th{background:#122C48;color:#fff}
      h1{font-size:18px}</style></head><body>
      <h1>Marketing Review — Allocation Summary</h1>
      <p>Total Requested: ${totals.requested} Pcs · Total Allocated: ${totals.allocated} Pcs</p>
      <table><thead><tr><th>Order No</th><th>Customer</th><th>Code</th><th>Product Code</th><th>Product</th><th>UOM</th><th>Requested</th><th>Available</th><th>Allocated</th><th>Meter (M)</th><th>Status</th></tr></thead>
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
              <StatCardV2 icon={PackageCheck} label="Available Stock" value={`${totalAvailableStockAll.toLocaleString()} Mtr`} accent="#2E7A72"
                onViewDetails={() => navigate("/master/available-stock")} />
              <StatCardV2 icon={Hourglass} label="Awaiting Approval" value={awaitingApprovalCount} accent="#B23A3A"
                onViewDetails={() => goToSalesOrder("awaiting_approval")} />
            </>
          )}
        </div>

        {error && <div className="tag tag-hold mr-mb-4" style={{ display: "block", padding: "10px 14px" }}>{error}</div>}
        {ok && <div className="tag tag-approved mr-mb-4" style={{ display: "block", padding: "10px 14px" }}>{ok}</div>}

        <div className="card mr-p-3 mr-mb-4">
          <div style={{ display: "flex", flexWrap: "nowrap", gap: "12px", overflowX: "auto", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Enquiry Date</label>
              <input type="date" className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", borderColor: "#9AA7B5" }} value={inquiryDate} onChange={(e) => setInquiryDate(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Enquiry No</label>
              <AutocompleteInput
                value={enquiryNoSearch}
                onChange={setEnquiryNoSearch}
                options={enquiryNoOptions}
                placeholder="Search Enquiry No"
              />
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Customer Name</label>
              <AutocompleteInput
                value={customerSearch}
                onChange={setCustomerSearch}
                options={customerNameOptions}
                placeholder="Search Customer"
              />
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Region</label>
              <select className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", borderColor: "#9AA7B5" }} value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
                <option value="">All Regions</option>
                {regionOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Sales Officer</label>
              <select className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", borderColor: "#9AA7B5" }} value={officerFilter} onChange={(e) => setOfficerFilter(e.target.value)}>
                <option value="">All</option>
                {officerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 0 auto", display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" style={{ padding: "7px 14px", fontSize: 12.5, whiteSpace: "nowrap" }} onClick={loadBoard}><Search size={12} /> Search</button>
              <button className="btn btn-ghost btn-sm" style={{ padding: "7px 14px", fontSize: 12.5, whiteSpace: "nowrap" }} onClick={() => { setCustomerSearch(""); setEnquiryNoSearch(""); setProductSearch(""); setInquiryDate(""); setRegionFilter(""); setOfficerFilter(""); setGlobalSearch(""); setAllocStatusFilter(""); setUomStatusFilter(""); }}>Clear</button>
            </div>
          </div>
        </div>

        <div className="mr-flex mr-gap-3 mr-mb-4" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
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

        {/* Global search — product/customer name+code and Order No. */}
        <div style={{ position: "relative", maxWidth: 760, marginBottom: 22 }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#8C96A3" }} />
          <input
            type="text"
            placeholder="Search product, customer or order no…"
            className="field"
            style={{ width: "100%", boxSizing: "border-box", paddingLeft: 40, padding: "10px 14px 10px 40px", fontSize: 13.5, borderColor: "#9AA7B5" }}
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
        </div>

        {/* Alerts live in a single popup dialog — see AlertModal below. */}
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

        {/* View By switch + UOM / Status filters + Export / Print */}
        <div className="mr-flex mr-items-center mr-gap-4 mr-mb-3 mr-flex-wrap mr-text-sm">
          <span className="text-slate mr-font-medium">View By:</span>
          <label className="mr-flex mr-items-center mr-gap-1 mr-cursor-pointer">
            <input type="radio" checked={viewBy === "product"} onChange={() => setViewBy("product")} /> Product Wise View
          </label>
          <label className="mr-flex mr-items-center mr-gap-1 mr-cursor-pointer">
            <input type="radio" checked={viewBy === "customer"} onChange={() => setViewBy("customer")} /> Customer Wise View
          </label>
          <div className="mr-flex mr-items-center mr-gap-2" style={{ marginLeft: "auto" }}>
            <select
              className="field"
              style={{ minWidth: 110, padding: "7px 10px", fontSize: 12.5, borderColor: "#9AA7B5" }}
              value={uomStatusFilter}
              onChange={(e) => setUomStatusFilter(e.target.value)}
            >
              <option value="">All UOM</option>
              {uomOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              className="field"
              style={{ minWidth: 150, padding: "7px 10px", fontSize: 12.5, borderColor: "#9AA7B5" }}
              value={allocStatusFilter}
              onChange={(e) => setAllocStatusFilter(e.target.value)}
            >
              {(isSystemAdminRole ? SYSADMIN_STATUS_OPTIONS : ADMIN_STATUS_OPTIONS).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button onClick={handleExportExcel} className="btn btn-sm btn-excel" style={{ padding: "9px 16px", fontSize: 13 }}><FileDown size={13} /> Export Excel</button>
            <button onClick={handlePrintSummary} className="btn btn-sm btn-print" style={{ padding: "9px 16px", fontSize: 13 }}><Printer size={13} /> Print Summary</button>
          </div>
        </div>
        {activeCatLabel && <div className="mr-mb-3"></div>}

        <div>
          <div className="card mr-p-3" style={{ minWidth: 0 }}>
            <div className="mr-overflow-x-auto mr-table-viewport" style={{ maxHeight: 560, overflowY: "auto" }}>
              {loading ? (
                <p className="mr-text-center mr-text-sm text-slate mr-py-8">Loading…</p>
              ) : viewBy === "product" ? (
                <table className="data-dark mr-w-full mr-product-table">
                  <colgroup>
                    {showSelection && <col style={{ width: 40 }} />}
                    <col style={{ width: 56 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 260 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 190 }} />
                    <col style={{ width: 90 }} />
                    {showCatColumn && <col style={{ width: 110 }} />}
                    <col style={{ width: 110 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 100 }} />
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
                      <th style={{ textAlign: "center" }}>S.No</th>
                      <th style={{ textAlign: "center" }}>Sort No</th>
                      <th style={{ textAlign: "center" }}>Enquiry Date</th>
                      <th style={{ textAlign: "center" }}>Shade</th>
                      <th style={{ textAlign: "center" }}>Product Code</th>
                      <th style={{ textAlign: "center" }}>Product Name</th>
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Tax</th>
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Payment</th>
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>CD Flag</th>
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Delivery Point</th>
                      <th style={{ textAlign: "center" }}>UOM</th>
                      {showCatColumn && <th style={{ textAlign: "center" }}>Category</th>}
                      <th style={{ textAlign: "center" }}>Requested Qty</th>
                      <th style={{ textAlign: "center" }}>Available Stock</th>
                      <th style={{ textAlign: "center" }}>{isSystemAdminRole ? "Confirmed Qty" : "Allocated Qty"}</th>
                      <th style={{ textAlign: "center" }}>Allocated Mtr</th>
                      <th style={{ textAlign: "center" }}>Allocation Status</th>
                      {isSystemAdminRole && <th style={{ textAlign: "center" }}>Remarks</th>}
                      {isSystemAdminRole && <th style={{ textAlign: "center" }}>ERP SO Status</th>}
                      {isSystemAdminRole && <th style={{ textAlign: "center" }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {productGroups.map((g, gIdx) => {
                      const expanded = !!expandedProducts[g.productId];
                      const groupStatusTag = isSystemAdminRole ? groupApprovalStatus(g) : groupStockStatus(g);
                      const groupPendingRows = g.rows.filter((r) => r.status === "pending" && r.allocationId);
                      const remarksFilledCount = g.rows.filter((r) => (remarksFor(r) || "").trim()).length;
                      const groupErpTag = groupErpStatus(g);
                      const meterTotal = groupMeterTotal(g);
                      return (
                        <Fragment key={g.productId}>
                          {/* Always-visible totals row; click to expand the
                              per-customer breakdown. */}
                          <tr className="mr-product-group-row" onClick={() => toggleProductExpanded(g.productId)}>
                            {showSelection && <td></td>}
                            <td className="text-slate mr-text-center">
                              <span className="mr-flex mr-items-center mr-justify-center mr-gap-2">
                                <span className="mr-product-chevron">
                                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </span>
                                {gIdx + 1}
                              </span>
                            </td>
                            <td className="text-slate mr-text-center">{g.sortNo}</td>
                            <td className="text-slate mr-text-center">—</td>
                            <td className="text-slate mr-text-center">{g.shadeNo}</td>
                            <td className="mr-text-center">
                              <b className="text-pine">{g.productCode}</b>
                            </td>
                            <td className="mr-font-semibold text-pine mr-text-center">{g.productName}</td>
                            <td className="mr-text-xs text-slate mr-text-center mr-whitespace-nowrap">{dummyTax(g.productId)}</td>
                            <td className="mr-text-xs text-slate mr-text-center mr-whitespace-nowrap">{dummyPayment(g.productId)}</td>
                            {/* CD Flag is per order — set it in the expanded rows. */}
                            <td className="text-slate mr-text-center">—</td>
                            <td className="mr-text-xs text-slate mr-text-center mr-whitespace-nowrap">{dummyDeliveryPoint(g.productId)}</td>
                            <td className="mr-text-xs text-slate mr-text-center">{g.uom ? uomLabel(g.uom) : "—"}</td>
                            {showCatColumn && (
                              <td className="mr-whitespace-nowrap mr-text-center"><span className="tag mr-font-semibold" style={{ background: g.group.tagBg, color: g.group.tagText, whiteSpace: "nowrap" }}>{g.group.name}</span></td>
                            )}
                            <td className="mr-font-semibold mr-text-center mr-tabular-nums">{g.requestedSum}</td>
                            <td className="mr-text-center mr-tabular-nums" style={{ color: stockColor(g.requestedSum, g.poolAvailable, g.allocatedSum) }}>
                              {g.poolAvailable}
                            </td>
                            <td className="mr-text-center mr-tabular-nums">{g.allocatedSum}</td>
                            <td className="mr-text-center mr-text-xs text-slate">
                              {meterTotal !== null ? `${meterTotal}M` : "—"}
                            </td>
                            <td className="mr-text-center">
                              <span className={`tag ${groupStatusTag.cls}`}>{groupStatusTag.label}</span>
                              {groupStatusTag.detail && <div className="mr-text-xs text-slate">{groupStatusTag.detail}</div>}
                            </td>
                            {isSystemAdminRole && (
                              <td className="mr-text-xs text-slate mr-whitespace-nowrap mr-text-center">{remarksFilledCount}/{g.rows.length} added</td>
                            )}
                            {isSystemAdminRole && (
                              <td className="mr-text-xs mr-whitespace-nowrap mr-text-center"><span className={`tag ${groupErpTag.cls}`}>{groupErpTag.label}</span></td>
                            )}
                            {isSystemAdminRole && (
                              <td onClick={(e) => e.stopPropagation()} className="mr-text-center">
                                <div className="mr-flex mr-justify-center mr-gap-1">
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
                          {/* Sub-header — shown once expanded. */}
                          {expanded && (
                            <tr className="mr-subhead-row">
                              {showSelection && <td></td>}
                              <td></td>
                              <td>Enquiry No.</td>
                              <td>Enquiry Date</td>
                              <td>Customer Name</td>
                              <td>Customer Code</td>
                              <td></td>
                              <td>Tax</td>
                              <td>Payment</td>
                              <td>CD Flag</td>
                              <td>Delivery Point</td>
                              <td>UOM</td>
                              {showCatColumn && <td>Category</td>}
                              <td className="mr-text-center">Requested Qty</td>
                              <td className="mr-text-center">Available Stock</td>
                              <td className="mr-text-center">Allocated Quantity</td>
                              <td className="mr-text-center">Allocated Mtr</td>
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
                              meterValue={meterFor(r)}
                              onMeterChange={(v) => setMeterInputs((s) => ({ ...s, [r.key]: v }))}
                              cdFlagValue={cdFlagFor(r)}
                              onCdFlagChange={(v) => setCdFlagInputs((s) => ({ ...s, [r.key]: v }))}
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
                      <tr className="mr-totals-row" style={{ position: "sticky", bottom: 0, zIndex: 2 }}>
                        <td colSpan={(showCatColumn ? 6 : 5) + (showSelection ? 1 : 0) + 5}></td>
                        <td className="mr-text-center mr-font-semibold">Total</td>
                        <td className="mr-text-center mr-tabular-nums">{totals.requested}</td>
                        <td></td>
                        <td className="mr-text-center mr-tabular-nums">{totals.allocated}</td>
                        <td></td>
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
                      <th style={{ textAlign: "center" }}>S.No</th>
                      <th style={{ textAlign: "center" }}>Enquiry No</th>
                      <th style={{ textAlign: "center" }}>Enquiry Date</th>
                      <th style={{ textAlign: "center" }}>Customer Name</th>
                      {isSystemAdminRole ? (
                        <th style={{ textAlign: "center" }}>Customer Code</th>
                      ) : (
                        <>
                          <th style={{ textAlign: "center" }}>Product Code</th>
                          <th style={{ textAlign: "center" }}>Product Name</th>
                        </>
                      )}
                      {showCatColumn && <th style={{ textAlign: "center" }}>Category</th>}
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Tax</th>
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Payment</th>
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>CD Flag</th>
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Delivery Point</th>
                      <th style={{ textAlign: "center" }}>UOM</th>
                      <th style={{ textAlign: "center" }}>Requested Qty</th>
                      {!isSystemAdminRole && <th style={{ textAlign: "center" }}>Available Stock</th>}
                      <th style={{ textAlign: "center" }}>{isSystemAdminRole ? "Confirmed Qty" : "Allocated Qty"}</th>
                      <th style={{ textAlign: "center" }}>Allocated Mtr</th>
                      <th style={{ textAlign: "center" }}>Allocation Status</th>
                      {isSystemAdminRole && <th style={{ textAlign: "center" }}>Remarks</th>}
                      {isSystemAdminRole && <th style={{ textAlign: "center" }}>ERP SO Status</th>}
                      {isSystemAdminRole && <th style={{ textAlign: "center" }}>Actions</th>}
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
                        meterValue={meterFor(r)}
                        onMeterChange={(v) => setMeterInputs((s) => ({ ...s, [r.key]: v }))}
                        cdFlagValue={cdFlagFor(r)}
                        onCdFlagChange={(v) => setCdFlagInputs((s) => ({ ...s, [r.key]: v }))}
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
                      <tr className="mr-totals-row" style={{ position: "sticky", bottom: 0, zIndex: 2 }}>
                        <td colSpan={(showCatColumn ? 6 : 5) + 5}></td>
                        <td className="mr-text-center mr-font-semibold">Total</td>
                        <td className="mr-text-center mr-tabular-nums">{totals.requested}</td>
                        {!isSystemAdminRole && <td></td>}
                        <td className="mr-text-center mr-tabular-nums">{totals.allocated}</td>
                        <td></td>
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

          <SummaryBar
            title="Allocation Summary"
            rows={[
              { label: "Total Customers", value: distinctCustomers },
              { label: "Total Requested Qty", value: `${totals.requested} Pcs` },
              { label: "Total Allocated Qty", value: `${totals.allocated} Pcs` },
              { label: "Balance Stock", value: `${totalStockScope.toLocaleString()} Pcs` },
              { label: "Pending Final Approval", value: `${pendingFinalApprovalCount} Line(s)`, color: "#D69426" },
            ]}
          />
        </div>
      </div>
    </Layout>
  );
}

// ── Popup alert modal ──
// Groups every alert category into one centered dialog with a dimmed
// backdrop. Renders nothing if there's nothing to show. OK, Cancel and
// clicking the backdrop all dismiss it.
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
// `inputValue` = what the editable qty box shows (a fresh increment for
// Admin). `allocated` = the REAL cumulative total. `meterValue` /
// `onMeterChange` power the Meter column (Admin edits until submitted;
// System Admin reads only). `cdFlagValue` / `onCdFlagChange` power the
// per-row CD Flag Yes/No dropdown.
function AllocationRow({
  r, sNo, available, showCatColumn, showProductCols, canManage, inputValue, allocated, onAlloc, onAutoAllocate, statusTag,
  isSystemAdminRole, busy, onApprove, onReject, remarksValue, onRemarksChange, onRemarksBlur,
  meterValue, onMeterChange,
  cdFlagValue, onCdFlagChange,
  showSelection, selected, onToggleSelect,
}) {
  // Cap on the input box: remaining stock (converted to cases using this
  // row's Mtr multiplier) and, for Admin, remaining outstanding qty.
  const requestedCap = isSystemAdminRole
    ? r.requested
    : Math.max(0, r.requested - r.savedAllocated);
  const meterMult = numOr1(meterValue);
  const maxAlloc = Math.min(requestedCap, Math.floor((available + inputValue * meterMult) / meterMult));
  const canDecide = isSystemAdminRole && r.allocationId && r.status === "pending";
  const isFullyAllocated = r.requested > 0 && r.savedAllocated >= r.requested;
  // Locks the moment Admin has submitted ANY real, saved number for this
  // row; unlocks again only if System Admin rejects it.
  const isLocked = !isSystemAdminRole
    && !!r.allocationId
    && r.savedAllocated > 0
    && r.status !== 'rejected';
  const meterLocked = isLocked;

  return (
    <tr>
      {showSelection && (
        <td className="mr-text-center">
          <input type="checkbox" checked={!!selected} onChange={onToggleSelect} aria-label={`Select allocation row ${r.orderNo}`} />
        </td>
      )}
      <td className="text-slate mr-text-center">{sNo != null ? sNo : ""}</td>
      <td className="mr-text-xs mr-font-semibold text-pine mr-whitespace-nowrap mr-text-center">{r.orderNo}</td>
      <td className="mr-text-xs text-slate mr-whitespace-nowrap mr-text-center">{formatEnquiryDate(r.inquiryDate)}</td>
      {showProductCols ? (
        <>
          <td className="mr-font-medium mr-text-center">{r.customerName}</td>
          {isSystemAdminRole ? (
            <td className="mr-text-xs mr-whitespace-nowrap mr-text-center">{r.customerCode}</td>
          ) : (
            <>
              <td className="mr-text-xs mr-whitespace-nowrap mr-text-center">{r.productCode}</td>
              <td className="mr-text-xs mr-text-center">{r.productName}</td>
            </>
          )}
          {showCatColumn && (
            <td className="mr-whitespace-nowrap mr-text-center"><span className="tag mr-font-semibold" style={{ background: r.group.tagBg, color: r.group.tagText, whiteSpace: "nowrap" }}>{r.group.name}</span></td>
          )}
        </>
      ) : (
        <>
          <td className="mr-font-medium mr-text-center">{r.customerName}</td>
          <td className="mr-text-xs mr-whitespace-nowrap mr-text-center">{r.customerCode}</td>
          <td></td>
        </>
      )}
      <td className="mr-text-xs text-slate mr-text-center mr-whitespace-nowrap">{dummyTax(r.key)}</td>
      <td className="mr-text-xs text-slate mr-text-center mr-whitespace-nowrap">{dummyPayment(r.key)}</td>
      {/* CD Flag — per-row Yes/No dropdown, defaults to "No". */}
      <td className="mr-text-center mr-whitespace-nowrap">
        <select
          className="field"
          disabled={!canManage}
          value={cdFlagValue}
          onChange={(e) => onCdFlagChange(e.target.value)}
          style={{
            width: 70, padding: "4px 6px", fontSize: 12, textAlign: "center",
            fontWeight: 600, color: cdFlagValue === "Yes" ? "#1C7A4B" : "#6B7785",
          }}
        >
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </td>
      <td className="mr-text-xs text-slate mr-text-center mr-whitespace-nowrap">{dummyDeliveryPoint(r.key)}</td>
      <td className="mr-text-xs text-slate mr-text-center">{r.uom ? uomLabel(r.uom) : "—"}</td>
      {!showProductCols && showCatColumn && (
        <td className="mr-whitespace-nowrap mr-text-center"><span className="tag mr-font-semibold" style={{ background: r.group.tagBg, color: r.group.tagText, whiteSpace: "nowrap" }}>{r.group.name}</span></td>
      )}
      <td className="mr-font-semibold mr-text-center mr-tabular-nums">{r.requested}</td>
      {(!showProductCols || !isSystemAdminRole) && (
        <td className="mr-text-center mr-tabular-nums" style={{ color: stockColor(r.requested, available, allocated) }}>
          {available}
        </td>
      )}
      <td className="mr-text-center">
        {isLocked || isSystemAdminRole ? (
          <span className="mr-font-semibold mr-tabular-nums" style={{ color: isFullyAllocated ? "#1C7A4B" : undefined }}>
            {allocated}
          </span>
        ) : (
          <div className="mr-flex mr-items-center mr-justify-center mr-gap-1">
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

      <td className="mr-text-center">
        {isSystemAdminRole || meterLocked ? (
          <span className="mr-text-xs text-slate">{meterValue ? meterValue : "—"}</span>
        ) : (
          <input
            type="text"
            placeholder="e.g. 5M"
            disabled={!canManage}
            value={meterValue}
            onChange={(e) => onMeterChange(e.target.value)}
            className="field mr-text-center"
            style={{ width: 76, padding: "4px 6px", textAlign: "center" }}
          />
        )}
      </td>

      <td className="mr-text-center"><span className={`tag ${statusTag.cls}`}>{statusTag.label}</span></td>
      {isSystemAdminRole && (
        <td className="mr-text-center" style={{ minWidth: 140 }}>
          {r.allocationId && r.status !== "pending" ? (
            // Approved/Rejected rows: Remarks is plain read-only text.
            <span className="mr-text-xs text-slate">{remarksValue || "—"}</span>
          ) : (
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
          )}
        </td>
      )}
      {isSystemAdminRole && (
        <td className="mr-text-xs mr-whitespace-nowrap mr-text-center">
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
        <td className="mr-text-center">
          <div className="mr-flex mr-justify-center mr-gap-1">
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

// ── Autocomplete text input ─────────────────────────────────────────
// "Type and see matching values" field used by the filter bar (Enquiry
// No, Customer Name); suggestions come from values already on the board.
function AutocompleteInput({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 8);
  }, [options, value]);
  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        placeholder={placeholder}
        className="field"
        style={{ width: "100%", minWidth: 0, boxSizing: "border-box", borderColor: "#9AA7B5" }}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => value.trim() && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 30,
            background: "#fff", border: "1px solid #DBE3EC", borderRadius: 6,
            maxHeight: 190, overflowY: "auto", boxShadow: "0 6px 16px rgba(15,33,56,0.14)",
          }}
        >
          {filtered.map((opt) => (
            <div
              key={opt}
              onMouseDown={() => { onChange(opt); setOpen(false); }}
              className="mr-text-xs"
              style={{ padding: "8px 12px", cursor: "pointer", color: "#0F2138" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
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

// Horizontal version of SummaryPanel — used below the table.
function SummaryBar({ title, rows }) {
  return (
    <div className="card mr-p-3 mr-mt-4">
      {title && (
        <div className="mr-flex mr-items-center mr-gap-2 mr-mb-3">
          <ShoppingCart size={15} className="text-pine" />
          <span className="mr-font-semibold mr-text-sm text-pine">{title}</span>
        </div>
      )}
      <div className="mr-flex mr-flex-wrap" style={{ gap: 0 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              minWidth: 140,
              padding: "0 24px",
              marginBottom: 8,
              borderRight: i < rows.length - 1 ? "1px solid #B7C2CE" : "none",
            }}
          >
            <div className="mr-text-xs text-slate" style={{ marginBottom: 4 }}>{r.label}</div>
            <div className="mr-font-semibold" style={{ fontSize: 16, color: r.color || undefined }}>{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}