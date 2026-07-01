import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { getG, getRowColors, statusColor } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Built-in defaults shown even if no products of that sub-type exist yet
const YARN_DEFAULTS  = ["Bundle", "Hank", "Cone"];
const CLOTH_DEFAULTS = ["Dhoti", "Blouse", "Pant", "Shirt", "Leggings", "Others"];

const ColorDot = ({ hex }) => (
  <span style={{ display:"inline-block", width:14, height:14, borderRadius:"50%", background:hex, border:"1.5px solid rgba(0,0,0,0.14)", verticalAlign:"middle", marginRight:7, flexShrink:0 }} />
);

const Badge = ({ text }) => {
  const s = statusColor(text);
  return (
    <span style={{ ...s, padding:"3px 11px", borderRadius:20, fontSize:12, fontWeight:600, border:`1px solid ${s.border}`, fontFamily:FONT }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  );
};

function parseSpecSummary(str) {
  if (!str) return "—";
  return str.split("|").filter(Boolean)
    .map(part => { const idx = part.indexOf(":"); return idx > -1 ? part.slice(idx + 1) : part; })
    .join(", ");
}

export default function ProductList() {
  const { isDark } = useTheme();
  const themeG    = getG(isDark);
  const ROW_COLORS = getRowColors(isDark);
  const navigate  = useNavigate();

  // ── Locked to stored category — no toggle shown ──
  const tab = localStorage.getItem("premier_category") || "cloth";

  const [subType, setSubType] = useState("All");
  const [search,  setSearch]  = useState("");
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/products");
        const mapped = res.data.map((p) => ({
          id:       p.Code,
          dbId:     p.Id,
          name:     p.Name,
          type:     p.SubType,
          category: p.Category,
          color:    p.Color,
          spec:     p.Category === "yarn" ? p.Weight : p.Size,
          qty:      p.Quantity,
          price:    parseFloat(p.Price) || 0,
          status:   p.Status,
        }));
        setAllProducts(mapped);
      } catch (err) {
        setError("Failed to load products.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const products = allProducts.filter((p) => p.category === tab);

  const defaults = tab === "yarn" ? YARN_DEFAULTS : CLOTH_DEFAULTS;
  const seenTypes = products.map((p) => p.type).filter(Boolean);
  // Merge defaults with any sub-types actually present in the data (covers custom sub-types like "Lungi", "Saree", "Towel"),
  // de-duplicated case-insensitively, defaults first in their usual order, then any extras alphabetically.
  const extraTypes = [...new Set(seenTypes)]
    .filter((t) => !defaults.some((d) => d.toLowerCase() === t.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const typeList = ["All", ...defaults, ...extraTypes];

  const filtered = products.filter((p) => {
    const matchType = subType === "All" || p.type.toLowerCase() === subType.toLowerCase();
    const matchSrch = p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSrch;
  });

  if (loading) return <Layout pageTitle="Products"><p style={{ color:themeG.textSub, fontFamily:FONT }}>Loading products…</p></Layout>;

  return (
    <Layout pageTitle="Products">

      {error && (
        <div style={{ marginBottom:16, background:"rgba(192,57,43,0.08)", border:"1px solid rgba(192,57,43,0.25)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#a23528", fontFamily:FONT }}>
          {error}
        </div>
      )}

      {/* ── Category badge (locked, no toggle) ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 18px", borderRadius:10, background:themeG.card, border:`1px solid ${themeG.border}`, boxShadow:"0 2px 8px rgba(106,163,38,0.06)" }}>
          <span style={{ fontSize:18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily:FONT, fontSize:14, fontWeight:700, color:themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Products</span>
        </div>
        <span style={{ fontSize:12, color:themeG.textSub, fontFamily:FONT }}>
          <span style={{ color:themeG.accent, cursor:"pointer", textDecoration:"underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      {/* ── Sub-type pills ── */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {typeList.map((t) => (
          <button key={t} onClick={() => setSubType(t)}
            style={{ padding:"5px 16px", borderRadius:20, border:"1px solid", cursor:"pointer", fontFamily:FONT, fontSize:13, fontWeight:500, transition:"all 0.12s",
              background:  subType === t ? "rgba(124,179,66,0.14)" : "transparent",
              color:       subType === t ? themeG.accent : themeG.textSub,
              borderColor: subType === t ? "rgba(124,179,66,0.40)" : themeG.border }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <input placeholder="Search by name or ID…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ padding:"9px 14px", borderRadius:9, border:`1px solid ${themeG.border}`, fontSize:13, width:260, fontFamily:FONT, background:themeG.card, outline:"none", color:themeG.textMain }} />
        <button onClick={() => navigate("/master/products/add")}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 20px", borderRadius:9, background:themeG.accent, color:themeG.card, border:"none", fontFamily:FONT, fontSize:13, fontWeight:600, cursor:"pointer", boxShadow:"0 2px 10px rgba(124,179,66,0.32)" }}>
          + Add Product
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ background:themeG.card, border:`1px solid ${themeG.border}`, borderRadius:14, overflow:"hidden", boxShadow:"0 4px 16px rgba(106,163,38,0.06)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${themeG.border}` }}>
              {["ID", "Product Name", "Type", "Color", tab === "yarn" ? "Specs" : "Specs", "Qty", "Price (₹)", "Status", "Actions"].map((h) => (
                <th key={h} style={{ textAlign:"left", fontSize:11, color:themeG.textLabel, padding:"10px 14px", textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:600, background:"rgba(124,179,66,0.04)", fontFamily:FONT }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign:"center", padding:40, color:themeG.textSub, fontSize:14, fontFamily:FONT }}>No products found.</td></tr>
            ) : filtered.map((p) => {
              const rc = ROW_COLORS[p.type?.toLowerCase()] || ROW_COLORS.yarn;
              return (
                <tr key={p.id} style={{ borderBottom:`1px solid rgba(106,163,38,0.07)`, background:rc.bg }}>
                  <td style={{ padding:"12px 14px", fontSize:13, color:themeG.accent, fontWeight:600, borderLeft:`3px solid ${rc.dot}`, fontFamily:FONT }}>{p.id}</td>
                  <td style={{ padding:"12px 14px", fontSize:14, color:themeG.textMain, fontWeight:500, fontFamily:FONT }}>
                    <ColorDot hex={p.color} />{p.name}
                  </td>
                  <td style={{ padding:"12px 14px" }}>
                    <span style={{ fontSize:12, fontWeight:600, color:rc.dot, background:`${rc.border}`, border:`1px solid ${rc.border}`, padding:"2px 10px", borderRadius:20, fontFamily:FONT }}>
                      {p.type.replace(/_/g, " ").charAt(0).toUpperCase() + p.type.replace(/_/g, " ").slice(1)}
                    </span>
                  </td>
                  <td style={{ padding:"12px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <ColorDot hex={p.color} />
                      <span style={{ fontSize:12, color:themeG.textSub, fontFamily:FONT }}>{p.color}</span>
                    </div>
                  </td>
                  <td style={{ padding:"12px 14px", fontSize:13, color:themeG.textMain, fontFamily:FONT, maxWidth:180 }}>
                    {parseSpecSummary(p.spec)}
                  </td>
                  <td style={{ padding:"12px 14px", fontSize:13, fontWeight:600, color:p.qty < 50 ? "#c0392b" : themeG.textMain, fontFamily:FONT }}>{p.qty}</td>
                  <td style={{ padding:"12px 14px", fontSize:13, fontWeight:700, color:themeG.textMain, fontFamily:FONT }}>₹{p.price.toLocaleString()}</td>
                  <td style={{ padding:"12px 14px" }}><Badge text={p.status} /></td>
                  <td style={{ padding:"12px 14px", whiteSpace:"nowrap" }}>
                    <div style={{ display:"flex", gap:8 }}>
                      <button style={btnStyle("#3a9bd5")} onClick={() => navigate(`/master/products/${p.dbId}`)}>View</button>
                      <button style={btnStyle(themeG.accent)} onClick={() => navigate(`/master/products/${p.dbId}?edit=1`)}>Edit</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding:"10px 14px", borderTop:`1px solid ${themeG.border}`, fontSize:12, color:themeG.textSub, fontFamily:FONT }}>
          Showing {filtered.length} of {products.length} {tab} products
        </div>
      </div>
    </Layout>
  );
}

const btnStyle = (color) => ({
  padding:"5px 13px", borderRadius:7, border:`1px solid ${color}40`,
  background:`${color}14`, color, cursor:"pointer", fontSize:12,
  fontFamily:FONT, fontWeight:600, whiteSpace:"nowrap",
});