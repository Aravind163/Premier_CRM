// src/pages/ProductCatalog.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/CustomerLayout";
import { useTheme } from "../ThemeContext";
import { getG } from "../theme";
import API from "../services/api";
import { addToCart, getCartCount } from "../utils/customerCart";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Friendly icons for known top-level categories — falls back to no icon
// for anything not in this map, so new categories added on the admin
// side don't break the UI.
const CATEGORY_ICON = { cloth: "👘", yarn: "🧵" };

// ─── Size options, scoped per product SubType ──────────────────────
// Mirrors the spec-field option lists already defined for each subtype
// on the admin side (see AddProduct.jsx's CLOTH_SUBTYPES), so a customer
// ordering a Blouse sees clothing sizes while a customer ordering a Dhoti
// sees lengths instead of a size that wouldn't make sense for it.
const SIZE_OPTIONS_BY_SUBTYPE = {
  dhoti:    ["4 Meter", "8 Meter", "Other"],
  blouse:   ["XS", "S", "M", "L", "XL", "XXL"],
  pant:     ["28", "30", "32", "34", "36", "38", "40", "42"],
  shirt:    ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  leggings: ["XS", "S", "M", "L", "XL", "XXL"],
  uniform:  ["XS", "S", "M", "L", "XL", "XXL"],
  bundle:   ["250g", "500g", "1 kg", "2 kg", "5 kg", "Other"],
  hank:     ["100g", "200g", "250g", "500g", "1 kg", "Other"],
  cone:     ["500g", "1 kg", "1.5 kg", "2 kg", "Other"],
};
const DEFAULT_SIZE_OPTIONS = ["S", "M", "L", "XL", "Other"];

const COLOR_SWATCHES = [
  "#FFFFFF", "#000000", "#F5F5F5", "#ECEFF1", "#FFF9C4", "#FFE0B2", "#F3E5F5",
  "#E8F5E9", "#E3F2FD", "#FFCDD2", "#D7CCC8", "#1565C0", "#2E7D32", "#455A64",
  "#37474F", "#BF360C", "#F57F17", "#4A148C", "#880E4F",
];

// Circular swatch picker + native color input for anything custom — same
// pattern as the Product Color field in AddProduct.jsx, so choosing a
// color feels identical for the customer as it does for admin/staff.
function ColorSwatchPicker({ value, onChange, themeG }) {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {COLOR_SWATCHES.map((c) => (
          <div
            key={c}
            onClick={() => onChange(c)}
            style={{
              width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer",
              border:    value === c ? `2.5px solid ${themeG.accent}` : "1.5px solid rgba(0,0,0,0.14)",
              boxShadow: value === c ? "0 0 0 3px rgba(124,179,66,0.30)" : "none",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="color"
          value={value || "#FFFFFF"}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${themeG.border}`, cursor: "pointer", padding: 2 }}
        />
        <span style={{ fontSize: 13, color: themeG.textSub, fontFamily: FONT }}>Custom: {value || "#FFFFFF"}</span>
      </div>
    </div>
  );
}

// Chip selector — highlights the active option; picking "Other" reveals
// a free-text input for anything not in the list. Mirrors the ChipField
// pattern used in AddProduct.jsx so the customer-facing UI feels
// consistent with the admin side.
function ChipField({ options, value, onChange, themeG }) {
  const isOther = value && !options.includes(value);
  const [showCustom, setShowCustom] = useState(isOther);
  const [customVal, setCustomVal] = useState(isOther ? value : "");

  const pick = (opt) => {
    if (opt === "Other") {
      setShowCustom(true);
      onChange(customVal || "");
    } else {
      setShowCustom(false);
      setCustomVal("");
      onChange(opt);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showCustom ? 10 : 0 }}>
        {options.map((opt) => {
          const isActive = opt === "Other" ? showCustom : value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => pick(opt)}
              style={{
                padding: "6px 14px", borderRadius: 18, border: "1.5px solid", cursor: "pointer",
                fontFamily: FONT, fontSize: 12.5, fontWeight: 600, transition: "all 0.12s",
                background:  isActive ? "rgba(45,106,79,0.12)" : themeG.bg,
                color:       isActive ? themeG.accent : themeG.textSub,
                borderColor: isActive ? themeG.accent : themeG.border,
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {showCustom && (
        <input
          placeholder="Enter custom value…"
          value={customVal}
          onChange={(e) => { setCustomVal(e.target.value); onChange(e.target.value); }}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, color: themeG.textMain, background: themeG.bg, outline: "none" }}
        />
      )}
    </div>
  );
}

function RequirementModal({ product, onClose, onConfirm, themeG }) {
  const [color, setColor] = useState("#FFFFFF");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const max = product.Quantity || 1;

  const sizeOptions = SIZE_OPTIONS_BY_SUBTYPE[(product.SubType || "").toLowerCase()] || DEFAULT_SIZE_OPTIONS;

  const M = {
    overlay: { position: "fixed", inset: 0, background: "rgba(20,30,15,0.40)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
    box: { background: themeG.card, borderRadius: 16, padding: 26, width: 380, maxWidth: "90vw", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" },
    title: { fontSize: 17, fontWeight: 700, color: themeG.textMain, margin: "0 0 2px" },
    sub: { fontSize: 12.5, color: themeG.textSub, margin: "0 0 18px" },
    label: { fontSize: 11.5, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px", display: "block" },
    qtyRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20, marginTop: 16 },
    qtyBtn: { width: 30, height: 30, borderRadius: 8, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 16, fontWeight: 700, cursor: "pointer" },
    qtyVal: { fontSize: 15, fontWeight: 700, color: themeG.textMain, minWidth: 30, textAlign: "center" },
    actions: { display: "flex", gap: 10 },
    cancelBtn: { flex: 1, padding: "10px 0", borderRadius: 9, border: `1px solid ${themeG.border}`, background: "transparent", color: themeG.textSub, fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: FONT },
    confirmBtn: { flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: FONT },
  };

  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={M.box} onClick={(e) => e.stopPropagation()}>
        <p style={M.title}>{product.Name}</p>
        <p style={M.sub}>Tell us what you need — color, size, and quantity.</p>

        <label style={M.label}>Color</label>
        <ColorSwatchPicker value={color} onChange={setColor} themeG={themeG} />

        <label style={{ ...M.label, marginTop: 16 }}>Size / Spec</label>
        <ChipField options={sizeOptions} value={size} onChange={setSize} themeG={themeG} />

        <label style={M.label}>Quantity</label>
        <div style={M.qtyRow}>
          <button style={M.qtyBtn} onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
          <span style={M.qtyVal}>{qty}</span>
          <button style={M.qtyBtn} onClick={() => setQty(q => Math.min(max, q + 1))}>+</button>
          <span style={{ fontSize: 11.5, color: themeG.textSub }}>({max} in stock)</span>
        </div>

        <div style={M.actions}>
          <button style={M.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={M.confirmBtn} onClick={() => onConfirm({ color, size, qty })}>Add to Enquiry</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductCatalog() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [subType, setSubType] = useState("all");
  const [activeProduct, setActiveProduct] = useState(null); // product currently in the requirement modal
  const [cartCount, setCartCount] = useState(getCartCount());

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "customer") { navigate("/login"); return; }
    (async () => {
      try {
        const res = await API.get("/products", { params: { status: "active" } });
        setProducts(res.data);
      } catch {
        setError("Failed to load products. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(products.map(p => p.Category).filter(Boolean)))],
    [products]
  );

  const subTypes = useMemo(() => {
    const pool = category === "all" ? products : products.filter(p => p.Category === category);
    return ["all", ...Array.from(new Set(pool.map(p => p.SubType).filter(Boolean)))];
  }, [products, category]);

  const visibleProducts = products.filter((p) => {
    if (category !== "all" && p.Category !== category) return false;
    if (subType !== "all" && p.SubType !== subType) return false;
    return true;
  });

  const handleCategoryChange = (c) => {
    setCategory(c);
    setSubType("all");
  };

  const handleConfirmRequirement = ({ color, size, qty }) => {
    addToCart({ product: activeProduct, qty, color, size });
    setActiveProduct(null);
    navigate("/customer/enquiry");
  };

  const S = {
    topRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 },
    heading: { fontFamily: FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: 0 },
    cartBtn: { display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 20, border: `1.5px solid ${themeG.accent}`, background: "transparent", color: themeG.accent, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
    cartBadgeInline: { background: themeG.accent, color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 },

    filterGroup: { marginBottom: 14 },
    filterLabel: { fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" },
    filterRow: { display: "flex", gap: 8, flexWrap: "wrap" },
    filterBtn: (active) => ({ padding: "7px 16px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600, textTransform: "capitalize", background: active ? themeG.accent : themeG.card, color: active ? "#fff" : themeG.textSub, borderColor: active ? themeG.accent : themeG.border, display: "flex", alignItems: "center", gap: 6 }),
    subFilterBtn: (active) => ({ padding: "6px 14px", borderRadius: 16, border: "1.5px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 600, textTransform: "capitalize", background: active ? "rgba(45,106,79,0.10)" : "transparent", color: active ? themeG.accent : themeG.textSub, borderColor: active ? themeG.accent : themeG.border }),

    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(45,106,79,0.06)", marginTop: 18 },
    productGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, padding: 20 },
    productCard: { border: `1px solid ${themeG.border}`, borderRadius: 12, padding: 16, background: themeG.bg },
    productName: { fontSize: 14.5, fontWeight: 700, color: themeG.textMain, margin: "0 0 4px" },
    productMeta: { fontSize: 12, color: themeG.textSub, margin: "0 0 10px" },
    stockRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    stockQty: (qty) => ({ fontSize: 13, fontWeight: 700, color: qty > 0 ? "#2d6a4f" : "#a03025" }),
    price: { fontSize: 13, fontWeight: 600, color: themeG.textMain },
    addBtn: { width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 8, border: "none", background: themeG.accent, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
    addBtnDisabled: { width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 8, border: `1px solid ${themeG.border}`, background: "transparent", color: themeG.textSub, fontSize: 12.5, fontWeight: 600, cursor: "not-allowed", fontFamily: FONT },
  };

  return (
    <CustomerLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={S.topRow}>
        <div>
          <h1 style={S.heading}>Product Catalog</h1>
          <p style={S.headingSub}>Welcome back, {user.name || "Customer"} — pick a product and tell us your requirement.</p>
        </div>
        <button style={S.cartBtn} onClick={() => navigate("/customer/enquiry")}>
          🛒 Enquiry {cartCount > 0 && <span style={S.cartBadgeInline}>{cartCount}</span>}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 20, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
          {error}
        </div>
      )}

      {/* Category filter */}
      <div style={S.filterGroup}>
        <p style={S.filterLabel}>Category</p>
        <div style={S.filterRow}>
          {categories.map((c) => (
            <button key={c} onClick={() => handleCategoryChange(c)} style={S.filterBtn(category === c)}>
              {c !== "all" && CATEGORY_ICON[c.toLowerCase()] ? CATEGORY_ICON[c.toLowerCase()] : null}
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* SubType filter — scoped to whichever category is active above */}
      {subTypes.length > 1 && (
        <div style={S.filterGroup}>
          <p style={S.filterLabel}>Type</p>
          <div style={S.filterRow}>
            {subTypes.map((s) => (
              <button key={s} onClick={() => setSubType(s)} style={S.subFilterBtn(subType === s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>Loading catalog…</div>
        ) : visibleProducts.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>No products found for this filter.</div>
        ) : (
          <div style={S.productGrid}>
            {visibleProducts.map((p) => (
              <div key={p.Id} style={S.productCard}>
                <p style={S.productName}>{p.Name}</p>
                <p style={S.productMeta}>{p.Category}{p.SubType ? ` · ${p.SubType}` : ""}</p>
                <div style={S.stockRow}>
                  <span style={S.stockQty(p.Quantity)}>
                    {p.Quantity > 0 ? `${p.Quantity} in stock` : "Out of stock"}
                  </span>
                  <span style={S.price}>₹{parseFloat(p.Price || 0).toLocaleString()}</span>
                </div>
                {p.Quantity > 0 ? (
                  <button style={S.addBtn} onClick={() => setActiveProduct(p)}>
                    Add Requirement
                  </button>
                ) : (
                  <button style={S.addBtnDisabled} disabled>Out of Stock</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeProduct && (
        <RequirementModal
          product={activeProduct}
          themeG={themeG}
          onClose={() => setActiveProduct(null)}
          onConfirm={handleConfirmRequirement}
        />
      )}
    </CustomerLayout>
  );
}