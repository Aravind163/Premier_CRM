// src/pages/OrderEnquiry.jsx
//
// The actual "cart" page — everything added via Product Selection's
// "Add to Cart" lands here for review before it becomes a real enquiry.
// This is also where Additional Details (Requested Date, Ref/PO,
// Remarks) live and where Submit Enquiry actually happens — Product
// Selection itself never submits anything anymore, it only adds to this
// cart.
//
// ── Drafts ──
// Resuming a saved draft now happens on Product Selection
// (ProductCatalog.jsx), not here — that's where you'd actually want to
// keep shopping. Product Selection merges the draft's items straight
// into the shared cart (utils/customerCart.js) and stashes the draft's
// Additional Details via utils/draftSession.js. This page picks that
// handoff up once on mount (if present) to restore Requested Date /
// Ref-PO / Remarks and to know which draft is being edited, then clears
// it — a one-time pickup, not something that persists across visits.
//
// "💾 Save Draft" here saves the current cart + details as a draft, then
// — same as Submit does — clears the cart and this page's fields, and
// moves on to the Drafts list, instead of leaving a stale cart sitting
// here after it's already been saved off as a draft.
//
// ── "Edit" now covers the whole row, not just Qty ──
// Clicking Edit on a line switches it into an editable state for every
// order-specific field on that row: Qty (stepper, as before) AND Colour
// (a colour-picker swatch instead of a static dot). Sort No / Shade No /
// Type / Product Name stay read-only — those identify *which* catalog
// item this line is, and changing them isn't "editing an order", it's
// swapping products (do that by removing the row and adding the right
// one from the catalog instead). Colour picks are kept in local
// component state (colorOverrides) since the shared cart store doesn't
// have a field-level update API beyond qty yet — see
// utils/customerCart.js if that needs to become persisted too.
//
// ── Qty and UOM are two separate columns ──
// Qty (the stepper/number) and UOM (m / pcs, derived from the product's
// SubType via dummyUom()) are their own dedicated columns, never
// combined into a single "4 m"-style cell — keeps Qty independently
// editable/sortable/exportable without string-parsing a unit back out
// of it, and matches every other product table in the app (catalog,
// admin product list, end-user cart).
//
// Layout note: Save Draft / Submit Enquiry now live in a bottom action
// row AFTER the Additional Details card, not in the cart's own footer.
// They used to sit directly under the product rows, above Requested
// Date / Ref-PO / Remarks — which meant Submit Enquiry was the very next
// clickable thing right after entering a product's qty, so people hit it
// before ever reaching the fields below. Requested Date is now also
// required before submit, matching the End User cart page
// (end-user/CartCheckout.jsx), instead of silently submitting with a
// null delivery date.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/CustomerLayout";
import { useTheme } from "../ThemeContext";
import { getG } from "../theme";
import API from "../services/api";
import { getCart, updateCartQty, removeFromCart, clearCart, subscribeToCart } from "../utils/customerCart";
import { saveDraft as saveDraftEntry, deleteDraft as deleteDraftEntry } from "../utils/customerDrafts";
import { getDraftSession, clearDraftSession } from "../utils/draftSession";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ── Same dummy Type / Shade No / UOM logic as ProductCatalog.jsx, so a
// cart row shows the same Type/Shade No it showed on the catalog table
// it was added from. Kept in sync manually since these are two separate
// pages — see ProductCatalog.jsx if this list ever changes there.
const DUMMY_TYPES = ["BLD & DYED", "Bld/Dyed", "R.Blue/G.Blue", "Fiber Dyed", "YD Dyed", "YD Slub", "3.7 & 7.4", "8*137 (Box)", "Spl Maroon"];
const DUMMY_SHADE_NOS = ["101", "102", "103", "104", "105", "106"];
const DUMMY_SWATCHES = ["#8FD9A8", "#7FD1E0", "#E893C9", "#9A9AA5", "#F0A15C", "#B7A6E0"];

function dummyType(product, i) {
  return product.Type || DUMMY_TYPES[i % DUMMY_TYPES.length];
}
function dummyShadeNo(product, i) {
  const num = product.ShadeNo || DUMMY_SHADE_NOS[i % DUMMY_SHADE_NOS.length];
  return `Shade ${num}`;
}
function dummyUom(subType) {
  const u = (subType || "").toLowerCase();
  if (u.includes("shirting") || u.includes("suiting") || u.includes("blouse")) return "m";
  return "pcs";
}

export default function OrderEnquiry() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [cart, setCart] = useState(getCart());
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [draftId, setDraftId] = useState(null);
  const [requestedDate, setRequestedDate] = useState("");
  const [refNo, setRefNo] = useState("");
  const [remarks, setRemarks] = useState("");

  // Which cart row (by key) is currently in edit mode — while editing,
  // both Qty and Colour become interactive for that row; every other
  // row stays read-only until its own "Edit" is clicked.
  const [editingKey, setEditingKey] = useState(null);

  // Per-row colour overrides picked while editing, keyed by cart item
  // key — local-only for now (see file header note above).
  const [colorOverrides, setColorOverrides] = useState({});

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "customer") { navigate("/login"); return; }
    return subscribeToCart(() => setCart(getCart()));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    // One-time pickup of Additional Details handed off by Product
    // Selection when a draft was resumed there (see utils/draftSession.js).
    // The draft's items are already in the shared cart by the time this
    // page mounts — only the details + which-draft-is-this need restoring
    // here. Cleared immediately after reading so it never reapplies on a
    // later, unrelated visit.
    const session = getDraftSession();
    if (!session) return;
    setDraftId(session.draftId || null);
    if (session.requestedDate) setRequestedDate(session.requestedDate);
    if (session.refNo) setRefNo(session.refNo);
    if (session.remarks) setRemarks(session.remarks);
    clearDraftSession();
    // eslint-disable-next-line
  }, []);

  const cartTotal = cart.reduce((sum, i) => sum + i.qty * parseFloat(i.product.Price || 0), 0);

  const buildNotes = () => {
    const parts = [];
    if (refNo.trim()) parts.push(`Ref/PO: ${refNo.trim()}`);
    if (remarks.trim()) parts.push(remarks.trim());
    return parts.join(" — ") || null;
  };

  const submitEnquiry = async () => {
    if (cart.length === 0) return;
    if (!requestedDate) { setError("Please pick a Requested Date before submitting."); return; }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const res = await API.post("/orders/bulk", {
        items: cart.map((i) => ({
          productId: i.product.Id,
          qty: i.qty,
          color: colorOverrides[i.key] || i.color,
          size: i.size,
        })),
        deliveryDate: requestedDate || null,
        notes: buildNotes(),
      });
      setNotice(res.data.message || "Enquiry submitted. Track it under My Orders.");
      clearCart();
      setColorOverrides({});
      if (draftId) { deleteDraftEntry(draftId); setDraftId(null); }
      setRequestedDate("");
      setRefNo("");
      setRemarks("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit enquiry.");
    } finally {
      setSubmitting(false);
    }
  };

  // Saving a draft "closes out" this cart the same way Submit does — the
  // draft now owns these items, so this page goes back to its empty
  // state and the customer lands on Drafts, matching what happens when
  // saving a draft from Product Selection.
  const saveDraft = () => {
    if (cart.length === 0) { setError("Add something to the cart before saving a draft."); return; }
    setSavingDraft(true);
    try {
      saveDraftEntry({
        id: draftId || undefined,
        customerName: user.name || "Customer",
        cart: Object.fromEntries(cart.map((i) => [i.product.Id, i.qty])), // kept for backward-compat shape
        requestedDate, refNo, remarks,
        items: cart.map((i) => ({
          productId: i.product.Id, code: i.product.Code, name: i.product.Name,
          subType: i.product.SubType, qty: i.qty, product: i.product,
          color: colorOverrides[i.key] || i.color,
        })),
      });
      clearCart();
      setColorOverrides({});
      setEditingKey(null);
      setDraftId(null);
      setRequestedDate("");
      setRefNo("");
      setRemarks("");
      navigate("/customer/drafts");
    } finally {
      setSavingDraft(false);
    }
  };

  const S = {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 24px" },
    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    empty: { padding: 50, textAlign: "center" },
    emptyText: { fontSize: 14, color: themeG.textSub, margin: "0 0 16px" },
    browseBtn: { padding: "10px 22px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: FONT },

    tableScroll: { overflowX: "auto" },
    table: { width: "100%", minWidth: 800, borderCollapse: "collapse" },
    th: { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#FFFFFF", background: "#1F3A63", borderBottom: `1px solid ${themeG.border}` },
    td: { padding: "12px 16px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    qtyBox: { display: "flex", alignItems: "center", gap: 8 },
    qtyBtn: { width: 26, height: 26, borderRadius: 7, border: `1px solid ${themeG.border}`, background: themeG.bg, color: themeG.textMain, fontSize: 14, fontWeight: 700, cursor: "pointer" },
    qtyVal: { fontSize: 13.5, fontWeight: 600, color: themeG.textMain, minWidth: 22, textAlign: "center" },
    swatch: (c) => ({ width: 20, height: 20, borderRadius: "50%", background: c, border: "1.5px solid rgba(0,0,0,0.14)", display: "inline-block" }),
    colorPicker: { width: 28, height: 28, padding: 0, border: `1.5px solid ${themeG.border}`, borderRadius: "50%", cursor: "pointer", background: "none" },
    actionBtns: { display: "flex", gap: 6, flexWrap: "wrap" },
    editBtn: { padding: "5px 12px", borderRadius: 7, border: `1px solid ${themeG.accent}`, background: "rgba(91,155,217,0.08)", color: themeG.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
    removeBtn: { padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(150,48,47,0.3)", background: "rgba(150,48,47,0.06)", color: "#96302F", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT },

    // Cart footer now only shows the running total — no action buttons
    // here anymore, so there's nothing to click before reaching
    // Additional Details below.
    footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "18px 22px", background: themeG.bg },
    totalLabel: { fontSize: 13, color: themeG.textSub, textAlign: "right" },
    totalValue: { fontSize: 20, fontWeight: 700, color: "#1E9E5A", textAlign: "right" },

    detailsCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 20, marginTop: 20, boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    detailsTitle: { fontSize: 14, fontWeight: 700, color: themeG.textMain, margin: "0 0 16px" },
    detailsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 16 },
    label: { fontSize: 11, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" },
    input: { width: "100%", boxSizing: "border-box", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, color: themeG.textMain, background: themeG.bg, outline: "none" },
    textarea: { width: "100%", boxSizing: "border-box", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, color: themeG.textMain, background: themeG.bg, outline: "none", resize: "vertical", minHeight: 40 },
    charCount: { fontSize: 10.5, color: themeG.textSub, textAlign: "right", marginTop: 3 },

    // ── Bottom action row — Save Draft / Submit Enquiry now live here,
    // after Additional Details, matching end-user/CartCheckout.jsx. ──
    bottomRow: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" },
    draftBtn: { padding: "12px 20px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
    submitBtn: { padding: "12px 28px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  };

  return (
    <CustomerLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 style={S.heading}>🛒 Order Enquiry</h1>
      <p style={S.headingSub}>Review the products you've added before submitting.</p>

      {error && <div style={{ marginBottom: 20, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>{error}</div>}
      {notice && <div style={{ marginBottom: 20, background: "rgba(15,33,56,0.08)", border: "1px solid rgba(15,33,56,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: themeG.accent }}>{notice}</div>}

      <div style={S.card}>
        {cart.length === 0 ? (
          <div style={S.empty}>
            <p style={S.emptyText}>{notice ? "Your enquiry has been submitted." : "Your cart is empty."}</p>
            <button style={S.browseBtn} onClick={() => navigate("/customer/catalog")}>Browse Products</button>
          </div>
        ) : (
          <>
            <div style={S.tableScroll}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>S.No</th>
                    <th style={S.th}>Sort No</th>
                    <th style={S.th}>Shade No</th>
                    <th style={S.th}>Product Name</th>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Qty</th>
                    <th style={S.th}>UOM</th>
                    <th style={S.th}>Colour</th>
                    <th style={S.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, i) => {
                    const isEditing = editingKey === item.key;
                    const swatch = colorOverrides[item.key] || item.product.Color || DUMMY_SWATCHES[i % DUMMY_SWATCHES.length];
                    return (
                      <tr key={item.key}>
                        <td style={S.td}>{i + 1}</td>
                        <td style={S.td}>{item.product.Code || "—"}</td>
                        <td style={S.td}>{dummyShadeNo(item.product, i)}</td>
                        <td style={S.td}>{item.product.Name}</td>
                        <td style={S.td}>{dummyType(item.product, i)}</td>
                        <td style={S.td}>
                          {isEditing ? (
                            <div style={S.qtyBox}>
                              <button style={S.qtyBtn} onClick={() => updateCartQty(item.key, item.qty - 1)}>−</button>
                              <span style={S.qtyVal}>{item.qty}</span>
                              <button style={S.qtyBtn} onClick={() => updateCartQty(item.key, item.qty + 1)}>+</button>
                            </div>
                          ) : (
                            <span>{item.qty}</span>
                          )}
                        </td>
                        <td style={S.td}>{dummyUom(item.product.SubType)}</td>
                        <td style={S.td}><div style={S.swatch(swatch)} /></td>
                        <td style={S.td}>
                          <div style={S.actionBtns}>
                            <button style={S.editBtn} onClick={() => setEditingKey(isEditing ? null : item.key)}>
                              {isEditing ? "Done" : "Edit"}
                            </button>
                            <button style={S.removeBtn} onClick={() => removeFromCart(item.key)}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={S.footer}>
              <div>
                <p style={S.totalLabel}>Total Quantity</p>
                <p style={S.totalValue}>{cart.reduce((s, i) => s + i.qty, 0)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {cart.length > 0 && (
        <>
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
                <textarea style={S.textarea} placeholder="Enter any additional remarks (if any)" maxLength={500} rows={2}
                  value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                <p style={S.charCount}>{remarks.length} / 500</p>
              </div>
            </div>
          </div>

          {/* ── Save Draft / Submit Enquiry — now after Additional
              Details, not before it. ── */}
          <div style={S.bottomRow}>
            <button style={S.draftBtn} disabled={savingDraft} onClick={saveDraft}>💾 Save Draft</button>
            <button style={S.submitBtn} disabled={submitting} onClick={submitEnquiry}>
              {submitting ? "Submitting…" : "📨 Submit Enquiry"}
            </button>
          </div>
        </>
      )}

      <p style={{ fontSize: 11, color: themeG.textSub, marginTop: 14, textAlign: "center" }}>
        Prices shown are list price — Marketing may apply discounts when reviewing your enquiry.
      </p>
    </CustomerLayout>
  );
}