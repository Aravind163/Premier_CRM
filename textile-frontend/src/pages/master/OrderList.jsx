// src/pages/master/OrderList.jsx
//
// Orders hub — two tabs in one place instead of two separate pages:
//   1. Order List   — the master CRUD table (was this file, alone)
//   2. Order Status — approve / decline / process / dispatch / deliver
//                      (was pages/status/StatusOrders.jsx)
import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/AppLayout";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const categoryColors = {
  yarn:  { bg: "rgba(247,232,203,0.22)", dot: "#D69426", border: "rgba(214,148,38,0.22)" },
  cloth: { bg: "rgba(216,230,243,0.22)", dot: "#5B9BD9", border: "rgba(91,155,217,0.20)" },
};

const paymentColor = (p) => {
  const map = {
    paid:    { bg: "rgba(91,155,217,0.12)", color: "#101B28", border: "rgba(91,155,217,0.30)" },
    unpaid:  { bg: "rgba(178,58,58,0.10)",  color: "#96302F", border: "rgba(178,58,58,0.26)" },
    partial: { bg: "rgba(214,148,38,0.12)", color: "#8A5A0E", border: "rgba(214,148,38,0.30)" },
    refund:  { bg: "rgba(74,46,122,0.10)", color: "#6a30c0", border: "rgba(74,46,122,0.26)" },
  };
  return map[p] || map.unpaid;
};

const Badge = ({ text, colorFn }) => {
  const s = colorFn(text);
  return (
    <span style={{ ...s, padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${s.border}`, fontFamily: FONT }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  );
};

const btnStyle = (color) => ({ padding: "5px 13px", borderRadius: 7, border: `1px solid ${color}40`, background: `${color}14`, color, cursor: "pointer", fontSize: 12, fontFamily: FONT, fontWeight: 600, whiteSpace: "nowrap" });
const actionBtn = (bg, color, border) => ({
  padding: "7px 14px", borderRadius: 8, border: `1px solid ${border}`, background: bg, color,
  cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
});

export default function OrderList() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const [tab, setTab] = useState("list"); // "list" | "status"

  const tabBtn = (key, label) => (
    <button
      onClick={() => setTab(key)}
      style={{
        padding: "9px 20px", borderRadius: 9, border: "none", cursor: "pointer",
        fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
        background: tab === key ? themeG.accent : "transparent",
        color: tab === key ? "#fff" : themeG.textSub,
      }}
    >
      {label}
    </button>
  );

  return (
    <Layout pageTitle="Orders">
      <div style={{ display: "inline-flex", background: themeG.bg, border: `1px solid ${themeG.border}`, borderRadius: 11, padding: 3, marginBottom: 22 }}>
        {tabBtn("list", "Order List")}
        {tabBtn("status", "Order Status")}
      </div>

      {tab === "list" && <OrderListTab themeG={themeG} navigate={navigate} />}
      {tab === "status" && <OrderStatusTab themeG={themeG} navigate={navigate} />}
    </Layout>
  );
}

/* ────────────────────────── Tab 1: Order List ──────────────────────────── */

function OrderListTab({ themeG, navigate }) {
  const tab = localStorage.getItem("premier_category") || "cloth";

  const [filterStatus, setFilterStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/orders");
        const mapped = res.data.map((o) => ({
          id: o.Code,
          dbId: o.Id,
          customer: o.customer?.Name ?? "—",
          product: o.product?.Name ?? "—",
          category: o.Category,
          subType: o.SubType,
          qty: o.Quantity,
          amount: parseFloat(o.TotalAmount) || 0,
          date: o.CreatedAt ? o.CreatedAt.substring(0, 10) : "",
          status: o.Status,
          payment: o.PaymentStatus,
          dueDate: o.PaymentDueDate ? o.PaymentDueDate.substring(0, 10) : null,
        }));
        setOrders(mapped);
      } catch (err) {
        setError("Failed to load orders.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = orders.filter((o) => {
    const matchTab = o.category === tab;
    const matchStatus = filterStatus === "All" || o.status === filterStatus.toLowerCase();
    const matchSearch = o.id.toLowerCase().includes(search.toLowerCase())
      || o.customer.toLowerCase().includes(search.toLowerCase())
      || o.product.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchStatus && matchSearch;
  });

  const total = filtered.reduce((s, o) => s + o.amount, 0);

  if (loading) return <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading orders…</p>;

  return (
    <>
      {error && (
        <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A", fontFamily: FONT }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: themeG.card, border: `1px solid ${themeG.border}`, boxShadow: "0 2px 8px rgba(46,122,114,0.06)" }}>
          <span style={{ fontSize: 18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Orders</span>
        </div>
        <span style={{ fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>
          <span style={{ color: themeG.accent, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search order, customer, product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, width: 260, fontFamily: FONT, background: themeG.card, outline: "none", color: themeG.textMain }}
        />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["All", "Approved", "Pending", "Processing", "Delivered", "Declined"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{ padding: "6px 13px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 500, transition: "all 0.12s",
                background: filterStatus === s ? "rgba(91,155,217,0.14)" : "transparent",
                color: filterStatus === s ? themeG.accent : themeG.textSub,
                borderColor: filterStatus === s ? "rgba(91,155,217,0.40)" : themeG.border }}>
              {s}
            </button>
          ))}
        </div>

        <button onClick={() => navigate("/master/orders/add")}
          style={{ marginLeft: "auto", padding: "9px 20px", borderRadius: 9, background: themeG.accent, color: themeG.card, border: "none", fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 10px rgba(91,155,217,0.32)" }}>
          + Add Order
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        {[
          { label: "Total Orders", value: filtered.length, color: themeG.accent },
          { label: "Total Value", value: `₹${total.toLocaleString()}`, color: themeG.accent },
          { label: "Pending", value: filtered.filter((o) => o.status === "pending").length, color: "#D69426" },
          { label: "Delivered", value: filtered.filter((o) => o.status === "delivered").length, color: "#1F5C99" },
        ].map((s) => (
          <div key={s.label} style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 10, padding: "12px 20px", boxShadow: "0 2px 8px rgba(46,122,114,0.05)", flex: 1 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: themeG.textLabel, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'Space Grotesk', " + FONT }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(46,122,114,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${themeG.border}` }}>
              {["Order ID", "Customer", "Product", "Sub-type", "Qty", "Amount (₹)", "Date", "Status", "Payment", "Due Date", "Actions"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 13px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(91,155,217,0.04)", fontFamily: FONT }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: "center", padding: 40, color: themeG.textSub, fontSize: 14, fontFamily: FONT }}>No orders found.</td></tr>
            ) : filtered.map((o) => {
              const cc = categoryColors[o.category] || categoryColors.cloth;
              const daysLeft = o.dueDate ? Math.ceil((new Date(o.dueDate) - new Date()) / 86400000) : null;
              const overdue = daysLeft !== null && daysLeft < 0 && o.payment !== "paid";
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid rgba(46,122,114,0.06)", background: cc.bg }}>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.accent, fontWeight: 700, borderLeft: `3px solid ${cc.dot}`, fontFamily: FONT }}>{o.id}</td>
                  <td style={{ padding: "12px 13px", fontSize: 14, color: themeG.textMain, fontWeight: 500, fontFamily: FONT }}>{o.customer}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textSub, fontFamily: FONT }}>{o.product}</td>
                  <td style={{ padding: "12px 13px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: cc.dot, background: cc.border, border: `1px solid ${cc.border}`, padding: "2px 10px", borderRadius: 20, fontFamily: FONT }}>
                      {o.subType}
                    </span>
                  </td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textMain, fontFamily: FONT }}>{o.qty}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, fontWeight: 700, color: themeG.textMain, fontFamily: FONT }}>₹{o.amount.toLocaleString()}</td>
                  <td style={{ padding: "12px 13px", fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>{o.date}</td>
                  <td style={{ padding: "12px 13px" }}><Badge text={o.status} colorFn={statusColor} /></td>
                  <td style={{ padding: "12px 13px" }}><Badge text={o.payment} colorFn={paymentColor} /></td>
                  <td style={{ padding: "12px 13px", fontSize: 12, fontFamily: FONT, whiteSpace: "nowrap" }}>
                    {o.dueDate ? (
                      <span style={{ color: overdue ? "#96302F" : themeG.textSub, fontWeight: overdue ? 700 : 500 }}>
                        {o.dueDate}{overdue ? " ⚠" : ""}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button style={btnStyle("#5B9BD9")} onClick={() => navigate(`/master/orders/${o.dbId}`)}>View</button>
                      <button style={btnStyle(themeG.accent)} onClick={() => navigate(`/master/orders/${o.dbId}?edit=1`)}>Edit</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "10px 13px", borderTop: `1px solid ${themeG.border}`, fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>
          Showing {filtered.length} of {orders.filter((o) => o.category === tab).length} {tab} orders · Total: ₹{total.toLocaleString()}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Tab 2: Order Status ─────────────────────────── */

function OrderStatusTab({ themeG, navigate }) {
  const tab = localStorage.getItem("premier_category") || "cloth";
  const [filter, setFilter] = useState("Approved");
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);

  // Dispatch modal (LR Number + Transport Name)
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [lrNumber, setLrNumber] = useState("");
  const [transportName, setTransportName] = useState("");
  const [dispatching, setDispatching] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get("/orders", { params: filter !== "all" ? { status: filter } : {} });
      setAllOrders(res.data);
    } catch (err) {
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const orders = allOrders.filter((o) => o.Category === tab);

  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 16px", borderBottom: "1px solid rgba(46,122,114,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(91,155,217,0.04)" };
  const td = { padding: "13px 16px", fontSize: 13.5, color: themeG.textMain };

  const setStatus = async (id, status) => {
    setActingId(id);
    setError("");
    try {
      await API.patch(`/orders/${id}/status`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update status.");
    } finally {
      setActingId(null);
    }
  };

  const openDispatch = (order) => {
    setDispatchTarget(order);
    setLrNumber("");
    setTransportName("");
    setError("");
  };

  const submitDispatch = async () => {
    if (!lrNumber.trim() || !transportName.trim()) {
      setError("LR Number and Transport Name are both required.");
      return;
    }
    setDispatching(true);
    setError("");
    try {
      await API.patch(`/orders/${dispatchTarget.Id}/dispatch`, {
        lrNumber: lrNumber.trim(),
        transportName: transportName.trim(),
      });
      setDispatchTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to dispatch order.");
    } finally {
      setDispatching(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: themeG.card, border: `1px solid ${themeG.border}`, boxShadow: "0 2px 8px rgba(46,122,114,0.06)" }}>
          <span style={{ fontSize: 18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Orders</span>
        </div>
        <span style={{ fontSize: 12, color: themeG.textSub }}>
          <span style={{ color: themeG.accent, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {["pending", "approved", "processing", "dispatched", "delivered", "declined", "all"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "8px 16px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textTransform: "capitalize", background: filter === f ? themeG.accent : themeG.card, color: filter === f ? themeG.card : themeG.textSub, borderColor: filter === f ? themeG.accent : themeG.border }}>
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}

      <div style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(46,122,114,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Order", "Customer", "Product", "Amount", "Status", "Actions"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 30 }}>Loading…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 30, color: themeG.textSub }}>No orders in this filter.</td></tr>
            ) : orders.map((o) => (
              <tr key={o.Id} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                <td style={{ ...td, fontWeight: 600, color: themeG.accent, cursor: "pointer" }} onClick={() => navigate(`/master/orders/${o.Id}`)}>{o.Code}</td>
                <td style={td}>{o.customer?.Name ?? "—"}</td>
                <td style={td}>{o.product?.Name ?? "—"}</td>
                <td style={{ ...td, fontWeight: 600 }}>₹{parseFloat(o.TotalAmount).toLocaleString()}</td>
                <td style={td}><Badge text={o.Status} colorFn={statusColor} /></td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {o.Status === "pending" && (
                      <>
                        <button disabled={actingId === o.Id} onClick={() => setStatus(o.Id, "approved")} style={actionBtn("rgba(91,155,217,0.12)", themeG.accent, "rgba(91,155,217,0.30)")}>Approve</button>
                        <button disabled={actingId === o.Id} onClick={() => setStatus(o.Id, "declined")} style={actionBtn("rgba(178,58,58,0.08)", "#B23A3A", "rgba(178,58,58,0.26)")}>Decline</button>
                      </>
                    )}
                    {o.Status === "approved" && (
                      <button disabled={actingId === o.Id} onClick={() => setStatus(o.Id, "processing")} style={actionBtn("rgba(58,92,140,0.10)", "#3A5C8C", "rgba(58,92,140,0.26)")}>Start Processing</button>
                    )}
                    {o.Status === "processing" && (
                      <button disabled={actingId === o.Id} onClick={() => openDispatch(o)} style={actionBtn("rgba(74,46,122,0.10)", "#3A2560", "rgba(74,46,122,0.28)")}>Dispatch</button>
                    )}
                    {o.Status === "dispatched" && (
                      <button disabled={actingId === o.Id} onClick={() => setStatus(o.Id, "delivered")} style={actionBtn("rgba(91,155,217,0.12)", themeG.accent, "rgba(91,155,217,0.30)")}>Mark Delivered</button>
                    )}
                    {o.Status === "dispatched" && o.LRNumber && (
                      <span style={{ fontSize: 11.5, color: themeG.textSub }}>LR: {o.LRNumber} · {o.TransportName}</span>
                    )}
                    {(o.Status === "delivered" || o.Status === "declined") && (
                      <span style={{ fontSize: 12, color: themeG.textSub }}>
                        No further action{o.LRNumber ? ` · LR: ${o.LRNumber}` : ""}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 14, fontSize: 13, color: themeG.textSub }}>
        Showing {orders.length} {tab} order{orders.length !== 1 ? "s" : ""} ({filter})
      </p>

      {dispatchTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,20,34,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={() => setDispatchTarget(null)}>
          <div style={{ background: "#ffffff", borderRadius: 16, padding: 28, width: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 18, margin: "0 0 4px", color: themeG.textMain }}>
              Dispatch {dispatchTarget.Code}
            </h3>
            <p style={{ fontSize: 12, color: themeG.textSub, margin: "0 0 18px" }}>
              {dispatchTarget.customer?.Name} · {dispatchTarget.product?.Name}
            </p>

            {error && (
              <div style={{ background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12, color: "#B23A3A" }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#526073", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>LR Number *</label>
              <input type="text" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)}
                placeholder="e.g. LR-48213"
                style={{ width: "100%", boxSizing: "border-box", background: "#F5F7FA", border: "1px solid rgba(46,122,114,0.22)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0F2138", fontFamily: "inherit", outline: "none" }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#526073", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Transport Name *</label>
              <input type="text" value={transportName} onChange={(e) => setTransportName(e.target.value)}
                placeholder="e.g. VRL Logistics"
                style={{ width: "100%", boxSizing: "border-box", background: "#F5F7FA", border: "1px solid rgba(46,122,114,0.22)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0F2138", fontFamily: "inherit", outline: "none" }} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={submitDispatch} disabled={dispatching}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", cursor: dispatching ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, opacity: dispatching ? 0.6 : 1 }}>
                {dispatching ? "Dispatching…" : "Confirm Dispatch"}
              </button>
              <button onClick={() => setDispatchTarget(null)}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}