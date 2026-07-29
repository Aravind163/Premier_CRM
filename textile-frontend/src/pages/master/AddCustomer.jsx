import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { getG } from "../../theme";
import API from "../../services/api";

// Own assigned District(s), as cached at login (see Login.jsx) — same key
// the end_user Add Customer form and Quick Add already read. Stored as a
// JSON array (or a plain string, for older records); normalise either
// shape into a clean string array.
function readAssignedAreas(key) {
  const raw = localStorage.getItem(key) || "";
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


// ─────────────────────────────────────────────────────────────────────────
// This form mirrors the mobile app's AddCustomerScreen.tsx field-for-field:
// Company Name, up to 2 Business Emails, up to 2 Phone Numbers, up to 2
// Addresses (Address 1/2, City, State, District, Country, Pincode), GST No
// + PAN No, and up to 2 Contact Persons (Name + Mobile required,
// Designation/Email optional, revealed via "+ Add Role/Email" exactly like
// the app).
//
// State / District / City are all dropdowns, fed by the same
// /locations/districts + /locations/taluks endpoints already used on the
// Allocation screens — City options are scoped to whichever District is
// picked for that address, same as Taluk depends on District there.
//
// The selected District/City on the primary address doubles as this
// customer's District/Taluk for the system's existing area-based access
// control and discount rules, so there's no separate duplicate field for it.
// ─────────────────────────────────────────────────────────────────────────

const INDIAN_STATES = [
  "Tamil Nadu","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
  "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
  "Odisha","Punjab","Rajasthan","Sikkim","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir",
  "Ladakh","Lakshadweep","Puducherry","West Bengal"
];

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

// Right-aligns any standalone "+ Add …" link. Wrap the LinkButton with this
// instead of rendering it bare, so every add-link sits at the right edge
// of its card regardless of the parent's layout.
const AddLinkRow = ({ children }) => (
  <div style={{ display: "flex", justifyContent: "flex-end" }}>
    {children}
  </div>
);

const SubSectionLabel = ({ label, accent }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 10px" }}>
    <div style={{ width: 4, height: 16, borderRadius: 2, background: accent }} />
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: accent, fontFamily: FONT }}>{label}</span>
  </div>
);

const emptyAddress = () => ({
  id: `addr_${Date.now()}_${Math.random()}`,
  address: "", address2: "",
  stateName: "Tamil Nadu", district: "", city: "",
  country: "India", pincode: "",
});
const emptyContact = () => ({ id: `cp_${Date.now()}_${Math.random()}`, contactName: "", contactPhone: "", designation: "", email: "" });

export default function AddCustomer() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();

  // Marketing (admin) can only add customers inside their own assigned
  // District(s) — same rule enforced server-side in
  // CustomerController::store(). System Admin (and anyone else landing on
  // this page) stays fully unrestricted.
  const role = localStorage.getItem("role") || "";
  const assignedDistricts = role === "admin" ? readAssignedAreas("District") : [];
  const districtLocked = assignedDistricts.length > 0;
  const singleAssignedDistrict = assignedDistricts.length === 1 ? assignedDistricts[0] : "";

  const card      = { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, padding: 24, boxShadow: "0 4px 16px rgba(46,122,114,0.05)" };
  const cardTitle = { fontFamily: FONT, fontSize: 16, fontWeight: 600, margin: "0 0 20px", color: themeG.textMain };

  // ── Company Info (mirrors mobile "Account Profile — Company") ─────────
  const [companyName, setCompanyName] = useState("");
  const [emails, setEmails] = useState([""]);
  const [phones, setPhones] = useState([""]);

  // ── Addresses (mirrors mobile "Address" section, up to 2) ──────────────
  const [addresses, setAddresses] = useState([{ ...emptyAddress(), district: singleAssignedDistrict }]);

  // District list (shared across every address) and City-options-per-
  // address, both fetched from the same /locations endpoints the
  // Allocation screens already use.
  const [districts, setDistricts] = useState([]);
  const [cityOptionsByAddress, setCityOptionsByAddress] = useState({}); // { [addressId]: string[] }

  useEffect(() => {
    if (districtLocked) return; // no need to fetch the full list — admin's choice is restricted to assignedDistricts anyway
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

  // A locked single-district admin already has their district pre-filled
  // on the primary address (see addresses' initial state above) — load
  // its city/taluk options right away instead of waiting for a District
  // dropdown change that will never happen.
  useEffect(() => {
    if (singleAssignedDistrict) loadCityOptions(addresses[0].id, singleAssignedDistrict);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAddress = (addressId, patch) => {
    setAddresses((prev) => prev.map((a) => (a.id === addressId ? { ...a, ...patch } : a)));
  };

  const handleAddressDistrictChange = (addressId, district) => {
    updateAddress(addressId, { district, city: "" });
    loadCityOptions(addressId, district);
  };

  // ── KYC & Tax (mirrors mobile "KYC & Tax", GST + PAN) ───────────────────
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");

  // ── Contact Persons (mirrors mobile "Contact Person", up to 2) ─────────
  const [contactPersons, setContactPersons] = useState([emptyContact()]);
  const [showExtraContactFields, setShowExtraContactFields] = useState({});

  // ── Web-only: Business Settings (needed for existing discount rules) ───
  const [type, setType] = useState("retail");
  const [creditLimit, setCreditLimit] = useState("");
  const [maxDiscountPct, setMaxDiscountPct] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    const primary = addresses[0];
    // Same required-field check as the mobile app: Company Name, first
    // Email, first Phone — plus District/City on the primary address,
    // which double as this system's required area-scoping fields.
    if (!companyName.trim()) { setError("Please enter the Company / Firm Name."); return; }
    if (!emails[0]?.trim()) { setError("Please enter the Business Email Address."); return; }
    if (!phones[0]?.trim()) { setError("Please enter the Primary Phone Number."); return; }
    if (!primary?.district || !primary?.city) { setError("Please select District and City on the primary address."); return; }

    setSaving(true);
    try {
      await API.post("/customers", {
        name:  companyName,
        phone: phones[0],
        email: emails[0],
        type,
        district: primary.district,
        taluk: primary.city,
        address: primary?.address || null,
        creditLimit: creditLimit || null,
        maxDiscountPct: maxDiscountPct || null,
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
    <Layout pageTitle="Add Customer">

      <style>{`
        .glow-input {
          box-shadow: 0 0 6px rgba(91,155,217,0.25);
          transition: box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .glow-input:hover {
          box-shadow: 0 0 8px rgba(91,155,217,0.35);
        }
        .glow-input:focus {
          border-color: #1F5C99 !important;
          box-shadow: 0 0 0 2px rgba(31,92,153,0.15), 0 0 10px rgba(31,92,153,0.4) !important;
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {error && (
          <div style={{ background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
            {error}
          </div>
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

          {addresses.map((addr, idx) => (
            <div key={addr.id} style={idx > 0 ? { marginTop: 16, borderTop: `1px solid ${themeG.border}`, paddingTop: 16 } : {}}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SubSectionLabel label={idx === 0 ? "Primary Address" : `Address #${idx + 1}`} accent="#2E7A72" />
                {idx > 0 && (
                  <LinkButton style={{ color: "#B23A3A" }} onClick={() => setAddresses((prev) => prev.filter((a) => a.id !== addr.id))}>
                    Remove Address
                  </LinkButton>
                )}
              </div>

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
                  <Select value={addr.stateName} onChange={(e) => updateAddress(addr.id, { stateName: e.target.value })}>
                    {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </Field>
                <Field label="District" required>
                  {idx === 0 && districtLocked && assignedDistricts.length <= 1 ? (
                    <Input value={addr.district || "Not set — contact System Admin"} disabled />
                  ) : idx === 0 && districtLocked ? (
                    <Select value={addr.district} onChange={(e) => handleAddressDistrictChange(addr.id, e.target.value)}>
                      <option value="">Select district…</option>
                      {assignedDistricts.map((d) => <option key={d}>{d}</option>)}
                    </Select>
                  ) : (
                    <Select value={addr.district} onChange={(e) => handleAddressDistrictChange(addr.id, e.target.value)}>
                      <option value="">Select district…</option>
                      {districts.map((d) => <option key={d}>{d}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
              {idx === 0 && districtLocked && (
                <p style={{ margin: "-8px 0 12px", fontSize: 11.5, color: themeG.textSub }}>
                  📍 District locked to your own assignment — City/Taluk is free to pick anywhere within it.
                </p>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="City" required>
                  <Select value={addr.city} onChange={(e) => updateAddress(addr.id, { city: e.target.value })} disabled={!addr.district}>
                    <option value="">{addr.district ? "Select city…" : "Select district first…"}</option>
                    {(cityOptionsByAddress[addr.id] || []).map((c) => <option key={c}>{c}</option>)}
                  </Select>
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
          ))}

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

        {/* ═══ Web-only: Business Settings ═══ */}
        <div style={card}>
          <h3 style={cardTitle}>Business Settings <span style={{ fontSize: 11, fontWeight: 500, color: themeG.textSub, textTransform: "none" }}>(web only — used for discount rules)</span></h3>

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

          {type === "wholesale" && (
            <Field label="Credit Limit (₹)">
              <Input type="number" placeholder="e.g. 50000" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
            </Field>
          )}

          <Field label="Max Discount Policy (%)">
            <Input type="number" step="0.1" min="0" max="100" placeholder="e.g. 10 — leave blank for no cap" value={maxDiscountPct} onChange={(e) => setMaxDiscountPct(e.target.value)} />
          </Field>

          <Field label="Notes">
            <textarea className="glow-input" placeholder="Any additional info about this customer" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: "1px solid rgba(91,155,217,0.45)", fontSize: 14, fontFamily: "inherit", color: "#0F2138", background: "#F5FAFF", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
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
          {saving ? "Saving…" : "Register Customer"}
        </button>
      </div>
    </Layout>
  );
}