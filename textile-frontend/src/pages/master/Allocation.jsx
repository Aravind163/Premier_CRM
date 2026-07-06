// src/pages/master/Allocation.jsx
//
// Quantity Allocation (Admin / System Admin).
//
// Scenario this solves: 5 customers order 200 units of a product each,
// but only 400 units are actually in stock. Someone has to decide how
// much each customer actually gets. This screen:
//   1. Lists every product that currently has active order demand
//      (pending/approved/processing), flagging the oversubscribed ones.
//   2. For a chosen product, shows every customer who ordered it —
//      Ordered Qty (computed live from Orders) vs an editable
//      Allocated Qty — with a running "remaining stock" total that
//      refuses to let you allocate more than what's on hand.
import { useEffect, useState } from "react";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function Allocation() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const role = localStorage.getItem("role") || "";
  const readOnly = role === "super_admin";

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const [detail, setDetail] = useState(null); // { product, customers }
  const [rows, setRows] = useState({});       // customerId -> allocatedQty (string, being edited)
  const [detailLoading, setDetailLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/allocations/products");
        setProducts(res.data);
        if (res.data.length > 0) setSelectedId(res.data[0].productId);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load products.");
      } finally {
        setProductsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    (async () => {
      setDetailLoading(true);
      setError("");
      setNotice("");
      try {
        const res = await API.get("/allocations", { params: { product_id: selectedId } });
        setDetail(res.data);
        const initial = {};
        res.data.customers.forEach((c) => { initial[c.customerId] = String(c.allocatedQty); });
        setRows(initial);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load allocation detail.");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [selectedId]);

  const totalAllocated = Object.values(rows).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);
  const availableQty = detail?.product?.availableQty ?? 0;
  const remaining = availableQty - totalAllocated;
  const overAllocated = remaining < 0;

  const setQty = (customerId, value) => {
    if (readOnly) return;
    // digits only
    const cleaned = value.replace(/[^\d]/g, "");
    setRows((prev) => ({ ...prev, [customerId]: cleaned }));
  };

  const autoSplitEvenly = () => {
    if (readOnly || !detail) return;
    const n = detail.customers.length;
    if (n === 0) return;
    const share = Math.floor(availableQty / n);
    let leftover = availableQty - share * n;
    const next = {};
    detail.customers.forEach((c) => {
      // Never allocate more than what a customer actually asked for.
      let qty = Math.min(share, c.orderedQty);
      if (leftover > 0 && qty < c.orderedQty) { qty += 1; leftover -= 1; }
      next[c.customerId] = String(qty);
    });
    setRows(next);
  };

  const save = async () => {
    if (readOnly || !detail) return;
    if (overAllocated) {
      setError(`Total allocated (${totalAllocated}) exceeds available stock (${availableQty}).`);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const allocations = detail.customers.map((c) => ({
        customerId: c.customerId,
        allocatedQty: parseInt(rows[c.customerId], 10) || 0,
      }));
      await API.post("/allocations", { productId: selectedId, allocations });
      setNotice("Allocation saved.");
      // refresh the product list's totals in the background
      API.get("/allocations/products").then((r) => setProducts(r.data)).catch(() => {});
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save allocation.");
    } finally {
      setSaving(false);
    }
  };

  const S = {
    heading: { fontFamily: FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 22px" },
    layoutRow: { display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, alignItems: "start" },

    listCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(45,106,79,0.06)" },
    listHeader: { padding: "14px 16px", fontSize: 12, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${themeG.border}` },
    listItem: (active) => ({
      padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${themeG.border}`,
      background: active ? "rgba(45,106,79,0.08)" : "transparent",
      borderLeft: active ? `3px solid ${themeG.accent}` : "3px solid transparent",
    }),
    listName: { fontSize: 13.5, fontWeight: 600, color: themeG.textMain, margin: "0 0 3px" },
    listMeta: { fontSize: 11.5, color: themeG.textSub, margin: 0 },
    shortfallPill: { display: "inline-block", marginTop: 4, fontSize: 10.5, fontWeight: 700, color: "#a03025", background: "rgba(200,60,50,0.10)", border: "1px solid rgba(200,60,50,0.26)", borderRadius: 10, padding: "1px 8px" },

    detailCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "22px 24px", boxShadow: "0 4px 16px rgba(45,106,79,0.06)" },
    detailTitle: { fontSize: 17, fontWeight: 700, color: themeG.textMain, margin: "0 0 4px" },
    detailSub: { fontSize: 12.5, color: themeG.textSub, margin: "0 0 16px" },

    summaryRow: { display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" },
    summaryCard: { flex: "1 1 140px", background: themeG.bg, border: `1px solid ${themeG.border}`, borderRadius: 10, padding: "12px 14px" },
    summaryLabel: { fontSize: 10.5, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px", fontWeight: 600 },
    summaryValue: (danger) => ({ fontSize: 19, fontWeight: 700, margin: 0, color: danger ? "#a03025" : themeG.textMain }),

    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 12px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    td: { padding: "11px 12px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    qtyInput: { width: 90, padding: "7px 10px", borderRadius: 8, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, color: themeG.textMain, background: themeG.card, outline: "none" },

    actionsRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
    linkBtn: { background: "transparent", border: "none", color: themeG.accent, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FONT },
    saveBtn: { padding: "10px 24px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
    saveBtnDisabled: { opacity: 0.55, cursor: "not-allowed" },
    empty: { padding: 40, textAlign: "center", fontSize: 13.5, color: themeG.textSub },
  };

  return (
    <Layout pageTitle="Quantity Allocation">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 style={S.heading}>Quantity Allocation</h1>
      <p style={S.headingSub}>
        {readOnly
          ? "Read-only — see how stock has been allocated across customers when demand exceeds supply."
          : "When total orders for a product exceed available stock, decide exactly how much each customer gets."}
      </p>

      {error && (
        <div style={{ marginBottom: 18, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 18, background: "rgba(45,106,79,0.08)", border: "1px solid rgba(45,106,79,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: themeG.accent }}>
          {notice}
        </div>
      )}

      <div style={S.layoutRow}>
        {/* ── Product picker ── */}
        <div style={S.listCard}>
          <div style={S.listHeader}>Products with Active Demand</div>
          {productsLoading ? (
            <p style={{ ...S.empty, padding: 20 }}>Loading…</p>
          ) : products.length === 0 ? (
            <p style={{ ...S.empty, padding: 20 }}>No products currently have pending/approved orders.</p>
          ) : (
            products.map((p) => (
              <div key={p.productId} style={S.listItem(p.productId === selectedId)} onClick={() => setSelectedId(p.productId)}>
                <p style={S.listName}>{p.name}</p>
                <p style={S.listMeta}>{p.code} · Stock {p.availableQty} · Ordered {p.totalOrdered}</p>
                {p.shortfall > 0 && <span style={S.shortfallPill}>Short by {p.shortfall}</span>}
              </div>
            ))
          )}
        </div>

        {/* ── Allocation detail ── */}
        <div style={S.detailCard}>
          {!detail || detailLoading ? (
            <p style={S.empty}>{detailLoading ? "Loading…" : "Select a product to allocate stock."}</p>
          ) : (
            <>
              <h3 style={S.detailTitle}>{detail.product.name}</h3>
              <p style={S.detailSub}>{detail.product.code} · {detail.customers.length} customer(s) waiting</p>

              <div style={S.summaryRow}>
                <div style={S.summaryCard}>
                  <p style={S.summaryLabel}>Available Stock</p>
                  <p style={S.summaryValue(false)}>{availableQty}</p>
                </div>
                <div style={S.summaryCard}>
                  <p style={S.summaryLabel}>Total Ordered</p>
                  <p style={S.summaryValue(false)}>{detail.product.totalOrdered}</p>
                </div>
                <div style={S.summaryCard}>
                  <p style={S.summaryLabel}>Total Allocated</p>
                  <p style={S.summaryValue(overAllocated)}>{totalAllocated}</p>
                </div>
                <div style={S.summaryCard}>
                  <p style={S.summaryLabel}>Remaining</p>
                  <p style={S.summaryValue(overAllocated)}>{remaining}</p>
                </div>
              </div>

              {detail.customers.length === 0 ? (
                <p style={S.empty}>No active orders for this product.</p>
              ) : (
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Customer</th>
                      <th style={S.th}>District / Taluk</th>
                      <th style={S.th}>Ordered Qty</th>
                      <th style={S.th}>Allocated Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.customers.map((c) => (
                      <tr key={c.customerId}>
                        <td style={S.td}>{c.name} <span style={{ color: themeG.textSub, fontSize: 11.5 }}>({c.code})</span></td>
                        <td style={S.td}>{c.district} / {c.taluk}</td>
                        <td style={S.td}>{c.orderedQty}</td>
                        <td style={S.td}>
                          <input
                            style={S.qtyInput}
                            value={rows[c.customerId] ?? ""}
                            onChange={(e) => setQty(c.customerId, e.target.value)}
                            disabled={readOnly}
                            inputMode="numeric"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!readOnly && detail.customers.length > 0 && (
                <div style={S.actionsRow}>
                  <button style={S.linkBtn} onClick={autoSplitEvenly}>Auto-split evenly</button>
                  <button
                    style={{ ...S.saveBtn, ...((saving || overAllocated) ? S.saveBtnDisabled : {}) }}
                    disabled={saving || overAllocated}
                    onClick={save}
                  >
                    {saving ? "Saving…" : "Save Allocation"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}