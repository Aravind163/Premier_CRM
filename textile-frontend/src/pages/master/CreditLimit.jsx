// src/pages/master/CreditLimit.jsx
//
// Credit Limit feature. One row per customer who currently owes money on
// a billed (dispatched+) order that isn't fully paid yet. Every extra day
// past PaymentDueDate counts as a day "exceeded" — the backend
// (Order::days_overdue) computes this, and a daily notification job
// (orders:notify-overdue) escalates it to whoever created the order.
//
// Filters let staff jump straight to the worst offenders (30+ / 60+ / 90+
// days), and "Record Payment" lets a partial or full payment be logged
// against any of that customer's overdue orders — which brings their
// Outstanding balance back down and clears/reduces the overdue flag.
import { Fragment, useEffect, useMemo, useState } from "react";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";
import { exportRowsToExcel } from "../../utils/excelIO";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const overdueBand = (days) => {
  if (days >= 90) return { label: `${days}d`, bg: "rgba(178,58,58,0.14)", color: "#96302F", border: "rgba(178,58,58,0.32)" };
  if (days >= 60) return { label: `${days}d`, bg: "rgba(214,148,38,0.16)", color: "#8A5A0E", border: "rgba(214,148,38,0.32)" };
  if (days >= 30) return { label: `${days}d`, bg: "rgba(58,92,140,0.14)", color: "#3A5C8C", border: "rgba(58,92,140,0.30)" };
  return { label: `${days}d`, bg: "rgba(150,150,150,0.12)", color: "#526073", border: "rgba(150,150,150,0.28)" };
};

export default function CreditLimit() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const role = localStorage.getItem("role") || "";
  const canAct = ["admin", "system_admin"].includes(role);
  const S = buildStyles(themeG);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [minDays, setMinDays] = useState(0); // 0 | 30 | 60 | 90

  const [payTarget, setPayTarget] = useState(null); // customer row
  const [payOrder, setPayOrder] = useState(null); // one order within that customer
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await API.get("/credit-limit");
      setRows(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load credit limit data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.maxDaysOverdue >= minDays)
      .filter((r) => !q || (r.customerName || "").toLowerCase().includes(q) || (r.customerCode || "").toLowerCase().includes(q));
  }, [rows, search, minDays]);

  const totals = useMemo(() => ({
    customers: visibleRows.length,
    outstanding: visibleRows.reduce((s, r) => s + (r.orders?.reduce((os, o) => os + o.balanceDue, 0) || 0), 0),
    orders: visibleRows.reduce((s, r) => s + (r.orders?.length || 0), 0),
  }), [visibleRows]);

  const fmtAmt = (a) => `₹${(parseFloat(a) || 0).toLocaleString()}`;
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

  const openPay = (customerRow, order) => {
    setPayTarget(customerRow);
    setPayOrder(order);
    setPayAmount(order.balanceDue.toFixed(2));
    setPayNote("");
    setPayError("");
  };

  const submitPayment = async () => {
    setPayError("");
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { setPayError("Enter a valid amount."); return; }
    if (amt > payOrder.balanceDue + 0.005) { setPayError(`Cannot exceed the balance due (₹${payOrder.balanceDue.toLocaleString()}).`); return; }

    setPaying(true);
    try {
      await API.patch(`/orders/${payOrder.orderId}/record-payment`, { amount: amt, note: payNote || undefined });
      setPayTarget(null); setPayOrder(null);
      await load();
    } catch (err) {
      setPayError(err.response?.data?.message || "Failed to record payment.");
    } finally {
      setPaying(false);
    }
  };

  const CREDIT_LIMIT_EXCEL_COLUMNS = [
    { key: "Customer", header: "Customer" },
    { key: "Code", header: "Code" },
    { key: "District", header: "District" },
    { key: "Taluk", header: "Taluk" },
    { key: "CreditLimit", header: "Credit Limit" },
    { key: "Outstanding", header: "Outstanding" },
    { key: "Order", header: "Order" },
    { key: "TotalAmount", header: "Total Amount" },
    { key: "AmountPaid", header: "Amount Paid" },
    { key: "BalanceDue", header: "Balance Due" },
    { key: "PaymentDueDate", header: "Payment Due Date" },
    { key: "DaysOverdue", header: "Days Overdue" },
  ];

  const exportExcel = () => {
    const data = [];
    visibleRows.forEach((r) => {
      (r.orders || []).forEach((o) => {
        data.push({
          Customer: r.customerName, Code: r.customerCode, District: r.district, Taluk: r.taluk,
          CreditLimit: r.creditLimit ?? "", Outstanding: r.outstanding,
          Order: o.code, TotalAmount: o.totalAmount, AmountPaid: o.amountPaid,
          BalanceDue: o.balanceDue, PaymentDueDate: o.paymentDueDate, DaysOverdue: o.daysOverdue,
        });
      });
    });
    exportRowsToExcel(
      data,
      CREDIT_LIMIT_EXCEL_COLUMNS,
      `credit-limit-${new Date().toISOString().slice(0, 10)}`,
      "Credit Limit Details"
    );
  };

  return (
    <Layout pageTitle="Credit Limit">
      <h1 style={S.heading}>Credit Limit</h1>
      <p style={S.headingSub}>Customers with an outstanding balance on a billed order — filter by how many days overdue.</p>

      {error && <div style={S.alertError}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
        {[
          ["Customers Showing", totals.customers, themeG.accent],
          ["Total Outstanding", fmtAmt(totals.outstanding), "#B23A3A"],
          ["Overdue Orders", totals.orders, "#8A5A0E"],
        ].map(([label, value, color]) => (
          <div key={label} style={S.statCard}>
            <p style={S.statLabel}>{label}</p>
            <p style={{ ...S.statValue, color }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={S.searchBar}>
        <div style={S.searchInputWrap}>
          <SearchIcon />
          <input
            type="text"
            placeholder="Search customer name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={S.searchInput}
          />
          {search && <button onClick={() => setSearch("")} style={S.clearBtn} aria-label="Clear search">×</button>}
        </div>

        <div style={S.filterGroup}>
          {[[0, "All"], [30, "30+ days"], [60, "60+ days"], [90, "90+ days"]].map(([days, label]) => (
            <button key={days} onClick={() => setMinDays(days)} style={S.filterBtn(minDays === days)}>{label}</button>
          ))}
        </div>

        <button onClick={exportExcel} disabled={visibleRows.length === 0} style={S.exportBtn(visibleRows.length === 0)}>
          <ExcelIcon /> Export to Excel
        </button>
      </div>

      <div style={S.card}>
        <div style={S.tableScroll}>
          {loading ? (
            <p style={S.empty}>Loading…</p>
          ) : visibleRows.length === 0 ? (
            <p style={S.empty}>Nobody matches this filter — nice and clear. 🎉</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Customer</th><th style={S.th}>Area</th><th style={S.th}>Credit Limit</th>
                  <th style={S.th}>Outstanding</th><th style={S.th}>Worst Overdue</th><th style={S.th}>Overdue Orders</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const band = overdueBand(r.maxDaysOverdue);
                  return (
                    <Fragment key={r.customerId}>
                      <tr style={{ borderBottom: r.orders?.length ? "none" : `1px solid ${themeG.border}` }}>
                        <td style={S.td}>
                          <div style={{ fontWeight: 700, color: themeG.textMain }}>{r.customerName}</div>
                          <div style={{ fontSize: 11, color: themeG.textSub, marginTop: 2 }}>{r.customerCode}{r.phone ? ` · ${r.phone}` : ""}</div>
                        </td>
                        <td style={S.td}>{r.taluk || r.district || "—"}</td>
                        <td style={S.td}>{r.creditLimit != null ? fmtAmt(r.creditLimit) : "—"}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: "#B23A3A" }}>{fmtAmt(r.outstanding)}</td>
                        <td style={S.td}>
                          <span style={{ background: band.bg, color: band.color, border: `1px solid ${band.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                            {r.maxDaysOverdue} day{r.maxDaysOverdue === 1 ? "" : "s"} exceeded
                          </span>
                        </td>
                        <td style={S.td}>{r.orders?.length || 0}</td>
                      </tr>
                      <tr style={{ borderBottom: `1px solid ${themeG.border}` }}>
                        <td colSpan={6} style={{ padding: "0 12px 12px" }}>
                          <div style={S.orderMini}>
                            {(r.orders || []).map((o) => (
                              <div key={o.orderId} style={S.orderMiniRow}>
                                <span style={{ fontWeight: 700, color: themeG.accent }}>{o.code}</span>
                                <span style={{ color: themeG.textSub }}>Due {fmtDate(o.paymentDueDate)}</span>
                                <span>{fmtAmt(o.totalAmount)} total · {fmtAmt(o.amountPaid)} paid</span>
                                <span style={{ fontWeight: 700 }}>{fmtAmt(o.balanceDue)} due</span>
                                <span style={{ color: overdueBand(o.daysOverdue).color, fontWeight: 700 }}>{o.daysOverdue}d overdue</span>
                                {canAct && (
                                  <button style={S.payBtn} onClick={() => openPay(r, o)}>Record Payment</button>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {payTarget && payOrder && (
        <div style={S.modalOverlay} onClick={() => { setPayTarget(null); setPayOrder(null); }}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: themeG.textMain }}>Record Payment</h3>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: themeG.textSub }}>
              {payTarget.customerName} · Order {payOrder.code} · Balance due {fmtAmt(payOrder.balanceDue)}
            </p>

            {payError && <div style={S.alertError}>{payError}</div>}

            <label style={S.modalLabel}>Amount (₹)</label>
            <input
              type="number" min="0.01" step="0.01" max={payOrder.balanceDue}
              value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
              style={S.modalInput}
            />

            <label style={S.modalLabel}>Note (optional)</label>
            <input
              type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)}
              placeholder="e.g. Paid via bank transfer" style={S.modalInput}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => { setPayTarget(null); setPayOrder(null); }} style={S.modalCancelBtn}>Cancel</button>
              <button onClick={submitPayment} disabled={paying} style={S.modalSubmitBtn(paying)}>
                {paying ? "Saving…" : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function ExcelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="3" x2="8" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

function buildStyles(themeG) {
  return {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 18px" },
    statCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 4px 16px rgba(46,122,114,0.05)" },
    statLabel: { fontSize: 11, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" },
    statValue: { fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'Space Grotesk', " + FONT },

    searchBar: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 },
    searchInputWrap: { position: "relative", display: "flex", alignItems: "center", flex: "1 1 260px", minWidth: 220, color: themeG.textSub },
    searchInput: { width: "100%", boxSizing: "border-box", padding: "10px 34px", borderRadius: 10, border: `1px solid ${themeG.border}`, fontSize: 13.5, fontFamily: FONT, background: themeG.card, outline: "none", color: themeG.textMain },
    clearBtn: { position: "absolute", right: 8, background: "transparent", border: "none", color: themeG.textSub, fontSize: 17, lineHeight: 1, cursor: "pointer", padding: 4 },
    filterGroup: { display: "flex", gap: 6, flexWrap: "wrap" },
    filterBtn: (active) => ({
      padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
      cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
      background: active ? themeG.accent : themeG.card, color: active ? "#fff" : themeG.textSub,
      borderColor: active ? themeG.accent : themeG.border, whiteSpace: "nowrap",
    }),
    exportBtn: (disabled) => ({
      display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10,
      border: "none", background: disabled ? themeG.border : "#1E7B4D", color: "#fff",
      fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: FONT, whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1,
    }),

    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    tableScroll: { overflowX: "auto" },
    table: { width: "100%", tableLayout: "auto", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 10.5, color: themeG.textLabel, padding: "9px 12px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    td: { padding: "10px 12px", fontSize: 13, color: themeG.textMain },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
    alertError: { marginBottom: 18, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" },

    orderMini: { display: "flex", flexDirection: "column", gap: 6, background: "rgba(178,58,58,0.04)", border: "1px solid rgba(178,58,58,0.14)", borderRadius: 10, padding: "10px 12px" },
    orderMiniRow: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: themeG.textMain },
    payBtn: { marginLeft: "auto", padding: "5px 12px", borderRadius: 7, border: "none", background: themeG.accent, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },

    modalOverlay: { position: "fixed", inset: 0, background: "rgba(8,20,34,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
    modal: { background: themeG.card, borderRadius: 16, padding: 26, width: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.22)" },
    modalLabel: { display: "block", fontSize: 11.5, fontWeight: 700, color: themeG.textLabel, textTransform: "uppercase", letterSpacing: "0.05em", margin: "12px 0 6px" },
    modalInput: { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 14, fontFamily: FONT, background: themeG.card, color: themeG.textMain, outline: "none" },
    modalCancelBtn: { flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600 },
    modalSubmitBtn: (busy) => ({ flex: 2, padding: "10px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 700, opacity: busy ? 0.6 : 1 }),
  };
}