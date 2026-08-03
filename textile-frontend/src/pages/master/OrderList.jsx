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
// End-user status pills (both My Orders + Customer Orders):
//   All | Pending | Approved | Rejected
//   ("Rejected" is the UI label for backend status "declined".)
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
//
// FIX (placement misclassification): the role check against
// o.creator.role was a strict `=== "customer"` comparison. If the
// backend sends the role in any other casing/shape (e.g. "Customer",
// "CUSTOMER", or with stray whitespace), every order silently fell
// through to "mine" — which is exactly the "everything lands in My
// Orders" symptom. Now normalized (trimmed + lowercased) before
// comparing, and matched against a small set of known "customer-ish"
// values instead of a single exact string, so backend inconsistencies
// don't misroute orders.
//
// TABLE REDESIGN (latest): columns reordered to
//   S.No | Order No | Date | Customer Name | Sub Type | Product Name |
//   Qty | Following Person | Delivery Date | Status | Actions
// "Order ID" is now labelled "Order No" (same underlying value, o.Code —
// just a clearer header). Sub Type and Product Name are pulled from real
// data: Sub Type is already the order's own o.SubType; Product Name is
// newly resolved below via o.product?.Name (if the backend eager-loads
// it) falling back to a lookup against the already-fetched /products
// list by o.ProductId — no placeholder/dummy values used for either.
import { useTheme } from "../../ThemeContext";
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import Layout from "../../components/AppLayout";
import { getG, statusColor } from "../../theme";
import API from "../../services/api";
import ExcelToolbar from "../../components/ExcelToolbar";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Excel export/import columns — kept in the same order as the on-screen
// table (minus S.No/Actions, which aren't meaningful in a spreadsheet).
const ORDER_EXCEL_COLUMNS = [
  { key: "id", header: "Order No" },
  { key: "date", header: "Date" },
  { key: "customer", header: "Customer Name" },
  { key: "subType", header: "Sub Type" },
  { key: "productName", header: "Product Name" },
  { key: "qty", header: "Qty" },
  { key: "followPerson", header: "Following Person" },
  { key: "deliveryDate", header: "Expected Delivery Date" },
  { key: "status", header: "Status" },
];

// End-user lists: only these 4. "Rejected" is UI-only; backend status is "declined".
const STATUS_FILTERS_END_USER = ["All", "Pending", "Approved", "Rejected"];
const STATUS_FILTERS_ADMIN = ["All", "Approved", "Pending", "Processing", "Delivered", "Declined"];

/** Map UI filter label → backend status string(s) to match. */
function statusMatchesFilter(orderStatus, filterStatus) {
  if (filterStatus === "All") return true;
  const s = (orderStatus || "").toLowerCase();
  const f = filterStatus.toLowerCase();
  if (f === "rejected" || f === "declined") return s === "declined" || s === "rejected";
  return s === f;
}

/** Display label for a raw status (end-user prefers Rejected over Declined). */
function displayStatus(status, preferRejected) {
  const s = (status || "").toLowerCase();
  if (preferRejected && (s === "declined" || s === "rejected")) return "rejected";
  return status || "";
}

const categoryColors = {
  yarn: { bg: "rgba(247,232,203,0.22)", dot: "#D69426", border: "rgba(214,148,38,0.22)" },
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

  const [tab, setTab] = useState("list");

  // ── end_user: no in-page toggle ──
  // My Orders      -> /master/orders            (placed by this FO)
  // Customer Orders -> /master/orders?tab=customer (placed by their customers)
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
        <OrderListTab
          themeG={themeG}
          navigate={navigate}
          placementFilter={placementFilter}
          statusFilters={STATUS_FILTERS_END_USER}
          preferRejectedLabel
        />
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

      {tab === "list" && (
        <OrderListTab
          themeG={themeG}
          navigate={navigate}
          placementFilter="all"
          statusFilters={STATUS_FILTERS_ADMIN}
        />
      )}
      {tab === "status" && <OrderStatusTab themeG={themeG} navigate={navigate} />}
    </Layout>
  );
}

/* ────────────────────────── Tab: Order List / My Orders / Customer Orders ──────────────────────────── */

const CUSTOMER_ROLE_VALUES = new Set(["customer", "cust", "client"]);

const detectPlacement = (o, currentUserId) => {
  const rawRole = o.creator?.role;
  if (rawRole !== undefined && rawRole !== null && String(rawRole).trim() !== "") {
    const normalizedRole = String(rawRole).trim().toLowerCase();
    return CUSTOMER_ROLE_VALUES.has(normalizedRole) ? "customer" : "mine";
  }
  if ((currentUserId === undefined || currentUserId === null || currentUserId === "") && (o.CreatedBy !== undefined && o.CreatedBy !== null)) {
    return "unknown";
  }
  if (o.CreatedBy !== undefined && o.CreatedBy !== null) {
    return String(o.CreatedBy) === String(currentUserId) ? "mine" : "customer";
  }
  return "unknown";
};

// placementFilter: "all" | "mine" | "customer"
// statusFilters: pill labels (end-user uses All/Pending/Approved/Rejected)
function OrderListTab({
  themeG,
  navigate,
  placementFilter = "all",
  statusFilters = STATUS_FILTERS_ADMIN,
  preferRejectedLabel = false,
}) {
  const tab = localStorage.getItem("premier_category") || "cloth";
  const role = localStorage.getItem("role") || "";
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const currentUserId = user.Id ?? user.id ?? user.ID ?? user.userId ?? null;

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
      const params = {};
      if (role === "end_user") params.scope = "own";
      else if (role === "admin") params.scope = "own_and_team";

      const [ordRes, custRes, prodRes, usersRes] = await Promise.all([
        API.get("/orders", { params }),
        API.get("/customers"),
        API.get("/products"),
        API.get("/users", { params: { roles: "admin,system_admin,end_user" } }).catch(() => ({ data: [] })),
      ]);
      const people = usersRes.data || [];
      setFollowPeople(people);

      // Keyed by customer id so each order can look up its own customer's
      // registered Contact Person — same field ProductCatalog.jsx shows
      // under "Contact Person" (customer?.ContactPersons?.[0]?.contactName).
      const customersById = {};
      (custRes.data || []).forEach((c) => { customersById[c.Id] = c; });

      // Keyed by product id — resolves the real Product Name for the new
      // "Product Name" column below, for orders whose API response
      // doesn't already eager-load the full product on `o.product`.
      const productsById = {};
      (prodRes.data || []).forEach((p) => { productsById[p.Id] = p; });

      const mapped = ordRes.data.map((o) => {
        // Backend sends the loaded relation as `assignee` (Order::with([...,
        // 'assignee', ...])) and the raw id as `AssignedTo` — not
        // AssignedToId / assignedUser / followUser, which never matched
        // anything the API actually returns.
        const assignedName =
          o.assignee?.Name ||
          o.assignee?.name ||
          people.find((p) => String(p.Id ?? p.id) === String(o.AssignedTo))?.Name ||
          people.find((p) => String(p.Id ?? p.id) === String(o.AssignedTo))?.name ||
          (o.AssignedTo ? `User #${o.AssignedTo}` : null);

        // No staff member has claimed this order yet (fresh customer-cart
        // enquiry) — fall back to the customer's own registered Contact
        // Person instead of showing a bare "—".
        const customer = o.customer || customersById[o.CustomerId];
        const contactPersonName = customer?.ContactPersons?.[0]?.contactName || null;

        const followName = assignedName || contactPersonName || "—";

        // Real Product Name — prefer an eager-loaded o.product, fall back
        // to the /products lookup by ProductId. No placeholder text.
        const productName = o.product?.Name || productsById[o.ProductId]?.Name || "—";

        return {
          id: o.Code,
          dbId: o.Id,
          customer: o.customer?.Name ?? "—",
          followPerson: followName,
          category: o.Category,
          subType: o.SubType || "—",
          productName,
          qty: o.Quantity,
          date: o.CreatedAt ? o.CreatedAt.substring(0, 10) : "",
          status: o.Status,
          deliveryDate: o.DeliveryDate ? o.DeliveryDate.substring(0, 10) : null,
          groupRef: o.OrderDetails?.GroupRef ?? o.OrderDetails?.CartRef ?? null,
          placement: detectPlacement(o, currentUserId),
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

  // Reset status filter when switching My Orders ↔ Customer Orders
  useEffect(() => {
    setFilterStatus("All");
  }, [placementFilter]);

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

  const placementFieldAvailable = orders.some((o) => o.placement !== "unknown");

  const filtered = displayOrders.filter((o) => {
    const matchTab = o.category === tab;
    const matchStatus = statusMatchesFilter(o.status, filterStatus);
    const matchSearch = o.id.toLowerCase().includes(search.toLowerCase())
      || o.customer.toLowerCase().includes(search.toLowerCase())
      || o.followPerson.toLowerCase().includes(search.toLowerCase())
      || (o.productName || "").toLowerCase().includes(search.toLowerCase());
    const matchPlacement =
      placementFilter === "all" ? true :
        !placementFieldAvailable ? false :
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

  const handleImportRows = async (rows) => {
    let created = 0, failed = 0, duplicates = 0;
    const existingCodes = new Set(orders.map((o) => o.id));

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

  const pendingCount = filtered.filter((o) => (o.status || "").toLowerCase() === "pending").length;
  const approvedCount = filtered.filter((o) => (o.status || "").toLowerCase() === "approved").length;
  const rejectedCount = filtered.filter((o) => {
    const s = (o.status || "").toLowerCase();
    return s === "declined" || s === "rejected";
  }).length;

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
          placeholder="Search order, customer, product, follow person…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${themeG.border}`, fontSize: 13, width: 260, fontFamily: FONT, background: themeG.card, outline: "none", color: themeG.textMain }}
        />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {statusFilters.map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{
                padding: "6px 13px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 500, transition: "all 0.12s",
                background: filterStatus === s ? "rgba(91,155,217,0.14)" : "transparent",
                color: filterStatus === s ? themeG.accent : themeG.textSub,
                borderColor: filterStatus === s ? "rgba(91,155,217,0.40)" : themeG.border
              }}>
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
        {(preferRejectedLabel
          ? [
            { label: "Total Orders", value: filtered.length, color: themeG.accent },
            { label: "Pending", value: pendingCount, color: "#D69426" },
            { label: "Approved", value: approvedCount, color: "#1F5C99" },
            { label: "Rejected", value: rejectedCount, color: "#B23A3A" },
          ]
          : [
            { label: "Total Orders", value: filtered.length, color: themeG.accent },
            { label: "Pending", value: filtered.filter((o) => o.status === "pending").length, color: "#D69426" },
            { label: "Delivered", value: filtered.filter((o) => o.status === "delivered").length, color: "#1F5C99" },
          ]
        ).map((s) => (
          <div key={s.label} style={{ background: themeG.card, border: `1px solid ${themeG.border}`, borderRadius: 10, padding: "12px 20px", boxShadow: "0 2px 8px rgba(46,122,114,0.05)", flex: 1 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: themeG.textLabel, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'Space Grotesk', " + FONT }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: "#EAF3FC", border: "1px solid rgba(91,155,217,0.35)", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(46,122,114,0.06)" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${themeG.border}` }}>
              {["S.No", "Order No", "Date", "Customer Name", "Sub Type", "Product Name", "Qty", "Following Person", "Delivery Date", "Status", "Actions"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, padding: "10px 13px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, color: "#FFFFFF", background: "#1F3A63", fontFamily: FONT, whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: 40, color: themeG.textSub, fontSize: 14, fontFamily: FONT }}>
                  {placementFilter === "customer"
                    ? "No customer-placed enquiries yet. Orders you submit for a customer appear under My Orders."
                    : placementFilter === "mine"
                      ? "No orders placed by you yet."
                      : "No orders found."}
                </td>
              </tr>
            ) : filtered.map((o, idx) => {
              const cc = categoryColors[o.category] || categoryColors.cloth;
              const statusLabel = displayStatus(o.status, preferRejectedLabel);
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid rgba(46,122,114,0.06)", background: cc.bg }}>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textSub, fontFamily: FONT, borderLeft: `3px solid ${cc.dot}` }}>{idx + 1}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.accent, fontWeight: 700, fontFamily: FONT, whiteSpace: "nowrap" }}>
                    {o.id}
                    {o.isGroup && (
                      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: cc.dot, background: cc.border, border: `1px solid ${cc.border}`, padding: "1px 8px", borderRadius: 20 }}>
                        {o.memberIds.length} products
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px 13px", fontSize: 12, color: themeG.textSub, fontFamily: FONT, whiteSpace: "nowrap" }}>{o.date}</td>
                  <td style={{ padding: "12px 13px", fontSize: 14, color: themeG.textMain, fontWeight: 500, fontFamily: FONT }}>{o.customer}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textMain, fontFamily: FONT }}>{o.subType}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textMain, fontFamily: FONT }}>{o.productName}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textMain, fontFamily: FONT }}>{o.qty}</td>
                  <td style={{ padding: "12px 13px", fontSize: 13, color: themeG.textSub, fontFamily: FONT }}>{o.followPerson}</td>
                  <td style={{ padding: "12px 13px", fontSize: 12, fontFamily: FONT, whiteSpace: "nowrap" }}>
                    {o.deliveryDate || "—"}
                  </td>
                  <td style={{ padding: "12px 13px" }}><Badge text={statusLabel} colorFn={statusColor} /></td>
                  <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button style={btnStyle("#5B9BD9")} onClick={() => navigate(`/master/orders/add?editId=${o.dbId}&mode=view`)}>👁️</button>
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
        </div>
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

  const th = { textAlign: "left", fontSize: 11, padding: "12px 16px", borderBottom: "1px solid rgba(46,122,114,0.13)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, color: "#FFFFFF", background: "#1F3A63" };
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