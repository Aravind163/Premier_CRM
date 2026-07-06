import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/AppLayout";
import { getG, G } from "../../theme";
import API from "../../services/api";

const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");

// ─── Subtype lists ────────────────────────────────────────────────────────────
const YARN_SUBTYPES  = ["bundle", "hank", "cone"];
const CLOTH_SUBTYPES = ["dhoti", "blouse", "pant", "shirt", "leggings", "uniform", "others"];

// ─── Dropdown / radio options ─────────────────────────────────────────────────
const dhoti_TYPE_OPTIONS        = ["Plain White","Color Border","Gold Zari Border","Temple Border","Mayilkan Border","Panchakacham Style","Custom"];
const dhoti_LENGTH_OPTIONS      = ["2 M","3.6 M","4 M","8 M","9 M","Custom"];
const dhoti_BODY_COLOR_OPTIONS  = ["White","Off White","Cream","Beige","Custom"];
const BLOUSE_FABRIC_OPTIONS     = ["Cotton","Silk","Jacquard","Brocade","Satin","Linen","Custom"];
const BLOUSE_WIDTH_OPTIONS      = ['36"','44"','58"',"Custom"];
const BLOUSE_DESIGN_OPTIONS     = ["Plain","Printed","Woven Design"];
const BLOUSE_ZARI_OPTIONS       = ["Yes","No","Half-Fine","Pure-Gold"];
const UNIFORM_FOR_OPTIONS       = ["School","College","Hospital","Security","Factory","Corporate","Hotel","Custom"];
const FABRIC_FEEL_OPTIONS       = ["Soft","Normal","Heavy Duty"];
const PACKAGING_OPTIONS         = ["Individual","Bundle","Box"];

// ─── Shared primitives ────────────────────────────────────────────────────────
const Field = ({ label, required, children }) => (
  <div style={{ marginBottom: 18 }}>
    <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#3d6b50", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>
      {label}{required && <span style={{ color:"#c0392b", marginLeft:3 }}>*</span>}
    </label>
    {children}
  </div>
);

const Input = (props) => (
  <input {...props} style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(27,77,46,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#1a3d2b", background:"#fff", outline:"none", boxSizing:"border-box" }} />
);

const Select = ({ children, ...props }) => (
  <select {...props} style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(27,77,46,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#1a3d2b", background:"#fff", outline:"none", boxSizing:"border-box" }}>
    {children}
  </select>
);

const RadioRow = ({ label, options, value, onChange, required }) => (
  <Field label={label} required={required}>
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          style={{ padding:"7px 18px", borderRadius:20, border:"1.5px solid", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, transition:"all 0.12s",
            background: value === opt ? "rgba(124,179,66,0.15)" : "#ffffff",
            color:       value === opt ? "#3d6b1f" : "#4a7a5a",
            borderColor: value === opt ? "#2d6a4f"  : "rgba(27,77,46,0.18)" }}>
          {opt}
        </button>
      ))}
    </div>
  </Field>
);

// ─── Per-product detail forms ─────────────────────────────────────────────────
function DhotiDetails({ d, set }) {
  return (
    <>
      <Field label="1. Dhoti Type" required>
        <Select value={d.dhotiType} onChange={e => set("dhotiType", e.target.value)}>
          <option value="">Select type…</option>
          {dhoti_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <RadioRow label="2. Single or Double?" options={["Single","Double"]} value={d.fabricCount} onChange={v => set("fabricCount", v)} required />
      <Field label="3. Required Length" required>
        <Select value={d.length} onChange={e => set("length", e.target.value)}>
          <option value="">Select length…</option>
          {dhoti_LENGTH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      {d.length === "Custom" && (
        <Field label="Custom Length (Meters)">
          <Input type="number" placeholder="e.g. 6.5" value={d.customLength} onChange={e => set("customLength", e.target.value)} />
        </Field>
      )}
      <Field label="4. Border Color">
        <Input placeholder="e.g. Red, Gold, Dark Maroon…" value={d.borderColor} onChange={e => set("borderColor", e.target.value)} />
      </Field>
      <Field label="5. Border Design Preference">
        <Input placeholder="e.g. Floral, Temple motif, Plain…" value={d.borderDesign} onChange={e => set("borderDesign", e.target.value)} />
      </Field>
      <Field label="6. Body Color">
        <Select value={d.bodyColor} onChange={e => set("bodyColor", e.target.value)}>
          <option value="">Select body color…</option>
          {dhoti_BODY_COLOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      {d.bodyColor === "Custom" && (
        <Field label="Custom Body Color">
          <Input placeholder="Shade name / Pantone ref" value={d.customBodyColor} onChange={e => set("customBodyColor", e.target.value)} />
        </Field>
      )}
      <RadioRow label="7. Finish" options={["Soft","Starch","Medium"]} value={d.finish} onChange={v => set("finish", v)} />
      <RadioRow label="8. Packaging Type" options={PACKAGING_OPTIONS} value={d.packaging} onChange={v => set("packaging", v)} />
      <RadioRow label="9. Sample Required?" options={["Yes","No"]} value={d.sampleRequired} onChange={v => set("sampleRequired", v)} />
    </>
  );
}

function BlouseDetails({ d, set }) {
  return (
    <>
      <Field label="1. Blouse Fabric Type" required>
        <Select value={d.fabricType} onChange={e => set("fabricType", e.target.value)}>
          <option value="">Select fabric type…</option>
          {BLOUSE_FABRIC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="2. Color Required">
        <Input placeholder="e.g. Peacock Blue, Bridal Red…" value={d.colorRequired} onChange={e => set("colorRequired", e.target.value)} />
      </Field>
      <RadioRow label="3. Matching Saree Shade?" options={["Yes","No"]} value={d.matchingSareeShade} onChange={v => set("matchingSareeShade", v)} />
      <Field label="4. Width Required">
        <Select value={d.width} onChange={e => set("width", e.target.value)}>
          <option value="">Select width…</option>
          {BLOUSE_WIDTH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      {d.width === "Custom" && (
        <Field label="Custom Width">
          <Input placeholder="e.g. 48 inches" value={d.customWidth} onChange={e => set("customWidth", e.target.value)} />
        </Field>
      )}
      <Field label="5. Plain or Design?">
        <Select value={d.design} onChange={e => set("design", e.target.value)}>
          <option value="">Select…</option>
          {BLOUSE_DESIGN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="6. Zari Required?">
        <Select value={d.zariRequired} onChange={e => set("zariRequired", e.target.value)}>
          <option value="">Select…</option>
          {BLOUSE_ZARI_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <RadioRow label="7. Embroidery Base Needed?" options={["Yes","No"]} value={d.embroideryBase} onChange={v => set("embroideryBase", v)} />
      <RadioRow label="8. Sample Required?" options={["Yes","No"]} value={d.sampleRequired} onChange={v => set("sampleRequired", v)} />
      <Field label="9. Special Notes">
        <textarea placeholder="Any additional requirements…" value={d.specialNotes} onChange={e => set("specialNotes", e.target.value)} rows={3}
          style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(27,77,46,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#1a3d2b", background:"#fff", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
      </Field>
    </>
  );
}

function UniformDetails({ d, set }) {
  return (
    <>
      <Field label="1. Uniform For" required>
        <Select value={d.uniformFor} onChange={e => set("uniformFor", e.target.value)}>
          <option value="">Select segment…</option>
          {UNIFORM_FOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="2. Shirt Fabric Required?">
        <Input placeholder="e.g. Cotton poplin, polyester blend…" value={d.shirtFabric} onChange={e => set("shirtFabric", e.target.value)} />
      </Field>
      <Field label="3. Pant Fabric Required?">
        <Input placeholder="e.g. Terylene twill, cotton drill…" value={d.pantFabric} onChange={e => set("pantFabric", e.target.value)} />
      </Field>
      <Field label="4. Required Color">
        <Input placeholder="e.g. Navy Blue, Khaki, Grey…" value={d.color} onChange={e => set("color", e.target.value)} />
      </Field>
      <RadioRow label="5. Color Matching Sample Available?" options={["Yes","No"]} value={d.colorSampleAvailable} onChange={v => set("colorSampleAvailable", v)} />
      <RadioRow label="6. Logo Embroidery Required?" options={["Yes","No"]} value={d.logoEmbroidery} onChange={v => set("logoEmbroidery", v)} />
      <RadioRow label="7. Printing Required?" options={["Yes","No"]} value={d.printing} onChange={v => set("printing", v)} />
      <RadioRow label="8. Fabric Feel" options={FABRIC_FEEL_OPTIONS} value={d.fabricFeel} onChange={v => set("fabricFeel", v)} />
      <RadioRow label="9. Delivery Priority" options={["Normal","Urgent"]} value={d.deliveryPriority} onChange={v => set("deliveryPriority", v)} />
    </>
  );
}

function OthersDetails({ d, set }) {
  return (
    <>
      <Field label="1. Product Name" required>
        <Input placeholder="e.g. Canvas, Twill suiting…" value={d.productName} onChange={e => set("productName", e.target.value)} />
      </Field>
      <Field label="2. Fabric Purpose">
        <Input placeholder="e.g. upholstery, curtains, export bags…" value={d.fabricPurpose} onChange={e => set("fabricPurpose", e.target.value)} />
      </Field>
      <Field label="3. Color Requirement">
        <Input placeholder="Shade name / Pantone / greige…" value={d.colorRequirement} onChange={e => set("colorRequirement", e.target.value)} />
      </Field>
      <Field label="4. Width Preference">
        <Input placeholder="e.g. 44 inch, 60 inch…" value={d.widthPreference} onChange={e => set("widthPreference", e.target.value)} />
      </Field>
      <RadioRow label="5. Reference Sample Available?" options={["Yes","No"]} value={d.referenceSampleAvailable} onChange={v => set("referenceSampleAvailable", v)} />
      <Field label="6. Special Finish Needed?">
        <Input placeholder="e.g. water repellent, anti-microbial…" value={d.specialFinish} onChange={e => set("specialFinish", e.target.value)} />
      </Field>
      <Field label="7. Quality Expectations">
        <Input placeholder="e.g. export grade, ISO certified…" value={d.qualityExpectations} onChange={e => set("qualityExpectations", e.target.value)} />
      </Field>
      <Field label="8. Additional Notes">
        <textarea placeholder="Any other specifications…" value={d.additionalNotes} onChange={e => set("additionalNotes", e.target.value)} rows={3}
          style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(27,77,46,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#1a3d2b", background:"#fff", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
      </Field>
    </>
  );
}

// ─── Default detail state per subtype ────────────────────────────────────────
const defaultDetails = {
  dhoti:   { dhotiType:"", fabricCount:"", length:"", customLength:"", borderColor:"", borderDesign:"", bodyColor:"", customBodyColor:"", finish:"", packaging:"", sampleRequired:"" },
  blouse:  { fabricType:"", colorRequired:"", matchingSareeShade:"", width:"", customWidth:"", design:"", zariRequired:"", embroideryBase:"", sampleRequired:"", specialNotes:"" },
  uniform: { uniformFor:"", shirtFabric:"", pantFabric:"", color:"", colorSampleAvailable:"", logoEmbroidery:"", printing:"", fabricFeel:"", deliveryPriority:"" },
  others:  { productName:"", fabricPurpose:"", colorRequirement:"", widthPreference:"", referenceSampleAvailable:"", specialFinish:"", qualityExpectations:"", additionalNotes:"" },
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function AddOrder() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);

  const card      = { background:themeG.card, border:`1px solid ${themeG.border}`, borderRadius:14, padding:24, boxShadow:"0 4px 16px rgba(106,163,38,0.05)", minWidth:0, width:"100%", boxSizing:"border-box" };
  const cardTitle = { fontFamily:"'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize:16, fontWeight:600, margin:"0 0 20px", color:themeG.textMain };

  const navigate = useNavigate();
  const getStoredCat = () => localStorage.getItem("premier_category") || "cloth";
  const [tab,     setTab]     = useState(getStoredCat);
  const [subType, setSubType] = useState(() => getStoredCat() === "yarn" ? "bundle" : "dhoti");
  const [form, setForm]       = useState({ customerId:"", productId:"", qty:"", pricePerUnit:"", deliveryDate:"", notes:"", discount:"" });
  const [details, setDetails] = useState(null);

  const [customers, setCustomers] = useState([]);
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [custRes, prodRes] = await Promise.all([API.get("/customers"), API.get("/products")]);
        setCustomers(custRes.data);
        setProducts(prodRes.data);
      } catch {
        setError("Failed to load customers/products.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setDetailField = (k, v) => setDetails(d => ({ ...d, [k]: v }));

  const subtypes    = tab === "yarn" ? YARN_SUBTYPES : CLOTH_SUBTYPES;
  const productList = products.filter(p => p.Category === tab && p.SubType === subType);
  const selectedProduct = products.find(p => String(p.Id) === String(form.productId));
  const total = form.qty && form.pricePerUnit
    ? (parseFloat(form.qty) * parseFloat(form.pricePerUnit) * (1 - (parseFloat(form.discount) || 0) / 100)).toFixed(2)
    : "—";

  const handleTabChange = (t) => {
    localStorage.setItem("premier_category", t);
    setTab(t);
    const firstSub = t === "yarn" ? "bundle" : "dhoti";
    setSubType(firstSub);
    set("productId", "");
    setDetails(t === "cloth" ? { ...defaultDetails["dhoti"] } : null);
  };

  const handleSubTypeChange = (t) => {
    setSubType(t);
    set("productId", "");
    if (tab === "cloth") setDetails({ ...defaultDetails[t] });
  };

  const handleProductPick = (productId) => {
    set("productId", productId);
    const p = products.find(pr => String(pr.Id) === String(productId));
    if (p) set("pricePerUnit", p.Price);
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.customerId || !form.productId || !form.qty || !form.pricePerUnit) {
      setError("Please fill in customer, product, quantity and price.");
      return;
    }
    setSaving(true);
    try {
      await API.post("/orders", {
        customerId:   form.customerId,
        productId:    form.productId,
        qty:          form.qty,
        pricePerUnit: form.pricePerUnit,
        discount:     form.discount || 0,
        deliveryDate: form.deliveryDate || null,
        notes:        form.notes || null,
        orderDetails: details || null,
      });
      navigate("/master/orders");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to place order.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout pageTitle="Add Order">
        <p style={{ color: themeG.textSub }}>Loading customers and products…</p>
      </Layout>
    );
  }

  const showDetailsCard = tab === "cloth" && ["dhoti","blouse","uniform","others"].includes(subType);

  return (
    <Layout pageTitle="Add Order">

      {/* ── Category locked badge ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:28 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 18px", borderRadius:10, background:themeG.card, border:`1px solid ${themeG.border}`, boxShadow:"0 2px 8px rgba(106,163,38,0.06)" }}>
          <span style={{ fontSize:18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily:"inherit", fontSize:14, fontWeight:700, color:themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"}</span>
        </div>
        <span style={{ fontSize:12, color:themeG.textSub }}>
          Category locked — <span style={{ color:themeG.accent, cursor:"pointer", textDecoration:"underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      <div style={{ display:"grid", gridTemplateColumns: showDetailsCard ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))", gap:24, alignItems:"start" }}>

        {error && (
          <div style={{ gridColumn:"1 / -1", background:"rgba(192,57,43,0.08)", border:"1px solid rgba(192,57,43,0.25)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#a23528" }}>
            {error}
          </div>
        )}

        <div style={card}>
          <h3 style={cardTitle}>Order Details</h3>

          <Field label="Customer" required>
            <Select value={form.customerId} onChange={e => set("customerId", e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.Id} value={c.Id}>{c.Name} ({c.Code})</option>)}
            </Select>
          </Field>

          <Field label="Sub-type">
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {subtypes.map(t => (
                <button key={t} onClick={() => handleSubTypeChange(t)}
                  style={{ padding:"7px 18px", borderRadius:20, border:"1.5px solid", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, transition:"all 0.12s", textTransform:"capitalize",
                    background: subType === t ? "rgba(124,179,66,0.15)" : themeG.card,
                    color:       subType === t ? themeG.accent : themeG.textSub,
                    borderColor: subType === t ? themeG.accent  : themeG.border }}>
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Product" required>
            <Select value={form.productId} onChange={e => handleProductPick(e.target.value)}>
              <option value="">Select product…</option>
              {productList.map(p => <option key={p.Id} value={p.Id}>{p.Name} ({p.Code})</option>)}
            </Select>
          </Field>

          <Field label="Quantity" required>
            <Input type="number" placeholder="e.g. 10" value={form.qty} onChange={e => set("qty", e.target.value)} />
          </Field>

          <Field label="Price per Unit (₹)" required>
            <Input type="number" placeholder="e.g. 480" value={form.pricePerUnit} onChange={e => set("pricePerUnit", e.target.value)} />
          </Field>
        </div>

        <div style={card}>
          <h3 style={cardTitle}>Payment & Delivery</h3>

          <Field label="Discount (%)">
            <Input type="number" placeholder="0" min={0} max={100} value={form.discount} onChange={e => set("discount", e.target.value)} />
          </Field>

          <Field label="Expected Delivery Date">
            <Input type="date" value={form.deliveryDate} onChange={e => set("deliveryDate", e.target.value)} />
          </Field>

          <Field label="Notes">
            <textarea placeholder="Special instructions, etc." value={form.notes} onChange={e => set("notes", e.target.value)} rows={4}
              style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${themeG.border}`, fontSize:14, fontFamily:"inherit", color:themeG.textMain, background:themeG.card, outline:"none", resize:"vertical", boxSizing:"border-box" }} />
          </Field>

          <div style={{ marginTop:12, padding:"16px 18px", borderRadius:12, border:"2px solid rgba(124,179,66,0.25)", background:"rgba(124,179,66,0.05)" }}>
            <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:700, color:themeG.textLabel, textTransform:"uppercase", letterSpacing:"0.07em" }}>Order Summary</p>
            {[
              ["Category",    tab === "yarn" ? `🧵 Yarn / ${subType}` : `👘 Cloth / ${subType}`],
              ["Product",     selectedProduct ? `${selectedProduct.Name} (${selectedProduct.Code})` : "—"],
              ["Qty × Price", form.qty && form.pricePerUnit ? `${form.qty} × ₹${form.pricePerUnit}` : "—"],
              ["Discount",    form.discount ? `${form.discount}%` : "—"],
              ["Total",       total !== "—" ? `₹${parseFloat(total).toLocaleString()}` : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:13, color:themeG.textSub }}>{k}</span>
                <span style={{ fontSize:13, fontWeight:600, color: k === "Total" ? themeG.accent : themeG.textMain }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {showDetailsCard && details && (
          <div style={card}>
            <h3 style={cardTitle}>
              {subType === "dhoti"   && "Dhoti Details"}
              {subType === "blouse"  && "Blouse Fabric Details"}
              {subType === "uniform" && "Uniform Details"}
              {subType === "others"  && "Product Details"}
            </h3>
            {subType === "dhoti"   && <DhotiDetails   d={details} set={setDetailField} />}
            {subType === "blouse"  && <BlouseDetails  d={details} set={setDetailField} />}
            {subType === "uniform" && <UniformDetails d={details} set={setDetailField} />}
            {subType === "others"  && <OthersDetails  d={details} set={setDetailField} />}
          </div>
        )}
      </div>

      <div style={{ display:"flex", gap:12, marginTop:28, justifyContent:"flex-end" }}>
        <button onClick={() => navigate("/master/orders")}
          style={{ padding:"10px 24px", borderRadius:9, border:`1px solid ${themeG.border}`, background:themeG.card, color:themeG.textSub, cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:500 }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving}
          style={{ padding:"10px 28px", borderRadius:9, border:"none", background:themeG.accent, color:themeG.card, cursor:saving ? "not-allowed" : "pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, boxShadow:"0 2px 10px rgba(124,179,66,0.32)", opacity:saving ? 0.6 : 1 }}>
          {saving ? "Placing…" : "Place Order"}
        </button>
      </div>
    </Layout>
  );
}