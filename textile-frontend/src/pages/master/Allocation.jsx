// src/pages/master/Allocation.jsx
//
// Quantity Allocation (Admin / System Admin).
//
// Scenario this solves: 5 customers order 200 units of a product each,
// but only 400 units are actually in stock. Someone has to decide how
// much each customer actually gets. This screen supports two views:
//
//   1. Product-wise — pick a product, see every customer who ordered it,
//      Ordered Qty (computed live from Orders) vs an editable Allocated
//      Qty, with a running "remaining stock" total that refuses to let
//      you allocate more than what's on hand.
//   2. Customer-wise — pick a customer, see every product they currently
//      have active demand for, same Ordered vs Allocated editing, each
//      product still checked against its own available stock.
import { useEffect, useState } from "react";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";
import AllocationAdminEndUsers from "./AllocationAdminEndUsers";
import AllocationEmployeeDirectory from "./AllocationEmployeeDirectory";
import AllocationSystemAdmin from "./AllocationSystemAdmin";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";


export default function Allocation() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const role = localStorage.getItem("role") || "";

  const [topTab, setTopTab] = useState("employee"); 

  const topTabBtn = (key, label) => (
    <button
      onClick={() => setTopTab(key)}
      style={{
        padding: "9px 20px", borderRadius: 9, border: "none", cursor: "pointer",
        fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
        background: topTab === key ? themeG.accent : "transparent",
        color: topTab === key ? "#fff" : themeG.textSub,
      }}
    >
      {label}
    </button>
  );

  return (
    <Layout pageTitle="Allocation">
      <div style={{ display: "inline-flex", background: themeG.bg, border: `1px solid ${themeG.border}`, borderRadius: 11, padding: 3, marginBottom: 22 }}>
        {topTabBtn("employee", "Employee Allocation")}
      </div>

      {topTab === "employee" && (
        role === "system_admin" ? <AllocationSystemAdmin embedded />
          : role === "admin" ? <AllocationAdminEndUsers embedded />
          : <AllocationEmployeeDirectory embedded />
      )}
    </Layout>
  );
}
