
import { useEffect, useState } from "react";
import api from "../../api/axios";

export default function Settings() {
  const [settings, setSettings] = useState({
    business_name: "",
    business_phone: "",
    business_email: "",
    business_address: "",
    currency: "KES",
    tax_rate: 16,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get("/configuration/settings/");
      setSettings((prev) => ({ ...prev, ...response.data }));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to load business settings."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);
    setMessage("");
    setError("");

    try {
      await api.patch("/configuration/settings/", settings);
      setMessage("Settings saved successfully.");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Failed to save settings."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-gray-500">
          Manage your electronics shop business information.
        </p>
      </div>

      {message && (
        <div className="rounded-lg bg-green-100 p-3 text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-100 p-3 text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="max-w-3xl space-y-5 rounded-xl bg-white p-6 shadow"
      >
        <h2 className="text-lg font-semibold">
          Business Information
        </h2>

        {[
          ["business_name", "Business Name"],
          ["business_phone", "Business Phone"],
          ["business_email", "Business Email"],
          ["business_address", "Business Address"],
        ].map(([name, label]) => (
          <div key={name}>
            <label className="mb-1 block text-sm font-medium">
              {label}
            </label>

            <input
              type="text"
              name={name}
              value={settings[name]}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-blue-500"
            />
          </div>
        ))}

        <div>
          <label className="mb-1 block text-sm font-medium">
            Currency
          </label>

          <select
            name="currency"
            value={settings.currency}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 p-3"
          >
            <option value="KES">KES - Kenyan Shilling</option>
            <option value="USD">USD - US Dollar</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            VAT Rate (%)
          </label>

          <input
            type="number"
            name="tax_rate"
            min="0"
            max="100"
            step="0.01"
            value={settings.tax_rate}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 p-3"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
