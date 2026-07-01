import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { getG, statusColor, G } from "../../theme";
import API from "../../services/api";

const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");


/* Row color by customer type */
const typeColors = {
  wholesale: { bg: "rgba(186,225,255,0.22)", dot: "#3a9bd5", border: "rgba(80,160,230,0.20)" },
  retail:    { bg: "rgba(200,240,200,0.22)", dot: "#2e9e50", border: "rgba(60,180,90,0.18)" },
};

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ ...s, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${s.border}` }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  );
};

const TypeBadge = ({ type }) => {
  const tc = typeColors[type] || typeColors.retail;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: tc.dot, background: `${tc.border}`, border: `1px solid ${tc.border}`, padding: "2px 10px", borderRadius: 20 }}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
};

export default function CustomerList() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);

  const navigate = useNavigate();
  const [search,      setSearch]      = useState("");
  const [filterType,  setFilterType]  = useState("All");
  const [filterStatus,setFilterStatus]= useState("All");
  const [customers, setCustomers]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  useEffect(() => {
    (async () => {
      try {

        const res = await API.get("/customers");
        const mapped = res.data.map((c) => ({
          id: c.Code,
          dbId: c.Id,
          name: c.Name,
          phone: c.Phone,
          district: c.District,
          taluk: c.Taluk,
          type: c.Type,
          status: c.Status,
          orders: c.orders_count ?? 0,
          balance: parseFloat(c.Outstanding) || 0,
        }));
        setCustomers(mapped);
      } catch (err) {
        setError("Failed to load customers.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = customers.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchType   = filterType   === "All" || c.type   === filterType.toLowerCase();
    const matchStatus = filterStatus === "All" || c.status === filterStatus.toLowerCase();
    return matchSearch && matchType && matchStatus;
  });

  if (loading) {


    return (
      <Layout pageTitle="Customers">
        <p style={{ color: themeG.textSub }}>Loading customers…</p>
      </Layout>
    );
  }

  return (
    <Layout pageTitle="Customers">

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
          {error}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search name, ID or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, width: 260, fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", background: themeG.card, outline: "none", color: themeG.textMain }}
        />
        <FilterPills label="Type"   values={["All","Wholesale","Retail"]}                           active={filterType}   onSelect={setFilterType} />
        <FilterPills label="Status" values={["All","Approved","Pending","Declined"]}                active={filterStatus} onSelect={setFilterStatus} />
        <button
          onClick={() => navigate("/master/customers/add")}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 9, background: themeG.accent, color: themeG.card, border: "none", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 10px rgba(124,179,66,0.32)" }}
        >
          + Add Customer
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <div style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(106,163,38,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${themeG.border}` }}>
              {["ID", "Customer Name", "Phone", "District", "Taluk", "Type", "Orders", "Balance (₹)", "Status", "Actions"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 13px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(124,179,66,0.04)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: themeG.textSub, fontSize: 14 }}>No customers found.</td></tr>
            ) : filtered.map((c) => {
              const rc = typeColors[c.type] || typeColors.retail;
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(106,163,38,0.06)", background: rc.bg }}>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.accent, fontWeight: 600, borderLeft: `3px solid ${rc.dot}` }}>{c.id}</td>
                  <td style={{ padding: "12px 13px", fontSize: 14, color: themeG.textMain, fontWeight: 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${rc.dot}22`, border: `1.5px solid ${rc.dot}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: rc.dot, flexShrink: 0 }}>
                        {c.name[0]}
                      </div>
                      {c.name}
                    </div>
                  </td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textSub }}>{c.phone}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textMain }}>{c.district}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textSub }}>{c.taluk}</td>
                  <td style={{ padding: "12px 13px" }}><TypeBadge type={c.type} /></td>
                  <td style={{ padding: "12px 13px", fontSize: 13, fontWeight: 600, color: themeG.textMain }}>{c.orders}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, fontWeight: 700, color: c.balance > 0 ? "#c0392b" : themeG.textSub }}>
                    {c.balance > 0 ? `₹${c.balance.toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "12px 13px" }}><Badge text={c.status} /></td>
                  <td style={{ padding: "12px 13px" }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button style={btnStyle("#3a9bd5")} onClick={() => navigate(`/master/customers/${c.dbId}`)}>👁️</button>
                      <button style={btnStyle(themeG.accent)} onClick={() => navigate(`/master/customers/${c.dbId}?edit=1`)}>✏️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "10px 13px", borderTop: `1px solid ${themeG.border}`, fontSize: 12, color: themeG.textSub }}>
          Showing {filtered.length} of {customers.length} customers
        </div>
      </div>
    </Layout>
  );
}

function FilterPills({ values, active, onSelect }) {
  const themeG = getThemeColors();
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {values.map((v) => (
        <button
          key={v}
          onClick={() => onSelect(v)}
          style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500, transition: "all 0.12s", background: active === v ? "rgba(124,179,66,0.14)" : "transparent", color: active === v ? "#3d6b1f" : "#4a7a5a", borderColor: active === v ? "rgba(124,179,66,0.40)" : "rgba(27,77,46,0.18)" }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
;
const btnStyle = (color) => ({ padding: "5px 13px", borderRadius: 7, border: `1px solid ${color}40`, background: `${color}14`, color, cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 });