import { useState } from "react";
import { Menu } from "lucide-react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import CashierPinLock from "../components/CashierPinLock";
import { useAuth } from "../context/AuthContext";
import webLogo from "../../assets/branding/Electronics POS Web logo.png";

export default function DashboardLayout() {
  const { isLocked } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLocked) return <CashierPinLock />;

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-100">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700"
          >
            <Menu size={21} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <img
              src={webLogo}
              alt="Electronics POS"
              className="h-10 w-40 rounded bg-white object-contain"
            />
          </div>
        </header>

        <div className="min-w-0 px-3 py-4 sm:px-5 md:px-6 md:py-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}