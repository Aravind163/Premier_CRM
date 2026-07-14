// src/pages/master/OrderEnquiry.jsx
//
// Order Enquiry — sits before Master/My Orders in the sidebar because it's
// the FIRST thing staff should look at: fresh customer enquiries that
// haven't become real orders yet.
//
// Workflow: Assigned -> Approved -> Add Order -> Order List
//   1. A customer submits an enquiry (creates an Order row, Status='pending').
//   2. Staff (Admin / System Admin / End User) assigns it to themselves
//      (or someone else) so it's clear who owns it -> Status='assigned'.
//   3. Once reviewed (stock, price, customer standing), it's approved
//      -> Status='approved'.
//   4. "Add Order" opens the Add Order form pre-filled with this
//      customer + product so staff finalize price/discount/delivery and
//      place the formal order. That marks the original enquiry as
//      converted, and the new order shows up in Order List as usual.
//
// Super Admin sees this screen read-only (no action buttons), matching
// how the rest of Master data behaves for that role.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PIPELINE_STATUSES = "pending,assigned,approved";

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {(text || "—").charAt(0).toUpperCase() + (text || "—").slice(1)}
    </span>
  );
};

export default function OrderEnquiry() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const readOnly = role === "super_admin";
  const canAct = ["admin", "system_admin", "end_user"].includes(role);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { status_in: PIPELINE_STATUSES };
      if (role === "end_user") params.scope = "area";
      const res = await API.get("/orders", { params });
      setOrders(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load enquiries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const assignToMe = async (id) => {
    setBusyId(id); setError("");
    try {
      await API.patch(`/orders/${id}/assign`, {});
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to assign enquiry.");
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (id) => {
    setBusyId(id); setError("");
    try {
      await API.patch(`/orders/${id}/status`, { status: "approved" });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to approve enquiry.");
    } finally {
      setBusyId(null);
    }
  };

  const addOrder = (o) => {
    const params = new URLSearchParams({
      fromEnquiry: o.Id,
      customerId: o.CustomerId,
      productId: o.ProductId,
    });
    navigate(`/master/orders/add?${params.toString()}`);
  };

  const S = buildStyles(themeG);

  return (
    <Layout pageTitle="Order Enquiry">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 style={S.heading}>Order Enquiry</h1>
      <p style={S.headingSub}>
        {readOnly
          ? "Read-only — enquiries move Pending → Assigned → Approved before becoming a formal order."
          : "Assign an enquiry to yourself, approve it, then Add Order to finalize pricing and place it."}
      </p>

      {error && <div style={S.alertError}>{error}</div>}

      <div style={S.card}>
        {loading ? (
          <p style={S.empty}>Loading…</p>
        ) : orders.length === 0 ? (
          <p style={S.empty}>No enquiries waiting right now 🎉</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Order</th>
                <th style={S.th}>Customer</th>
                <th style={S.th}>Product</th>
                <th style={S.th}>Qty</th>
                <th style={S.th}>Amount</th>
                <th style={S.th}>Assigned To</th>
                <th style={S.th}>Status</th>
                {!readOnly && <th style={S.th}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const isBusy = busyId === o.Id;
                const iOwnIt = o.AssignedTo && user.id && String(o.AssignedTo) === String(user.id);
                return (
                  <tr key={o.Id}>
                    <td style={{ ...S.td, fontWeight: 700, color: themeG.accent || "#1F5C99" }}>{o.Code}</td>
                    <td style={S.td}>{o.customer?.Name ?? "—"}</td>
                    <td style={S.td}>{o.product?.Name ?? "—"}</td>
                    <td style={S.td}>{o.Quantity}</td>
                    <td style={S.td}>₹{(parseFloat(o.TotalAmount) || 0).toLocaleString()}</td>
                    <td style={S.td}>{o.assignee?.name || (o.Status === "pending" ? "—" : "—")}</td>
                    <td style={S.td}><Badge text={o.Status} /></td>
                    {!readOnly && (
                      <td style={S.td}>
                        {!canAct ? (
                          <span style={{ fontSize: 12, color: themeG.textSub }}>—</span>
                        ) : o.Status === "pending" ? (
                          <button style={S.actionBtn("#3A2560")} disabled={isBusy} onClick={() => assignToMe(o.Id)}>
                            {isBusy ? "…" : "Assign to me"}
                          </button>
                        ) : o.Status === "assigned" ? (
                          <button style={S.actionBtn("#1F5C99")} disabled={isBusy} onClick={() => approve(o.Id)}>
                            {isBusy ? "…" : "Approve"}
                          </button>
                        ) : o.Status === "approved" ? (
                          <button style={S.actionBtn("#3A5C8C")} disabled={isBusy} onClick={() => addOrder(o)}>
                            Add Order
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

      <div style={S.legend}>
        <LegendStep label="Pending" desc="Customer submitted, unassigned" />
        <Arrow />
        <LegendStep label="Assigned" desc="Someone is reviewing it" />
        <Arrow />
        <LegendStep label="Approved" desc="Ready to become an order" />
        <Arrow />
        <LegendStep label="Order List" desc="Finalized via Add Order" />
      </div>
    </Layout>
  );
}

function LegendStep({ label, desc }) {
  return (
    <div style={{ textAlign: "center", minWidth: 100 }}>
      <p style={{ margin: "0 0 2px", fontSize: 12.5, fontWeight: 700 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 10.5, opacity: 0.65 }}>{desc}</p>
    </div>
  );
}
function Arrow() {
  return <span style={{ opacity: 0.4, fontSize: 16 }}>→</span>;
}

function buildStyles(themeG) {
  return {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 22px" },
    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 18px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    td: { padding: "13px 18px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
    actionBtn: (color) => ({ padding: "6px 14px", borderRadius: 8, border: "none", background: color, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }),
    alertError: { marginBottom: 18, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" },
    legend: { display: "flex", alignItems: "center", gap: 14, justifyContent: "center", marginTop: 24, padding: "16px 10px", color: themeG.textSub },
  };
}