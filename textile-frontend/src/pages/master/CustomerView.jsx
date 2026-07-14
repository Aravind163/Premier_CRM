import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { getG, statusColor, G } from "../../theme";
import API from "../../services/api";

const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");

let tG = getThemeColors();

const DISTRICTS = ["Coimbatore","Tiruppur","Erode","Salem","Namakkal","Karur","Dharmapuri","Krishnagiri"];
const TALUKS = {
  Coimbatore: ["Coimbatore North","Coimbatore South","Sulur","Mettupalayam","Pollachi","Valparai"],
  Tiruppur:   ["Tiruppur","Palladam","Kangeyam","Dharapuram","Udumalaipettai"],
  Erode:      ["Erode","Bhavani","Gobichettipalayam","Perundurai","Sathyamangalam"],
  Salem:      ["Salem","Attur","Omalur","Mettur","Yercaud"],
  Namakkal:   ["Namakkal","Rasipuram","Tiruchengode","Paramathi-Velur"],
  Karur:      ["Karur","Krishnarayapuram","Kulithalai","Manmangalam"],
  Dharmapuri: ["Dharmapuri","Harur","Palacode","Pappireddipatti"],
  Krishnagiri:["Krishnagiri","Hosur","Denkanikottai","Pochampalli"],
};

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

const Badge = ({ text }) => {
  const tG = getThemeColors();
  const s = statusColor(text);
  return (
    <span style={{ ...s, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${s.border}` }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  );
};

export default function CustomerView() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const card = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 24, boxShadow: "0 4px 16px rgba(46,122,114,0.05)" };
  const cardTitle = { fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 16, fontWeight: 600, margin: "0 0 20px", color: themeG.textMain };

  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const editMode = searchParams.get("edit") === "1";

  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get(`/customers/${id}`);
        setCustomer(res.data);
        setForm({
          name: res.data.Name,
          phone: res.data.Phone,
          email: res.data.Email || "",
          type: res.data.Type,
          district: res.data.District,
          taluk: res.data.Taluk,
          address: res.data.Address || "",
          creditLimit: res.data.CreditLimit || "",
          outstanding: res.data.Outstanding || 0,
          status: res.data.Status,
          notes: res.data.Notes || "",
        });
      } catch (err) {
        setError("Failed to load customer.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const taluks = form ? (TALUKS[form.district] || []) : [];

  const enterEdit = () => setSearchParams({ edit: "1" });
  const cancelEdit = () => setSearchParams({});

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await API.put(`/customers/${id}`, form);
      setCustomer(res.data);
      setSearchParams({});
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update customer.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete customer ${customer.Code}? This cannot be undone.`)) return;
    try {
      await API.delete(`/customers/${id}`);
      navigate("/master/customers");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete customer.");
    }
  };

  if (loading) {
    return (
      <Layout pageTitle="Customer">
        <p style={{ color: themeG.textSub }}>Loading customer…</p>
      </Layout>
    );
  }

  if (!customer) {
    return (
      <Layout pageTitle="Customer">
        <p style={{ color: "#B23A3A" }}>{error || "Customer not found."}</p>
        <button onClick={() => navigate("/master/customers")} style={{ marginTop: 12, padding: "9px 20px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, cursor: "pointer", fontFamily: "inherit" }}>
          Back to Customers
        </button>
      </Layout>
    );
  }

  return (
    <Layout pageTitle={`${editMode ? "Edit Customer" : "Customer Details"} · ${customer.Name}`}>

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        <div style={card}>
          <h3 style={cardTitle}>Personal Details</h3>

          {editMode ? (
            <>
              <Field label="Full Name">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Phone Number">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Customer Type">
                <div style={{ display: "flex", gap: 8 }}>
                  {["retail","wholesale"].map((t) => (
                    <button key={t} onClick={() => set("type", t)}
                      style={{ flex: 1, padding: "9px", borderRadius: 9, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: form.type === t ? "rgba(91,155,217,0.15)" : "#ffffff", color: form.type === t ? "#1F5C99" : "#526073", borderColor: form.type === t ? "#1F5C99" : "rgba(15,33,56,0.18)" }}>
                      {t === "retail" ? "🏪 Retail" : "🏭 Wholesale"}
                    </button>
                  ))}
                </div>
              </Field>
              {form.type === "wholesale" && (
                <Field label="Credit Limit (₹)">
                  <Input type="number" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
                </Field>
              )}
              <Field label="Outstanding Balance (₹)">
                <Input type="number" value={form.outstanding} onChange={(e) => set("outstanding", e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="declined">Declined</option>
                </Select>
              </Field>
            </>
          ) : (
            <>
              <ReadRow label="Code" value={customer.Code} />
              <ReadRow label="Name" value={customer.Name} />
              <ReadRow label="Phone" value={customer.Phone} />
              <ReadRow label="Email" value={customer.Email} />
              <ReadRow label="Type" value={customer.Type} />
              <ReadRow label="Credit Limit" value={customer.CreditLimit ? `₹${parseFloat(customer.CreditLimit).toLocaleString()}` : "—"} />
              <ReadRow label="Outstanding" value={`₹${parseFloat(customer.Outstanding || 0).toLocaleString()}`} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                <span style={{ fontSize: 13, color: "#526073" }}>Status</span>
                <Badge text={customer.Status} />
              </div>
            </>
          )}
        </div>

        <div style={card}>
          <h3 style={cardTitle}>Location Details</h3>

          {editMode ? (
            <>
              <Field label="District">
                <Select value={form.district} onChange={(e) => { set("district", e.target.value); set("taluk", ""); }}>
                  <option value="">Select district…</option>
                  {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                </Select>
              </Field>
              <Field label="Taluk">
                <Select value={form.taluk} onChange={(e) => set("taluk", e.target.value)} disabled={!form.district}>
                  <option value="">Select taluk…</option>
                  {taluks.map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Address">
                <textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={3}
                  style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#ffffff", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </Field>
              <Field label="Notes">
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3}
                  style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#ffffff", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </Field>
            </>
          ) : (
            <>
              <ReadRow label="District" value={customer.District} />
              <ReadRow label="Taluk" value={customer.Taluk} />
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 12, color: "#101B28", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Address</p>
                <p style={{ fontSize: 13, color: "#0F2138", margin: "0 0 16px" }}>{customer.Address || "—"}</p>
                <p style={{ fontSize: 12, color: "#101B28", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Notes</p>
                <p style={{ fontSize: 13, color: "#0F2138", margin: 0 }}>{customer.Notes || "—"}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
        <button onClick={() => navigate("/master/customers")} style={{ padding: "10px 24px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, background: "#ffffff", color: "#526073", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
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
              Edit Customer
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}