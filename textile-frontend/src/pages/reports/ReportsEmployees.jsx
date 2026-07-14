import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function BarRow({ label, count, max, color, themeG }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: themeG.textMain, textTransform: "capitalize", fontWeight: 500, fontFamily: FONT }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: FONT }}>{count}</span>
      </div>
      <div style={{ height: 10, borderRadius: 6, background: "rgba(46,122,114,0.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default function ReportsEmployees() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const card = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 22, boxShadow: "0 4px 16px rgba(46,122,114,0.05)" };
  const cardTitle = { fontFamily: FONT, fontSize: 15, fontWeight: 600, margin: "0 0 16px", color: themeG.textMain };
  const statCard = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 4px 16px rgba(46,122,114,0.05)" };

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/employees");
        setEmployees(res.data);
      } catch (err) {
        setError("Failed to load employee report data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Layout pageTitle="Employee Reports">
        <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading report…</p>
      </Layout>
    );
  }

  const statusCounts = employees.reduce((acc, e) => { acc[e.Status] = (acc[e.Status] || 0) + 1; return acc; }, {});
  const maxStatus = Math.max(...Object.values(statusCounts), 1);

  const districtCounts = employees.reduce((acc, e) => { acc[e.District] = (acc[e.District] || 0) + 1; return acc; }, {});
  const maxDistrict = Math.max(...Object.values(districtCounts), 1);

  const designationCounts = employees.reduce((acc, e) => { acc[e.Designation] = (acc[e.Designation] || 0) + 1; return acc; }, {});
  const maxDesignation = Math.max(...Object.values(designationCounts), 1);

  return (
    <Layout pageTitle="Employee Reports">

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A", fontFamily: FONT }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Employees",   value: employees.length,            accent: "#2E7A72" },
          { label: "Approved",          value: statusCounts.approved || 0,  accent: themeG.accent },
          { label: "Pending Approval",  value: statusCounts.pending  || 0,  accent: "#8A5A0E" },
        ].map((c) => (
          <div key={c.label} style={statCard}>
            <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: c.accent, fontFamily: "'Space Grotesk', " + FONT }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <h3 style={cardTitle}>By Status</h3>
          {Object.entries(statusCounts).map(([s, count]) => (
            <BarRow key={s} label={s} count={count} max={maxStatus} color={statusColor(s).color} themeG={themeG} />
          ))}
        </div>
        <div style={card}>
          <h3 style={cardTitle}>By District</h3>
          {Object.entries(districtCounts).map(([d, count]) => (
            <BarRow key={d} label={d} count={count} max={maxDistrict} color="#5B9BD9" themeG={themeG} />
          ))}
        </div>
      </div>

      <div style={card}>
        <h3 style={cardTitle}>By Designation</h3>
        {Object.entries(designationCounts).map(([d, count]) => (
          <BarRow key={d} label={d} count={count} max={maxDesignation} color="#5B9BD9" themeG={themeG} />
        ))}
      </div>
    </Layout>
  );
}