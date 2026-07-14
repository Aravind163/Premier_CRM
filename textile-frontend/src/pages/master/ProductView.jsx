import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { getG, G } from "../../theme";
import API from "../../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");

const CLOTH_SUBTYPES = {
  dhoti:    { label:"Dhoti",    icon:"🥻", fields:[{key:"length",label:"Length",type:"chips",options:["4 Meter","8 Meter","Other"]},{key:"border",label:"Border Type",type:"chips",options:["Plain","Fancy","Zari","Colour Border"]},{key:"count",label:"Count (Thread)",type:"text",placeholder:"e.g. 60s, 80s"}] },
  blouse:   { label:"Blouse",   icon:"👗", fields:[{key:"length",label:"Blouse Piece Length",type:"chips",options:["0.8 Meter","1 Meter","1.2 Meter","Other"]},{key:"size",label:"Size",type:"chips",options:["XS","S","M","L","XL","XXL"]},{key:"neckType",label:"Neck Type",type:"chips",options:["Round","V-Neck","Boat Neck","Square"]}] },
  pant:     { label:"Pant",     icon:"👖", fields:[{key:"size",label:"Waist Size (inches)",type:"chips",options:["28","30","32","34","36","38","40","42"]},{key:"length",label:"Length",type:"chips",options:["28 inch","30 inch","32 inch","34 inch","36 inch","Other"]},{key:"fit",label:"Fit Type",type:"chips",options:["Regular","Slim","Loose","Tapered"]}] },
  shirt:    { label:"Shirt",    icon:"👔", fields:[{key:"size",label:"Size",type:"chips",options:["XS","S","M","L","XL","XXL","XXXL"]},{key:"collarSize",label:"Collar Size",type:"chips",options:["14","14.5","15","15.5","16","16.5","17","17.5"]},{key:"sleeveLength",label:"Sleeve",type:"chips",options:["Half Sleeve","Full Sleeve"]}] },
  leggings: { label:"Leggings", icon:"🧣", fields:[{key:"length",label:"Length",type:"chips",options:["1 Meter","1.5 Meter","2 Meter","2.5 Meter","Other"]},{key:"size",label:"Size",type:"chips",options:["XS","S","M","L","XL","XXL"]},{key:"elasticType",label:"Waist Type",type:"chips",options:["Elastic","Drawstring","Fixed"]}] },
  others:   { label:"Others",   icon:"🧶", fields:[{key:"length",label:"Length / Size",type:"text",placeholder:"e.g. 5 meter"},{key:"unit",label:"Unit",type:"chips",options:["Meter","Yard","Piece","Set"]}] },
};
const YARN_SUBTYPES = {
  bundle: { label:"Bundle", icon:"📦", fields:[{key:"weight",label:"Bundle Weight",type:"chips",options:["250g","500g","1 kg","2 kg","5 kg","Other"]},{key:"ply",label:"Ply",type:"chips",options:["2 Ply","3 Ply","4 Ply","6 Ply","8 Ply"]},{key:"count",label:"Count",type:"text",placeholder:"e.g. 40s, 60s"}] },
  hank:   { label:"Hank",   icon:"🪢", fields:[{key:"weight",label:"Hank Weight",type:"chips",options:["100g","200g","250g","500g","1 kg","Other"]},{key:"length",label:"Hank Length",type:"text",placeholder:"e.g. 100m"},{key:"count",label:"Count",type:"text",placeholder:"e.g. 40s"}] },
  cone:   { label:"Cone",   icon:"🔺", fields:[{key:"weight",label:"Cone Weight",type:"chips",options:["500g","1 kg","1.5 kg","2 kg","Other"]},{key:"length",label:"Yarn Length",type:"text",placeholder:"e.g. 500m"},{key:"count",label:"Count",type:"text",placeholder:"e.g. 40s"}] },
};

function parseSpecStr(str) {
  if (!str) return {};
  const obj = {};
  str.split("|").forEach(part => {
    const idx = part.indexOf(":");
    if (idx > -1) obj[part.slice(0, idx)] = part.slice(idx + 1);
  });
  return obj;
}

function buildSpecStr(obj) {
  return Object.entries(obj).filter(([,v]) => v && v.trim()).map(([k,v]) => `${k}:${v}`).join("|");
}

function getSubConfig(category, subtype) {
  const map = category === "yarn" ? YARN_SUBTYPES : CLOTH_SUBTYPES;
  return map[subtype?.toLowerCase()] || null;
}

const Field = ({ label, children }) => {
  const tG = getThemeColors();
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display:"block", fontSize:12, fontWeight:600, color:tG.textLabel, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6, fontFamily:FONT }}>
        {label}
      </label>
      {children}
    </div>
  );
};

const Input = (props) => (
  <input {...props} style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:"1px solid rgba(15,33,56,0.18)", fontSize:14, fontFamily:FONT, color:"#0F2138", background: props.disabled ? "#EAEFF5" : "#ffffff", outline:"none", boxSizing:"border-box", ...props.style }} />
);

const Select = ({ children, ...props }) => {
  const tG = getThemeColors();
  return <select {...props} style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${tG.border}`, fontSize:14, fontFamily:FONT, color:tG.textMain, background: props.disabled ? tG.surface : tG.card, outline:"none", boxSizing:"border-box" }}>{children}</select>;
};

const ReadRow = ({ label, value }) => (
  <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid rgba(46,122,114,0.08)" }}>
    <span style={{ fontSize:13, color:"#526073", fontFamily:FONT }}>{label}</span>
    <span style={{ fontSize:13, fontWeight:600, color:"#0F2138", fontFamily:FONT }}>{value ?? "—"}</span>
  </div>
);

function ChipField({ options, value, onChange }) {
  const isCustom = value && !options.includes(value) && value !== "";
  const [showCustom, setShowCustom] = useState(isCustom);
  const [customVal, setCustomVal]   = useState(isCustom ? value : "");

  // Keep local "Other" box in sync if the parent value changes from outside
  // (e.g. switching sub-type, or the initial product load resolving late).
  useEffect(() => {
    const custom = value && !options.includes(value) && value !== "";
    setShowCustom(custom);
    setCustomVal(custom ? value : "");
  }, [value, options]);

  const pick = (opt) => {
    if (opt === "Other") { setShowCustom(true); onChange(customVal || ""); }
    else { setShowCustom(false); setCustomVal(""); onChange(opt); }
  };

  return (
    <div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom: showCustom ? 10 : 0 }}>
        {options.map(opt => {
          const active = opt === "Other" ? showCustom : value === opt;
          return (
            <button key={opt} type="button" onClick={() => pick(opt)}
              style={{ padding:"6px 16px", borderRadius:20, border:"1.5px solid", cursor:"pointer", fontFamily:FONT, fontSize:13, fontWeight:600, transition:"all 0.12s",
                background:  active ? "rgba(15,33,56,0.12)" : "#ffffff",
                color:       active ? "#1F5C99" : "#526073",
                borderColor: active ? "#1F5C99" : "rgba(15,33,56,0.22)" }}>
              {opt}
            </button>
          );
        })}
      </div>
      {showCustom && (
        <Input placeholder="Enter custom value…" value={customVal}
          onChange={e => { setCustomVal(e.target.value); onChange(e.target.value); }} />
      )}
    </div>
  );
}

export default function ProductView() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const card      = { background:themeG.card, border:`1px solid ${themeG.border}`, borderRadius:14, padding:24, boxShadow:"0 4px 16px rgba(46,122,114,0.05)" };
  const cardTitle = { fontFamily:FONT, fontSize:16, fontWeight:600, margin:"0 0 20px", color:themeG.textMain };

  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const editMode = searchParams.get("edit") === "1";

  const [product, setProduct] = useState(null);
  const [form, setForm]       = useState(null);
  const [specFields, setSpecFields] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // Track which sub-type the currently-loaded specFields belong to, so we
  // only wipe them when the user actually *changes* sub-type — not on
  // initial load (which is what was causing fields to render blank).
  const [specOwnerSubType, setSpecOwnerSubType] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get(`/products/${id}`);
        const p = res.data;
        setProduct(p);

        const normalizedSubType = (p.SubType || "").toLowerCase();
        const rawSpec = p.Category === "yarn" ? p.Weight : p.Size;
        setSpecFields(parseSpecStr(rawSpec));
        setSpecOwnerSubType(normalizedSubType);

        setForm({
          tab:         p.Category,
          subType:     normalizedSubType,
          name:        p.Name,
          price:       p.Price,
          qty:         p.Quantity,
          color:       p.Color,
          // Normalize quality to lowercase to match <option> values
          quality:     (p.Quality || "standard").toLowerCase(),
          description: p.Description || "",
          status:      (p.Status || "active").toLowerCase(),
        });
      } catch (err) {
        setError("Failed to load product.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const set      = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setSpec  = (k, v) => setSpecFields(f => ({ ...f, [k]: v }));
  const enterEdit  = () => setSearchParams({ edit:"1" });
  const cancelEdit = () => setSearchParams({});

  // Switching sub-type (within the SAME locked category) clears spec fields
  // since each sub-type has different spec keys. Re-selecting the sub-type
  // the product already had restores its original saved values instead of
  // wiping them.
  const handleSubTypeChange = (key) => {
    set("subType", key);
    if (key === specOwnerSubType) {
      const rawSpec = product.Category === "yarn" ? product.Weight : product.Size;
      setSpecFields(parseSpecStr(rawSpec));
    } else {
      setSpecFields({});
    }
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const specStr = buildSpecStr(specFields);
    try {
      const res = await API.put(`/products/${id}`, {
        ...form,
        weight: form.tab === "yarn"  ? specStr : null,
        size:   form.tab === "cloth" ? specStr : null,
      });
      setProduct(res.data);
      setSpecOwnerSubType(form.subType);
      setSearchParams({});
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update product.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete product ${product.Code}? This cannot be undone.`)) return;
    try {
      await API.delete(`/products/${id}`);
      navigate("/master/products");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete product.");
    }
  };

  if (loading) return <Layout pageTitle="Product"><p style={{ color:themeG.textSub, fontFamily:FONT }}>Loading product…</p></Layout>;

  if (!product) return (
    <Layout pageTitle="Product">
      <p style={{ color:"#B23A3A", fontFamily:FONT }}>{error || "Product not found."}</p>
      <button onClick={() => navigate("/master/products")} style={{ marginTop:12, padding:"9px 20px", borderRadius:9, border:`1px solid ${themeG.border}`, background:themeG.card, cursor:"pointer", fontFamily:FONT }}>Back to Products</button>
    </Layout>
  );

  const subConfig  = form ? getSubConfig(form.tab, form.subType) : null;
  // Category is LOCKED to the product's existing category in edit mode —
  // only that category's sub-types are ever shown, no Cloth/Yarn switcher.
  const subtypeMap = form?.tab === "yarn" ? YARN_SUBTYPES : CLOTH_SUBTYPES;

  const rawSpec = product.Category === "yarn" ? product.Weight : product.Size;
  const parsedSpec = parseSpecStr(rawSpec);

  return (
    <Layout pageTitle={`${editMode ? "Edit Product" : "Product Details"} · ${product.Name}`}>

      {error && (
        <div style={{ marginBottom:16, background:"rgba(178,58,58,0.08)", border:"1px solid rgba(178,58,58,0.25)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#B23A3A", fontFamily:FONT }}>
          {error}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>

        {/* ── Left: Basic Info ── */}
        <div style={card}>
          <h3 style={cardTitle}>Basic Info</h3>

          {editMode ? (
            <>
              {/* Category — locked, shown as read-only badge (no switcher) */}
              <Field label="Category">
                <div style={{
                  display:"flex", alignItems:"center", gap:8, padding:"9px 14px",
                  borderRadius:9, border:"1.5px solid rgba(15,33,56,0.30)",
                  background:"rgba(15,33,56,0.07)", width:"fit-content",
                }}>
                  <span style={{ fontSize:16 }}>{form.tab === "cloth" ? "👘" : "🧵"}</span>
                  <span style={{ fontFamily:FONT, fontSize:13.5, fontWeight:700, color:"#1F5C99" }}>
                    {form.tab === "cloth" ? "Cloth" : "Yarn"}
                  </span>
                  <span style={{ fontSize:11, color:"#526073", marginLeft:4 }}>(locked)</span>
                </div>
              </Field>

              {/* Sub-type — ALL sub-types of the product's own category, never the other category's */}
              <Field label="Sub-type">
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {Object.entries(subtypeMap).map(([key,cfg]) => (
                    <button key={key} type="button"
                      onClick={() => handleSubTypeChange(key)}
                      style={{ padding:"6px 14px", borderRadius:20, border:"1.5px solid", cursor:"pointer", fontFamily:FONT, fontSize:13, fontWeight:600,
                        background:  form.subType===key ? "rgba(15,33,56,0.12)" : "#ffffff",
                        color:       form.subType===key ? "#1F5C99" : "#526073",
                        borderColor: form.subType===key ? "#1F5C99" : "rgba(15,33,56,0.22)" }}>
                      {cfg.icon} {cfg.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Product Name"><Input value={form.name} onChange={e => set("name", e.target.value)} /></Field>
              <Field label="Price (₹)"><Input type="number" value={form.price} onChange={e => set("price", e.target.value)} /></Field>
              <Field label="Quantity in Stock"><Input type="number" value={form.qty} onChange={e => set("qty", e.target.value)} /></Field>
              <Field label="Quality Grade">
                <Select value={form.quality} onChange={e => set("quality", e.target.value)}>
                  <option value="premium">Premium</option>
                  <option value="standard">Standard</option>
                  <option value="economy">Economy</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={e => set("status", e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            </>
          ) : (
            <>
              <ReadRow label="Code"     value={product.Code} />
              <ReadRow label="Category" value={product.Category==="cloth" ? "👘 Cloth" : "🧵 Yarn"} />
              <ReadRow label="Sub-type" value={(() => { const cfg = getSubConfig(product.Category, product.SubType); return cfg ? `${cfg.icon} ${cfg.label}` : product.SubType; })()} />
              <ReadRow label="Name"     value={product.Name} />
              <ReadRow label="Price"    value={`₹${parseFloat(product.Price).toLocaleString()}`} />
              <ReadRow label="Quantity" value={product.Quantity} />
              <ReadRow label="Quality"  value={product.Quality} />
              <ReadRow label="Status"   value={product.Status} />
            </>
          )}
        </div>

        {/* ── Right: Specifications ── */}
        <div style={card}>
          <h3 style={cardTitle}>
            {subConfig ? `${subConfig.icon} ${subConfig.label} — ` : ""}Specifications
          </h3>

          {editMode ? (
            <>
              {subConfig && subConfig.fields.map(fieldCfg => (
                <Field key={fieldCfg.key} label={fieldCfg.label}>
                  {fieldCfg.type === "chips" ? (
                    <ChipField
                      options={fieldCfg.options}
                      value={specFields[fieldCfg.key] || ""}
                      onChange={v => setSpec(fieldCfg.key, v)}
                    />
                  ) : (
                    <Input
                      placeholder={fieldCfg.placeholder}
                      value={specFields[fieldCfg.key] || ""}
                      onChange={e => setSpec(fieldCfg.key, e.target.value)}
                    />
                  )}
                </Field>
              ))}

              <Field label="Color">
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <input type="color" value={form.color} onChange={e => set("color", e.target.value)}
                    style={{ width:36, height:36, borderRadius:8, border:"1px solid rgba(15,33,56,0.18)", cursor:"pointer", padding:2 }} />
                  <span style={{ fontSize:13, color:"#526073", fontFamily:FONT }}>{form.color}</span>
                </div>
              </Field>
              <Field label="Description">
                <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4}
                  style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:"1px solid rgba(15,33,56,0.18)", fontSize:14, fontFamily:FONT, color:"#0F2138", background:"#ffffff", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
              </Field>
            </>
          ) : (
            <>
              {Object.keys(parsedSpec).length > 0 ? (
                Object.entries(parsedSpec).map(([k, v]) => (
                  <ReadRow key={k} label={k.replace(/([A-Z])/g," $1").replace(/^./,s=>s.toUpperCase())} value={v} />
                ))
              ) : (
                <ReadRow label={product.Category==="yarn" ? "Weight" : "Size"} value={rawSpec || "—"} />
              )}
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0" }}>
                <span style={{ fontSize:13, color:"#526073", fontFamily:FONT }}>Color</span>
                <div style={{ width:18, height:18, borderRadius:"50%", background:product.Color, border:"1.5px solid rgba(0,0,0,0.14)" }} />
                <span style={{ fontSize:13, color:"#0F2138", fontFamily:FONT }}>{product.Color}</span>
              </div>
              <ReadRow label="Created" value={product.CreatedAt?.substring(0,10)} />
              <div style={{ marginTop:10 }}>
                <p style={{ fontSize:12, color:"#101B28", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6, fontFamily:FONT }}>Description</p>
                <p style={{ fontSize:13, color:"#0F2138", margin:0, fontFamily:FONT }}>{product.Description || "—"}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display:"flex", gap:12, marginTop:28, justifyContent:"flex-end" }}>
        <button onClick={() => navigate("/master/products")} style={{ padding:"10px 24px", borderRadius:9, border:"1px solid rgba(15,33,56,0.18)", background:"#ffffff", color:"#526073", cursor:"pointer", fontFamily:FONT, fontSize:14, fontWeight:500 }}>
          Back
        </button>

        {editMode ? (
          <>
            <button onClick={cancelEdit} style={{ padding:"10px 24px", borderRadius:9, border:"1px solid rgba(15,33,56,0.18)", background:"#ffffff", color:"#526073", cursor:"pointer", fontFamily:FONT, fontSize:14, fontWeight:500 }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding:"10px 28px", borderRadius:9, border:"none", background:"#1F5C99", color:"#ffffff", cursor: saving ? "not-allowed" : "pointer", fontFamily:FONT, fontSize:14, fontWeight:700, boxShadow:"0 2px 10px rgba(91,155,217,0.32)", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </>
        ) : (
          <>
            <button onClick={handleDelete} style={{ padding:"10px 24px", borderRadius:9, border:"1px solid rgba(178,58,58,0.30)", background:"rgba(178,58,58,0.06)", color:"#B23A3A", cursor:"pointer", fontFamily:FONT, fontSize:14, fontWeight:600 }}>
              Delete
            </button>
            <button onClick={enterEdit} style={{ padding:"10px 28px", borderRadius:9, border:"none", background:"#1F5C99", color:"#ffffff", cursor:"pointer", fontFamily:FONT, fontSize:14, fontWeight:700, boxShadow:"0 2px 10px rgba(91,155,217,0.32)" }}>
              Edit Product
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
