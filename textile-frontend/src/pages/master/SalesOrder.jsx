// src/pages/master/SalesOrder.jsx
//
// Sales Order — rebuilt as four drill-down views, one per stat card on the
// Marketing Review page ("Pending Final Approval" / "Approved Orders
// Today" / "Total Order Value" / "ERP Transfer Pending"). Each card's
// "View Details" link opens this page with a `?view=` query param that
// selects one of the four tabs below; the tabs can also be switched by
// hand once you're here. Every view reads from the SAME allocations data
// Marketing Review writes to (GET /allocations/list) — this is no longer
// a plain "approved Orders" list.
//
// NOTE: Checkbox selection / bulk actions, the per-row Actions column,
// the Remarks column, and the ERP SO Status column have been removed.
// This page is now read-only — Approve / Reject / Transfer to ERP still
// live on the Marketing Review page.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const VIEWS = [
  { id: "pending_final_approval", label: "Pending Final Approval" },
  { id: "approved_today",         label: "Approved Orders Today" },
  { id: "total_order_value",      label: "Total Order Value" },
  { id: "erp_transfer_pending",   label: "ERP Transfer Pending" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function SalesOrder() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const S = buildStyles(themeG);

  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.some((v) => v.id === searchParams.get("view"))
    ? searchParams.get("view")
    : "pending_final_approval";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [search, setSearch] = useState("");
  const [busyIds, setBusyIds] = useState(() => new Set());

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params = {};
      if (view === "pending_final_approval") params.status = "pending";
      if (view === "approved_today") { params.status = "approved"; params.date = todayStr(); }
      if (view === "erp_transfer_pending") { params.status = "approved"; params.erp_status = "not_transferred"; }
      // "total_order_value" intentionally has no status/erp filter — it's
      // the full picture, sorted by value.
      const res = await API.get("/allocations/list", { params });
      setRows(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load this list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view]);

  const setView = (id) => setSearchParams(id === "pending_final_approval" ? {} : { view: id });

  // Reject — same PATCH /allocations/{id}/decision endpoint Marketing
  // Review's tick/cross actions use, so a rejection made here shows up
  // everywhere else that reads allocation status (Marketing Review,
  // Order Status, the customer/end-user dashboards) — it's the same
  // shared record, not a page-local flag. Only a still-Pending row can be
  // rejected, matching the backend's existing rule.
  const handleReject = async (row) => {
    if (!row.allocationId || row.status !== "pending") return;
    if (!window.confirm(`Reject the order for ${row.customerName} — ${row.productName}?`)) return;
    setBusyIds((s) => new Set(s).add(row.allocationId));
    setError(""); setOk("");
    try {
      await API.patch(`/allocations/${row.allocationId}/decision`, { status: "rejected" });
      setRows((prev) => prev.map((r) => (r.allocationId === row.allocationId ? { ...r, status: "rejected" } : r)));
      setOk("Order rejected.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reject this order.");
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(row.allocationId); return n; });
    }
  };

  // Cancel — a distinct action from Reject: it pulls the order out of
  // Sales Order entirely and logs it as a loss, so it can show up on the
  // Sales Loss Report page. NOTE: this calls a new endpoint,
  // POST /allocations/{id}/cancel, which doesn't exist in the
  // AllocationController shown so far — it needs to be added there (set
  // the allocation/Order to a 'cancelled' state and write/expose a row
  // the Sales Loss Report page's own query reads from). Once that
  // endpoint responds, the row is simply removed from this page's list.
  const handleCancel = async (row) => {
    if (!row.allocationId) return;
    if (!window.confirm(`Cancel the order for ${row.customerName} — ${row.productName}? It will be removed from Sales Order and logged in Sales Loss Report.`)) return;
    setBusyIds((s) => new Set(s).add(row.allocationId));
    setError(""); setOk("");
    try {
      await API.post(`/allocations/${row.allocationId}/cancel`);
      setRows((prev) => prev.filter((r) => r.allocationId !== row.allocationId));
      // setOk("Order cancelled and moved to Sales Loss Report.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to cancel this order.");
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(row.allocationId); return n; });
    }
  };

  const filterBySearch = (list) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      (r.customerName || "").toLowerCase().includes(q) ||
      (r.customerCode || "").toLowerCase().includes(q) ||
      (r.productName || "").toLowerCase().includes(q) ||
      (r.productCode || "").toLowerCase().includes(q));
  };

  const visible = useMemo(() => {
    let list = filterBySearch(rows);
    if (view === "total_order_value") list = [...list].sort((a, b) => b.totalValue - a.totalValue);
    return list;
  }, [rows, search, view]);

  const totalValueSum = useMemo(() => rows.reduce((a, r) => a + (r.totalValue || 0), 0), [rows]);

  const fmtAmt = (a) => `₹${(parseFloat(a) || 0).toLocaleString()}`;
  const statusBadge = (status) => {
    const map = {
      pending:  { bg: "rgba(214,148,38,0.12)",  color: "#A8701F", label: "Pending" },
      approved: { bg: "rgba(46,122,114,0.12)",  color: "#1E7B4D", label: "Approved" },
      rejected: { bg: "rgba(178,58,58,0.12)",   color: "#B23A3A", label: "Rejected" },
    };
    const st = map[status] || { bg: "rgba(140,150,163,0.12)", color: "#526073", label: status || "—" };
    return <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}33`, padding: "3px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>{st.label}</span>;
  };

  return (
    <Layout pageTitle="Sales Order">
      <h1 style={S.heading}>Order details</h1>
      <p style={S.headingSub}>
        {VIEWS.find((v) => v.id === view)?.label} — fed by Marketing Review's Final Approval workflow.
        {view === "total_order_value" && ` Total: ${fmtAmt(totalValueSum)} across ${rows.length} line(s).`}
      </p>

      <div style={S.tabRow}>
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} style={{ ...S.tabBtn, ...(view === v.id ? S.tabBtnActive : {}) }}>
            {v.label}
          </button>
        ))}
      </div>

      {error && <div style={S.alertError}>{error}</div>}
      {ok && <div style={S.alertOk}>{ok}</div>}

      <div style={S.searchBar}>
        <div style={S.searchInputWrap}>
          <span style={S.searchIconWrap}><SearchIcon /></span>
          <input
            type="text"
            placeholder="Search customer or product name / code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={S.searchInput}
          />
          {search && <button onClick={() => setSearch("")} style={S.clearBtn} aria-label="Clear search">×</button>}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.tableScroll}>
          {loading ? (
            <p style={S.empty}>Loading…</p>
          ) : visible.length === 0 ? (
            <p style={S.empty}>Nothing here right now.</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>S.No</th>
                  <th style={S.th}>Customer</th><th style={S.th}>Customer Code</th>
                  <th style={S.th}>Product</th><th style={S.th}>Product Code</th>
                  <th style={S.th}>Qty</th><th style={S.th}>Status</th>
                  {view === "pending_final_approval" && <th style={S.th}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, idx) => {
                  const busy = busyIds.has(r.allocationId);
                  const canReject = r.status === "pending" && !busy;
                  return (
                    <tr key={r.allocationId}>
                      <td style={S.td}>{idx + 1}</td>
                      <td style={{ ...S.td, fontWeight: 700, color: themeG.accent }}>{r.customerName}</td>
                      <td style={S.td}>{r.customerCode}</td>
                      <td style={S.td}>{r.productName}</td>
                      <td style={S.td}>{r.productCode}</td>
                      <td style={S.td}>{r.allocatedQty}</td>
                      <td style={S.td}>{statusBadge(r.status)}</td>
                      {view === "pending_final_approval" && (
                        <td style={S.td}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => handleReject(r)}
                              disabled={!canReject}
                              title={r.status === "pending" ? "Reject this order" : "Only a Pending order can be rejected"}
                              style={{ ...S.actionBtnReject, ...(canReject ? {} : S.actionBtnDisabled) }}
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleCancel(r)}
                              disabled={busy}
                              title="Cancel this order and log it in Sales Loss Report"
                              style={{ ...S.actionBtnCancel, ...(busy ? S.actionBtnDisabled : {}) }}
                            >
                              Cancel
                            </button>
                          </div>
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
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 14px" },

    tabRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
    tabBtn: { padding: "8px 14px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
    tabBtnActive: { background: themeG.accent, color: "#fff", borderColor: themeG.accent },

    searchBar: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 },
    searchInputWrap: { position: "relative", display: "flex", alignItems: "center", flex: "1 1 280px", minWidth: 240, color: themeG.textSub },
    searchIconWrap: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", color: themeG.textSub, pointerEvents: "none" },
    searchInput: { width: "100%", boxSizing: "border-box", padding: "10px 34px", borderRadius: 10, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, background: themeG.card, outline: "none", color: themeG.textMain },
    clearBtn: { position: "absolute", right: 8, background: "transparent", border: "none", color: themeG.textSub, fontSize: 17, lineHeight: 1, cursor: "pointer", padding: 4 },

    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    // Shows roughly 10 data rows before scrolling; the header stays
    // pinned (position: sticky) while the body scrolls underneath it.
    tableScroll: { overflowX: "auto", overflowY: "auto", maxHeight: 460 },
    table: { width: "100%", tableLayout: "auto", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 10.5, color: "#FFFFFF", background: "#1F3A63", padding: "10px 12px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, position: "sticky", top: 0, zIndex: 1 },
    td: { padding: "10px 12px", fontSize: 13, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    actionBtnReject: { padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(178,58,58,0.35)", background: "rgba(178,58,58,0.08)", color: "#B23A3A", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    actionBtnCancel: { padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(138,90,14,0.35)", background: "rgba(138,90,14,0.08)", color: "#8A5A0E", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
    actionBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
    alertError: { marginBottom: 18, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" },
    alertOk: { marginBottom: 18, background: "rgba(46,122,114,0.08)", border: "1px solid rgba(46,122,114,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1E7B4D" },
  };
}