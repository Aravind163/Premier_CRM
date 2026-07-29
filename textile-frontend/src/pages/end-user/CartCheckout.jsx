// src/pages/end-user/CartCheckout.jsx
//
// Field Officer's "View Cart & Submit" page — the end-user counterpart
// of the customer's /customer/enquiry cart page. Lives at its own route,
// /end-user/order-cart, deliberately NOT called "OrderEnquiry" or put at
// /end-user/enquiry — that name/route is already taken by the shared
// Assign -> Approve -> Reject pipeline queue at src/pages/master/
// OrderEnquiry.jsx (rendered for end_user too, at /master/enquiry). This
// page is a different thing entirely: a shopping-cart review + submit
// step, not a claims/approval worklist.
//
// ProductSelection.jsx never submits anything itself; it only builds up
// the persistent, per-customer cart (utils/endUserCart.js) and sends the
// officer here to review qty, add Requested Date / Ref No / Remarks, and
// either submit the enquiry or save everything as a draft to come back
// to later (utils/endUserDrafts.js — see the Drafts page). On successful
// submit this navigates to /master/orders (the existing, already-role-
// scoped Order List/Status page) rather than a page of its own, since
// that page already exists and already filters to this officer's own
// orders (scope=own) for the end_user role.
//
// Submission logic (one POST /orders per cart line, since there's no
// staff-side bulk endpoint — see OrderController::storeBulk note) is
// unchanged from before.
//
// If this page was reached by resuming a saved draft (?draftId=...,
// set by the Drafts page), "Save as Draft" updates that same draft in
// place instead of creating a new one, and submitting deletes it.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import EndUserLayout from "../../components/EndUserLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";
import { getCart, updateCartQty, removeFromCart, clearCart, subscribeToCart } from "../../utils/endUserCart";
import { saveDraft, updateDraft, deleteDraft, getDraft } from "../../utils/endUserDrafts";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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

  // Pre-fill Requested Date / Ref No / Remarks when this cart was opened
  // by resuming a saved draft — the cart items themselves are already
  // sitting there (Drafts page loads them via replaceCart before it
  // navigates here), this just restores the rest of the form.
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
    if (clamped <= 0) removeFromCart(customerId, line.key);
    else updateCartQty(customerId, line.key, clamped);
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
      // No staff-side "bulk" endpoint exists (that's customer-cart-only,
      // see OrderController::storeBulk) — so each cart line becomes its
      // own POST /orders call, fired together. Every line still lands
      // as a normal 'pending' enquiry through the same Marketing Review
      // -> Final Approval pipeline as anything else.
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
      if (draftId) deleteDraft(draftId); // submitted — no longer a pending draft
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
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: themeG.textLabel, background: themeG.bg, borderBottom: `1px solid ${themeG.border}` },
    td: { padding: "12px 16px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },

    qtyBox: { display: "flex", alignItems: "center", gap: 8 },
    qtyBtn: { width: 26, height: 26, borderRadius: 7, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    qtyInput: { width: 56, textAlign: "center", padding: "5px 4px", borderRadius: 7, border: `1px solid ${themeG.border}`, fontSize: 13, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none" },
    removeBtn: { border: "none", background: "transparent", color: "#B23A3A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT },

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
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Product</th>
                <th style={S.th}>Code</th>
                <th style={S.th}>Quantity</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((l) => (
                <tr key={l.key}>
                  <td style={S.td}>{l.product.Name}</td>
                  <td style={S.td}>{l.product.Code || "—"}</td>
                  <td style={S.td}>
                    <div style={S.qtyBox}>
                      <button style={S.qtyBtn} onClick={() => setQty(l, l.qty - 1)}>−</button>
                      <input
                        style={S.qtyInput}
                        type="number"
                        min={0}
                        max={l.product.Quantity ?? undefined}
                        value={l.qty}
                        onChange={(e) => setQty(l, parseInt(e.target.value, 10) || 0)}
                      />
                      <button style={S.qtyBtn} onClick={() => setQty(l, l.qty + 1)} disabled={l.product.Quantity != null && l.qty >= l.product.Quantity}>+</button>
                    </div>
                  </td>
                  <td style={S.td}>
                    <button style={S.removeBtn} onClick={() => removeFromCart(customerId, l.key)}>Remove</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...S.td, fontWeight: 700, borderBottom: "none" }}>Total</td>
                <td style={{ ...S.td, borderBottom: "none" }} />
                <td style={{ ...S.td, fontWeight: 700, borderBottom: "none" }}>{totalQty.toLocaleString()}</td>
                <td style={{ ...S.td, borderBottom: "none" }} />
              </tr>
            </tbody>
          </table>
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