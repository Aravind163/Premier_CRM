import { useTheme } from "../../ThemeContext";
import { useState, useEffect, Fragment } from "react";
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

export default function AllocationSystemAdmin({ embedded = false }) {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const Wrapper = embedded ? Fragment : Layout;
  const wrapperProps = embedded ? {} : { pageTitle: "Employee Allocation" };

  // Which record type System Admin is currently managing. System Admin is
  // the only role that manages BOTH Admins and End Users:
  //   - "admin"    → District only (Taluk is never assignable here)
  //   - "end_user" → both District and Taluk are assignable
  const [manageRole, setManageRole] = useState("admin");

  const [filter, setFilter] = useState("approved");
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);

  const [districts, setDistricts] = useState([]);

  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ Name: "", Districts: [], Taluks: [], JoinedAt: "", phone: "", dob: "" });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addAvailableTaluks, setAddAvailableTaluks] = useState([]);

  // Assign District + Taluk modal.
  // For "admin" → only District is shown/sent (System Admin never assigns
  // a Taluk to an Admin — that's an end_user-only concept).
  // For "end_user" → both District and Taluk are shown/sent.
  const [assignTarget, setAssignTarget] = useState(null);
  const [districtValues, setDistrictValues] = useState([]);
  const [talukValues, setTalukValues] = useState([]);
  const [availableTaluks, setAvailableTaluks] = useState([]);
  const [noteValue, setNoteValue] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = { role: manageRole };
      if (filter !== "all") params.status = filter;
      const res = await API.get("/employees", { params });
      setAdmins(res.data);
    } catch {
      setError(`Failed to load ${manageRole === "admin" ? "admins" : "end users"}.`);
    } finally {
      setLoading(false);
    }
  };

  const loadDistricts = async () => {
    try {
      const res = await API.get("/locations/districts");
      setDistricts(res.data);
    } catch { /* silently ignore */ }
  };

  const loadTaluks = async (dists) => {
    if (!dists || dists.length === 0) { setAvailableTaluks([]); return; }
    try {
      const params = new URLSearchParams();
      dists.forEach((d) => params.append("district[]", d));
      const res = await API.get(`/locations/taluks?${params.toString()}`);
      setAvailableTaluks(res.data);
    } catch { setAvailableTaluks([]); }
  };

  useEffect(() => { load(); loadDistricts(); /* eslint-disable-next-line */ }, [filter, manageRole]);
  useEffect(() => { loadTaluks(districtValues); }, [districtValues]);

  // Taluk options for the "Add New" modal, scoped to whatever Districts
  // have been picked so far — only relevant when adding an End User.
  useEffect(() => {
    if (manageRole !== "end_user") { setAddAvailableTaluks([]); return; }
    if (!newAdmin.Districts || newAdmin.Districts.length === 0) { setAddAvailableTaluks([]); return; }
    (async () => {
      try {
        const params = new URLSearchParams();
        newAdmin.Districts.forEach((d) => params.append("district[]", d));
        const res = await API.get(`/locations/taluks?${params.toString()}`);
        setAddAvailableTaluks(res.data);
      } catch { setAddAvailableTaluks([]); }
    })();
    /* eslint-disable-next-line */
  }, [newAdmin.Districts, manageRole]);

  // Switching tabs: close any open modals / clear stale selections so an
  // Admin's District-only assignment can't bleed into End User mode (or
  // vice versa).
  const switchManageRole = (role) => {
    setManageRole(role);
    setFilter("approved");
    setAssignTarget(null);
    setSelected(null);
    setShowAdd(false);
    setNewAdmin({ Name: "", Districts: [], Taluks: [], JoinedAt: "", phone: "", dob: "" });
    setError("");
  };

  const td = { padding: "13px 16px", fontSize: 13.5, color: themeG.textMain };
  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 16px", borderBottom: "1px solid rgba(106,163,38,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(124,179,66,0.04)" };

  const openAssign = (emp) => {
    setAssignTarget(emp);
    setDistrictValues(toArr(emp.District));
    // Admins never carry a Taluk — only District applies to them.
    setTalukValues(manageRole === "end_user" ? toArr(emp.Taluk) : []);
    setNoteValue("");
  };

  const approveWithDistrict = async () => {
    if (districtValues.length === 0) {
      setError("Please select at least one District before approving.");
      return;
    }
    if (manageRole === "end_user" && talukValues.length === 0) {
      setError("Please select at least one Taluk before approving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await API.patch(`/employees/${assignTarget.Id}/status`, {
        status: "approved",
        District: districtValues,
        Taluk: manageRole === "end_user" && talukValues.length > 0 ? talukValues : undefined,
        ApprovalNote: noteValue.trim() || null,
      });
      setAssignTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to approve ${manageRole === "admin" ? "admin" : "end user"}.`);
    } finally {
      setSaving(false);
    }
  };

  const saveAreaOnly = async () => {
    setSaving(true);
    setError("");
    try {
      await API.put(`/employees/${assignTarget.Id}`, {
        District: districtValues,
        ...(manageRole === "end_user" ? { Taluk: talukValues.length > 0 ? talukValues : [] } : {}),
        ApprovalNote: noteValue.trim() || null,
      });
      setAssignTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save.");
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

  const openEdit = (e) => {
    setSelected(e);
    setEditData({ Name: e.Name, JoinedAt: e.JoinedAt?.substring(0, 10) || "", Status: e.Status });
    setEditMode(false);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await API.put(`/employees/${selected.Id}`, editData);
      setSelected(null);
      setEditMode(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    setAddError("");
    if (!newAdmin.Name || !newAdmin.phone || !newAdmin.dob) {
      setAddError("Name, Phone, and Date of Birth are required.");
      return;
    }
    setAddLoading(true);
    try {
      await API.post("/employees", {
        ...newAdmin,
        District: newAdmin.Districts,
        Taluk: manageRole === "end_user" ? newAdmin.Taluks : undefined,
        Designation: manageRole,
      });
      setShowAdd(false);
      setNewAdmin({ Name: "", Districts: [], Taluks: [], JoinedAt: "", phone: "", dob: "" });
      setFilter("pending");
      load();
    } catch (err) {
      setAddError(err.response?.data?.message || `Failed to add ${manageRole === "admin" ? "admin" : "end user"}.`);
    } finally {
      setAddLoading(false);
    }
  };

  const isAdminMode = manageRole === "admin";

  return (
    <Wrapper {...wrapperProps}>

      

      {/* ── Admins / End Users tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[["admin", "Admins"], ["end_user", "End Users"]].map(([role, label]) => (
          <button key={role} onClick={() => switchManageRole(role)}
            style={{
              padding: "9px 20px", borderRadius: 10, border: "1.5px solid",
              cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
              background: manageRole === role ? themeG.accent : "transparent",
              color: manageRole === role ? themeG.card : themeG.textSub,
              borderColor: manageRole === role ? themeG.accent : themeG.border,
            }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {["pending", "approved", "inactive", "all"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "8px 18px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textTransform: "capitalize", background: filter === f ? themeG.accent : themeG.card, color: filter === f ? themeG.card : themeG.textSub, borderColor: filter === f ? themeG.accent : themeG.border }}>
            {f}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(true)}
          style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: themeG.accent, color: themeG.card, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
          <PlusIcon /> {isAdminMode ? "Add Admin" : "Add End User"}
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
              {(isAdminMode
                ? ["Name", "Phone", "Districts", "Joined", "Status", "Actions"]
                : ["Name", "Phone", "Districts", "Taluks", "Joined", "Status", "Actions"]
              ).map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdminMode ? 6 : 7} style={{ ...td, textAlign: "center", padding: 30 }}>Loading…</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={isAdminMode ? 6 : 7} style={{ ...td, textAlign: "center", padding: 30, color: themeG.textSub }}>No {isAdminMode ? "admins" : "end users"} in this filter.</td></tr>
            ) : admins.map((e) => {
              const dists = toArr(e.District);
              const taluks = toArr(e.Taluk);
              return (
                <tr key={e.Id} style={{ borderBottom: "1px solid rgba(106,163,38,0.08)" }}>
                  <td style={{ ...td, fontWeight: 600, color: themeG.accent, cursor: "pointer" }} onClick={() => openEdit(e)}>{e.Name}</td>
                  <td style={td}>{e.user?.phone || "—"}</td>
                  <td style={td}>
                    {dists.length > 0
                      ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{dists.map(d => <span key={d} style={areaPill}>{d}</span>)}</div>
                      : <span style={{ color: "#a23528" }}>Not assigned</span>}
                  </td>
                  {!isAdminMode && (
                    <td style={td}>
                      {taluks.length > 0
                        ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{taluks.map(t => <span key={t} style={{ ...areaPill, background: "rgba(60,130,200,0.10)", color: "#1a5fa0", border: "1px solid rgba(60,130,200,0.22)" }}>{t}</span>)}</div>
                        : <span style={{ color: themeG.textSub, fontSize: 12 }}>—</span>}
                    </td>
                  )}
                  <td style={td}>{e.JoinedAt?.substring(0, 10)}</td>
                  <td style={td}><Badge text={e.Status} /></td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => openAssign(e)} style={actionBtn("rgba(60,130,200,0.10)", "#1a5fa0", "rgba(60,130,200,0.26)")}>
                        {isAdminMode
                          ? (dists.length > 0 ? "Reassign District(s)" : "Assign District(s) & Approve")
                          : (dists.length > 0 || taluks.length > 0 ? "Reassign Area" : "Assign Area & Approve")}
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
        Showing {admins.length} {isAdminMode ? "admin" : "end user"}{admins.length !== 1 ? "s" : ""} ({filter})
      </p>

      {/* ── Assign District(s) + Taluk(s) + Approve Modal ── */}
      {assignTarget && (
        <div style={overlay} onClick={() => setAssignTarget(null)}>
          <div style={{ ...modal, width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 18, margin: "0 0 6px", color: themeG.textMain }}>
              {assignTarget.Name}
            </h3>
            <p style={{ fontSize: 12, color: themeG.textSub, margin: "0 0 18px" }}>
              Phone: {assignTarget.user?.phone || "—"}
            </p>

            <div style={fieldWrap}>
              <label style={labelStyle}>Districts * <span style={{ fontWeight: 400, textTransform: "none", color: themeG.textSub }}>(select one or more)</span></label>
              <MultiSelect
                value={districtValues}
                options={districts}
                onChange={setDistrictValues}
                placeholder="Search districts…"
                emptyText="No districts loaded."
              />
            </div>

            {!isAdminMode && districtValues.length > 0 && (
              <div style={fieldWrap}>
                <label style={labelStyle}>Taluks * <span style={{ fontWeight: 400, textTransform: "none", color: themeG.textSub }}>(select one or more)</span></label>
                <MultiSelect
                  value={talukValues}
                  options={availableTaluks}
                  onChange={setTalukValues}
                  placeholder="Search taluks…"
                  emptyText="Loading taluks…"
                />
              </div>
            )}

            <div style={fieldWrap}>
              <label style={labelStyle}>Approval Note (optional)</label>
              <input type="text" value={noteValue} onChange={(ev) => setNoteValue(ev.target.value)}
                placeholder="Internal note" style={inputStyle} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              {assignTarget.Status !== "approved" && (
                <button onClick={approveWithDistrict} disabled={saving}
                  style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Approve + Assign"}
                </button>
              )}
              <button onClick={saveAreaOnly} disabled={saving}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600 }}>
                Save Area Only
              </button>
            </div>
            <button onClick={() => setAssignTarget(null)}
              style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 9, border: "none", background: "transparent", color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {selected && (
        <div style={overlay} onClick={() => { setSelected(null); setEditMode(false); }}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 18, margin: 0, color: themeG.textMain }}>
                {editMode ? (isAdminMode ? "Edit Admin" : "Edit End User") : selected.Name}
              </h3>
              <button onClick={() => setEditMode(!editMode)}
                style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${themeG.border}`, background: editMode ? "rgba(200,160,40,0.10)" : "rgba(124,179,66,0.10)", color: editMode ? "#8a6510" : themeG.accent, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                {editMode ? "Cancel Edit" : "Edit"}
              </button>
            </div>

            {editMode ? (
              <>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Name</label>
                  <input type="text" value={editData.Name || ""} onChange={(ev) => setEditData({ ...editData, Name: ev.target.value })} style={inputStyle} />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Joined Date</label>
                  <input type="date" value={editData.JoinedAt || ""} onChange={(ev) => setEditData({ ...editData, JoinedAt: ev.target.value })} style={inputStyle} />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Status</label>
                  <select value={editData.Status} onChange={(ev) => setEditData({ ...editData, Status: ev.target.value })} style={inputStyle}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <button onClick={saveEdit} disabled={saving}
                    style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button onClick={() => { setSelected(null); setEditMode(false); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {[
                  ["Districts", toArr(selected.District).join(", ") || "Not assigned"],
                  ...(isAdminMode ? [] : [["Taluks", toArr(selected.Taluk).join(", ") || "—"]]),
                  ["Joined", selected.JoinedAt?.substring(0, 10)],
                  ["Phone", selected.user?.phone ?? "—"],
                  ["Status", selected.Status],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(106,163,38,0.08)" }}>
                    <span style={{ fontSize: 13, color: themeG.textSub }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: themeG.textMain, textAlign: "right", maxWidth: "60%" }}>{v}</span>
                  </div>
                ))}
                <button onClick={() => { setSelected(null); setEditMode(false); }}
                  style={{ marginTop: 18, width: "100%", padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Add Admin Modal ── */}
      {showAdd && (
        <div style={overlay} onClick={() => setShowAdd(false)}>
          <div style={{ ...modal, width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 18, margin: "0 0 18px", color: themeG.textMain }}>
              {isAdminMode ? "Add New Admin" : "Add New End User"}
            </h3>
            <p style={{ fontSize: 12, color: themeG.textSub, margin: "0 0 16px", background: "rgba(124,179,66,0.07)", borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(124,179,66,0.18)" }}>
              Login: phone number + date of birth (ddmmyy). You can assign {isAdminMode ? "District(s)" : "District(s) and Taluk(s)"} now or during the approval step.
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
                  value={newAdmin[key] ?? ""}
                  onChange={(ev) => setNewAdmin({ ...newAdmin, [key]: ev.target.value })}
                  style={inputStyle}
                />
              </div>
            ))}

            <div style={fieldWrap}>
              <label style={labelStyle}>Districts <span style={{ fontWeight: 400, textTransform: "none", color: themeG.textSub }}>(optional — assign later)</span></label>
              <MultiSelect
                value={newAdmin.Districts}
                options={districts}
                onChange={(v) => setNewAdmin({ ...newAdmin, Districts: v, Taluks: [] })}
                placeholder="Search districts…"
                emptyText="No districts loaded."
              />
            </div>

            {!isAdminMode && newAdmin.Districts.length > 0 && (
              <div style={fieldWrap}>
                <label style={labelStyle}>Taluks <span style={{ fontWeight: 400, textTransform: "none", color: themeG.textSub }}>(optional — assign later)</span></label>
                <MultiSelect
                  value={newAdmin.Taluks}
                  options={addAvailableTaluks}
                  onChange={(v) => setNewAdmin({ ...newAdmin, Taluks: v })}
                  placeholder="Search taluks…"
                  emptyText="Loading taluks…"
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={handleAdd} disabled={addLoading}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: addLoading ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, opacity: addLoading ? 0.6 : 1 }}>
                {addLoading ? "Adding…" : (isAdminMode ? "Add Admin" : "Add End User")}
              </button>
              <button onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Wrapper>
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