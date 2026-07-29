// src/pages/master/OrderList.jsx
//
// Orders hub.
//
// Tabs shown depend on role:
//   - admin / system_admin : "Order List" + "Order Status" (unchanged
//                             from before — full CRUD list, and the
//                             approve/decline/process/dispatch/deliver
//                             workflow). Still an in-page toggle, same
//                             as always.
//   - end_user              : NO in-page toggle anymore. My Orders and
//                             Customer Orders are now two separate
//                             sidebar links (EndUserLayout.jsx) —
//                             "My Orders" -> /master/orders
//                             "Customer Orders" -> /master/orders?tab=customer
//                             This page just reads that `tab` query
//                             param and renders the one matching list.
//                             Both use the same underlying table/filters
//                             as admin's "Order List" (search, status
//                             pills, Excel export/import, view/edit/
//                             delete), just pre-split by who placed the
//                             order:
//                               - My Orders       -> placed by the end
//                                                    user themself
//                               - Customer Orders -> placed by one of
//                                                    their own customers
//                                                    directly
//
// Order List visibility by role (backend scope, unchanged):
//   - system_admin : sees every order, regardless of who it's assigned to
//   - admin        : sees their own orders + orders assigned to end users
//                     under them (backend scope="own_and_team")
//   - end_user     : sees only their own orders (backend scope="own")
//
// NOTE (added): now also shows a one-time success banner when arriving
// here via CartCheckout.jsx's navigate("/master/orders", { state: { notice } }),
// after a Field Officer submits a cart. Everything else below is
// unchanged from the existing file.
//
// My Orders vs Customer Orders split:
// Orders.CreatedBy already exists in the DB and is already set correctly
// by OrderController@store (staff-placed) and @storeBulk (customer cart
// checkout) — so every order already knows who placed it. The only
// backend change needed is adding 'creator' to the eager load on
// GET /orders and GET /orders/{id} (Order::with([...,'creator'])) so
// o.creator.role / o.CreatedBy actually show up in the API response.
//
// detectPlacement() below reads o.creator.role (preferred) or falls
// back to comparing o.CreatedBy against the current user's id. If
// neither is present in the response yet (backend hasn't added the
// eager load), it returns "unknown" and "Customer Orders" shows an
// explanatory empty state instead of guessing.
import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import Layout from "../../components/AppLayout";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";
import ExcelToolbar from "../../components/ExcelToolbar";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Columns shown in the Order List table — Excel download/upload columns
// are always kept identical to this list. Status is left out: it's not
// something that should be edited via a re-uploaded spreadsheet, and
// having it round-trip through Excel was a source of confusion (see
// CUSTOMER_EXCEL_COLUMNS in CustomerList.jsx for the same reasoning).
const ORDER_EXCEL_COLUMNS = [
  { key: "id",           header: "Order ID" },
  { key: "customer",     header: "Customer" },
  { key: "followPerson", header: "Follow Person" },
  { key: "qty",          header: "Qty" },
  { key: "date",         header: "Date" },
  { key: "deliveryDate", header: "Expected Delivery Date" },
];

const categoryColors = {
  yarn:  { bg: "rgba(247,232,203,0.22)", dot: "#D69426", border: "rgba(214,148,38,0.22)" },
  cloth: { bg: "rgba(216,230,243,0.22)", dot: "#5B9BD9", border: "rgba(91,155,217,0.20)" },
};

const Badge = ({ text, colorFn }) => {
  const s = colorFn(text);
  return (
    <span style={{ ...s, padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${s.border}`, fontFamily: FONT }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </span>
  );
};

const btnStyle = (color) => ({ padding: "5px 13px", borderRadius: 7, border: `1px solid ${color}40`, background: `${color}14`, color, cursor: "pointer", fontSize: 12, fontFamily: FONT, fontWeight: 600, whiteSpace: "nowrap" });
const actionBtn = (bg, color, border) => ({
  padding: "7px 14px", borderRadius: 8, border: `1px solid ${border}`, background: bg, color,
  cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
});

export default function OrderList() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const role = localStorage.getItem("role") || "";
  const isEndUser = role === "end_user";
  const notice = location.state?.notice || "";

  // Declared unconditionally (rules of hooks) even though only the
  // admin/system_admin branch below actually reads/sets it.
  const [tab, setTab] = useState("list");

  // ── end_user: no in-page toggle ──
  // Which list renders is decided entirely by the `tab` query param the
  // sidebar sends (EndUserLayout.jsx): absent/"mine" -> My Orders,
  // "customer" -> Customer Orders. Each is its own page now, not a
  // button switch living on top of one shared page.
  if (isEndUser) {
    const placementFilter = searchParams.get("tab") === "customer" ? "customer" : "mine";
    const pageTitle = placementFilter === "customer" ? "Customer Orders" : "My Orders";

    return (
      <Layout pageTitle={pageTitle}>
        {notice && (
          <div style={{ marginBottom: 16, background: "rgba(15,33,56,0.08)", border: "1px solid rgba(15,33,56,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: themeG.accent, fontFamily: FONT }}>
            {notice}
          </div>
        )}
        <OrderListTab themeG={themeG} navigate={navigate} placementFilter={placementFilter} />
      </Layout>
    );
  }

  // ── admin / system_admin: unchanged "Order List" + "Order Status" toggle ──
  const tabsConfig = [
    { key: "list", label: "Order List" },
    { key: "status", label: "Order Status" },
  ];

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      style={{
        padding: "9px 20px", borderRadius: 9, border: "none", cursor: "pointer",
        fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
        background: tab === key ? themeG.accent : "transparent",
        color: tab === key ? "#fff" : themeG.textSub,
      }}
    >
      {label}
    </button>
  );

  return (
    <Layout pageTitle="Orders">
      {notice && (
        <div style={{ marginBottom: 16, background: "rgba(15,33,56,0.08)", border: "1px solid rgba(15,33,56,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: themeG.accent, fontFamily: FONT }}>
          {notice}
        </div>
      )}

      <div style={{ display: "inline-flex", background: themeG.bg, border: `1px solid ${themeG.border}`, borderRadius: 11, padding: 3, marginBottom: 22 }}>
        {tabsConfig.map((t) => tabBtn(t.key, t.label))}
      </div>

      {tab === "list" && <OrderListTab themeG={themeG} navigate={navigate} placementFilter="all" />}
      {tab === "status" && <OrderStatusTab themeG={themeG} navigate={navigate} />}
    </Layout>
  );
}

/* ────────────────────────── Tab: Order List / My Orders / Customer Orders ──────────────────────────── */

// Figures out who placed a given order, using the backend's CreatedBy /
// creator relation (Orders.CreatedBy is already set on every order by
// OrderController@store and @storeBulk — GET /orders and GET
// /orders/{id} just need to eager-load 'creator' for o.creator.role to
// be present). Returns:
//   "mine"     — placed by the current end user (CreatedBy === them)
//   "customer" — placed by a customer directly (creator.role === "customer",
//                 or CreatedBy belongs to someone else)
//   "unknown"  — CreatedBy wasn't included in this response yet (e.g.
//                backend hasn't added 'creator' to the eager load yet)
const detectPlacement = (o, currentUserId) => {
  if (o.creator?.role) {
    return o.creator.role === "customer" ? "customer" : "mine";
  }
  if (o.CreatedBy !== undefined && o.CreatedBy !== null) {
    return String(o.CreatedBy) === String(currentUserId) ? "mine" : "customer";
  }
  return "unknown";
};

// placementFilter: "all" | "mine" | "customer"
function OrderListTab({ themeG, navigate, placementFilter = "all" }) {
  const tab = localStorage.getItem("premier_category") || "cloth";
  const role = localStorage.getItem("role") || "";
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [filterStatus, setFilterStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [followPeople, setFollowPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    try {
      // Role-based scope — system_admin sees everything; admin sees
      // their own orders plus orders assigned to end users under them;
      // end_user sees only their own. Backend is expected to honor
      // this `scope` param the same way OrderEnquiry.jsx's does.
      const params = {};
      if (role === "end_user") params.scope = "own";
      else if (role === "admin") params.scope = "own_and_team";
      // system_admin -> no scope param, backend returns everything

      const [ordRes, custRes, prodRes, usersRes] = await Promise.all([
        API.get("/orders", { params }),
        API.get("/customers"),
        API.get("/products"),
        API.get("/users", { params: { roles: "admin,system_admin,end_user" } }).catch(() => ({ data: [] })),
      ]);
      const people = usersRes.data || [];
      setFollowPeople(people);

      const mapped = ordRes.data.map((o) => {
        // Try every shape the assigned-user relation might come back as
        // from the API first (most reliable, since it's already attached
        // to the order), then fall back to matching against the
        // separately-fetched /users list. If there's an AssignedToId but
        // still no name anywhere, show it plainly instead of silently
        // leaving the cell blank — that's a data-mapping gap worth seeing
        // rather than hiding.
        const followName =
          o.assignedUser?.Name ||
          o.AssignedUser?.Name ||
          o.followUser?.Name ||
          o.FollowUser?.Name ||
          people.find((p) => String(p.Id) === String(o.AssignedToId))?.Name ||
          (o.AssignedToId ? `User #${o.AssignedToId}` : "—");
        return {
          id: o.Code,
          dbId: o.Id,
          customer: o.customer?.Name ?? "—",
          followPerson: followName,
          category: o.Category,
          subType: o.SubType,
          qty: o.Quantity,
          date: o.CreatedAt ? o.CreatedAt.substring(0, 10) : "",
          status: o.Status,
          deliveryDate: o.DeliveryDate ? o.DeliveryDate.substring(0, 10) : null,
          groupRef: o.OrderDetails?.GroupRef ?? null,
          placement: detectPlacement(o, user.Id),
        };
      });
      setOrders(mapped);
      setCustomers(custRes.data);
      setProducts(prodRes.data);
    } catch (err) {
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Orders placed together (multi-product orders) share a GroupRef —
  // fold those into a single display row.
  const groupOrders = (list) => {
    const groups = new Map();
    const singles = [];
    list.forEach((o) => {
      if (!o.groupRef) { singles.push(o); return; }
      if (!groups.has(o.groupRef)) groups.set(o.groupRef, []);
      groups.get(o.groupRef).push(o);
    });
    const groupRows = [...groups.values()].map((members) => {
      const first = members[0];
      return {
        ...first,
        isGroup: true,
        memberIds: members.map((m) => m.dbId),
        members,
        qty: members.reduce((s, m) => s + (parseFloat(m.qty) || 0), 0),
      };
    });
    return [...singles, ...groupRows].sort((a, b) => b.dbId - a.dbId);
  };

  const displayOrders = groupOrders(orders);

  // Whether the backend has actually sent us anything to classify
  // placement with yet. If not, "mine"/"customer" filters can't be
  // trusted, so we show an explanatory empty state instead of guessing.
  const placementFieldAvailable = orders.some((o) => o.placement !== "unknown");

  const filtered = displayOrders.filter((o) => {
    const matchTab = o.category === tab;
    const matchStatus = filterStatus === "All" || o.status === filterStatus.toLowerCase();
    const matchSearch = o.id.toLowerCase().includes(search.toLowerCase())
      || o.customer.toLowerCase().includes(search.toLowerCase())
      || o.followPerson.toLowerCase().includes(search.toLowerCase());
    const matchPlacement =
      placementFilter === "all" ? true :
      !placementFieldAvailable ? false : // can't classify yet — see note above
      placementFilter === "mine" ? o.placement === "mine" :
      placementFilter === "customer" ? o.placement === "customer" :
      true;
    return matchTab && matchStatus && matchSearch && matchPlacement;
  });

  const handleDelete = async (o) => {
    const ids = o.isGroup ? o.memberIds : [o.dbId];
    const label = o.isGroup ? `order ${o.id} (${ids.length} products)` : `order ${o.id}`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeletingId(o.dbId);
    setError("");
    try {
      await Promise.all(ids.map((id) => API.delete(`/orders/${id}`)));
      setOrders((list) => list.filter((x) => !ids.includes(x.dbId)));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete order.");
    } finally {
      setDeletingId(null);
    }
  };

  // Bulk-add orders from an uploaded Excel file — Customer is matched by
  // name or code against what's currently in the system.
  //
  // People generally re-download the current list, tweak a few cells,
  // and re-upload it — so most rows in that file already exist. Skip
  // any row whose "Order ID" column (that order's own Code, carried
  // over from a previous download) matches an order already in the
  // system, instead of inserting it again.
  //
  // NOTE: this endpoint currently only sends customerId/qty/deliveryDate,
  // but /orders also requires productId + pricePerUnit — so a row that
  // isn't a duplicate will still fail validation and count under
  // "failed" until a Product column is added here too.
  const handleImportRows = async (rows) => {
    let created = 0, failed = 0, duplicates = 0;
    const existingCodes = new Set(orders.map((o) => o.id)); // o.id = Order Code

    for (const row of rows) {
      const customer = customers.find((c) => c.Name === row.customer || c.Code === row.customer);
      if (!customer || !row.qty) { failed++; continue; }

      if (row.id && existingCodes.has(String(row.id).trim())) { duplicates++; continue; }

      try {
        await API.post("/orders", {
          customerId: customer.Id,
          qty: parseInt(row.qty, 10) || 1,
          deliveryDate: row.deliveryDate || null,
        });
        created++;
      } catch {
        failed++;
      }
    }
    await load();
    return { created, failed, duplicates };
  };

  if (loading) return <p style={{ color: themeG.textSub, fontFamily: FONT }}>Loading orders…</p>;

  const excelFilenameSuffix =
    placementFilter === "mine" ? "-mine" :
    placementFilter === "customer" ? "-customer" : "";

  return (
    <>
      {error && (
        <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A", fontFamily: FONT }}>
          {error}
        </div>
      )}

      {placementFilter !== "all" && !placementFieldAvailable && (
        <div style={{ marginBottom: 16, background: "rgba(214,148,38,0.10)", border: "1px solid rgba(214,148,38,0.28)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#8A5A0E", fontFamily: FONT }}>
          {placementFilter === "mine"
            ? "\"My Orders\" can't be separated from customer-placed orders yet."
            : "\"Customer Orders\" can't be separated from officer-placed orders yet."}
          {" "}The order-creator info isn't included in this API response yet — ask a developer to add "creator" to the eager load on GET /orders (it's already stored, just not returned).
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: themeG.card, border: `1px solid ${themeG.border}`, boxShadow: "0 2px 8px rgba(46,122,114,0.06)" }}>
          <span style={{ fontSize: 18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Orders</span>
        </div>
        <span style={{ fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>
          <span style={{ color: themeG.accent, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search order, customer, follow person…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, width: 260, fontFamily: FONT, background: themeG.card, outline: "none", color: themeG.textMain }}
        />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["All", "Approved", "Pending", "Processing", "Delivered", "Declined"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{ padding: "6px 13px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 500, transition: "all 0.12s",
                background: filterStatus === s ? "rgba(91,155,217,0.14)" : "transparent",
                color: filterStatus === s ? themeG.accent : themeG.textSub,
                borderColor: filterStatus === s ? "rgba(91,155,217,0.40)" : themeG.border }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <ExcelToolbar
            themeG={themeG}
            rows={filtered}
            columns={ORDER_EXCEL_COLUMNS}
            filename={`orders-${tab}${excelFilenameSuffix}`}
            onImportRows={handleImportRows}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        {[
          { label: "Total Orders", value: filtered.length, color: themeG.accent },
          { label: "Pending", value: filtered.filter((o) => o.status === "pending").length, color: "#D69426" },
          { label: "Delivered", value: filtered.filter((o) => o.status === "delivered").length, color: "#1F5C99" },
        ].map((s) => (
          <div key={s.label} style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 10, padding: "12px 20px", boxShadow: "0 2px 8px rgba(46,122,114,0.05)", flex: 1 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: themeG.textLabel, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'Space Grotesk', " + FONT }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(46,122,114,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${themeG.border}` }}>
              {["Order ID", "Customer", "Follow Person", "Qty", "Date", "Status", "Expected Delivery Date", "Actions"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "10px 13px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(91,155,217,0.04)", fontFamily: FONT }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: themeG.textSub, fontSize: 14, fontFamily: FONT }}>No orders found.</td></tr>
            ) : filtered.map((o) => {
              const cc = categoryColors[o.category] || categoryColors.cloth;
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid rgba(46,122,114,0.06)", background: cc.bg }}>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.accent, fontWeight: 700, borderLeft: `3px solid ${cc.dot}`, fontFamily: FONT }}>
                    {o.id}
                    {o.isGroup && (
                      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: cc.dot, background: cc.border, border: `1px solid ${cc.border}`, padding: "1px 8px", borderRadius: 20 }}>
                        {o.memberIds.length} products
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px 13px", fontSize: 14, color: themeG.textMain, fontWeight: 500, fontFamily: FONT }}>{o.customer}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textSub, fontFamily: FONT }}>{o.followPerson}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textMain, fontFamily: FONT }}>{o.qty}</td>
                  <td style={{ padding: "12px 13px", fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>{o.date}</td>
                  <td style={{ padding: "12px 13px" }}><Badge text={o.status} colorFn={statusColor} /></td>
                  <td style={{ padding: "12px 13px", fontSize: 12, fontFamily: FONT, whiteSpace: "nowrap" }}>
                    {o.deliveryDate || "—"}
                  </td>
                  <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button style={btnStyle("#5B9BD9")} onClick={() => navigate(`/master/orders/add?editId=${o.dbId}`)}>👁️</button>
                      <button style={btnStyle(themeG.accent)} onClick={() => navigate(`/master/orders/add?editId=${o.dbId}`)}>✏️</button>
                      <button style={btnStyle("#B23A3A")} disabled={deletingId === o.dbId} onClick={() => handleDelete(o)}>
                        {deletingId === o.dbId ? "…" : "🗑️"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "10px 13px", borderTop: `1px solid ${themeG.border}`, fontSize: 12, color: themeG.textSub, fontFamily: FONT }}>
          Showing {filtered.length} of {orders.filter((o) => o.category === tab).length} {tab} orders
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Tab: Order Status ─────────────────────────── */

function OrderStatusTab({ themeG, navigate }) {
  const tab = localStorage.getItem("premier_category") || "cloth";
  const role = localStorage.getItem("role") || "";
  const [filter, setFilter] = useState("Approved");
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);

  // Dispatch modal (LR Number + Transport Name)
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [lrNumber, setLrNumber] = useState("");
  const [transportName, setTransportName] = useState("");
  const [dispatching, setDispatching] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get("/orders", { params: filter !== "all" ? { status: filter } : {} });
      setAllOrders(res.data);
    } catch (err) {
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const orders = allOrders.filter((o) => o.Category === tab);

  const th = { textAlign: "left", fontSize: 11, color: themeG.textLabel, padding: "12px 16px", borderBottom: "1px solid rgba(46,122,114,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, background: "rgba(91,155,217,0.04)" };
  const td = { padding: "13px 16px", fontSize: 13.5, color: themeG.textMain };

  const setStatus = async (id, status) => {
    setActingId(id);
    setError("");
    try {
      await API.patch(`/orders/${id}/status`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update status.");
    } finally {
      setActingId(null);
    }
  };

  const releaseHold = async (id) => {
    const note = window.prompt("Note for releasing this credit/discount hold (optional):") || "";
    setActingId(id);
    setError("");
    try {
      await API.patch(`/orders/${id}/release-hold`, { note });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to release hold.");
    } finally {
      setActingId(null);
    }
  };

  const openDispatch = (order) => {
    setDispatchTarget(order);
    setLrNumber("");
    setTransportName("");
    setError("");
  };

  const submitDispatch = async () => {
    if (!lrNumber.trim() || !transportName.trim()) {
      setError("LR Number and Transport Name are both required.");
      return;
    }
    setDispatching(true);
    setError("");
    try {
      await API.patch(`/orders/${dispatchTarget.Id}/dispatch`, {
        lrNumber: lrNumber.trim(),
        transportName: transportName.trim(),
      });
      setDispatchTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to dispatch order.");
    } finally {
      setDispatching(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: themeG.card, border: `1px solid ${themeG.border}`, boxShadow: "0 2px 8px rgba(46,122,114,0.06)" }}>
          <span style={{ fontSize: 18 }}>{tab === "cloth" ? "👘" : "🧵"}</span>
          <span style={{ fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: themeG.textMain }}>{tab === "cloth" ? "Cloth" : "Yarn"} Orders</span>
        </div>
        <span style={{ fontSize: 12, color: themeG.textSub }}>
          <span style={{ color: themeG.accent, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate("/select-category")}>Switch category</span>
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {["pending", "approved", "processing", "dispatched", "delivered", "declined", "all"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "8px 16px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textTransform: "capitalize", background: filter === f ? themeG.accent : themeG.card, color: filter === f ? themeG.card : themeG.textSub, borderColor: filter === f ? themeG.accent : themeG.border }}>
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B23A3A" }}>
          {error}
        </div>
      )}

      <div style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(46,122,114,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Order", "Customer", "Product", "Qty", "Amount", "Status", "Actions"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: 30 }}>Loading…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", padding: 30, color: themeG.textSub }}>No orders in this filter.</td></tr>
            ) : orders.map((o) => (
              <tr key={o.Id} style={{ borderBottom: "1px solid rgba(46,122,114,0.08)" }}>
                <td style={{ ...td, fontWeight: 600, color: themeG.accent, cursor: "pointer" }} onClick={() => navigate(`/master/orders/${o.Id}`)}>{o.Code}</td>
                <td style={td}>{o.customer?.Name ?? "—"}</td>
                <td style={td}>{o.product?.Name ?? "—"}</td>
                <td style={td}>{o.Quantity}</td>
                <td style={{ ...td, fontWeight: 600 }}>₹{parseFloat(o.TotalAmount).toLocaleString()}</td>
                <td style={td}><Badge text={o.Status} colorFn={statusColor} /></td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {o.OnHold && (
                      <>
                        <span title={o.HoldReason} style={{ background: "rgba(178,58,58,0.10)", color: "#96302F", border: "1px solid rgba(178,58,58,0.26)", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                          ⛔ On Hold — credit/discount review
                        </span>
                        <button disabled={actingId === o.Id} onClick={() => releaseHold(o.Id)} style={actionBtn("rgba(46,122,114,0.10)", "#2E7A72", "rgba(46,122,114,0.28)")}>
                          Release Hold
                        </button>
                      </>
                    )}
                    {o.Status === "pending" && (
                      <>
                        {role === "system_admin" ? (
                          <button disabled={actingId === o.Id} onClick={() => setStatus(o.Id, "approved")} style={actionBtn("rgba(91,155,217,0.12)", themeG.accent, "rgba(91,155,217,0.30)")}>Approve</button>
                        ) : (
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: themeG.textSub, fontStyle: "italic" }}>
                            Pending Marketing Head approval
                          </span>
                        )}
                        <button disabled={actingId === o.Id} onClick={() => setStatus(o.Id, "declined")} style={actionBtn("rgba(178,58,58,0.08)", "#B23A3A", "rgba(178,58,58,0.26)")}>Decline</button>
                      </>
                    )}
                    {o.Status === "approved" && (
                      <button disabled={actingId === o.Id} onClick={() => setStatus(o.Id, "processing")} style={actionBtn("rgba(58,92,140,0.10)", "#3A5C8C", "rgba(58,92,140,0.26)")}>Start Processing</button>
                    )}
                    {o.Status === "processing" && (
                      <button disabled={actingId === o.Id} onClick={() => openDispatch(o)} style={actionBtn("rgba(74,46,122,0.10)", "#3A2560", "rgba(74,46,122,0.28)")}>Dispatch</button>
                    )}
                    {o.Status === "dispatched" && (
                      <button disabled={actingId === o.Id} onClick={() => setStatus(o.Id, "delivered")} style={actionBtn("rgba(91,155,217,0.12)", themeG.accent, "rgba(91,155,217,0.30)")}>Mark Delivered</button>
                    )}
                    {o.Status === "dispatched" && o.LRNumber && (
                      <span style={{ fontSize: 11.5, color: themeG.textSub }}>LR: {o.LRNumber} · {o.TransportName}</span>
                    )}
                    {(o.Status === "delivered" || o.Status === "declined") && (
                      <span style={{ fontSize: 12, color: themeG.textSub }}>
                        No further action{o.LRNumber ? ` · LR: ${o.LRNumber}` : ""}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 14, fontSize: 13, color: themeG.textSub }}>
        Showing {orders.length} {tab} order{orders.length !== 1 ? "s" : ""} ({filter})
      </p>

      {dispatchTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,20,34,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={() => setDispatchTarget(null)}>
          <div style={{ background: "#ffffff", borderRadius: 16, padding: 28, width: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontSize: 18, margin: "0 0 4px", color: themeG.textMain }}>
              Dispatch {dispatchTarget.Code}
            </h3>
            <p style={{ fontSize: 12, color: themeG.textSub, margin: "0 0 18px" }}>
              {dispatchTarget.customer?.Name} · {dispatchTarget.product?.Name}
            </p>

            {error && (
              <div style={{ background: "rgba(178,58,58,0.08)", border: "1px solid rgba(178,58,58,0.25)", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12, color: "#B23A3A" }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#526073", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>LR Number *</label>
              <input type="text" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)}
                placeholder="e.g. LR-48213"
                style={{ width: "100%", boxSizing: "border-box", background: "#F5F7FA", border: "1px solid rgba(46,122,114,0.22)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0F2138", fontFamily: "inherit", outline: "none" }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#526073", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Transport Name *</label>
              <input type="text" value={transportName} onChange={(e) => setTransportName(e.target.value)}
                placeholder="e.g. VRL Logistics"
                style={{ width: "100%", boxSizing: "border-box", background: "#F5F7FA", border: "1px solid rgba(46,122,114,0.22)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0F2138", fontFamily: "inherit", outline: "none" }} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={submitDispatch} disabled={dispatching}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: themeG.accent, color: "#fff", cursor: dispatching ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, opacity: dispatching ? 0.6 : 1 }}>
                {dispatching ? "Dispatching…" : "Confirm Dispatch"}
              </button>
              <button onClick={() => setDispatchTarget(null)}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${themeG.border}`, background: themeG.card, color: themeG.textMain, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}