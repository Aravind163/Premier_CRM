import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import EndUserDashboard from "./pages/EndUserDashboard";
import EndUserComplaints from "./pages/EndUserComplaints";
import Allocation from "./pages/master/Allocation";
import ProductCatalog from "./pages/ProductCatalog";
import OrderEnquiry from "./pages/OrderEnquiry";
import StaffOrderEnquiry from "./pages/master/OrderEnquiry";
import CustomerOrders from "./pages/CustomerOrders";
import TrackOrders from "./pages/TrackOrders";
import RaiseComplaint from "./pages/RaiseComplaint";
import SelectCategory from "./pages/SelectCategory";
import ProductList  from "./pages/master/ProductList";
import AddProduct   from "./pages/master/AddProduct";
import ProductView  from "./pages/master/ProductView";
import CustomerList from "./pages/master/CustomerList";
import AddCustomer  from "./pages/master/AddCustomer";
import CustomerView from "./pages/master/CustomerView";
import OrderList    from "./pages/master/OrderList";
import AddOrder     from "./pages/master/AddOrder";
import OrderView    from "./pages/master/OrderView";
import AllocationEmployeeDirectory from "./pages/master/AllocationEmployeeDirectory";
import AllocationSystemAdmin from "./pages/master/AllocationSystemAdmin";
import AllocationAdminEndUsers from "./pages/master/AllocationAdminEndUsers";
import ReportsOrders    from "./pages/reports/ReportsOrders";
import ReportsProducts  from "./pages/reports/ReportsProducts";
import ReportsEmployees from "./pages/reports/ReportsEmployees";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename="/Premier_crm/public">
        <Routes>
          <Route path="/"        element={<Login />} />
          <Route path="/login"   element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Customer journey:
              Dashboard -> Product Catalog (browse + specify color/size)
              -> Order Enquiry (review cart + submit) -> My Orders
              -> Track Orders (once dispatched) -> Raise Complaint */}
          <Route path="/customer/dashboard"  element={<CustomerDashboard />} />
          <Route path="/customer/catalog"    element={<ProductCatalog />} />
          <Route path="/customer/enquiry"    element={<OrderEnquiry />} />
          <Route path="/customer/orders"     element={<CustomerOrders />} />
          <Route path="/customer/track"      element={<TrackOrders />} />
          <Route path="/customer/complaints" element={<RaiseComplaint />} />

          {/* Legacy route — old bookmarks/links to the combined Shop page
              now land on the Product Catalog instead. */}
          <Route path="/customer/shop" element={<Navigate to="/customer/catalog" replace />} />

          {/* End User journey (area/taluk-scoped field officer):
              Dashboard -> Order Enquiry (Assign -> Approve -> Add Order,
              shared with admin via AppLayout) -> My Orders (New Order /
              Order List) -> Complaints (read-only, area-wide) */}
          <Route path="/end-user/dashboard"  element={<EndUserDashboard />} />
          <Route path="/end-user/enquiry"    element={<Navigate to="/master/enquiry" replace />} />
          <Route path="/end-user/complaints" element={<EndUserComplaints />} />

          <Route path="/select-category" element={<SelectCategory />} />

          {/* Master – Order Enquiry (Admin / System Admin / End User act
              on it; Super Admin views read-only). Sits before the rest of
              Master since it's the entry point of the O2C flow. */}
          <Route path="/master/enquiry" element={<StaffOrderEnquiry />} />

          {/* Master – Products */}
          <Route path="/master/products"     element={<ProductList />} />
          <Route path="/master/products/add" element={<AddProduct />} />
          <Route path="/master/products/:id" element={<ProductView />} />

          {/* Master – Customers */}
          <Route path="/master/customers"     element={<CustomerList />} />
          <Route path="/master/customers/add" element={<AddCustomer />} />
          <Route path="/master/customers/:id" element={<CustomerView />} />

          {/* Master – Quantity Allocation (product-wise & customer-wise) */}
          <Route path="/master/allocation" element={<Allocation />} />

          {/* Master – Orders */}
          <Route path="/master/orders"     element={<OrderList />} />
          <Route path="/master/orders/add" element={<AddOrder />} />
          <Route path="/master/orders/:id" element={<OrderView />} />

          {/* Status — StatusCustomers/StatusOrders were merged into the
              "Status" tab of CustomerList / OrderList; the employee-status
              pages were renamed under pages/master/Allocation*. */}
          <Route path="/status/customers"        element={<CustomerList />} />
          <Route path="/status/orders"           element={<OrderList />} />
          <Route path="/status/employees"        element={<AllocationEmployeeDirectory />} />
          <Route path="/status/employees/manage" element={<AllocationSystemAdmin />} />
          <Route path="/status/end-users"        element={<AllocationAdminEndUsers />} />

          {/* Reports */}
          <Route path="/reports/orders"    element={<ReportsOrders />} />
          <Route path="/reports/products"  element={<ReportsProducts />} />
          <Route path="/reports/employees" element={<ReportsEmployees />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
