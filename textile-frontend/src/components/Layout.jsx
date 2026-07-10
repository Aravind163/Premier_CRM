import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import { useTheme } from "../ThemeContext";

// Read the active category for display in sidebar
const getActiveCat = () => localStorage.getItem("premier_category") || null;

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Role hierarchy (4 logins):
 *  - super_admin  : read-only everywhere (viewable, not editable/assignable)
 *  - system_admin : full access — can edit/assign, approves admin + end_user accounts,
 *                    assigns area (district/taluk) to both admin and end_user
 *  - admin        : area-scoped operational access (assigned by system_admin),
 *                    can create end_user accounts (pending sys_admin approval)
 *  - end_user     : restricted, area-scoped menu — view/create within their own
 *                    assigned area only, no system-wide master data access
 */
export default function Layout({ children, pageTitle, pageSubtitle }) {
  const location = useLocation();
  const { colors, isDark } = useTheme();
  const role = localStorage.getItem("role") || "super_admin";
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const district = (Array.isArray(user.District) ? user.District.join(", ") : "") || localStorage.getItem("District") || "";
  const taluk    = (Array.isArray(user.Taluk) ? user.Taluk.join(", ") : "") || localStorage.getItem("Taluk") || "";
  const assignedArea = user.AssignedArea || localStorage.getItem("assignedArea") || district || taluk || "";
  const activeCat = getActiveCat();

  const isSuperAdmin  = role === "super_admin";
  const isSystemAdmin = role === "system_admin";
  const isAdmin       = role === "admin";
  const isEndUser     = role === "end_user";

  // Read-only banner shown for super_admin (viewable but not editable/assignable)
  const readOnly = isSuperAdmin;

  const [masterOpen,    setMasterOpen]    = useState(true);
  const [productsOpen,  setProductsOpen]  = useState(true);
  const [ordersOpen,    setOrdersOpen]    = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [statusOpen,    setStatusOpen]    = useState(false);
  const [reportsOpen,   setReportsOpen]   = useState(false);

  const isActive = (path) => location.pathname === path;
  const isPrefix = (path) => location.pathname.startsWith(path);

  const S = buildStyles(colors, isDark);

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={S.body}>
        {/* ── Sidebar ── */}
        <div style={S.sidebar}>
          <div style={S.logoWrap}> <span style={S.logoText}>Premier CRM</span>
          </div>

          {/* Role badge */}
          
          {(isAdmin || isEndUser) && (assignedArea || district || taluk) && (
            <div style={S.areaBadge}>
              📍 {isAdmin ? (district || assignedArea) : (taluk || assignedArea)}
              {isAdmin && <span style={{ opacity: 0.6 }}> (District)</span>}
              {isEndUser && <span style={{ opacity: 0.6 }}> (Taluk)</span>}
            </div>
          )}

          <nav style={S.nav}>
            <Link to="/dashboard" style={{ textDecoration: "none" }}>
              <div style={{ ...S.navItem, ...(isActive("/dashboard") ? S.navItemActive : {}) }}>
                <span style={S.navIcon}><GridIcon /></span>
                <span>Dashboard</span>
              </div>
            </Link>

            {/* Select Category — hidden for end_user (they place orders, not manage catalog) */}
            {!isEndUser && (
              <Link to="/select-category" style={{ textDecoration: "none" }}>
                <div style={{ ...S.navItem, ...(isActive("/select-category") ? S.navItemActive : {}), marginBottom: 4, background: activeCat ? "rgba(82,183,136,0.10)" : "transparent", border: activeCat ? "1px solid rgba(82,183,136,0.25)" : "1px solid transparent", borderRadius: 8 }}>
                  <span style={S.navIcon}><CategoryIcon /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>Category</div>
                    {activeCat && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", marginTop: 1 }}>
                        {activeCat === "cloth" ? "👘 Cloth" : "🧵 Yarn"}
                      </div>
                    )}
                  </div>
                  {!activeCat && <span style={{ fontSize: 10, color: "rgba(255,200,100,0.85)", fontWeight: 700, letterSpacing: "0.04em" }}>SELECT</span>}
                </div>
              </Link>
            )}
              <Link to="/master/allocation" style={{ textDecoration: "none" }}>
                  <div style={{ ...S.navItem, ...(isPrefix("/master/allocation") ? S.navItemActive : {}) }}>
                    <span style={S.navIcon}><ChartIcon /></span>
                    <span>Allocation</span>
                  </div>
                </Link>
            {/* Order Enquiry — the entry point of the O2C flow, so it sits
                before Master: Assign -> Approve -> Add Order (in Master). */}
            <Link to="/master/enquiry" style={{ textDecoration: "none" }}>
              <div style={{ ...S.navItem, ...(isPrefix("/master/enquiry") ? S.navItemActive : {}) }}>
                <span style={S.navIcon}><ActivityIcon /></span>
                <span> Enquiry Order</span>
              </div>
            </Link>

            {/* Master — full version for super_admin / system_admin / admin.
                end_user gets a trimmed "My Orders" style menu instead. */}
            {!isEndUser ? (
              <div style={S.navGroup}>
                <div style={S.navGroupHeader} onClick={() => setMasterOpen(!masterOpen)}>
                  <span style={S.navIcon}><LayersIcon /></span>
                  <span style={S.navGroupLabel}>Master</span>
                  <span style={{ ...S.chevron, transform: masterOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon /></span>
                </div>
                {masterOpen && (
                  <div style={S.navGroupBody}>
                    <div style={{ ...S.navSubItem, ...(isPrefix("/master/products") ? S.navSubActive : {}) }} onClick={() => setProductsOpen(!productsOpen)}>
                      <span>Products</span>
                      <span style={{ ...S.chevron, transform: productsOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon small /></span>
                    </div>
                    {productsOpen && (
                      <div style={S.navLeafGroup}>
                        {/* super_admin can view list but not the Add Product form */}
                        {!isSuperAdmin && (
                          <NavLeaf to="/master/products/add" label="Add Product" active={isActive("/master/products/add")} S={S} />
                        )}
                        <NavLeaf to="/master/products" label="Product List" active={isActive("/master/products")} S={S} />
                      </div>
                    )}

                    <div style={{ ...S.navSubItem, ...(isPrefix("/master/orders") ? S.navSubActive : {}) }} onClick={() => setOrdersOpen(!ordersOpen)}>
                      <span>Orders</span>
                      <span style={{ ...S.chevron, transform: ordersOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon small /></span>
                    </div>
                    {ordersOpen && (
                      <div style={S.navLeafGroup}>
                        {!isSuperAdmin && (
                          <NavLeaf to="/master/orders/add" label="Add Order" active={isActive("/master/orders/add")} S={S} />
                        )}
                        <NavLeaf to="/master/orders" label="Order List" active={isActive("/master/orders")} S={S} />
                      </div>
                    )}

                    <div style={{ ...S.navSubItem, ...(isPrefix("/master/customers") ? S.navSubActive : {}) }} onClick={() => setCustomersOpen(!customersOpen)}>
                      <span>Customer</span>
                      <span style={{ ...S.chevron, transform: customersOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon small /></span>
                    </div>
                    {customersOpen && (
                      <div style={S.navLeafGroup}>
                        {!isSuperAdmin && (
                          <NavLeaf to="/master/customers/add" label="Add Customer" active={isActive("/master/customers/add")} S={S} />
                        )}
                        <NavLeaf to="/master/customers" label="Customer List" active={isActive("/master/customers")} S={S} />
                      </div>
                    )}
                  </div>
                )}

                {/* Quantity Allocation — product-wise & customer-wise: how
                    much has been ordered vs. how much stock allows each
                    customer to actually be given. */}
                
              </div>
            ) : (
              /* ── End User trimmed menu — area-scoped orders only ── */
              <div style={S.navGroup}>
                <div style={S.navGroupHeader} onClick={() => setOrdersOpen(!ordersOpen)}>
                  <span style={S.navIcon}><LayersIcon /></span>
                  <span style={S.navGroupLabel}>My Orders</span>
                  <span style={{ ...S.chevron, transform: ordersOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon /></span>
                </div>
                {ordersOpen && (
                  <div style={S.navGroupBody}>
                    <div style={S.navLeafGroup}>
                      <NavLeaf to="/master/orders/add" label="New Order"   active={isActive("/master/orders/add")} S={S} />
                      <NavLeaf to="/master/orders"     label="Order List"  active={isActive("/master/orders")} S={S} />
                    </div>
                  </div>
                )}
              </div>
            )}

            

            {/* Reports — hidden for end_user */}
            {!isEndUser && (
              <div style={S.navGroup}>
                <div style={S.navGroupHeader} onClick={() => setReportsOpen(!reportsOpen)}>
                  <span style={S.navIcon}><ChartIcon /></span>
                  <span style={S.navGroupLabel}>Reports</span>
                  <span style={{ ...S.chevron, transform: reportsOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon /></span>
                </div>
                {reportsOpen && (
                  <div style={S.navGroupBody}>
                    <NavLeaf to="/reports/orders"    label="Orders"    active={isActive("/reports/orders")} S={S} />
                    <NavLeaf to="/reports/products"  label="Products"  active={isActive("/reports/products")} S={S} />
                    <NavLeaf to="/reports/employees" label="Employees" active={isActive("/reports/employees")} S={S} />
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* ── Right: Header + Scrollable Content + Footer ── */}
        <div style={S.rightPane}>
          <Header />
          <div style={S.scrollArea}>
            <div style={S.main}>
              {readOnly && (
                <div >
                </div>
              )}
              {children}
            </div>
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}

function roleLabel(role) {
  switch (role) {
    case "super_admin":  return "Super Admin";
    case "system_admin": return "System Admin";
    case "admin":         return "Admin";
    case "end_user":      return "End User";
    default:              return role;
  }
}

function NavLeaf({ to, label, active, S }) {
  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <div style={{ ...S.navLeafItem, ...(active ? S.navLeafActive : {}) }}>
        {label}
      </div>
    </Link>
  );
}

function buildStyles(colors, isDark) {
  return {
    page: {
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      background: colors.background,
      fontFamily: FONT,
    },
    body: {
      display: "flex",
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    },
    rightPane: {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    },
    scrollArea: {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden",
    },
    main: {
      padding: "24px 20px",
      background: colors.background,
      minHeight: "calc(100vh - 62px - 46px)",
    },
    sidebar: {
      width: 210,
      background: colors.sidebarBg,
      display: "flex",
      flexDirection: "column",
      padding: "20px 10px",
      flexShrink: 0,
      overflowY: "auto",
    },
    logoWrap: {
      display: "flex", alignItems: "center", gap: 9,
      paddingLeft: 6, marginBottom: 14,
    },
    logoText: {
      fontFamily: FONT,
      fontSize: 16, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.3px",
    },
    roleBadge: {
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 10px", marginBottom: 6, marginLeft: 4,
      borderRadius: 6, background: "rgba(255,255,255,0.08)",
      width: "fit-content",
    },
    roleBadgeText: {
      fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.80)",
      textTransform: "uppercase", letterSpacing: "0.04em",
    },
    roleBadgeTag: {
      fontSize: 9, fontWeight: 700, color: "#ffd166",
      background: "rgba(255,209,102,0.15)", padding: "2px 6px", borderRadius: 4,
      letterSpacing: "0.03em",
    },
    areaBadge: {
      fontSize: 11, color: "rgba(255,255,255,0.55)",
      marginLeft: 4, marginBottom: 16,
    },
    readOnlyBanner: {
      marginBottom: 18, padding: "10px 16px", borderRadius: 10,
      background: "rgba(255,209,102,0.12)", border: "1px solid rgba(255,209,102,0.35)",
      fontSize: 13, color: "#8a6510", fontFamily: FONT, fontWeight: 500,
    },
    nav: { flex: 1 },
    navItem: {
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 8, marginBottom: 2,
      cursor: "pointer", fontSize: 14,
      color: "rgba(255,255,255,0.65)", transition: "all 0.15s",
      fontFamily: FONT,
    },
    navItemActive: {
      background: colors.sidebarActive,
      color: "#ffffff", fontWeight: 600,
      borderLeft: `3px solid ${colors.accentLight}`,
    },
    navIcon: { display: "flex", alignItems: "center", color: "inherit" },
    navGroup: { marginBottom: 2 },
    navGroupHeader: {
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 8,
      cursor: "pointer", fontSize: 14,
      color: "rgba(255,255,255,0.65)", transition: "all 0.15s",
      fontFamily: FONT,
    },
    navGroupLabel: { flex: 1, fontWeight: 500 },
    chevron: {
      display: "flex", alignItems: "center",
      color: "rgba(255,255,255,0.40)", transition: "transform 0.15s",
    },
    navGroupBody: { paddingLeft: 12, marginTop: 2, marginBottom: 4 },
    navSubItem: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 12px", fontSize: 13.5,
      color: "rgba(255,255,255,0.70)", cursor: "pointer",
      borderRadius: 7, transition: "all 0.15s", fontFamily: FONT,
    },
    navSubActive: {
      background: colors.sidebarActive, color: "#ffffff", fontWeight: 600,
      borderLeft: `3px solid ${colors.accentLight}`,
    },
    navLeafGroup: { paddingLeft: 12, marginBottom: 2 },
    navLeafItem: {
      padding: "8px 12px", fontSize: 12.5,
      color: "rgba(255,255,255,0.55)", cursor: "pointer",
      borderRadius: 6, transition: "all 0.15s", fontFamily: FONT,
    },
    navLeafActive: {
      background: "rgba(82,183,136,0.20)",
      color: "#ffffff", fontWeight: 600,
      borderLeft: `2px solid ${colors.accentLight}`,
    },
    pageHeader: { marginBottom: 24 },
    pageHeading: {
      fontFamily: FONT,
      fontSize: 26, fontWeight: 700, margin: "0 0 4px",
      color: colors.textPrimary, letterSpacing: "-0.4px",
    },
    pageHeadingSub: { fontSize: 13, color: colors.textSecondary, margin: 0, fontFamily: FONT },
  };
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function LayersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function ActivityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function ChevronIcon({ small }) {
  const size = small ? 11 : 13;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function CategoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 10h16M4 14h8M4 18h8" />
      <circle cx="19" cy="16" r="3" />
      <path d="M19 13v3l2 1" />
    </svg>
  );
}