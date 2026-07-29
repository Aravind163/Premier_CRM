import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
const PANT_FABRIC_OPTIONS       = ["Cotton","Terylene","Polyester Blend","Twill","Denim","Custom"];
const PANT_FIT_OPTIONS          = ["Regular","Slim","Relaxed","Bootcut"];
const WAIST_SIZE_OPTIONS        = ["28","30","32","34","36","38","40","Custom"];
const SHIRT_FABRIC_OPTIONS      = ["Cotton Poplin","Linen","Cotton-Poly Blend","Oxford","Twill","Custom"];
const SHIRT_COLLAR_OPTIONS      = ["Regular","Spread","Button-down","Mandarin","Chinese Collar"];
const SLEEVE_OPTIONS            = ["Full Sleeve","Half Sleeve"];
const LEGGINGS_FABRIC_OPTIONS   = ["Cotton Lycra","Viscose Lycra","Ponte","Polyester Spandex","Custom"];
const LEGGINGS_LENGTH_OPTIONS   = ["Ankle Length","Full Length","Capri","Custom"];
const WAIST_STYLE_OPTIONS       = ["Elastic","Drawstring","Fold-over"];

// ─── Shared primitives ────────────────────────────────────────────────────────
const Field = ({ label, required, full, children }) => {
  const { isDark } = useTheme();
  return (
    <div style={{ marginBottom: 4, gridColumn: full ? "1 / -1" : undefined, minWidth: 0 }}>
      <label style={{ display:"block", fontSize:12, fontWeight:600, color: getG(isDark).textLabel, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>
        {label}{required && <span style={{ color:"#B23A3A", marginLeft:3 }}>*</span>}
      </label>
      {children}
    </div>
  );
};

// Read-only display used when a box is locked (not in Edit mode) — same
// footprint as an Input/Select so the layout doesn't jump when toggled.
const ReadField = ({ label, value, full }) => (
  <Field label={label} full={full}>
    <div style={{ width:"100%", boxSizing:"border-box", padding:"9px 13px", borderRadius:9, border:"1px solid rgba(15,33,56,0.10)", fontSize:14, color:"#0F2138", background:"#F5F7FA", minHeight:38, display:"flex", alignItems:"center" }}>
      {value === "" || value === null || value === undefined ? "—" : value}
    </div>
  </Field>
);

const editToggleBtn = (active) => ({
  padding:"6px 16px", borderRadius:8, border:`1.5px solid ${active ? "#1F5C99" : "rgba(15,33,56,0.18)"}`,
  background: active ? "#1F5C99" : "transparent", color: active ? "#fff" : "#1F5C99",
  cursor:"pointer", fontFamily:"inherit", fontSize:12.5, fontWeight:700,
});

const Input = (props) => (
  <input {...props} style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(15,33,56,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#0F2138", background:"#fff", outline:"none", boxSizing:"border-box" }} />
);

const Select = ({ children, ...props }) => (
  <select {...props} style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(15,33,56,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#0F2138", background:"#fff", outline:"none", boxSizing:"border-box" }}>
    {children}
  </select>
);

const RadioRow = ({ label, options, value, onChange, required, full }) => (
  <Field label={label} required={required} full={full}>
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          style={{ padding:"8px 20px", borderRadius:20, border:"2px solid", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, transition:"background 0.12s, border-color 0.12s, color 0.12s",
            background: value === opt ? "#1F5C99" : "#ffffff",
            color:       value === opt ? "#ffffff" : "#526073",
            borderColor: value === opt ? "#1F5C99" : "rgba(15,33,56,0.18)" }}>
          {opt}
        </button>
      ))}
    </div>
  </Field>
);

const detailsGrid = { display:"grid", gridTemplateColumns:"repeat(3, minmax(0,1fr))", gap:"4px 20px", alignItems:"start" };

// Quantity, Price per Unit and Discount always sit at the very end of a
// subtype's spec form, as the last three numbered points — startNum is
// whatever number comes right after that subtype's last field.
const QtyPriceFields = ({ startNum, qty, price, discount, setQty, setPrice, setDiscount }) => (
  <>
    <Field label={`${startNum}. Quantity`} required>
      <Input type="number" placeholder="e.g. 10" value={qty} onChange={e => setQty(e.target.value)} />
    </Field>
    <Field label={`${startNum + 1}. Price per Unit (₹)`} required>
      <Input type="number" placeholder="e.g. 480" value={price} onChange={e => setPrice(e.target.value)} />
    </Field>
    <Field label={`${startNum + 2}. Discount (%)`}>
      <Input type="number" placeholder="0" min={0} max={100} value={discount} onChange={e => setDiscount(e.target.value)} />
    </Field>
  </>
);

// ─── Per-product detail forms ─────────────────────────────────────────────────
function DhotiDetails({ d, set, qty, price, discount, setQty, setPrice, setDiscount }) {
  return (
    <div style={detailsGrid}>
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
      <QtyPriceFields startNum={10} qty={qty} price={price} discount={discount} setQty={setQty} setPrice={setPrice} setDiscount={setDiscount} />
    </div>
  );
}

function BlouseDetails({ d, set, qty, price, discount, setQty, setPrice, setDiscount }) {
  return (
    <div style={detailsGrid}>
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
      <Field label="9. Special Notes" full>
        <textarea placeholder="Any additional requirements…" value={d.specialNotes} onChange={e => set("specialNotes", e.target.value)} rows={2}
          style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(15,33,56,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#0F2138", background:"#fff", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
      </Field>
      <QtyPriceFields startNum={10} qty={qty} price={price} discount={discount} setQty={setQty} setPrice={setPrice} setDiscount={setDiscount} />
    </div>
  );
}

function UniformDetails({ d, set, qty, price, discount, setQty, setPrice, setDiscount }) {
  return (
    <div style={detailsGrid}>
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
      <QtyPriceFields startNum={10} qty={qty} price={price} discount={discount} setQty={setQty} setPrice={setPrice} setDiscount={setDiscount} />
    </div>
  );
}

function OthersDetails({ d, set, qty, price, discount, setQty, setPrice, setDiscount }) {
  return (
    <div style={detailsGrid}>
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
      <Field label="8. Additional Notes" full>
        <textarea placeholder="Any other specifications…" value={d.additionalNotes} onChange={e => set("additionalNotes", e.target.value)} rows={2}
          style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(15,33,56,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#0F2138", background:"#fff", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
      </Field>
      <QtyPriceFields startNum={9} qty={qty} price={price} discount={discount} setQty={setQty} setPrice={setPrice} setDiscount={setDiscount} />
    </div>
  );
}

function PantDetails({ d, set, qty, price, discount, setQty, setPrice, setDiscount }) {
  return (
    <div style={detailsGrid}>
      <Field label="1. Fabric Type" required>
        <Select value={d.fabricType} onChange={e => set("fabricType", e.target.value)}>
          <option value="">Select fabric…</option>
          {PANT_FABRIC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="2. Color Required">
        <Input placeholder="e.g. Navy, Grey, Khaki…" value={d.color} onChange={e => set("color", e.target.value)} />
      </Field>
      <Field label="3. Waist Size">
        <Select value={d.waistSize} onChange={e => set("waistSize", e.target.value)}>
          <option value="">Select waist size…</option>
          {WAIST_SIZE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      {d.waistSize === "Custom" && (
        <Field label="Custom Waist Size">
          <Input placeholder="e.g. 33" value={d.customWaistSize} onChange={e => set("customWaistSize", e.target.value)} />
        </Field>
      )}
      <RadioRow label="4. Fit" options={PANT_FIT_OPTIONS} value={d.fit} onChange={v => set("fit", v)} />
      <RadioRow label="5. Pockets" options={["Standard","Cargo","No Pockets"]} value={d.pockets} onChange={v => set("pockets", v)} />
      <RadioRow label="6. Sample Required?" options={["Yes","No"]} value={d.sampleRequired} onChange={v => set("sampleRequired", v)} />
      <Field label="7. Special Notes" full>
        <textarea placeholder="Any additional requirements…" value={d.specialNotes} onChange={e => set("specialNotes", e.target.value)} rows={2}
          style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(15,33,56,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#0F2138", background:"#fff", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
      </Field>
      <QtyPriceFields startNum={8} qty={qty} price={price} discount={discount} setQty={setQty} setPrice={setPrice} setDiscount={setDiscount} />
    </div>
  );
}

function ShirtDetails({ d, set, qty, price, discount, setQty, setPrice, setDiscount }) {
  return (
    <div style={detailsGrid}>
      <Field label="1. Fabric Type" required>
        <Select value={d.fabricType} onChange={e => set("fabricType", e.target.value)}>
          <option value="">Select fabric…</option>
          {SHIRT_FABRIC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="2. Color / Pattern">
        <Input placeholder="e.g. White, Sky Blue Check…" value={d.color} onChange={e => set("color", e.target.value)} />
      </Field>
      <Field label="3. Collar Type">
        <Select value={d.collarType} onChange={e => set("collarType", e.target.value)}>
          <option value="">Select collar type…</option>
          {SHIRT_COLLAR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <RadioRow label="4. Sleeve" options={SLEEVE_OPTIONS} value={d.sleeve} onChange={v => set("sleeve", v)} />
      <RadioRow label="5. Fit" options={["Regular","Slim","Relaxed"]} value={d.fit} onChange={v => set("fit", v)} />
      <RadioRow label="6. Pocket?" options={["Yes","No"]} value={d.pocket} onChange={v => set("pocket", v)} />
      <RadioRow label="7. Sample Required?" options={["Yes","No"]} value={d.sampleRequired} onChange={v => set("sampleRequired", v)} />
      <Field label="8. Special Notes" full>
        <textarea placeholder="Any additional requirements…" value={d.specialNotes} onChange={e => set("specialNotes", e.target.value)} rows={2}
          style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(15,33,56,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#0F2138", background:"#fff", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
      </Field>
      <QtyPriceFields startNum={9} qty={qty} price={price} discount={discount} setQty={setQty} setPrice={setPrice} setDiscount={setDiscount} />
    </div>
  );
}

function LeggingsDetails({ d, set, qty, price, discount, setQty, setPrice, setDiscount }) {
  return (
    <div style={detailsGrid}>
      <Field label="1. Fabric Type" required>
        <Select value={d.fabricType} onChange={e => set("fabricType", e.target.value)}>
          <option value="">Select fabric…</option>
          {LEGGINGS_FABRIC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="2. Color Required">
        <Input placeholder="e.g. Black, Navy, Maroon…" value={d.color} onChange={e => set("color", e.target.value)} />
      </Field>
      <Field label="3. Length">
        <Select value={d.length} onChange={e => set("length", e.target.value)}>
          <option value="">Select length…</option>
          {LEGGINGS_LENGTH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <RadioRow label="4. Waist Style" options={WAIST_STYLE_OPTIONS} value={d.waistStyle} onChange={v => set("waistStyle", v)} />
      <RadioRow label="5. Fabric Feel" options={FABRIC_FEEL_OPTIONS} value={d.fabricFeel} onChange={v => set("fabricFeel", v)} />
      <RadioRow label="6. Sample Required?" options={["Yes","No"]} value={d.sampleRequired} onChange={v => set("sampleRequired", v)} />
      <Field label="7. Special Notes" full>
        <textarea placeholder="Any additional requirements…" value={d.specialNotes} onChange={e => set("specialNotes", e.target.value)} rows={2}
          style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${"rgba(15,33,56,0.18)"}`, fontSize:14, fontFamily:"inherit", color:"#0F2138", background:"#fff", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
      </Field>
      <QtyPriceFields startNum={8} qty={qty} price={price} discount={discount} setQty={setQty} setPrice={setPrice} setDiscount={setDiscount} />
    </div>
  );
}

// ─── Default detail state per subtype ────────────────────────────────────────
const defaultDetails = {
  dhoti:    { dhotiType:"", fabricCount:"", length:"", customLength:"", borderColor:"", borderDesign:"", bodyColor:"", customBodyColor:"", finish:"", packaging:"", sampleRequired:"" },
  blouse:   { fabricType:"", colorRequired:"", matchingSareeShade:"", width:"", customWidth:"", design:"", zariRequired:"", embroideryBase:"", sampleRequired:"", specialNotes:"" },
  pant:     { fabricType:"", color:"", waistSize:"", customWaistSize:"", fit:"", pockets:"", sampleRequired:"", specialNotes:"" },
  shirt:    { fabricType:"", color:"", collarType:"", sleeve:"", fit:"", pocket:"", sampleRequired:"", specialNotes:"" },
  leggings: { fabricType:"", color:"", length:"", waistStyle:"", fabricFeel:"", sampleRequired:"", specialNotes:"" },
  uniform:  { uniformFor:"", shirtFabric:"", pantFabric:"", color:"", colorSampleAvailable:"", logoEmbroidery:"", printing:"", fabricFeel:"", deliveryPriority:"" },
  others:   { productName:"", fabricPurpose:"", colorRequirement:"", widthPreference:"", referenceSampleAvailable:"", specialFinish:"", qualityExpectations:"", additionalNotes:"" },
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function AddOrder() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);

  const card      = { background:themeG.card, border:`1px solid ${themeG.border}`, borderRadius:14, padding:20, boxShadow:"0 4px 16px rgba(46,122,114,0.05)", minWidth:0, width:"100%", boxSizing:"border-box" };
  const cardTitle = { fontFamily:"'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize:15, fontWeight:700, margin:"0 0 14px", color:themeG.textMain };

  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const [searchParams] = useSearchParams();
  const fromEnquiry = searchParams.get("fromEnquiry");
  const prefillCustomerId = searchParams.get("customerId");
  const prefillProductId = searchParams.get("productId");

  const getStoredCat = () => localStorage.getItem("premier_category") || "cloth";
  const [tab,     setTab]     = useState(getStoredCat);
  const [subType, setSubType] = useState(() => getStoredCat() === "yarn" ? "bundle" : "dhoti");
  // itemDiscount = discount on the product currently being drafted in
  // box 2 (per-product). discount = overall order-level discount, set
  // in Payment & Delivery, applied on top of the summed item totals.
  const [form, setForm]       = useState({ customerId:"", productId:"", qty:"", pricePerUnit:"", deliveryDate:"", notes:"", discount:"", itemDiscount:"", enquiryOrderNo:"", enquiryOrderDate:"" });
  // FIX: lazy-initialize to match the initial tab/subType (defaults to
  // "cloth" / "dhoti") instead of starting as null. Previously this only
  // ever got set inside handleTabChange / handleSubTypeChange / the
  // fromEnquiry fetch effect — so on a fresh "+ Add Enquiry" visit,
  // picking a customer + product for the very first time left `details`
  // as null, `showDetailsCard && details` was falsy, and the page fell
  // through to the plain Quantity & Price box instead of Dhoti Details.
  const [details, setDetails] = useState(() => {
    const cat = getStoredCat();
    const st  = cat === "yarn" ? "bundle" : "dhoti";
    return cat === "cloth" ? { ...defaultDetails[st] } : null;
  });

  // Multiple products can now be added to a single order. `items` holds
  // everything already added; the fields above (productId/qty/price/
  // itemDiscount/details) are always the "next product" being drafted.
  const [items, setItems] = useState([]);

  const [customers, setCustomers] = useState([]);
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  // Order Details and Payment & Delivery arrive pre-filled from the
  // approved enquiry, so both start locked (read-only) — staff click
  // "Edit" on the box they actually need to change, instead of every
  // field being wide open by default.
  const [editDetails, setEditDetails] = useState(!fromEnquiry);
  const [editPayment, setEditPayment] = useState(!fromEnquiry);
  const defaultSubtype        = tab === "yarn" ? "Bundle" : "Dhoti";


  useEffect(() => {
    (async () => {
      try {
        const [custRes, prodRes] = await Promise.all([API.get("/customers"), API.get("/products")]);
        setCustomers(custRes.data);
        setProducts(prodRes.data);

        // Coming from an approved Order Enquiry — pre-fill customer,
        // product, category/sub-type and starting price so staff only
        // has to confirm/adjust before placing the formal order.
        if (fromEnquiry && prefillProductId) {
          const p = prodRes.data.find((pr) => String(pr.Id) === String(prefillProductId));

          // Pull the source enquiry's own order number, quantity, price,
          // discount, product-spec fields (box 2 — Dhoti Type, Length,
          // Colour, etc., saved as Order.OrderDetails) and delivery
          // date / remarks (box 3) so the whole draft is genuinely
          // pre-filled with whatever was entered before — not just
          // customer/product. Fetched BEFORE box 2's state is set, so
          // it can be merged in below instead of the blank template.
          // If the fetch fails, fall back to an auto-generated order
          // number and leave the rest for staff to fill in manually.
          // Date always defaults to today — the day this order is
          // actually being placed.
          let enquiryCode = "", enquiryQty = "", enquiryPrice = p ? p.Price : "", enquiryDiscount = "";
          let enquiryDetails = null, enquiryDeliveryDate = "", enquiryNotes = "";
          try {
            const enqRes = await API.get(`/orders/${fromEnquiry}`);
            enquiryCode = enqRes.data?.Code || "";
            if (enqRes.data?.Quantity != null) enquiryQty = enqRes.data.Quantity;
            if (enqRes.data?.PricePerUnit != null) enquiryPrice = enqRes.data.PricePerUnit;
            if (enqRes.data?.DiscountPct != null) enquiryDiscount = enqRes.data.DiscountPct;
            if (enqRes.data?.OrderDetails) enquiryDetails = enqRes.data.OrderDetails;
            if (enqRes.data?.DeliveryDate) enquiryDeliveryDate = enqRes.data.DeliveryDate;
            if (enqRes.data?.Notes) enquiryNotes = enqRes.data.Notes;
          } catch { /* fall through to auto-generated code below */ }
          if (!enquiryCode) enquiryCode = `ENQ-${String(fromEnquiry).padStart(4, "0")}`;
          const today = new Date().toISOString().substring(0, 10);

          if (p) {
            localStorage.setItem("premier_category", p.Category);
            setTab(p.Category);
            setSubType(p.SubType);
            if (p.Category === "cloth" && ["dhoti", "blouse", "pant", "shirt", "leggings", "uniform", "others"].includes(p.SubType)) {
              // Merge whatever was actually filled in before over the
              // blank template, so box 2 shows the real, previously
              // entered spec values instead of resetting every time.
              setDetails({ ...defaultDetails[p.SubType], ...(enquiryDetails || {}) });
            }
          }

          setForm((f) => ({
            ...f,
            customerId: prefillCustomerId || "",
            productId: prefillProductId || "",
            qty: enquiryQty || f.qty,
            pricePerUnit: enquiryPrice || f.pricePerUnit,
            itemDiscount: enquiryDiscount || f.itemDiscount,
            deliveryDate: enquiryDeliveryDate || f.deliveryDate,
            notes: enquiryNotes || f.notes,
            enquiryOrderNo: enquiryCode,
            enquiryOrderDate: today,
          }));
        } else {
          // No source enquiry — this is a manual "+ Add Enquiry" entry.
          // Still auto-generate an order number and default the date to
          // today, same as the enquiry-conversion path, so both flows
          // present consistently.
          const today = new Date().toISOString().substring(0, 10);
          setForm((f) => ({
            ...f,
            enquiryOrderNo: `ENQ-${Date.now().toString().slice(-6)}`,
            enquiryOrderDate: today,
          }));
        }
      } catch {
        setError("Failed to load customers/products.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setDetailField = (k, v) => setDetails(d => ({ ...d, [k]: v }));

  const subtypes    = tab === "yarn" ? YARN_SUBTYPES : CLOTH_SUBTYPES;
  const productList = products.filter(p => p.Category === tab && p.SubType === subType);
  const selectedProduct = products.find(p => String(p.Id) === String(form.productId));
  const itemAmount = (i) => parseFloat(i.qty) * parseFloat(i.pricePerUnit) * (1 - (parseFloat(i.discount) || 0) / 100);

  // Draft (box 2, not yet added) uses its own itemDiscount. Once summed
  // with everything already added, the order-level discount (Payment &
  // Delivery) is applied on top of that subtotal.
  const draftTotal = form.qty && form.pricePerUnit
    ? parseFloat(form.qty) * parseFloat(form.pricePerUnit) * (1 - (parseFloat(form.itemDiscount) || 0) / 100)
    : 0;
  const itemsTotal = items.reduce((s, i) => s + itemAmount(i), 0);
  const subTotal   = itemsTotal + draftTotal;
  const grandTotal = subTotal * (1 - (parseFloat(form.discount) || 0) / 100);
  const total = grandTotal > 0 ? grandTotal.toFixed(2) : "—";

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

  // Turn the currently-drafted product fields into an item, if they're
  // filled in enough to be one. Returns null if the draft is empty/incomplete.
  const buildDraftItem = () => {
    if (!form.productId || !form.qty || !form.pricePerUnit) return null;
    const product = products.find((pr) => String(pr.Id) === String(form.productId));
    return {
      tempId: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: tab,
      subType,
      productId: form.productId,
      productLabel: product ? `${product.Name} (${product.Code})` : `Product #${form.productId}`,
      qty: form.qty,
      pricePerUnit: form.pricePerUnit,
      discount: form.itemDiscount || 0,
      details: details ? { ...details } : null,
    };
  };

  const resetDraftAfterAdd = () => {
    setForm((f) => ({ ...f, productId: "", qty: "", pricePerUnit: "", itemDiscount: "" }));
    setDetails(tab === "cloth" && ["dhoti", "blouse", "pant", "shirt", "leggings", "uniform", "others"].includes(subType) ? { ...defaultDetails[subType] } : null);
  };

  // The one field per sub-type marked "required" (*) in its spec box —
  // a product can't be added until at least this much of the spec is
  // filled in, so items never get added with a blank spec box.
  const REQUIRED_DETAIL_KEY = {
    dhoti: "dhotiType", blouse: "fabricType", pant: "fabricType", shirt: "fabricType",
    leggings: "fabricType", uniform: "uniformFor", others: "productName",
  };

  const handleAddItem = () => {
    const item = buildDraftItem();
    if (!item) {
      setError("Pick a product, quantity and price before adding it to the order.");
      return;
    }
    if (showDetailsCard) {
      const requiredKey = REQUIRED_DETAIL_KEY[subType];
      if (requiredKey && !details?.[requiredKey]) {
        setError(`Fill in the required specification (marked *) in ${subType[0].toUpperCase()}${subType.slice(1)} Details before adding this product.`);
        return;
      }
    }
    setItems((prev) => [...prev, item]);
    setError("");
    resetDraftAfterAdd();
  };

  const handleRemoveItem = (tempId) => {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  // Edit a product already added: pull it back into the draft fields
  // (and its spec box) so it can be changed, then re-added via the
  // same "+ Add" button — removes it from the list meanwhile so it
  // isn't double-counted.
  const handleEditItem = (item) => {
    setForm((f) => ({ ...f, productId: item.productId, qty: item.qty, pricePerUnit: item.pricePerUnit, itemDiscount: item.discount || "" }));
    setSubType(item.subType);
    setDetails(item.details ? { ...item.details } : (defaultDetails[item.subType] ? { ...defaultDetails[item.subType] } : null));
    setItems((prev) => prev.filter((i) => i.tempId !== item.tempId));
    setError("");
  };

  const handleUpdateQty = (tempId, delta) => {
    setItems((prev) => prev.map((i) => {
      if (i.tempId !== tempId) return i;
      const next = Math.max(1, (parseInt(i.qty, 10) || 0) + delta);
      return { ...i, qty: next };
    }));
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.customerId) {
      setError("Please select a customer.");
      return;
    }

    // Whatever is still sitting in the draft fields counts as one more
    // item, so the person doesn't have to click "+ Add" for the very
    // last (or only) product before placing the order.
    const draftItem = buildDraftItem();
    const finalItems = draftItem ? [...items, draftItem] : items;

    if (finalItems.length === 0) {
      setError("Add at least one product to the order (pick product, quantity and price).");
      return;
    }

    setSaving(true);
    try {
      // Multiple products in one order are still separate Order rows
      // under the hood, tagged with a shared GroupRef so they display,
      // edit and delete together as one order everywhere in the app.
      const groupRef = finalItems.length > 1 ? `GRP-${Date.now()}` : null;

      // Coming from an approved enquiry: that enquiry IS this order —
      // update its own row in place with the confirmed qty/price/specs
      // rather than creating a brand new row and leaving the original
      // enquiry stranded behind it. Only the first item does this; any
      // further "+ Add" items are still new rows sharing the GroupRef,
      // same as a normal multi-product order.
      let first = true;
      for (const item of finalItems) {
        const orderDetails = { ...(item.details || {}) };
        if (groupRef) orderDetails.GroupRef = groupRef;
        if (form.enquiryOrderNo) orderDetails.EnquiryOrderNo = form.enquiryOrderNo;
        if (form.enquiryOrderDate) orderDetails.EnquiryOrderDate = form.enquiryOrderDate;

        if (fromEnquiry && first) {
          // O2C Step 4 — Marketing (admin/end_user) places the order but
          // the Marketing Head (system_admin) gives the real, final
          // approval. So this submit only sets status="approved" when the
          // Marketing Head themselves is the one placing/finalizing it;
          // otherwise it stays "assigned" (placed, priced, dated — just
          // waiting in the Final Approval queue).
          await API.put(`/orders/${fromEnquiry}`, {
            qty:          item.qty,
            pricePerUnit: item.pricePerUnit,
            discount:     item.discount || 0,
            deliveryDate: form.deliveryDate || null,
            notes:        form.notes || null,
            status:       role === "system_admin" ? "approved" : "assigned",
            orderDetails: Object.keys(orderDetails).length ? orderDetails : null,
          });
        } else {
          await API.post("/orders", {
            customerId:   form.customerId,
            productId:    item.productId,
            qty:          item.qty,
            pricePerUnit: item.pricePerUnit,
            discount:     item.discount || 0,
            deliveryDate: form.deliveryDate || null,
            notes:        form.notes || null,
            orderDetails: Object.keys(orderDetails).length ? orderDetails : null,
          });
        }
        first = false;
      }

      navigate("/master/enquiry");
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

  // Coming in via "+ Add Enquiry" (no source enquiry) opens this page
  // fully unlocked and blank, ready for a manual entry — everything
  // below defaults to edit mode in that case (see editDetails/editPayment
  // above). Coming in from Order Enquiry pre-fills and locks things down
  // instead.

  const showDetailsCard = tab === "cloth" && ["dhoti","blouse","pant","shirt","leggings","uniform","others"].includes(subType);

  return (
    <Layout pageTitle="Add Order">

      {/* ── Category locked badge ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap: "wrap" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 18px", borderRadius:10, background:themeG.card, border:`1px solid ${themeG.border}`, boxShadow:"0 2px 8px rgba(46,122,114,0.06)" }}>
          <span style={{ fontSize:18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily:"inherit", fontSize:14, fontWeight:700, color:themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"}</span>
        </div>
        <span style={{ fontSize:12, color:themeG.textSub }}>
          Category locked — <span style={{ color:themeG.accent, cursor:"pointer", textDecoration:"underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      {fromEnquiry && (
        <div style={{ marginBottom: 20, background: "rgba(58,37,96,0.08)", border: "1px solid rgba(58,37,96,0.25)", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#3A2560", fontWeight: 600 }}>
          Converting enquiry #{fromEnquiry} — customer and product are pre-filled below. Confirm price, discount, delivery date and specs, then Approve or Place Order.
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

        {error && (
          <div style={{ background:"rgba(178,58,58,0.08)", border:"1px solid rgba(178,58,58,0.25)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#B23A3A" }}>
            {error}
          </div>
        )}

        {/* ── 1. Order Details — compact, landscape. Locked by default
              (it's pre-filled from the enquiry); "Edit" unlocks it.
              Enquiry Order No / Date come first, then Customer /
              Product. Quantity and Price per Unit live in the product
              spec box below, right alongside the product they belong to.
              Edit/Done button now sits at the bottom of the card. ── */}
        <div style={card}>
          <h3 style={{ ...cardTitle }}>Order Details</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:"4px 20px", alignItems:"start" }}>
            <Field label="Sub-type" full>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {subtypes.map(t => (
                  <button key={t} disabled={!editDetails} onClick={() => editDetails && handleSubTypeChange(t)}
                    style={{ padding:"8px 20px", borderRadius:20, border:"2px solid", cursor: editDetails ? "pointer" : "default", fontFamily:"inherit", fontSize:13, fontWeight:700, transition:"background 0.12s, border-color 0.12s, color 0.12s", textTransform:"capitalize", opacity: editDetails ? 1 : 0.65,
                      background: subType === t ? themeG.accent : themeG.card,
                      color:       subType === t ? "#ffffff" : themeG.textSub,
                      borderColor: subType === t ? themeG.accent  : themeG.border }}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Enquiry Order No">
              <Input type="text" value={form.enquiryOrderNo} disabled />
            </Field>

            <Field label="Enquiry Order Date">
              <Input type="date" value={form.enquiryOrderDate} disabled />
            </Field>

            {editDetails ? (
              <>
                <Field label="Customer" required>
                  <Select value={form.customerId} onChange={e => set("customerId", e.target.value)}>
                    <option value="">Select customer…</option>
                    {customers.map(c => <option key={c.Id} value={c.Id}>{c.Name} ({c.Code})</option>)}
                  </Select>
                </Field>

                <Field label="Product" required>
                  <Select value={form.productId} onChange={e => handleProductPick(e.target.value)}>
                    <option value="">Select product…</option>
                    {productList.map(p => <option key={p.Id} value={p.Id}>{p.Name} ({p.Code})</option>)}
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <ReadField label="Customer" value={customers.find(c => String(c.Id) === String(form.customerId)) ? `${customers.find(c => String(c.Id) === String(form.customerId)).Name} (${customers.find(c => String(c.Id) === String(form.customerId)).Code})` : "—"} />
                <ReadField label="Product" value={selectedProduct ? `${selectedProduct.Name} (${selectedProduct.Code})` : "—"} />
              </>
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
            <button type="button" onClick={() => setEditDetails(v => !v)}
              style={{ padding:"9px 24px", borderRadius:9, border:"none", cursor:"pointer",
                fontFamily:"inherit", fontSize:13, fontWeight:700, color:"#fff",
                background: editDetails ? "#6D28D9" : "#8B5CF6",
                boxShadow:"0 4px 12px rgba(109,40,217,0.35)" }}>
              {editDetails ? "Done" : "Edit"}
            </button>
          </div>
        </div>

        {/* ── 2. Sub-type specific details — landscape. Only appears once
              a Product has actually been selected in box 1. Quantity,
              Price per Unit and Discount are the last three numbered
              points in each subtype's field list (numbering varies by
              subtype since they have different field counts). The
              "+ Add" button now sits at the bottom of the card. ── */}
        {form.productId && (
          showDetailsCard && details ? (
            <div style={card}>
              <h3 style={{ ...cardTitle }}>
                {subType === "dhoti"    && "Dhoti Details"}
                {subType === "blouse"   && "Blouse Fabric Details"}
                {subType === "pant"     && "Pant Details"}
                {subType === "shirt"    && "Shirt Details"}
                {subType === "leggings" && "Leggings Details"}
                {subType === "uniform"  && "Uniform Details"}
                {subType === "others"   && "Product Details"}
              </h3>

              {subType === "dhoti"    && <DhotiDetails    d={details} set={setDetailField} qty={form.qty} price={form.pricePerUnit} discount={form.itemDiscount} setQty={v => set("qty", v)} setPrice={v => set("pricePerUnit", v)} setDiscount={v => set("itemDiscount", v)} />}
              {subType === "blouse"   && <BlouseDetails   d={details} set={setDetailField} qty={form.qty} price={form.pricePerUnit} discount={form.itemDiscount} setQty={v => set("qty", v)} setPrice={v => set("pricePerUnit", v)} setDiscount={v => set("itemDiscount", v)} />}
              {subType === "pant"     && <PantDetails     d={details} set={setDetailField} qty={form.qty} price={form.pricePerUnit} discount={form.itemDiscount} setQty={v => set("qty", v)} setPrice={v => set("pricePerUnit", v)} setDiscount={v => set("itemDiscount", v)} />}
              {subType === "shirt"    && <ShirtDetails    d={details} set={setDetailField} qty={form.qty} price={form.pricePerUnit} discount={form.itemDiscount} setQty={v => set("qty", v)} setPrice={v => set("pricePerUnit", v)} setDiscount={v => set("itemDiscount", v)} />}
              {subType === "leggings" && <LeggingsDetails d={details} set={setDetailField} qty={form.qty} price={form.pricePerUnit} discount={form.itemDiscount} setQty={v => set("qty", v)} setPrice={v => set("pricePerUnit", v)} setDiscount={v => set("itemDiscount", v)} />}
              {subType === "uniform"  && <UniformDetails  d={details} set={setDetailField} qty={form.qty} price={form.pricePerUnit} discount={form.itemDiscount} setQty={v => set("qty", v)} setPrice={v => set("pricePerUnit", v)} setDiscount={v => set("itemDiscount", v)} />}
              {subType === "others"   && <OthersDetails   d={details} set={setDetailField} qty={form.qty} price={form.pricePerUnit} discount={form.itemDiscount} setQty={v => set("qty", v)} setPrice={v => set("pricePerUnit", v)} setDiscount={v => set("itemDiscount", v)} />}

              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
                <button type="button" onClick={handleAddItem}
                  style={{ padding:"10px 28px", borderRadius:9, border:"none", cursor:"pointer",
                    fontFamily:"inherit", fontSize:13, fontWeight:700, color:"#fff",
                    background:"#059669", boxShadow:"0 4px 12px rgba(5,150,105,0.35)" }}>
                  + Add
                </button>
              </div>
            </div>
          ) : (
            <div style={card}>
              <h3 style={{ ...cardTitle }}>Product Quantity &amp; Price</h3>
              <div style={detailsGrid}>
                <Field label="Quantity" required>
                  <Input type="number" placeholder="e.g. 10" value={form.qty} onChange={e => set("qty", e.target.value)} />
                </Field>
                <Field label="Price per Unit (₹)" required>
                  <Input type="number" placeholder="e.g. 480" value={form.pricePerUnit} onChange={e => set("pricePerUnit", e.target.value)} />
                </Field>
                <Field label="Discount (%)">
                  <Input type="number" placeholder="0" min={0} max={100} value={form.itemDiscount} onChange={e => set("itemDiscount", e.target.value)} />
                </Field>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
                <button type="button" onClick={handleAddItem}
                  style={{ padding:"10px 28px", borderRadius:9, border:"none", cursor:"pointer",
                    fontFamily:"inherit", fontSize:13, fontWeight:700, color:"#fff",
                    background:"#0284C7", boxShadow:"0 4px 12px rgba(2,132,199,0.35)" }}>
                  + Add
                </button>
              </div>
            </div>
          )
        )}

        {/* ── 3. Products in this order — full width, easy to scan. Only
              appears once at least one product has actually been added
              via "+ Add" in box 2. ── */}
        {items.length > 0 && (
          <div style={card}>
            <h3 style={cardTitle}>Products in this Order ({items.length})</h3>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {["#","Product","Sub-type","Qty","Price/Unit","Discount","Amount",""].map(h => (
                    <th key={h} style={{ textAlign:"left", fontSize:11, color:themeG.textLabel, padding:"10px 12px", borderBottom:`2px solid ${themeG.border}`, textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={i.tempId}>
                    <td style={{ padding:"11px 12px", fontSize:13, color:themeG.textSub, borderBottom:`1px solid ${themeG.border}` }}>{idx + 1}</td>
                    <td style={{ padding:"11px 12px", fontSize:13, color:themeG.textMain, borderBottom:`1px solid ${themeG.border}` }}>{i.productLabel}</td>
                    <td style={{ padding:"11px 12px", fontSize:13, color:themeG.textSub, borderBottom:`1px solid ${themeG.border}`, textTransform:"capitalize" }}>{i.subType}</td>
                    <td style={{ padding:"11px 12px", fontSize:13, borderBottom:`1px solid ${themeG.border}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <button type="button" onClick={() => handleUpdateQty(i.tempId, -1)}
                          style={{ width:24, height:24, borderRadius:6, border:`1px solid ${themeG.border}`, background:themeG.card, color:themeG.textMain, cursor:"pointer", fontSize:14, fontWeight:700, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          −
                        </button>
                        <span style={{ minWidth:24, textAlign:"center", fontWeight:600 }}>{i.qty}</span>
                        <button type="button" onClick={() => handleUpdateQty(i.tempId, 1)}
                          style={{ width:24, height:24, borderRadius:6, border:`1px solid ${themeG.border}`, background:themeG.card, color:themeG.textMain, cursor:"pointer", fontSize:14, fontWeight:700, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          +
                        </button>
                      </div>
                    </td>
                    <td style={{ padding:"11px 12px", fontSize:13, borderBottom:`1px solid ${themeG.border}` }}>₹{parseFloat(i.pricePerUnit).toLocaleString()}</td>
                    <td style={{ padding:"11px 12px", fontSize:13, borderBottom:`1px solid ${themeG.border}` }}>{i.discount ? `${i.discount}%` : "0%"}</td>
                    <td style={{ padding:"11px 12px", fontSize:13, fontWeight:700, borderBottom:`1px solid ${themeG.border}` }}>₹{itemAmount(i).toLocaleString()}</td>
                    <td style={{ padding:"11px 12px", borderBottom:`1px solid ${themeG.border}` }}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => handleEditItem(i)}
                          style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${themeG.accent}55`, background:`${themeG.accent}14`, color:themeG.accent, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                          Edit
                        </button>
                        <button onClick={() => handleRemoveItem(i.tempId)}
                          style={{ padding:"5px 12px", borderRadius:7, border:"1px solid rgba(178,58,58,0.30)", background:"rgba(178,58,58,0.06)", color:"#B23A3A", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 4. Payment & Delivery — Total Value, Overall Discount,
              Expected Delivery Date, Remarks. Locked until Edit.
              Edit/Done button now sits at the bottom of the card. ── */}
        <div style={card}>
          <h3 style={{ ...cardTitle }}>Payment & Delivery</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:"4px 20px", alignItems:"start" }}>
            <ReadField label="Total Value" value={total !== "—" ? `₹${parseFloat(total).toLocaleString()}` : "₹0"} />

            {editPayment ? (
              <Field label="Overall Discount (%)">
                <Input type="number" placeholder="0" min={0} max={100} value={form.discount} onChange={e => set("discount", e.target.value)} />
              </Field>
            ) : (
              <ReadField label="Overall Discount" value={form.discount ? `${form.discount}%` : "0%"} />
            )}

            {editPayment ? (
              <Field label="Expected Delivery Date">
                <Input type="date" value={form.deliveryDate} onChange={e => set("deliveryDate", e.target.value)} />
              </Field>
            ) : (
              <ReadField label="Expected Delivery Date" value={form.deliveryDate || "—"} />
            )}

            {editPayment ? (
              <Field label="Remarks" full>
                <textarea placeholder="Special instructions, etc." value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
                  style={{ width:"100%", padding:"9px 13px", borderRadius:9, border:`1px solid ${themeG.border}`, fontSize:14, fontFamily:"inherit", color:themeG.textMain, background:themeG.card, outline:"none", resize:"vertical", boxSizing:"border-box" }} />
              </Field>
            ) : (
              <ReadField label="Remarks" value={form.notes || "—"} />
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
            <button type="button" onClick={() => setEditPayment(v => !v)}
              style={{ padding:"9px 24px", borderRadius:9, border:"none", cursor:"pointer",
                fontFamily:"inherit", fontSize:13, fontWeight:700, color:"#fff",
                background: editPayment ? "#D97706" : "#F59E0B",
                boxShadow:"0 4px 12px rgba(217,119,6,0.35)" }}>
              {editPayment ? "Done" : "Edit"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:12, marginTop:28, justifyContent:"flex-end" }}>
        <button onClick={() => navigate("/master/orders")}
          style={{ padding:"10px 24px", borderRadius:9, border:`1px solid ${themeG.border}`, background:themeG.card, color:themeG.textSub, cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:500 }}>
          Cancel
        </button>
        <button onClick={() => { setEditDetails(true); setEditPayment(true); }}
          style={{ padding:"10px 24px", borderRadius:9, border:"1.5px solid #1F5C99", background:"transparent", color:"#1F5C99", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700 }}>
          Edit
        </button>
        <button onClick={handleSubmit} disabled={saving}
          style={{ padding:"10px 24px", borderRadius:9, border:`1.5px solid ${themeG.accent}`, background:"transparent", color:themeG.accent, cursor:saving ? "not-allowed" : "pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, opacity:saving ? 0.6 : 1 }}>
          {saving ? "…" : "Approve"}
        </button>
        <button onClick={handleSubmit} disabled={saving}
          style={{ padding:"10px 28px", borderRadius:9, border:"none", background:themeG.accent, color:themeG.card, cursor:saving ? "not-allowed" : "pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, boxShadow:"0 2px 10px rgba(91,155,217,0.32)", opacity:saving ? 0.6 : 1 }}>
          {saving ? "Placing…" : `Place Order${(items.length + (form.productId ? 1 : 0)) > 1 ? ` (${items.length + (form.productId ? 1 : 0)} products)` : ""}`}
        </button>
      </div>
    </Layout>
  );
}