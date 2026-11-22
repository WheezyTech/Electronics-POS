
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./layouts/DashboardLayout";

import Login from "./pages/auth/Login";
import PasswordReset from "./pages/auth/PasswordReset";
import VerifyEmail from "./pages/auth/VerifyEmail";
import Dashboard from "./pages/dashboard/Dashboard";
import POS from "./pages/sales/POS";
import Sales from "./pages/sales/Sales";
import Returns from "./pages/sales/Returns";
import Shifts from "./pages/sales/Shifts";
import Reports from "./pages/reports/Reports";
import Customers from "./pages/customers/Customers";
import Products from "./pages/products/Products";
import Inventory from "./pages/inventory/Inventory";
import Purchasing from "./pages/purchasing/Purchasing";
import Barcodes from "./pages/products/Barcodes";
import Settings from "./pages/settings/Settings";
import StoreSetup from "./pages/settings/StoreSetup";
import OfflineAccess from "./pages/settings/OfflineAccess";
import CashierPin from "./pages/settings/CashierPin";
import Gas from "./pages/gas/Gas";
import PublicLayout from "./layouts/PublicLayout";
import Home from "./pages/public/Home";
import About from "./pages/public/About";
import Services from "./pages/public/Services";
import Contact from "./pages/public/Contact";

// Electron exposes electronAPI through the preload script.
const Router = window.electronAPI ? HashRouter : BrowserRouter;

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/services" element={<Services />} />
            <Route path="/contact" element={<Contact />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<PasswordReset />} />
          <Route path="/reset-password" element={<PasswordReset />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={["ADMINISTRATOR", "STORE_MANAGER", "CASHIER"]}
                  />
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
              </Route>
              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={["ADMINISTRATOR", "STORE_MANAGER", "CASHIER"]}
                  />
                }
              >
                <Route path="/pos" element={<POS />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/returns" element={<Returns />} />
                <Route path="/shifts" element={<Shifts />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/products" element={<Products />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/purchasing" element={<Purchasing />} />
                <Route path="/gas" element={<Gas />} />
                <Route path="/barcodes" element={<Barcodes />} />
                <Route
                  element={
                    <ProtectedRoute allowedRoles={["ADMINISTRATOR"]} />
                  }
                >
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/configuration" element={<Settings />} />
                </Route>
                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={["ADMINISTRATOR", "STORE_MANAGER"]}
                    />
                  }
                >
                  <Route path="/store-setup" element={<StoreSetup />} />
                </Route>
                <Route
                  element={<ProtectedRoute allowedRoles={["CASHIER"]} />}
                >
                  <Route path="/cashier-pin" element={<CashierPin />} />
                </Route>
                <Route
                  element={
                    <ProtectedRoute allowedRoles={["ADMINISTRATOR"]} />
                  }
                >
                  <Route path="/offline-access" element={<OfflineAccess />} />
                </Route>
              </Route>
              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={[
                      "ADMINISTRATOR",
                      "STORE_MANAGER",
                      "ACCOUNTANT",
                      "AUDITOR",
                    ]}
                  />
                }
              >
                <Route path="/reports" element={<Reports />} />
              </Route>
            </Route>
          </Route>

          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
