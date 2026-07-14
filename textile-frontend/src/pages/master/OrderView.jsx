import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { getG, statusColor, G } from "../../theme";
import API from "../../services/api";

const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");

let tG = getThemeColors();

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 18 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: tG.textLabel, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
      {label}
    </label>
    {children}
  </div>
);

const Input = (props) => (
  <input {...props} style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: tG.textMain, background: tG.card, outline: "none", boxSizing: "border-box" }} />
);

const Select = ({ children, ...props }) => (
  <select {...props} style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: tG.textMain, background: tG.card, outline: "none", boxSizing: "border-box" }}>
    {children}
  </select>
);

const ReadRow = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
    <span style={{ fontSize: 13, color: tG.textSub }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: tG.textMain }}>{value ?? "—"}</span>
  </div>
);

const paymentColor = (p) => {
  const tG = getThemeColors();
  const map = {
    paid:    { bg: "rgba(91,155,217,0.12)", color: "#1F5C99", border: "rgba(91,155,217,0.30)" },
    unpaid:  { bg: "rgba(178,58,58,0.10)",  color: "#96302F", border: "rgba(178,58,58,0.26)" },
    partial: { bg: "rgba(214,148,38,0.12)", color: "#8A5A0E", border: "rgba(214,148,38,0.30)" },
    refund:  { bg: "rgba(74,46,122,0.10)", color: "#6a30c0", border: "rgba(74,46,122,0.26)" },
  };
  return map[p] || map.unpaid;
};

const Badge = ({ text, colorFn }) => {
  const tG = getThemeColors();
  const s = colorFn(text);
  return (
    <span style={{ ...s, padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${s.border}` }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  );
};

export default function OrderView() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const card = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 24, boxShadow: "0 4px 16px rgba(46,122,114,0.05)" };
  const cardTitle = { fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 16, fontWeight: 600, margin: "0 0 20px", color: themeG.textMain };

  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const editMode = searchParams.get("edit") === "1";

  const [order, setOrder] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get(`/orders/${id}`);
        setOrder(res.data);
        setForm({
          qty: res.data.Quantity,
          pricePerUnit: res.data.PricePerUnit,
          discount: res.data.DiscountPct || 0,
          status: res.data.Status,
          paymentStatus: res.data.PaymentStatus,
          deliveryDate: res.data.DeliveryDate ? res.data.DeliveryDate.substring(0, 10) : "",
          notes: res.data.Notes || "",
        });
      } catch (err) {
        setError("Failed to load order.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const total = form
    ? (parseFloat(form.qty || 0) * parseFloat(form.pricePerUnit || 0) * (1 - (parseFloat(form.discount) || 0) / 100)).toFixed(2)
    : "—";

  const enterEdit = () => setSearchParams({ edit: "1" });
  const cancelEdit = () => setSearchParams({});

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await API.put(`/orders/${id}`, form);
      setOrder(res.data);
      setSearchParams({});
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update order.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete order ${order.Code}? This cannot be undone.`)) return;
    try {
      await API.delete(`/orders/${id}`);
      navigate("/master/orders");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete order.");
    }
  };

  const role = localStorage.getItem("role") || "";
  const canManageDue = ["admin", "system_admin", "super_admin", "end_user"].includes(role);

  const [dueEditing, setDueEditing] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueSaving, setDueSaving] = useState(false);
  const [dueError, setDueError] = useState("");

  const startDueEdit = () => {
    setDueDate(order.PaymentDueDate ? order.PaymentDueDate.substring(0, 10) : "");
    setDueError("");
    setDueEditing(true);
  };

  const saveDueDate = async () => {
    if (!dueDate) { setDueError("Pick a date."); return; }
    setDueSaving(true); setDueError("");
    try {
      const res = await API.patch(`/orders/${id}/payment-due`, { paymentDueDate: dueDate });
      setOrder(res.data);
      setDueEditing(false);
    } catch (err) {
      setDueError(err.response?.data?.message || "Failed to update due date.");
    } finally {
      setDueSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout pageTitle="Order">
        <p style={{ color: themeG.textSub }}>Loading order…</p>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout pageTitle="Order">
        <p style={{ color: "#B23A3A" }}>{error || "Order not found."}</p>
        <button onClick={() => navigate("/master/orders")} style={{ marginTop: 12, padding: "9px 20px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, cursor: "pointer", fontFamily: "inherit" }}>
          Back to Orders
        </button>
      </Layout>
    );
  }

  return (
    <Layout pageTitle={`${editMode ? "Edit Order" : "Order Details"} · ${order.customer?.Name ?? ""}`}>

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        <div style={card}>
          <h3 style={cardTitle}>Order Details</h3>

          <ReadRow label="Order Code" value={order.Code} />
          <ReadRow label="Customer" value={order.customer ? `${order.customer.Name} (${order.customer.Code})` : "—"} />
          <ReadRow label="Product" value={order.product ? `${order.product.Name} (${order.product.Code})` : "—"} />
          <ReadRow label="Category" value={order.Category === "cloth" ? "👘 Cloth" : "🧵 Yarn"} />
          <ReadRow label="Sub-type" value={order.SubType} />

          {editMode ? (
            <>
              <Field label="Quantity">
                <Input type="number" value={form.qty} onChange={(e) => set("qty", e.target.value)} />
              </Field>
              <Field label="Price per Unit (₹)">
                <Input type="number" value={form.pricePerUnit} onChange={(e) => set("pricePerUnit", e.target.value)} />
              </Field>
              <Field label="Discount (%)">
                <Input type="number" min={0} max={100} value={form.discount} onChange={(e) => set("discount", e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <ReadRow label="Quantity" value={order.Quantity} />
              <ReadRow label="Price per Unit" value={`₹${parseFloat(order.PricePerUnit).toLocaleString()}`} />
              <ReadRow label="Discount" value={`${order.DiscountPct || 0}%`} />
              <ReadRow label="Total Amount" value={`₹${parseFloat(order.TotalAmount).toLocaleString()}`} />
            </>
          )}
        </div>

        <div style={card}>
          <h3 style={cardTitle}>Status & Delivery</h3>

          {editMode ? (
            <>
              <Field label="Order Status">
                <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="processing">Processing</option>
                  <option value="delivered">Delivered</option>
                  <option value="declined">Declined</option>
                </Select>
              </Field>
              <Field label="Payment Status">
                <Select value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="refund">Refund</option>
                </Select>
              </Field>
              <Field label="Expected Delivery Date">
                <Input type="date" value={form.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} />
              </Field>
              <Field label="Notes">
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={4}
                  style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#ffffff", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </Field>

              <div style={{ marginTop: 12, padding: "16px 18px", borderRadius: 12, border: `2px solid rgba(91,155,217,0.25)`, background: "rgba(91,155,217,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#526073" }}>New Total</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1F5C99" }}>₹{parseFloat(total).toLocaleString()}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                <span style={{ fontSize: 13, color: "#526073" }}>Status</span>
                <Badge text={order.Status} colorFn={statusColor} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                <span style={{ fontSize: 13, color: "#526073" }}>Payment</span>
                <Badge text={order.PaymentStatus} colorFn={paymentColor} />
              </div>
              <ReadRow label="Delivery Date" value={order.DeliveryDate ? order.DeliveryDate.substring(0, 10) : "—"} />
              <ReadRow label="Created" value={order.CreatedAt?.substring(0, 10)} />
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 12, color: "#101B28", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Notes</p>
                <p style={{ fontSize: 13, color: "#0F2138", margin: 0 }}>{order.Notes || "—"}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ ...card, marginTop: 24 }}>
        <h3 style={cardTitle}>Payment Due Date</h3>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <ReadRow label="Credit Term" value={`${order.PaymentTermDays ?? 15} days`} />
            <div>
              <p style={{ fontSize: 12, color: themeG.textSub, margin: "0 0 4px" }}>Due Date</p>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: order.is_overdue ? "#B23A3A" : themeG.textMain }}>
                {order.PaymentDueDate ? order.PaymentDueDate.substring(0, 10) : "Set on dispatch"}
                {order.is_overdue && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#B23A3A", background: "rgba(178,58,58,0.10)", border: "1px solid rgba(178,58,58,0.26)", borderRadius: 10, padding: "1px 8px" }}>Overdue</span>}
              </p>
            </div>
            {order.PaymentDueDateNote && (
              <div>
                <p style={{ fontSize: 12, color: themeG.textSub, margin: "0 0 4px" }}>Note</p>
                <p style={{ fontSize: 13, margin: 0, color: themeG.textMain }}>{order.PaymentDueDateNote}</p>
              </div>
            )}
          </div>

          {canManageDue && (
            dueEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 160 }} />
                <button onClick={saveDueDate} disabled={dueSaving} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1F5C99", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {dueSaving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setDueEditing(false)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${themeG.border}`, background: themeG.card, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={startDueEdit} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid rgba(15,33,56,0.30)`, background: "rgba(15,33,56,0.06)", color: "#1F5C99", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Reassign Due Date
              </button>
            )
          )}
        </div>
        {dueError && <p style={{ color: "#B23A3A", fontSize: 12.5, marginTop: 10 }}>{dueError}</p>}
      </div>

      

      <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
        <button onClick={() => navigate("/master/orders")} style={{ padding: "10px 24px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, background: "#ffffff", color: "#526073", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
          Back
        </button>

        {editMode ? (
          <>
            <button onClick={cancelEdit} style={{ padding: "10px 24px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, background: "#ffffff", color: "#526073", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "10px 28px", borderRadius: 9, border: "none", background: "#1F5C99", color: "#ffffff", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 10px rgba(91,155,217,0.32)", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </>
        ) : (
          <>
            <button onClick={handleDelete} style={{ padding: "10px 24px", borderRadius: 9, border: "1px solid rgba(178,58,58,0.30)", background: "rgba(178,58,58,0.06)", color: "#B23A3A", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600 }}>
              Delete
            </button>
            <button onClick={enterEdit} style={{ padding: "10px 28px", borderRadius: 9, border: "none", background: "#1F5C99", color: "#ffffff", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 10px rgba(91,155,217,0.32)" }}>
              Edit Order
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}