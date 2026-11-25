import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Download, RefreshCw, Smartphone, Monitor } from "lucide-react";
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

export default function AppUpdates() {
  const [installedVersion, setInstalledVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [status, setStatus] = useState("Select Check for Updates to check now.");
  const [progress, setProgress] = useState(null);
  const [updating, setUpdating] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setStatus("Checking for updates...");
    setProgress(null);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/configuration/updates/`);
      if (isAndroidNative()) {
        const installed = await getAndroidAppVersion();
        const latest = data.android;
        const available =
          Number(latest.latest_version_code) > Number(installed.versionCode) ||
          compareVersions(latest.latest_version, installed.version) > 0;
        setInstalledVersion(installed.version);
        setUpdateInfo({ ...latest, available });
        setStatus(
          available
            ? `Version ${latest.latest_version} is ready to install.`
            : "Your Android app is up to date."
        );
        return;
      }

      if (window.electronAPI) {
        setInstalledVersion(window.electronAPI.getAppVersion());
        setUpdateInfo(data.windows);
        await window.electronAPI.checkForUpdates();
        return;
      }

      setInstalledVersion("Web");
      setUpdateInfo(data.windows);
      setStatus("The website updates automatically; refresh the page for the latest version.");
    } catch (error) {
      setStatus(
        error.response?.data?.detail || error.message || "Could not check for updates."
      );
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return undefined;
    return window.electronAPI.onUpdateStatus((updateStatus) => {
      if (updateStatus.state === "checking") setStatus("Checking for desktop updates...");
      if (updateStatus.state === "available") {
        setStatus(`Desktop version ${updateStatus.version} is available.`);
        setUpdateInfo((previous) => ({ ...previous, available: true }));
      }
      if (updateStatus.state === "current") {
        setStatus("Your desktop app is up to date.");
        setUpdateInfo((previous) => ({ ...previous, available: false }));
      }
      if (updateStatus.state === "downloading") {
        setProgress(updateStatus.percent);
        setStatus(`Downloading update: ${updateStatus.percent}%`);
      }
      if (updateStatus.state === "downloaded") {
        setProgress(100);
        setUpdateInfo((previous) => ({ ...previous, downloaded: true }));
        setStatus("Update downloaded. Select Install and Restart to finish.");
      }
      if (updateStatus.state === "error") {
        setStatus(updateStatus.message || "Update check failed.");
      }
    });
  }, []);

  const updateNow = async () => {
    setUpdating(true);
    try {
      if (isAndroidNative()) {
        if (!updateInfo?.available) {
          setStatus("Your Android app is already up to date.");
          return;
        }
        await downloadAndInstallAndroidUpdate(updateInfo.download_url);
        setStatus("APK downloaded. Follow the Android installer prompt to install it.");
      } else if (window.electronAPI) {
        if (updateInfo?.downloaded) {
          await window.electronAPI.installUpdate();
        } else if (updateInfo?.available) {
          await window.electronAPI.downloadUpdate();
        } else {
          await window.electronAPI.checkForUpdates();
        }
      }
    } catch (error) {
      setStatus(error.message || "Could not start the update.");
    } finally {
      setUpdating(false);
    }
  };

  const isDesktop = Boolean(window.electronAPI);
  const isAndroid = isAndroidNative();
  const Icon = isAndroid ? Smartphone : Monitor;
  const actionLabel = isDesktop && updateInfo?.downloaded
    ? "Install and Restart"
    : isAndroid
      ? "Update Now"
      : "Download Update";

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Application Updates</h1>
        <p className="mt-1 text-slate-600">
          Check for the latest Electronics POS version and install available updates.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-blue-50 p-3 text-blue-700">
            <Icon size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900">
              {isAndroid ? "Android app" : isDesktop ? "Windows desktop app" : "Web app"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Installed version: {installedVersion || "Checking..."}
            </p>
            <p role="status" className="mt-3 text-sm font-medium text-blue-700">
              {status}
            </p>
            {progress !== null && (
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                aria-label={`Update download ${progress}% complete`}
              >
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            {updateInfo?.release_notes && (
              <p className="mt-3 text-sm text-slate-600">
                Release notes: {updateInfo.release_notes}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={checkForUpdates}
            disabled={updating}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Check for Updates
          </button>
          {(isAndroid || isDesktop) && (
            <button
              type="button"
              onClick={updateNow}
              disabled={
                updating ||
                (isAndroid && !updateInfo?.available) ||
                (isDesktop && updateInfo?.available === false)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Download size={16} />
              {updating ? "Please wait..." : actionLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
