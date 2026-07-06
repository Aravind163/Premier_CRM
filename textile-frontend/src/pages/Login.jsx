import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import logo from '/premier-icon.png';
import bgImage from '/textile.jpg';

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");
    if (!identifier || !password) { setError("Please enter your credentials."); return; }
    setLoading(true);
    try {
      const res = await API.post("/login", { identifier, password });
      const { token, role } = res.data;
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      if (["super_admin", "system_admin", "admin", "end_user"].includes(role)) {
        navigate("/dashboard");
      } else if (role === "customer") {
        navigate("/customer/dashboard");
      } else {
        setError("Access denied.");
        localStorage.removeItem("token");
        localStorage.removeItem("role");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleLogin(); };

  return (
    <div style={styles.page}>
      <div style={styles.bgImage} />

      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoWrap}>
          <img src={logo} alt="Premier Mills" style={styles.logo} />
        </div>

        {error && (
          <div style={styles.errorBox}>
            <AlertIcon /><span>{error}</span>
          </div>
        )}

        {/* Email input */}
        <div style={styles.inputWrap}>
          <input
            type="text"
            placeholder="Username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.input}
            autoComplete="username"
          />
          <span style={styles.inputIcon}><UserIcon /></span>
        </div>

        {/* Password input */}
        <div style={styles.inputWrap}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.input}
            autoComplete="current-password"
          />
          <span style={styles.inputIcon}><LockIcon /></span>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
        >
          {loading ? "Signing in…" : "Login"}
        </button>

        <p style={styles.footerText}>Premier Mills Group · Premier CRM</p>
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },

  bgImage: {
    position: "absolute",
    inset: 0,
    backgroundImage: `url(${bgImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    zIndex: 0,
  },
 card: {
  position: "relative",
  zIndex: 2,
  background: "rgba(255, 255, 255, 0.72)",
  backdropFilter: "blur(2px)",
  WebkitBackdropFilter: "blur(2px)",
  border: "1px solid rgba(255, 255, 255, 0.50)",
  borderRadius: 16,
  padding: "24px 40px 28px",  // reduced top padding
  width: 340,                  // narrower card
  boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
},

logoWrap: {
  display: "flex",
  justifyContent: "center",
  marginBottom: 16,
  marginTop: 0,
},

logo: {
  width: 220,   // smaller logo to reduce card height
  height: 100,
  objectFit: "contain",
},

inputWrap: {
  position: "relative",
  marginBottom: 12,
},

input: {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.90)",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 8,
  padding: "12px 44px 12px 16px",
  fontSize: 14,
  color: "#333",
  fontFamily: "inherit",
  outline: "none",
},

btn: {
  width: "100%",
  padding: "12px 0",
  background: "#4a90b8",
  border: "none",
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  color: "#fff",
  fontFamily: "inherit",
  cursor: "pointer",
  marginTop: 4,
  letterSpacing: "0.03em",
  transition: "opacity 0.2s",
},

  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(192,57,43,0.08)",
    border: "1px solid rgba(192,57,43,0.25)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 14,
    fontSize: 13,
    color: "#a23528",
  },



  inputIcon: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#888",
    display: "flex",
    alignItems: "center",
  },

 

  btnDisabled: { opacity: 0.6, cursor: "not-allowed" },

  footerText: {
    textAlign: "center",
    fontSize: 11,
    color: "#888",
    margin: "20px 0 0",
    letterSpacing: "0.04em",
  },
};