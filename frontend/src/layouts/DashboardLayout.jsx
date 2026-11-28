import { useEffect, useState } from "react";
import { Menu, MessageCircle } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";
import CashierPinLock from "../components/CashierPinLock";
import { useAuth } from "../context/AuthContext";
import webLogo from "../../assets/branding/Electronics POS Web logo.png";

export default function DashboardLayout() {
  const { isLocked, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user || isLocked) return undefined;

    const updatePresence = () => {
      if (document.visibilityState === "visible") {
        api.post("/support/presence/").catch((error) => {
          console.error("Support presence could not be updated.", error);
        });
      }
    };

    updatePresence();
    const interval = window.setInterval(updatePresence, 60_000);
    document.addEventListener("visibilitychange", updatePresence);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updatePresence);
    };
  }, [isLocked, user]);

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
        <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Electronics POS. ICT powered by Wheezy
          Systems and Innovation.
        </footer>
      </main>
      <Link
        to="/support"
        aria-label="Open Help and Support chat"
        title="Help & Support"
        className="fixed bottom-5 right-5 z-30 inline-flex min-h-14 items-center gap-2 rounded-full bg-blue-700 px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
      >
        <MessageCircle size={20} />
        <span>Chat for help</span>
      </Link>
    </div>
  );
}