import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
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
import StatusCustomers from "./pages/status/StatusCustomers";
import StatusOrders    from "./pages/status/StatusOrders";
import StatusEmployees from "./pages/status/StatusEmployees";
import SystemAdminEmployees from "./pages/status/SystemAdminEmployees";
import StatusEndUsers from "./pages/status/StatusEndUsers";
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
          <Route path="/customer/dashboard" element={<CustomerDashboard />} />
          <Route path="/select-category" element={<SelectCategory />} />

          {/* Master – Products */}
          <Route path="/master/products"     element={<ProductList />} />
          <Route path="/master/products/add" element={<AddProduct />} />
          <Route path="/master/products/:id" element={<ProductView />} />

          {/* Master – Customers */}
          <Route path="/master/customers"     element={<CustomerList />} />
          <Route path="/master/customers/add" element={<AddCustomer />} />
          <Route path="/master/customers/:id" element={<CustomerView />} />

          {/* Master – Orders */}
          <Route path="/master/orders"     element={<OrderList />} />
          <Route path="/master/orders/add" element={<AddOrder />} />
          <Route path="/master/orders/:id" element={<OrderView />} />

          {/* Status */}
          <Route path="/status/customers"        element={<StatusCustomers />} />
          <Route path="/status/orders"           element={<StatusOrders />} />
          <Route path="/status/employees"        element={<StatusEmployees />} />
          <Route path="/status/employees/manage" element={<SystemAdminEmployees />} />
          <Route path="/status/end-users"        element={<StatusEndUsers />} />

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
