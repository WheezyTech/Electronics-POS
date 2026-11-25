
import { useEffect, useState } from "react";
import axios from "axios";
import api from "../../api/axios";
import {
  downloadAndInstallAndroidUpdate,
  getAndroidAppVersion,
  isAndroidNative,
} from "../../api/appUpdates";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://api.electronicspos.shop/api";

const compareVersions = (left, right) => {
  const leftParts = String(left).split(".").map(Number);
  const rightParts = String(right).split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

export default function Settings() {
  const [settings, setSettings] = useState({
    business_name: "",
    business_phone: "",
    business_email: "",
    business_address: "",
    currency: "KES",
    kra_pin: "",
    tax_enabled: false,
    tax_rate: 16,
    prices_include_tax: false,
    receipt_header: "",
    receipt_footer: "Thank you for shopping with us!",
    receipt_show_kra_pin: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updateStatus, setUpdateStatus] = useState("Checking...");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [installedVersion, setInstalledVersion] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    fetchSettings();
    checkForUpdates();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return undefined;
    return window.electronAPI.onUpdateStatus((status) => {
      if (status.state === "checking") setUpdateStatus("Checking for updates...");
      if (status.state === "available") {
        setUpdateStatus(`Update ${status.version} is available`);
        setUpdateInfo((previous) => ({ ...previous, available: true, version: status.version }));
      }
      if (status.state === "current") setUpdateStatus("You are using the latest version.");
      if (status.state === "downloading") setUpdateStatus(`Downloading update: ${status.percent}%`);
      if (status.state === "downloaded") {
        setUpdateStatus("Update downloaded. Ready to install.");
        setUpdateInfo((previous) => ({ ...previous, downloaded: true }));
      }
      if (status.state === "error") setUpdateStatus(status.message || "Update check failed.");
    });
  }, []);

  async function checkForUpdates() {
    try {
      const response = await axios.get(`${API_BASE_URL}/configuration/updates/`);
      const updates = response.data;
      if (isAndroidNative()) {
        const versionInfo = await getAndroidAppVersion();
        setInstalledVersion(versionInfo.version);
        const androidUpdate = updates.android;
        const available = (
          Number(androidUpdate.latest_version_code) >
          Number(versionInfo.versionCode)
        ) || compareVersions(androidUpdate.latest_version, versionInfo.version) > 0;
        setUpdateInfo({ ...androidUpdate, available });
        setUpdateStatus(
          available
            ? `Android update ${androidUpdate.latest_version} is available`
            : "You are using the latest Android version."
        );
      } else if (window.electronAPI) {
        setInstalledVersion(window.electronAPI.getAppVersion());
        setUpdateInfo({ ...updates.windows, available: null });
        setUpdateStatus("Click Check for Updates.");
        await window.electronAPI.checkForUpdates();
      } else {
        setInstalledVersion("Web");
        setUpdateInfo(updates.windows);
        setUpdateStatus("The website updates automatically.");
      }
    } catch (err) {
      setUpdateStatus(
        err.response?.data?.detail || "Unable to check for updates."
      );
    }
  }

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateMessage("");
    try {
      if (isAndroidNative()) {
        if (!updateInfo?.available) {
          setUpdateMessage("The Android app is already up to date.");
          return;
        }
        await downloadAndInstallAndroidUpdate(updateInfo.download_url);
        setUpdateMessage("The Android installer has opened.");
      } else if (window.electronAPI) {
        if (updateInfo?.downloaded) {
          await window.electronAPI.installUpdate();
        } else {
          await window.electronAPI.downloadUpdate();
        }
      }
    } catch (err) {
      setUpdateMessage(
        err.message || "The update could not be started."
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleDesktopDownload = async () => {
    setUpdating(true);
    setUpdateMessage("");
    try {
      await window.electronAPI.downloadUpdate();
    } catch (err) {
      setUpdateMessage(err.message || "Unable to download the update.");
    } finally {
      setUpdating(false);
    }
  };

  async function fetchSettings() {
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
  }

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
    return <div>Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
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

      <section className="max-w-3xl rounded-xl border border-blue-100 bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Application Updates</h2>
            <p className="mt-1 text-sm text-gray-500">
              Installed version: {installedVersion || "Checking..."}
            </p>
            <p className="mt-2 text-sm font-medium text-blue-700">
              {updateStatus}
            </p>
            {updateInfo?.release_notes && (
              <p className="mt-2 text-sm text-gray-600">
                {updateInfo.release_notes}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={updating}
              className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50"
            >
              Check for Updates
            </button>
            {(isAndroidNative() || window.electronAPI) && (
              <button
                type="button"
                onClick={handleUpdate}
                disabled={updating}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {updating ? "Updating..." : "Update Now"}
              </button>
            )}
          </div>
        </div>
        {window.electronAPI && updateStatus.startsWith("Update ") && (
          <button
            type="button"
            onClick={handleDesktopDownload}
            disabled={updating}
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Download Update
          </button>
        )}
        {updateMessage && (
          <p className="mt-3 text-sm text-gray-700">{updateMessage}</p>
        )}
      </section>

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

        <label className="flex items-center gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="tax_enabled"
            checked={Boolean(settings.tax_enabled)}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                tax_enabled: event.target.checked,
              }))
            }
          />
          <span>
            <span className="block text-sm font-medium">Enable tax on sales</span>
            <span className="text-xs text-gray-500">
              Calculate and print tax on electronics and Gas & LPG transactions.
            </span>
          </span>
        </label>

        <label className="flex items-center gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="prices_include_tax"
            checked={Boolean(settings.prices_include_tax)}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                prices_include_tax: event.target.checked,
              }))
            }
          />
          <span className="text-sm font-medium">Registered prices include tax</span>
        </label>

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
