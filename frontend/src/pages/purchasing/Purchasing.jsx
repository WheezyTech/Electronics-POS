
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
  orders: "/purchases/purchase-orders/",
  grns: "/purchases/grns/",
  invoices: "/purchases/invoices/",
  payments: "/purchases/payments/",
  returns: "/purchases/supplier-returns/",
};

export default function Purchasing() {
  const [activeTab, setActiveTab] = useState("suppliers");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [form, setForm] = useState({});

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
    loadRecords();
  }, [activeTab]);

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
    setForm({});
    setShowForm(true);
  };

  const saveSupplier = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      await api.post(endpoints.suppliers, {
        name: form.name,
        contact_person: form.contact_person || "",
        phone: form.phone || "",
        email: form.email || "",
        address: form.address || "",
        kra_pin: form.kra_pin || "",
        notes: form.notes || "",
      });

      setShowForm(false);
      setForm({});
      await loadRecords();
    } catch (err) {
      const data = err.response?.data;
      setError(
        typeof data === "object"
          ? Object.entries(data)
              .map(([key, value]) =>
                `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
              )
              .join(" | ")
          : "Unable to save supplier."
      );
    } finally {
      setSaving(false);
    }
  };

  const title = tabs.find((tab) => tab.id === activeTab)?.label;

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

            {activeTab === "suppliers" && (
              <button
                onClick={openCreateForm}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                <Plus size={16} />
                Add Supplier
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
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
          <div className="overflow-x-auto">
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

                  <th className="px-5 py-3 text-right">Details</th>
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
                        <td className="px-5 py-4">{record.phone || "-"}</td>
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
                          {money(record.total_amount)}
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
                          {money(record.outstanding_amount)}
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
                      <button
                        onClick={() => setSelectedRecord(record)}
                        className="rounded-lg border p-2 hover:bg-gray-100"
                        title="View details"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="text-lg font-bold">Add Supplier</h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveSupplier} className="space-y-4 p-5">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {[
                ["name", "Supplier Name", true],
                ["contact_person", "Contact Person"],
                ["phone", "Phone Number"],
                ["email", "Email Address"],
                ["kra_pin", "KRA PIN"],
                ["address", "Address"],
              ].map(([field, label, required]) => (
                <label key={field} className="block">
                  <span className="mb-1 block text-sm font-medium">
                    {label} {required && "*"}
                  </span>
                  <input
                    required={Boolean(required)}
                    type={field === "email" ? "email" : "text"}
                    value={form[field] || ""}
                    onChange={(e) =>
                      setForm({ ...form, [field]: e.target.value })
                    }
                    className="w-full rounded-lg border p-2.5 text-sm"
                  />
                </label>
              ))}

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Notes</span>
                <textarea
                  rows={3}
                  value={form.notes || ""}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  className="w-full rounded-lg border p-2.5 text-sm"
                />
              </label>

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
                  {saving ? "Saving..." : "Save Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
