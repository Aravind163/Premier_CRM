import { useState, useEffect } from "react";
import API from "../services/api";

// Own assigned District/Taluk, as cached at login (see Login.jsx) — same
// keys EndUserLayout / the full Add Customer form already read.
//
// FIX: some accounts have this value stored *double* JSON-encoded in
// localStorage (i.e. JSON.stringify() was called twice at login), e.g.
//   '"[\"Tirumangalam\",\"Melur\"]"'
// instead of
//   '["Tirumangalam","Melur"]'
// A single JSON.parse() on that only unwraps one layer and returns the
// *string* '["Tirumangalam","Melur"]' — not an array — which used to get
// wrapped as a single bogus element (`[' ["Tirumangalam","Melur"]']`).
// That broke both the Taluk dropdown (rendered the raw text instead of
// two options) and District derivation for end_users (findDistrictForTaluk
// couldn't match the mangled string, so assignedDistricts came back empty
// and the form got stuck on "Not set — contact admin").
//
// This version keeps unwrapping while the parsed result is still a
// string, so it's safe whether the value is stored once-encoded,
// double-encoded, or as a plain unencoded string.
function readAssignedAreas(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];

  let value = raw;
  for (let i = 0; i < 3 && typeof value === "string"; i++) {
    try {
      const parsed = JSON.parse(value);
      if (parsed === value) break; // nothing left to unwrap
      value = parsed;
    } catch {
      break; // not JSON at this layer — treat current value as final
    }
  }

  if (Array.isArray(value)) {
    return value.filter((v) => v !== null && v !== undefined && v !== "").map(String);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return [value];
  }
  return [];
}

// Same Tamil Nadu district -> taluk map used in the full Add Customer
// form and CustomerView — needed here because an end_user's Employee/User
// record only ever stores Taluk, never District (District assignment only
// applies to admin-role employees). So for a Field Officer, "their
// district" has to be derived by reverse-looking-up their Taluk(s), not
// read from a District field that's always empty for that role.
const TALUKS = {
  Ariyalur: ["Ariyalur","Udayarpalayam","Sendurai"],
  Chengalpattu: ["Chengalpattu","Tambaram","Tirukalukundram","Madurantakam","Cheyyur"],
  Chennai: ["Tondiarpet","Perambur","Ayanavaram","Ambattur","Madhavaram","Guindy","Mylapore","Velachery","Sholinganallur","Egmore"],
  Coimbatore: ["Coimbatore North","Coimbatore South","Sulur","Mettupalayam","Pollachi","Valparai"],
  Cuddalore: ["Cuddalore","Panruti","Chidambaram","Vriddachalam","Kattumannarkoil","Kurinjipadi"],
  Dharmapuri: ["Dharmapuri","Harur","Palacode","Pappireddipatti","Karimangalam","Nallampalli"],
  Dindigul: ["Dindigul","Palani","Oddanchatram","Nilakottai","Vedasandur","Kodaikanal","Natham","Athoor"],
  Erode: ["Erode","Bhavani","Gobichettipalayam","Perundurai","Sathyamangalam","Kodumudi","Modakurichi"],
  Kallakurichi: ["Kallakurichi","Sankarapuram","Chinnasalem","Ulundurpet","Tirukoilur"],
  Kancheepuram: ["Kancheepuram","Uthiramerur","Sriperumbudur","Walajabad"],
  Karur: ["Karur","Krishnarayapuram","Kulithalai","Manmangalam","Aravakurichi"],
  Krishnagiri: ["Krishnagiri","Hosur","Denkanikottai","Pochampalli","Uthangarai","Bargur"],
  Madurai: ["Madurai North","Madurai South","Melur","Peraiyur","Tirumangalam","Usilampatti","Vadipatti"],
  Mayiladuthurai: ["Mayiladuthurai","Sirkazhi","Kuthalam","Tharangambadi"],
  Nagapattinam: ["Nagapattinam","Kilvelur","Vedaranyam","Thirukkuvalai"],
  Namakkal: ["Namakkal","Rasipuram","Tiruchengode","Paramathi-Velur","Kollimalai"],
  Nilgiris: ["Udhagamandalam","Coonoor","Kotagiri","Gudalur","Pandalur"],
  Perambalur: ["Perambalur","Kunnam","Veppanthattai","Alathur"],
  Pudukkottai: ["Pudukkottai","Aranthangi","Avudayarkoil","Gandarvakottai","Iluppur","Karambakudi","Kulathur","Manamelkudi"],
  Ramanathapuram: ["Ramanathapuram","Paramakudi","Rameswaram","Mudukulathur","Kamuthi","Kadaladi"],
  Ranipet: ["Ranipet","Walajah","Arcot","Sholingur","Arakkonam"],
  Salem: ["Salem","Attur","Omalur","Mettur","Sankari","Edappadi","Yercaud","Gangavalli"],
  Sivagangai: ["Sivagangai","Karaikudi","Manamadurai","Tirupathur","Devakottai","Ilayangudi"],
  Tenkasi: ["Tenkasi","Sankarankovil","Kadayanallur","Shenkottai","Veerakeralampudur","Alangulam"],
  Thanjavur: ["Thanjavur","Kumbakonam","Pattukkottai","Orathanadu","Papanasam","Peravurani","Budalur"],
  Theni: ["Theni","Periyakulam","Uthamapalayam","Bodinayakanur","Andipatti"],
  Thoothukudi: ["Thoothukudi","Tiruchendur","Kovilpatti","Ottapidaram","Vilathikulam","Sathankulam","Srivaikuntam"],
  Tiruchirappalli: ["Tiruchirappalli","Lalgudi","Manachanallur","Musiri","Thuraiyur","Srirangam","Manapparai"],
  Tirunelveli: ["Tirunelveli","Ambasamudram","Palayamkottai","Nanguneri","Radhapuram","Tenkasi (old)"],
  Tirupathur: ["Tirupathur","Ambur","Vaniyambadi","Natrampalli"],
  Tiruppur: ["Tiruppur","Palladam","Kangeyam","Dharapuram","Udumalaipettai","Avinashi","Madathukulam"],
  Tiruvallur: ["Tiruvallur","Ponneri","Gummidipoondi","Avadi","Poonamallee","Uthukottai"],
  Tiruvannamalai: ["Tiruvannamalai","Arani","Cheyyar","Polur","Chengam","Vandavasi","Kilpennathur"],
  Tiruvarur: ["Tiruvarur","Mannargudi","Needamangalam","Thiruthuraipoondi","Kodavasal","Valangaiman"],
  Vellore: ["Vellore","Katpadi","Gudiyatham","Anaicut","Peranambattu","K.V.Kuppam"],
  Viluppuram: ["Viluppuram","Tindivanam","Gingee","Kallakurichi (old)","Vanur","Ulundurpet"],
  Virudhunagar: ["Virudhunagar","Sivakasi","Sattur","Aruppukottai","Rajapalayam","Srivilliputhur","Tiruchuli"],
};

function findDistrictForTaluk(taluk) {
  if (!taluk) return "";
  for (const [district, list] of Object.entries(TALUKS)) {
    if (list.includes(taluk)) return district;
  }
  return "";
}


// ─────────────────────────────────────────────────────────────────────────
// Quick Add Customer — a fast-path alternative to the full Add Customer
// form (AddCustomer.jsx), for the common case: a Marketing/System Admin
// user is on a call or standing in front of a shop and just needs to get
// the customer into the system *now*, without filling in GST, PAN,
// multiple addresses/contacts, credit limits, etc.
//
// Exactly 4 mandatory fields, matching what's actually needed to identify
// and reach a customer:
//   1. Customer Name (shop name)
//   2. Contact Person Name
//   3. Phone
//   4. Place — District + Area (Taluk)
//
// Everything else (Type, GST, addresses, credit limit…) can be filled in
// later from the customer's profile / the full Add Customer form — this
// modal deliberately doesn't ask for it. Customer Type defaults to
// "retail" under the hood since the backend requires *some* value; it's
// editable later.
//
// Submits straight to POST /customers (same endpoint as the full form),
// so a quick-added customer is a real, complete customer record — not a
// stub — just created with fewer questions asked up front.
// ─────────────────────────────────────────────────────────────────────────

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const fieldLabel = (themeG) => ({
  display: "block", fontSize: 12, fontWeight: 600, color: themeG.textLabel,
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
});
const inputStyle = {
  width: "100%", padding: "10px 13px", borderRadius: 9,
  border: "1px solid rgba(91,155,217,0.45)", fontSize: 14, fontFamily: "inherit",
  color: "#0F2138", background: "#F5FAFF", outline: "none", boxSizing: "border-box",
};

export default function QuickAddCustomerModal({ themeG, onClose, onCreated }) {
  const role = localStorage.getItem("role") || "";
  // Same 3-tier rule enforced server-side (CustomerController::store()):
  //   - end_user (Field Officer): District is fixed to their own
  //     assignment; Taluk is picked only from their own assigned Taluk(s)
  //     — e.g. Madurai / Madurai North + Tirumangalam can only add
  //     customers in exactly that combination.
  //   - admin (Marketing): District is fixed to their own assigned
  //     District(s); Taluk is free to pick anywhere within that district.
  //   - system_admin (and anyone else): fully free, no lock.
  const assignedTaluks    = readAssignedAreas("Taluk");
  // For end_user, District is never actually stored on their own record —
  // only Taluk is (see EmployeeController — District assignment only ever
  // applies to admin-role employees). So derive it from their taluk(s)
  // instead of trusting a District field that's always empty here.
  const derivedDistricts = role === "end_user"
    ? [...new Set(assignedTaluks.map(findDistrictForTaluk).filter(Boolean))]
    : readAssignedAreas("District");
  const assignedDistricts = derivedDistricts;
  const districtLocked = role === "end_user" || role === "admin";
  const talukLocked     = role === "end_user";

  const [shopName, setShopName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [district, setDistrict] = useState(assignedDistricts.length === 1 ? assignedDistricts[0] : "");
  const [area, setArea] = useState(talukLocked && assignedTaluks.length === 1 ? assignedTaluks[0] : "");

  const [districts, setDistricts] = useState([]);
  const [areaOptions, setAreaOptions] = useState([]);
  const [loadingAreas, setLoadingAreas] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (districtLocked) return; // no need to fetch the full list — selection is restricted to assignedDistricts anyway
    (async () => {
      try {
        const res = await API.get("/locations/districts");
        setDistricts(res.data);
      } catch { /* dropdown just stays empty */ }
    })();
  }, []);

  useEffect(() => {
    if (!district) { setAreaOptions([]); if (!talukLocked) setArea(""); return; }
    if (talukLocked) return; // Taluk options are the officer's own assigned list, not fetched
    setLoadingAreas(true);
    (async () => {
      try {
        const res = await API.get(`/locations/taluks?district=${encodeURIComponent(district)}`);
        setAreaOptions(res.data);
      } catch {
        setAreaOptions([]);
      } finally {
        setLoadingAreas(false);
      }
    })();
    setArea("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district]);

  const handleSubmit = async () => {
    setError("");
    if (!shopName.trim())    { setError("Please enter the Customer/Shop Name."); return; }
    if (!contactName.trim()) { setError("Please enter the Contact Person Name."); return; }
    if (!phone.trim())       { setError("Please enter the Phone number."); return; }
    if (!district)           { setError("Please select the District."); return; }
    if (!area)                { setError("Please select the Area (Taluk)."); return; }

    setSaving(true);
    try {
      const res = await API.post("/customers", {
        name: shopName.trim(),
        phone: phone.trim(),
        type: "retail", // sensible default — editable later from the customer's profile
        district,
        taluk: area,
        contactPersons: [{ contactName: contactName.trim(), contactPhone: phone.trim() }],
      });
      onCreated?.(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,33,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: themeG.card, borderRadius: 16, width: "100%", maxWidth: 440, padding: 26, boxShadow: "0 12px 40px rgba(15,33,56,0.25)", fontFamily: FONT }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: themeG.textMain }}>⚡ Quick Add Customer</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: themeG.textSub }}>Just the essentials — fill in the rest later from the customer's profile.</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, lineHeight: 1, cursor: "pointer", color: themeG.textSub, padding: 4 }}>×</button>
        </div>

        {error && (
          <div style={{ margin: "14px 0 0", background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, color: "#B23A3A" }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={fieldLabel(themeG)}>Customer Name (Shop Name)<span style={{ color: "#B23A3A", marginLeft: 3 }}>*</span></label>
            <input style={inputStyle} placeholder="e.g., Sri Kala Textiles" value={shopName} onChange={(e) => setShopName(e.target.value)} autoFocus />
          </div>

          <div>
            <label style={fieldLabel(themeG)}>Contact Person Name<span style={{ color: "#B23A3A", marginLeft: 3 }}>*</span></label>
            <input style={inputStyle} placeholder="e.g., Ramesh Kumar" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>

          <div>
            <label style={fieldLabel(themeG)}>Phone<span style={{ color: "#B23A3A", marginLeft: 3 }}>*</span></label>
            <input style={inputStyle} type="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <label style={fieldLabel(themeG)}>Place<span style={{ color: "#B23A3A", marginLeft: 3 }}>*</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {districtLocked && assignedDistricts.length <= 1 ? (
                <input style={{ ...inputStyle, background: themeG.border, color: themeG.textSub, cursor: "not-allowed" }}
                  value={district || "Not set — contact admin"} disabled />
              ) : (
                <select style={inputStyle} value={district} onChange={(e) => setDistrict(e.target.value)}>
                  <option value="">District…</option>
                  {(districtLocked ? assignedDistricts : districts).map((d) => <option key={d}>{d}</option>)}
                </select>
              )}

              {talukLocked && assignedTaluks.length <= 1 ? (
                <input style={{ ...inputStyle, background: themeG.border, color: themeG.textSub, cursor: "not-allowed" }}
                  value={area || "Not set — contact admin"} disabled />
              ) : talukLocked ? (
                <select style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)}>
                  <option value="">Area…</option>
                  {assignedTaluks.map((t) => <option key={t}>{t}</option>)}
                </select>
              ) : (
                <select style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)} disabled={!district || loadingAreas}>
                  <option value="">{!district ? "Select district first" : loadingAreas ? "Loading…" : "Area…"}</option>
                  {areaOptions.map((a) => <option key={a}>{a}</option>)}
                </select>
              )}
            </div>
            {(districtLocked || talukLocked) && (
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: themeG.textSub }}>
                📍 Locked to your assigned area. Contact your {role === "end_user" ? "District Admin" : "System Admin"} to add a customer elsewhere.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 500 }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}