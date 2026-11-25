
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Barcode,
  Warehouse,
  Truck,
  Users,
  BarChart3,
  RotateCcw,
  Clock,
  Settings,
  LogOut,
  ShieldCheck,
  LockKeyhole,
  Flame,
  Download,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import webLogo from "../../assets/branding/Electronics POS Web logo.png";

const navigation = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR"] },
  { name: "Point of Sale", path: "/pos", icon: ShoppingCart, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER", "ELECTRONICS_CASHIER", "SUPERVISOR"] },
  { name: "Products", path: "/products", icon: Package, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Barcodes", path: "/barcodes", icon: Barcode, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Inventory", path: "/inventory", icon: Warehouse, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Purchasing", path: "/purchasing", icon: Truck, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Gas & LPG", path: "/gas", icon: Flame, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR"] },
  { name: "Customers", path: "/customers", icon: Users, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR"] },
  { name: "Sales", path: "/sales", icon: BarChart3, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR"] },
  { name: "Returns", path: "/returns", icon: RotateCcw, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER", "ELECTRONICS_CASHIER", "SUPERVISOR"] },
  { name: "Cashier Shifts", path: "/shifts", icon: Clock, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR"] },
  { name: "Reports", path: "/reports", icon: BarChart3, roles: ["ADMINISTRATOR", "STORE_MANAGER", "ACCOUNTANT", "AUDITOR"] },
  { name: "Store Setup", path: "/store-setup", icon: Settings, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Settings", path: "/settings", icon: Settings, roles: ["ADMINISTRATOR"] },
  { name: "Cashier PIN", path: "/cashier-pin", icon: LockKeyhole, roles: ["CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR"] },
  { name: "Configuration", path: "/configuration", icon: Settings, roles: ["ADMINISTRATOR"] },
  { name: "Offline Access", path: "/offline-access", icon: ShieldCheck, roles: ["ADMINISTRATOR"] },
];

export default function Sidebar({ mobileOpen = false, onMobileClose = () => {} }) {
  const { user, logout, lockSession, pinConfigured } = useAuth();

  const visibleLinks = navigation.filter(
    (item) =>
      user?.is_superuser ||
      item.roles.includes(user?.role)
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-950/50 md:hidden"
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 shrink-0 flex-col bg-gradient-to-b from-blue-700 to-blue-900 text-white transition-transform duration-200 md:static md:z-auto md:h-screen md:w-64 md:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
      <div className="border-b border-blue-500/30 px-4 py-4">
        <img
          src={webLogo}
          alt="Electronics POS — Sell, Manage, Grow"
          className="w-full rounded-lg bg-white p-2"
        />
      </div>

      <div className="px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-100/60">
          Main Menu
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {visibleLinks.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/dashboard"}
              onClick={onMobileClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-blue-50 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={19} />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-blue-500/30 p-4">
        <NavLink
          to="/updates"
          onClick={onMobileClose}
          className={({ isActive }) =>
            `mb-3 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold ${
              isActive
                ? "bg-white/20 text-white"
                : "bg-white/10 text-blue-50 hover:bg-white/20"
            }`
          }
        >
          <Download size={18} />
          Check for Updates
        </NavLink>
        <div className="mb-3">
          <p className="text-sm font-semibold">{user?.username}</p>
          <p className="text-xs text-blue-100/75">{user?.role}</p>
        </div>

        {["CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR"].includes(user?.role) && pinConfigured && (
          <button
            type="button"
            onClick={lockSession}
            className="mb-2 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-blue-100 hover:bg-white/10"
          >
            <LockKeyhole size={18} />
            Lock session
          </button>
        )}

        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-red-100 hover:bg-white/10"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
      </aside>
    </>
  );
}
