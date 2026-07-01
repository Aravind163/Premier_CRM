import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";
import MultiSelect from "../../components/MultiSelect";

// helper: normalise DB value (string / JSON-string / array) → array
const toArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(Boolean) : [v]; }
  catch { return [v]; }
};

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  );
};

const actionBtn = (bg, color, border) => ({
  padding: "7px 14px", borderRadius: 8, border: `1px solid ${border}`, background: bg, color,
  cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
});

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: "#f6f9f0",
  border: "1px solid rgba(106,163,38,0.22)", borderRadius: 8,
  padding: "9px 12px", fontSize: 13, color: "#1a3d2b",
  fontFamily: "inherit", outline: "none",
};

const fieldWrap = { marginBottom: 14 };
const labelStyle = { display: "block", fontSize: 11, fontWeight: 600, color: "#5c6b4d", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 };

export default function StatusEndUsers() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);

  // Admin's own assigned districts (may be multiple).
  //
  // Login only ever stores the full `user` object in localStorage
  // (localStorage.setItem("user", JSON.stringify(res.data.user))) — it
  // never writes standalone "assignedArea" / "District" keys. Reading
  // those directly always returned "", which silently broke the Taluk
  // multi-select (it fell back to a plain text input). Pull District from
  // the stored user object instead — that's always fresh from the server,
  // including after a System Admin reassigns this admin's District(s).
  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  })();

  const myDistricts = (() => {
    const fromUser = toArr(storedUser?.District);
    if (fromUser.length > 0) return fromUser;

    // Legacy fallback, in case an older build did write these directly.
    const legacy = localStorage.getItem("assignedArea") || localStorage.getItem("District") || "";
    const fromLegacy = toArr(legacy);
    return fromLegacy.length > 0 ? fromLegacy : (legacy ? [legacy] : []);
  })();

  const [filter, setFilter] = useState("pending");
  const [endUsers, setEndUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);

  const [taluks, setTaluks] = useState([]);

  const [assignTarget, setAssignTarget] = useState(null);
  const [talukValues, setTalukValues] = useState([]);
  const [noteValue, setNoteValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newEndUser, setNewEndUser] = useState({ Name: "", JoinedAt: "", phone: "", dob: "" });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = { role: "end_user" };
      if (filter !== "all") params.status = filter;
      // Backend already scopes admin's results to their own district(s)
      const res = await API.get("/employees", { params });
      setEndUsers(res.data);
    } catch {
      setError("Failed to load end users.");
    } finally {
      setLoading(false);
    }
  };

  const loadTaluks = async () => {
    if (myDistricts.length === 0) return;
    try {
      const params = new URLSearchParams();
      myDistricts.forEach((d) => params.append("district[]", d));
      const res = await API.get(`/locations/taluks?${params.toString()}`);
      setTaluks(res.data);
    } catch { /* silently fall back */ }
  };

  useEffect(() => { load(); loadTaluks(); /* eslint-disable-next-line */ }, [filter]);

  const td = { padding: "13px 16px", fontSize: 13.5, color: themeG.textMain };
  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 16px", borderBottom: "1px solid rgba(106,163,38,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(124,179,66,0.04)" };

  const openAssign = (emp) => {
    setAssignTarget(emp);
    setTalukValues(toArr(emp.Taluk));
    setNoteValue("");
  };

  const approveWithTaluk = async () => {
    if (talukValues.length === 0) {
      setError("Please select at least one Taluk before approving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await API.patch(`/employees/${assignTarget.Id}/status`, {
        status: "approved",
        Taluk: talukValues,
        ApprovalNote: noteValue.trim() || null,
      });
      setAssignTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to approve end user.");
    } finally {
      setSaving(false);
    }
  };

  const saveTalukOnly = async () => {
    setSaving(true);
    setError("");
    try {
      await API.put(`/employees/${assignTarget.Id}`, {
        Taluk: talukValues,
        ApprovalNote: noteValue.trim() || null,
      });
      setAssignTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save taluk.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id, status) => {
    setActingId(id);
    setError("");
    try {
      await API.patch(`/employees/${id}/status`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update status.");
    } finally {
      setActingId(null);
    }
  };

  const handleAdd = async () => {
    setAddError("");
    if (!newEndUser.Name || !newEndUser.phone || !newEndUser.dob) {
      setAddError("Name, Phone, and Date of Birth are required.");
      return;
    }
    setAddLoading(true);
    try {
      await API.post("/employees", { ...newEndUser, Designation: "end_user" });
      setShowAdd(false);
      setNewEndUser({ Name: "", JoinedAt: "", phone: "", dob: "" });
      setFilter("pending");
      load();
    } catch (err) {
      setAddError(err.response?.data?.message || "Failed to add end user.");
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <Layout pageTitle="End User Management">

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        {["pending", "approved", "inactive", "all"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "8px 18px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textTransform: "capitalize", background: filter === f ? themeG.accent : themeG.card, color: filter === f ? themeG.card : themeG.textSub, borderColor: filter === f ? themeG.accent : themeG.border }}>
            {f}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(true)}
          style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: themeG.accent, color: themeG.card, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
          <PlusIcon /> Add End User
        </button>
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
              {["Name", "Phone", "Taluks", "Joined", "Status", "Actions"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 30 }}>Loading…</td></tr>
            ) : endUsers.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", padding: 30, color: themeG.textSub }}>No end users in this filter.</td></tr>
            ) : endUsers.map((e) => {
              const taluks = toArr(e.Taluk);
              return (
                <tr key={e.Id} style={{ borderBottom: "1px solid rgba(106,163,38,0.08)" }}>
                  <td style={{ ...td, fontWeight: 600, color: themeG.accent }}>{e.Name}</td>
                  <td style={td}>{e.user?.phone || "—"}</td>
                  <td style={td}>
                    {taluks.length > 0
                      ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{taluks.map(t => <span key={t} style={areaPill}>{t}</span>)}</div>
                      : <span style={{ color: "#a23528" }}>Not assigned</span>}
                  </td>
                  <td style={td}>{e.JoinedAt?.substring(0, 10)}</td>
                  <td style={td}><Badge text={e.Status} /></td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => openAssign(e)} style={actionBtn("rgba(60,130,200,0.10)", "#1a5fa0", "rgba(60,130,200,0.26)")}>
                        {taluks.length > 0 ? "Reassign Taluks" : "Assign Taluks & Approve"}
                      </button>
                      {e.Status !== "inactive" && (
                        <button disabled={actingId === e.Id} onClick={() => setStatus(e.Id, "inactive")} style={actionBtn("rgba(150,150,150,0.10)", "#5a5a5a", "rgba(150,150,150,0.26)")}>Deactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 14, fontSize: 13, color: themeG.textSub }}>
        Showing {endUsers.length} end user{endUsers.length !== 1 ? "s" : ""} ({filter})
        {myDistricts.length > 0 && ` · Districts: ${myDistricts.join(", ")}`}
      </p>

      {/* ── Assign Taluk(s) + Approve Modal ── */}
      {assignTarget && (
        <div style={overlay} onClick={() => setAssignTarget(null)}>
          <div style={{ ...modal, width: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 18, margin: "0 0 6px", color: themeG.textMain }}>
              {assignTarget.Name}
            </h3>
            <p style={{ fontSize: 12, color: themeG.textSub, margin: "0 0 18px" }}>
              District{myDistricts.length > 1 ? "s" : ""}: {myDistricts.join(", ") || "—"} · Phone: {assignTarget.user?.phone || "—"}
            </p>

            <div style={fieldWrap}>
              <label style={labelStyle}>Taluks * <span style={{ fontWeight: 400, textTransform: "none", color: themeG.textSub }}>(select one or more)</span></label>
              {taluks.length > 0 ? (
                <MultiSelect
                  value={talukValues}
                  options={taluks}
                  onChange={setTalukValues}
                  placeholder="Search taluks…"
                  emptyText="No taluks available."
                />
              ) : (
                <input type="text" value={talukValues[0] || ""} onChange={(ev) => setTalukValues([ev.target.value])}
                  placeholder="e.g. Madurai North" style={inputStyle} />
              )}
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Approval Note (optional)</label>
              <input type="text" value={noteValue} onChange={(ev) => setNoteValue(ev.target.value)}
                placeholder="Internal note" style={inputStyle} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              {assignTarget.Status !== "approved" && (
                <button onClick={approveWithTaluk} disabled={saving}
                  style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Approve + Assign"}
                </button>
              )}
              <button onClick={saveTalukOnly} disabled={saving}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600 }}>
                Save Taluks Only
              </button>
            </div>
            <button onClick={() => setAssignTarget(null)}
              style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 9, border: "none", background: "transparent", color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Add End User Modal ── */}
      {showAdd && (
        <div style={overlay} onClick={() => setShowAdd(false)}>
          <div style={{ ...modal, width: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 18, margin: "0 0 18px", color: themeG.textMain }}>
              Add New End User
            </h3>
            <p style={{ fontSize: 12, color: themeG.textSub, margin: "0 0 16px", background: "rgba(124,179,66,0.07)", borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(124,179,66,0.18)" }}>
              This end user will automatically belong to your district{myDistricts.length > 1 ? "s" : ""}
              (<strong>{myDistricts.join(", ") || "—"}</strong>). Assign their Taluk(s) after
              adding them, in the approval step. Login: phone + dob (ddmmyy).
            </p>

            {addError && (
              <div style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12, color: "#a23528" }}>
                {addError}
              </div>
            )}

            {[
              ["Name", "Name *", "text"],
              ["JoinedAt", "Joined Date", "date"],
              ["phone", "Phone Number *", "text"],
              ["dob", "Date of Birth (ddmmyy) *", "text"],
            ].map(([key, label, type]) => (
              <div key={key} style={fieldWrap}>
                <label style={labelStyle}>{label}</label>
                <input
                  type={type}
                  placeholder={key === "dob" ? "e.g. 150190" : ""}
                  value={newEndUser[key]}
                  onChange={(ev) => setNewEndUser({ ...newEndUser, [key]: ev.target.value })}
                  style={inputStyle}
                />
              </div>
            ))}

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={handleAdd} disabled={addLoading}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: addLoading ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, opacity: addLoading ? 0.6 : 1 }}>
                {addLoading ? "Adding…" : "Add End User"}
              </button>
              <button onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
const overlay = { position: "fixed", inset: 0, background: "rgba(20,30,15,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modal = { background: "#ffffff", borderRadius: 16, padding: 28, width: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto" };
const areaPill = { display: "inline-block", background: "rgba(106,163,38,0.12)", color: "#3d6b1f", border: "1px solid rgba(106,163,38,0.25)", borderRadius: 12, padding: "2px 10px", fontSize: 11.5, fontWeight: 600 };