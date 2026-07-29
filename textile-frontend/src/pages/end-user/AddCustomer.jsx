// src/pages/end-user/AddCustomer.jsx
//
// Add Customer for the "end_user" role (area/taluk-scoped field officer).
// Same fields as src/pages/master/AddCustomer.jsx, with two differences:
//   1. Uses EndUserLayout instead of the admin Layout.
//   2. The Primary Address's District/Taluk are locked to whatever the
//      logged-in end_user is assigned to (read from localStorage, same
//      source EndUserLayout uses for its sidebar area badge) — a field
//      officer can only register customers inside their own area.
//      A second address (if added) is still freely pickable, in case the
//      customer's billing/shipping address is elsewhere.
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import EndUserLayout from "../../components/EndUserLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";
import QuickAddCustomerModal from "../../components/QuickAddCustomerModal";

const INDIAN_STATES = [
  "Tamil Nadu","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
  "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
  "Odisha","Punjab","Rajasthan","Sikkim","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir",
  "Ladakh","Lakshadweep","Puducherry"
];

// Same Tamil Nadu district -> taluk map used on CustomerView, trimmed down
// to just what's needed here: a reverse lookup so we can resolve the
// field officer's District from their assigned Taluk(s).
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

// Same normaliser EndUserLayout uses for its sidebar area badge, so the
// assigned area shown here always matches what the officer sees there.
function readAssignedTaluks() {
  const raw = localStorage.getItem("Taluk") || localStorage.getItem("assignedArea") || "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (parsed) return [String(parsed)];
  } catch {
    // not JSON — plain string
  }
  return [raw];
}

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const Field = ({ label, required, children }) => {
  const { isDark } = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: getG(isDark).textLabel, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "#B23A3A", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
};

const Input = (props) => (
  <input {...props} className={`glow-input ${props.className || ""}`}
    style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: "1px solid rgba(91,155,217,0.45)", fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#F5FAFF", outline: "none", boxSizing: "border-box", ...(props.style || {}) }} />
);

const Select = ({ children, ...props }) => (
  <select {...props} className={`glow-input ${props.className || ""}`}
    style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: "1px solid rgba(91,155,217,0.45)", fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#F5FAFF", outline: "none", boxSizing: "border-box", ...(props.style || {}) }}>
    {children}
  </select>
);

const LinkButton = ({ children, ...props }) => (
  <button type="button" {...props}
    style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 700, ...(props.style || {}) }}>
    {children}
  </button>
);

const AddLinkRow = ({ children }) => (
  <div style={{ display: "flex", justifyContent: "flex-end" }}>{children}</div>
);

const SubSectionLabel = ({ label, accent }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px" }}>
    <div style={{ width: 4, height: 16, borderRadius: 2, background: accent }} />
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: accent, fontFamily: FONT }}>{label}</span>
  </div>
);

const LockedNote = ({ children }) => (
  <p style={{ fontSize: 11.5, color: "#8A5A0E", background: "rgba(214,148,38,0.10)", border: "1px solid rgba(214,148,38,0.25)", borderRadius: 8, padding: "6px 10px", margin: "-6px 0 14px" }}>
    {children}
  </p>
);

const emptyAddress = (prefill = {}) => ({
  id: `addr_${Date.now()}_${Math.random()}`,
  address: "", address2: "",
  stateName: "Tamil Nadu", district: "", city: "",
  country: "India", pincode: "",
  ...prefill,
});
const emptyContact = () => ({ id: `cp_${Date.now()}_${Math.random()}`, contactName: "", contactPhone: "", designation: "", email: "" });

export default function AddCustomer() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  const card      = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 24, boxShadow: "0 4px 16px rgba(46,122,114,0.05)" };
  const cardTitle = { fontFamily: FONT, fontSize: 16, fontWeight: 600, margin: "0 0 20px", color: themeG.textMain };

  // Field officer's own assigned area — the primary address is locked to it.
  const assignedTaluks = readAssignedTaluks();
  const singleAssignedTaluk = assignedTaluks.length === 1 ? assignedTaluks[0] : "";
  // Derive the district from ANY of the assigned taluks, not just when
  // there's exactly one — an officer with 2+ taluks (e.g. Vadipatti AND
  // Madurai North) still has a real district (Madurai), it just can't be
  // read off a single value. If their taluks somehow span more than one
  // distinct district, leave it unresolved rather than guessing wrong.
  const derivedDistricts = [...new Set(assignedTaluks.map(findDistrictForTaluk).filter(Boolean))];
  const assignedDistrict = derivedDistricts.length === 1 ? derivedDistricts[0] : "";
  const isAreaLocked = assignedTaluks.length > 0;

  // ── Company Info ─────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState("");
  const [emails, setEmails] = useState([""]);
  const [phones, setPhones] = useState([""]);

  // ── Addresses (primary address locked to assigned area) ────────────────
  const [addresses, setAddresses] = useState([
    emptyAddress(
      isAreaLocked
        ? { district: assignedDistrict, city: singleAssignedTaluk }
        : {}
    ),
  ]);

  const [districts, setDistricts] = useState([]);
  const [cityOptionsByAddress, setCityOptionsByAddress] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/locations/districts");
        setDistricts(res.data);
      } catch { /* silently ignore — dropdown just stays empty */ }
    })();
  }, []);

  const loadCityOptions = async (addressId, district) => {
    if (!district) { setCityOptionsByAddress((prev) => ({ ...prev, [addressId]: [] })); return; }
    try {
      const res = await API.get(`/locations/taluks?district=${encodeURIComponent(district)}`);
      setCityOptionsByAddress((prev) => ({ ...prev, [addressId]: res.data }));
    } catch {
      setCityOptionsByAddress((prev) => ({ ...prev, [addressId]: [] }));
    }
  };

  const updateAddress = (addressId, patch) => {
    setAddresses((prev) => prev.map((a) => (a.id === addressId ? { ...a, ...patch } : a)));
  };

  const handleAddressDistrictChange = (addressId, district) => {
    updateAddress(addressId, { district, city: "" });
    loadCityOptions(addressId, district);
  };

  // ── KYC & Tax ────────────────────────────────────────────────────────
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");

  // ── Contact Persons ──────────────────────────────────────────────────
  const [contactPersons, setContactPersons] = useState([emptyContact()]);
  const [showExtraContactFields, setShowExtraContactFields] = useState({});

  // ── Customer Type (still needed for order/discount rules downstream) ──
  const [type, setType] = useState("retail");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const handleSubmit = async () => {
    setError("");
    const primary = addresses[0];
    if (!companyName.trim()) { setError("Please enter the Company / Firm Name."); return; }
    if (!emails[0]?.trim()) { setError("Please enter the Business Email Address."); return; }
    if (!phones[0]?.trim()) { setError("Please enter the Primary Phone Number."); return; }
    if (!primary?.district || !primary?.city) { setError("Please select District and City on the primary address."); return; }

    setSaving(true);
    try {
      await API.post("/customers", {
        name: companyName,
        phone: phones[0],
        email: emails[0],
        type,
        district: primary.district,
        taluk: primary.city,
        address: primary?.address || null,
        notes: notes || null,

        emails: emails.filter((e) => e.trim().length > 0),
        phones: phones.filter((p) => p.trim().length > 0),
        addresses: addresses
          .filter((a) => a.address.trim().length > 0)
          .map((a) => ({ address: a.address, address2: a.address2 || undefined, city: a.city, stateName: a.stateName, district: a.district || undefined, country: a.country, pincode: a.pincode })),
        contactPersons: contactPersons
          .filter((c) => c.contactName.trim().length > 0 || c.contactPhone.trim().length > 0)
          .map((c) => ({ contactName: c.contactName, contactPhone: c.contactPhone, designation: c.designation || undefined, email: c.email || undefined })),
        gstNo: gst || null,
        panNo: pan || null,
      });
      navigate("/master/customers");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <EndUserLayout>
      <style>{`
        .glow-input { box-shadow: 0 0 6px rgba(91,155,217,0.25); transition: box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease; }
        .glow-input:hover { box-shadow: 0 0 8px rgba(91,155,217,0.35); }
        .glow-input:focus { border-color: #1F5C99 !important; box-shadow: 0 0 0 2px rgba(31,92,153,0.15), 0 0 10px rgba(31,92,153,0.4) !important; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {error && (
          <div style={{ background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "rgba(91,155,217,0.06)", border: `1px solid ${themeG.border}`, borderRadius: 12, padding: "12px 16px" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: themeG.textMain }}>In a hurry?</div>
            <div style={{ fontSize: 12.5, color: themeG.textSub, marginTop: 2 }}>Use Quick Add for just the essentials — Shop Name, Contact Person, Phone and Place. You can fill in the rest here later.</div>
          </div>
          <button
            onClick={() => setShowQuickAdd(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 9, background: "rgba(91,155,217,0.12)", color: themeG.accent, border: `1.5px solid ${themeG.accent}`, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            ⚡ Quick Add instead
          </button>
        </div>

        {showQuickAdd && (
          <QuickAddCustomerModal
            themeG={themeG}
            onClose={() => setShowQuickAdd(false)}
            onCreated={() => navigate("/end-user/customers")}
          />
        )}

        {/* ═══ Company Info ═══ */}
        <div style={card}>
          <h3 style={cardTitle}>Company Info</h3>

          <Field label="Company / Firm Name" required>
            <Input placeholder="e.g., Lakshmi Textiles Pvt. Ltd." value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </Field>

          {emails.map((email, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Field label={idx === 0 ? "Business Email" : `Business Email ${idx + 1}`} required={idx === 0}>
                  <Input type="email" placeholder="contact@company.com" value={email}
                    onChange={(e) => setEmails((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))} />
                </Field>
              </div>
              {idx > 0 && (
                <LinkButton style={{ color: "#B23A3A", marginBottom: 18 }} onClick={() => setEmails((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </LinkButton>
              )}
            </div>
          ))}
          {emails.length < 2 && (
            <AddLinkRow>
              <LinkButton style={{ color: themeG.accent, marginBottom: 16 }} onClick={() => setEmails((prev) => [...prev, ""])}>
                + Add Email
              </LinkButton>
            </AddLinkRow>
          )}

          {phones.map((phone, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Field label={idx === 0 ? "Primary Phone Number" : `Phone Number ${idx + 1}`} required={idx === 0}>
                  <Input type="tel" placeholder="+91 98765 43210" value={phone}
                    onChange={(e) => setPhones((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))} />
                </Field>
              </div>
              {idx > 0 && (
                <LinkButton style={{ color: "#B23A3A", marginBottom: 18 }} onClick={() => setPhones((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </LinkButton>
              )}
            </div>
          ))}
          {phones.length < 2 && (
            <AddLinkRow>
              <LinkButton style={{ color: themeG.accent }} onClick={() => setPhones((prev) => [...prev, ""])}>
                + Add Phone Number
              </LinkButton>
            </AddLinkRow>
          )}
        </div>

        {/* ═══ Address Details ═══ */}
        <div style={card}>
          <h3 style={cardTitle}>Address Details</h3>

          {addresses.map((addr, idx) => {
            const locked = idx === 0 && isAreaLocked;
            return (
              <div key={addr.id} style={idx > 0 ? { marginTop: 16, borderTop: `1px solid ${themeG.border}`, paddingTop: 16 } : {}}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <SubSectionLabel label={idx === 0 ? "Primary Address" : `Address #${idx + 1}`} accent="#2E7A72" />
                  {idx > 0 && (
                    <LinkButton style={{ color: "#B23A3A" }} onClick={() => setAddresses((prev) => prev.filter((a) => a.id !== addr.id))}>
                      Remove Address
                    </LinkButton>
                  )}
                </div>

                {locked && (
                  <LockedNote>
                    📍 Locked to your assigned area{assignedDistrict ? ` — ${assignedDistrict}, ${singleAssignedTaluk}` : ` — ${assignedTaluks.join(", ")}`}. Contact your District Admin to register a customer outside your area.
                  </LockedNote>
                )}

                <Field label="Address 1" required>
                  <Input placeholder="Door No., Street, Area" value={addr.address}
                    onChange={(e) => updateAddress(addr.id, { address: e.target.value })} />
                </Field>
                <Field label="Address 2 (optional)">
                  <Input placeholder="- - - - - - - - - - - -" value={addr.address2}
                    onChange={(e) => updateAddress(addr.id, { address2: e.target.value })} />
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="State" required>
                    <Select value={addr.stateName} disabled={locked} onChange={(e) => updateAddress(addr.id, { stateName: e.target.value })}>
                      {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  </Field>
                  <Field label="District" required>
                    {locked ? (
                      <Input value={addr.district || "Not set — contact admin"} disabled />
                    ) : (
                      <Select value={addr.district} onChange={(e) => handleAddressDistrictChange(addr.id, e.target.value)}>
                        <option value="">Select district…</option>
                        {districts.map((d) => <option key={d}>{d}</option>)}
                      </Select>
                    )}
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="City / Taluk" required>
                    {locked ? (
                      assignedTaluks.length > 1 ? (
                        <Select value={addr.city} onChange={(e) => updateAddress(addr.id, { city: e.target.value })}>
                          <option value="">Select taluk…</option>
                          {assignedTaluks.map((t) => <option key={t}>{t}</option>)}
                        </Select>
                      ) : (
                        <Input value={addr.city} disabled />
                      )
                    ) : (
                      <Select value={addr.city} onChange={(e) => updateAddress(addr.id, { city: e.target.value })} disabled={!addr.district}>
                        <option value="">{addr.district ? "Select city…" : "Select district first…"}</option>
                        {(cityOptionsByAddress[addr.id] || []).map((c) => <option key={c}>{c}</option>)}
                      </Select>
                    )}
                  </Field>
                  <Field label="Pincode" required>
                    <Input placeholder="641001" maxLength={6} value={addr.pincode}
                      onChange={(e) => updateAddress(addr.id, { pincode: e.target.value })} />
                  </Field>
                </div>

                <Field label="Country" required>
                  <Input placeholder="India" value={addr.country}
                    onChange={(e) => updateAddress(addr.id, { country: e.target.value })} />
                </Field>
              </div>
            );
          })}

          {addresses.length < 2 && (
            <AddLinkRow>
              <LinkButton style={{ color: "#2E7A72" }} onClick={() => setAddresses((prev) => [...prev, emptyAddress()])}>
                + Add Address
              </LinkButton>
            </AddLinkRow>
          )}
        </div>

        {/* ═══ KYC & Tax Details ═══ */}
        <div style={card}>
          <h3 style={cardTitle}>KYC &amp; Tax Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="GST No" required>
              <Input placeholder="33AAAAA0000A1Z1" maxLength={15} style={{ textTransform: "uppercase" }} value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} />
            </Field>
            <Field label="PAN No">
              <Input placeholder="ABCDE1234F" maxLength={10} style={{ textTransform: "uppercase" }} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} />
            </Field>
          </div>
        </div>

        {/* ═══ Contact Person(s) ═══ */}
        <div style={card}>
          <h3 style={cardTitle}>Contact Person</h3>

          {contactPersons.map((cp, idx) => {
            const isExtraVisible = showExtraContactFields[cp.id] || !!cp.designation.trim() || !!cp.email.trim();
            return (
              <div key={cp.id} style={idx > 0 ? { marginTop: 16, borderTop: `1px solid ${themeG.border}`, paddingTop: 16 } : {}}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <SubSectionLabel label={idx === 0 ? "Primary Contact" : `Contact Person #${idx + 1}`} accent={themeG.accent} />
                  {idx > 0 && (
                    <LinkButton style={{ color: "#B23A3A" }} onClick={() => setContactPersons((prev) => prev.filter((c) => c.id !== cp.id))}>
                      Remove Contact
                    </LinkButton>
                  )}
                </div>

                <Field label="Contact Person Name" required>
                  <Input placeholder="e.g., Ramesh Kumar" value={cp.contactName}
                    onChange={(e) => setContactPersons((prev) => prev.map((c) => (c.id === cp.id ? { ...c, contactName: e.target.value } : c)))} />
                </Field>

                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Contact Mobile" required>
                      <Input type="tel" placeholder="+91 99887 76655" value={cp.contactPhone}
                        onChange={(e) => setContactPersons((prev) => prev.map((c) => (c.id === cp.id ? { ...c, contactPhone: e.target.value } : c)))} />
                    </Field>
                  </div>
                  {!isExtraVisible && (
                    <LinkButton style={{ color: themeG.accent, marginBottom: 18 }} onClick={() => setShowExtraContactFields((prev) => ({ ...prev, [cp.id]: true }))}>
                      + Add Role/Email
                    </LinkButton>
                  )}
                </div>

                {isExtraVisible && (
                  <>
                    <Field label="Designation / Role">
                      <Input placeholder="e.g., Purchase Manager" value={cp.designation}
                        onChange={(e) => setContactPersons((prev) => prev.map((c) => (c.id === cp.id ? { ...c, designation: e.target.value } : c)))} />
                    </Field>
                    <Field label="Email (Optional)">
                      <Input type="email" placeholder="contact@company.com" value={cp.email}
                        onChange={(e) => setContactPersons((prev) => prev.map((c) => (c.id === cp.id ? { ...c, email: e.target.value } : c)))} />
                    </Field>
                  </>
                )}
              </div>
            );
          })}

          {contactPersons.length < 2 && (
            <AddLinkRow>
              <LinkButton style={{ color: themeG.accent }} onClick={() => setContactPersons((prev) => [...prev, emptyContact()])}>
                + Add Contact Person
              </LinkButton>
            </AddLinkRow>
          )}
        </div>

        {/* ═══ Customer Type ═══ */}
        <div style={card}>
          <h3 style={cardTitle}>Customer Type</h3>
          <Field label="Customer Type" required>
            <div style={{ display: "flex", gap: 8 }}>
              {["retail", "wholesale"].map((t) => (
                <button key={t} onClick={() => setType(t)}
                  style={{ flex: 1, padding: "9px", borderRadius: 9, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                    background:  type === t ? "rgba(91,155,217,0.15)" : themeG.card,
                    color:       type === t ? themeG.accent : themeG.textSub,
                    borderColor: type === t ? themeG.accent : themeG.border }}>
                  {t === "retail" ? "🏪 Retail" : "🏭 Wholesale"}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notes">
            <textarea className="glow-input" placeholder="Any additional info about this customer" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: "1px solid rgba(91,155,217,0.45)", fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#F5FAFF", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
        <button onClick={() => navigate("/end-user/dashboard")}
          style={{ padding: "10px 24px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textSub, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving}
          style={{ padding: "10px 28px", borderRadius: 9, border: "none", background: themeG.accent, color: themeG.card, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 10px rgba(91,155,217,0.32)", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Register Customer"}
        </button>
      </div>
    </EndUserLayout>
  );
}