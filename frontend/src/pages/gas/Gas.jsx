import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import ReceiptPreview from "../../components/ReceiptPreview";
import {
  ArrowLeftRight,
  Boxes,
  Eye,
  Flame,
  History,
  LayoutDashboard,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";

const list = (data) => Array.isArray(data) ? data : data?.results || [];
const money = (value) => `KSh ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
const paymentOptions = [
  ["CASH", "Cash"],
  ["MPESA", "M-Pesa"],
  ["BANK", "Bank"],
  ["CARD", "Card"],
  ["OTHER", "Other"],
];
const transactionPaymentMethods = (transaction) => transaction.payments?.length
  ? transaction.payments.map((payment) => payment.payment_method)
  : transaction.payment_method
    ? [transaction.payment_method]
    : [];
const PaymentMethodBadges = ({ transaction }) => {
  const methods = transactionPaymentMethods(transaction);
  return (
    <div className="flex flex-wrap gap-1">
      {methods.length
        ? methods.map((method, index) => (
            <span
              key={`${method}-${index}`}
              className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600"
            >
              {method}
            </span>
          ))
        : <span className="text-xs text-slate-400">—</span>}
    </div>
  );
};
const getAmountDue = (subtotal, settings) => {
  const amount = Number(subtotal || 0);
  if (!settings?.tax_enabled || settings.prices_include_tax) return amount;
  const scaledTaxCents = amount * Number(settings.tax_rate || 0);
  const lowerTaxCents = Math.floor(scaledTaxCents);
  const fraction = scaledTaxCents - lowerTaxCents;
  const taxCents = Math.abs(fraction - 0.5) < 1e-8
    ? lowerTaxCents + (lowerTaxCents % 2)
    : Math.round(scaledTaxCents);
  const tax = taxCents / 100;
  return Number((amount + tax).toFixed(2));
};
const buildSplitPayments = (enabled, payments, total) => {
  if (!enabled) return { payments: undefined };
  const normalized = payments.map((payment) => ({
    payment_method: payment.payment_method,
    amount: Number(payment.amount || 0),
    transaction_reference: payment.transaction_reference.trim(),
  }));
  if (normalized.some((payment) => !payment.payment_method || !Number.isFinite(payment.amount) || payment.amount <= 0)) {
    return { error: "Enter an amount greater than zero for every payment method." };
  }
  const allocatedCents = normalized.reduce(
    (sum, payment) => sum + Math.round(payment.amount * 100),
    0
  );
  if (allocatedCents !== Math.round(total * 100)) {
    return { error: "Payment amounts must add up exactly to the total due." };
  }
  if (normalized.some(
    (payment) => payment.payment_method === "MPESA" && !payment.transaction_reference
  )) {
    return { error: "Enter the M-Pesa transaction reference for each M-Pesa payment." };
  }
  return { payments: normalized };
};
const createPaymentRow = (paymentMethod = "CASH", amount = "0.00", transactionReference = "") => ({
  id: `${Date.now()}-${Math.random()}`,
  payment_method: paymentMethod,
  amount,
  transaction_reference: transactionReference,
});
const dateTimeMillis = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
};
const buildGasReceipt = (transaction, label) => {
  const total = transaction.total_amount || transaction.refill_payment || "0.00";
  const cylinderItem = {
    id: `${transaction.reference}-${label}`,
    product_name: `${label} — ${transaction.brand_name || "Brand"} ${transaction.size_name ? `(${transaction.size_name})` : ""}`.trim(),
    quantity: transaction.quantity || 1,
    unit_price: transaction.refill_price || transaction.selling_price || transaction.refill_payment || "0.00",
    line_total: Number(transaction.selling_price || 0) * Number(transaction.quantity || 1)
      || transaction.total_amount
      || transaction.refill_payment
      || "0.00",
  };
  const accessoryItems = (transaction.accessory_items || []).map((item) => ({
    id: item.id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_total: item.line_total,
  }));

  return {
    reference: transaction.reference,
    created_at: transaction.created_at,
    location_name: transaction.location_name,
    cashier_name: transaction.recorded_by_name,
    customer_name: transaction.customer_name,
    customer_phone: transaction.customer_phone,
    subtotal: transaction.tax_included
      ? String(Number(total) - Number(transaction.tax_amount || 0))
      : total,
    discount_amount: "0.00",
    tax_amount: transaction.tax_amount || "0.00",
    total_amount: transaction.tax_included
      ? total
      : String(Number(total) + Number(transaction.tax_amount || 0)),
    sync_status: "SYNCHRONIZED",
    items: accessoryItems.length ? [cylinderItem, ...accessoryItems] : [cylinderItem],
    payments: transaction.payments?.length ? transaction.payments.map((payment) => ({
      id: payment.id,
      payment_method: payment.payment_method,
      amount: payment.amount,
      transaction_reference: payment.transaction_reference,
    })) : transaction.payment_method ? [{
      id: `${transaction.reference}-payment`,
      payment_method: transaction.payment_method,
      amount: transaction.tax_included
        ? total
        : String(Number(total) + Number(transaction.tax_amount || 0)),
      transaction_reference: transaction.transaction_reference,
    }] : [],
  };
};

export default function Gas() {
  const { user } = useAuth();
  const canManageGas = user?.is_superuser || ["ADMINISTRATOR", "STORE_MANAGER"].includes(user?.role);
  const canReceiveGas = canManageGas || ["SUPERVISOR", "GAS_LPG_CASHIER", "CASHIER"].includes(user?.role);
  const [tab, setTab] = useState("overview");
  const [brands, setBrands] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [report, setReport] = useState(null);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [refills, setRefills] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [gasSales, setGasSales] = useState([]);
  const [stockFilter, setStockFilter] = useState({ location: "", brand: "", size: "" });
  const [salesFilter, setSalesFilter] = useState({ location: "", brand: "", size: "", dateFrom: "", dateTo: "" });
  const [receiptSale, setReceiptSale] = useState(null);
  const [selectedGasSale, setSelectedGasSale] = useState(null);
  const [stockConversion, setStockConversion] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [brandName, setBrandName] = useState("");
  const [sizeName, setSizeName] = useState("");
  const [sizeKg, setSizeKg] = useState("");
  const [editingBrand, setEditingBrand] = useState(null);
  const [editingSize, setEditingSize] = useState(null);
  const [stockAdjustment, setStockAdjustment] = useState({
    location: "", brand: "", size: "", full_direction: "ADD", full_quantity: "0",
    empty_direction: "ADD", empty_quantity: "0",
    notes: "", reference: "",
  });

  const [refill, setRefill] = useState({ location: "", brand: "", customer_brand: "", size: "", quantity: "1", refill_price: "", payment_method: "", customer_name: "", customer_phone: "", transaction_reference: "" });
  const [exchange, setExchange] = useState({ location: "", brand: "", size: "", quantity: "1", refill_payment: "", payment_method: "", customer_name: "", customer_phone: "", transaction_reference: "" });
  const [sale, setSale] = useState({ location: "", brand: "", size: "", status: "FULL", quantity: "1", selling_price: "", deposit_amount: "", includes_gas: true, payment_method: "", customer_name: "", customer_phone: "", transaction_reference: "", accessories: "" });
  const [refillSplitMode, setRefillSplitMode] = useState(false);
  const [refillPayments, setRefillPayments] = useState([createPaymentRow()]);
  const [exchangeSplitMode, setExchangeSplitMode] = useState(false);
  const [exchangePayments, setExchangePayments] = useState([createPaymentRow()]);
  const [saleSplitMode, setSaleSplitMode] = useState(false);
  const [salePayments, setSalePayments] = useState([createPaymentRow()]);
  const [saleAccessories, setSaleAccessories] = useState([{ product: "", quantity: "1" }]);
  const [purchase, setPurchase] = useState({ location: "", supplier: "", brand: "", size: "", full_cylinders_received: "0", empty_cylinders_returned: "0", purchase_price: "", delivery_date: "", invoice_reference: "", compliance_reference: "" });

  const gasAccessoryProducts = products.filter((product) => {
    const searchable = [
      product.category_name,
      product.product_type_name,
      product.name,
    ].filter(Boolean).join(" ").toLowerCase();
    return product.is_active && /gas|lpg|burner|regulat|grill|cook|pipe|clip|connector/.test(searchable);
  });
  const accessoryTotal = saleAccessories.reduce((total, item) => {
    const product = products.find((candidate) => String(candidate.id) === String(item.product));
    return total + Number(product?.selling_price || 0) * Number(item.quantity || 0);
  }, 0);
  const completeSaleTotal =
    Number(sale.selling_price || 0) * Number(sale.quantity || 0) + accessoryTotal;
  const gasSalesTotal = [
    ...refills.map((item) => ({
      amount: item.total_amount,
      tax: item.tax_amount,
      included: item.tax_included,
    })),
    ...exchanges.map((item) => ({
      amount: item.refill_payment,
      tax: item.tax_amount,
      included: item.tax_included,
    })),
    ...gasSales.map((item) => ({
      amount: item.total_amount,
      tax: item.tax_amount,
      included: item.tax_included,
    })),
  ].reduce(
    (total, item) =>
      total + Number(item.amount || 0) +
      (item.included ? 0 : Number(item.tax || 0)),
    0
  );
  const gasSalesByPaymentMethod = {};
  const gasTransactions = [
    ...refills.map((item) => ({
      ...item,
      sales_amount: item.total_amount,
    })),
    ...exchanges.map((item) => ({
      ...item,
      sales_amount: item.refill_payment,
    })),
    ...gasSales.map((item) => ({
      ...item,
      sales_amount: item.total_amount,
    })),
  ];
  gasTransactions.forEach((transaction) => {
    const totalDue = Number(transaction.sales_amount || 0)
      + (transaction.tax_included
        ? 0
        : Number(transaction.tax_amount || 0));
    const recordedPayments = transaction.payments || [];
    const recordedTotal = recordedPayments.reduce(
      (total, payment) => total + Number(payment.amount || 0),
      0
    );
    const payments = recordedPayments.length
      ? [
          ...recordedPayments,
          ...(totalDue > recordedTotal
            ? [{
                payment_method: "NOT_RECORDED",
                amount: totalDue - recordedTotal,
              }]
            : []),
        ]
      : transaction.payment_method
        ? [{
            payment_method: transaction.payment_method,
            amount: totalDue,
          }]
        : [{ payment_method: "NOT_RECORDED", amount: totalDue }];

    payments.forEach((payment) => {
      gasSalesByPaymentMethod[payment.payment_method] =
        (gasSalesByPaymentMethod[payment.payment_method] || 0)
        + Number(payment.amount || 0);
    });
  });
  const refillAmountDue = getAmountDue(
    Number(refill.refill_price || 0) * Number(refill.quantity || 0),
    businessSettings
  );
  const exchangeAmountDue = getAmountDue(
    Number(exchange.refill_payment || 0),
    businessSettings
  );
  const saleAmountDue = getAmountDue(
    Number(sale.selling_price || 0) * Number(sale.quantity || 0) +
      (sale.status === "COMPLETE" ? accessoryTotal : 0),
    businessSettings
  );

  const load = async () => {
    setError("");
    try {
      const salesParams = {};
      if (salesFilter.location) salesParams.location = salesFilter.location;
      if (salesFilter.brand) salesParams.brand = salesFilter.brand;
      if (salesFilter.size) salesParams.size = salesFilter.size;
      if (salesFilter.dateFrom) salesParams.date_from = salesFilter.dateFrom;
      if (salesFilter.dateTo) salesParams.date_to = salesFilter.dateTo;
      const stockParams = {};
      if (stockFilter.location) stockParams.location = stockFilter.location;
      if (stockFilter.brand) stockParams.brand = stockFilter.brand;
      if (stockFilter.size) stockParams.size = stockFilter.size;
      const [brandsR, sizesR, locationsR, suppliersR, productsR, stockR, reportR, movementsR, refillsR, exchangesR, salesR, settingsR] = await Promise.all([
        api.get("/gas/brands/"), api.get("/gas/sizes/"), api.get("/inventory/locations/"),
        api.get("/purchases/suppliers/"), api.get("/products/products/"),
        api.get("/gas/stock/", { params: stockParams }), api.get("/gas/reports/"),
        api.get("/gas/movements/", { params: { ordering: "-created_at" } }),
        api.get("/gas/refills/", { params: salesParams }),
        api.get("/gas/exchanges/", { params: salesParams }),
        api.get("/gas/sales/", { params: salesParams }),
        api.get("/configuration/settings/"),
      ]);
      setBrands(list(brandsR.data)); setSizes(list(sizesR.data)); setLocations(list(locationsR.data));
      setSuppliers(list(suppliersR.data)); setProducts(list(productsR.data));
      setStock(list(stockR.data)); setReport(reportR.data);
      setBusinessSettings(settingsR.data);
      setMovements(list(movementsR.data));
      setRefills(list(refillsR.data)); setExchanges(list(exchangesR.data)); setGasSales(list(salesR.data));
    } catch {
      setError("Unable to load gas data.");
    }
  };

  useEffect(() => {
    Promise.resolve().then(load);
  }, []);

  const create = async (path, payload, successMessage) => {
    setError(""); setMessage("");
    try {
      const response = await api.post(path, payload);
      setMessage(successMessage);
      await load();
      return response.data;
    } catch (err) {
      const data = err?.response?.data;
      const exactMessage = (() => {
        if (!data) return "";
        if (typeof data === "string") return data;
        if (typeof data.detail === "string") return data.detail;
        if (Array.isArray(data.detail)) return data.detail.join(", ");
        if (Array.isArray(data.non_field_errors)) return data.non_field_errors.join(", ");
        const fieldError = Object.entries(data).find(([, value]) => value);
        if (!fieldError) return "";
        const [field, value] = fieldError;
        const message = Array.isArray(value) ? value.join(", ") : String(value);
        return `${field.replaceAll("_", " ")}: ${message}`;
      })();
      setError(exactMessage || err?.message || "Transaction could not be recorded.");
      return null;
    }
  };

  const addBrand = (event) => {
    event.preventDefault();
    const request = editingBrand
      ? api.patch(`/gas/brands/${editingBrand}/`, { name: brandName })
      : api.post("/gas/brands/", { name: brandName, is_active: true, compliance_details: "" });
    request.then(async () => {
      setMessage(editingBrand ? "Gas brand updated." : "Gas brand added.");
      setError("");
      setBrandName("");
      setEditingBrand(null);
      await load();
    }).catch((err) => setError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || "Unable to save gas brand."));
  };

  const addSize = (event) => {
    event.preventDefault();
    const payload = { name: sizeName, weight_kg: sizeKg };
    const request = editingSize
      ? api.patch(`/gas/sizes/${editingSize}/`, payload)
      : api.post("/gas/sizes/", { ...payload, is_active: true });
    request.then(async () => {
      setMessage(editingSize ? "Cylinder size updated." : "Cylinder size added.");
      setError("");
      setSizeName("");
      setSizeKg("");
      setEditingSize(null);
      await load();
    }).catch((err) => setError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || "Unable to save cylinder size."));
  };

  const tabs = [
    { id: "overview", label: "Overview", hint: "Stock & alerts", icon: LayoutDashboard },
    { id: "refill", label: "Gas refill", hint: "Refill a cylinder", icon: RefreshCw },
    { id: "exchange", label: "Empty exchange", hint: "Swap cylinders", icon: ArrowLeftRight },
    { id: "sale", label: "New cylinder sale", hint: "Sell a cylinder", icon: ShoppingCart },
    { id: "purchase", label: "Gas purchase", hint: "Receive stock", icon: Truck },
    { id: "sales", label: "Sales history", hint: "Review transactions", icon: History },
    { id: "stock", label: "Record stock", hint: "Adjust quantities", icon: Boxes },
    { id: "setup", label: "Brands & sizes", hint: "Manage catalogue", icon: Settings2 },
  ].filter(({ id }) =>
    id === "purchase"
      ? canReceiveGas
      : canManageGas || !["stock", "setup"].includes(id)
  );

  return (
    <div className="space-y-6 pb-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-200">
              <Flame size={14} /> LPG operations
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Gas & LPG</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
              Manage refills, cylinder exchanges, sales, purchases and stock from one place.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:block">
              <p className="text-xs text-slate-400">Stock alerts</p>
              <p className="mt-1 font-semibold">
                {report?.low_stock_alerts?.length || 0} low · {report?.inspection_alerts?.length || 0} inspections
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-orange-50"
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
      </section>
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{message}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div>}
      <nav aria-label="Gas and LPG sections" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {tabs.map(({ id, label, hint, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => setTab(id)}
              className={`group flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left transition duration-150 sm:p-4 ${
                active
                  ? "border-blue-700 bg-blue-700 text-white shadow-lg shadow-blue-900/15"
                  : "border-slate-200 bg-white text-slate-700 shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/60 hover:shadow-md"
              }`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                active ? "bg-white/15 text-orange-100" : "bg-slate-100 text-slate-600 group-hover:bg-white"
              }`}>
                <Icon size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5">{label}</span>
                <span className={`mt-0.5 block truncate text-xs ${active ? "text-blue-100" : "text-slate-500"}`}>{hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title="Full cylinders" value={report?.stock?.full_cylinders || 0} icon={Flame}/>
            <Metric title="Empty cylinders" value={report?.stock?.empty_cylinders || 0} icon={ArrowLeftRight}/>
            <Metric title="Refill sales" value={money(report?.daily?.refill_sales)} icon={RefreshCw}/>
            <Metric title="Outstanding deposits" value={money(report?.outstanding_cylinder_deposits)} icon={ShoppingCart}/>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Low full-cylinder stock (1 or fewer)">
              <Table headers={["Location", "Brand", "Size", "Full", "Suggested order"]}>
                {(report?.low_stock_alerts || []).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td>{row.location_name}</td>
                    <td>{row.brand_name}</td>
                    <td>{row.size_name}</td>
                    <td>{row.full_quantity}</td>
                    <td>{row.suggested_reorder_quantity}</td>
                  </tr>
                ))}
                {!(report?.low_stock_alerts || []).length && (
                  <tr><td colSpan="5" className="py-3 text-slate-500">No low-stock alerts.</td></tr>
                )}
              </Table>
            </Card>
            <Card title="Cylinder inspections due or overdue">
              <Table headers={["Cylinder", "Location", "Due date", "Status"]}>
                {(report?.inspection_alerts || []).map((cylinder) => (
                  <tr key={cylinder.id} className="border-t">
                    <td>{cylinder.serial_number}</td>
                    <td>{cylinder.location_name}</td>
                    <td>{cylinder.next_inspection_date}</td>
                    <td>
                      <span className={cylinder.inspection_status === "OVERDUE" ? "font-semibold text-red-700" : "font-semibold text-amber-700"}>
                        {cylinder.inspection_status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!(report?.inspection_alerts || []).length && (
                  <tr><td colSpan="4" className="py-3 text-slate-500">No inspections are due.</td></tr>
                )}
              </Table>
            </Card>
          </div>
          <Card title="Cylinder stock">
            <div className="mb-4 grid gap-2 md:grid-cols-3">
              <Select required={false} value={stockFilter.location} onChange={(value) => setStockFilter((current) => ({ ...current, location: value }))} label="Filter by location" options={[["", "All locations"], ...locations.map((item) => [item.id, item.name])]} />
              <Select required={false} value={stockFilter.brand} onChange={(value) => setStockFilter((current) => ({ ...current, brand: value }))} label="Filter by brand" options={[["", "All brands"], ...brands.map((item) => [item.id, item.name])]} />
              <Select required={false} value={stockFilter.size} onChange={(value) => setStockFilter((current) => ({ ...current, size: value }))} label="Filter by size" options={[["", "All sizes"], ...sizes.map((item) => [item.id, item.name])]} />
            </div>
            <button type="button" onClick={load} className="mb-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Search size={14}/> Apply stock filters</button>
            <Table headers={["Location", "Brand", "Size", "Full", "Empty", ...(canManageGas ? ["Mark cylinders"] : [])]}>
              {stock.map((row) => (
                <tr key={row.id} className="border-t">
                  <td>{row.location_name}</td>
                  <td>{row.brand_name}</td>
                  <td>{row.size_name}</td>
                  <td>{row.full_quantity}</td>
                  <td>{row.empty_quantity}</td>
                  {canManageGas && (
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!row.empty_quantity}
                          onClick={() => setStockConversion({ row, status: "FULL", quantity: "1" })}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Mark full
                        </button>
                        <button
                          type="button"
                          disabled={!row.full_quantity}
                          onClick={() => setStockConversion({ row, status: "EMPTY", quantity: "1" })}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Mark empty
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!stock.length && (
                <tr>
                  <td colSpan={canManageGas ? 6 : 5} className="py-3 text-slate-500">No cylinder stock found.</td>
                </tr>
              )}
            </Table>
          </Card>
          <Card title="Recent stock movements">
            <Table headers={["Date", "Transaction", "Brand", "Size", "Status", "Quantity"]}>
              {movements.map((row) => <tr key={row.id} className="border-t"><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.movement_type}</td><td>{row.brand_name}</td><td>{row.size_name}</td><td>{row.cylinder_status}</td><td>{row.quantity_delta}</td></tr>)}
            </Table>
          </Card>
        </div>
      )}

      {tab === "refill" && (
        <Card title="Record gas refill">
          <p className="mb-4 text-sm text-slate-600">
            Record the empty cylinder brand received and the full cylinder brand supplied. If the brands differ, stock records the empty under the customer’s brand and the full cylinder under the supplied brand.
          </p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const paymentPayload = buildSplitPayments(
              refillSplitMode,
              refillPayments,
              refillAmountDue
            );
            if (paymentPayload.error) {
              setError(paymentPayload.error);
              return;
            }
            const recorded = await create("/gas/refills/create_refill/", {
              ...refill,
              ...(paymentPayload.payments ? { payments: paymentPayload.payments } : {}),
              customer_brand: refill.customer_brand || refill.brand,
              quantity: Number(refill.quantity),
              refill_price: refill.refill_price,
            }, "Gas refill recorded.");
            if (recorded) setReceiptSale(buildGasReceipt(recorded, "GAS REFILL"));
          }} className="grid gap-3 md:grid-cols-3">
            <Select value={refill.location} onChange={(v) => setRefill({...refill, location: v})} label="Location" options={locations.map(x => [x.id, x.name])}/>
            <Select value={refill.customer_brand} onChange={(v) => setRefill({...refill, customer_brand: v})} label="Customer's empty cylinder brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={refill.brand} onChange={(v) => setRefill({...refill, brand: v, customer_brand: refill.customer_brand || v})} label="Full cylinder brand supplied" options={brands.map(x => [x.id, x.name])}/>
            <Select value={refill.size} onChange={(v) => setRefill({...refill, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <Input label="Quantity" type="number" value={refill.quantity} onChange={(v) => setRefill({...refill, quantity: v})}/>
            <Input label="Refill price" type="number" value={refill.refill_price} onChange={(v) => setRefill({...refill, refill_price: v})}/>
            <PaymentFields
              paymentMethod={refill.payment_method}
              onPaymentMethodChange={(value) => setRefill({...refill, payment_method: value})}
              transactionReference={refill.transaction_reference}
              onTransactionReferenceChange={(value) => setRefill({...refill, transaction_reference: value})}
              splitMode={refillSplitMode}
              onSplitModeChange={setRefillSplitMode}
              payments={refillPayments}
              onPaymentsChange={setRefillPayments}
              totalDue={refillAmountDue}
            />
            <Input required={false} label="Customer name (optional)" value={refill.customer_name} onChange={(v) => setRefill({...refill, customer_name: v})}/>
            <Input required={false} label="Customer phone (optional)" value={refill.customer_phone} onChange={(v) => setRefill({...refill, customer_phone: v})}/>
            <Submit label="Record refill"/>
          </form>
        </Card>
      )}

      {tab === "exchange" && (
        <Card title="Empty cylinder exchange">
          <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            Exchange records the customer’s empty cylinder into empty stock and issues one full cylinder from full stock. For example, a 13kg Total exchange changes Full by -1 and Empty by +1. It will be rejected if there is not enough full stock.
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const paymentPayload = buildSplitPayments(
              exchangeSplitMode,
              exchangePayments,
              exchangeAmountDue
            );
            if (paymentPayload.error) {
              setError(paymentPayload.error);
              return;
            }
            const recorded = await create("/gas/exchanges/create_exchange/", {
              ...exchange,
              ...(paymentPayload.payments ? { payments: paymentPayload.payments } : {}),
              quantity: Number(exchange.quantity),
              refill_payment: exchange.refill_payment,
            }, "Cylinder exchange recorded.");
            if (recorded) setReceiptSale(buildGasReceipt(recorded, "CYLINDER EXCHANGE"));
          }} className="grid gap-3 md:grid-cols-3">
            <Select value={exchange.location} onChange={(v) => setExchange({...exchange, location: v})} label="Location" options={locations.map(x => [x.id, x.name])}/>
            <Select value={exchange.brand} onChange={(v) => setExchange({...exchange, brand: v})} label="Gas brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={exchange.size} onChange={(v) => setExchange({...exchange, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <Input label="Quantity" type="number" value={exchange.quantity} onChange={(v) => setExchange({...exchange, quantity: v})}/>
            <Input label="Refill/payment amount" type="number" value={exchange.refill_payment} onChange={(v) => setExchange({...exchange, refill_payment: v})}/>
            <PaymentFields
              paymentMethod={exchange.payment_method}
              onPaymentMethodChange={(value) => setExchange({...exchange, payment_method: value})}
              transactionReference={exchange.transaction_reference}
              onTransactionReferenceChange={(value) => setExchange({...exchange, transaction_reference: value})}
              splitMode={exchangeSplitMode}
              onSplitModeChange={setExchangeSplitMode}
              payments={exchangePayments}
              onPaymentsChange={setExchangePayments}
              totalDue={exchangeAmountDue}
            />
            <Input required={false} label="Customer name (optional)" value={exchange.customer_name} onChange={(v) => setExchange({...exchange, customer_name: v})}/>
            <Input required={false} label="Customer phone (optional)" value={exchange.customer_phone} onChange={(v) => setExchange({...exchange, customer_phone: v})}/>
            <Submit label="Record exchange"/>
          </form>
        </Card>
      )}

      {tab === "sale" && (
        <Card title="Sell a new or complete cylinder">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const paymentPayload = buildSplitPayments(
              saleSplitMode,
              salePayments,
              saleAmountDue
            );
            if (paymentPayload.error) {
              setError(paymentPayload.error);
              return;
            }
            const recorded = await create("/gas/sales/create_sale/", {
              ...sale,
              ...(paymentPayload.payments ? { payments: paymentPayload.payments } : {}),
              quantity: Number(sale.quantity),
              selling_price: sale.selling_price,
              deposit_amount: sale.deposit_amount || "0",
              accessories: sale.status === "COMPLETE"
                ? []
                : sale.accessories.split(",").map((item) => item.trim()).filter(Boolean),
              accessory_items: sale.status === "COMPLETE"
                ? saleAccessories.map((item) => ({
                    product: Number(item.product),
                    quantity: Number(item.quantity),
                  }))
                : [],
            }, "Cylinder sale recorded.");
            if (recorded) setReceiptSale(buildGasReceipt(recorded, `${recorded.status || "CYLINDER"} CYLINDER SALE`));
          }} className="grid gap-3 md:grid-cols-3">
            <Select value={sale.location} onChange={(v) => setSale({...sale, location: v})} label="Location" options={locations.map(x => [x.id, x.name])}/>
            <Select value={sale.brand} onChange={(v) => setSale({...sale, brand: v})} label="Cylinder brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={sale.size} onChange={(v) => setSale({...sale, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <Select
              value={sale.status}
              onChange={(v) => setSale({
                ...sale,
                status: v,
                includes_gas: v === "COMPLETE" ? true : sale.includes_gas,
              })}
              label="Cylinder status"
              options={[["FULL","Full"],["EMPTY","Empty"],["COMPLETE","Complete"]]}
            />
            <Input label="Quantity" type="number" min="1" step="1" value={sale.quantity} onChange={(v) => setSale({...sale, quantity: v})}/>
            <Input label={sale.status === "COMPLETE" ? "Cylinder selling price (each)" : "Selling price"} type="number" min="0" step="0.01" value={sale.selling_price} onChange={(v) => setSale({...sale, selling_price: v})}/>
            <Input required={false} label="Deposit (optional)" type="number" value={sale.deposit_amount} onChange={(v) => setSale({...sale, deposit_amount: v})}/>
            <PaymentFields
              paymentMethod={sale.payment_method}
              onPaymentMethodChange={(value) => setSale({...sale, payment_method: value})}
              transactionReference={sale.transaction_reference}
              onTransactionReferenceChange={(value) => setSale({...sale, transaction_reference: value})}
              splitMode={saleSplitMode}
              onSplitModeChange={setSaleSplitMode}
              payments={salePayments}
              onPaymentsChange={setSalePayments}
              totalDue={saleAmountDue}
            />
            <Input required={false} label="Customer name (optional)" value={sale.customer_name} onChange={(v) => setSale({...sale, customer_name: v})}/>
            <Input required={false} label="Customer phone (optional)" value={sale.customer_phone} onChange={(v) => setSale({...sale, customer_phone: v})}/>
            <label className="flex items-center gap-2 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={sale.status === "COMPLETE" || sale.includes_gas}
                disabled={sale.status === "COMPLETE"}
                onChange={(e) => setSale({...sale, includes_gas: e.target.checked})}
              />
              {sale.status === "COMPLETE" ? "Complete package includes gas" : "Sale includes gas"}
            </label>
            {sale.status === "COMPLETE" ? (
              <div className="space-y-3 rounded-lg border p-3 md:col-span-3">
                <div>
                  <h3 className="font-medium text-slate-800">Choose registered accessories</h3>
                  <p className="text-sm text-slate-500">
                    Select burners, regulators, grills, or other gas products. Their registered selling prices are included in the total and their stock will be reduced.
                  </p>
                </div>
                {!gasAccessoryProducts.length && (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    No active gas accessories were found. Register them under a Gas/LPG category or type first.
                  </p>
                )}
                {saleAccessories.map((item, index) => {
                  const usedProductIds = saleAccessories
                    .filter((_, itemIndex) => itemIndex !== index)
                    .map((otherItem) => String(otherItem.product));
                  return (
                    <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_150px_auto]">
                      <label className="text-sm text-slate-600">
                        Accessory product
                        <select
                          required
                          value={item.product}
                          onChange={(event) => setSaleAccessories((current) =>
                            current.map((entry, itemIndex) => itemIndex === index
                              ? { ...entry, product: event.target.value }
                              : entry)
                          )}
                          className="mt-1 w-full rounded-lg border p-2.5"
                        >
                          <option value="">Select registered product</option>
                          {gasAccessoryProducts
                            .filter((product) =>
                              !usedProductIds.includes(String(product.id)) ||
                              String(product.id) === String(item.product)
                            )
                            .map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name} ({product.sku}) · {money(product.selling_price)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <Input
                        label="Quantity"
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(value) => setSaleAccessories((current) =>
                          current.map((entry, itemIndex) => itemIndex === index
                            ? { ...entry, quantity: value }
                            : entry)
                        )}
                      />
                      {saleAccessories.length > 1 && (
                        <button
                          type="button"
                          aria-label="Remove accessory"
                          onClick={() => setSaleAccessories((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index)
                          )}
                          className="rounded-lg border p-2.5 text-slate-500 hover:bg-slate-50"
                        >
                          <X size={18}/>
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSaleAccessories((current) => [...current, { product: "", quantity: "1" }])}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                >
                  <Plus size={16}/> Add another accessory
                </button>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p>Accessories: {money(accessoryTotal)}</p>
                  <p className="font-semibold text-slate-800">
                    Cylinder and accessories total: {money(completeSaleTotal)}
                  </p>
                </div>
              </div>
            ) : (
              <Input label="Accessories (comma separated)" value={sale.accessories} onChange={(v) => setSale({...sale, accessories: v})}/>
            )}
            <Submit label={sale.status === "COMPLETE" ? "Record complete cylinder sale" : "Record cylinder sale"}/>
          </form>
        </Card>
      )}

      {tab === "purchase" && (
        <Card title="Record gas purchase">
          <p className="mb-4 text-sm text-slate-600">
            To exchange your empty cylinders for refilled ones from the company, record both quantities here. Full cylinders received increase full stock, and empty cylinders returned decrease empty stock (for example, receive 10 full and return 8 empty).
          </p>
          <form onSubmit={(e) => { e.preventDefault(); create("/gas/purchases/create_purchase/", purchase, "Gas purchase recorded."); }} className="grid gap-3 md:grid-cols-3">
            <Select value={purchase.location} onChange={(v) => setPurchase({...purchase, location: v})} label="Destination" options={locations.map(x => [x.id, x.name])}/>
            <Select value={purchase.supplier} onChange={(v) => setPurchase({...purchase, supplier: v})} label="Supplier" options={suppliers.map(x => [x.id, x.name])}/>
            <Select value={purchase.brand} onChange={(v) => setPurchase({...purchase, brand: v})} label="Gas brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={purchase.size} onChange={(v) => setPurchase({...purchase, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <Input label="Full cylinders received" type="number" value={purchase.full_cylinders_received} onChange={(v) => setPurchase({...purchase, full_cylinders_received: v})}/>
            <Input label="Empty cylinders returned" type="number" value={purchase.empty_cylinders_returned} onChange={(v) => setPurchase({...purchase, empty_cylinders_returned: v})}/>
            <Input label="Purchase price" type="number" value={purchase.purchase_price} onChange={(v) => setPurchase({...purchase, purchase_price: v})}/>
            <Input label="Delivery date" type="date" value={purchase.delivery_date} onChange={(v) => setPurchase({...purchase, delivery_date: v})}/>
            <Input label="Invoice/reference" value={purchase.invoice_reference} onChange={(v) => setPurchase({...purchase, invoice_reference: v})}/>
            <Input label="Compliance/reference" value={purchase.compliance_reference} onChange={(v) => setPurchase({...purchase, compliance_reference: v})}/>
            <Submit label="Record purchase"/>
          </form>
        </Card>
      )}

      {tab === "stock" && (
        <Card title="Record stock entry or adjustment">
          <p className="mb-4 text-sm text-slate-600">
            Choose whether to add or remove full and empty cylinders. Adjustments are restricted to managers and administrators, cannot reduce stock below zero, and are recorded in stock movement history.
          </p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const signedQuantity = (quantity, direction) => {
              const value = Number(quantity);
              return direction === "REMOVE" ? -value : value;
            };
            create("/gas/stock/record/", {
              location: stockAdjustment.location,
              brand: stockAdjustment.brand,
              size: stockAdjustment.size,
              full_quantity: signedQuantity(stockAdjustment.full_quantity, stockAdjustment.full_direction),
              empty_quantity: signedQuantity(stockAdjustment.empty_quantity, stockAdjustment.empty_direction),
              reference: stockAdjustment.reference,
              notes: stockAdjustment.notes,
            }, "Gas stock recorded.");
          }} className="grid gap-3 md:grid-cols-3">
            <Select value={stockAdjustment.location} onChange={(v) => setStockAdjustment({...stockAdjustment, location: v})} label="Location" options={locations.map(x => [x.id, x.name])}/>
            <Select value={stockAdjustment.brand} onChange={(v) => setStockAdjustment({...stockAdjustment, brand: v})} label="Gas brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={stockAdjustment.size} onChange={(v) => setStockAdjustment({...stockAdjustment, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <div className="grid grid-cols-2 gap-2">
              <Select value={stockAdjustment.full_direction} onChange={(v) => setStockAdjustment({...stockAdjustment, full_direction: v})} label="Full cylinders" options={[["ADD", "Add"], ["REMOVE", "Remove"]]}/>
              <Input label="Quantity" type="number" min="0" step="1" value={stockAdjustment.full_quantity} onChange={(v) => setStockAdjustment({...stockAdjustment, full_quantity: v})}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={stockAdjustment.empty_direction} onChange={(v) => setStockAdjustment({...stockAdjustment, empty_direction: v})} label="Empty cylinders" options={[["ADD", "Add"], ["REMOVE", "Remove"]]}/>
              <Input label="Quantity" type="number" min="0" step="1" value={stockAdjustment.empty_quantity} onChange={(v) => setStockAdjustment({...stockAdjustment, empty_quantity: v})}/>
            </div>
            <Input label="Reference (optional)" value={stockAdjustment.reference} onChange={(v) => setStockAdjustment({...stockAdjustment, reference: v})} required={false}/>
            <Input required={false} label="Reason for adjustment (optional)" value={stockAdjustment.notes} onChange={(v) => setStockAdjustment({...stockAdjustment, notes: v})}/>
            <Submit label="Record stock adjustment"/>
          </form>
        </Card>
      )}

      {tab === "sales" && (
        <div className="space-y-6">
          <Card title="Filter Gas & LPG sales">
            <div className="grid gap-2 md:grid-cols-5">
              <Select required={false} value={salesFilter.location} onChange={(value) => setSalesFilter((current) => ({ ...current, location: value }))} label="Location" options={[["", "All locations"], ...locations.map((item) => [item.id, item.name])]} />
              <Select required={false} value={salesFilter.brand} onChange={(value) => setSalesFilter((current) => ({ ...current, brand: value }))} label="Brand" options={[["", "All brands"], ...brands.map((item) => [item.id, item.name])]} />
              <Select required={false} value={salesFilter.size} onChange={(value) => setSalesFilter((current) => ({ ...current, size: value }))} label="Size" options={[["", "All sizes"], ...sizes.map((item) => [item.id, item.name])]} />
              <Input required={false} label="From date" type="date" value={salesFilter.dateFrom} onChange={(value) => setSalesFilter((current) => ({ ...current, dateFrom: value }))} />
              <Input required={false} label="To date" type="date" value={salesFilter.dateTo} onChange={(value) => setSalesFilter((current) => ({ ...current, dateTo: value }))} />
            </div>
            <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Search size={14}/> Apply sales filters</button>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title="Transactions shown" value={refills.length + exchanges.length + gasSales.length} icon={History}/>
            <Metric title="Refills" value={refills.length} icon={RefreshCw}/>
            <Metric title="Exchanges" value={exchanges.length} icon={ArrowLeftRight}/>
            <Metric title="Total sales value" value={money(gasSalesTotal)} icon={ShoppingCart}/>
          </div>
            <Card title="Sales by payment method">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(gasSalesByPaymentMethod).map(([method, amount]) => (
                  <div key={method} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-500">
                      {method === "NOT_RECORDED"
                        ? "Payment not recorded"
                        : paymentOptions.find(([value]) => value === method)?.[1] || method}
                    </p>
                    <p className="mt-2 text-xl font-bold text-slate-900">{money(amount)}</p>
                  </div>
                ))}
                {!Object.keys(gasSalesByPaymentMethod).length && (
                  <p className="text-sm text-slate-500">No sales recorded for this filter.</p>
                )}
              </div>
            </Card>
          <Card title={`Refills · ${refills.length}`}>
            <Table headers={["Date", "Reference", "Cashier", "Location", "Brand", "Size", "Quantity", "Tax", "Payment method", "Amount", "Actions"]}>
              {refills.map((item) => <tr key={item.id} className="border-t"><td>{dateTimeMillis(item.created_at)}</td><td>{item.reference}</td><td>{item.recorded_by_name || "—"}</td><td>{item.location_name}</td><td>{item.brand_name}</td><td>{item.size_name}</td><td>{item.quantity}</td><td>{money(item.tax_amount)}</td><td><PaymentMethodBadges transaction={item} /></td><td>{money(item.tax_included ? item.total_amount : Number(item.total_amount) + Number(item.tax_amount || 0))}</td><td><div className="flex items-center gap-2"><button type="button" onClick={() => setSelectedGasSale({ type: "REFILL", data: item })} className="inline-flex items-center gap-1 text-blue-700"><Eye size={14}/> View</button><button type="button" onClick={() => setReceiptSale(buildGasReceipt(item, "GAS REFILL"))} className="inline-flex items-center gap-1 text-slate-700"><Printer size={14}/> Print</button></div></td></tr>)}
              {!refills.length && <tr><td colSpan="11" className="py-3 text-slate-500">No refills found</td></tr>}
            </Table>
          </Card>
          <Card title={`Cylinder exchanges · ${exchanges.length}`}>
            <Table headers={["Date", "Reference", "Cashier", "Location", "Brand", "Size", "Quantity", "Tax", "Amount", "Payment method", "Actions"]}>
              {exchanges.map((item) => <tr key={item.id} className="border-t"><td>{dateTimeMillis(item.created_at)}</td><td>{item.reference}</td><td>{item.recorded_by_name || "—"}</td><td>{item.location_name}</td><td>{item.brand_name}</td><td>{item.size_name}</td><td>{item.quantity}</td><td>{money(item.tax_amount)}</td><td>{money(item.tax_included ? item.refill_payment : Number(item.refill_payment) + Number(item.tax_amount || 0))}</td><td><PaymentMethodBadges transaction={item} /></td><td><div className="flex items-center gap-2"><button type="button" onClick={() => setSelectedGasSale({ type: "EXCHANGE", data: item })} className="inline-flex items-center gap-1 text-blue-700"><Eye size={14}/> View</button><button type="button" onClick={() => setReceiptSale(buildGasReceipt(item, "CYLINDER EXCHANGE"))} className="inline-flex items-center gap-1 text-slate-700"><Printer size={14}/> Print</button></div></td></tr>)}
              {!exchanges.length && <tr><td colSpan="11" className="py-3 text-slate-500">No exchanges found</td></tr>}
            </Table>
          </Card>
          <Card title={`Cylinder sales · ${gasSales.length}`}>
            <Table headers={["Date", "Reference", "Cashier", "Location", "Brand", "Size", "Status", "Quantity", "Tax", "Amount", "Payment method", "Actions"]}>
              {gasSales.map((item) => <tr key={item.id} className="border-t"><td>{dateTimeMillis(item.created_at)}</td><td>{item.reference}</td><td>{item.recorded_by_name || "—"}</td><td>{item.location_name}</td><td>{item.brand_name}</td><td>{item.size_name}</td><td>{item.status}</td><td>{item.quantity}</td><td>{money(item.tax_amount)}</td><td>{money(item.tax_included ? item.total_amount : Number(item.total_amount) + Number(item.tax_amount || 0))}</td><td><PaymentMethodBadges transaction={item} /></td><td><div className="flex items-center gap-2"><button type="button" onClick={() => setSelectedGasSale({ type: "CYLINDER SALE", data: item })} className="inline-flex items-center gap-1 text-blue-700"><Eye size={14}/> View</button><button type="button" onClick={() => setReceiptSale(buildGasReceipt(item, `${item.status} CYLINDER SALE`))} className="inline-flex items-center gap-1 text-slate-700"><Printer size={14}/> Print</button></div></td></tr>)}
              {!gasSales.length && <tr><td colSpan="12" className="py-3 text-slate-500">No cylinder sales found</td></tr>}
            </Table>
          </Card>
        </div>
      )}

      {tab === "setup" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Gas brands">
            <form onSubmit={addBrand} className="mb-4 flex gap-2">
              <input required className="flex-1 rounded-lg border p-2" placeholder="Brand name" value={brandName} onChange={(e) => setBrandName(e.target.value)}/>
              <button className="rounded-lg bg-blue-600 px-3 text-white"><Plus size={18}/>{editingBrand ? "Save" : ""}</button>
              {editingBrand && <button type="button" onClick={() => {setEditingBrand(null); setBrandName("");}} className="rounded-lg border px-3">Cancel</button>}
            </form>
            <Table headers={["Brand", "Status", "Actions"]}>
              {brands.map((item) => <tr key={item.id} className="border-t"><td className="py-2">{item.name}</td><td>{item.is_active ? "Active" : "Inactive"}</td><td><button type="button" onClick={() => {setEditingBrand(item.id); setBrandName(item.name);}} className="text-blue-700">Edit</button></td></tr>)}
              {!brands.length && <tr><td colSpan="3" className="py-3 text-slate-500">No brands yet</td></tr>}
            </Table>
          </Card>
          <Card title="Cylinder sizes">
            <form onSubmit={addSize} className="mb-4 flex flex-wrap gap-2">
              <input required className="min-w-28 flex-1 rounded-lg border p-2" placeholder="Size name (e.g. 13kg)" value={sizeName} onChange={(e) => setSizeName(e.target.value)}/>
              <input required className="w-28 rounded-lg border p-2" type="number" step="0.01" placeholder="Weight KG" value={sizeKg} onChange={(e) => setSizeKg(e.target.value)}/>
              <button className="rounded-lg bg-blue-600 px-3 text-white"><Plus size={18}/>{editingSize ? "Save" : ""}</button>
              {editingSize && <button type="button" onClick={() => {setEditingSize(null); setSizeName(""); setSizeKg("");}} className="rounded-lg border px-3">Cancel</button>}
            </form>
            <Table headers={["Size", "Weight (kg)", "Status", "Actions"]}>
              {sizes.map((item) => <tr key={item.id} className="border-t"><td className="py-2">{item.name}</td><td>{item.weight_kg}</td><td>{item.is_active ? "Active" : "Inactive"}</td><td><button type="button" onClick={() => {setEditingSize(item.id); setSizeName(item.name); setSizeKg(item.weight_kg);}} className="text-blue-700">Edit</button></td></tr>)}
              {!sizes.length && <tr><td colSpan="4" className="py-3 text-slate-500">No sizes yet</td></tr>}
            </Table>
          </Card>
        </div>
      )}
      {receiptSale && (
        <ReceiptPreview
          sale={receiptSale}
          onClose={() => setReceiptSale(null)}
        />
      )}
      {stockConversion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-conversion-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 id="stock-conversion-title" className="text-lg font-bold text-slate-900">
              Mark cylinders {stockConversion.status.toLowerCase()}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {stockConversion.row.brand_name} · {stockConversion.row.size_name} · {stockConversion.row.location_name}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Available to mark {stockConversion.status.toLowerCase()}:{" "}
              {stockConversion.status === "FULL"
                ? stockConversion.row.empty_quantity
                : stockConversion.row.full_quantity}
            </p>
            <form
              className="mt-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const result = await create("/gas/stock/convert/", {
                  location: stockConversion.row.location,
                  brand: stockConversion.row.brand,
                  size: stockConversion.row.size,
                  from_status: stockConversion.status === "FULL" ? "EMPTY" : "FULL",
                  quantity: Number(stockConversion.quantity),
                }, "Cylinder stock status updated.");
                if (result) setStockConversion(null);
              }}
            >
              <Input
                label="Quantity"
                type="number"
                min="1"
                step="1"
                value={stockConversion.quantity}
                onChange={(value) => setStockConversion((current) => ({ ...current, quantity: value }))}
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStockConversion(null)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Mark {stockConversion.status.toLowerCase()}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {selectedGasSale && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4">
          <div className="my-6 w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gas & LPG Sale Details</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedGasSale.data.reference}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedGasSale.type}</p>
              </div>
              <button type="button" onClick={() => setSelectedGasSale(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close sale details"><X size={20}/></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Detail label="Date" value={dateTimeMillis(selectedGasSale.data.created_at)} />
              <Detail label="Cashier" value={selectedGasSale.data.recorded_by_name || "—"} />
              <Detail label="Location" value={selectedGasSale.data.location_name || "—"} />
              <Detail label="Customer" value={selectedGasSale.data.customer_name || "Walk-in customer"} />
              <Detail label="Customer phone" value={selectedGasSale.data.customer_phone || "—"} />
              <Detail label="Brand" value={selectedGasSale.data.brand_name || "—"} />
              <Detail label="Customer cylinder brand" value={selectedGasSale.data.customer_brand_name || "—"} />
              <Detail label="Size" value={selectedGasSale.data.size_name || "—"} />
              <Detail label="Quantity" value={selectedGasSale.data.quantity ?? "—"} />
              {selectedGasSale.type === "CYLINDER SALE" && (
                <>
                  <Detail label="Cylinder status" value={selectedGasSale.data.status || "—"} />
                  <Detail label="Includes gas" value={selectedGasSale.data.includes_gas ? "Yes" : "No"} />
                  <Detail label="Deposit" value={money(selectedGasSale.data.deposit_amount)} />
                </>
              )}
              <Detail
                label="Payment method"
                value={selectedGasSale.data.payments?.length
                  ? selectedGasSale.data.payments.map((payment) => payment.payment_method).join(", ")
                  : selectedGasSale.data.payment_method || "Not recorded"}
              />
              <Detail
                label="Payment reference"
                value={selectedGasSale.data.payments?.length
                  ? selectedGasSale.data.payments.map((payment) => payment.transaction_reference).filter(Boolean).join(", ") || "—"
                  : selectedGasSale.data.transaction_reference || "—"}
              />
              <Detail label="Tax rate" value={`${Number(selectedGasSale.data.tax_rate || 0)}%`} />
              <Detail label="Tax" value={money(selectedGasSale.data.tax_amount)} />
              {selectedGasSale.type === "REFILL" && (
                <>
                  <Detail label="Refill price" value={money(selectedGasSale.data.refill_price)} />
                  <Detail label="Refill total" value={money(Number(selectedGasSale.data.total_amount || 0) + (selectedGasSale.data.tax_included ? 0 : Number(selectedGasSale.data.tax_amount || 0)))} />
                </>
              )}
              {selectedGasSale.type === "EXCHANGE" && (
                <Detail label="Exchange payment" value={money(Number(selectedGasSale.data.refill_payment || 0) + (selectedGasSale.data.tax_included ? 0 : Number(selectedGasSale.data.tax_amount || 0)))} />
              )}
              {selectedGasSale.type === "CYLINDER SALE" && (
                <>
                  <Detail label="Cylinder selling price" value={money(selectedGasSale.data.selling_price)} />
                  <Detail label="Accessories total" value={money(selectedGasSale.data.accessories_total)} />
                  <Detail label="Sale total" value={money(Number(selectedGasSale.data.total_amount || 0) + (selectedGasSale.data.tax_included ? 0 : Number(selectedGasSale.data.tax_amount || 0)))} />
                </>
              )}
            </div>
            {selectedGasSale.type === "CYLINDER SALE" && selectedGasSale.data.accessory_items?.length > 0 && (
              <div className="px-5 pb-5">
                <h3 className="mb-2 font-semibold text-slate-800">Accessories</h3>
                <Table headers={["Product", "Quantity", "Unit price", "Line total"]}>
                  {selectedGasSale.data.accessory_items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td>{item.product_name}</td>
                      <td>{item.quantity}</td>
                      <td>{money(item.unit_price)}</td>
                      <td>{money(item.line_total)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t p-5">
              <button type="button" onClick={() => setSelectedGasSale(null)} className="rounded-lg border px-4 py-2 text-sm">Close</button>
              <button type="button" onClick={() => {
                const item = selectedGasSale.data;
                setReceiptSale(buildGasReceipt(item, `${selectedGasSale.type}`));
              }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Printer size={16}/> Print receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentFields({
  paymentMethod,
  onPaymentMethodChange,
  transactionReference,
  onTransactionReferenceChange,
  splitMode,
  onSplitModeChange,
  payments,
  onPaymentsChange,
  totalDue,
}) {
  const toggleSplitMode = (enabled) => {
    onSplitModeChange(enabled);
    if (enabled) {
      onPaymentsChange([
        createPaymentRow(
          paymentMethod || "CASH",
          Number(totalDue || 0).toFixed(2),
          transactionReference
        ),
      ]);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 md:col-span-3">
      <p className="text-sm font-semibold text-slate-700">
        Total due (including applicable tax): {money(totalDue)}
      </p>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={splitMode}
          onChange={(event) => toggleSplitMode(event.target.checked)}
        />
        Split payment across multiple methods
      </label>
      {splitMode ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Allocate the full amount due across payment methods. M-Pesa split payments are recorded manually and require a transaction reference.
          </p>
          {payments.map((payment) => (
            <div key={payment.id} className="space-y-2 rounded-lg bg-slate-50 p-3">
              <Select
                label="Payment method"
                value={payment.payment_method}
                onChange={(value) => onPaymentsChange((current) =>
                  current.map((item) => item.id === payment.id
                    ? { ...item, payment_method: value }
                    : item)
                )}
                options={paymentOptions}
              />
              <Input
                label="Amount (KSh)"
                type="number"
                min="0.01"
                step="0.01"
                value={payment.amount}
                onChange={(value) => onPaymentsChange((current) =>
                  current.map((item) => item.id === payment.id
                    ? { ...item, amount: value }
                    : item)
                )}
              />
              {payment.payment_method !== "CASH" && (
                <Input
                  label={`Transaction reference${payment.payment_method === "MPESA" ? " (required)" : " (optional)"}`}
                  required={payment.payment_method === "MPESA"}
                  value={payment.transaction_reference}
                  onChange={(value) => onPaymentsChange((current) =>
                    current.map((item) => item.id === payment.id
                      ? { ...item, transaction_reference: value }
                      : item)
                  )}
                />
              )}
              {payments.length > 1 && (
                <button
                  type="button"
                  onClick={() => onPaymentsChange((current) =>
                    current.filter((item) => item.id !== payment.id)
                  )}
                  className="text-sm font-medium text-red-700"
                >
                  Remove payment
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const allocated = payments.reduce(
                (sum, payment) => sum + Number(payment.amount || 0),
                0
              );
              const remaining = Math.max(
                0,
                Number((totalDue - allocated).toFixed(2))
              );
              onPaymentsChange((current) => [
                ...current,
                createPaymentRow("BANK", remaining.toFixed(2)),
              ]);
            }}
            className="w-full rounded-lg border border-blue-200 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Add payment method
          </button>
          <p className="text-right text-sm font-semibold text-slate-700">
            Allocated: {money(payments.reduce(
              (sum, payment) => sum + Number(payment.amount || 0),
              0
            ))}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            required
            label="Payment method"
            value={paymentMethod}
            onChange={onPaymentMethodChange}
            options={paymentOptions}
          />
          {paymentMethod && paymentMethod !== "CASH" && (
            <Input
              label={`Payment reference${paymentMethod === "MPESA" ? " (required)" : " (optional)"}`}
              required={paymentMethod === "MPESA"}
              value={transactionReference}
              onChange={onTransactionReferenceChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ title, value, icon: Icon }) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-600 transition group-hover:bg-orange-100">
          <Icon size={20}/>
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
    </div>
  );
}
function Detail({ label, value }) { return <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 break-words font-semibold text-slate-800">{value}</p></div>; }
function Card({ title, children }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 border-b border-slate-100 pb-3 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{title}</h2>
      {children}
    </section>
  );
}
function Input({ label, value, onChange, type = "text", required = true, min, step }) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700">
      {label}
      <input
        required={required}
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      />
    </label>
  );
}
function Select({ label, value, onChange, options, required = true }) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700">
      {label}
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}
function Submit({ label }) {
  return (
    <button type="submit" className="mt-2 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 md:col-span-3">
      {label}
    </button>
  );
}
function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-max text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-4 py-3">{header}</th>)}</tr>
        </thead>
        <tbody className="[&_tr:not(:first-child)]:border-t [&_tr]:border-slate-100 [&_tr:hover]:bg-slate-50/70">
          {children}
        </tbody>
      </table>
    </div>
  );
}
