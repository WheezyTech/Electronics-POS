import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Download, Menu, X } from "lucide-react";
import { useState } from "react";
import webLogo from "../../assets/branding/Electronics POS Web logo.png";
import { isInstalledApp } from "../utils/appEnvironment";

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  if (isInstalledApp() && pathname === "/") return <Outlet />;

  const links = [
    ["/", "Home"],
    ["/about", "About"],
    ["/services", "Services"],
    ["/contact", "Contact"],
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center" onClick={() => setOpen(false)}>
            <img src={webLogo} alt="Electronics POS" className="h-12 w-52 object-contain" />
          </NavLink>
          <nav className="hidden items-center gap-6 md:flex">
            {links.map(([path, label]) => (
              <NavLink key={path} to={path} className={({ isActive }) => `text-sm font-semibold ${isActive ? "text-blue-700" : "text-slate-600 hover:text-blue-700"}`}>
                {label}
              </NavLink>
            ))}
            <NavLink to="/login" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Sign in
            </NavLink>
            <a href="#downloads" className="flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              <Download size={16} /> Download
            </a>
          </nav>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-lg border md:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {open && (
          <nav className="grid gap-1 border-t px-4 py-3 md:hidden">
            {links.map(([path, label]) => (
              <NavLink key={path} to={path} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold hover:bg-slate-100">
                {label}
              </NavLink>
            ))}
            <NavLink to="/login" onClick={() => setOpen(false)} className="mt-2 rounded-lg bg-blue-700 px-3 py-3 text-center text-sm font-semibold text-white">
              Sign in
            </NavLink>
          </nav>
        )}
      </header>
      <Outlet />
      <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-3">
          <div>
            <p className="font-bold text-white">Electronics POS</p>
            <p className="mt-2 text-sm leading-6">Sales, inventory, purchasing, gas/LPG operations and business reporting.</p>
          </div>
          <div className="grid gap-2 text-sm">
            <NavLink to="/about">About</NavLink>
            <NavLink to="/services">Services</NavLink>
            <NavLink to="/contact">Contact</NavLink>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">Download the app</p>
            <a className="mt-2 block text-blue-300" href="/downloads/electronics-pos-windows.exe">Windows desktop</a>
            <a className="mt-1 block text-green-300" href="/downloads/electronics-pos.apk">Android app</a>
          </div>
        </div>
        <div className="border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Electronics POS. ICT powered by Wheezy
          Systems and Innovation.
        </div>
      </footer>
    </div>
  );
}
