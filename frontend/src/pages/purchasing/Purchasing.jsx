
import { useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Truck,
  FileText,
  PackageCheck,
  CreditCard,
  RotateCcw,
  X,
  Eye,
} from "lucide-react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

const tabs = [
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "orders", label: "Purchase Orders", icon: FileText },
  { id: "grns", label: "Goods Received", icon: PackageCheck },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "returns", label: "Returns", icon: RotateCcw },
];

const endpoints = {
  suppliers: "/purchases/suppliers/",
  orders: "/purchases/orders/",
  grns: "/purchases/goods-received/",
  invoices: "/purchases/supplier-invoices/",
  payments: "/purchases/supplier-payments/",
  returns: "/purchases/supplier-returns/",
};

const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

function getErrorMessage(error, fallback) {
  const data = error.response?.data;
  if (!data) return error.message || fallback;
  if (typeof data === "string") return data;
  return Object.entries(data)
    .map(([key, value]) => {
      const message = Array.isArray(value)
        ? value.join(", ")
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : value;
      return key === "detail" ? String(message) : `${key}: ${message}`;
    })
    .join(" | ") || fallback;
}

function FormField({ label, children }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const emptyLine = () => ({
  product: "",
  quantity: "",
  unit_cost: "",
  discount_amount: "0",
  tax_amount: "0",
});

export default function Purchasing() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("suppliers");
  const [records, setRecords] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [form, setForm] = useState({});
  const [lines, setLines] = useState([emptyLine()]);

  const getList = (data) =>
    Array.isArray(data) ? data : data?.results || [];

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(endpoints[activeTab]);
      setRecords(getList(response.data));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        `Unable to load ${activeTab}. Check the API endpoint.`
      );
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchRecords = async () => {
      try {
        const response = await api.get(endpoints[activeTab]);
        if (active) setRecords(getList(response.data));
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.detail ||
            `Unable to load ${activeTab}. Check the API endpoint.`
          );
          setRecords([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    Promise.resolve().then(() => {
      if (active) setLoading(true);
      return fetchRecords();
    });

    return () => {
      active = false;
    };
  }, [activeTab]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get(endpoints.suppliers),
      api.get(endpoints.orders),
      api.get(endpoints.grns),
      api.get(endpoints.invoices),
      api.get("/products/products/"),
      api.get("/inventory/locations/"),
    ])
      .then(([supplierResponse, orderResponse, grnResponse, invoiceResponse, productResponse, locationResponse]) => {
        if (!active) return;
        setSuppliers(getList(supplierResponse.data));
        setOrders(getList(orderResponse.data));
        setGrns(getList(grnResponse.data));
        setInvoices(getList(invoiceResponse.data));
        setProducts(getList(productResponse.data).filter((item) => item.is_active));
        setLocations(getList(locationResponse.data).filter((item) => item.is_active));
      })
      .catch((err) => {
        if (active) {
          setError(getErrorMessage(err, "Unable to load purchasing form data."));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredRecords = records.filter((record) => {
    const term = search.toLowerCase();

    return JSON.stringify(record).toLowerCase().includes(term);
  });

  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const date = (value) =>
    value
      ? new Date(value).toLocaleDateString("en-KE")
      : "-";

  const openCreateForm = () => {
    setError("");
    setSuccess("");
    setForm({
      invoice_date: today(),
      payment_date: today(),
      reason: "DEFECTIVE",
      resolution: "PENDING",
    });
    setLines([emptyLine()]);
    setShowForm(true);
  };

  const saveWorkflow = async (operation, message) => {
    let createdRecord = null;
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      try {
        await operation((record) => {
          createdRecord = record;
        });
      } catch (err) {
        if (createdRecord) {
          setShowForm(false);
          setForm({});
          setLines([emptyLine()]);
          await loadRecords();
          let referenceError = "";
          try {
            await loadReferences();
          } catch (refreshError) {
            referenceError = ` Reference data refresh failed: ${getErrorMessage(refreshError, "unknown error")}`;
          }
          const reference =
            createdRecord.reference ||
            createdRecord.invoice_number ||
            createdRecord.id;
          setError(
            `${reference} was created, but a later step failed. Check its current status before retrying. ` +
            getErrorMessage(err, "Unable to complete this purchasing step.") +
            referenceError
          );
        } else {
          setError(getErrorMessage(err, "Unable to complete this purchasing step."));
        }
        return;
      }

      setShowForm(false);
      setForm({});
      setLines([emptyLine()]);
      setSuccess(message);
      await loadRecords();
      try {
        await loadReferences();
      } catch (err) {
        setError(
          `Saved successfully, but reference data could not be refreshed. ${getErrorMessage(err, "Refresh the page before creating another record.")}`
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const loadReferences = async () => {
    const [supplierResponse, orderResponse, grnResponse, invoiceResponse] =
      await Promise.all([
        api.get(endpoints.suppliers),
        api.get(endpoints.orders),
        api.get(endpoints.grns),
        api.get(endpoints.invoices),
      ]);
    setSuppliers(getList(supplierResponse.data));
    setOrders(getList(orderResponse.data));
    setGrns(getList(grnResponse.data));
    setInvoices(getList(invoiceResponse.data));
  };

  const runRecordAction = async (record, action, successMessage) => {
    try {
      setError("");
      setSuccess("");
      setSaving(true);
      await api.post(`${endpoints[activeTab]}${record.id}/${action}/`);
      setSuccess(successMessage);
      await loadRecords();
      await loadReferences();
    } catch (err) {
      setError(getErrorMessage(err, `Unable to ${action} this record.`));
    } finally {
      setSaving(false);
    }
  };

  const saveSupplier = async (e) => {
    e.preventDefault();
    await saveWorkflow(() => api.post(endpoints.suppliers, {
      name: form.name,
      contact_person: form.contact_person || "",
      phone_number: form.phone_number || "",
      email: form.email || "",
      address: form.address || "",
      kra_pin: form.kra_pin || "",
      notes: form.notes || "",
    }), "Supplier added successfully.");
  };

  const savePurchaseOrder = async (event) => {
    event.preventDefault();
    const orderLines = lines.filter(
      (line) => line.product && Number(line.quantity) > 0
    );
    if (!form.supplier || !form.destination || !orderLines.length) {
      setError("Select a supplier, destination, and at least one product.");
      return;
    }

    await saveWorkflow(async (markCreated) => {
      const response = await api.post(endpoints.orders, {
        supplier: Number(form.supplier),
        destination: Number(form.destination),
        expected_delivery_date: form.expected_delivery_date || null,
        notes: form.notes || "",
      });
      markCreated(response.data);
      for (const line of orderLines) {
        await api.post(`${endpoints.orders}${response.data.id}/items/`, {
          product: Number(line.product),
          quantity: Number(line.quantity),
          unit_cost: Number(line.unit_cost),
          discount_amount: Number(line.discount_amount || 0),
          tax_amount: Number(line.tax_amount || 0),
        });
      }
      await api.post(`${endpoints.orders}${response.data.id}/submit/`);
    }, "Purchase order submitted for approval.");
  };

  const saveGoodsReceived = async (event) => {
    event.preventDefault();
    const order = orders.find((item) => String(item.id) === String(form.purchase_order));
    const receiveLines = (order?.items || []).filter(
      (item) => Number(form[`receive_${item.id}`]) > 0
    );
    if (!order || !receiveLines.length) {
      setError("Select an approved purchase order and enter at least one received quantity.");
      return;
    }

    await saveWorkflow(async (markCreated) => {
      const response = await api.post(endpoints.grns, {
        purchase_order: order.id,
        supplier_delivery_note: form.supplier_delivery_note || "",
        supplier_invoice_number: form.supplier_invoice_number || "",
        notes: form.notes || "",
      });
      markCreated(response.data);
      for (const item of receiveLines) {
        await api.post(`${endpoints.grns}${response.data.id}/items/`, {
          purchase_order_item: item.id,
          quantity_received: Number(form[`receive_${item.id}`]),
          unit_cost: Number(item.unit_cost),
        });
      }
      await api.post(`${endpoints.grns}${response.data.id}/post/`);
    }, "Goods received and stock updated.");
  };

  const saveInvoice = async (event) => {
    event.preventDefault();
    const subtotal = Number(form.subtotal || 0);
    const tax = Number(form.tax_amount || 0);
    const discount = Number(form.discount_amount || 0);
    const total = subtotal + tax - discount;
    if (!form.supplier || !form.invoice_number || total <= 0) {
      setError("Select a supplier, enter an invoice number, and provide a valid invoice total.");
      return;
    }

    await saveWorkflow(async (markCreated) => {
      const response = await api.post(endpoints.invoices, {
        supplier: Number(form.supplier),
        goods_received_note: form.goods_received_note
          ? Number(form.goods_received_note)
          : null,
        invoice_number: form.invoice_number,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        subtotal,
        tax_amount: tax,
        discount_amount: discount,
        total_amount: total,
        notes: form.notes || "",
      });
      markCreated(response.data);
      await api.post(`${endpoints.invoices}${response.data.id}/post/`);
    }, "Supplier invoice posted.");
  };

  const savePayment = async (event) => {
    event.preventDefault();
    const invoice = invoices.find(
      (item) => String(item.id) === String(form.supplier_invoice)
    );
    const amount = Number(form.amount);
    if (!invoice || amount <= 0 || amount > Number(invoice.outstanding_balance)) {
      setError("Select an unpaid invoice and enter a payment within its outstanding balance.");
      return;
    }

    await saveWorkflow(async (markCreated) => {
      const response = await api.post(endpoints.payments, {
        supplier: invoice.supplier,
        supplier_invoice: invoice.id,
        amount,
        payment_method: form.payment_method || "CASH",
        payment_reference: form.payment_reference || "",
        payment_date: form.payment_date || today(),
        notes: form.notes || "",
      });
      markCreated(response.data);
      await api.post(`${endpoints.payments}${response.data.id}/post/`);
    }, "Supplier payment recorded and posted.");
  };

  const saveSupplierReturn = async (event) => {
    event.preventDefault();
    const returnGrn = grns.find(
      (item) => String(item.id) === String(form.original_grn)
    );
    const returnItems = (returnGrn?.items || []).filter(
      (item) => Number(form[`return_${item.id}`]) > 0
    );
    if (!returnGrn || !returnItems.length) {
      setError("Select a posted goods receipt and enter at least one return quantity.");
      return;
    }

    await saveWorkflow(async (markCreated) => {
      const response = await api.post(endpoints.returns, {
        original_grn: returnGrn.id,
        reason: form.reason,
        resolution: form.resolution || "PENDING",
        supplier_reference: form.supplier_reference || "",
        notes: form.notes || "",
      });
      markCreated(response.data);
      for (const item of returnItems) {
        await api.post(`${endpoints.returns}${response.data.id}/items/`, {
          original_received_item: item.id,
          quantity_returned: Number(form[`return_${item.id}`]),
        });
      }
      await api.post(`${endpoints.returns}${response.data.id}/post/`);
    }, "Supplier return posted and stock adjusted.");
  };

  const updateForm = (field, value) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const inputClass =
    "w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-500";

  const title = tabs.find((tab) => tab.id === activeTab)?.label;
  const selectedOrder = orders.find(
    (item) => String(item.id) === String(form.purchase_order)
  );
  const selectedGrn = grns.find(
    (item) => String(item.id) === String(form.original_grn)
  );
  const selectedInvoice = invoices.find(
    (item) => String(item.id) === String(form.supplier_invoice)
  );

  const renderActions = (record, mobile = false) => {
    const actionClass = mobile
      ? "flex min-h-10 items-center gap-1 rounded-lg border px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
      : "rounded-lg border px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50";

    return (
      <div className={`flex flex-wrap gap-2 ${mobile ? "" : "justify-end"}`}>
        {activeTab === "orders" && record.status === "DRAFT" && (
          <button
            onClick={() => runRecordAction(record, "submit", "Purchase order submitted.")}
            disabled={saving}
            className={actionClass}
          >
            Submit
          </button>
        )}
        {activeTab === "orders" &&
          record.status === "SUBMITTED" &&
          (user?.is_superuser || user?.role === "ADMINISTRATOR") && (
            <button
              onClick={() => runRecordAction(record, "approve", "Purchase order approved.")}
              disabled={saving}
              className={actionClass}
            >
              Approve
            </button>
          )}
        {activeTab === "orders" &&
          ["DRAFT", "SUBMITTED", "APPROVED"].includes(record.status) && (
            <button
              onClick={() => runRecordAction(record, "cancel", "Purchase order cancelled.")}
              disabled={saving}
              className={`${actionClass} text-red-600 hover:bg-red-50`}
            >
              Cancel
            </button>
          )}
        {activeTab === "grns" && record.status === "DRAFT" && (
          <button
            onClick={() => runRecordAction(record, "post", "Goods receipt posted; inventory updated.")}
            disabled={saving}
            className={actionClass}
          >
            Post
          </button>
        )}
        {["invoices", "payments", "returns"].includes(activeTab) &&
          record.status === "DRAFT" && (
            <button
              onClick={() => runRecordAction(record, "post", `${title} posted successfully.`)}
              disabled={saving}
              className={actionClass}
            >
              Post
            </button>
          )}
        <button
          onClick={() => setSelectedRecord(record)}
          className={mobile
            ? "flex min-h-10 items-center gap-1 rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
            : "rounded-lg border p-2 hover:bg-gray-100"}
          title="View details"
        >
          <Eye size={16} />
          {mobile && "Details"}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Purchasing Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage suppliers, orders, deliveries and supplier payments.
          </p>
        </div>

        <button
          onClick={loadRecords}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSearch("");
                setSelectedRecord(null);
                setError("");
                setSuccess("");
              }}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border bg-white">
        <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500">
              {records.length} records
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search records..."
                className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64"
              />
            </div>

            <button
              onClick={openCreateForm}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus size={16} />
              {activeTab === "suppliers"
                ? "Add Supplier"
                : activeTab === "orders"
                  ? "Create Purchase Order"
                  : activeTab === "grns"
                    ? "Receive Goods"
                    : activeTab === "invoices"
                      ? "Record Invoice"
                      : activeTab === "payments"
                        ? "Record Payment"
                        : "Create Return"}
            </button>
          </div>
        </div>

        {error && (
          <div className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="m-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Loading records...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            No {activeTab} records found.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {activeTab === "suppliers" && (
                    <>
                      <th className="px-5 py-3">Supplier</th>
                      <th className="px-5 py-3">Contact Person</th>
                      <th className="px-5 py-3">Phone</th>
                      <th className="px-5 py-3">Email</th>
                    </>
                  )}

                  {activeTab === "orders" && (
                    <>
                      <th className="px-5 py-3">Order Reference</th>
                      <th className="px-5 py-3">Supplier</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Total</th>
                      <th className="px-5 py-3">Status</th>
                    </>
                  )}

                  {activeTab === "grns" && (
                    <>
                      <th className="px-5 py-3">GRN Reference</th>
                      <th className="px-5 py-3">Purchase Order</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Status</th>
                    </>
                  )}

                  {activeTab === "invoices" && (
                    <>
                      <th className="px-5 py-3">Invoice Number</th>
                      <th className="px-5 py-3">Supplier</th>
                      <th className="px-5 py-3">Total</th>
                      <th className="px-5 py-3">Paid</th>
                      <th className="px-5 py-3">Outstanding</th>
                      <th className="px-5 py-3">Due Date</th>
                    </>
                  )}

                  {activeTab === "payments" && (
                    <>
                      <th className="px-5 py-3">Reference</th>
                      <th className="px-5 py-3">Supplier</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Method</th>
                      <th className="px-5 py-3">Date</th>
                    </>
                  )}

                  {activeTab === "returns" && (
                    <>
                      <th className="px-5 py-3">Return Reference</th>
                      <th className="px-5 py-3">Supplier</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Status</th>
                    </>
                  )}

                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredRecords.map((record, index) => (
                  <tr key={record.id || index} className="hover:bg-gray-50">
                    {activeTab === "suppliers" && (
                      <>
                        <td className="px-5 py-4 font-medium">
                          {record.name || "-"}
                        </td>
                        <td className="px-5 py-4">
                          {record.contact_person || "-"}
                        </td>
                        <td className="px-5 py-4">{record.phone_number || "-"}</td>
                        <td className="px-5 py-4">{record.email || "-"}</td>
                      </>
                    )}

                    {activeTab === "orders" && (
                      <>
                        <td className="px-5 py-4 font-medium">
                          {record.reference || record.order_number || record.id}
                        </td>
                        <td className="px-5 py-4">
                          {record.supplier_name || record.supplier?.name || "-"}
                        </td>
                        <td className="px-5 py-4">
                          {date(record.order_date || record.created_at)}
                        </td>
                        <td className="px-5 py-4">
                          {money(record.grand_total)}
                        </td>
                        <td className="px-5 py-4">{record.status || "-"}</td>
                      </>
                    )}

                    {activeTab === "grns" && (
                      <>
                        <td className="px-5 py-4 font-medium">
                          {record.reference || record.grn_number || record.id}
                        </td>
                        <td className="px-5 py-4">
                          {record.purchase_order_reference ||
                            record.purchase_order?.reference || "-"}
                        </td>
                        <td className="px-5 py-4">
                          {date(record.received_at || record.created_at)}
                        </td>
                        <td className="px-5 py-4">{record.status || "-"}</td>
                      </>
                    )}

                    {activeTab === "invoices" && (
                      <>
                        <td className="px-5 py-4 font-medium">
                          {record.invoice_number || record.reference || record.id}
                        </td>
                        <td className="px-5 py-4">
                          {record.supplier_name || record.supplier?.name || "-"}
                        </td>
                        <td className="px-5 py-4">
                          {money(record.total_amount || record.amount)}
                        </td>
                        <td className="px-5 py-4">
                          {money(record.amount_paid)}
                        </td>
                        <td className="px-5 py-4 font-medium">
                          {money(record.outstanding_balance)}
                        </td>
                        <td className="px-5 py-4">{date(record.due_date)}</td>
                      </>
                    )}

                    {activeTab === "payments" && (
                      <>
                        <td className="px-5 py-4 font-medium">
                          {record.reference || record.transaction_reference || record.id}
                        </td>
                        <td className="px-5 py-4">
                          {record.supplier_name || record.supplier?.name || "-"}
                        </td>
                        <td className="px-5 py-4">
                          {money(record.amount)}
                        </td>
                        <td className="px-5 py-4">
                          {record.payment_method || record.method || "-"}
                        </td>
                        <td className="px-5 py-4">
                          {date(record.payment_date || record.created_at)}
                        </td>
                      </>
                    )}

                    {activeTab === "returns" && (
                      <>
                        <td className="px-5 py-4 font-medium">
                          {record.reference || record.return_number || record.id}
                        </td>
                        <td className="px-5 py-4">
                          {record.supplier_name || record.supplier?.name || "-"}
                        </td>
                        <td className="px-5 py-4">
                          {date(record.created_at || record.return_date)}
                        </td>
                        <td className="px-5 py-4">{record.status || "-"}</td>
                      </>
                    )}

                    <td className="px-5 py-4 text-right">
                      {renderActions(record)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            <div className="space-y-3 p-3 xl:hidden">
            {filteredRecords.map((record, index) => {
              const reference =
                activeTab === "suppliers"
                  ? record.name
                  : activeTab === "orders" || activeTab === "grns" || activeTab === "returns"
                    ? record.reference || record.id
                    : activeTab === "invoices"
                      ? record.invoice_number || record.id
                      : record.reference || record.id;

              return (
                <article
                  key={record.id || index}
                  className="space-y-3 rounded-xl border p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="break-all font-semibold text-gray-900">
                      {reference}
                    </h3>
                    {record.status && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {record.status.replaceAll("_", " ")}
                      </span>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    {activeTab === "suppliers" && (
                      <>
                        <div>
                          <dt className="text-xs text-gray-500">Contact</dt>
                          <dd>{record.contact_person || "-"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Phone</dt>
                          <dd>{record.phone_number || "-"}</dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt className="text-xs text-gray-500">Email</dt>
                          <dd className="break-all">{record.email || "-"}</dd>
                        </div>
                      </>
                    )}
                    {activeTab === "orders" && (
                      <>
                        <div>
                          <dt className="text-xs text-gray-500">Supplier</dt>
                          <dd>{record.supplier_name || "-"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Date</dt>
                          <dd>{date(record.order_date || record.created_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Total</dt>
                          <dd className="font-medium">{money(record.grand_total)}</dd>
                        </div>
                      </>
                    )}
                    {activeTab === "grns" && (
                      <>
                        <div>
                          <dt className="text-xs text-gray-500">Purchase order</dt>
                          <dd>{record.purchase_order_reference || "-"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Date received</dt>
                          <dd>{date(record.received_at || record.created_at)}</dd>
                        </div>
                      </>
                    )}
                    {activeTab === "invoices" && (
                      <>
                        <div>
                          <dt className="text-xs text-gray-500">Supplier</dt>
                          <dd>{record.supplier_name || "-"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Due date</dt>
                          <dd>{date(record.due_date)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Total</dt>
                          <dd>{money(record.total_amount)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Outstanding</dt>
                          <dd className="font-medium">{money(record.outstanding_balance)}</dd>
                        </div>
                      </>
                    )}
                    {activeTab === "payments" && (
                      <>
                        <div>
                          <dt className="text-xs text-gray-500">Supplier</dt>
                          <dd>{record.supplier_name || "-"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Amount</dt>
                          <dd className="font-medium">{money(record.amount)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Method</dt>
                          <dd>{record.payment_method || "-"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Date</dt>
                          <dd>{date(record.payment_date || record.created_at)}</dd>
                        </div>
                      </>
                    )}
                    {activeTab === "returns" && (
                      <>
                        <div>
                          <dt className="text-xs text-gray-500">Supplier</dt>
                          <dd>{record.supplier_name || "-"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Date</dt>
                          <dd>{date(record.created_at || record.return_date)}</dd>
                        </div>
                      </>
                    )}
                  </dl>

                  <div className="border-t pt-3">
                    {renderActions(record, true)}
                  </div>
                </article>
              );
            })}
            </div>
          </>
        )}
      </div>

      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="font-bold">Record Details</h2>
              <button
                onClick={() => setSelectedRecord(null)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 p-5">
              {Object.entries(selectedRecord).map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-1 gap-1 border-b pb-3 sm:grid-cols-3"
                >
                  <p className="text-sm font-medium capitalize text-gray-500">
                    {key.replaceAll("_", " ")}
                  </p>
                  <p className="break-words text-sm sm:col-span-2">
                    {value === null || value === undefined
                      ? "-"
                      : typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="text-lg font-bold">
                {activeTab === "suppliers"
                  ? "Add Supplier"
                  : activeTab === "orders"
                    ? "Create Purchase Order"
                    : activeTab === "grns"
                      ? "Receive Goods"
                      : activeTab === "invoices"
                        ? "Record Supplier Invoice"
                        : activeTab === "payments"
                          ? "Record Supplier Payment"
                          : "Create Supplier Return"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={
                activeTab === "suppliers"
                  ? saveSupplier
                  : activeTab === "orders"
                    ? savePurchaseOrder
                    : activeTab === "grns"
                      ? saveGoodsReceived
                      : activeTab === "invoices"
                        ? saveInvoice
                        : activeTab === "payments"
                          ? savePayment
                          : saveSupplierReturn
              }
              className="space-y-5 p-5"
            >
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {activeTab === "suppliers" && (
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ["name", "Supplier Name", "text", true],
                    ["contact_person", "Contact Person", "text"],
                    ["phone_number", "Phone Number", "tel", true],
                    ["email", "Email Address", "email"],
                    ["kra_pin", "KRA PIN", "text"],
                    ["city", "City", "text"],
                  ].map(([field, label, type, required]) => (
                    <FormField key={field} label={label}>
                      <input
                        required={Boolean(required)}
                        type={type}
                        value={form[field] || ""}
                        onChange={(event) => updateForm(field, event.target.value)}
                        className={inputClass}
                      />
                    </FormField>
                  ))}
                  <div className="md:col-span-2">
                    <FormField label="Address">
                      <textarea
                        rows={2}
                        value={form.address || ""}
                        onChange={(event) => updateForm("address", event.target.value)}
                        className={inputClass}
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {activeTab === "orders" && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Supplier">
                      <select required value={form.supplier || ""} onChange={(event) => updateForm("supplier", event.target.value)} className={inputClass}>
                        <option value="">Select supplier</option>
                        {suppliers.filter((item) => item.is_active).map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Deliver to">
                      <select required value={form.destination || ""} onChange={(event) => updateForm("destination", event.target.value)} className={inputClass}>
                        <option value="">Select stock location</option>
                        {locations.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Expected delivery date">
                      <input type="date" value={form.expected_delivery_date || ""} onChange={(event) => updateForm("expected_delivery_date", event.target.value)} className={inputClass} />
                    </FormField>
                    <FormField label="Notes">
                      <input value={form.notes || ""} onChange={(event) => updateForm("notes", event.target.value)} className={inputClass} />
                    </FormField>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Products</h3>
                      <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="rounded-lg border px-3 py-2 text-sm">
                        <Plus className="mr-1 inline" size={15} /> Add product
                      </button>
                    </div>
                    {lines.map((line, index) => (
                      <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-6">
                        <div className="md:col-span-2">
                          <FormField label="Product">
                            <select required value={line.product} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, product: event.target.value } : item))} className={inputClass}>
                              <option value="">Select product</option>
                              {products.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}
                            </select>
                          </FormField>
                        </div>
                        {[
                          ["quantity", "Quantity"],
                          ["unit_cost", "Unit cost"],
                          ["discount_amount", "Discount"],
                          ["tax_amount", "Tax"],
                        ].map(([field, label]) => (
                          <FormField key={field} label={label}>
                            <input required={field === "quantity" || field === "unit_cost"} min={field === "quantity" ? "0.001" : "0"} step={field === "quantity" ? "0.001" : "0.01"} type="number" value={line[field]} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, [field]: event.target.value } : item))} className={inputClass} />
                          </FormField>
                        ))}
                        {lines.length > 1 && (
                          <button type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="text-sm text-red-600 md:col-span-6 md:text-right">Remove product</button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activeTab === "grns" && (
                <>
                  <FormField label="Approved purchase order">
                    <select required value={form.purchase_order || ""} onChange={(event) => updateForm("purchase_order", event.target.value)} className={inputClass}>
                      <option value="">Select purchase order</option>
                      {orders.filter((item) => ["APPROVED", "PARTIALLY_RECEIVED"].includes(item.status)).map((item) => (
                        <option key={item.id} value={item.id}>{item.reference} — {item.supplier_name}</option>
                      ))}
                    </select>
                  </FormField>
                  {selectedOrder && (
                    <div className="space-y-2 rounded-lg border p-4">
                      <h3 className="font-semibold">Received quantities</h3>
                      {selectedOrder.items.filter((item) => Number(item.remaining_quantity) > 0).map((item) => (
                        <FormField key={item.id} label={`${item.product_name} — ${item.remaining_quantity} remaining`}>
                          <input min="0" max={item.remaining_quantity} step="0.001" type="number" value={form[`receive_${item.id}`] || ""} onChange={(event) => updateForm(`receive_${item.id}`, event.target.value)} className={inputClass} />
                        </FormField>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Supplier delivery note">
                      <input value={form.supplier_delivery_note || ""} onChange={(event) => updateForm("supplier_delivery_note", event.target.value)} className={inputClass} />
                    </FormField>
                    <FormField label="Supplier invoice number (optional)">
                      <input value={form.supplier_invoice_number || ""} onChange={(event) => updateForm("supplier_invoice_number", event.target.value)} className={inputClass} />
                    </FormField>
                  </div>
                </>
              )}

              {activeTab === "invoices" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Supplier">
                    <select required value={form.supplier || ""} onChange={(event) => setForm((previous) => ({
                      ...previous,
                      supplier: event.target.value,
                      goods_received_note: "",
                    }))} className={inputClass}>
                      <option value="">Select supplier</option>
                      {suppliers.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Posted goods receipt (optional)">
                    <select value={form.goods_received_note || ""} onChange={(event) => updateForm("goods_received_note", event.target.value)} className={inputClass}>
                      <option value="">No goods receipt linked</option>
                      {grns.filter((item) => item.status === "POSTED" && String(orders.find((order) => String(order.id) === String(item.purchase_order))?.supplier) === String(form.supplier)).map((item) => <option key={item.id} value={item.id}>{item.reference}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Invoice number">
                    <input required value={form.invoice_number || ""} onChange={(event) => updateForm("invoice_number", event.target.value)} className={inputClass} />
                  </FormField>
                  <FormField label="Invoice date">
                    <input required type="date" value={form.invoice_date || today()} onChange={(event) => updateForm("invoice_date", event.target.value)} className={inputClass} />
                  </FormField>
                  <FormField label="Due date">
                    <input type="date" value={form.due_date || ""} onChange={(event) => updateForm("due_date", event.target.value)} className={inputClass} />
                  </FormField>
                  {[
                    ["subtotal", "Subtotal"],
                    ["tax_amount", "Tax"],
                    ["discount_amount", "Discount"],
                  ].map(([field, label]) => (
                    <FormField key={field} label={label}>
                      <input required={field === "subtotal"} min="0" step="0.01" type="number" value={form[field] || ""} onChange={(event) => updateForm(field, event.target.value)} className={inputClass} />
                    </FormField>
                  ))}
                  <p className="self-end pb-2 text-sm font-semibold">Total: {money(Number(form.subtotal || 0) + Number(form.tax_amount || 0) - Number(form.discount_amount || 0))}</p>
                </div>
              )}

              {activeTab === "payments" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Unpaid invoice">
                    <select required value={form.supplier_invoice || ""} onChange={(event) => updateForm("supplier_invoice", event.target.value)} className={inputClass}>
                      <option value="">Select invoice</option>
                      {invoices.filter((item) => item.status === "POSTED" && Number(item.outstanding_balance) > 0).map((item) => (
                        <option key={item.id} value={item.id}>{item.invoice_number} — {item.supplier_name} — {money(item.outstanding_balance)} due</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Amount">
                    <input required min="0.01" max={selectedInvoice?.outstanding_balance} step="0.01" type="number" value={form.amount || ""} onChange={(event) => updateForm("amount", event.target.value)} className={inputClass} />
                  </FormField>
                  <FormField label="Payment method">
                    <select required value={form.payment_method || "CASH"} onChange={(event) => updateForm("payment_method", event.target.value)} className={inputClass}>
                      {["CASH", "MPESA", "BANK", "CHEQUE", "OTHER"].map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Payment date">
                    <input required type="date" value={form.payment_date || today()} onChange={(event) => updateForm("payment_date", event.target.value)} className={inputClass} />
                  </FormField>
                  <FormField label="Transaction/reference number">
                    <input value={form.payment_reference || ""} onChange={(event) => updateForm("payment_reference", event.target.value)} className={inputClass} />
                  </FormField>
                  {selectedInvoice && (
                    <p className="self-end pb-2 text-sm text-gray-600">
                      Supplier: {selectedInvoice.supplier_name}
                    </p>
                  )}
                </div>
              )}

              {activeTab === "returns" && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Posted goods receipt">
                      <select required value={form.original_grn || ""} onChange={(event) => updateForm("original_grn", event.target.value)} className={inputClass}>
                        <option value="">Select goods receipt</option>
                        {grns.filter((item) => item.status === "POSTED").map((item) => <option key={item.id} value={item.id}>{item.reference} — {item.supplier_name}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Return reason">
                      <select required value={form.reason || "DEFECTIVE"} onChange={(event) => updateForm("reason", event.target.value)} className={inputClass}>
                        {[
                          ["DEFECTIVE", "Defective product"],
                          ["DAMAGED", "Damaged product"],
                          ["WRONG_ITEM", "Wrong product delivered"],
                          ["EXCESS", "Excess quantity"],
                          ["WARRANTY", "Warranty return"],
                          ["OTHER", "Other"],
                        ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Resolution">
                      <select value={form.resolution || "PENDING"} onChange={(event) => updateForm("resolution", event.target.value)} className={inputClass}>
                        {["PENDING", "REFUND", "REPLACEMENT", "CREDIT_NOTE"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Supplier reference">
                      <input value={form.supplier_reference || ""} onChange={(event) => updateForm("supplier_reference", event.target.value)} className={inputClass} />
                    </FormField>
                  </div>
                  {selectedGrn && (
                    <div className="space-y-2 rounded-lg border p-4">
                      <h3 className="font-semibold">Items to return</h3>
                      {selectedGrn.items.map((item) => (
                        <FormField key={item.id} label={`${item.product_name} — ${item.quantity_received} received`}>
                          <input min="0" max={item.quantity_received} step="0.001" type="number" value={form[`return_${item.id}`] || ""} onChange={(event) => updateForm(`return_${item.id}`, event.target.value)} className={inputClass} />
                        </FormField>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab !== "suppliers" && (
                <FormField label="Notes">
                  <textarea rows={2} value={form.notes || ""} onChange={(event) => updateForm("notes", event.target.value)} className={inputClass} />
                </FormField>
              )}

              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : activeTab === "suppliers"
                      ? "Save Supplier"
                      : activeTab === "orders"
                        ? "Create and Submit Order"
                        : activeTab === "grns"
                          ? "Receive and Post Stock"
                          : activeTab === "invoices"
                            ? "Create and Post Invoice"
                            : activeTab === "payments"
                              ? "Record and Post Payment"
                              : "Create and Post Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
