import { Download, Monitor, Smartphone, ShoppingCart, Package, Flame, BarChart3, ShieldCheck } from "lucide-react";
import { NavLink } from "react-router-dom";

export default function Home() {
  return (
    <main>
      <section className="overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-blue-600 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-widest text-blue-200">Retail and gas management</p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Manage every sale, stock movement and payment in one system.</h1>
            <p className="mt-5 max-w-xl text-lg text-blue-100">Electronics POS is built for shops that sell electronics, accessories, LPG cylinders and gas accessories.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#downloads" className="flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-blue-800"><Download size={18}/>Download app</a>
              <NavLink to="/services" className="rounded-lg border border-white/40 px-5 py-3 font-semibold hover:bg-white/10">Explore services</NavLink>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[["Point of Sale", ShoppingCart], ["Inventory", Package], ["Gas & LPG", Flame], ["Reports", BarChart3]].map(([label, Icon]) => (
              <div key={label} className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur">
                <Icon size={28} className="text-blue-200"/>
                <p className="mt-3 font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold">One system for a growing shop</h2>
          <p className="mt-3 text-slate-600">Control sales, stock, customers, purchases and LPG cylinder movements without scattered records.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[["Fast checkout", "Process cash and M-Pesa sales with receipts and stock updates.", ShoppingCart], ["Complete inventory", "Track products, purchases, transfers, stocktakes and movements.", Package], ["Safety and control", "Role-based access, cylinder deposits and audited gas stock adjustments.", ShieldCheck]].map(([title, text, Icon]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><Icon className="text-blue-700"/><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>
          ))}
        </div>
      </section>

      <section id="downloads" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="text-center"><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Choose your device</p><h2 className="mt-2 text-3xl font-bold">Download Electronics POS</h2></div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <DownloadCard icon={Monitor} title="Windows desktop" text="Install for cashier counters and managers. Updates are downloaded and installed automatically." href="/downloads/electronics-pos-windows.exe" button="Download for Windows" accent="blue"/>
            <DownloadCard icon={Smartphone} title="Android" text="Use the app on compatible Android phones and tablets. Install the APK and allow an install prompt." href="/downloads/electronics-pos.apk" button="Download for Android" accent="green"/>
          </div>
        </div>
      </section>
    </main>
  );
}

function DownloadCard({ icon: Icon, title, text, href, button, accent }) {
  const colors = accent === "green" ? "bg-green-600 hover:bg-green-700" : "bg-blue-700 hover:bg-blue-800";
  return <div className="rounded-2xl border border-slate-200 p-6 shadow-sm"><Icon size={34} className={accent === "green" ? "text-green-600" : "text-blue-700"}/><h3 className="mt-4 text-xl font-bold">{title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{text}</p><a href={href} download className={`mt-5 inline-flex items-center gap-2 rounded-lg px-5 py-3 font-semibold text-white ${colors}`}><Download size={17}/>{button}</a></div>;
}
