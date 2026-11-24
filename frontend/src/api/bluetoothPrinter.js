import { Capacitor, registerPlugin } from "@capacitor/core";

const BluetoothPrinter = registerPlugin("BluetoothPrinter");

export function isAndroidNative() {
  return Capacitor.getPlatform() === "android";
}

export function getPairedBluetoothPrinters() {
  return BluetoothPrinter.getPairedDevices();
}

export function printBluetoothReceipt(address, text, logoBase64, qrBase64) {
  return BluetoothPrinter.printReceipt({ address, text, logoBase64, qrBase64 });
}
