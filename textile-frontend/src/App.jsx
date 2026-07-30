import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import EndUserDashboard from "./pages/EndUserDashboard";
import ComplaintsAndClaims from "./pages/master/ComplaintsAndClaims";
import Allocation from "./pages/master/Allocation";
import Batches from "./pages/master/Batches";
import Invoices from "./pages/master/Invoices";
import ComplianceDashboard from "./pages/master/ComplianceDashboard";
import ProductCatalog from "./pages/ProductCatalog";
import CustomerDrafts from "./pages/CustomerDrafts";
import OrderEnquiry from "./pages/OrderEnquiry";
import StaffOrderEnquiry from "./pages/master/OrderEnquiry";
import CustomerOrders from "./pages/CustomerOrders";
import TrackOrders from "./pages/TrackOrders";
import RaiseComplaint from "./pages/RaiseComplaint";
import SelectCategory from "./pages/SelectCategory";
import ProductList from "./pages/master/ProductList";
import AddProduct from "./pages/master/AddProduct";
import ProductView from "./pages/master/ProductView";
import CustomerList from "./pages/master/CustomerList";
import AddCustomer from "./pages/master/AddCustomer";
import CustomerView from "./pages/master/CustomerView";
import OrderList from "./pages/master/OrderList";
import AddOrder from "./pages/master/AddOrder";
import OrderView from "./pages/master/OrderView";
import AllocationEmployeeDirectory from "./pages/master/AllocationEmployeeDirectory";
import AllocationSystemAdmin from "./pages/master/AllocationSystemAdmin";
import AllocationAdminEndUsers from "./pages/master/AllocationAdminEndUsers";
import SalesOrder from "./pages/master/SalesOrder";
import CreditLimit from "./pages/master/CreditLimit";
import EndUserAddCustomer from "./pages/end-user/AddCustomer";
import EndUserCustomerList from "./pages/end-user/CustomerList";
import EndUserProductSelection from "./pages/end-user/ProductSelection";
import Drafts from "./pages/end-user/Drafts";
import CartCheckout from "./pages/end-user/CartCheckout";
import EnquiryOrderReportPage from "./pages/reports/EnquiryOrderReportPage";
import OverdueReportPage from "./pages/reports/OverdueReportPage";
import DataReportPage from "./pages/reports/DataReportPage";
import ProductWiseReportPage from "./pages/reports/ProductWiseReportPage";
import AgeingReportPage from "./pages/reports/AgeingReportPage";
import SalesLossReportPage from "./pages/reports/SalesLossReportPage";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename="/Premier_crm/public">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Customer journey:
              Dashboard -> Product Catalog (browse + specify color/size)
              -> Order Enquiry (review cart + submit) -> My Orders
              -> Track Orders (once dispatched) -> Raise Complaint */}
          <Route path="/customer/dashboard" element={<CustomerDashboard />} />
          <Route path="/customer/catalog" element={<ProductCatalog />} />
          <Route path="/customer/drafts" element={<CustomerDrafts />} />
          <Route path="/customer/enquiry" element={<OrderEnquiry />} />
          <Route path="/customer/orders" element={<CustomerOrders />} />
          <Route path="/customer/track" element={<TrackOrders />} />
          <Route path="/customer/complaints" element={<RaiseComplaint />} />

          {/* Legacy route — old bookmarks/links to the combined Shop page
              now land on the Product Catalog instead. */}
          <Route path="/customer/shop" element={<Navigate to="/customer/catalog" replace />} />

          {/* End User journey (area/taluk-scoped field officer):
              Dashboard -> Add Customer (register a customer inside their
              own area) -> Product Selection (build cart) -> Order Cart
              (review + submit or save as draft) -> Drafts (resume later)
              -> Order Enquiry (Assign -> Approve -> Add Order, shared
              with admin via AppLayout) -> My Orders (Order List)
              -> Complaints (read-only, area-wide) */}
          <Route path="/end-user/dashboard" element={<EndUserDashboard />} />
          <Route path="/end-user/customers" element={<EndUserCustomerList />} />
          <Route path="/end-user/customers/add" element={<EndUserAddCustomer />} />
          <Route path="/end-user/product-selection" element={<EndUserProductSelection />} />
          <Route path="/end-user/order-cart" element={<CartCheckout />} />
          <Route path="/end-user/enquiry" element={<Navigate to="/master/enquiry" replace />} />
          <Route path="/end-user/complaints" element={<ComplaintsAndClaims />} />
          <Route path="/end-user/drafts" element={<Drafts />} />

          <Route path="/select-category" element={<SelectCategory />} />

          {/* Master – Order Enquiry (Admin / System Admin / End User act
              on it; Super Admin views read-only). Sits before the rest of
              Master since it's the entry point of the O2C flow. */}
          <Route path="/master/enquiry" element={<StaffOrderEnquiry />} />

          {/* Master – Products */}
          <Route path="/master/products" element={<ProductList />} />
          <Route path="/master/products/add" element={<AddProduct />} />
          <Route path="/master/products/:id" element={<ProductView />} />

          {/* Master – Customers */}
          <Route path="/master/customers" element={<CustomerList />} />
          <Route path="/master/customers/add" element={<AddCustomer />} />
          <Route path="/master/customers/:id" element={<CustomerView />} />

          {/* Master – Quantity Allocation (product-wise & customer-wise) */}
          <Route path="/master/allocation" element={<Allocation />} />

          {/* Master – FIFO Stock Batches / Invoices / Claims / Compliance */}
          <Route path="/master/batches" element={<Batches />} />
          <Route path="/master/invoices" element={<Invoices />} />
          <Route path="/master/claims" element={<ComplaintsAndClaims />} />
          <Route path="/master/compliance" element={<ComplianceDashboard />} />

          {/* Master – Orders */}
          <Route path="/master/orders" element={<OrderList />} />
          <Route path="/master/orders/add" element={<AddOrder />} />
          <Route path="/master/orders/:id" element={<OrderView />} />

          {/* Master – Sales Order (pipeline worklist -> Push to ERP) and
              Credit Limit (outstanding balances / overdue-day filters) */}
          <Route path="/master/sales-order" element={<SalesOrder />} />
          <Route path="/master/credit-limit" element={<CreditLimit />} />

          {/* Status — StatusCustomers/StatusOrders were merged into the
              "Status" tab of CustomerList / OrderList; the employee-status
              pages were renamed under pages/master/Allocation*. */}
          <Route path="/status/customers" element={<CustomerList />} />
          <Route path="/status/orders" element={<OrderList />} />
          <Route path="/status/employees" element={<AllocationEmployeeDirectory />} />
          <Route path="/status/employees/manage" element={<AllocationSystemAdmin />} />
          <Route path="/status/end-users" element={<AllocationAdminEndUsers />} />

          {/* Reports — Enquiry Order Report / Overdue Report / Data Report
              (Products, Orders, Employees) now live together on one page
              behind in-page tabs, instead of three separate sidebar links. */}
          <Route path="/reports" element={<Navigate to="/reports/enquiry" replace />} />
          <Route path="/reports/enquiry" element={<EnquiryOrderReportPage />} />
          <Route path="/reports/overdue" element={<OverdueReportPage />} />
          <Route path="/reports/data" element={<DataReportPage />} />
          <Route path="/reports/product-wise" element={<ProductWiseReportPage />} />
          <Route path="/reports/ageing" element={<AgeingReportPage />} />
          <Route path="/reports/sales-loss" element={<SalesLossReportPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;