// src/pages/end-user/CartCheckout.jsx
//
// Field Officer's "View Cart & Submit" page — the end-user counterpart
// of the customer's /customer/enquiry cart page. Lives at its own route,
// /end-user/order-cart.
//
// Cart table columns match ProductCatalog parity (Sort No | Shade No |
// Product Description | Type | UOM | Colour | Quantity | Actions).
// Quantity is read-only until the row's Edit is pressed; Remove deletes
// the line. Total sits under the Quantity column on the right.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import EndUserLayout from "../../components/EndUserLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";
import { getCart, updateCartQty, removeFromCart, clearCart, subscribeToCart } from "../../utils/endUserCart";
import { saveDraft, updateDraft, deleteDraft, getDraft } from "../../utils/endUserDrafts";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const DUMMY_SWATCHES = ["#8FD9A8", "#7FD1E0", "#E893C9", "#9A9AA5", "#F0A15C", "#B7A6E0"];
const DUMMY_TYPES = ["BLD & DYED", "Bld/Dyed", "R.Blue/G.Blue", "Fiber Dyed", "YD Dyed", "YD Slub", "3.7 & 7.4", "8*137 (Box)", "Spl Maroon"];
const DUMMY_SHADE_NOS = ["101", "102", "103", "104", "105", "106"];

function dummyUom(subType) {
  const u = (subType || "").toLowerCase();
  if (u.includes("shirting") || u.includes("suiting") || u.includes("blouse")) return "m";
  return "pcs";
}

function dummyType(product, i) {
  return product.Type || DUMMY_TYPES[i % DUMMY_TYPES.length];
}

function dummyShadeNo(product, i) {
  const num = product.ShadeNo || DUMMY_SHADE_NOS[i % DUMMY_SHADE_NOS.length];
  return `SHADE ${num}`;
}

function dummyDescription(product, i) {
  return `SHADING FABRIC ${dummyShadeNo(product, i)}`;
}

function formatDate(d) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
}

export default function CartCheckout() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const customerId = params.get("customerId") || "";
  const draftId = params.get("draftId") || "";
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cart, setCart] = useState([]);

  const [requestedDate, setRequestedDate] = useState("");
  const [refNo, setRefNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Which cart line key is currently in "edit qty" mode (null = none)
  const [editingKey, setEditingKey] = useState(null);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "end_user") { navigate("/login"); return; }
    if (!customerId) { navigate("/end-user/product-selection"); return; }
    (async () => {
      try {
        const custRes = await API.get("/customers");
        const found = custRes.data.find((c) => String(c.Id) === String(customerId)) || null;
        setCustomer(found);
      } catch {
        setError("Failed to load customer details.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, [customerId]);

  useEffect(() => {
    setCart(getCart(customerId));
    const unsub = subscribeToCart(() => setCart(getCart(customerId)));
    return unsub;
  }, [customerId]);

  useEffect(() => {
    if (!draftId) return;
    const d = getDraft(draftId);
    if (!d) return;
    if (d.requestedDate) setRequestedDate(d.requestedDate);
    if (d.refNo) setRefNo(d.refNo);
    if (d.remarks) setRemarks(d.remarks);
  }, [draftId]);

  const totalQty = cart.reduce((sum, l) => sum + l.qty, 0);

  const setQty = (line, qty) => {
    const clamped = Math.max(0, Math.min(qty, line.product.Quantity ?? qty));
    if (clamped <= 0) {
      removeFromCart(customerId, line.key);
      setEditingKey(null);
    } else {
      updateCartQty(customerId, line.key, clamped);
    }
  };

  const buildNotes = () => {
    const parts = [];
    if (refNo.trim()) parts.push(`Ref/PO: ${refNo.trim()}`);
    if (remarks.trim()) parts.push(remarks.trim());
    return parts.join(" — ") || null;
  };

  const handleSaveDraft = () => {
    if (cart.length === 0) { setError("Your cart is empty — nothing to save as a draft."); return; }
    setError("");
    setSavingDraft(true);
    try {
      if (draftId && getDraft(draftId)) {
        updateDraft(draftId, {
          items: cart,
          requestedDate,
          refNo,
          remarks,
        });
      } else {
        saveDraft({
          customerId,
          customerName: customer?.Name,
          customerCode: customer?.Code,
          items: cart,
          requestedDate,
          refNo,
          remarks,
        });
      }
      setNotice("Saved as a draft. Find it any time under My Drafts.");
    } finally {
      setSavingDraft(false);
    }
  };

  const submitEnquiry = async () => {
    if (cart.length === 0) { setError("Your cart is empty."); return; }
    if (!requestedDate) { setError("Please pick a Requested Date."); return; }
    setSubmitting(true);
    setError("");
    try {
      const notes = buildNotes();
      await Promise.all(cart.map((l) => API.post("/orders", {
        customerId,
        productId: l.product.Id,
        qty: l.qty,
        pricePerUnit: l.product.Price,
        discount: 0,
        deliveryDate: requestedDate,
        notes,
      })));
      clearCart(customerId);
      if (draftId) deleteDraft(draftId);
      navigate("/master/orders", {
        state: { notice: `${cart.length} item(s) submitted as an enquiry for ${customer?.Name || "the customer"}.` },
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit enquiry.");
    } finally {
      setSubmitting(false);
    }
  };

  const S = {
    infoCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "18px 22px", marginBottom: 20, boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    infoTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: "0 0 16px" },
    infoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 },
    infoLabel: { fontSize: 10.5, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" },
    infoValue: { fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: 0 },

    tableCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)", marginBottom: 20 },
    tableScroll: { overflowX: "auto" },
    table: { width: "100%", minWidth: 960, borderCollapse: "collapse" },
    th: { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: themeG.textLabel, background: themeG.bg, borderBottom: `1px solid ${themeG.border}`, whiteSpace: "nowrap" },
    td: { padding: "12px 16px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}`, whiteSpace: "nowrap" },
    tdWrap: { padding: "12px 16px", fontSize: 13, color: themeG.textSub, borderBottom: `1px solid ${themeG.border}`, whiteSpace: "normal", maxWidth: 220 },
    swatch: (c) => ({ width: 20, height: 20, borderRadius: "50%", background: c, border: "1.5px solid rgba(0,0,0,0.14)", display: "inline-block", verticalAlign: "middle" }),
    shadeNo: { fontSize: 13, fontWeight: 600, color: themeG.textMain },

    qtyBox: { display: "flex", alignItems: "center", gap: 8 },
    qtyBtn: { width: 26, height: 26, borderRadius: 7, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    qtyInput: { width: 56, textAlign: "center", padding: "5px 4px", borderRadius: 7, border: `1px solid ${themeG.border}`, fontSize: 13, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none" },
    qtyReadOnly: { fontSize: 14, fontWeight: 700, color: themeG.textMain, minWidth: 28, textAlign: "center" },

    actionsCell: { display: "flex", alignItems: "center", gap: 12 },
    editBtn: { border: "none", background: "transparent", color: themeG.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, padding: 0 },
    doneBtn: { border: "none", background: "transparent", color: "#16A34A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, padding: 0 },
    removeBtn: { border: "none", background: "transparent", color: "#B23A3A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, padding: 0 },

    detailsCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    detailsTitle: { fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: "0 0 16px" },
    detailsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 16 },
    label: { fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" },
    input: { width: "100%", boxSizing: "border-box", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, color: themeG.textMain, background: themeG.bg, outline: "none" },
    textarea: { width: "100%", boxSizing: "border-box", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, color: themeG.textMain, background: themeG.bg, outline: "none", resize: "vertical", minHeight: 40 },
    charCount: { fontSize: 10.5, color: themeG.textSub, textAlign: "right", marginTop: 3 },

    bottomRow: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 },
    backBtn: { padding: "10px 20px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: "transparent", color: themeG.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
    actionsRight: { display: "flex", gap: 10 },
    draftBtn: { padding: "10px 22px", borderRadius: 9, border: `1.5px solid ${themeG.accent}`, background: "rgba(91,155,217,0.08)", color: themeG.accent, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
    finalSubmitBtn: { padding: "10px 26px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  };

  if (loading) {
    return (
      <EndUserLayout>
        <div style={{ padding: 40, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>Loading…</div>
      </EndUserLayout>
    );
  }

  return (
    <EndUserLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 16, background: "rgba(15,33,56,0.08)", border: "1px solid rgba(15,33,56,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: themeG.accent }}>
          {notice}
        </div>
      )}

      <div style={S.infoCard}>
        <p style={S.infoTitle}>👤 Customer Information</p>
        <div style={S.infoGrid}>
          <div><p style={S.infoLabel}>Customer Name</p><p style={S.infoValue}>{customer?.Name || "—"}</p></div>
          <div><p style={S.infoLabel}>Customer Code</p><p style={S.infoValue}>{customer?.Code || "—"}</p></div>
          <div><p style={S.infoLabel}>Area / Region</p><p style={S.infoValue}>{customer?.Taluk ? `${customer.Taluk} — ${customer.District || ""}` : "—"}</p></div>
          <div><p style={S.infoLabel}>Sales Officer Name</p><p style={S.infoValue}>{user.name || "—"}</p></div>
          <div><p style={S.infoLabel}>Date</p><p style={S.infoValue}>{formatDate(new Date())}</p></div>
        </div>
      </div>

      <div style={S.tableCard}>
        {cart.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: themeG.textSub, fontSize: 13 }}>
            Your cart is empty. Go back to the catalog to add products.
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
                  <th style={S.th}>Colour</th>
                  <th style={S.th}>Quantity</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l, i) => {
                  const p = l.product;
                  const swatch = p.Color || DUMMY_SWATCHES[i % DUMMY_SWATCHES.length];
                  const isEditing = editingKey === l.key;
                  return (
                    <tr key={l.key}>
                      <td style={S.td}>{p.Code || "—"}</td>
                      <td style={S.td}><span style={S.shadeNo}>{dummyShadeNo(p, i)}</span></td>
                      <td style={S.tdWrap}>{dummyDescription(p, i)}</td>
                      <td style={S.td}>{dummyType(p, i)}</td>
                      <td style={S.td}>{dummyUom(p.SubType)}</td>
                      <td style={S.td}><div style={S.swatch(swatch)} /></td>
                      <td style={S.td}>
                        {isEditing ? (
                          <div style={S.qtyBox}>
                            <button style={S.qtyBtn} onClick={() => setQty(l, l.qty - 1)}>−</button>
                            <input
                              style={S.qtyInput}
                              type="number"
                              min={0}
                              max={p.Quantity ?? undefined}
                              value={l.qty}
                              onChange={(e) => setQty(l, parseInt(e.target.value, 10) || 0)}
                            />
                            <button
                              style={S.qtyBtn}
                              onClick={() => setQty(l, l.qty + 1)}
                              disabled={p.Quantity != null && l.qty >= p.Quantity}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <span style={S.qtyReadOnly}>{l.qty}</span>
                        )}
                      </td>
                      <td style={S.td}>
                        <div style={S.actionsCell}>
                          {isEditing ? (
                            <button style={S.doneBtn} onClick={() => setEditingKey(null)}>
                              Done
                            </button>
                          ) : (
                            <button style={S.editBtn} onClick={() => setEditingKey(l.key)}>
                              Edit
                            </button>
                          )}
                          <button
                            style={S.removeBtn}
                            onClick={() => {
                              removeFromCart(customerId, l.key);
                              if (editingKey === l.key) setEditingKey(null);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      ...S.td,
                      borderBottom: "none",
                      textAlign: "right",
                      fontWeight: 700,
                      color: themeG.textSub,
                      
                    }}
                  >
                    Total quantity
                  </td>
                  <td
                    style={{
                      ...S.td,
                      borderBottom: "none",
                      fontWeight: 700,
                      fontSize: 15,
                      color: "green",
                    }}
                  >
                    {totalQty.toLocaleString()}
                  </td>
                  <td style={{ ...S.td, borderBottom: "none" }} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={S.detailsCard}>
        <p style={S.detailsTitle}>Additional Details</p>
        <div style={S.detailsGrid}>
          <div>
            <label style={S.label}>Requested Date *</label>
            <input type="date" style={S.input} value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Reference / PO No.</label>
            <input style={S.input} placeholder="Enter Reference / PO No." value={refNo} onChange={(e) => setRefNo(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Remarks</label>
            <textarea
              style={S.textarea}
              placeholder="Enter any additional remarks (if any)"
              maxLength={500}
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <p style={S.charCount}>{remarks.length} / 500</p>
          </div>
        </div>
      </div>

      <div style={S.bottomRow}>
        <button style={S.backBtn} onClick={() => navigate(`/end-user/product-selection?customerId=${customerId}`)}>
          ← Back to Catalog
        </button>
        <div style={S.actionsRight}>
          <button style={S.draftBtn} disabled={savingDraft || cart.length === 0} onClick={handleSaveDraft}>
            {savingDraft ? "Saving…" : "💾 Save as Draft"}
          </button>
          <button style={S.finalSubmitBtn} disabled={submitting || cart.length === 0} onClick={submitEnquiry}>
            📨 Submit Enquiry
          </button>
        </div>
      </div>
    </EndUserLayout>
  );
}