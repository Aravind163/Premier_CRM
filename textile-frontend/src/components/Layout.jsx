import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import { useTheme } from "../ThemeContext";

// Read the active category for display in sidebar
const getActiveCat = () => localStorage.getItem("premier_category") || null;

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
// District/Taluk may be stored as a plain array, a JSON-encoded array
// string, or (due to a past double-encoding bug) a JSON string whose
// content is itself another JSON array. Keep decoding until it resolves
// to an array or a non-JSON plain value.
function parseAreaList(raw) {
  let value = raw;
  for (let i = 0; i < 3 && typeof value === "string" && value !== ""; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value) return [String(value)];
  return [];
}

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
  const district = parseAreaList(user.District || localStorage.getItem("District") || "").join(", ");
  const taluk = parseAreaList(user.Taluk || localStorage.getItem("Taluk") || "").join(", ");
  const assignedArea = user.AssignedArea || localStorage.getItem("assignedArea") || district || taluk || "";
  const activeCat = getActiveCat();

  const isSuperAdmin = role === "super_admin";
  const isSystemAdmin = role === "system_admin";
  const isAdmin = role === "admin";
  const isEndUser = role === "end_user";

  // Read-only banner shown for super_admin (viewable but not editable/assignable)
  const readOnly = isSuperAdmin;

  // These used to default to `true` (Master / Products) regardless of what
  // page you were on, so the sidebar showed them force-expanded even on
  // completely unrelated pages like Reports or Enquiry Order. Instead,
  // each group only starts open if the current URL is actually inside it —
  // Layout remounts fresh on every navigation (each page wraps its own
  // <Layout>), so this recomputes correctly every time without needing an
  // effect. The user can still manually expand/collapse from there.
  const [masterOpen, setMasterOpen] = useState(
    () => location.pathname.startsWith("/master/customers")
      || location.pathname.startsWith("/master/products")
      || location.pathname.startsWith("/master/orders")
      || location.pathname.startsWith("/master/enquiry")
  );
  const [productsOpen, setProductsOpen] = useState(() => location.pathname.startsWith("/master/products"));
  const [ordersOpen, setOrdersOpen] = useState(() => location.pathname.startsWith("/master/orders") || location.pathname.startsWith("/master/enquiry"));
  const [customersOpen, setCustomersOpen] = useState(() => location.pathname.startsWith("/master/customers"));
  const [statusOpen, setStatusOpen] = useState(() => location.pathname.startsWith("/status"));
  // Reports — now a collapsible group of 6 separate report pages (like
  // Master), so it opens whenever you're on any /reports/* route instead
  // of defaulting closed regardless of where you are.
  const [reportsOpen, setReportsOpen] = useState(() => location.pathname.startsWith("/reports"));

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
                <div style={{ ...S.navItem, ...(isActive("/select-category") ? S.navItemActive : {}), marginBottom: 4, background: activeCat ? "rgba(91,155,217,0.10)" : "transparent", border: activeCat ? "1px solid rgba(91,155,217,0.25)" : "1px solid transparent", borderRadius: 8 }}>
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

            {/* FIFO stock batches (Rack vs EB4), Invoices, Claims, and the
                Customer Compliance dashboard — Marketing-facing O2C steps
                8/9/11/14. Hidden for end_user (out of their scope). */}
            {!isEndUser && (
              <>
                <Link to="/master/batches" style={{ textDecoration: "none" }}>
                  <div style={{ ...S.navItem, ...(isPrefix("/master/batches") ? S.navItemActive : {}) }}>
                    <span style={S.navIcon}><BoxIcon /></span>
                    <span>Marketing Review</span>
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
                        {/* Customer — moved first */}
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

                        {/* Products — second */}
                        <div style={{ ...S.navSubItem, ...(isPrefix("/master/products") ? S.navSubActive : {}) }} onClick={() => setProductsOpen(!productsOpen)}>
                          <span>Products</span>
                          <span style={{ ...S.chevron, transform: productsOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon small /></span>
                        </div>
                        {productsOpen && (
                          <div style={S.navLeafGroup}>
                            {!isSuperAdmin && (
                              <NavLeaf to="/master/products/add" label="Add Product" active={isActive("/master/products/add")} S={S} />
                            )}
                            <NavLeaf to="/master/products" label="Product List" active={isActive("/master/products")} S={S} />
                          </div>
                        )}

                        {/* Orders — third */}
                        <div style={{ ...S.navSubItem, ...((isPrefix("/master/orders") || isPrefix("/master/enquiry")) ? S.navSubActive : {}) }} onClick={() => setOrdersOpen(!ordersOpen)}>
                          <span>Orders</span>
                          <span style={{ ...S.chevron, transform: ordersOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon small /></span>
                        </div>
                        {ordersOpen && (
                          <div style={S.navLeafGroup}>
                            <NavLeaf to="/master/orders/add" label="Add Enquiry" active={isActive("/master/orders/add")} S={S} />
                            <NavLeaf to="/master/enquiry" label="Enquiry Order" active={isActive("/master/enquiry")} S={S} />
                            <NavLeaf to="/master/orders" label="Order List" active={isActive("/master/orders")} S={S} />
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
                          <NavLeaf to="/master/orders" label="Order List" active={isActive("/master/orders")} S={S} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Link to="/master/invoices" style={{ textDecoration: "none" }}>
                  <div style={{ ...S.navItem, ...(isPrefix("/master/invoices") ? S.navItemActive : {}) }}>
                    <span style={S.navIcon}><ReceiptIcon /></span>
                    <span>Invoices</span>
                  </div>
                </Link>
                <Link to="/master/sales-order" style={{ textDecoration: "none" }}>
                  <div style={{ ...S.navItem, ...(isPrefix("/master/sales-order") ? S.navItemActive : {}) }}>
                    <span style={S.navIcon}><BoxIcon /></span>
                    <span>Order Details</span>
                  </div>
                </Link>
                <Link to="/master/credit-limit" style={{ textDecoration: "none" }}>
                  <div style={{ ...S.navItem, ...(isPrefix("/master/credit-limit") ? S.navItemActive : {}) }}>
                    <span style={S.navIcon}><ReceiptIcon /></span>
                    <span>Credit Limit</span>
                  </div>
                </Link>
                <Link to="/master/claims" style={{ textDecoration: "none" }}>
                  <div style={{ ...S.navItem, ...(isPrefix("/master/claims") ? S.navItemActive : {}) }}>
                    <span style={S.navIcon}><FlagIcon /></span>
                    <span>Complaints & Claims</span>
                  </div>
                </Link>
                {/* <Link to="/master/compliance" style={{ textDecoration: "none" }}>
                  <div style={{ ...S.navItem, ...(isPrefix("/master/compliance") ? S.navItemActive : {}) }}>
                    <span style={S.navIcon}><ShieldIcon /></span>
                    <span>Compliance</span>
                  </div>
                </Link> */}
              </>
            )}
            {/* Order Enquiry — the entry point of the O2C flow, so it sits
                before Master: Assign -> Approve -> Add Order (in Master). */}



            {/* Reports — six separate report pages behind one collapsible
                group, same pattern as Master:
                  Enquiry Order Report, Overdue Report, Data Report,
                  Product Wise Report, Ageing Report, Sales Loss Report.
                Hidden for end_user. */}
            {!isEndUser && (
              <div style={S.navGroup}>
                <div style={S.navGroupHeader} onClick={() => setReportsOpen(!reportsOpen)}>
                  <span style={S.navIcon}><ChartIcon /></span>
                  <span style={S.navGroupLabel}>Reports</span>
                  <span style={{ ...S.chevron, transform: reportsOpen ? "rotate(90deg)" : "rotate(0deg)" }}><ChevronIcon /></span>
                </div>
                {reportsOpen && (
                  <div style={S.navGroupBody}>
                    <div style={S.navLeafGroup}>
                      <NavLeaf to="/reports/enquiry" label="Enquiry Order Report" active={isActive("/reports/enquiry")} S={S} />
                      <NavLeaf to="/reports/overdue" label="Overdue Report" active={isActive("/reports/overdue")} S={S} />
                      <NavLeaf to="/reports/data" label="Data Report" active={isActive("/reports/data")} S={S} />
                      <NavLeaf to="/reports/product-wise" label="Product Wise Report" active={isActive("/reports/product-wise")} S={S} />
                      <NavLeaf to="/reports/ageing" label="Ageing Report" active={isActive("/reports/ageing")} S={S} />
                      <NavLeaf to="/reports/sales-loss" label="Sales Loss Report" active={isActive("/reports/sales-loss")} S={S} />
                    </div>
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
    case "super_admin": return "Super Admin";
    case "system_admin": return "System Admin";
    case "admin": return "Admin";
    case "end_user": return "End User";
    default: return role;
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
      background: isDark
        ? colors.background
        : "#F5F7FA",
      backgroundImage: isDark
        ? "none"
        : "radial-gradient(circle at 1px 1px, rgba(15,33,56,0.05) 1px, transparent 0), radial-gradient(1200px 500px at 100% -10%, rgba(31,92,153,0.07), transparent 60%)",
      backgroundSize: "22px 22px, 100% 100%",
      backgroundAttachment: "fixed, fixed",
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
      fontFamily: "'Space Grotesk', " + FONT,
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
      background: "rgba(238,193,94,0.15)", padding: "2px 6px", borderRadius: 4,
      letterSpacing: "0.03em",
    },
    areaBadge: {
      fontSize: 11, color: "rgba(255,255,255,0.55)",
      marginLeft: 4, marginBottom: 16,
    },
    readOnlyBanner: {
      marginBottom: 18, padding: "10px 16px", borderRadius: 10,
      background: "rgba(238,193,94,0.12)", border: "1px solid rgba(238,193,94,0.35)",
      fontSize: 13, color: "#8A5A0E", fontFamily: FONT, fontWeight: 500,
    },
    nav: { flex: 1 },
    navItem: {
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 8, marginBottom: 2,
      cursor: "pointer", fontSize: 14,
      color: "rgba(255, 255, 255, 0.95)", transition: "all 0.15s",
      fontFamily: FONT,
    },
    navItemActive: {
      background: colors.sidebarActive,
      color: "#ffffff", fontWeight: 600,
      borderLeft: "3px solid #D69426",
    },
    navIcon: {
      display: "flex",
      alignItems: "center",
      color: "#ffffff",
    },
    navGroup: { marginBottom: 2 },
    navGroupHeader: {
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 8,
      cursor: "pointer", fontSize: 14,
      color: "rgba(244, 238, 238, 0.97)", transition: "all 0.15s",
      fontFamily: FONT,
    },
    navGroupLabel: { flex: 1, fontWeight: 500 },
    chevron: {
      display: "flex", alignItems: "center",
      color: "rgba(255, 255, 255, 0.95)", transition: "transform 0.15s",
    },
    navGroupBody: { paddingLeft: 12, marginTop: 2, marginBottom: 4 },
    navSubItem: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 12px", fontSize: 13.5,
      color: "rgba(255, 255, 255, 0.93)", cursor: "pointer",
      borderRadius: 7, transition: "all 0.15s", fontFamily: FONT,
    },
    navSubActive: {
      background: colors.sidebarActive, color: "#ffffff", fontWeight: 600,
      borderLeft: "3px solid #D69426",
    },
    navLeafGroup: { paddingLeft: 12, marginBottom: 2 },
    navLeafItem: {
      padding: "8px 12px", fontSize: 12.5,
      color: "rgba(255, 255, 255, 0.92)", cursor: "pointer",
      borderRadius: 6, transition: "all 0.15s", fontFamily: FONT,
    },
    navLeafActive: {
      background: "rgba(91,155,217,0.20)",
      color: "#ffffff", fontWeight: 600,
      borderLeft: "2px solid #D69426",
    },
    pageHeader: { marginBottom: 24 },
    pageHeading: {
      fontFamily: "'Space Grotesk', " + FONT,
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

function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2z" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
    </svg>
  );
}