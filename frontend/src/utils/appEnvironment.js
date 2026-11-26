import { Capacitor } from "@capacitor/core";

export function isInstalledApp() {
  return Boolean(window.electronAPI) || Capacitor.isNativePlatform();
}
