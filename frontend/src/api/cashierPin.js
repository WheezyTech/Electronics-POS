import { getDeviceIdentity } from "./deviceIdentity";

const ITERATIONS = 120000;

function getPinKey(userId) {
  const deviceId = getDeviceIdentity().device_sync_id;
  return `cashier_pin:${deviceId}:${userId}`;
}

function toBase64(bytes) {
  return window.btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(window.atob(value), (character) =>
    character.charCodeAt(0)
  );
}

async function derivePinDigest(pin, salt, iterations) {
  const key = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const digest = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256
  );
  return new Uint8Array(digest);
}

export function hasCashierPin(userId) {
  return Boolean(localStorage.getItem(getPinKey(userId)));
}

export async function saveCashierPin(userId, pin) {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("PIN must contain exactly six digits.");
  }
  if (!window.crypto?.subtle) {
    throw new Error("Secure PIN storage is unavailable on this device.");
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePinDigest(pin, salt, ITERATIONS);
  localStorage.setItem(
    getPinKey(userId),
    JSON.stringify({
      salt: toBase64(salt),
      digest: toBase64(digest),
      iterations: ITERATIONS,
    })
  );
}

export async function checkCashierPin(userId, pin) {
  const storedValue = localStorage.getItem(getPinKey(userId));
  if (!storedValue || !/^\d{6}$/.test(pin) || !window.crypto?.subtle) {
    return false;
  }

  const stored = JSON.parse(storedValue);
  const expected = fromBase64(stored.digest);
  const actual = await derivePinDigest(
    pin,
    fromBase64(stored.salt),
    stored.iterations
  );
  if (expected.length !== actual.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ actual[index];
  }
  return difference === 0;
}
