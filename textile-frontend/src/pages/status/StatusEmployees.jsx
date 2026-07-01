import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { getG, statusColor, G } from "../../theme";
import API from "../../services/api";

// helper: normalise DB value (string / JSON-string / array) → array
const toArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(Boolean) : [v]; }
  catch { return [v]; }
};

const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  );
};

/**
 * Read-only Employee view.
 * Used by: super_admin (fully view-only) and admin (view-only for employees;
 * admin manages END USERS they personally added via a separate flow, but
 * approval/area-assignment authority always belongs to system_admin).
 *
 * Only system_admin gets the editable/assignable version — see
 * SystemAdminEmployees.jsx — per the rule:
 *   super_admin = readable/viewable
 *   system_admin = editable/assignable
 */
export default function StatusEmployees() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const role = localStorage.getItem("role") || "super_admin";

  const [filter, setFilter] = useState("all");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get("/employees", { params: filter !== "all" ? { status: filter } : {} });
      setEmployees(res.data);
    } catch (err) {
      setError("Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const td = { padding: "13px 16px", fontSize: 13.5, color: themeG.textMain };
  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 16px", borderBottom: "1px solid rgba(106,163,38,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(124,179,66,0.04)" };

  return (
    <Layout pageTitle="Employee Directory">

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["pending", "approved", "inactive", "all"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "8px 18px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textTransform: "capitalize", background: filter === f ? themeG.accent : themeG.card, color: filter === f ? themeG.card : themeG.textSub, borderColor: filter === f ? themeG.accent : themeG.border }}>
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
          {error}
        </div>
      )}

      <div style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(106,163,38,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Name", "Designation", "Districts", "Taluks", "Joined", "Status"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 30 }}>Loading…</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 30, color: themeG.textSub }}>No employees in this filter.</td></tr>
            ) : employees.map((e) => (
              <tr key={e.Id} style={{ borderBottom: "1px solid rgba(106,163,38,0.08)" }}>
                <td style={{ ...td, fontWeight: 600, color: themeG.accent, cursor: "pointer" }} onClick={() => setSelected(e)}>{e.Name}</td>
                <td style={td}>{e.Designation}</td>
                <td style={td}>
                  {toArr(e.District).length > 0
                    ? <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{toArr(e.District).map(d => <span key={d} style={areaPill}>{d}</span>)}</div>
                    : "—"}
                </td>
                <td style={td}>
                  {toArr(e.Taluk).length > 0
                    ? <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{toArr(e.Taluk).map(t => <span key={t} style={{ ...areaPill, background:"rgba(60,130,200,0.10)", color:"#1a5fa0", border:"1px solid rgba(60,130,200,0.22)" }}>{t}</span>)}</div>
                    : (e.AssignedArea || e.user?.AssignedArea || "—")}
                </td>
                <td style={td}>{e.JoinedAt?.substring(0, 10)}</td>
                <td style={td}><Badge text={e.Status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 14, fontSize: 13, color: themeG.textSub }}>
        Showing {employees.length} employee{employees.length !== 1 ? "s" : ""} ({filter}) · View only — approvals and area assignment are handled by System Admin.
      </p>

      {/* View-only detail panel — no edit / status actions */}
      {selected && (
        <div style={overlay} onClick={() => setSelected(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 18, margin: "0 0 16px", color: themeG.textMain }}>
              {selected.Name}
            </h3>
            {[
              ["Designation", selected.Designation],
              ["District(s)", toArr(selected.District).join(", ") || "—"],
              ["Taluk(s)", toArr(selected.Taluk).join(", ") || "—"],
              ["Assigned Area", selected.AssignedArea || selected.user?.AssignedArea || "—"],
              ["Joined", selected.JoinedAt?.substring(0, 10)],
              ["Linked Login", selected.user?.email ?? "—"],
              ["Status", selected.Status],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(106,163,38,0.08)" }}>
                <span style={{ fontSize: 13, color: themeG.textSub }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: themeG.textMain }}>{v}</span>
              </div>
            ))}
            <button onClick={() => setSelected(null)} style={{ marginTop: 18, width: "100%", padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
const overlay = { position: "fixed", inset: 0, background: "rgba(20,30,15,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modal = { background: "#ffffff", borderRadius: 16, padding: 28, width: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" };
const areaPill = { display: "inline-block", background: "rgba(106,163,38,0.12)", color: "#3d6b1f", border: "1px solid rgba(106,163,38,0.25)", borderRadius: 12, padding: "2px 9px", fontSize: 11.5, fontWeight: 600 };
