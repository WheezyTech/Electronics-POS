import { useEffect } from "react";
import { Printer, X } from "lucide-react";

const money = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const dateTime = (value) => {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function ReceiptPreview({ sale, onClose, autoPrint = false }) {
  useEffect(() => {
    if (!autoPrint) return undefined;

    const printTimer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(printTimer);
  }, [autoPrint, sale.reference]);

  const printReceipt = () => window.print();

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
          </div>

          <div className="flex gap-2">
            <button
              onClick={printReceipt}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Printer size={16} />
              Print
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div
          id="thermal-receipt"
          className="mx-auto w-full max-w-[360px] px-5 py-6 font-mono text-xs text-black"
        >
          <div className="text-center">
            <h1 className="text-base font-bold">
              ELECTRONICS POS
            </h1>

            <p>SALES RECEIPT</p>

            <p className="mt-2 break-all font-bold">
              {sale.reference}
            </p>

            <p>
              {dateTime(sale.completed_at || sale.created_at)}
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
