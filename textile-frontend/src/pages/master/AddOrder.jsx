import { useTheme } from "../../ThemeContext";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../../components/AppLayout";
import { getG, G } from "../../theme";
import API from "../../services/api";

const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");

// ─── Shared primitives ────────────────────────────────────────────────────────
const Field = ({ label, required, full, children }) => {
  const { isDark } = useTheme();
  return (
    <div style={{ marginBottom: 4, gridColumn: full ? "1 / -1" : undefined, minWidth: 0 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: getG(isDark).textLabel, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "#B23A3A", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
};

// Read-only display used when a box is locked (not in Edit mode) — same
// footprint as an Input/Select so the layout doesn't jump when toggled.
const ReadField = ({ label, value, full }) => (
  <Field label={label} full={full}>
    <div style={{ width: "100%", boxSizing: "border-box", padding: "9px 13px", borderRadius: 9, border: "1px solid rgba(15,33,56,0.10)", fontSize: 14, color: "#0F2138", background: "#F5F7FA", minHeight: 38, display: "flex", alignItems: "center" }}>
      {value === "" || value === null || value === undefined ? "—" : value}
    </div>
  </Field>
);

const Input = (props) => (
  <input {...props} style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#fff", outline: "none", boxSizing: "border-box" }} />
);

const Select = ({ children, ...props }) => (
  <select {...props} style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#fff", outline: "none", boxSizing: "border-box" }}>
    {children}
  </select>
);

// ─── Embedded Product Picker constants (mirrors ProductSelection.jsx) ─────────
const TAB_COLORS = ["#1F5C99", "#2E7D32", "#6A3FA0", "#C9740B", "#0E7C86", "#B23A3A"];
const TAB_ICONS = { blouse: "👚", dhoti: "📜", uniform: "🎽", "uniform shirting": "🎽", "uniform suiting": "🧥", "premier shirting": "👔", pant: "👖", shirt: "👔", leggings: "🩳", bundle: "🧶", hank: "🧵", cone: "🧵", others: "📦" };

// Kept identical to ProductCatalog.jsx / ProductSelection.jsx so the same
// SubType strings from the backend nest under the same top-level tabs here.
const TYPE_GROUPS = {
  "Blouse": ["Blouse"],
  "Dhoti": ["Dhoti", "BO Grey - Dhothies", "BO Fabric - Dhothies"],
  "Uniform Shirting": ["Uniform Shirting"],
  "Uniform Suiting": ["Uniform Suiting"],
};

function dummyUom(subType) {
  const u = (subType || "").toLowerCase();
  if (u.includes("shirting") || u.includes("suiting") || u.includes("blouse")) return "m";
  return "pcs";
}
const DUMMY_SWATCHES = ["#8FD9A8", "#7FD1E0", "#E893C9", "#9A9AA5", "#F0A15C", "#B7A6E0"];
const DUMMY_TYPES = ["BLD & DYED", "Bld/Dyed", "R.Blue/G.Blue", "Fiber Dyed", "YD Dyed", "YD Slub", "3.7 & 7.4", "8*137 (Box)", "Spl Maroon"];
const DUMMY_SHADE_NOS = ["101", "102", "103", "104", "105", "106"];

function dummyType(product, i) {
  return product.Description || DUMMY_TYPES[i % DUMMY_TYPES.length];
}
function dummyShadeNo(product, i) {
  const num = product.ShadeNo || DUMMY_SHADE_NOS[i % DUMMY_SHADE_NOS.length];
  return `SHADE ${num}`;
}
function dummyDescription(product, i) {
  return `SHADING FABRIC ${dummyShadeNo(product, i)}`;
}

// Meta keys tucked into OrderDetails alongside the real spec fields —
// stripped out before treating the rest as an item's saved spec
// answers. Those answers are kept intact and passed straight back
// through on submit, even though there's no box on this page to view
// or edit them anymore (that now lives on Product Selection).
const META_DETAIL_KEYS = ["GroupRef", "EnquiryOrderNo", "EnquiryOrderDate"];

// ─── Sort No / Shade No — pulled straight from the product record,
// same convention as ProductSelection.jsx / ProductList.jsx, so the
// items table below always shows the real DB values, never a guess. ──
function sortNoFor(product) {
  return product?.SortNo || product?.Code || "—";
}
function shadeNoFor(product) {
  return product?.ShadeNo ||"SHADE101" || "—";
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AddOrder() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);

  const card = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 20, boxShadow: "0 4px 16px rgba(46,122,114,0.05)", minWidth: 0, width: "100%", boxSizing: "border-box" };
  const cardTitle = { fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 15, fontWeight: 700, margin: "0 0 14px", color: themeG.textMain };

  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const [searchParams] = useSearchParams();
  const fromEnquiry = searchParams.get("fromEnquiry");
  const prefillCustomerId = searchParams.get("customerId");
  const prefillProductId = searchParams.get("productId");
  // Editing (or viewing) an existing order via OrderList's 👁️/✏️ buttons.
  const editId = searchParams.get("editId");
  // 👁️ appends &mode=view — same data-loading path as ✏️, but every
  // Edit affordance (item Remove, the qty stepper, the bottom action
  // bar) is hidden and the page can never leave read-only mode.
  const viewOnly = !!(editId && searchParams.get("mode") === "view");
  // A brand-new, manually-created order — not editing/viewing an
  // existing one, and not converting an approved enquiry (that path
  // still pre-fills its single product behind the scenes). Only this
  // case gets the embedded Product Picker below.
  const isNewOrder = !editId && !fromEnquiry;


  const getStoredCat = () => localStorage.getItem("premier_category") || "cloth";
  const [tab, setTab] = useState(getStoredCat);
  const [subType, setSubType] = useState(() => getStoredCat() === "yarn" ? "bundle" : "dhoti");
  // itemDiscount / productId / qty / pricePerUnit here are only ever
  // populated behind the scenes when converting a single-product
  // enquiry — there's no UI on this page to set them directly anymore.
  // discount = overall order-level discount (currently unused, kept so
  // nothing downstream breaks if it's wired back up later).
  const [form, setForm] = useState({ customerId: "", productId: "", qty: "", pricePerUnit: "", deliveryDate: "", notes: "", discount: "", itemDiscount: "", enquiryOrderNo: "", enquiryOrderDate: "" });
  // Spec answers (Dhoti Type, Length, Colour, etc.) carried over from a
  // source enquiry so they aren't lost on save — there's no box on this
  // page to view/edit them anymore, they just ride along silently.
  const [draftDetails, setDraftDetails] = useState(null);

  // Multiple products can belong to a single order. `items` holds
  // everything already on the order; quantities can still be adjusted
  // per-row and rows can be removed. For a brand-new order, products
  // are added via the embedded Product Picker below; when converting
  // an enquiry they still arrive pre-filled behind the scenes.
  const [items, setItems] = useState([]);
  // When editing (editId), items pulled in from the backend carry a
  // `dbId` — the real Order row id — so Submit can PUT them instead of
  // creating duplicates. removedItemIds tracks existing rows the user
  // removed from the list, so Submit can actually delete them.
  const [removedItemIds, setRemovedItemIds] = useState([]);
  // If the order being edited already belongs to a group (multi-product
  // order), keep using that same GroupRef instead of minting a new one.
  const [existingGroupRef, setExistingGroupRef] = useState(null);
  // Which row (by tempId) currently has its Qty cell in direct-typing
  // Edit mode, as opposed to the default +/- stepper.
  const [editingQtyId, setEditingQtyId] = useState(null);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Payment & Delivery arrives pre-filled from the approved enquiry (or
  // an order being edited/viewed), so it starts locked (read-only) —
  // staff click "Edit" to change it. View mode (viewOnly) always stays
  // locked — see the effect below.
  const [editPayment, setEditPayment] = useState(!fromEnquiry && !editId);

  // View mode can never unlock, even if something else calls the
  // setter above — pin it closed whenever viewOnly is true.
  useEffect(() => {
    if (viewOnly) setEditPayment(false);
    // eslint-disable-next-line
  }, [viewOnly]);

  // ── Embedded Product Picker state (new manual orders only) ──
  const [pickerType, setPickerType] = useState("");
  const [pickerSubType, setPickerSubType] = useState("");
  const [pickerNameQuery, setPickerNameQuery] = useState("");
  const [pickerNameMenuOpen, setPickerNameMenuOpen] = useState(false);
  const pickerNameBoxRef = useRef(null);
  const [pickerSecondaryQuery, setPickerSecondaryQuery] = useState("");
  const [pickerUomFilter, setPickerUomFilter] = useState("All");
  const [pickerRowQty, setPickerRowQty] = useState({});
  const [pickerJustAddedId, setPickerJustAddedId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [custRes, prodRes] = await Promise.all([API.get("/customers"), API.get("/products")]);
        setCustomers(custRes.data);
        setProducts(prodRes.data);

        if (editId) {
          // ── Editing or viewing an existing order (from OrderList) ──
          // Fetch the order itself, then — if it's part of a grouped
          // multi-product order — fetch every sibling row sharing the
          // same GroupRef, so the whole order (not just this one row)
          // shows up in the "Products in this Order" table below.
          try {
            const orderRes = await API.get(`/orders/${editId}`);
            const orderData = orderRes.data;
            const groupRef = orderData.OrderDetails?.GroupRef || null;
            setExistingGroupRef(groupRef);

            let groupRows = [orderData];
            if (groupRef) {
              const allRes = await API.get("/orders");
              const siblings = (allRes.data || []).filter((o) => o.OrderDetails?.GroupRef === groupRef);
              if (siblings.length > 0) groupRows = siblings;
            }

            const builtItems = groupRows.map((o) => {
              const productId = o.ProductId ?? o.product?.Id ?? o.Product ?? "";
              const product = o.product || prodRes.data.find((p) => String(p.Id) === String(productId));
              const rawDetails = { ...(o.OrderDetails || {}) };
              META_DETAIL_KEYS.forEach((k) => delete rawDetails[k]);
              return {
                tempId: `existing-${o.Id}`,
                dbId: o.Id,
                category: o.Category,
                subType: o.SubType,
                productId,
                productLabel: product ? `${product.Name} (${product.Code})` : `Product #${productId}`,
                qty: o.Quantity,
                pricePerUnit: o.PricePerUnit,
                discount: o.DiscountPct || 0,
                details: Object.keys(rawDetails).length ? rawDetails : null,
              };
            });
            setItems(builtItems);

            const first = groupRows[0];
            localStorage.setItem("premier_category", first.Category);
            setTab(first.Category);
            setSubType(first.SubType);

            setForm((f) => ({
              ...f,
              customerId: first.CustomerId ?? first.customer?.Id ?? "",
              productId: "",
              qty: "",
              pricePerUnit: "",
              itemDiscount: "",
              deliveryDate: first.DeliveryDate ? first.DeliveryDate.substring(0, 10) : "",
              notes: first.Notes || "",
              enquiryOrderNo: first.OrderDetails?.EnquiryOrderNo || first.Code || "",
              enquiryOrderDate: first.OrderDetails?.EnquiryOrderDate || (first.CreatedAt ? first.CreatedAt.substring(0, 10) : ""),
            }));
          } catch {
            setError("Failed to load this order.");
          }
        } else if (fromEnquiry && prefillProductId) {
          // Coming from an approved Order Enquiry — pre-fill customer,
          // product, category/sub-type and starting price so staff only
          // has to confirm delivery details before placing the order.
          const p = prodRes.data.find((pr) => String(pr.Id) === String(prefillProductId));

          // Pull the source enquiry's own order number, quantity, price,
          // discount, saved spec answers, and delivery date / remarks so
          // the whole draft is genuinely pre-filled with whatever was
          // entered before — not just customer/product. If the fetch
          // fails, fall back to an auto-generated order number and leave
          // the rest for staff to fill in manually. Date always defaults
          // to today — the day this order is actually being placed.
          let enquiryCode = "", enquiryQty = "", enquiryPrice = p ? p.Price : "", enquiryDiscount = "";
          let enquiryDetails = null, enquiryDeliveryDate = "", enquiryNotes = "";
          try {
            const enqRes = await API.get(`/orders/${fromEnquiry}`);
            enquiryCode = enqRes.data?.Code || "";
            if (enqRes.data?.Quantity != null) enquiryQty = enqRes.data.Quantity;
            if (enqRes.data?.PricePerUnit != null) enquiryPrice = enqRes.data.PricePerUnit;
            if (enqRes.data?.DiscountPct != null) enquiryDiscount = enqRes.data.DiscountPct;
            if (enqRes.data?.OrderDetails) enquiryDetails = enqRes.data.OrderDetails;
            if (enqRes.data?.DeliveryDate) enquiryDeliveryDate = enqRes.data.DeliveryDate;
            if (enqRes.data?.Notes) enquiryNotes = enqRes.data.Notes;
          } catch { /* fall through to auto-generated code below */ }
          if (!enquiryCode) enquiryCode = `ENQ-${String(fromEnquiry).padStart(4, "0")}`;
          const today = new Date().toISOString().substring(0, 10);

          if (p) {
            localStorage.setItem("premier_category", p.Category);
            setTab(p.Category);
            setSubType(p.SubType);
          }
          setDraftDetails(enquiryDetails || null);

          setForm((f) => ({
            ...f,
            customerId: prefillCustomerId || "",
            productId: prefillProductId || "",
            qty: enquiryQty || f.qty,
            pricePerUnit: enquiryPrice || f.pricePerUnit,
            itemDiscount: enquiryDiscount || f.itemDiscount,
            deliveryDate: enquiryDeliveryDate || f.deliveryDate,
            notes: enquiryNotes || f.notes,
            enquiryOrderNo: enquiryCode,
            enquiryOrderDate: today,
          }));
        } else {
          // No source enquiry, not editing/viewing — this is a manual
          // "+ Add Enquiry" entry. Still auto-generate an order number
          // and default the date to today, same as the enquiry-
          // conversion path, so both flows present consistently.
          const today = new Date().toISOString().substring(0, 10);
          setForm((f) => ({
            ...f,
            enquiryOrderNo: `ENQ-${Date.now().toString().slice(-6)}`,
            enquiryOrderDate: today,
          }));
        }
      } catch {
        setError("Failed to load customers/products.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Turn whatever's still sitting in the hidden draft fields into an
  // item, if there is one — only ever populated behind the scenes when
  // converting a single-product enquiry. Returns null otherwise.
  const buildDraftItem = () => {
    if (!form.productId || !form.qty || !form.pricePerUnit) return null;
    const product = products.find((pr) => String(pr.Id) === String(form.productId));
    return {
      tempId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dbId: undefined,
      category: tab,
      subType,
      productId: form.productId,
      productLabel: product ? `${product.Name} (${product.Code})` : `Product #${form.productId}`,
      qty: form.qty,
      pricePerUnit: form.pricePerUnit,
      discount: form.itemDiscount || 0,
      details: draftDetails ? { ...draftDetails } : null,
    };
  };

  const handleRemoveItem = (tempId) => {
    setItems((prev) => {
      const target = prev.find((i) => i.tempId === tempId);
      if (target?.dbId) setRemovedItemIds((r) => [...r, target.dbId]);
      return prev.filter((i) => i.tempId !== tempId);
    });
  };

  const handleUpdateQty = (tempId, delta) => {
    setItems((prev) => prev.map((i) => {
      if (i.tempId !== tempId) return i;
      const next = Math.max(1, (parseInt(i.qty, 10) || 0) + delta);
      return { ...i, qty: next };
    }));
  };

  // ── Embedded Product Picker — grouping / search / add (mirrors
  // ProductSelection.jsx, scoped to this order's locked category and
  // writing straight into `items` instead of a separate cart). ──
  const categoryProducts = useMemo(() => products.filter((p) => p.Category === tab), [products, tab]);

  const pickerSubTypes = useMemo(
    () => Array.from(new Set(categoryProducts.map((p) => p.SubType).filter(Boolean))),
    [categoryProducts]
  );

  const pickerGrouped = useMemo(() => {
    const covered = new Set();
    const groups = {};
    for (const [type, subs] of Object.entries(TYPE_GROUPS)) {
      const present = subs.filter((s) => pickerSubTypes.includes(s));
      present.forEach((s) => covered.add(s));
      if (present.length > 0) groups[type] = present;
    }
    const leftover = pickerSubTypes.filter((s) => !covered.has(s));
    if (leftover.length > 0) groups["Others"] = leftover.sort();
    return groups;
  }, [pickerSubTypes]);

  const pickerTypeKeys = Object.keys(pickerGrouped);
  const pickerSubTypesForActiveType = pickerGrouped[pickerType] || [];

  useEffect(() => {
    if (isNewOrder && !pickerType && pickerTypeKeys.length > 0) setPickerType(pickerTypeKeys[0]);
    // eslint-disable-next-line
  }, [isNewOrder, pickerTypeKeys, pickerType]);

  useEffect(() => {
    if (pickerSubTypesForActiveType.length > 0 && !pickerSubTypesForActiveType.includes(pickerSubType)) {
      setPickerSubType(pickerSubTypesForActiveType[0]);
    }
    // eslint-disable-next-line
  }, [pickerType, pickerSubTypesForActiveType]);

  useEffect(() => {
    setPickerNameQuery("");
    setPickerNameMenuOpen(false);
    setPickerSecondaryQuery("");
    setPickerUomFilter("All");
  }, [pickerSubType]);

  useEffect(() => {
    const onClick = (e) => {
      if (pickerNameBoxRef.current && !pickerNameBoxRef.current.contains(e.target)) setPickerNameMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pickerNamesInSubType = useMemo(() => {
    const names = categoryProducts.filter((p) => p.SubType === pickerSubType).map((p) => p.Name);
    return Array.from(new Set(names)).sort();
  }, [categoryProducts, pickerSubType]);

  const pickerSuggestionNames = useMemo(() => {
    const q = pickerNameQuery.trim().toLowerCase();
    if (!q) return pickerNamesInSubType;
    return pickerNamesInSubType.filter((n) => n.toLowerCase().includes(q));
  }, [pickerNamesInSubType, pickerNameQuery]);

  const pickerTableProducts = useMemo(() => {
    const q = pickerNameQuery.trim().toLowerCase();
    const sq = pickerSecondaryQuery.trim().toLowerCase();
    return categoryProducts
      .filter((p) => p.SubType === pickerSubType)
      .filter((p) => !q || p.Name.toLowerCase().includes(q))
      .filter((p, i) => {
        if (!sq) return true;
        const sortNoVal = String(sortNoFor(p) ?? "").toLowerCase();
        const desc = dummyDescription(p, i).toLowerCase();
        return sortNoVal.includes(sq) || desc.includes(sq);
      })
      .filter((p) => pickerUomFilter === "All" || dummyUom(p.SubType) === pickerUomFilter);
  }, [categoryProducts, pickerSubType, pickerNameQuery, pickerSecondaryQuery, pickerUomFilter]);

  // How much of a product is already on this order (added via the
  // picker below, or already present as an item).
  const inOrderQty = (productId) => items.find((i) => String(i.productId) === String(productId))?.qty || 0;
  const getPickerRowQty = (id) => (pickerRowQty[id] !== undefined ? pickerRowQty[id] : inOrderQty(id));
  const setPickerRowQtyFor = (product, qty) => {
    const cap = product.Quantity ?? qty;
    setPickerRowQty((prev) => ({ ...prev, [product.Id]: Math.max(0, Math.min(qty, cap || qty)) }));
  };

  // Adds (or updates the qty of) a product on this order. Doesn't touch
  // a backend cart — this order isn't saved until "Place Order" below.
  const handlePickerAdd = (product) => {
    const qty = getPickerRowQty(product.Id);
    if (qty <= 0) return;
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => String(i.productId) === String(product.Id));
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], qty };
        return next;
      }
      return [...prev, {
        tempId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dbId: undefined,
        category: tab,
        subType: pickerSubType,
        productId: product.Id,
        productLabel: `${product.Name} (${product.Code})`,
        qty,
        pricePerUnit: product.Price || 0,
        discount: 0,
        details: null,
      }];
    });
    setPickerJustAddedId(product.Id);
    setTimeout(() => setPickerJustAddedId((cur) => (cur === product.Id ? null : cur)), 1400);
  };

  const handleSubmit = async () => {
    if (viewOnly) return;
    setError("");
    if (!form.customerId) {
      setError("Please select a customer.");
      return;
    }

    // Whatever is still sitting in the hidden draft fields counts as
    // one more item (single-product enquiry conversion case).
    const draftItem = buildDraftItem();
    const finalItems = draftItem ? [...items, draftItem] : items;

    if (finalItems.length === 0) {
      setError("This order has no products on it yet — select products above first.");
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        // ── Editing an existing order ──
        // Existing rows (item.dbId set) are updated in place with PUT;
        // anything the user removed from the list is actually deleted
        // so it doesn't linger on the backend.
        const groupRef = existingGroupRef || (finalItems.length > 1 ? `GRP-${Date.now()}` : null);

        for (const id of removedItemIds) {
          await API.delete(`/orders/${id}`);
        }

        for (const item of finalItems) {
          const orderDetails = { ...(item.details || {}) };
          if (groupRef) orderDetails.GroupRef = groupRef;
          if (form.enquiryOrderNo) orderDetails.EnquiryOrderNo = form.enquiryOrderNo;
          if (form.enquiryOrderDate) orderDetails.EnquiryOrderDate = form.enquiryOrderDate;

          const payload = {
            customerId: form.customerId,
            productId: item.productId,
            qty: item.qty,
            pricePerUnit: item.pricePerUnit,
            discount: item.discount || 0,
            deliveryDate: form.deliveryDate || null,
            notes: form.notes || null,
            orderDetails: Object.keys(orderDetails).length ? orderDetails : null,
          };

          if (item.dbId) {
            await API.put(`/orders/${item.dbId}`, payload);
          } else {
            await API.post("/orders", payload);
          }
        }
      } else {
        // ── Placing a new order (manual entry or converting an enquiry) ──
        // Multiple products in one order are still separate Order rows
        // under the hood, tagged with a shared GroupRef so they display,
        // edit and delete together as one order everywhere in the app.
        const groupRef = finalItems.length > 1 ? `GRP-${Date.now()}` : null;

        // Coming from an approved enquiry: that enquiry IS this order —
        // update its own row in place with the confirmed details rather
        // than creating a brand new row and leaving the original
        // enquiry stranded behind it. Only the first item does this;
        // any further items are still new rows sharing the GroupRef,
        // same as a normal multi-product order.
        let first = true;
        for (const item of finalItems) {
          const orderDetails = { ...(item.details || {}) };
          if (groupRef) orderDetails.GroupRef = groupRef;
          if (form.enquiryOrderNo) orderDetails.EnquiryOrderNo = form.enquiryOrderNo;
          if (form.enquiryOrderDate) orderDetails.EnquiryOrderDate = form.enquiryOrderDate;

          if (fromEnquiry && first) {
            // O2C Step 4 — Marketing (admin/end_user) places the order but
            // the Marketing Head (system_admin) gives the real, final
            // approval. So this submit only sets status="approved" when the
            // Marketing Head themselves is the one placing/finalizing it;
            // otherwise it stays "assigned" (placed, dated — just waiting
            // in the Final Approval queue).
            await API.put(`/orders/${fromEnquiry}`, {
              qty: item.qty,
              pricePerUnit: item.pricePerUnit,
              discount: item.discount || 0,
              deliveryDate: form.deliveryDate || null,
              notes: form.notes || null,
              status: role === "system_admin" ? "approved" : "assigned",
              orderDetails: Object.keys(orderDetails).length ? orderDetails : null,
            });
          } else {
            await API.post("/orders", {
              customerId: form.customerId,
              productId: item.productId,
              qty: item.qty,
              pricePerUnit: item.pricePerUnit,
              discount: item.discount || 0,
              deliveryDate: form.deliveryDate || null,
              notes: form.notes || null,
              orderDetails: Object.keys(orderDetails).length ? orderDetails : null,
            });
          }
          first = false;
        }
      }

      navigate("/master/orders");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save order.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout pageTitle={viewOnly ? "View Order" : editId ? "Edit Order" : "Add Order"}>
        <p style={{ color: themeG.textSub }}>Loading customers and products…</p>
      </Layout>
    );
  }

  return (
    <Layout pageTitle={viewOnly ? "View Order" : editId ? "Edit Order" : "Add Order"}>

      {/* ── Category locked badge ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: themeG.card, border: `1px solid ${themeG.border}`, boxShadow: "0 2px 8px rgba(46,122,114,0.06)" }}>
          <span style={{ fontSize: 18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"}</span>
        </div>
        {/* {!viewOnly && (
          <span style={{ fontSize: 12, color: themeG.textSub }}>
            Category locked — <span style={{ color: themeG.accent, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => navigate("/select-category")}>Switch category</span>
          </span>
        )} */}
      </div>

      {fromEnquiry && !editId && (
        <div style={{ marginBottom: 20, background: "rgba(58,37,96,0.08)", border: "1px solid rgba(58,37,96,0.25)", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#3A2560", fontWeight: 600 }}>
          Converting enquiry #{fromEnquiry} — customer and product are pre-filled below. Confirm delivery date and remarks, then Approve or Place Order.
        </div>
      )}

      {editId && (
        <div style={{ marginBottom: 20, background: "rgba(91,155,217,0.08)", border: "1px solid rgba(91,155,217,0.25)", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#1F5C99", fontWeight: 600 }}>
          {viewOnly
            ? `Viewing order ${form.enquiryOrderNo || `#${editId}`} — read-only.`
            : `Editing order ${form.enquiryOrderNo || `#${editId}`} — everything below is pre-filled from the existing order. Click "Edit" on Payment & Delivery to change it, then Update Order.`}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {error && (
          <div style={{ background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
            {error}
          </div>
        )}

        {/* ── 1. Order Details — Enquiry Order No / Date are always
              read-only (pre-filled). Customer is editable unless the
              order is being viewed (viewOnly), in which case it shows
              read-only too. ── */}
        <div style={card}>
          <h3 style={{ ...cardTitle }}>Order Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "4px 20px", alignItems: "start" }}>
            <Field label="Enquiry Order No">
              <Input type="text" value={form.enquiryOrderNo} disabled />
            </Field>

            <Field label="Enquiry Order Date">
              <Input type="date" value={form.enquiryOrderDate} disabled />
            </Field>

            {(viewOnly || editId) ? (
              <ReadField label="Customer" value={customers.find(c => String(c.Id) === String(form.customerId)) ? `${customers.find(c => String(c.Id) === String(form.customerId)).Name} (${customers.find(c => String(c.Id) === String(form.customerId)).Code})` : "—"} />
            ) : (
              <Field label="Customer" required>
                <Select value={form.customerId} onChange={e => set("customerId", e.target.value)}>
                  <option value="">Select customer…</option>
                  {customers.map(c => <option key={c.Id} value={c.Id}>{c.Name} ({c.Code})</option>)}
                </Select>
              </Field>
            )}
          </div>
        </div>

        {/* ── 2. Select Products — brand-new manual orders only. Same
              tabs → sub-tabs → combined name search → secondary
              search/UOM → table + qty stepper + Add pattern as the
              Product Selection page, writing straight into `items`
              since there's no separate cart step on this page. ── */}
        {isNewOrder && !viewOnly && (
          <div style={card}>
            <h3 style={cardTitle}>Select Products</h3>

            {pickerTypeKeys.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                {pickerTypeKeys.map((t, i) => (
                  <button key={t} type="button" onClick={() => setPickerType(t)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10,
                      border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                      background: pickerType === t ? TAB_COLORS[i % TAB_COLORS.length] : themeG.bg,
                      color: pickerType === t ? "#fff" : themeG.textMain,
                    }}>
                    <span>{TAB_ICONS[t.toLowerCase()] || "🧷"}</span> {t}
                  </button>
                ))}
              </div>
            )}

            {pickerSubTypesForActiveType.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {pickerSubTypesForActiveType.map((s) => (
                  <button key={s} type="button" onClick={() => setPickerSubType(s)}
                    style={{
                      padding: "6px 14px", borderRadius: 16, border: `1.5px solid ${pickerSubType === s ? themeG.accent : themeG.border}`,
                      cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                      background: pickerSubType === s ? `${themeG.accent}1A` : "transparent",
                      color: pickerSubType === s ? themeG.accent : themeG.textSub,
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div style={{ position: "relative", marginBottom: 14 }} ref={pickerNameBoxRef}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Product Name</label>
              <input
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 14, fontFamily: "inherit", color: themeG.textMain, background: themeG.card, outline: "none" }}
                placeholder={`Search or choose a ${pickerSubType || pickerType} product…`}
                value={pickerNameQuery}
                onFocus={() => setPickerNameMenuOpen(true)}
                onChange={(e) => { setPickerNameQuery(e.target.value); setPickerNameMenuOpen(true); }}
              />
              {pickerNameMenuOpen && (
                <div style={{ position: "absolute", zIndex: 5, top: "calc(100% + 6px)", left: 0, right: 0, maxHeight: 220, overflowY: "auto", background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 9, boxShadow: "0 8px 24px rgba(15,33,56,0.14)" }}>
                  {pickerSuggestionNames.length === 0 ? (
                    <div style={{ padding: "10px 14px", fontSize: 12.5, color: themeG.textSub, fontStyle: "italic" }}>No product name matches "{pickerNameQuery}".</div>
                  ) : (
                    pickerSuggestionNames.map((n) => (
                      <div key={n} style={{ padding: "9px 14px", fontSize: 13.5, color: themeG.textMain, cursor: "pointer" }}
                        onMouseDown={() => { setPickerNameQuery(n); setPickerNameMenuOpen(false); }}>
                        {n}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ flex: "1 1 240px", minWidth: 200 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Search Sort No / Description</label>
                <input
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: "inherit", color: themeG.textMain, background: themeG.card, outline: "none" }}
                  placeholder="e.g. 1481 or description…"
                  value={pickerSecondaryQuery}
                  onChange={(e) => setPickerSecondaryQuery(e.target.value)}
                />
              </div>
              <div style={{ flex: "0 1 160px", minWidth: 140 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>UOM</label>
                <select
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: "inherit", color: themeG.textMain, background: themeG.card, outline: "none" }}
                  value={pickerUomFilter} onChange={(e) => setPickerUomFilter(e.target.value)}>
                  {["All", "m", "pcs"].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={{ border: `1px solid ${themeG.border}`, borderRadius: 12, overflow: "hidden" }}>
              {pickerTableProducts.length === 0 ? (
                <div style={{ padding: 26, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>
                  {pickerSubType ? `No ${pickerSubType} products match the current filters.` : "No products available for this category."}
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto", overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Sort No", "Shade No", "Product Description", "Type", "UOM", "Colour", "Quantity"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",  color: "#FFFFFF", background: "#1F3A63", borderBottom: `1px solid ${themeG.border}`, position: "sticky", top: 0 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pickerTableProducts.map((p, i) => {
                        const qty = getPickerRowQty(p.Id);
                        const swatch = p.Color || DUMMY_SWATCHES[i % DUMMY_SWATCHES.length];
                        const already = inOrderQty(p.Id);
                        return (
                          <tr key={p.Id}>
                            <td style={{ padding: "10px 14px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` }}>{sortNoFor(p)}</td>
                            <td style={{ padding: "10px 14px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` }}>{dummyShadeNo(p, i)}</td>
                            <td style={{ padding: "10px 14px", fontSize: 13, color: themeG.textSub, borderBottom: `1px solid ${themeG.border}` }}>{dummyDescription(p, i)}</td>
                            <td style={{ padding: "10px 14px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` }}>{dummyType(p, i)}</td>
                            <td style={{ padding: "10px 14px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` }}>{dummyUom(p.SubType)}</td>
                            <td style={{ padding: "10px 14px", borderBottom: `1px solid ${themeG.border}` }}>
                              <div style={{ width: 20, height: 20, borderRadius: "50%", background: swatch, border: "1.5px solid rgba(0,0,0,0.14)" }} />
                            </td>
                            <td style={{ padding: "10px 14px", borderBottom: `1px solid ${themeG.border}` }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <button type="button" style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                                    onClick={() => setPickerRowQtyFor(p, qty - 1)}>−</button>
                                  <input type="number" min={0} max={p.Quantity ?? undefined} value={qty}
                                    onChange={(e) => setPickerRowQtyFor(p, parseInt(e.target.value, 10) || 0)}
                                    style={{ width: 48, textAlign: "center", padding: "4px", borderRadius: 6, border: `1px solid ${themeG.border}`, fontSize: 12.5, fontFamily: "inherit", color: themeG.textMain, background: themeG.card, outline: "none" }} />
                                  <button type="button" style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                                    onClick={() => setPickerRowQtyFor(p, qty + 1)}>+</button>
                                </div>
                                <button type="button" onClick={() => handlePickerAdd(p)}
                                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: pickerJustAddedId === p.Id ? "#16A34A" : themeG.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                  {pickerJustAddedId === p.Id ? "✓ Added" : "+ Add"}
                                </button>
                              </div>
                              {already > 0 && <p style={{ fontSize: 10.5, color: themeG.textSub, margin: "4px 0 0" }}>In order: {already}</p>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 3. Products in this order — full width, easy to scan.
              For a new order, rows land here via the picker above; for
              edit/view they're loaded straight from the backend as
              before. Sort No / Shade No come straight from the product
              record. ── */}
        {items.length > 0 && (
          <div style={card}>
            <h3 style={cardTitle}>Products in this Order ({items.length})</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {(viewOnly
                    ? ["S.No", "Sort No", "Shade No", "Product", "Sub-type", "Qty"]
                    : ["S.No", "Sort No", "Shade No", "Product", "Sub-type", "Qty", "Actions"]
                  ).map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 11,color: "#FFFFFF", background: "#1F3A63", padding: "10px 12px", borderBottom: `2px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i, idx) => {
                  const product = products.find((p) => String(p.Id) === String(i.productId));
                  return (
                    <tr key={i.tempId}>
                      <td style={{ padding: "11px 12px", fontSize: 13, color: themeG.textSub, borderBottom: `1px solid ${themeG.border}` }}>{idx + 1}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` }}>{sortNoFor(product)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` }}>{shadeNoFor(product)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` }}>{i.productLabel}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, color: themeG.textSub, borderBottom: `1px solid ${themeG.border}`, textTransform: "capitalize" }}>{i.subType}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, borderBottom: `1px solid ${themeG.border}` }}>
                        {viewOnly ? (
                          <span style={{ fontWeight: 600 }}>{i.qty}</span>
                        ) : editingQtyId === i.tempId ? (
                          <input
                            type="number"
                            min={1}
                            value={i.qty}
                            onChange={(e) => {
                              const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setItems((prev) => prev.map((it) => it.tempId === i.tempId ? { ...it, qty: v } : it));
                            }}
                            style={{ width: 70, padding: "6px 8px", borderRadius: 7, border: `1px solid ${themeG.border}`, fontSize: 13, fontFamily: "inherit", color: themeG.textMain, background: themeG.card, outline: "none", boxSizing: "border-box" }}
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button type="button" onClick={() => handleUpdateQty(i.tempId, -1)}
                              style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, cursor: "pointer", fontSize: 14, fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              −
                            </button>
                            <span style={{ minWidth: 24, textAlign: "center", fontWeight: 600 }}>{i.qty}</span>
                            <button type="button" onClick={() => handleUpdateQty(i.tempId, 1)}
                              style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, cursor: "pointer", fontSize: 14, fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              +
                            </button>
                          </div>
                        )}
                      </td>
                      {!viewOnly && (
                        <td style={{ padding: "11px 12px", borderBottom: `1px solid ${themeG.border}` }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => setEditingQtyId((prev) => prev === i.tempId ? null : i.tempId)}
                              style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${themeG.accent}55`, background: `${themeG.accent}14`, color: themeG.accent, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                              {editingQtyId === i.tempId ? "Done" : "Edit"}
                            </button>
                            <button onClick={() => handleRemoveItem(i.tempId)}
                              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(178,58,58,0.30)", background: "rgba(178,58,58,0.06)", color: "#B23A3A", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                              Remove
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 4. Payment & Delivery — Expected Delivery Date and
              Remarks. Locked until Edit — and in view mode, the Edit
              button is hidden entirely so it stays permanently
              read-only. ── */}
        <div style={card}>
          <h3 style={{ ...cardTitle }}>Payment & Delivery</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "4px 20px", alignItems: "start" }}>
            {editPayment ? (
              <Field label="Expected Delivery Date">
                <Input type="date" value={form.deliveryDate} onChange={e => set("deliveryDate", e.target.value)} />
              </Field>
            ) : (
              <ReadField label="Expected Delivery Date" value={form.deliveryDate || "—"} />
            )}

            {editPayment ? (
              <Field label="Remarks">
                <textarea placeholder="Special instructions, etc." value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
                  style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 14, fontFamily: "inherit", color: themeG.textMain, background: themeG.card, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </Field>
            ) : (
              <ReadField label="Remarks" value={form.notes || "—"} />
            )}
          </div>
          {!viewOnly && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" onClick={() => setEditPayment(v => !v)}
                style={{
                  padding: "9px 24px", borderRadius: 9, border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#fff",
                  background: editPayment ? "#D97706" : "#F59E0B",
                  boxShadow: "0 4px 12px rgba(217,119,6,0.35)"
                }}>
                {editPayment ? "Done" : "Edit"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
        <button onClick={() => navigate("/master/orders")}
          style={{ padding: "10px 24px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
          {viewOnly ? "Close" : "Cancel"}
        </button>

        {!viewOnly && (
          <button onClick={() => setEditPayment(true)}
            style={{ padding: "10px 24px", borderRadius: 9, border: "1.5px solid #1F5C99", background: "transparent", color: "#1F5C99", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
            Edit
          </button>
        )}

        {!viewOnly && !editId && (
          <button onClick={handleSubmit} disabled={saving}
            style={{ padding: "10px 24px", borderRadius: 9, border: `1.5px solid ${themeG.accent}`, background: "transparent", color: themeG.accent, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
            {saving ? "…" : "Approve"}
          </button>
        )}

        {!viewOnly && (
          <button onClick={handleSubmit} disabled={saving}
            style={{ padding: "10px 28px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 10px rgba(91,155,217,0.32)", opacity: saving ? 0.6 : 1 }}>
            {saving
              ? (editId ? "Updating…" : "Placing…")
              : editId
                ? "Update Order"
                : `Place Order${(items.length + (form.productId ? 1 : 0)) > 1 ? ` (${items.length + (form.productId ? 1 : 0)} products)` : ""}`}
          </button>
        )}
      </div>
    </Layout>
  );
}