// src/components/EndUserLayout.jsx
//
// Dedicated layout for the "end_user" role (area/taluk-scoped field
// officer). Mirrors CustomerLayout's small, focused sidebar rather than
// the full admin Layout — an end_user doesn't manage system-wide master
// data, so they don't need that whole menu tree.
//
// Nav:
//   Dashboard        -> /end-user/dashboard
//   My Orders         -> New Order (/master/orders/add) + Order List (/master/orders)
//   Order Enquiry     -> /end-user/enquiry   (read-only, area-wide pending orders)
//   Complaints        -> /end-user/complaints (read-only, area-wide complaints)
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import { useTheme } from "../ThemeContext";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function EndUserLayout({ children }) {
  const { colors, isDark } = useTheme();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const taluks = readTaluks();

  const isDashboard   = location.pathname === "/end-user/dashboard";
  const isNewOrder    = location.pathname === "/master/orders/add";
  const isOrderList   = location.pathname.startsWith("/master/orders") && !isNewOrder;
  const isEnquiry     = location.pathname.startsWith("/master/enquiry");
  const isComplaints  = location.pathname.startsWith("/end-user/complaints");

  const [ordersOpen, setOrdersOpen] = useState(isNewOrder || isOrderList);

  const S = buildStyles(colors, isDark);

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={S.body}>
        {/* ── Sidebar (end_user / area-scoped) ── */}
        <div style={S.sidebar}>
          <div style={S.logoWrap}>
            <span style={S.logoText}>Premier CRM</span>
          </div>

          <div style={S.welcomeBadge}>
            👋 {user.name || user.email || "End User"}
          </div>

          {taluks.length > 0 && (
            <div style={S.areaBadge}>
              📍 {taluks.join(", ")}
              <span style={{ opacity: 0.6 }}> (Taluk)</span>
            </div>
          )}

          <nav style={S.nav}>
            <Link to="/end-user/dashboard" style={{ textDecoration: "none" }}>
              <div style={{ ...S.navItem, ...(isDashboard ? S.navItemActive : {}) }}>
                <span style={S.navIcon}><GridIcon /></span>
                <span>Dashboard</span>
              </div>
            </Link>

            {/* Order Enquiry — entry point of the O2C flow, so it comes
                before My Orders: Assign -> Approve -> Add Order. */}
            <Link to="/master/enquiry" style={{ textDecoration: "none" }}>
              <div style={{ ...S.navItem, ...(isEnquiry ? S.navItemActive : {}) }}>
                <span style={S.navIcon}><ActivityIcon /></span>
                <span>Order Enquiry</span>
              </div>
            </Link>

            <div style={S.navGroup}>
              <div style={S.navGroupHeader} onClick={() => setOrdersOpen(!ordersOpen)}>
                <span style={S.navIcon}><OrdersIcon /></span>
                <span style={S.navGroupLabel}>My Orders</span>
                <span style={{ ...S.chevron, transform: ordersOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon /></span>
              </div>
              {ordersOpen && (
                <div style={S.navGroupBody}>
                  <NavLeaf to="/master/orders/add" label="New Order"  active={isNewOrder}  S={S} />
                  <NavLeaf to="/master/orders"     label="Order List" active={isOrderList} S={S} />
                </div>
              )}
            </div>

            <Link to="/end-user/complaints" style={{ textDecoration: "none" }}>
              <div style={{ ...S.navItem, ...(isComplaints ? S.navItemActive : {}) }}>
                <span style={S.navIcon}><ChartIcon /></span>
                <span>Complaints</span>
              </div>
            </Link>
          </nav>

          <div style={S.sidebarFooterNote}>
            Need help? Contact your District Admin.
          </div>
        </div>

        {/* ── Right: Header + Scrollable Content + Footer ── */}
        <div style={S.rightPane}>
          <Header />
          <div style={S.scrollArea}>
            <div style={S.main}>{children}</div>
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}

// Taluk is stored as a JSON array (or a plain string, for older records).
// Normalise either shape into a clean string array for display.
function readTaluks() {
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
      background: isDark ? colors.background : "#F5F7FA",
      backgroundImage: isDark ? "none" : "radial-gradient(circle at 1px 1px, rgba(15,33,56,0.05) 1px, transparent 0), radial-gradient(1200px 500px at 100% -10%, rgba(31,92,153,0.07), transparent 60%)",
      backgroundSize: "22px 22px, 100% 100%",
      backgroundAttachment: "fixed, fixed",
      minHeight: "calc(100vh - 62px - 46px)",
    },
    sidebar: {
      width: 200,
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
      fontFamily: "\'Space Grotesk\', " + FONT,
      fontSize: 16, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.3px",
    },
    welcomeBadge: {
      fontSize: 12, color: "rgba(255,255,255,0.60)",
      marginLeft: 4, marginBottom: 6,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    },
    areaBadge: {
      fontSize: 11, color: "rgba(255,255,255,0.55)",
      marginLeft: 4, marginBottom: 16,
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
      borderLeft: "3px solid #D69426",
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
    navLeafItem: {
      padding: "8px 12px", fontSize: 12.5,
      color: "rgba(255,255,255,0.55)", cursor: "pointer",
      borderRadius: 6, transition: "all 0.15s", fontFamily: FONT,
    },
    navLeafActive: {
      background: "rgba(91,155,217,0.20)",
      color: "#ffffff", fontWeight: 600,
      borderLeft: "2px solid #D69426",
    },
    sidebarFooterNote: {
      fontSize: 11, color: "rgba(255,255,255,0.40)",
      lineHeight: 1.5, padding: "12px 10px 4px",
      borderTop: "1px solid rgba(255,255,255,0.08)",
    },
  };
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

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function OrdersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3H8a2 2 0 0 0-2 2v16l6-3 6 3V5a2 2 0 0 0-2-2z" />
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
function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}