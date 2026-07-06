import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/AppLayout";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const categoryColors = {
  yarn:  { bg: "rgba(252,231,153,0.22)", dot: "#d4a017", border: "rgba(220,180,40,0.22)" },
  cloth: { bg: "rgba(186,225,255,0.22)", dot: "#3a9bd5", border: "rgba(80,160,230,0.20)" },
};

const paymentColor = (p) => {
  const map = {
    paid:    { bg: "rgba(124,179,66,0.12)", color: "#3d6b1f", border: "rgba(124,179,66,0.30)" },
    unpaid:  { bg: "rgba(200,60,50,0.10)",  color: "#a03025", border: "rgba(200,60,50,0.26)" },
    partial: { bg: "rgba(200,160,40,0.12)", color: "#8a6510", border: "rgba(200,160,40,0.30)" },
    refund:  { bg: "rgba(130,80,200,0.10)", color: "#6a30c0", border: "rgba(130,80,200,0.26)" },
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

export default function OrderList() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  // ── Locked to stored category ──
  const tab = localStorage.getItem("premier_category") || "cloth";

  const [filterStatus, setFilterStatus] = useState("All");
  const [search,       setSearch]       = useState("");
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/orders");
        const mapped = res.data.map((o) => ({
          id:       o.Code,
          dbId:     o.Id,
          customer: o.customer?.Name ?? "—",
          product:  o.product?.Name ?? "—",
          category: o.Category,
          subType:  o.SubType,
          qty:      o.Quantity,
          amount:   parseFloat(o.TotalAmount) || 0,
          date:     o.CreatedAt ? o.CreatedAt.substring(0, 10) : "",
          status:   o.Status,
          payment:  o.PaymentStatus,
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
    const matchTab    = o.category === tab;
    const matchStatus = filterStatus === "All" || o.status === filterStatus.toLowerCase();
    const matchSearch = o.id.toLowerCase().includes(search.toLowerCase())
      || o.customer.toLowerCase().includes(search.toLowerCase())
      || o.product.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchStatus && matchSearch;
  });

  const total = filtered.reduce((s, o) => s + o.amount, 0);

  if (loading) return <Layout pageTitle="Orders"><p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading orders…</p></Layout>;

  return (
    <Layout pageTitle="Orders">

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528", fontFamily: FONT }}>
          {error}
        </div>
      )}

      {/* ── Category badge (locked) ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 18px", borderRadius:10, background:themeG.card, border:`1px solid ${themeG.border}`, boxShadow:"0 2px 8px rgba(106,163,38,0.06)" }}>
          <span style={{ fontSize:18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily:FONT, fontSize:14, fontWeight:700, color:themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Orders</span>
        </div>
        <span style={{ fontSize:12, color:themeG.textSub, fontFamily:FONT }}>
          <span style={{ color:themeG.accent, cursor:"pointer", textDecoration:"underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      {/* ── Filters + Search ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search order, customer, product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, width: 260, fontFamily: FONT, background: themeG.card, outline: "none", color: themeG.textMain }}
        />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["All","Approved","Pending","Processing","Delivered","Declined"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{ padding: "6px 13px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 500, transition: "all 0.12s",
                background:  filterStatus === s ? "rgba(124,179,66,0.14)" : "transparent",
                color:       filterStatus === s ? themeG.accent : themeG.textSub,
                borderColor: filterStatus === s ? "rgba(124,179,66,0.40)" : themeG.border }}>
              {s}
            </button>
          ))}
        </div>

        <button onClick={() => navigate("/master/orders/add")}
          style={{ marginLeft: "auto", padding: "9px 20px", borderRadius: 9, background: themeG.accent, color: themeG.card, border: "none", fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 10px rgba(124,179,66,0.32)" }}>
          + Add Order
        </button>
      </div>

      {/* ── Summary strip ── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        {[
          { label: "Total Orders", value: filtered.length,  color: themeG.accent },
          { label: "Total Value",  value: `₹${total.toLocaleString()}`, color: themeG.accent },
          { label: "Pending",      value: filtered.filter(o=>o.status==="pending").length,   color: "#a3791f" },
          { label: "Delivered",    value: filtered.filter(o=>o.status==="delivered").length, color: "#2e9e50" },
        ].map((s) => (
          <div key={s.label} style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 10, padding: "12px 20px", boxShadow: "0 2px 8px rgba(106,163,38,0.05)", flex: 1 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: themeG.textLabel, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: s.color, fontFamily: FONT }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      <div style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(106,163,38,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${themeG.border}` }}>
              {["Order ID", "Customer", "Product", "Sub-type", "Qty", "Amount (₹)", "Date", "Status", "Payment", "Actions"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 13px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(124,179,66,0.04)", fontFamily: FONT }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: themeG.textSub, fontSize: 14, fontFamily: FONT }}>No orders found.</td></tr>
            ) : filtered.map((o) => {
              const cc = categoryColors[o.category] || categoryColors.cloth;
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid rgba(106,163,38,0.06)", background: cc.bg }}>
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
                  <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button style={btnStyle("#3a9bd5")} onClick={() => navigate(`/master/orders/${o.dbId}`)}>View</button>
                      <button style={btnStyle(themeG.accent)} onClick={() => navigate(`/master/orders/${o.dbId}?edit=1`)}>Edit</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "10px 13px", borderTop: `1px solid ${themeG.border}`, fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>
          Showing {filtered.length} of {orders.filter(o=>o.category===tab).length} {tab} orders · Total: ₹{total.toLocaleString()}
        </div>
      </div>
    </Layout>
  );
}

const btnStyle = (color) => ({ padding: "5px 13px", borderRadius: 7, border: `1px solid ${color}40`, background: `${color}14`, color, cursor: "pointer", fontSize: 12, fontFamily: FONT, fontWeight: 600, whiteSpace: "nowrap" });