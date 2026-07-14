import { useTheme } from "../../ThemeContext";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { getG, G } from "../../theme";
import API from "../../services/api";

const getThemeColors = () => getG(localStorage.getItem("premier_theme") === "dark");

const DISTRICTS = [
  "Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore","Dharmapuri",
  "Dindigul","Erode","Kallakurichi","Kanchipuram","Kanniyakumari","Karur",
  "Krishnagiri","Madurai","Mayiladuthurai","Nagapattinam","Namakkal",
  "Nilgiris","Perambalur","Pudukkottai","Ramanathapuram","Ranipet","Salem",
  "Sivaganga","Tenkasi","Thanjavur","Theni","Thoothukudi","Tiruchirappalli",
  "Tirunelveli","Tirupathur","Tiruppur","Tiruvallur","Tiruvannamalai",
  "Tiruvarur","Vellore","Viluppuram","Virudhunagar"
];

const TALUKS = {
  Ariyalur: ["Ariyalur","Udayarpalayam","Sendurai","Andimadam"],

  Chengalpattu: ["Chengalpattu","Tambaram","Thirukazhukundram","Cheyyur","Madurantakam","Tiruporur","Vandalur"],

  Chennai: ["Egmore","Nungambakkam","Mylapore","Triplicane","Mambalam","Guindy","Alandur","Velachery","Sholinganallur","Perambur","Purasawalkam","Tondiarpet","Royapuram","Ambattur","Madhavaram","Ayanavaram"],

  Coimbatore: ["Coimbatore North","Coimbatore South","Perur","Madukkarai","Sulur","Pollachi","Kinathukadavu","Valparai","Mettupalayam","Annur"],

  Cuddalore: ["Cuddalore","Panruti","Kurinjipadi","Chidambaram","Kattumannarkoil","Vriddhachalam","Tittakudi","Bhuvanagiri","Srimushnam"],

  Dharmapuri: ["Dharmapuri","Palacode","Pennagaram","Harur","Pappireddipatti","Karimangalam","Nallampalli"],

  Dindigul: ["Dindigul","Athoor","Nilakottai","Vedasandur","Natham","Oddanchatram","Palani","Kodaikanal","Guziliamparai"],

  Erode: ["Erode","Perundurai","Gobichettipalayam","Bhavani","Sathyamangalam","Modakkurichi","Kodumudi","Nambiyur","Anthiyur"],

  Kallakurichi: ["Kallakurichi","Sankarapuram","Chinnasalem","Tirukoilur","Ulundurpet","Kalvarayan Hills"],

  Kanchipuram: ["Kanchipuram","Walajabad","Uthiramerur","Sriperumbudur","Kundrathur"],

  Kanniyakumari: ["Agastheeswaram","Thovalai","Kalkulam","Vilavancode","Killiyoor"],

  Karur: ["Karur","Aravakurichi","Krishnarayapuram","Kulithalai","Manmangalam","K.Paramathi"],

  Krishnagiri: ["Krishnagiri","Hosur","Denkanikottai","Pochampalli","Uthangarai","Bargur","Shoolagiri"],

  Madurai: ["Madurai North","Madurai South","Madurai East","Madurai West","Melur","Tirumangalam","Usilampatti","Vadipatti","Peraiyur","Kalligudi","Thirupparankundram"],

  Mayiladuthurai: ["Mayiladuthurai","Kuthalam","Sirkazhi","Tharangambadi"],

  Nagapattinam: ["Nagapattinam","Kilvelur","Thirukkuvalai","Vedaranyam"],

  Namakkal: ["Namakkal","Tiruchengode","Rasipuram","Paramathi Velur","Mohanur","Sendamangalam","Kolli Hills"],

  Nilgiris: ["Udhagamandalam","Coonoor","Kotagiri","Gudalur","Pandalur","Kundah"],

  Perambalur: ["Perambalur","Kunnam","Veppanthattai","Alathur"],

  Pudukkottai: ["Pudukkottai","Alangudi","Thirumayam","Gandarvakottai","Aranthangi","Avudaiyarkoil","Manamelkudi","Karambakudi","Kulathur","Illuppur"],

  Ramanathapuram: ["Ramanathapuram","Paramakudi","Tiruvadanai","Rameswaram","Kamuthi","Mudukulathur","Kadaladi"],

  Ranipet: ["Ranipet","Walajapet","Arcot","Arakkonam","Nemili","Sholingur","Kalavai"],

  Salem: ["Salem","Omalur","Mettur","Edappadi","Sankari","Attur","Gangavalli","Pethanaickenpalayam","Yercaud","Valapady"],

  Sivaganga: ["Sivaganga","Karaikudi","Devakottai","Tirupattur","Manamadurai","Ilayangudi","Kalaiyarkoil","Singampunari"],

  Tenkasi: ["Tenkasi","Shenkottai","Kadayanallur","Sankarankovil","Vasudevanallur","Alangulam","Sivagiri"],

  Thanjavur: ["Thanjavur","Kumbakonam","Orathanadu","Papanasam","Pattukkottai","Peravurani","Budalur","Thiruvaiyaru"],

  Theni: ["Theni","Periyakulam","Bodinayakanur","Uthamapalayam","Andipatti"],

  Thoothukudi: ["Thoothukudi","Srivaikuntam","Tiruchendur","Sathankulam","Kovilpatti","Ottapidaram","Vilathikulam","Ettayapuram","Kayathar"],

  Tiruchirappalli: ["Tiruchirappalli","Srirangam","Thiruverumbur","Manapparai","Lalgudi","Musiri","Thuraiyur"],

  Tirunelveli: ["Tirunelveli","Palayamkottai","Ambasamudram","Nanguneri","Radhapuram","Cheranmahadevi","Thisayanvilai"],

  Tirupathur: ["Tirupathur","Ambur","Vaniyambadi","Natrampalli"],

  Tiruppur: ["Tiruppur North","Tiruppur South","Avinashi","Palladam","Udumalaipettai","Dharapuram","Kangeyam","Madathukulam"],

  Tiruvallur: ["Tiruvallur","Avadi","Poonamallee","Ambattur","Gummidipoondi","Ponneri","Uthukottai","Pallipattu"],

  Tiruvannamalai: ["Tiruvannamalai","Arani","Cheyyar","Polur","Chengam","Vandavasi","Kilpennathur","Chetpet"],

  Tiruvarur: ["Tiruvarur","Needamangalam","Mannargudi","Nannilam","Kudavasal","Thiruthuraipoondi","Valangaiman"],

  Vellore: ["Vellore","Katpadi","Gudiyatham","Anaicut","K.V. Kuppam","Pernambut"],

  Viluppuram: ["Viluppuram","Vikravandi","Tindivanam","Gingee","Vanur","Kandachipuram","Marakkanam"],

  Virudhunagar: ["Virudhunagar","Aruppukottai","Sivakasi","Sattur","Srivilliputhur","Rajapalayam","Tiruchuli","Vembakottai"]
};

const Field = ({ label, required, children }) => (
  <div style={{ marginBottom: 18 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#101B28", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
      {label}{required && <span style={{ color: "#B23A3A", marginLeft: 3 }}>*</span>}
    </label>
    {children}
  </div>
);

const Input = (props) => (
  <input {...props} style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#ffffff", outline: "none", boxSizing: "border-box" }} />
);

const Select = ({ children, ...props }) => (
  <select {...props} style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${"rgba(15,33,56,0.18)"}`, fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#ffffff", outline: "none", boxSizing: "border-box" }}>
    {children}
  </select>
);

export default function AddCustomer() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const card      = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 24, boxShadow: "0 4px 16px rgba(46,122,114,0.05)" };
  const cardTitle = { fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 16, fontWeight: 600, margin: "0 0 20px", color: themeG.textMain };

  const [form, setForm] = useState({
    name: "", phone: "", email: "", district: "", taluk: "",
    address: "", type: "retail", creditLimit: "", notes: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const taluks = TALUKS[form.district] || [];

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.name || !form.phone || !form.district || !form.taluk) {
      setError("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    try {
      await API.post("/customers", {
        name:        form.name,
        phone:       form.phone,
        email:       form.email || null,
        type:        form.type,
        district:    form.district,
        taluk:       form.taluk,
        address:     form.address || null,
        creditLimit: form.creditLimit || null,
        notes:       form.notes || null,
      });
      navigate("/master/customers");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout pageTitle="Add Customer">

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {error && (
          <div style={{ gridColumn: "1 / -1", background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
            {error}
          </div>
        )}

        <div style={card}>
          <h3 style={cardTitle}>Personal Details</h3>

          <Field label="Full Name" required>
            <Input placeholder="e.g. Ravi Kumar" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>

          <Field label="Phone Number" required>
            <Input type="tel" placeholder="10-digit mobile" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>

          <Field label="Email">
            <Input type="email" placeholder="optional" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>

          <Field label="Customer Type" required>
            <div style={{ display: "flex", gap: 8 }}>
              {["retail","wholesale"].map((t) => (
                <button key={t} onClick={() => set("type", t)}
                  style={{ flex: 1, padding: "9px", borderRadius: 9, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, transition: "all 0.12s",
                    background:  form.type === t ? "rgba(91,155,217,0.15)" : themeG.card,
                    color:       form.type === t ? themeG.accent : themeG.textSub,
                    borderColor: form.type === t ? themeG.accent : themeG.border }}>
                  {t === "retail" ? "🏪 Retail" : "🏭 Wholesale"}
                </button>
              ))}
            </div>
          </Field>

          {form.type === "wholesale" && (
            <Field label="Credit Limit (₹)">
              <Input type="number" placeholder="e.g. 50000" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
            </Field>
          )}
        </div>

        <div style={card}>
          <h3 style={cardTitle}>Location Details</h3>

          <Field label="District" required>
            <Select value={form.district} onChange={(e) => { set("district", e.target.value); set("taluk", ""); }}>
              <option value="">Select district…</option>
              {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>

          <Field label="Taluk" required>
            <Select value={form.taluk} onChange={(e) => set("taluk", e.target.value)} disabled={!form.district}>
              <option value="">Select taluk…</option>
              {taluks.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>

          <Field label="Address">
            <textarea placeholder="Shop / House No., Street, Area" value={form.address} onChange={(e) => set("address", e.target.value)} rows={3}
              style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 14, fontFamily: "inherit", color: themeG.textMain, background: themeG.card, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </Field>

          <Field label="Notes">
            <textarea placeholder="Any additional info about this customer" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3}
              style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 14, fontFamily: "inherit", color: themeG.textMain, background: themeG.card, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
        <button onClick={() => navigate("/master/customers")}
          style={{ padding: "10px 24px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving}
          style={{ padding: "10px 28px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 10px rgba(91,155,217,0.32)", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save Customer"}
        </button>
      </div>
    </Layout>
  );
}