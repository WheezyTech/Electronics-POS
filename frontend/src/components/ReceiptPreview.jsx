import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Printer, RefreshCw, X } from "lucide-react";
import QRCode from "qrcode";
import {
  getPairedBluetoothPrinters,
  isAndroidNative,
  printBluetoothReceipt,
  printNetworkReceipt,
} from "../api/bluetoothPrinter";
import receiptLogo from "../../assets/branding/Electronics POS Receipt logo.png";

const money = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const dateTime = (value) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
};

async function getReceiptLogoBase64() {
  const response = await fetch(receiptLogo);
  if (!response.ok) {
    throw new Error("Unable to load the receipt logo for printing.");
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Unable to read the receipt logo."));
    reader.readAsDataURL(blob);
  });
}

function thermalReceiptText(sale) {
  const status =
    sale.sync_status === "PENDING"
      ? "SAVED OFFLINE - SYNC PENDING"
      : "CLOUD BACKUP COMPLETE";
  const lines = [
    "SALES RECEIPT",
    `Receipt: ${sale.reference}`,
    `Status: ${status}`,
    dateTime(
      sale.client_completed_at || sale.completed_at || sale.created_at
    ),
    `Cashier: ${sale.cashier_name || "—"}`,
    `Location: ${sale.location_name || "—"}`,
    `Customer: ${sale.customer_name || "Walk-in customer"}`,
  ];

  if (sale.customer_phone) lines.push(`Phone: ${sale.customer_phone}`);
  lines.push("--------------------------------");

  (sale.items || []).forEach((item) => {
    lines.push(String(item.product_name || "").slice(0, 32));
    lines.push(
      `${item.quantity} x ${money(item.unit_price)}  ${money(item.line_total)}`
    );
    if (item.sku) lines.push(`SKU: ${item.sku}`);
  });

  lines.push(
    "--------------------------------",
    `Subtotal: ${money(sale.subtotal)}`,
    `Discount: ${money(sale.discount_amount)}`,
    `Tax: ${money(sale.tax_amount)}`,
    `TOTAL: ${money(sale.total_amount)}`,
    "PAYMENT(S)"
  );
  (sale.payments || []).forEach((payment) => {
    lines.push(`${payment.payment_method}: ${money(payment.amount)}`);
  });
  lines.push("", "THANK YOU FOR SHOPPING WITH US", "");

  return lines
    .map((line) => line.replace(/\u00a0/g, " "))
    .join("\n");
}

export default function ReceiptPreview({ sale, onClose, autoPrint = false }) {
  const syncPending = sale.sync_status === "PENDING";
  const [pairedPrinters, setPairedPrinters] = useState([]);
  const [printerTransport, setPrinterTransport] = useState(
    () => localStorage.getItem("receipt_printer_transport") || "network"
  );
  const [networkPrinterHost, setNetworkPrinterHost] = useState(
    () => localStorage.getItem("receipt_printer_host") || "192.168.1.36"
  );
  const [networkPrinterPort, setNetworkPrinterPort] = useState(
    () => Number(localStorage.getItem("receipt_printer_port")) || 9100
  );
  const [selectedPrinter, setSelectedPrinter] = useState(
    () => localStorage.getItem("receipt_printer_address") || ""
  );
  const [showPrinterPicker, setShowPrinterPicker] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(
      JSON.stringify({
        receipt: sale.reference,
        total: sale.total_amount,
        time: sale.client_completed_at || sale.completed_at || sale.created_at,
      }),
      { width: 180, margin: 1 }
    )
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [sale.reference, sale.total_amount, sale.created_at, sale.completed_at, sale.client_completed_at]);

  const printReceipt = useCallback(async () => {
    setPrintError("");
    if (window.electronAPI?.printNetworkReceipt) {
      setPrinting(true);
      try {
        await window.electronAPI.printNetworkReceipt(
          networkPrinterHost,
          networkPrinterPort,
          thermalReceiptText(sale)
        );
        localStorage.setItem("receipt_printer_host", networkPrinterHost);
        localStorage.setItem("receipt_printer_port", String(networkPrinterPort));
        localStorage.setItem("receipt_printer_transport", "network");
      } catch (error) {
        setPrintError(
          error.message || "Unable to connect to the network printer."
        );
        setShowPrinterPicker(true);
      } finally {
        setPrinting(false);
      }
      return;
    }

    if (!isAndroidNative()) {
      window.print();
      return;
    }

    try {
      if (printerTransport === "network") {
        setPrinting(true);
        await printNetworkReceipt(
          networkPrinterHost,
          networkPrinterPort,
          thermalReceiptText(sale),
          await getReceiptLogoBase64(),
          qrDataUrl ? qrDataUrl.split(",")[1] : ""
        );
        localStorage.setItem("receipt_printer_host", networkPrinterHost);
        localStorage.setItem("receipt_printer_port", String(networkPrinterPort));
        localStorage.setItem("receipt_printer_transport", "network");
        return;
      }

      const { devices } = await getPairedBluetoothPrinters();
      setPairedPrinters(devices || []);
      const rememberedPrinter = (devices || []).find(
        (printer) => printer.address === selectedPrinter
      );
      if (!rememberedPrinter) {
        setSelectedPrinter("");
        setShowPrinterPicker(true);
        return;
      }

      setPrinting(true);
      await printBluetoothReceipt(
        rememberedPrinter.address,
        thermalReceiptText(sale),
        await getReceiptLogoBase64(),
        qrDataUrl ? qrDataUrl.split(",")[1] : ""
      );
    } catch (error) {
      setPrintError(
        error.message || "Unable to connect to the Bluetooth printer."
      );
      if (printerTransport === "network") {
        setShowPrinterPicker(true);
      }
    } finally {
      setPrinting(false);
    }
  }, [sale, selectedPrinter, printerTransport, networkPrinterHost, networkPrinterPort, qrDataUrl]);

  const printToSelectedPrinter = async () => {
    if (printerTransport === "network" && !networkPrinterHost.trim()) {
      setPrintError("Enter the printer IP address.");
      return;
    }
    if (printerTransport === "bluetooth" && !selectedPrinter) {
      setPrintError("Select a paired Bluetooth printer first.");
      return;
    }

    setPrinting(true);
    setPrintError("");
    try {
      if (window.electronAPI?.printNetworkReceipt) {
        await window.electronAPI.printNetworkReceipt(
          networkPrinterHost,
          networkPrinterPort,
          thermalReceiptText(sale)
        );
        localStorage.setItem("receipt_printer_transport", "network");
        localStorage.setItem("receipt_printer_host", networkPrinterHost);
        localStorage.setItem("receipt_printer_port", String(networkPrinterPort));
        setShowPrinterPicker(false);
        return;
      }

      if (printerTransport === "network") {
        await printNetworkReceipt(
          networkPrinterHost,
          networkPrinterPort,
          thermalReceiptText(sale),
          await getReceiptLogoBase64(),
          qrDataUrl ? qrDataUrl.split(",")[1] : ""
        );
        localStorage.setItem("receipt_printer_transport", "network");
        localStorage.setItem("receipt_printer_host", networkPrinterHost);
        localStorage.setItem("receipt_printer_port", String(networkPrinterPort));
        setShowPrinterPicker(false);
        return;
      }

      await printBluetoothReceipt(
        selectedPrinter,
        thermalReceiptText(sale),
        await getReceiptLogoBase64(),
        qrDataUrl ? qrDataUrl.split(",")[1] : ""
      );
      localStorage.setItem("receipt_printer_address", selectedPrinter);
      localStorage.setItem("receipt_printer_transport", "bluetooth");
      setShowPrinterPicker(false);
    } catch (error) {
      setPrintError(
        error.message || "Unable to connect to the Bluetooth printer."
      );
    } finally {
      setPrinting(false);
    }
  };

  const printReceiptRef = useRef(printReceipt);
  useEffect(() => {
    printReceiptRef.current = printReceipt;
  }, [printReceipt]);

  useEffect(() => {
    if (!autoPrint) return undefined;

    const printTimer = window.setTimeout(() => {
      printReceiptRef.current();
    }, 250);
    return () => window.clearTimeout(printTimer);
  }, [autoPrint, sale.reference]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4">
      <div className="my-6 w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4 print:hidden">
          <div>
            <h2 className="font-bold text-slate-900">
              Sales Receipt
            </h2>
            <p className="text-sm text-slate-500">
              {sale.reference}
            </p>
            <span
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                syncPending
                  ? "bg-amber-50 text-amber-800"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {syncPending ? <RefreshCw size={13} /> : <CheckCircle2 size={13} />}
              {syncPending
                ? "Saved offline · sync pending"
                : "Cloud backup complete"}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={printReceipt}
              disabled={printing}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Printer size={16} />
              {printing ? "Printing..." : "Print"}
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {(isAndroidNative() || window.electronAPI) && showPrinterPicker && (
          <div className="space-y-3 border-b bg-slate-50 px-5 py-4 print:hidden">
            <p className="text-sm font-semibold text-slate-800">
              Configure an ESC/POS printer.
            </p>
            {!window.electronAPI && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPrinterTransport("network")}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    printerTransport === "network"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  Wi-Fi / Network
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setPrinterTransport("bluetooth");
                    try {
                      const { devices } = await getPairedBluetoothPrinters();
                      setPairedPrinters(devices || []);
                    } catch (error) {
                      setPrintError(error.message || "Unable to list Bluetooth printers.");
                    }
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    printerTransport === "bluetooth"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  Bluetooth
                </button>
              </div>
            )}
            {window.electronAPI || printerTransport === "network" ? (
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <input
                  value={networkPrinterHost}
                  onChange={(event) => setNetworkPrinterHost(event.target.value)}
                  placeholder="Printer IP address"
                  className="rounded-lg border border-slate-300 p-2 text-sm"
                />
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={networkPrinterPort}
                  onChange={(event) => setNetworkPrinterPort(Number(event.target.value) || 9100)}
                  placeholder="Port"
                  className="rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
            ) : (
              <>
                {!pairedPrinters.length && (
                  <p className="text-sm text-slate-600">
                    Pair and enable the printer in Android Bluetooth settings.
                  </p>
                )}
                <select
                  value={selectedPrinter}
                  onChange={(event) => setSelectedPrinter(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
                >
                  <option value="">Select paired printer</option>
                  {pairedPrinters.map((printer) => (
                    <option key={printer.address} value={printer.address}>
                      {printer.name || "Bluetooth printer"} ({printer.address})
                    </option>
                  ))}
                </select>
              </>
            )}
            {printError && (
              <p role="alert" className="text-sm text-red-700">{printError}</p>
            )}
            <button
              type="button"
              onClick={printToSelectedPrinter}
              disabled={
                printing ||
                (printerTransport === "bluetooth" && !selectedPrinter) ||
                (printerTransport === "network" && !networkPrinterHost.trim())
              }
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {printing ? "Printing..." : "Print receipt"}
            </button>
          </div>
        )}

        {printError && !showPrinterPicker && (
          <p role="alert" className="px-5 py-3 text-sm text-red-700 print:hidden">
            {printError}
          </p>
        )}

        <div
          id="thermal-receipt"
          className="mx-auto w-full max-w-[360px] px-5 py-6 font-mono text-xs text-black"
        >
          <div className="text-center">
            <img
              src={receiptLogo}
              alt="Electronics POS"
              className="mx-auto mb-3 w-full object-contain"
            />
            <p>SALES RECEIPT</p>

            <p className="mt-2 break-all font-bold">
              {sale.reference}
            </p>

            <p>
              {dateTime(
                sale.client_completed_at ||
                sale.completed_at ||
                sale.created_at
              )}
            </p>
            <p className="font-bold">
              {syncPending
                ? "SAVED OFFLINE - SYNC PENDING"
                : "CLOUD BACKUP COMPLETE"}
            </p>
          </div>

          <div className="my-3 border-t border-dashed border-black" />

          <div className="space-y-1">
            <p>Cashier: {sale.cashier_name || "—"}</p>
            <p>Location: {sale.location_name || "—"}</p>
            <p>
              Customer: {sale.customer_name || "Walk-in customer"}
            </p>

            {sale.customer_phone && (
              <p>Phone: {sale.customer_phone}</p>
            )}
          </div>

          <div className="my-3 border-t border-dashed border-black" />

          <div className="grid grid-cols-[1fr_auto] gap-x-2 font-bold">
            <span>ITEM</span>
            <span>AMOUNT</span>
          </div>

          <div className="my-2 border-t border-black" />

          {(sale.items || []).map((item) => (
            <div key={item.id} className="mb-2">
              <p className="break-words">
                {item.product_name}
              </p>

              <div className="flex justify-between gap-2">
                <span>
                  {item.quantity} x {money(item.unit_price)}
                </span>

                <span>{money(item.line_total)}</span>
              </div>

              {item.sku && (
                <p className="text-[10px]">
                  SKU: {item.sku}
                </p>
              )}
            </div>
          ))}

          <div className="my-2 border-t border-dashed border-black" />

          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{money(sale.subtotal)}</span>
            </div>

            <div className="flex justify-between">
              <span>Discount</span>
              <span>{money(sale.discount_amount)}</span>
            </div>

            <div className="flex justify-between">
              <span>Tax</span>
              <span>{money(sale.tax_amount)}</span>
            </div>

            <div className="flex justify-between border-t border-black pt-2 text-sm font-bold">
              <span>TOTAL</span>
              <span>{money(sale.total_amount)}</span>
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-black" />

          <p className="font-bold">PAYMENT(S)</p>

          {(sale.payments || []).map((payment) => (
            <div key={payment.id} className="mt-1">
              <div className="flex justify-between gap-2">
                <span>{payment.payment_method}</span>
                <span>{money(payment.amount)}</span>
              </div>

              {payment.transaction_reference && (
                <p className="break-all text-[10px]">
                  Ref: {payment.transaction_reference}
                </p>
              )}
            </div>
          ))}

          <div className="my-3 border-t border-dashed border-black" />

          <p className="text-center font-bold">
            THANK YOU FOR SHOPPING WITH US
          </p>

          <p className="mt-1 text-center">
            Goods once sold are subject to our return policy.
          </p>

          <p className="mt-3 text-center text-[10px]">
            Powered by Electronics POS
          </p>
          {qrDataUrl && (
            <div className="mt-3 flex justify-center">
              <img
                src={qrDataUrl}
                alt={`QR code for receipt ${sale.reference}`}
                className="h-28 w-28"
              />
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 3mm;
          }

          body * {
            visibility: hidden !important;
          }

          #thermal-receipt,
          #thermal-receipt * {
            visibility: visible !important;
          }

          #thermal-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 74mm !important;
            max-width: 74mm !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 10px !important;
          }
        }
      `}</style>
    </div>
  );
}
