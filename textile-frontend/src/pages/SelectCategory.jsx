import { useNavigate } from "react-router-dom";
import { useTheme } from "../ThemeContext";
import { getG } from "../theme";
import Layout from "../components/Layout";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function SelectCategory() {
  const { isDark } = useTheme();
  const G = getG(isDark);
  const navigate = useNavigate();

  const choose = (cat) => {
    localStorage.setItem("premier_category", cat);
    navigate("/master/products");
  };

  return (
    <Layout pageTitle="Select Category">
      <div style={{ maxWidth: 560, margin: "60px auto 0", textAlign: "center" }}>
        <p style={{ fontFamily: FONT, fontSize: 13, color: G.textSub, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
          Step 1 of 2
        </p>
        <h2 style={{ fontFamily: "'Space Grotesk', " + FONT, fontSize: 26, fontWeight: 700, color: G.textMain, margin: "0 0 8px", letterSpacing: "-0.4px" }}>
          What are you working with?
        </h2>
        <p style={{ fontFamily: FONT, fontSize: 14, color: G.textSub, margin: "0 0 40px" }}>
          Choose a category. This will filter products, orders and reports throughout the session.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <CategoryCard
            emoji="👘"
            title="Cloth"
            desc="Dhoti, Blouse, Pant, Shirt, Leggings, and other fabric products"
            subtypes={["Dhoti", "Blouse", "Pant", "Shirt", "Leggings", "Others"]}
            accentColor="#1F5C99"
            accentLight="rgba(15,33,56,0.12)"
            borderActive="rgba(15,33,56,0.40)"
            onClick={() => choose("cloth")}
            G={G}
          />
          <CategoryCard
            emoji="🧵"
            title="Yarn"
            desc="Bundle, Hank, Cone and other yarn / thread products"
            subtypes={["Bundle", "Hank", "Cone"]}
            accentColor="#3A5C8C"
            accentLight="rgba(58,92,140,0.10)"
            borderActive="rgba(58,92,140,0.35)"
            onClick={() => choose("yarn")}
            G={G}
          />
        </div>

        <p style={{ fontFamily: FONT, fontSize: 12, color: G.textSub, marginTop: 28 }}>
          You can switch categories any time from the sidebar menu.
        </p>
      </div>
    </Layout>
  );
}

function CategoryCard({ emoji, title, desc, subtypes, accentColor, accentLight, borderActive, onClick, G }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: G.card,
        border: `2px solid ${borderActive}`,
        borderRadius: 18,
        padding: "32px 24px",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONT,
        transition: "all 0.15s",
        boxShadow: `0 4px 20px ${accentLight}`,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 28px ${accentLight}`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `0 4px 20px ${accentLight}`; }}
    >
      <div style={{ fontSize: 44, marginBottom: 14 }}>{emoji}</div>
      <h3 style={{ fontFamily: "'Space Grotesk', " + FONT, fontSize: 20, fontWeight: 700, color: accentColor, margin: "0 0 8px" }}>{title}</h3>
      <p style={{ fontFamily: FONT, fontSize: 13, color: G.textSub, margin: "0 0 16px", lineHeight: 1.5 }}>{desc}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {subtypes.map(s => (
          <span key={s} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: accentLight, color: accentColor, border: `1px solid ${borderActive}` }}>
            {s}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 6, color: accentColor, fontWeight: 700, fontSize: 13 }}>
        Select {title}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </div>
    </button>
  );
}
