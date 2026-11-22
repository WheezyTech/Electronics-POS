import { ShoppingCart, Package, Flame, WalletCards, Users, BarChart3 } from "lucide-react";

export default function Services() {
  const services = [
    ["Point of sale", "Fast product checkout, receipts, discounts and M-Pesa payments.", ShoppingCart],
    ["Inventory", "Stock balances, stocktakes, transfers, purchases and movement history.", Package],
    ["Gas and LPG", "Refills, full-for-empty exchanges, cylinder sales, deposits and stock.", Flame],
    ["Payments", "Cash, M-Pesa, card, bank and split-payment records.", WalletCards],
    ["Team management", "Cashiers, managers, accountants and auditors with role restrictions.", Users],
    ["Reports", "Sales, purchases, stock, profit and reconciliation reporting.", BarChart3],
  ];
  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-widest text-blue-700">Services</p>
      <h1 className="mt-3 text-4xl font-bold">Complete shop operations</h1>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {services.map(([title, text, Icon]) => <div key={title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><Icon className="text-blue-700"/><h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>)}
      </div>
    </main>
  );
}
