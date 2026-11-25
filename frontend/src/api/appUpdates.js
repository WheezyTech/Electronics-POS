import { Capacitor, registerPlugin } from "@capacitor/core";

const UpdateManager = registerPlugin("UpdateManager");

export function isAndroidNative() {
  return Capacitor.getPlatform() === "android";
}

export function getAndroidAppVersion() {
  return UpdateManager.getAppVersion();
}

export function downloadAndInstallAndroidUpdate(downloadUrl) {
  return UpdateManager.downloadAndInstall({ downloadUrl });
}
