import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { getG, G } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");


function BarRow({ label, count, max, color }) {
  const themeG = getThemeColors();
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#1a3d2b", textTransform: "capitalize", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{count}</span>
      </div>
      <div style={{ height: 10, borderRadius: 6, background: "rgba(106,163,38,0.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

const LOW_STOCK_THRESHOLD = 50;

export default function ReportsProducts() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const tab = localStorage.getItem("premier_category") || "cloth";

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const card = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 22, boxShadow: "0 4px 16px rgba(106,163,38,0.05)" };
  const cardTitle = { fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 15, fontWeight: 600, margin: "0 0 16px", color: themeG.textMain };
  const statCard = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 4px 16px rgba(106,163,38,0.05)" };
  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 12px", borderBottom: "1px solid rgba(106,163,38,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 };
  const td = { padding: "11px 12px", fontSize: 13.5, color: themeG.textMain };

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/products");
        setAllProducts(res.data);
      } catch (err) {
        setError("Failed to load product report data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const products = allProducts.filter((p) => p.Category === tab);

  if (loading) {
    return (
      <Layout pageTitle="Product Reports">
        <p style={{ color: themeG.textSub }}>Loading report…</p>
      </Layout>
    );
  }

  const totalQty = products.reduce((s, p) => s + (parseInt(p.Quantity) || 0), 0);
  const totalValue = products.reduce((s, p) => s + (parseFloat(p.Price) || 0) * (parseInt(p.Quantity) || 0), 0);
  const lowStock = products.filter((p) => p.Quantity <= LOW_STOCK_THRESHOLD);
  const inactiveCount = products.filter((p) => p.Status === "inactive").length;

  const subTypeCounts = products.reduce((acc, p) => {
    acc[p.SubType] = (acc[p.SubType] || 0) + 1;
    return acc;
  }, {});
  const maxSubType = Math.max(...Object.values(subTypeCounts), 1);
  const qualityCounts = products.reduce((acc, p) => {
    acc[p.Quality] = (acc[p.Quality] || 0) + 1;
    return acc;
  }, {});
  const maxQuality = Math.max(...Object.values(qualityCounts), 1);
  const qualityColor = { premium: "#7cb342", standard: "#3a9bd5", economy: "#d4a017" };

  return (
    <Layout pageTitle="Product Reports">

      {/* ── Category badge ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: themeG.card, border: `1px solid ${themeG.border}`, boxShadow: "0 2px 8px rgba(106,163,38,0.06)" }}>
          <span style={{ fontSize: 18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Reports</span>
        </div>
        <span style={{ fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>
          <span style={{ color: themeG.accent, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#a23528" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Products", value: products.length, accent: "#7cb342" },
          { label: "Units in Stock", value: totalQty.toLocaleString(), accent: "#558b2f" },
          { label: "Inventory Value", value: `₹${totalValue.toLocaleString()}`, accent: "#9ccc65" },
          { label: "Low Stock Items", value: lowStock.length, accent: lowStock.length > 0 ? "#a23528" : "#689f38" },
        ].map((c) => (
          <div key={c.label} style={statCard}>
            <p style={{ fontSize: 12, color: themeG.textLabel, margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: c.accent }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <h3 style={cardTitle}>Products by Sub-type</h3>
          {Object.entries(subTypeCounts).map(([t, count]) => (
            <BarRow key={t} label={t} count={count} max={maxSubType} color="#7cb342" />
          ))}
        </div>

        <div style={card}>
          <h3 style={cardTitle}>Products by Quality Grade</h3>
          {Object.entries(qualityCounts).map(([q, count]) => (
            <BarRow key={q} label={q} count={count} max={maxQuality} color={qualityColor[q] || "#7cb342"} />
          ))}
        </div>
      </div>

      <div style={card}>
        <h3 style={cardTitle}>Low Stock Alert (≤ {LOW_STOCK_THRESHOLD} units)</h3>
        {lowStock.length === 0 ? (
          <p style={{ fontSize: 13, color: themeG.textSub }}>All products are well-stocked. 🎉</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Code", "Name", "Quantity", "Status"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lowStock.map((p) => (
                <tr key={p.Id} style={{ borderBottom: "1px solid rgba(106,163,38,0.08)" }}>
                  <td style={td}>{p.Code}</td>
                  <td style={td}>{p.Name}</td>
                  <td style={{ ...td, fontWeight: 700, color: "#a23528" }}>{p.Quantity}</td>
                  <td style={td}>{p.Status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
