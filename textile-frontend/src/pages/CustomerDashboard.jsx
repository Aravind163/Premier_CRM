import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../ThemeContext";
import { getG, statusColor } from "../theme";
import API from "../services/api";
import logo from '/premier-icon.png';

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {(text || "—").charAt(0).toUpperCase() + (text || "—").slice(1)}
    </span>
  );
};

export default function CustomerDashboard() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState("all");

  // Cart: { [productId]: { product, qty } }
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadOrders = async () => {
    try {
      const res = await API.get("/orders");
      setOrders(res.data);
    } catch {
      setError("Failed to load your orders.");
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "customer") { navigate("/login"); return; }
    (async () => {
      try {
        const [prodRes] = await Promise.all([
          API.get("/products", { params: { status: "active" } }),
          loadOrders(),
        ]);
        setProducts(prodRes.data);
      } catch {
        setError("Failed to load your dashboard. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const addToCart = (product) => {
    if (!product.Quantity || product.Quantity <= 0) return;
    setCart((prev) => {
      const existingQty = prev[product.Id]?.qty || 0;
      const nextQty = Math.min(existingQty + 1, product.Quantity);
      return { ...prev, [product.Id]: { product, qty: nextQty } };
    });
    setCartOpen(true);
  };

  const setCartQty = (productId, qty) => {
    setCart((prev) => {
      const item = prev[productId];
      if (!item) return prev;
      const clamped = Math.max(1, Math.min(qty, item.product.Quantity || qty));
      return { ...prev, [productId]: { ...item, qty: clamped } };
    });
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const cartItems = Object.values(cart);
  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);
  const cartTotal = cartItems.reduce((sum, i) => sum + i.qty * parseFloat(i.product.Price || 0), 0);

  const submitEnquiry = async () => {
    if (cartItems.length === 0) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const res = await API.post("/orders/bulk", {
        items: cartItems.map((i) => ({ productId: i.product.Id, qty: i.qty })),
      });
      setNotice(res.data.message || "Enquiry submitted.");
      setCart({});
      setCartOpen(false);
      loadOrders();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit enquiry.");
    } finally {
      setSubmitting(false);
    }
  };

  const categories = ["all", ...Array.from(new Set(products.map(p => p.Category).filter(Boolean)))];
  const visibleProducts = category === "all" ? products : products.filter(p => p.Category === category);

  const S = {
    page: { minHeight: "100vh", background: themeG.bg, fontFamily: FONT },
    topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", background: themeG.sidebar, color: "#fff" },
    topBarLeft: { display: "flex", alignItems: "center", gap: 10 },
    logo: { width: 32, height: 32, objectFit: "contain" },
    brand: { fontSize: 16, fontWeight: 700 },
    shopName: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
    logoutBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
    main: { padding: "28px", maxWidth: 1100, margin: "0 auto" },
    sectionHeader: { fontSize: 19, fontWeight: 700, color: themeG.textMain, margin: "0 0 4px" },
    sectionSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 18px" },
    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(45,106,79,0.06)", marginBottom: 34 },
    filterRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
    filterBtn: (active) => ({ padding: "7px 16px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600, textTransform: "capitalize", background: active ? themeG.accent : themeG.card, color: active ? "#fff" : themeG.textSub, borderColor: active ? themeG.accent : themeG.border }),
    productGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, padding: 20 },
    productCard: { border: `1px solid ${themeG.border}`, borderRadius: 12, padding: 16, background: themeG.bg },
    productName: { fontSize: 14.5, fontWeight: 700, color: themeG.textMain, margin: "0 0 4px" },
    productMeta: { fontSize: 12, color: themeG.textSub, margin: "0 0 10px" },
    stockRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    stockQty: (qty) => ({ fontSize: 13, fontWeight: 700, color: qty > 0 ? "#2d6a4f" : "#a03025" }),
    price: { fontSize: 13, fontWeight: 600, color: themeG.textMain },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 16px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(45,106,79,0.04)" },
    td: { padding: "13px 16px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    addBtn: { width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 8, border: "none", background: themeG.accent, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
    addBtnDisabled: { width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 8, border: `1px solid ${themeG.border}`, background: "transparent", color: themeG.textSub, fontSize: 12.5, fontWeight: 600, cursor: "not-allowed", fontFamily: FONT },
    cartFab: { position: "fixed", bottom: 26, right: 26, background: themeG.accent, color: "#fff", border: "none", borderRadius: 30, padding: "13px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 20px rgba(45,106,79,0.35)", display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, zIndex: 50 },
    cartBadge: { background: "#fff", color: themeG.accent, borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 },
    overlay: { position: "fixed", inset: 0, background: "rgba(20,30,15,0.35)", display: "flex", alignItems: "center", justifyContent: "flex-end", zIndex: 100 },
    drawer: { background: themeG.card, width: 380, maxWidth: "92vw", height: "100%", padding: 24, overflowY: "auto", boxShadow: "-8px 0 30px rgba(0,0,0,0.15)" },
    drawerHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
    drawerTitle: { fontSize: 17, fontWeight: 700, color: themeG.textMain, margin: 0 },
    closeBtn: { background: "transparent", border: "none", fontSize: 20, color: themeG.textSub, cursor: "pointer", lineHeight: 1 },
    cartItem: { display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: `1px solid ${themeG.border}` },
    cartItemName: { fontSize: 13.5, fontWeight: 600, color: themeG.textMain, margin: "0 0 3px" },
    cartItemMeta: { fontSize: 11.5, color: themeG.textSub },
    qtyBox: { display: "flex", alignItems: "center", gap: 6 },
    qtyBtn: { width: 24, height: 24, borderRadius: 6, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    qtyVal: { fontSize: 13, fontWeight: 600, color: themeG.textMain, minWidth: 20, textAlign: "center" },
    removeBtn: { background: "transparent", border: "none", color: "#a03025", fontSize: 12, cursor: "pointer", fontFamily: FONT },
    cartTotal: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", fontSize: 14.5, fontWeight: 700, color: themeG.textMain },
    submitBtn: { width: "100%", padding: "12px 0", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  };

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={S.topBar}>
        <div style={S.topBarLeft}>
          <img src={logo} alt="Premier Mills" style={S.logo} />
          <div>
            <div style={S.brand}>{user.name || "Customer"}</div>
            <div style={S.shopName}>Premier CRM</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setCartOpen(true)} style={{ ...S.logoutBtn, display: "flex", alignItems: "center", gap: 6 }}>
            🛒 Cart {cartCount > 0 && <span style={S.cartBadge}>{cartCount}</span>}
          </button>
          <button onClick={handleLogout} style={S.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={S.main}>
        {error && (
          <div style={{ marginBottom: 20, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
            {error}
          </div>
        )}

        {notice && (
          <div style={{ marginBottom: 20, background: "rgba(45,106,79,0.08)", border: "1px solid rgba(45,106,79,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: themeG.accent }}>
            {notice}
          </div>
        )}

        {/* ── Stock availability ── */}
        <h2 style={S.sectionHeader}>Stock Availability</h2>
        <p style={S.sectionSub}>How much of each product is currently in stock.</p>

        <div style={S.filterRow}>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} style={S.filterBtn(category === c)}>{c}</button>
          ))}
        </div>

        <div style={S.card}>
          {loading ? (
            <div style={{ padding: 30, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>Loading stock…</div>
          ) : visibleProducts.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>No products found.</div>
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
                    <button style={S.addBtn} onClick={() => addToCart(p)}>
                      {cart[p.Id] ? `In Cart (${cart[p.Id].qty})` : "Add to Cart"}
                    </button>
                  ) : (
                    <button style={S.addBtnDisabled} disabled>Out of Stock</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── My orders / delivery status ── */}
        <h2 style={S.sectionHeader}>My Orders</h2>
        <p style={S.sectionSub}>Track the delivery status of your own orders.</p>

        <div style={S.card}>
          <table style={S.table}>
            <thead>
              <tr>
                {["Order", "Product", "Qty", "Amount", "Delivery Date", "Status", "Tracking"].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...S.td, textAlign: "center", padding: 30 }}>Loading orders…</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} style={{ ...S.td, textAlign: "center", padding: 30 }}>You have no orders yet.</td></tr>
              ) : orders.map((o) => (
                <tr key={o.Id}>
                  <td style={{ ...S.td, fontWeight: 600, color: themeG.accent }}>{o.Code}</td>
                  <td style={S.td}>{o.product?.Name || "—"}</td>
                  <td style={S.td}>{o.Quantity}</td>
                  <td style={S.td}>₹{parseFloat(o.TotalAmount || 0).toLocaleString()}</td>
                  <td style={S.td}>{o.DeliveryDate ? o.DeliveryDate.substring(0, 10) : "—"}</td>
                  <td style={S.td}><Badge text={o.Status} /></td>
                  <td style={S.td}>
                    {o.LRNumber ? (
                      <div>
                        <div style={{ fontWeight: 600 }}>{o.LRNumber}</div>
                        <div style={{ fontSize: 11.5, color: themeG.textSub }}>{o.TransportName}</div>
                      </div>
                    ) : (
                      <span style={{ color: themeG.textSub, fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating cart button — shown whenever cart has items and drawer is closed */}
      {cartCount > 0 && !cartOpen && (
        <button style={S.cartFab} onClick={() => setCartOpen(true)}>
          🛒 View Cart <span style={S.cartBadge}>{cartCount}</span>
        </button>
      )}

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <div style={S.overlay} onClick={() => setCartOpen(false)}>
          <div style={S.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={S.drawerHeader}>
              <h3 style={S.drawerTitle}>Your Cart</h3>
              <button style={S.closeBtn} onClick={() => setCartOpen(false)}>×</button>
            </div>

            {cartItems.length === 0 ? (
              <p style={{ fontSize: 13, color: themeG.textSub }}>Your cart is empty. Add products to submit an enquiry.</p>
            ) : (
              <>
                {cartItems.map((item) => (
                  <div key={item.product.Id} style={S.cartItem}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={S.cartItemName}>{item.product.Name}</p>
                      <p style={S.cartItemMeta}>₹{parseFloat(item.product.Price || 0).toLocaleString()} each</p>
                    </div>
                    <div style={S.qtyBox}>
                      <button style={S.qtyBtn} onClick={() => setCartQty(item.product.Id, item.qty - 1)}>−</button>
                      <span style={S.qtyVal}>{item.qty}</span>
                      <button style={S.qtyBtn} onClick={() => setCartQty(item.product.Id, item.qty + 1)}>+</button>
                    </div>
                    <button style={S.removeBtn} onClick={() => removeFromCart(item.product.Id)}>Remove</button>
                  </div>
                ))}

                <div style={S.cartTotal}>
                  <span>Total</span>
                  <span>₹{cartTotal.toLocaleString()}</span>
                </div>

                <button style={S.submitBtn} disabled={submitting} onClick={submitEnquiry}>
                  {submitting ? "Submitting…" : "Submit Enquiry"}
                </button>
                <p style={{ fontSize: 11, color: themeG.textSub, marginTop: 10, textAlign: "center" }}>
                  Prices shown are list price — Marketing may apply discounts when reviewing your enquiry.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
