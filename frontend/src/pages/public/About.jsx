export default function About() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-widest text-blue-700">About Electronics POS</p>
      <h1 className="mt-3 text-4xl font-bold">Built for real shop operations</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">Electronics POS brings sales, stock, team access, purchasing and M-Pesa payment records into one practical business system. It supports growing shops that sell electronics and also handle LPG cylinder exchanges and gas accessories.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {[["Reliable records", "Keep transactions, payments and stock movements connected."], ["Role-based control", "Give each cashier, manager, accountant or auditor appropriate access."], ["Business visibility", "View reports that support daily decisions and reconciliations."]].map(([title,text]) => <div key={title} className="rounded-xl border bg-white p-6"><h2 className="font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>)}
      </div>
    </main>
  );
}
