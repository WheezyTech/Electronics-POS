import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import webLogo from "../../assets/branding/Electronics POS Web logo.png";

export default function CashierPinLock() {
  const { user, unlockWithPin, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await unlockWithPin(pin);
      if (result.success) {
        setPin("");
      } else if (result.lockedUntil > Date.now()) {
        const seconds = Math.ceil((result.lockedUntil - Date.now()) / 1000);
        setError(`Too many attempts. Try again in ${seconds} seconds.`);
      } else {
        setError("Incorrect PIN.");
      }
    } catch (unlockError) {
      setError(unlockError.message || "Unable to verify the PIN.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <section className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <img
          src={webLogo}
          alt="Electronics POS"
          className="mx-auto mb-6 w-64 max-w-full object-contain"
        />
        <h1 className="text-center text-xl font-bold text-slate-900">
          Session locked
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          {user?.username} · Enter your six-digit PIN to continue.
        </p>
        {error && (
          <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            required
            aria-label="Six-digit cashier PIN"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            className="w-full rounded-lg border p-3 text-center text-2xl tracking-[0.5em]"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Checking..." : "Unlock"}
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <button
            type="button"
            onClick={logout}
            className="ml-auto font-medium text-slate-600 hover:text-slate-900"
          >
            Forgot PIN? Sign in with password
          </button>
        </div>
      </section>
    </main>
  );
}
