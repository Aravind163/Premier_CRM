import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../ThemeContext";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const pageTitles = {
  "/dashboard": "Dashboard",
  "/master/products": "Product List",
  "/master/products/add": "Add Product",
  "/master/orders": "Order List",
  "/master/orders/add": "Add Order",
  "/master/customers": "Customer List",
  "/master/customers/add": "Add Customer",
  "/status/customers": "Customer Status",
  "/status/orders": "Order Status",
  "/status/employees": "Employees",
  "/status/employees/manage": "Manage Employees",
  "/reports/orders": "Order Reports",
  "/reports/products": "Product Reports",
  "/reports/employees": "Employee Reports",
  "/customer/dashboard":"Customer Dashboard",
  "/customer/shop": "Order Enquiry",
  "/customer/orders": "My Orders",
};


const CUSTOMER_ROLES = [
  { value: "customer",      label: "Customer" },
];

const STAFF_ROLES = [
  { value: "end_user",      label: "End User" },
  { value: "admin",         label: "Admin" },
  { value: "system_admin",  label: "System Admin" },
  { value: "super_admin",   label: "Super Admin" },
];

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme, colors } = useTheme();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = localStorage.getItem("role") || "";
  // Customers only ever see "Customer" in this dropdown; staff (End User /
  // Admin / System Admin / Super Admin) only ever see the other three
  // staff roles plus themselves — the two groups never mix.
  const visibleRoles = role === "customer" ? CUSTOMER_ROLES : STAFF_ROLES;
  const pageTitle = pageTitles[location.pathname] || "Premier CRM";

  const [dropOpen, setDropOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const dropRef = useRef(null);
  const roleMenuRef = useRef(null);

  const roleLabel = {
    super_admin: "Super Admin",
    system_admin: "System Admin",
    admin: "Admin",
    end_user: "End User",
    customer: "Customer",
  }[role] || role;

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    navigate("/login");
  };

  // Jumping to a different role logs the current session out and sends
  // the person to the login screen pre-set to that role/tab — a quick
  // shortcut rather than a real role switch (each account still only
  // ever has the one role the server assigns it).
  const handleRoleJump = (targetRole) => {
    setRoleMenuOpen(false);
    if (targetRole === role) return;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    const params = targetRole === "customer" ? "mode=customer" : `mode=staff&role=${targetRole}`;
    navigate(`/login?${params}`);
  };

  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false);
      }
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target)) {
        setRoleMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div style={{
      height: 62,
      background: isDark ? colors.headerBg : "linear-gradient(180deg, #173456, #0F2138)",
      borderBottom: `1px solid ${isDark ? colors.border : '#0F2138'}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      flexShrink: 0,
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      fontFamily: FONT,
      position: "relative",
      zIndex: 100,
    }}>
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", fontFamily: "'Space Grotesk', " + FONT, letterSpacing: "-0.3px", lineHeight: 1.1 }}>
            {pageTitle}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: "0.10em", fontFamily: FONT }}>
            PREMIER CRM
          </span>
          </div>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

        {/* Current-role dropdown — quick jump to a different login */}
        <div ref={roleMenuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setRoleMenuOpen((p) => !p)}
            title="Switch login role"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.12)",
              border: "1.5px solid rgba(255,255,255,0.25)",
              borderRadius: 20,
              padding: "5px 12px",
              cursor: "pointer",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: FONT,
            }}
          >
            <RoleIcon />
            <span>{roleLabel}</span>
            <ChevronDownIcon />
          </button>

          {roleMenuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 10px)", left: 0,
              background: isDark ? colors.card : "#ffffff",
              border: `1px solid ${isDark ? colors.border : '#DBE3EC'}`,
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              minWidth: 190,
              zIndex: 999,
              overflow: "hidden",
              fontFamily: FONT,
            }}>
              <div style={{ padding: "10px 14px", fontSize: 10.5, fontWeight: 700, color: isDark ? colors.textSecondary : "#8C96A3", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${isDark ? colors.border : '#EAEFF5'}` }}>
                Login as
              </div>
              {visibleRoles.map((r) => {
                const active = r.value === role;
                return (
                  <button
                    key={r.value}
                    onClick={() => handleRoleJump(r.value)}
                    disabled={active}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", background: active ? (isDark ? colors.surface : "#EAEFF5") : "none",
                      border: "none", cursor: active ? "default" : "pointer",
                      color: active ? "#1F5C99" : (isDark ? colors.textPrimary : "#0F2138"),
                      fontSize: 13, fontWeight: active ? 700 : 500, fontFamily: FONT, textAlign: "left",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "#F5F7FA"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "none"; }}
                  >
                    {r.label}
                    {active && <CheckIcon />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1.5px solid rgba(255,255,255,0.25)",
            borderRadius: 20,
            padding: "5px 12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#ffffff",
            fontSize: 12,
            fontFamily: FONT,
            transition: "all 0.2s",
          }}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
          <span>{isDark ? "Light" : "Dark"}</span>
        </button>

        {/* User Dropdown */}
        <div ref={dropRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropOpen(p => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", fontFamily: FONT }}>
                {user.name || user.email || "User"}
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", fontFamily: FONT }}>
                {roleLabel}
              </span>
            </div>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1.5px solid rgba(255,255,255,0.30)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <PersonIcon />
            </div>
            <span style={{ color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center" }}>
              <ChevronDownIcon />
            </span>
          </button>

          {/* Dropdown Menu */}
          {dropOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              background: isDark ? colors.card : "#ffffff",
              border: `1px solid ${isDark ? colors.border : '#DBE3EC'}`,
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              minWidth: 200,
              zIndex: 999,
              overflow: "hidden",
              fontFamily: FONT,
            }}>
              {/* User Info */}
              <div style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${isDark ? colors.border : '#EAEFF5'}`,
                background: isDark ? colors.surface : '#F5F7FA',
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: isDark ? colors.textPrimary : '#0F2138', fontFamily: FONT }}>
                  {user.name || user.email || "User"}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: isDark ? colors.textSecondary : '#526073', fontFamily: FONT }}>
                  {roleLabel}
                </p>
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "12px 16px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: isDark ? colors.error : '#B23A3A',
                  fontSize: 13,
                  fontFamily: FONT,
                  fontWeight: 600,
                  textAlign: "left",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(251,113,133,0.10)' : 'rgba(225,29,72,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <LogoutIcon />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F5C99" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="7.05" y2="7.05" />
      <line x1="16.95" y1="16.95" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="7.05" y2="16.95" />
      <line x1="16.95" y1="7.05" x2="19.78" y2="4.22" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}