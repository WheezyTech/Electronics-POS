import { useState } from "react";
import { getDeviceIdentity } from "../../api/deviceIdentity";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

export default function CashierPin() {
  const { user, pinConfigured, configureCashierPin } = useAuth();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (pin !== confirmPin) {
      setError("The PIN entries do not match.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/auth/login/", {
        username: user.username,
        password,
        ...getDeviceIdentity(),
      });
      await configureCashierPin(pin);
      setPassword("");
      setPin("");
      setConfirmPin("");
      setMessage("Quick PIN saved for this cashier on this device.");
    } catch (saveError) {
      setError(
        saveError.response?.data?.detail ||
          saveError.response?.data?.non_field_errors?.[0] ||
          saveError.message ||
          "Unable to save the quick PIN."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Cashier quick PIN</h1>
        <p className="mt-1 text-sm text-slate-600">
          Set a six-digit PIN to lock and quickly unlock this cashier session on
          this device.
        </p>
      </header>

      {message && (
        <div role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-white p-5">
        <p className="text-sm text-slate-600">
          {pinConfigured
            ? "A quick PIN is already configured. Confirm your password to replace it."
            : "Confirm your password before setting a PIN."}
        </p>
        <label className="block text-sm font-medium text-slate-700">
          Account password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Six-digit PIN
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="new-password"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Confirm PIN
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="new-password"
            value={confirmPin}
            onChange={(event) =>
              setConfirmPin(event.target.value.replace(/\D/g, ""))
            }
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : pinConfigured ? "Update PIN" : "Set PIN"}
        </button>
      </form>

      <p className="text-xs text-slate-500">
        This PIN is a convenience lock for this device, not a replacement for
        your password or a way to sign in on another device. Five failed tries
        pause PIN entry for one minute.
      </p>
    </div>
  );
}
