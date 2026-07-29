// src/pages/master/SalesOrder.jsx
//
// Sales Order worklist — now shows ONLY Approved orders (the only status
// relevant to this page). Once an order is Approved it's ready to hand
// off downstream — "Push to ERP" records that handoff on the order itself
// (OrderDetails.ErpSynced / ErpSyncedAt) so it's visible everywhere the
// order shows up.
//
// NOTE: there's no live ERP system wired up on the backend yet — this
// records the sync flag/timestamp on our own side so the workflow and UI
// are ready; connecting it to a real ERP just needs that ERP's API
// details plugged into the "Push to ERP" handler below.
import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function SalesOrder() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const role = localStorage.getItem("role") || "";
  // Push to ERP is reserved for the Marketing Head (system_admin) — see
  // O2C Scope §4 "Inquiry approval and SO creation in ERP": Marketing can
  // review the approved list, but only System Admin transfers it into
  // ERP. Marketing (admin) sees this list read-only.
  const canAct = role === "system_admin";
  const S = buildStyles(themeG);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // Order.Id set — checkbox selection

  const showSelection = canAct;

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await API.get("/orders", { params: { status: "approved" } });
      setOrders(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load sales orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setSelected(new Set()); }, [search]);

  const filterBySearch = (list) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) =>
      (o.customer?.Name || "").toLowerCase().includes(q) ||
      (o.Code || "").toLowerCase().includes(q));
  };

  const visible = filterBySearch(orders);

  const pushToErp = async (order) => {
    setBusyId(order.Id); setError("");
    try {
      const orderDetails = { ...(order.OrderDetails || {}), ErpSynced: true, ErpSyncedAt: new Date().toISOString() };
      await API.put(`/orders/${order.Id}`, { orderDetails });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to push order to ERP.");
    } finally {
      setBusyId(null);
    }
  };

  // ── Checkbox selection (select all / select one or more) ──
  const allSelected = visible.length > 0 && visible.every((o) => selected.has(o.Id));
  const someSelected = visible.some((o) => selected.has(o.Id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        visible.forEach((o) => next.delete(o.Id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((o) => next.add(o.Id));
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedEligible = visible.filter((o) => selected.has(o.Id) && !o.OrderDetails?.ErpSynced);

  const pushSelectedToErp = async () => {
    if (selectedEligible.length === 0) return;
    setBulkBusy(true); setError("");
    try {
      await Promise.all(selectedEligible.map((o) => {
        const orderDetails = { ...(o.OrderDetails || {}), ErpSynced: true, ErpSyncedAt: new Date().toISOString() };
        return API.put(`/orders/${o.Id}`, { orderDetails });
      }));
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to push the selected orders to ERP.");
    } finally {
      setBulkBusy(false);
    }
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
  const fmtAmt = (a) => `₹${(parseFloat(a) || 0).toLocaleString()}`;

  return (
    <Layout pageTitle="Sales Order">
      <h1 style={S.heading}>Sales Order</h1>
      <p style={S.headingSub}>
        {canAct
          ? "Approved orders, ready to push to ERP."
          : "Approved orders. ERP transfer is performed by the System Admin (Marketing Head) — read-only here."}
      </p>

      {error && <div style={S.alertError}>{error}</div>}

      <div style={S.searchBar}>
        <div style={S.searchInputWrap}>
          <SearchIcon />
          <input
            type="text"
            placeholder="Search customer name or order no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={S.searchInput}
          />
          {search && <button onClick={() => setSearch("")} style={S.clearBtn} aria-label="Clear search">×</button>}
        </div>

        {showSelection && someSelected && (
          <div style={S.bulkBar}>
            <span style={S.bulkCount}>{selected.size} selected</span>
            <button
              style={S.actionBtn}
              disabled={bulkBusy || selectedEligible.length === 0}
              onClick={pushSelectedToErp}
              title={selectedEligible.length === 0 ? "None of the selected orders are un-synced" : undefined}
            >
              {bulkBusy ? "…" : `Push ${selectedEligible.length || ""} to ERP`}
            </button>
            <button style={S.bulkClearBtn} onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.tableScroll}>
          {loading ? (
            <p style={S.empty}>Loading…</p>
          ) : visible.length === 0 ? (
            <p style={S.empty}>No approved orders match this filter.</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  {showSelection && (
                    <th style={{ ...S.th, width: 34 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all visible orders" />
                    </th>
                  )}
                  <th style={S.th}>Order</th><th style={S.th}>Customer</th><th style={S.th}>Product</th>
                  <th style={S.th}>Qty</th><th style={S.th}>Amount</th><th style={S.th}>Status</th>
                  <th style={S.th}>Date</th><th style={S.th}>ERP</th>
                  {canAct && <th style={S.th}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const st = statusColor(o.Status);
                  const erpSynced = !!o.OrderDetails?.ErpSynced;
                  return (
                    <tr key={o.Id}>
                      {showSelection && (
                        <td style={S.td}>
                          <input type="checkbox" checked={selected.has(o.Id)} onChange={() => toggleOne(o.Id)} aria-label={`Select order ${o.Code}`} />
                        </td>
                      )}
                      <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{o.Code}</td>
                      <td style={S.td}>{o.customer?.Name ?? "—"}</td>
                      <td style={S.td}>{o.product?.Name ?? "—"}</td>
                      <td style={S.td}>{o.Quantity}</td>
                      <td style={S.td}>{fmtAmt(o.TotalAmount)}</td>
                      <td style={S.td}>
                        <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                          {o.Status}
                        </span>
                      </td>
                      <td style={S.td}>{fmtDate(o.DispatchedAt || o.CreatedAt)}</td>
                      <td style={S.td}>
                        {erpSynced
                          ? <span style={S.erpBadge}>Synced {fmtDate(o.OrderDetails?.ErpSyncedAt)}</span>
                          : <span style={{ fontSize: 12, color: themeG.textSub }}>—</span>}
                      </td>
                      {canAct && (
                        <td style={S.td}>
                          {!erpSynced ? (
                            <button style={S.actionBtn} disabled={busyId === o.Id} onClick={() => pushToErp(o)}>
                              {busyId === o.Id ? "…" : "Push to ERP"}
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: themeG.textSub }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function buildStyles(themeG) {
  return {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 18px" },

    searchBar: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 },
    searchInputWrap: { position: "relative", display: "flex", alignItems: "center", flex: "1 1 280px", minWidth: 240, color: themeG.textSub },
    searchInput: { width: "100%", boxSizing: "border-box", padding: "10px 34px", borderRadius: 10, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, background: themeG.card, outline: "none", color: themeG.textMain },
    clearBtn: { position: "absolute", right: 8, background: "transparent", border: "none", color: themeG.textSub, fontSize: 17, lineHeight: 1, cursor: "pointer", padding: 4 },

    bulkBar: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(31,92,153,0.08)", border: "1px solid rgba(31,92,153,0.22)" },
    bulkCount: { fontSize: 12.5, fontWeight: 700, color: themeG.textMain, whiteSpace: "nowrap" },
    bulkClearBtn: { background: "transparent", border: "none", color: themeG.textSub, fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline", whiteSpace: "nowrap" },

    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    tableScroll: { overflowX: "auto" },
    table: { width: "100%", tableLayout: "auto", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 10.5, color: themeG.textLabel, padding: "9px 12px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    td: { padding: "10px 12px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
    actionBtn: { padding: "6px 14px", borderRadius: 8, border: "none", background: themeG.accent, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    erpBadge: { fontSize: 11, fontWeight: 700, color: "#1E7B4D", background: "rgba(30,123,77,0.12)", border: "1px solid rgba(30,123,77,0.3)", borderRadius: 8, padding: "3px 8px", whiteSpace: "nowrap" },
    alertError: { marginBottom: 18, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" },
  };
}