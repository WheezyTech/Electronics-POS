
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  RefreshCw,
  Eye,
  Printer,
  ShoppingCart,
  Receipt,
  CalendarDays,
  MapPin,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Trash2,
  XCircle,
} from "lucide-react";

import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

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

const statusStyles = {
  COMPLETED: "bg-emerald-100 text-emerald-700",
  DRAFT: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-red-100 text-red-700",
};

function StatusBadge({ status }) {
  const Icon =
    status === "COMPLETED"
      ? CheckCircle2
      : status === "CANCELLED"
      ? XCircle
      : Clock3;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        statusStyles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      <Icon size={13} />
      {status || "UNKNOWN"}
    </span>
  );
}

// 80MM THERMAL RECEIPT
function ReceiptPreview({ sale, onClose }) {
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

// SALE DETAILS MODAL
function SaleDetails({ sale, onClose, onReceipt }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4">
      <div className="my-6 w-full max-w-3xl rounded-2xl bg-white shadow-2xl">

        <div className="flex items-start justify-between border-b p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sale Details
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {sale.reference}
            </h2>

            <div className="mt-2">
              <StatusBadge status={sale.status} />
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Customer</p>

            <p className="mt-1 font-semibold">
              {sale.customer_name || "Walk-in customer"}
            </p>

            <p className="text-sm text-slate-500">
              {sale.customer_phone || "No phone provided"}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">
              Sale Information
            </p>

            <p className="mt-1 text-sm">
              Cashier: <strong>{sale.cashier_name || "—"}</strong>
            </p>

            <p className="text-sm">
              Location: <strong>{sale.location_name || "—"}</strong>
            </p>

            <p className="text-sm">
              Created: {dateTime(sale.created_at)}
            </p>

            {sale.completed_at && (
              <p className="text-sm">
                Completed: {dateTime(sale.completed_at)}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 pb-5">
          <h3 className="mb-3 font-bold text-slate-900">
            Products Sold
          </h3>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Unit Price</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {(sale.items || []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {item.product_name}
                      </p>

                      <p className="text-xs text-slate-500">
                        {item.sku}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      {item.quantity}
                    </td>

                    <td className="px-4 py-3">
                      {money(item.unit_price)}
                    </td>

                    <td className="px-4 py-3 text-right font-medium">
                      {money(item.line_total)}
                    </td>
                  </tr>
                ))}

                {!sale.items?.length && (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                      No sale items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 font-bold text-slate-900">
                Payments
              </h3>

              {(sale.payments || []).map((payment) => (
                <div
                  key={payment.id}
                  className="mb-2 rounded-lg border p-3 text-sm"
                >
                  <div className="flex justify-between">
                    <strong>{payment.payment_method}</strong>
                    <strong>{money(payment.amount)}</strong>
                  </div>

                  {payment.transaction_reference && (
                    <p className="mt-1 break-all text-xs text-slate-500">
                      Ref: {payment.transaction_reference}
                    </p>
                  )}
                </div>
              ))}

              {!sale.payments?.length && (
                <p className="text-sm text-slate-500">
                  No payments recorded.
                </p>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between py-1">
                <span>Subtotal</span>
                <span>{money(sale.subtotal)}</span>
              </div>

              <div className="flex justify-between py-1">
                <span>Discount</span>
                <span>{money(sale.discount_amount)}</span>
              </div>

              <div className="flex justify-between py-1">
                <span>Tax</span>
                <span>{money(sale.tax_amount)}</span>
              </div>

              <div className="mt-2 flex justify-between border-t pt-3 text-base font-bold">
                <span>Total</span>
                <span>{money(sale.total_amount)}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {sale.status === "DRAFT" && (
              <Link
                to="/pos"
                state={{ draftSaleId: sale.id }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <ShoppingCart size={16} />
                Continue in POS
              </Link>
            )}

            {sale.status === "COMPLETED" && (
              <button
                onClick={() => onReceipt(sale)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Printer size={16} />
                Receipt / Print
              </button>
            )}

            <button
              onClick={onClose}
              className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// MAIN SALES MANAGEMENT PAGE
export default function Sales() {
  const { user } = useAuth();
  const [sales, setSales] = useState([]);
  const [locations, setLocations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deletingSaleId, setDeletingSaleId] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [page, setPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState(null);
  const [receiptSale, setReceiptSale] = useState(null);

  const canDeleteSales =
    user?.is_superuser || user?.role === "ADMINISTRATOR";

  const pageSize = 12;

  // LOAD SALES AND LOCATIONS
  const loadSales = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [salesResponse, locationsResponse] = await Promise.all([
        api.get("/sales/sales/", {
          params: { ordering: "-created_at" },
        }),
        api.get("/inventory/locations/"),
      ]);

      const salesData = salesResponse.data;

      setSales(
        Array.isArray(salesData)
          ? salesData
          : salesData.results || []
      );

      const locationData = locationsResponse.data;

      setLocations(
        Array.isArray(locationData)
          ? locationData
          : locationData.results || []
      );
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        "Unable to load sales. Check your connection and API permissions."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  // FILTER SALES
  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();

    return sales.filter((sale) => {
      const matchesSearch =
        !term ||
        [
          sale.reference,
          sale.customer_name,
          sale.customer_phone,
          sale.cashier_name,
          sale.location_name,
        ].some((value) =>
          String(value || "").toLowerCase().includes(term)
        );

      const matchesStatus =
        !statusFilter || sale.status === statusFilter;

      const matchesLocation =
        !locationFilter ||
        String(sale.location) === locationFilter;

      const saleDate = sale.created_at
        ? new Date(sale.created_at)
        : null;

      const matchesFrom =
        !dateFrom ||
        (saleDate && saleDate >= new Date(`${dateFrom}T00:00:00`));

      const matchesTo =
        !dateTo ||
        (saleDate && saleDate <= new Date(`${dateTo}T23:59:59`));

      return (
        matchesSearch &&
        matchesStatus &&
        matchesLocation &&
        matchesFrom &&
        matchesTo
      );
    });
  }, [
    sales,
    search,
    statusFilter,
    locationFilter,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, locationFilter, dateFrom, dateTo]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredSales.length / pageSize)
  );

  const pageSales = filteredSales.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const completedSales = filteredSales.filter(
    (sale) => sale.status === "COMPLETED"
  );

  const completedValue = completedSales.reduce(
    (sum, sale) => sum + Number(sale.total_amount || 0),
    0
  );

  const draftCount = filteredSales.filter(
    (sale) => sale.status === "DRAFT"
  ).length;

  // VIEW SALE DETAILS
  const openSale = async (sale) => {
    try {
      const response = await api.get(
        `/sales/sales/${sale.id}/`
      );

      setSelectedSale(response.data);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Could not load sale details."
      );
    }
  };

  const deleteSale = async (sale) => {
    const confirmed = window.confirm(
      `Delete ${sale.reference}? Only draft or cancelled sales without linked payment, M-Pesa, or return records can be deleted.`
    );
    if (!confirmed) return;

    setDeletingSaleId(sale.id);
    setError("");
    setSuccessMessage("");

    try {
      await api.delete(`/sales/sales/${sale.id}/`);
      setSales((currentSales) =>
        currentSales.filter((currentSale) => currentSale.id !== sale.id)
      );
      setPage(1);
      setSelectedSale(null);
      setSuccessMessage(`${sale.reference} was deleted.`);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        "Unable to delete this sale."
      );
    } finally {
      setDeletingSaleId(null);
    }
  };

  // LOAD COMPLETED SALE RECEIPT
  const openReceipt = async (sale) => {
    try {
      const response = await api.get(
        `/sales/sales/${sale.id}/receipt/`
      );

      setReceiptSale(response.data);
      setSelectedSale(null);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        "Receipt is available only for completed sales."
      );
    }
  };

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-blue-600">
            Sales & Transactions
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Sales Management
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Review transactions, inspect sale details and reprint customer receipts.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => loadSales(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>

          <Link
            to="/pos"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <ShoppingCart size={16} />
            Open POS
          </Link>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />

          <span className="flex-1">{error}</span>

          <button
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid gap-4 sm:grid-cols-3">

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Transactions Shown
            </p>

            <Receipt className="text-blue-600" size={20} />
          </div>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {filteredSales.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Completed Sales Value
            </p>

            <CheckCircle2 className="text-emerald-600" size={20} />
          </div>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {money(completedValue)}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {completedSales.length} completed transactions
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Draft Sales
            </p>

            <Clock3 className="text-amber-600" size={20} />
          </div>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {draftCount}
          </p>
        </div>

      </div>

      {/* FILTERS */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">

          <div className="relative xl:col-span-2">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt, customer, phone or cashier..."
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="DRAFT">Draft</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
          >
            <option value="">All Locations</option>

            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setLocationFilter("");
              setDateFrom("");
              setDateTo("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Clear Filters
          </button>

        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarDays size={15} />
            From

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarDays size={15} />
            To

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700"
            />
          </label>

        </div>
      </div>

      {/* SALES TABLE */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-900">
              Transaction History
            </h2>

            <p className="text-xs text-slate-500">
              Showing {pageSales.length} of {filteredSales.length} matching sales
            </p>
          </div>

          <span className="hidden text-xs text-slate-500 sm:block">
            Sales Records
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Loading sales records...
          </div>
        ) : pageSales.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt
              size={34}
              className="mx-auto text-slate-300"
            />

            <p className="mt-3 font-semibold text-slate-700">
              No Sales Found
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Try changing your filters or complete a sale in the POS.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full min-w-[850px] text-left text-sm">

              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Receipt / Date</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Cashier / Location</th>
                  <th className="px-5 py-3">Payment</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">

                {pageSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {sale.reference}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {dateTime(sale.created_at)}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">
                        {sale.customer_name || "Walk-in customer"}
                      </p>

                      <p className="text-xs text-slate-500">
                        {sale.customer_phone || "—"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">
                        {sale.cashier_name || "—"}
                      </p>

                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin size={12} />
                        {sale.location_name || "—"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(sale.payments || []).map((payment) => (
                          <span
                            key={payment.id}
                            className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600"
                          >
                            {payment.payment_method}
                          </span>
                        ))}

                        {!sale.payments?.length && (
                          <span className="text-xs text-slate-400">
                            —
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right font-bold text-slate-900">
                      {money(sale.total_amount)}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={sale.status} />
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        {sale.status === "DRAFT" && (
                          <Link
                            to="/pos"
                            state={{ draftSaleId: sale.id }}
                            title="Continue draft in POS"
                            aria-label="Continue draft in POS"
                            className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                          >
                            <ShoppingCart size={17} />
                          </Link>
                        )}

                        <button
                          onClick={() => openSale(sale)}
                          title="View Sale"
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Eye size={17} />
                        </button>

                        {sale.status === "COMPLETED" && (
                          <button
                            onClick={() => openReceipt(sale)}
                            title="Print Receipt"
                            className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Printer size={17} />
                          </button>
                        )}

                        {canDeleteSales &&
                          ["DRAFT", "CANCELLED"].includes(sale.status) && (
                            <button
                              onClick={() => deleteSale(sale)}
                              disabled={deletingSaleId === sale.id}
                              title="Delete draft or cancelled sale"
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                            >
                              <Trash2 size={17} />
                            </button>
                          )}

                      </div>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </p>

          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              <ChevronLeft size={15} />
              Previous
            </button>

            <button
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

      </div>

      {/* MODALS */}
      {selectedSale && (
        <SaleDetails
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onReceipt={openReceipt}
        />
      )}

      {receiptSale && (
        <ReceiptPreview
          sale={receiptSale}
          onClose={() => setReceiptSale(null)}
        />
      )}

    </div>
  );
}
