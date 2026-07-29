// src/pages/master/ComplianceDashboard.jsx
//
// Customer compliance status dashboard — the flow diagram's pink box
// between Goods Dispatch and Claim Process. Per customer: credit
// utilisation, overdue bills, open complaints, orders on hold, and an
// overall Good / Watch / Hold status.
import { useEffect, useState } from "react";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const STATUS_STYLE = {
  Good:  { bg: "rgba(46,122,114,0.12)", color: "#2E7A72", border: "rgba(46,122,114,0.30)" },
  Watch: { bg: "rgba(214,148,38,0.12)", color: "#8A5A0E", border: "rgba(214,148,38,0.30)" },
  Hold:  { bg: "rgba(178,58,58,0.10)",  color: "#96302F", border: "rgba(178,58,58,0.26)" },
};

export default function ComplianceDashboard() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const S = buildStyles(themeG);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/dashboard/compliance");
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load compliance dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = data?.customers?.filter((r) => filter === "all" || r.status === filter) ?? [];

  return (
    <Layout pageTitle="Compliance">
      <h1 style={S.heading}>Customer Compliance Status</h1>
      <p style={S.headingSub}>Credit utilisation, overdue bills, and open claims — at a glance, per customer.</p>

      {error && <div style={S.alertError}>{error}</div>}

      {data && (
        <div style={S.summaryRow}>
          {[
            ["Total customers", data.summary.total, themeG.textMain, "all"],
            ["Good standing", data.summary.good, "#2E7A72", "Good"],
            ["Watch", data.summary.watch, "#8A5A0E", "Watch"],
            ["On Hold", data.summary.hold, "#96302F", "Hold"],
          ].map(([label, value, color, filterVal]) => (
            <div key={label} style={S.summaryCard} onClick={() => setFilter(filterVal)}>
              <div style={S.summaryLabel}>{label}</div>
              <div style={{ ...S.summaryValue, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={S.card}>
        {loading ? (
          <p style={S.empty}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={S.empty}>No customers match this filter.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Customer</th>
                <th style={S.th}>Credit Limit</th>
                <th style={S.th}>Outstanding</th>
                <th style={S.th}>Utilisation</th>
                <th style={S.th}>Overdue Orders</th>
                <th style={S.th}>Open Complaints</th>
                <th style={S.th}>On Hold</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS_STYLE[r.status];
                return (
                  <tr key={r.customerId}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{r.name} <span style={{ color: themeG.textSub, fontWeight: 400 }}>({r.code})</span></td>
                    <td style={S.td}>₹{r.creditLimit.toLocaleString()}</td>
                    <td style={S.td}>₹{r.outstanding.toLocaleString()}</td>
                    <td style={S.td}>{r.utilisationPct === null ? "—" : `${r.utilisationPct}%`}</td>
                    <td style={S.td}>{r.overdueOrders} {r.overdueOrders > 0 && <span style={{ color: themeG.textSub, fontSize: 12 }}>(₹{r.overdueAmount.toLocaleString()})</span>}</td>
                    <td style={S.td}>{r.openComplaints}</td>
                    <td style={S.td}>{r.ordersOnHold}</td>
                    <td style={S.td}>
                      <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

function buildStyles(themeG) {
  return {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 18px" },
    summaryRow: { display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" },
    summaryCard: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 12, padding: "14px 20px", minWidth: 150, cursor: "pointer" },
    summaryLabel: { fontSize: 11, color: themeG.textSub, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 },
    summaryValue: { fontSize: 24, fontWeight: 700 },
    card: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 18px", borderBottom: `1px solid ${themeG.border}`, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
    td: { padding: "13px 18px", fontSize: 13.5, color: themeG.textMain, borderBottom: `1px solid ${themeG.border}` },
    empty: { padding: 50, textAlign: "center", fontSize: 14, color: themeG.textSub },
    alertError: { marginBottom: 18, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" },
  };
}
