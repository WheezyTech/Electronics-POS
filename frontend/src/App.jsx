
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

// Electron exposes electronAPI through the preload script.
const Router = window.electronAPI ? HashRouter : BrowserRouter;

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/returns" element={<Returns />} />
              <Route path="/shifts" element={<Shifts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/products" element={<Products />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/purchasing" element={<Purchasing />} />
              <Route path="/barcodes" element={<Barcodes />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/configuration" element={<Settings />} />
              <Route
                element={
                  <ProtectedRoute
                    allowedRoles={["ADMINISTRATOR", "STORE_MANAGER"]}
                  />
                }
              >
                <Route path="/store-setup" element={<StoreSetup />} />
              </Route>
            </Route>
          </Route>

          <Route
            path="/"
            element={<Navigate to="/dashboard" replace />}
          />

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
