
import { useEffect, useRef, useState } from "react";
import Layout from "../../components/AppLayout";
import { useTheme } from "../../ThemeContext";
import { getG } from "../../theme";
import API from "../../services/api";
import AllocationAdminEndUsers from "./AllocationAdminEndUsers";
import AllocationEmployeeDirectory from "./AllocationEmployeeDirectory";
import AllocationSystemAdmin from "./AllocationSystemAdmin";

const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ── Top-level page: two tabs sharing one Layout ──
//   1. Product Allocation  — ProductAllocationPanel (below): product-wise /
//      customer-wise stock allocation (unchanged from before).
//   2. Employee Allocation — territory assignment, role-dependent:
//      system_admin edits District/Taluk for Admins & End Users
//      (was pages/status/SystemAdminEmployees.jsx); admin assigns Taluk for
//      their own End Users (was pages/status/StatusEndUsers.jsx); super_admin
//      gets the read-only directory (was pages/status/StatusEmployees.jsx).
export default function Allocation() {
  const { isDark } = useTheme();
  const themeG = getG(isDark);
  const role = localStorage.getItem("role") || "";

  const [topTab, setTopTab] = useState("employee"); // "product" | "employee"

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

