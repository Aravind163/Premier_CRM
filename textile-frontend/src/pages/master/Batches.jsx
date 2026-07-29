// src/pages/master/Batches.jsx
//
// Marketing Review — Quantity Allocation console (restyled to match the
// "Marketing Review" reference design). Functionally this replaces the old
// FIFO "Stock Batches" receiving screen: it now shows every product that
// currently has live customer demand (Orders in pending/approved/processing
// status), lets Admin / System Admin allocate available stock to each
// customer, and saves through the SAME real allocation endpoints already
// used elsewhere in this app (AllocationController) — so every number here
// is real data, and every Save actually runs the FIFO batch-consumption
// logic on the backend (ProductAllocation + AllocationBatchConsumption).
//
// NOTE on two intentional relabels vs. the raw data model:
//  - "Inquiry No." shows a synthesized `PRODUCTCODE/CUSTOMERCODE` reference,
//    because Premier's schema aggregates SUM(Quantity) across every active
//    Order a customer has for a product rather than storing one row per
//    single enquiry. It's a stable, unique key for the row — not a literal
//    enquiry id.
//  - "Awaiting Approval" / the Approval Workflow panel are shown for visual
//    parity with the reference design; Premier's backend does not track a
//    separate multi-step marketing-approval workflow, so that panel is
//    illustrative only. Everything else on this page (stock, orders,
//    allocations, FIFO consumption) is fully live.
//
// FIX (subtype grouping):
//  - Rows were being grouped by each product's top-level Category
//    ("cloth"/"yarn") against tab-match lists built from SUBTYPES
//    ("dhoti", "blouse", "pant", ...) — a "cloth" product could never
//    match a "dhoti" tab, so almost everything fell through to the last
//    tab ("Others"/"All"). Grouping now uses each product's actual
//    SubType (looked up from the authoritative /products list, keyed by
//    productId), so a Dhoti product lands in the Dhoti tab, a Blouse
//    product in the Blouse tab, etc. groupFor() is also now
//    whitespace/case tolerant and falls back to a partial match before
//    giving up and landing on "Others".
//
// FIX (font + layout pass):
//  - Wrapped the page root in `font-body` so it inherits the same Inter
//    stack as Dashboard/OrderView (those set fontFamily inline; this page
//    is Tailwind-utility-class-driven and preflight is disabled globally,
//    so without this the page fell back to the browser default serif font).
//  - Split the "Inquiry Date / Customer / Product / Region / Sales Officer"
//    filter row from a 6-column grid (which forced Search+Clear to share a
//    single cramped cell) into a clean 5-column field grid, with the
//    Search/Clear buttons moved to their own row below.
//  - Fixed the totals <tfoot> row: the value cell used colSpan={2}, which
//    merged the Price and Total Value columns instead of aligning the sum
//    under "Total Value" only.
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList, Boxes, PackageCheck, Hourglass, Search,
  Shirt, Layers, Briefcase, LayoutGrid, Save, Send, XCircle, RotateCcw,
  PackagePlus, Zap, ChevronRight, Check, Package, CircleDot, Triangle,
  Footprints, Ruler,
} from "lucide-react";
import Layout from "../../components/AppLayout";
import API from "../../services/api";

const ACTIVE_ORDER_STATUSES = ["pending", "approved", "processing"];

// ── Category tabs ─────────────────────────────────────────────────────
// The tabs shown on Marketing Review now follow whichever top-level
// category the user picked on the "Select Category" screen
// (localStorage "premier_category" — set by SelectCategory.jsx and used
// the same way by ProductList/OrderList/AddProduct etc.):
//   Cloth -> Dhoti, Blouse, Pant, Shirt, Leggings, Others
//   Yarn  -> Bundle, Hank, Cone
// This mirrors the exact subtype lists defined in AddProduct.jsx
// (CLOTH_SUBTYPES / YARN_SUBTYPES) so "what you add" and "what you see
// here" always match up. To change the subtypes/colours/icons for a
// category, edit CLOTH_GROUPS / YARN_GROUPS below.
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

// AddProduct.jsx lets a user create extra custom subtypes per category
// (saved to localStorage under "premier_custom_subtypes"). Pick those up
// too, so a custom subtype gets its own Marketing Review tab automatically
// instead of silently falling into "Others".
const CUSTOM_SUBTYPES_KEY = "premier_custom_subtypes";
const FALLBACK_TAB_COLORS = [
  { color: "#7A5C1C", tagBg: "#F5EBD2", tagText: "#7A5C1C" },
  { color: "#3A6B8C", tagBg: "#DCEEF7", tagText: "#3A6B8C" },
  { color: "#8C3A5C", tagBg: "#F7DCE9", tagText: "#8C3A5C" },
];

// Reads the category chosen on the "Select Category" screen and returns
// the matching list of tabs. Called fresh each time Marketing Review
// mounts, so switching category from the sidebar and coming back here
// always shows the right tabs.
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

// Normalizes a raw subtype/category string for matching: lowercase,
// trimmed, collapsed whitespace. Tolerates values coming back from the
// API with different casing or stray spaces ("Dhoti ", "DHOTI", etc).
const normalize = (v) => (v ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

// Matches a product's subtype string against the current tab list.
// Tries an exact match first, then falls back to a partial/substring
// match (handles things like "dhoti set" or "mens dhoti"), and only
// falls back to the last tab ("Others") if nothing matches at all.
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

export default function Batches() {
  const role = localStorage.getItem("role") || "";
  const canManage = ["admin", "system_admin"].includes(role);

  // The tab list — Cloth or Yarn subtypes — is fixed for the duration of
  // this visit to the page (it follows whatever category is active in
  // localStorage when Marketing Review is opened).
  const CATEGORY_GROUPS = useMemo(() => getCategoryGroups(), []);

  const [rows, setRows] = useState([]);
  const [customersList, setCustomersList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [activeCat, setActiveCat] = useState(() => CATEGORY_GROUPS[0]?.id || "all");
  const [viewBy, setViewBy] = useState("customer");
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [inquiryDate, setInquiryDate] = useState("");
  const [allocInputs, setAllocInputs] = useState({});
  const [showAllotForm, setShowAllotForm] = useState(false);

  // ---- Data loading -----------------------------------------------------
  // One row per (product, customer) pair that has active order demand.
  // Built entirely from the existing /allocations/products + /allocations
  // endpoints — no backend changes required.
  const loadBoard = async () => {
    setLoading(true); setError("");
    try {
      const [prodListRes, activeProdRes] = await Promise.all([
        API.get("/products"),
        API.get("/allocations/products"),
      ]);
      const allProducts = prodListRes.data?.data || prodListRes.data || [];
      setProductsList(allProducts);
      const priceByProduct = {};
      // The authoritative product's SubType (e.g. "Dhoti", "Blouse") —
      // this is what tab grouping is based on. /allocations/products may
      // only return the top-level Category ("cloth"/"yarn"), which is
      // NOT specific enough to place a row into the right subtype tab,
      // so we look SubType up here from the full /products list instead.
      const subTypeByProduct = {};
      allProducts.forEach((p) => {
        priceByProduct[p.Id] = Number(p.Price) || 0;
        subTypeByProduct[p.Id] = p.SubType || p.subType || p.sub_type || p.Category;
      });

      const activeProducts = activeProdRes.data || [];

      const details = await Promise.all(
        activeProducts.map((p) => API.get("/allocations", { params: { product_id: p.productId } }))
      );

      const flat = [];
      activeProducts.forEach((p, idx) => {
        const detail = details[idx].data;
        const poolAvailable = Math.max(0, (detail.product.availableQty || 0) - (detail.product.totalAllocated || 0));
        // Prefer the subtype looked up from /products; fall back to
        // whatever /allocations/products sent if the product wasn't found
        // there for some reason.
        const subType = subTypeByProduct[p.productId] || p.category;
        (detail.customers || []).forEach((c) => {
          const rowAvailable = poolAvailable + (c.allocatedQty || 0);
          flat.push({
            key: `${p.productId}-${c.customerId}`,
            productId: p.productId,
            customerId: c.customerId,
            refNo: `${p.code}/${c.code}`,
            productCode: p.code,
            productName: p.name,
            category: subType,
            group: groupFor(subType, CATEGORY_GROUPS),
            customerName: c.name,
            customerCode: c.code,
            requested: c.orderedQty,
            inquiryDate: c.inquiryDate || null,
            savedAllocated: c.allocatedQty,
            rowAvailable,
            price: priceByProduct[p.productId] || 0,
            warehouse: warehouseFor(subType),
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

  const loadCustomers = async () => {
    try {
      const res = await API.get("/customers");
      setCustomersList(res.data?.data || res.data || []);
    } catch {
      // Non-fatal — only needed for the "Allot Stock to Customer" form.
    }
  };

  useEffect(() => { loadBoard(); loadCustomers(); }, []);

  // ---- Allocation input helpers ------------------------------------------
  const allocFor = (row) => allocInputs[row.key] ?? row.savedAllocated;
  const setAlloc = (row, val) => {
    const clamped = Math.max(0, Math.min(Number(val) || 0, row.rowAvailable, row.requested));
    setAllocInputs((s) => ({ ...s, [row.key]: clamped }));
  };
  const autoAllocateRow = (row) => setAlloc(row, Math.min(row.requested, row.rowAvailable));

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
    const sorted = [...list];
    if (viewBy === "customer") {
      sorted.sort((a, b) => a.customerName.localeCompare(b.customerName) || a.productCode.localeCompare(b.productCode));
    } else {
      sorted.sort((a, b) => a.productCode.localeCompare(b.productCode) || a.customerName.localeCompare(b.customerName));
    }
    return sorted;
  }, [rows, activeCat, customerSearch, productSearch, inquiryDate, viewBy]);

  const autoAllocateAllVisible = () => visibleRows.forEach(autoAllocateRow);

  const rowStatus = (row) => {
    const allocated = allocFor(row);
    if (row.rowAvailable <= 0 && allocated <= 0) return { label: "Stock Shortage", cls: "tag-hold" };
    if (allocated <= 0) return { label: "Not Allocated", cls: "tag-neutral" };
    if (allocated >= row.requested) return { label: "Fully Allocated", cls: "tag-approved" };
    return { label: "Partial Allocated", cls: "tag-pending" };
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
  // rowAvailable includes this customer's own saved allocation baked back
  // in (see loadBoard), so the true unallocated pool for a product is
  // rowAvailable - savedAllocated. Computed once per distinct product to
  // avoid double-counting the same product across multiple customer rows.
  const distinctProductsAvailable = useMemo(() => {
    return visibleRows.reduce((map, r) => {
      if (!map.has(r.productId)) map.set(r.productId, r.rowAvailable - r.savedAllocated);
      return map;
    }, new Map());
  }, [visibleRows]);
  const totalStockScope = Array.from(distinctProductsAvailable.values()).reduce((a, v) => a + v, 0);

  const awaitingApproval = useMemo(() => {
    const byCustomer = new Map();
    visibleRows.forEach((r) => {
      const allocated = allocFor(r);
      const entry = byCustomer.get(r.customerCode) || { full: true };
      if (allocated < r.requested) entry.full = false;
      byCustomer.set(r.customerCode, entry);
    });
    return Array.from(byCustomer.values()).filter((v) => v.full).length;
  }, [visibleRows, allocInputs]);

  const activeCatLabel = activeCat === "all" ? null : CATEGORY_GROUPS.find((g) => g.id === activeCat)?.name;
  const showCatColumn = activeCat === "all";

  // ---- Save / Reset --------------------------------------------------------
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
      setOk("Allocation saved.");
      setAllocInputs({});
      await loadBoard();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save allocation.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setAllocInputs({});

  return (
    <Layout pageTitle="Marketing Review">
      <div className="font-body">
        <div className="mr-grid mr-grid-4 mr-mb-5">
          <StatCardV2 icon={ClipboardList} label="Active Order Lines" value={visibleRows.length} accent="#2E6B9E" />
          <StatCardV2 icon={Hourglass} label="Pending Allocation" value={visibleRows.filter((r) => allocFor(r) < r.requested).length} accent="#D69426" />
          <StatCardV2
            icon={PackageCheck}
            label={`Available Stock${activeCatLabel ? " (" + activeCatLabel + ")" : ""}`}
            value={`${totalStockScope.toLocaleString()} Pcs`}
            accent="#2E7A72"
          />
          <StatCardV2 icon={Boxes} label="Fully Allocated Customers" value={awaitingApproval} accent="#B23A3A" />
        </div>

        {error && <div className="tag tag-hold mr-mb-4" style={{ display: "block", padding: "10px 14px" }}>{error}</div>}
        {ok && <div className="tag tag-approved mr-mb-4" style={{ display: "block", padding: "10px 14px" }}>{ok}</div>}

        {/* Filters — five equal-width fields in their own row, Search/Clear
            moved to a dedicated row below so they get natural button width
            instead of being squeezed into a shared 6th grid cell. */}
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
              <select className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} disabled><option>All Regions</option></select>
            </div>
            <div style={{ flex: "1 1 0%", minWidth: 0, boxSizing: "border-box" }}>
              <label className="field-label">Sales Officer</label>
              <select className="field" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} disabled><option>All</option></select>
            </div>
          </div>
          <div className="mr-flex mr-items-center mr-gap-2" style={{ marginTop: 20 }}>
            <button className="btn btn-primary btn-sm" onClick={loadBoard}><Search size={12} /> Search</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCustomerSearch(""); setProductSearch(""); setInquiryDate(""); }}>Clear</button>
          </div>
          {canManage && (
            <div className="mr-flex mr-justify-end mr-mt-3 mr-pt-3 mr-border-top">
              <button onClick={() => setShowAllotForm((v) => !v)} className="btn btn-secondary btn-sm">
                <PackagePlus size={12} /> {showAllotForm ? "Close" : "Allot Stock to Customer"}
              </button>
            </div>
          )}
        </div>

        {showAllotForm && canManage && (
          <AllotStockForm
            categoryGroups={CATEGORY_GROUPS}
            productsList={productsList}
            customersList={customersList}
            onDone={() => { setShowAllotForm(false); loadBoard(); }}
            setError={setError}
            setOk={setOk}
          />
        )}

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
          {canManage && (
            <button onClick={autoAllocateAllVisible} className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>
              <Zap size={12} /> Auto-Allocate {activeCatLabel ? `${activeCatLabel} Items` : "All Visible"}
            </button>
          )}
        </div>

        <div className="mr-lg-grid-main">
          <div className="card mr-p-3 mr-overflow-x-auto">
            {loading ? (
              <p className="mr-text-center mr-text-sm text-slate mr-py-8">Loading…</p>
            ) : (
              <table className="data-dark mr-w-full">
                <thead>
                  <tr>
                    <th>Inquiry No.</th>
                    <th>Customer Name</th>
                    <th>Customer Code</th>
                    {showCatColumn && <th>Category</th>}
                    <th>Product Code</th>
                    <th>Product Description</th>
                    <th className="mr-text-right">Requested Qty (Pcs)</th>
                    <th className="mr-text-right">Available Stock (Pcs)</th>
                    <th className="mr-text-right">Allocated Qty (Pcs)</th>
                    <th className="mr-text-right">Price (₹)</th>
                    <th className="mr-text-right">Total Value (₹)</th>
                    <th>Dispatch Warehouse</th>
                    <th>Allocation Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const allocated = allocFor(r);
                    const status = rowStatus(r);
                    const value = allocated * r.price;
                    return (
                      <tr key={r.key}>
                        <td className="mr-text-xs mr-font-semibold text-pine mr-whitespace-nowrap">{r.refNo}</td>
                        <td className="mr-font-medium">{r.customerName}</td>
                        <td className="mr-text-xs mr-whitespace-nowrap">{r.customerCode}</td>
                        {showCatColumn && (
                          <td><span className="tag mr-font-semibold" style={{ background: r.group.tagBg, color: r.group.tagText }}>{r.group.name}</span></td>
                        )}
                        <td className="mr-text-xs mr-whitespace-nowrap">{r.productCode}</td>
                        <td className="mr-text-xs">{r.productName}</td>
                        <td className="mr-font-semibold mr-text-right mr-tabular-nums">{r.requested}</td>
                        <td className="mr-text-right mr-tabular-nums" style={{ color: r.rowAvailable === 0 ? "#B23A3A" : r.rowAvailable < 100 ? "#D69426" : undefined }}>
                          {r.rowAvailable}
                        </td>
                        <td className="mr-text-right">
                          <div className="mr-flex mr-items-center mr-justify-end mr-gap-1">
                            <input
                              type="number" min={0} max={Math.min(r.requested, r.rowAvailable)} value={allocated}
                              disabled={!canManage}
                              onChange={(e) => setAlloc(r, e.target.value)}
                              className="field mr-text-right" style={{ width: 64, padding: "4px 6px" }}
                            />
                            {canManage && (
                              <button title={`Allocate max (${Math.min(r.requested, r.rowAvailable)})`} onClick={() => autoAllocateRow(r)} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
                                <Zap size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="mr-text-right mr-tabular-nums">{r.price}</td>
                        <td className="mr-text-right mr-tabular-nums">
                          {value.toLocaleString()}
                          {allocated < r.requested && (
                            <div className="mr-text-xs" style={{ color: r.rowAvailable === 0 ? "#B23A3A" : "#D69426" }}>
                              Pending Qty: {r.requested - allocated} Pcs
                            </div>
                          )}
                        </td>
                        <td className="mr-text-xs mr-whitespace-nowrap">{r.warehouse}</td>
                        <td><span className={`tag ${status.cls}`}>{status.label}</span></td>
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={showCatColumn ? 13 : 12} className="mr-text-center mr-text-sm text-slate mr-py-8">No active order demand in this view.</td></tr>
                  )}
                </tbody>
                {visibleRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={showCatColumn ? 6 : 5}>Total</td>
                      <td className="mr-text-right mr-tabular-nums">{totals.requested}</td>
                      <td></td>
                      <td className="mr-text-right mr-tabular-nums">{totals.allocated}</td>
                      <td></td>
                      <td className="mr-text-right mr-tabular-nums">₹{totals.value.toLocaleString()}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

            {canManage && (
              <div className="mr-flex mr-flex-wrap mr-gap-2 mr-justify-end mr-mt-4">
                <button onClick={handleSaveAll} disabled={saving} className="btn btn-primary btn-sm">
                  <Send size={12} /> {saving ? "Saving…" : "Save & Submit Allocation"}
                </button>
                <button onClick={handleReset} className="btn btn-ghost btn-sm"><RotateCcw size={12} /> Reset Allocation</button>
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
                { label: "Pending Allocation", value: `${totals.requested - totals.allocated} Pcs`, color: "#D69426" },
                { label: "Total Allocation Value (₹)", value: `₹${totals.value.toLocaleString()}`, color: "#2E7A72" },
              ]}
            />
            <div className="summary-panel">
              <div className="mr-font-semibold mr-text-sm mr-mb-2 text-pine">Allocation Legend</div>
              <div className="mr-flex-col mr-gap-1 mr-text-xs text-slate">
                <div className="mr-flex mr-items-center mr-gap-2"><span className="legend-dot" style={{ background: "#2E7A72" }} /> Fully Allocated</div>
                <div className="mr-flex mr-items-center mr-gap-2"><span className="legend-dot" style={{ background: "#D69426" }} /> Partial Allocated</div>
                <div className="mr-flex mr-items-center mr-gap-2"><span className="legend-dot" style={{ background: "#B23A3A" }} /> Stock Shortage</div>
                <div className="mr-flex mr-items-center mr-gap-2"><span className="legend-dot" style={{ background: "#8A968C" }} /> Not Started</div>
              </div>
            </div>
            <div className="summary-panel">
              <div className="mr-font-semibold mr-text-sm mr-mb-2 text-pine">Approval Workflow</div>
              <WorkflowSteps steps={[
                { label: "Marketing Reviewer — Allocation", state: "active" },
                { label: "Marketing Head — Final Approval", state: "pending" },
                { label: "ERP Sales Order Creation", state: "pending" },
                { label: "Dispatch Planning", state: "pending" },
              ]} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ── Shared small components (kept in this file so nothing else needs
//    touching) ─────────────────────────────────────────────────────────
function StatCardV2({ icon: Icon, label, value, accent }) {
  return (
    <div className="stat-v2">
      <div className="stat-v2-icon" style={{ background: `${accent}1E` }}>
        <Icon size={19} color={accent} />
      </div>
      <div className="mr-flex-col mr-min-w-0">
        <div className="stat-v2-label">{label}</div>
        <div className="stat-v2-value" style={{ color: accent }}>{value}</div>
      </div>
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

function WorkflowSteps({ steps }) {
  return (
    <div>
      {steps.map((s, i) => (
        <div className="wf-step" key={i}>
          <div className={`wf-dot ${s.state}`}>{s.state === "done" ? <Check size={11} /> : i + 1}</div>
          <div>
            <div className="wf-title">{s.label}</div>
            <div className={`wf-sub ${s.state}`}>{s.state === "done" ? "Completed" : s.state === "active" ? "In Progress" : "Pending"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Allot Stock to Customer — a direct allocation, real API-backed. ──────
function AllotStockForm({ categoryGroups, productsList, customersList, onDone, setError, setOk }) {
  const groupedProducts = useMemo(() => {
    const groups = {};
    categoryGroups.forEach((g) => { groups[g.id] = []; });
    productsList.forEach((p) => {
      const subType = p.SubType || p.subType || p.sub_type || p.Category;
      groups[groupFor(subType, categoryGroups).id].push(p);
    });
    return groups;
  }, [productsList, categoryGroups]);

  const [catId, setCatId] = useState(categoryGroups[0]?.id || "");
  const [productId, setProductId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [qty, setQty] = useState("");
  const [available, setAvailable] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const productsInCat = groupedProducts[catId] || [];

  useEffect(() => {
    if (productsInCat.length && !productsInCat.some((p) => String(p.Id) === productId)) {
      setProductId(productsInCat[0] ? String(productsInCat[0].Id) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catId, productsList]);

  useEffect(() => {
    if (customersList.length && !customerId) setCustomerId(String(customersList[0].Id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersList]);

  useEffect(() => {
    const checkAvailability = async () => {
      if (!productId) return;
      setChecking(true); setAvailable(null);
      try {
        const res = await API.get("/allocations", { params: { product_id: productId } });
        const remaining = (res.data.product.availableQty || 0) - (res.data.product.totalAllocated || 0);
        setAvailable(Math.max(0, remaining));
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    };
    checkAvailability();
  }, [productId]);

  const canSubmit = productId && customerId && Number(qty) > 0 && (available === null || Number(qty) <= available);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(""); setOk("");
    try {
      const detailRes = await API.get("/allocations", { params: { product_id: productId } });
      const existing = (detailRes.data.customers || []).find((c) => String(c.customerId) === String(customerId));
      const newQty = (existing?.allocatedQty || 0) + Number(qty);
      await API.post("/allocations", {
        productId: Number(productId),
        allocations: [{ customerId: Number(customerId), allocatedQty: newQty }],
      });
      setOk("Stock allotted to customer.");
      setQty("");
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to allot stock.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card mr-p-4 mr-mb-4" style={{ borderWidth: 2, borderColor: "#2E7A7255", borderStyle: "solid" }}>
      <div className="mr-flex mr-items-center mr-gap-2 mr-mb-3">
        <PackagePlus size={15} className="text-moss" />
        <span className="mr-font-semibold mr-text-sm text-pine">Allot Stock to Customer</span>
        <span className="mr-text-xs text-slate">— push an allocation directly from available stock, without waiting for an order</span>
      </div>
      <div className="mr-grid mr-grid-6 mr-items-end">
        <div className="mr-flex-col">
          <label className="field-label">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="field mr-w-full">
            {customersList.map((c) => <option key={c.Id} value={c.Id}>{c.Name}</option>)}
          </select>
        </div>
        <div className="mr-flex-col">
          <label className="field-label">Category</label>
          <select value={catId} onChange={(e) => setCatId(e.target.value)} className="field mr-w-full">
            {categoryGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="mr-flex-col">
          <label className="field-label">Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="field mr-w-full">
            {productsInCat.map((p) => <option key={p.Id} value={p.Id}>{p.Code} — {p.Name}</option>)}
          </select>
        </div>
        <div className="mr-flex-col">
          <label className="field-label">Available Stock</label>
          <div className={`field mr-flex mr-items-center mr-justify-end mr-tabular-nums ${available === 0 ? "text-rust" : "text-moss"}`}>
            {checking ? "…" : available === null ? "—" : `${available} Pcs`}
          </div>
        </div>
        <div className="mr-flex-col">
          <label className="field-label">Quantity to Allot</label>
          <input
            type="number" min={0} max={available ?? undefined} value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="field mr-w-full mr-text-right"
          />
        </div>
        <button onClick={handleSubmit} disabled={!canSubmit || submitting} className="btn btn-primary" style={{ justifyContent: "center" }}>
          <PackagePlus size={13} /> {submitting ? "Allotting…" : "Allot Now"}
        </button>
      </div>
      {available !== null && Number(qty) > available && (
        <div className="mr-text-xs text-rust mr-mt-3">Requested quantity exceeds available stock.</div>
      )}
    </div>
  );
}