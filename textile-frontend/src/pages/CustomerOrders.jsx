// src/pages/CustomerOrders.jsx
//
// TABLE REDESIGN (latest): previously this showed a product-line table
// (Sort No / Shade No / Product Description / Qty / UOM / Color / Type /
// Status) built mostly from dummy placeholder fields (dummyShadeNo(),
// dummyDescription(), dummyType(), DUMMY_SWATCHES), and never surfaced
// the order's own Code, the customer's name, who's following it up, or
// its delivery date at all.
//
// Replaced with the same column layout now used on the staff-side Order
// List (OrderList.jsx), so a customer's own order history reads the same
// way everywhere in the app:
//   S.No | Order No | Date | Customer Name | Sub Type | Product Name |
//   Qty | Following Person | Delivery Date | Status
// (No Actions column here — customers can view but not edit/delete their
// own placed orders from this screen, unlike the staff Order List.)
//
// Every field is real, not a placeholder:
//   - Order No       -> o.Code
//   - Customer Name   -> o.customer?.Name (falls back to this logged-in
//                        customer's own record if the order response
//                        doesn't eager-load it)
//   - Sub Type        -> o.product?.SubType || o.SubType
//   - Product Name    -> o.product?.Name
//
// FIX (Following Person not resolving): this previously only checked
// o.assignee?.Name/name and gave up with "—" the moment that relation
// wasn't eager-loaded on the order response — it never tried the other
// two fallbacks OrderList.jsx already relies on for the exact same
// field. Now uses the identical 3-step chain:
//   1. o.assignee?.Name / o.assignee?.name        (eager-loaded relation)
//   2. /users list matched against o.AssignedTo    (raw id, relation not
//      loaded yet)
//   3. this order's own customer's registered Contact Person
//      (customer?.ContactPersons?.[0]?.contactName) — for orders nobody
//      on staff has claimed yet
// Only falls through to "—" if none of the three resolve.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerLayout from "../components/CustomerLayout";
import { useTheme } from "../ThemeContext";
import { getG, statusColor } from "../theme";
import API from "../services/api";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TABLE_HEADERS = ["S.No", "Order No", "Date", "Customer Name", "Sub Type", "Product Name", "Qty", "Following Person", "Delivery Date", "Status"];

const Badge = ({ text, colorFn }) => {
  const s = colorFn(text || "—");
  return (
    <span style={{ ...s, padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${s.border}`, fontFamily: FONT }}>
      {(text || "—").charAt(0).toUpperCase() + (text || "—").slice(1)}
    </span>
  );
};

export default function CustomerOrders() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [orders, setOrders] = useState([]);
  const [ownCustomer, setOwnCustomer] = useState(null);
  const [followPeople, setFollowPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const styles = {
    heading: { fontFamily: "'Space Grotesk', " + FONT, fontSize: 28, fontWeight: 700, margin: "0 0 4px", color: themeG.textMain, letterSpacing: "-0.4px" },
    headingSub: { fontSize: 13, color: themeG.textSub, margin: "0 0 22px" },
    tableBox: { background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(15,33,56,0.06)" },
    tableScroll: { overflowX: "auto" },
    table: { width: "100%", minWidth: 1000, borderCollapse: "collapse" },
    th: { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#FFFFFF", background: "#1F3A63", borderBottom: `1px solid ${themeG.border}`, position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" },
    td: { padding: "12px 13px", fontSize: 13.5, color: themeG.textMain, borderBottom: "1px solid rgba(46,122,114,0.06)", fontFamily: FONT, whiteSpace: "nowrap" },
  };

  useEffect(() => {
    (async () => {
      try {
        const [ordRes, custRes, usersRes] = await Promise.all([
          API.get("/orders"),
          API.get("/customers").catch(() => ({ data: [] })),
          // Same roster OrderList.jsx uses to resolve a raw AssignedTo id
          // into a name when the `assignee` relation isn't eager-loaded
          // on the order itself.
          API.get("/users", { params: { roles: "admin,system_admin,end_user" } }).catch(() => ({ data: [] })),
        ]);
        setOrders(ordRes.data);
        // This logged-in customer's own record — used both as a Customer
        // Name fallback and as the source of the Contact Person fallback
        // for Following Person below.
        setOwnCustomer(custRes.data?.[0] || null);
        setFollowPeople(usersRes.data || []);
      } catch {
        setError("Failed to load your orders. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  return (
    <CustomerLayout>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <h1 style={styles.heading}>My Orders</h1>
      <p style={styles.headingSub}>All the orders you've placed.</p>

      {error && (
        <div style={{ marginBottom: 20, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}

      <div style={styles.tableBox}>
        <div style={styles.tableScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                {TABLE_HEADERS.map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={TABLE_HEADERS.length} style={{ ...styles.td, textAlign: "center", padding: 30, whiteSpace: "normal" }}>Loading your orders…</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={TABLE_HEADERS.length} style={{ ...styles.td, textAlign: "center", padding: 30, whiteSpace: "normal" }}>No orders yet.</td></tr>
              ) : orders.map((o, i) => {
                const p = o.product || {};
                const customer = o.customer || ownCustomer;
                const customerName = customer?.Name || user.name || "—";
                const subType = p.SubType || o.SubType || "—";
                const productName = p.Name || "—";

                // Same 3-step chain as OrderList.jsx: eager-loaded relation
                // -> /users lookup by raw AssignedTo id -> this customer's
                // own registered Contact Person. Only "—" if all three miss.
                const assignedName =
                  o.assignee?.Name ||
                  o.assignee?.name ||
                  followPeople.find((u) => String(u.Id ?? u.id) === String(o.AssignedTo))?.Name ||
                  followPeople.find((u) => String(u.Id ?? u.id) === String(o.AssignedTo))?.name ||
                  (o.AssignedTo ? `User #${o.AssignedTo}` : null);
                const contactPersonName = customer?.ContactPersons?.[0]?.contactName || null;
                const followName = assignedName || contactPersonName || "—";

                const deliveryDate = o.DeliveryDate ? o.DeliveryDate.substring(0, 10) : "—";
                const date = o.CreatedAt ? o.CreatedAt.substring(0, 10) : "—";
                return (
                  <tr key={o.Id}>
                    <td style={{ ...styles.td, color: themeG.textSub }}>{i + 1}</td>
                    <td style={{ ...styles.td, color: themeG.accent, fontWeight: 700 }}>{o.Code || "—"}</td>
                    <td style={styles.td}>{date}</td>
                    <td style={styles.td}>{customerName}</td>
                    <td style={styles.td}>{subType}</td>
                    <td style={styles.td}>{productName}</td>
                    <td style={styles.td}>{o.Quantity}</td>
                    <td style={styles.td}>{followName}</td>
                    <td style={styles.td}>{deliveryDate}</td>
                    <td style={styles.td}><Badge text={o.Status} colorFn={statusColor} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 13px", borderTop: `1px solid ${themeG.border}`, fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>
          Showing {orders.length} order{orders.length !== 1 ? "s" : ""}
        </div>
      </div>
    </CustomerLayout>
  );
}