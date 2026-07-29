// src/pages/ProductCatalog.jsx
//
// Product Selection — picking a Type (e.g. Dhoti) shows its SubType
// sub-tabs (Cotton Dhoti Grey/Fabric), then a single combined "Product
// Name" search box: type to filter, or open it to pick straight from the
// list — one control instead of a separate search field + dropdown.
// Whatever matches shows up as a scrollable table below (same table
// style as the Field Officer's Product Selection screen: Sort No |
// Product Name | Type | Description | UOM | Colour | Shade No |
// Quantity), so every matching variant (e.g. Uniform Shirting "Senator"
// in both "Bld/Dyed" and "503 R.Blue") is its own row with its own qty
// stepper + Add — instead of resolving down to one single product "box".
//
// "Add" on a row just adds that one product+qty to a shared, persistent
// cart (utils/customerCart.js) — it does NOT submit anything. There is
// no "Submit Enquiry" control anywhere on this page; reviewing everything
// you've added and actually submitting the enquiry only happens on the
// separate Order Enquiry (cart) page, reached via "View Cart & Submit".
//
// The Cart Summary sidebar also has a "Clear Cart" action — wipes every
// item out of the shared cart in one go (with a confirm prompt) instead
// of making someone remove rows one-by-one on the Order Enquiry page.
//
// ── Table columns (matches Primere_Requirements.xlsx / End User parity) ──
// The requirements sheet's "Type" column holds the actual variant/dye
// info per row (e.g. "BLD & DYED", "Bld/Dyed", "503 R.Blue", "3.7 & 7.4",
// "8*137 (Box)") — it is NOT the top-level catalog Type (Blouse/Dhoti/
// Uniform...), which is already used for the tab grouping above. Real
// per-row Type/Description aren't reliably populated by the backend yet
// (Description used to just echo the Type text back), so both are
// resolved through dummyType()/dummyDescription() below: real value if
// the API supplies a genuinely different one, otherwise a representative
// placeholder — so neither column duplicates the other or sits blank.
// Colour (swatch) and Shade No (code) are now two separate columns
// instead of one combined cell, mirroring the End User screen.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/CustomerLayout";
import { useTheme } from "../ThemeContext";
import { getG } from "../theme";
import API from "../services/api";
import { getCart, addToCart, subscribeToCart, clearCart } from "../utils/customerCart";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TAB_COLORS = ["#1F5C99", "#2E7D32", "#6A3FA0", "#C9740B", "#0E7C86", "#B23A3A"];
const TAB_ICONS  = { blouse: "👚", dhoti: "📜", uniform: "🎽", "uniform shirting": "🎽", "uniform suiting": "🧥", "premier shirting": "👔", pant: "👖", shirt: "👔", leggings: "🩳", bundle: "🧶", hank: "🧵", cone: "🧵", others: "📦" };

const TYPE_GROUPS = {
  "Blouse":           ["Blouse"],
  "Dhoti":            ["Dhoti", "Cotton Dhoti Grey", "Cotton Dhoti Fabric"],
  "Uniform Shirting": ["Uniform Shirting"],
  "Uniform Suiting":  ["Uniform Suiting"],
  "Premier Shirting": ["Premier Shirting"],
};

function dummyUom(subType) {
  const u = (subType || "").toLowerCase();
  if (u.includes("shirting") || u.includes("suiting") || u.includes("blouse")) return "m";
  return "pcs";
}
const DUMMY_SWATCHES = ["#8FD9A8", "#7FD1E0", "#E893C9", "#9A9AA5", "#F0A15C", "#B7A6E0"];

// ── Dummy fallbacks for the per-row Type / Description / Shade No —
// pulled straight from the variant wording seen across the requirements
// sheet (Blouse/Dhoti/Uniform Shirting/Uniform Suiting/Premier Shirting
// tabs) so placeholder rows still look like real catalog rows. Real
// values from the API always win; these only fill the gap. Kept
// identical to the End User page so both roles show the same data.
const DUMMY_TYPES = ["BLD & DYED", "Bld/Dyed", "R.Blue/G.Blue", "Fiber Dyed", "YD Dyed", "YD Slub", "3.7 & 7.4", "8*137 (Box)", "Spl Maroon"];
// Shade No now reads "Shade 101" rather than "SH-101".
const DUMMY_SHADE_NOS = ["101", "102", "103", "104", "105", "106"];

function dummyType(product, i) {
  return product.Type || DUMMY_TYPES[i % DUMMY_TYPES.length];
}
function dummyShadeNo(product, i) {
  const num = product.ShadeNo || DUMMY_SHADE_NOS[i % DUMMY_SHADE_NOS.length];
  return `SHADE ${num}`;
}
// Description is always derived from the row's own Shade No — "Shading
// fabric 'Shade 101'" — rather than an unrelated placeholder sentence,
// so it stays tied to the actual row instead of just rotating text.
function dummyDescription(product, i) {
  return `SHADING FABRIC ${dummyShadeNo(product, i)}`;
}

const UOM_OPTIONS = ["All", "m", "pcs"];

function formatDate(d) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
}

export default function ProductCatalog() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [activeType, setActiveType] = useState("");
  const [activeSubType, setActiveSubType] = useState("");

  // ── Combined Product Name search + dropdown ──
  // One control instead of a separate "Search" box and "Product Name"
  // select: type to filter the table live, or click in to see/choose from
  // the full list for the active Sub-type.
  const [nameQuery, setNameQuery] = useState("");
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const nameBoxRef = useRef(null);

  // ── Secondary filter row: free-text search across Sort No / Product
  // Description, plus a UOM dropdown (m / pcs). Separate from the
  // Product Name combo above — narrows the same table further, doesn't
  // replace the name search. Mirrors the End User page.
  const [secondaryQuery, setSecondaryQuery] = useState("");
  const [uomFilter, setUomFilter] = useState("All");

  // Per-row quantities in the table, keyed by Product.Id — lets every
  // visible row have its own independent qty stepper before "Add".
  const [rowQty, setRowQty] = useState({});
  const [justAddedId, setJustAddedId] = useState(null);

  const [cart, setCart] = useState(getCart());

  // Grid stacks to a single column below this width so the Cart Summary
  // sidebar never gets pushed off the right edge on a narrower window —
  // see the `layout` style below for the actual breakpoint logic.
  const [viewportWidth, setViewportWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isNarrow = viewportWidth < 1100;

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "customer") { navigate("/login"); return; }
    (async () => {
      try {
        const [prodRes, custRes] = await Promise.all([
          API.get("/products", { params: { status: "active" } }),
          API.get("/customers"),
        ]);
        setProducts(prodRes.data);
        setCustomer(custRes.data?.[0] || null);
      } catch {
        setError("Failed to load the product list. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
    const unsub = subscribeToCart(() => setCart(getCart()));
    return unsub;
    // eslint-disable-next-line
  }, []);

  // Close the combined dropdown when clicking anywhere outside it.
  useEffect(() => {
    const onClick = (e) => {
      if (nameBoxRef.current && !nameBoxRef.current.contains(e.target)) setNameMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const allSubTypes = useMemo(
    () => Array.from(new Set(products.map((p) => p.SubType).filter(Boolean))),
    [products]
  );

  const grouped = useMemo(() => {
    const covered = new Set();
    const groups = {};
    for (const [type, subs] of Object.entries(TYPE_GROUPS)) {
      const present = subs.filter((s) => allSubTypes.includes(s));
      present.forEach((s) => covered.add(s));
      if (present.length > 0) groups[type] = present;
    }
    const leftover = allSubTypes.filter((s) => !covered.has(s));
    if (leftover.length > 0) groups["Others"] = leftover.sort();
    return groups;
  }, [allSubTypes]);

  const typeKeys = Object.keys(grouped);
  const subTypesForActiveType = grouped[activeType] || [];

  useEffect(() => {
    if (!activeType && typeKeys.length > 0) setActiveType(typeKeys[0]);
  }, [typeKeys, activeType]);

  useEffect(() => {
    if (subTypesForActiveType.length > 0 && !subTypesForActiveType.includes(activeSubType)) {
      setActiveSubType(subTypesForActiveType[0]);
    }
    // eslint-disable-next-line
  }, [activeType, subTypesForActiveType]);

  useEffect(() => {
    setNameQuery(""); // fresh search per Type/SubType, not carried over
    setNameMenuOpen(false);
    setSecondaryQuery("");
    setUomFilter("All");
  }, [activeSubType]);

  // Every distinct Product Name available under the active Sub-type —
  // shown in the combined dropdown's suggestion list.
  const namesInSubType = useMemo(() => {
    const names = products.filter((p) => p.SubType === activeSubType).map((p) => p.Name);
    return Array.from(new Set(names)).sort();
  }, [products, activeSubType]);

  const suggestionNames = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return namesInSubType;
    return namesInSubType.filter((n) => n.toLowerCase().includes(q));
  }, [namesInSubType, nameQuery]);

  // The table itself — every catalog row (i.e. every Type/spec variant)
  // for the active Sub-type, narrowed by whatever's typed into the
  // combined Product Name box, the secondary Sort No/Description search,
  // and the UOM filter. Picking a suggestion narrows this to just that
  // one name's variant(s); clearing the box shows everything again.
  const tableProducts = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const sq = secondaryQuery.trim().toLowerCase();
    return products
      .filter((p) => p.SubType === activeSubType)
      .filter((p) => !q || p.Name.toLowerCase().includes(q))
      .filter((p, i) => {
        if (!sq) return true;
        const sortNo = String(p.Code ?? "").toLowerCase();
        const desc = dummyDescription(p, i).toLowerCase();
        return sortNo.includes(sq) || desc.includes(sq);
      })
      .filter((p) => uomFilter === "All" || dummyUom(p.SubType) === uomFilter);
  }, [products, activeSubType, nameQuery, secondaryQuery, uomFilter]);

  const inCartQty = (productId) => cart.find((i) => i.key.startsWith(`${productId}::`))?.qty || 0;

  // Every row starts at 0, not 1 — except a product that's already in
  // the cart, which shows the quantity actually added instead of
  // resetting to 0 (falls back to inCartQty whenever the user hasn't
  // touched this row's stepper themselves in this session).
  const getRowQty = (id) => (rowQty[id] !== undefined ? rowQty[id] : inCartQty(id));
  const setRowQtyFor = (product, qty) => {
    const cap = product.Quantity ?? qty;
    setRowQty((prev) => ({ ...prev, [product.Id]: Math.max(0, Math.min(qty, cap || qty)) }));
  };

  const addRowToCart = (product) => {
    const qty = getRowQty(product.Id);
    if (qty <= 0) return;
    addToCart({ product, qty, color: "", size: "" });
    setNotice(`Added ${qty} × ${product.Name} to cart.`);
    setJustAddedId(product.Id);
    setTimeout(() => setJustAddedId((cur) => (cur === product.Id ? null : cur)), 1400);
  };

  // Wipes every item out of the shared cart in one go. Confirms first
  // since this can't be undone — mirrors the "Remove" confirm pattern
  // used elsewhere, just for the whole cart instead of one row. Also
  // resets any in-progress row qty steppers on this page so they don't
  // keep showing a leftover qty for a product that's no longer in cart.
  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (!window.confirm("Clear all items from your cart? This can't be undone.")) return;
    clearCart();
    setRowQty({});
    setNotice("Cart cleared.");
  };

  const cartCount = cart.length;
  const cartQty = cart.reduce((sum, i) => sum + i.qty, 0);

  const S = {
    infoCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "18px 22px", marginBottom: 20, boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    infoTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: "0 0 16px" },
    infoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 },
    infoLabel: { fontSize: 10.5, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" },
    infoValue: { fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: 0 },

    tabRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 },
    tab: (active, color) => ({
      display: "flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 10,
      border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
      background: active ? color : themeG.card, color: active ? "#fff" : themeG.textMain,
      boxShadow: active ? `0 4px 14px ${color}55` : `0 2px 8px rgba(15,33,56,0.06)`,
    }),
    subTabRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: -8, marginBottom: 18, paddingLeft: 4 },
    subTab: (active) => ({
      padding: "7px 16px", borderRadius: 16, border: "1.5px solid",
      cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
      background: active ? "rgba(31,92,153,0.10)" : "transparent",
      color: active ? themeG.accent : themeG.textSub,
      borderColor: active ? themeG.accent : themeG.border,
    }),

    layout: { display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(0, 1fr) 300px", gap: 20, alignItems: "start" },

    // ── Combined Product Name search + dropdown ──
    comboWrap: { position: "relative", marginBottom: 14 },
    label: { fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" },
    comboInput: { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 14, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none" },
    comboMenu: { position: "absolute", zIndex: 5, top: "calc(100% + 6px)", left: 0, right: 0, maxHeight: 220, overflowY: "auto", background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 9, boxShadow: "0 8px 24px rgba(15,33,56,0.14)" },
    comboItem: { padding: "9px 14px", fontSize: 13.5, color: themeG.textMain, cursor: "pointer", fontFamily: FONT },
    comboEmpty: { padding: "10px 14px", fontSize: 12.5, color: themeG.textSub, fontStyle: "italic" },

    // ── Secondary filter row: Sort No / Description search + UOM dropdown ──
    filterRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 },
    filterCol: { flex: "1 1 240px", minWidth: 200 },
    filterColNarrow: { flex: "0 1 160px", minWidth: 140 },
    filterLabel: { fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" },
    filterInput: { width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none" },
    filterSelect: { width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none", maxWidth: 160 },

    // ── Scrollable table, same shape as the Field Officer's screen ──
    tableCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    tableScroll: { maxHeight: 340, overflowY: "auto", overflowX: "auto" },
    table: { width: "100%", minWidth: 800, borderCollapse: "collapse" },
    th: { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: themeG.textLabel, background: themeG.bg, borderBottom: `1px solid ${themeG.border}`, position: "sticky", top: 0, zIndex: 1 },
    td: { padding: "12px 16px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}`, whiteSpace: "nowrap" },
    tdWrap: { padding: "12px 16px", fontSize: 13, color: themeG.textSub, borderBottom: `1px solid ${themeG.border}`, whiteSpace: "normal", maxWidth: 240 },
    swatch: (c) => ({ width: 20, height: 20, borderRadius: "50%", background: c, border: "1.5px solid rgba(0,0,0,0.14)", display: "inline-block", verticalAlign: "middle" }),
    shadeNo: { fontSize: 13, fontWeight: 600, color: themeG.textMain },

    qtyBox: { display: "flex", alignItems: "center", gap: 6 },
    qtyBtn: { width: 26, height: 26, borderRadius: 7, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 14, fontWeight: 700, cursor: "pointer" },
    qtyInput: { width: 52, textAlign: "center", padding: "5px 4px", borderRadius: 7, border: `1px solid ${themeG.border}`, fontSize: 13, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none" },
    addBtn: { padding: "7px 16px", borderRadius: 8, border: "none", background: themeG.accent, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
    addedBtn: { padding: "7px 16px", borderRadius: 8, border: "none", background: "#16A34A", color: "#fff", fontSize: 12.5, fontWeight: 700, fontFamily: FONT },
    inCartNote: { fontSize: 10.5, color: themeG.textSub },

    sidebar: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 20, boxShadow: "0 4px 16px rgba(15,33,56,0.06)", position: isNarrow ? "static" : "sticky", top: 20 },
    sidebarTitleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 16px" },
    sidebarTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700, color: themeG.textMain, margin: 0 },
    clearCartLink: { border: "none", background: "transparent", color: "#B23A3A", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, padding: 0, opacity: cart.length === 0 ? 0.4 : 1, pointerEvents: cart.length === 0 ? "none" : "auto" },
    statLabel: { fontSize: 11.5, color: themeG.textSub, fontWeight: 600 },
    statValue: { fontSize: 18, fontWeight: 700, color: themeG.textMain },
    divider: { height: 1, background: themeG.border, margin: "14px 0" },
    lineItem: { display: "flex", justifyContent: "space-between", fontSize: 12.5, color: themeG.textMain, padding: "5px 0" },
    lineItemSub: { color: themeG.textSub, fontSize: 11 },
    emptyNote: { fontSize: 12.5, color: themeG.textSub, fontStyle: "italic" },
    viewCartBtn: { width: "100%", padding: "11px 0", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, marginTop: 14 },
    draftsBtn: { width: "100%", padding: "10px 0", borderRadius: 9, border: `1px solid ${themeG.border}`, background: "transparent", color: themeG.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, marginTop: 8 },
  };

  if (loading) {
    return (
      <CustomerLayout>
        <div style={{ padding: 40, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>Loading…</div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {/* Belt-and-braces against the page ever overflowing the viewport
          horizontally (which is what was clipping the Cart Summary
          sidebar off the right edge) — the grid fix above is the real
          fix, this just guarantees nothing else can do the same thing. */}
      <div style={{ maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box" }}>

      <div style={S.infoCard}>
        <p style={S.infoTitle}>👤 Customer Information</p>
        <div style={S.infoGrid}>
          <div><p style={S.infoLabel}>Customer Name</p><p style={S.infoValue}>{customer?.Name || user.name || "—"}</p></div>
          <div><p style={S.infoLabel}>Customer Code</p><p style={S.infoValue}>{customer?.Code || "—"}</p></div>
          <div><p style={S.infoLabel}>Mobile Number</p><p style={S.infoValue}>{customer?.Phone || "—"}</p></div>
          <div><p style={S.infoLabel}>Area / Region</p><p style={S.infoValue}>{customer?.Taluk ? `${customer.Taluk} — ${customer.District || ""}` : "—"}</p></div>
          <div><p style={S.infoLabel}>Contact Person</p><p style={S.infoValue}>{customer?.ContactPersons?.[0]?.contactName || "—"}</p></div>
          <div><p style={S.infoLabel}>Date</p><p style={S.infoValue}>{formatDate(new Date())}</p></div>
        </div>
      </div>

      {error && <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>{error}</div>}
      {notice && <div style={{ marginBottom: 16, background: "rgba(15,33,56,0.08)", border: "1px solid rgba(15,33,56,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: themeG.accent }}>{notice}</div>}

      {typeKeys.length > 0 && (
        <div style={S.tabRow}>
          {typeKeys.map((t, i) => (
            <button key={t} onClick={() => setActiveType(t)} style={S.tab(activeType === t, TAB_COLORS[i % TAB_COLORS.length])}>
              <span>{TAB_ICONS[t.toLowerCase()] || "🧷"}</span> {t}
            </button>
          ))}
        </div>
      )}

      {subTypesForActiveType.length > 1 && (
        <div style={S.subTabRow}>
          {subTypesForActiveType.map((s) => (
            <button key={s} onClick={() => setActiveSubType(s)} style={S.subTab(activeSubType === s)}>{s}</button>
          ))}
        </div>
      )}

      <div style={S.layout}>
        {/* ── Combined search/dropdown + scrollable table ── */}
        <div>
          <div style={S.comboWrap} ref={nameBoxRef}>
            <label style={S.label}>Product Name</label>
            <input
              style={S.comboInput}
              placeholder={`Search or choose a ${activeSubType || activeType} product…`}
              value={nameQuery}
              onFocus={() => setNameMenuOpen(true)}
              onChange={(e) => { setNameQuery(e.target.value); setNameMenuOpen(true); }}
            />
            {nameMenuOpen && (
              <div style={S.comboMenu}>
                {suggestionNames.length === 0 ? (
                  <div style={S.comboEmpty}>No product name matches "{nameQuery}".</div>
                ) : (
                  suggestionNames.map((n) => (
                    <div
                      key={n}
                      style={S.comboItem}
                      onMouseDown={() => { setNameQuery(n); setNameMenuOpen(false); }}
                    >
                      {n}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── Secondary filters: Sort No / Description search + UOM dropdown ── */}
          <div style={S.filterRow}>
            <div style={S.filterCol}>
              <label style={S.filterLabel}>Search Sort No / Description</label>
              <input
                style={S.filterInput}
                placeholder="e.g. 1481 or “colourfast dyeing”…"
                value={secondaryQuery}
                onChange={(e) => setSecondaryQuery(e.target.value)}
              />
            </div>
            <div style={S.filterColNarrow}>
              <label style={S.filterLabel}>UOM</label>
              <select style={S.filterSelect} value={uomFilter} onChange={(e) => setUomFilter(e.target.value)}>
                {UOM_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={S.tableCard}>
            {tableProducts.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>
                {activeSubType ? `No ${activeSubType} products match the current filters.` : "No products available."}
              </div>
            ) : (
              <div style={S.tableScroll}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Sort No</th>
                      <th style={S.th}>Shade No</th>
                      <th style={S.th}>Product Description</th>
                      <th style={S.th}>Type</th>
                      <th style={S.th}>UOM</th>
                      <th style={S.th}>Quantity</th>
                      <th style={S.th}>Colour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableProducts.map((p, i) => {
                      const qty = getRowQty(p.Id);
                      const swatch = p.Color || DUMMY_SWATCHES[i % DUMMY_SWATCHES.length];
                      const already = inCartQty(p.Id);
                      return (
                        <tr key={p.Id}>
                          <td style={S.td}>{p.Code || "—"}</td>
                          <td style={S.td}><span style={S.shadeNo}>{dummyShadeNo(p, i)}</span></td>
                          <td style={S.tdWrap}>{dummyDescription(p, i)}</td>
                          <td style={S.td}>{dummyType(p, i)}</td>
                          <td style={S.td}>{dummyUom(p.SubType)}</td>
                          <td style={S.td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={S.qtyBox}>
                                <button style={S.qtyBtn} onClick={() => setRowQtyFor(p, qty - 1)}>−</button>
                                <input
                                  style={S.qtyInput}
                                  type="number"
                                  min={0}
                                  max={p.Quantity ?? undefined}
                                  value={qty}
                                  onChange={(e) => setRowQtyFor(p, parseInt(e.target.value, 10) || 0)}
                                />
                                <button style={S.qtyBtn} onClick={() => setRowQtyFor(p, qty + 1)}>+</button>
                              </div>
                              <button
                                style={justAddedId === p.Id ? S.addedBtn : S.addBtn}
                                onClick={() => addRowToCart(p)}
                              >
                                {justAddedId === p.Id ? "✓ Added" : "+ Add"}
                              </button>
                            </div>
                            {already > 0 && <p style={S.inCartNote}>Already in cart: {already}</p>}
                          </td>
                          <td style={S.td}><div style={S.swatch(swatch)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Cart Summary ── */}
        <div style={S.sidebar}>
          <div style={S.sidebarTitleRow}>
            <p style={S.sidebarTitle}>🛒 Cart Summary</p>
            <button style={S.clearCartLink} onClick={handleClearCart} disabled={cart.length === 0}>
              🗑 Clear Cart
            </button>
          </div>

          <p style={S.statLabel}>Selected Products</p>
          <p style={S.statValue}>{cartCount}</p>

          <p style={{ ...S.statLabel, marginTop: 10 }}>Total Quantity</p>
          <p style={S.statValue}>{cartQty}</p>

          <div style={S.divider} />

          <p style={{ ...S.statLabel, marginBottom: 8 }}>Selected Items</p>
          {cart.length === 0 ? (
            <p style={S.emptyNote}>No items selected</p>
          ) : (
            cart.map((i) => (
              <div key={i.key} style={S.lineItem}>
                <span>{i.product.Name} <span style={S.lineItemSub}>({i.product.Code})</span></span>
                <span>{i.qty}</span>
              </div>
            ))
          )}

          <button style={S.viewCartBtn} onClick={() => navigate("/customer/enquiry")}>View Cart & Submit →</button>
          <button style={S.draftsBtn} onClick={() => navigate("/customer/drafts")}>📑 My Drafts</button>
        </div>
      </div>
      </div>
    </CustomerLayout>
  );
}