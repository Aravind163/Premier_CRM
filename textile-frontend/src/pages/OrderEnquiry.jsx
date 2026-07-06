// src/pages/OrderEnquiry.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/CustomerLayout";
import { useTheme } from "../ThemeContext";
import { getG } from "../theme";
import API from "../services/api";
import { getCart, updateCartQty, removeFromCart, clearCart, subscribeToCart } from "../utils/customerCart";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function OrderEnquiry() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const [cart, setCart] = useState(getCart());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "customer") { navigate("/login"); return; }
    return subscribeToCart(() => setCart(getCart()));
    // eslint-disable-next-line
  }, []);

  const cartTotal = cart.reduce((sum, i) => sum + i.qty * parseFloat(i.product.Price || 0), 0);

  const submitEnquiry = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const res = await API.post("/orders/bulk", {
        items: cart.map((i) => ({
          productId: i.product.Id,
          qty: i.qty,
          color: i.color,
          size: i.size,
        })),
      });
      setNotice(res.data.message || "Enquiry submitted. Track it under My Orders.");
      clearCart();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit enquiry.");
    } finally {
      setSubmitting(false);
    }
  };

  const S = {
    heading: { fontFamily: FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 24px" },
    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(45,106,79,0.06)" },
    empty: { padding: 50, textAlign: "center" },
    emptyText: { fontSize: 14, color: themeG.textSub, margin: "0 0 16px" },
    browseBtn: { padding: "10px 22px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: FONT },

    itemRow: { display: "flex", alignItems: "center", gap: 14, padding: "16px 22px", borderBottom: `1px solid ${themeG.border}` },
    itemInfo: { flex: 1, minWidth: 0 },
    itemName: { fontSize: 14.5, fontWeight: 700, color: themeG.textMain, margin: "0 0 3px" },
    itemMeta: { fontSize: 12, color: themeG.textSub, margin: 0 },
    reqPill: { display: "inline-block", fontSize: 11, fontWeight: 600, color: themeG.accent, background: "rgba(45,106,79,0.08)", border: `1px solid ${themeG.border}`, borderRadius: 12, padding: "2px 9px", marginRight: 6, marginTop: 6 },
    qtyBox: { display: "flex", alignItems: "center", gap: 8 },
    qtyBtn: { width: 26, height: 26, borderRadius: 7, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 14, fontWeight: 700, cursor: "pointer" },
    qtyVal: { fontSize: 13.5, fontWeight: 600, color: themeG.textMain, minWidth: 22, textAlign: "center" },
    lineTotal: { fontSize: 14, fontWeight: 700, color: themeG.textMain, minWidth: 90, textAlign: "right" },
    removeBtn: { background: "transparent", border: "none", color: "#a03025", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT },

    footer: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: themeG.bg },
    totalLabel: { fontSize: 13, color: themeG.textSub },
    totalValue: { fontSize: 20, fontWeight: 700, color: themeG.textMain },
    submitBtn: { padding: "12px 28px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  };

  return (
    <CustomerLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 style={S.heading}>Order Enquiry</h1>
      <p style={S.headingSub}>Review the products and requirements you've selected before submitting.</p>

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

      <div style={S.card}>
        {cart.length === 0 ? (
          <div style={S.empty}>
            <p style={S.emptyText}>{notice ? "Your enquiry has been submitted." : "Your enquiry list is empty."}</p>
            <button style={S.browseBtn} onClick={() => navigate("/customer/catalog")}>Browse Product Catalog</button>
          </div>
        ) : (
          <>
            {cart.map((item) => (
              <div key={item.key} style={S.itemRow}>
                <div style={S.itemInfo}>
                  <p style={S.itemName}>{item.product.Name}</p>
                  <p style={S.itemMeta}>₹{parseFloat(item.product.Price || 0).toLocaleString()} each</p>
                  <div>
                    {item.color && <span style={S.reqPill}>Color: {item.color}</span>}
                    {item.size && <span style={S.reqPill}>Size: {item.size}</span>}
                  </div>
                </div>

                <div style={S.qtyBox}>
                  <button style={S.qtyBtn} onClick={() => updateCartQty(item.key, item.qty - 1)}>−</button>
                  <span style={S.qtyVal}>{item.qty}</span>
                  <button style={S.qtyBtn} onClick={() => updateCartQty(item.key, item.qty + 1)}>+</button>
                </div>

                <span style={S.lineTotal}>₹{(item.qty * parseFloat(item.product.Price || 0)).toLocaleString()}</span>

                <button style={S.removeBtn} onClick={() => removeFromCart(item.key)}>Remove</button>
              </div>
            ))}

            <div style={S.footer}>
              <div>
                <p style={S.totalLabel}>Total</p>
                <p style={S.totalValue}>₹{cartTotal.toLocaleString()}</p>
              </div>
              <button style={S.submitBtn} disabled={submitting} onClick={submitEnquiry}>
                {submitting ? "Submitting…" : "Submit Enquiry"}
              </button>
            </div>
          </>
        )}
      </div>

      <p style={{ fontSize: 11, color: themeG.textSub, marginTop: 14, textAlign: "center" }}>
        Prices shown are list price — Marketing may apply discounts when reviewing your enquiry.
      </p>
    </CustomerLayout>
  );
}