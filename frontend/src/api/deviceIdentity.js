const DEVICE_SYNC_ID_KEY = "device_sync_id";

export function createDeviceSyncId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const value = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function createReceiptReference() {
  return `SALE-${createDeviceSyncId().replace(/-/g, "").toUpperCase()}`;
}

function getDevicePlatform() {
  const userAgent = navigator.userAgent;
  if (/Android/i.test(userAgent)) return "ANDROID";
  if (/Electron/i.test(userAgent)) return "DESKTOP";
  return "WEB";
}

export function getDeviceIdentity() {
  let syncId = localStorage.getItem(DEVICE_SYNC_ID_KEY);
  if (!syncId) {
    syncId = createDeviceSyncId();
    localStorage.setItem(DEVICE_SYNC_ID_KEY, syncId);
  }

  const platform = getDevicePlatform();
  return {
    device_sync_id: syncId,
    device_name: `Electronics POS ${platform.toLowerCase()}`,
    device_platform: platform,
  };
}
