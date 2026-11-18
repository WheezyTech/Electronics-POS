
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
  Monitor,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const navigation = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER"] },
  { name: "Point of Sale", path: "/pos", icon: ShoppingCart, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER"] },
  { name: "Products", path: "/products", icon: Package, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Barcodes", path: "/barcodes", icon: Barcode, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Inventory", path: "/inventory", icon: Warehouse, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Purchasing", path: "/purchasing", icon: Truck, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Customers", path: "/customers", icon: Users, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER"] },
  { name: "Sales", path: "/sales", icon: BarChart3, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER"] },
  { name: "Returns", path: "/returns", icon: RotateCcw, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER"] },
  { name: "Cashier Shifts", path: "/shifts", icon: Clock, roles: ["ADMINISTRATOR", "STORE_MANAGER", "CASHIER"] },
  { name: "Reports", path: "/reports", icon: BarChart3, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Store Setup", path: "/store-setup", icon: Settings, roles: ["ADMINISTRATOR", "STORE_MANAGER"] },
  { name: "Settings", path: "/settings", icon: Settings, roles: ["ADMINISTRATOR"] },
  { name: "Configuration", path: "/configuration", icon: Settings, roles: ["ADMINISTRATOR"] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  const visibleLinks = navigation.filter(
    (item) =>
      user?.is_superuser ||
      item.roles.includes(user?.role)
  );

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-gradient-to-b from-blue-700 to-blue-900 text-white">
      <div className="flex items-center gap-3 border-b border-blue-500/30 px-6 py-6">
        <div className="rounded-lg bg-blue-500 p-2 shadow-inner shadow-blue-300/30">
          <Monitor size={24} />
        </div>

        <div>
          <h1 className="font-bold">Electronics POS</h1>
          <p className="text-xs text-blue-100/80">Management System</p>
        </div>
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
        <div className="mb-3">
          <p className="text-sm font-semibold">{user?.username}</p>
          <p className="text-xs text-blue-100/75">{user?.role}</p>
        </div>

        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-red-100 hover:bg-white/10"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
