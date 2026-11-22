import { useState } from "react";
import api from "../../api/axios";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true); setStatus(""); setError("");
    try {
      const response = await api.post("/configuration/contact/", form);
      setStatus(response.data.detail);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-widest text-blue-700">Contact</p>
      <h1 className="mt-3 text-4xl font-bold">Talk to our team</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-5">
        <aside className="rounded-xl bg-blue-800 p-6 text-blue-50 md:col-span-2">
          <h2 className="font-bold text-white">Support requests</h2>
          <p className="mt-3 text-sm leading-6">Use this form for installation, training, account or system support.</p>
        </aside>
        <form onSubmit={submit} className="grid gap-4 md:col-span-3">
          {status && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{status}</div>}
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <Field label="Name" value={form.name} onChange={(value) => setForm({...form, name: value})} required/>
          <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({...form, email: value})} required/>
          <Field label="Phone" value={form.phone} onChange={(value) => setForm({...form, phone: value})}/>
          <Field label="Subject" value={form.subject} onChange={(value) => setForm({...form, subject: value})} required/>
          <label className="text-sm font-medium">Message<textarea required maxLength={5000} value={form.message} onChange={(event) => setForm({...form, message: event.target.value})} className="mt-1 min-h-32 w-full rounded-lg border p-3"/></label>
          <button disabled={sending} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{sending ? "Sending..." : "Send message"}</button>
        </form>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", required = false }) {
  return <label className="text-sm font-medium">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border p-3"/></label>;
}
