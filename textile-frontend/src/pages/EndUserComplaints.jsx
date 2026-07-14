// src/pages/EndUserComplaints.jsx
//
// Read-only view of complaints raised by customers within the end_user's
// assigned area (Taluk). GET /complaints is already scoped server-side —
// end_user sees only complaints tied to customers in their own Taluk(s).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EndUserLayout from "../components/EndUserLayout";
import { useTheme } from "../ThemeContext";
import { getG, statusColor } from "../theme";
import API from "../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {text || "—"}
    </span>
  );
};

export default function EndUserComplaints() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "end_user") { navigate("/login"); return; }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/complaints");
        setComplaints(res.data);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load complaints.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const S = {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 22px" },
    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 18px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    td: { padding: "13px 18px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}`, verticalAlign: "top" },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
  };

  return (
    <EndUserLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 style={S.heading}>Complaints</h1>
      <p style={S.headingSub}>Complaints raised by customers in your assigned area — view only.</p>

      {error && (
        <div style={{ marginBottom: 20, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}

      <div style={S.card}>
        {loading ? (
          <p style={S.empty}>Loading…</p>
        ) : complaints.length === 0 ? (
          <p style={S.empty}>No complaints raised in your area yet.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Order</th>
                <th style={S.th}>Customer</th>
                <th style={S.th}>Type</th>
                <th style={S.th}>Description</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr key={c.Id}>
                  <td style={S.td}>{c.order?.Code ?? "—"}</td>
                  <td style={S.td}>{c.customer?.Name ?? "—"}</td>
                  <td style={S.td}>{c.Type}</td>
                  <td style={S.td}>{c.Description}</td>
                  <td style={S.td}><Badge text={c.Status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </EndUserLayout>
  );
}