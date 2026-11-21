
import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import {
  Search, RefreshCw, Plus, Eye, X, RotateCcw,
  CheckCircle, Ban, Trash2
} from "lucide-react";

const money = (value) =>
  `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const dateTime = (value) =>
  value ? new Date(value).toLocaleString("en-KE") : "-";

const paymentMethodLabel = (method) => ({
  CASH: "Cash",
  MPESA: "M-Pesa",
  BANK: "Bank",
  CARD: "Card",
  OTHER: "Other"
}[method] || method || "Unknown");

const returnReasonLabel = (reason) => ({
  DEFECTIVE: "Defective product",
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  CUSTOMER_CHANGED_MIND: "Customer changed mind",
  OTHER: "Other"
}[reason] || reason || "Not specified");

const listData = (data) =>
  Array.isArray(data) ? data : data?.results || data?.data || [];

function StatusBadge({ status }) {
  const styles = {
    COMPLETED: "bg-green-100 text-green-700",
    DRAFT: "bg-yellow-100 text-yellow-700",
    CANCELLED: "bg-red-100 text-red-700"
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {status === "DRAFT" ? "PENDING APPROVAL" : status || "UNKNOWN"}
    </span>
  );
}

export default function Returns() {
  const { user } = useAuth();
  const canApproveReturns =
    user?.is_superuser ||
    ["ADMINISTRATOR", "STORE_MANAGER"].includes(user?.role);
  const canDeleteReturns =
    user?.is_superuser || user?.role === "ADMINISTRATOR";

  const [returns, setReturns] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saleSearch, setSaleSearch] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [returnItems, setReturnItems] = useState([]);

  const [refundMethod, setRefundMethod] = useState("");
  const [refundReference, setRefundReference] = useState("");

  const loadReturns = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/sales/returns/", {
        params: statusFilter ? { status: statusFilter } : {}
      });

      setReturns(listData(response.data));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to load sales returns."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedSales = async () => {
    try {
      const response = await api.get("/sales/sales/", {
        params: { status: "COMPLETED" }
      });

      setSales(listData(response.data));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to load completed sales."
      );
    }
  };

  useEffect(() => {
    loadReturns();
  }, [statusFilter]);

  const filteredReturns = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return returns;

    return returns.filter((item) =>
      [
        item.reference,
        item.sale_reference,
        item.reason,
        item.status
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [returns, search]);

  const filteredSales = useMemo(() => {
    const term = saleSearch.trim().toLowerCase();

    return sales.filter((sale) => {
      const alreadyReturned = returns.some(
        (item) =>
          String(item.sale) === String(sale.id) &&
          item.status !== "CANCELLED"
      );

      const matches =
        !term ||
        [
          sale.reference,
          sale.customer_name,
          sale.customer_phone
        ].some((value) =>
          String(value || "").toLowerCase().includes(term)
        );

      return !alreadyReturned && matches;
    });
  }, [sales, saleSearch, returns]);

  const resetCreateForm = () => {
    setSelectedSale(null);
    setReason("");
    setNotes("");
    setReturnItems([]);
    setSaleSearch("");
    setShowCreate(false);
  };

  const startCreate = async () => {
    setError("");
    setShowCreate(true);
    setSelectedSale(null);
    setReturnItems([]);
    setReason("");
    setNotes("");

    await loadCompletedSales();
  };

  const chooseSale = (sale) => {
    setSelectedSale(sale);

    setReturnItems(
      (sale.items || []).map((item) => ({
        sale_item: item.id,
        product_name: item.product_name || item.product?.name || "Product",
        sku: item.sku || "",
        sold_quantity: Number(item.quantity),
        quantity: 0,
        unit_price: Number(item.unit_price),
        refund_amount: 0
      }))
    );
  };

  const updateQuantity = (index, value) => {
    const quantity = Math.max(0, Number(value || 0));

    setReturnItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const safeQuantity = Math.min(quantity, item.sold_quantity);

        return {
          ...item,
          quantity: safeQuantity,
          refund_amount: safeQuantity * item.unit_price
        };
      })
    );
  };

  const estimatedRefund = returnItems.reduce(
    (sum, item) => sum + Number(item.refund_amount || 0),
    0
  );

  const createReturn = async () => {
    if (!selectedSale) {
      setError("Select a completed sale.");
      return;
    }

    if (!reason) {
      setError("Select the reason for the return.");
      return;
    }

    const selectedItems = returnItems.filter(
      (item) => Number(item.quantity) > 0
    );

    if (!selectedItems.length) {
      setError("Select at least one product and return quantity.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await api.post("/sales/returns/", {
        sale: selectedSale.id,
        reason: reason.trim(),
        notes: notes.trim()
      });

      const returnId = response.data?.id;
      if (returnId === undefined || returnId === null) {
        throw new Error(
          "The return was created, but the server did not return its ID. Check return history before retrying."
        );
      }

      for (const item of selectedItems) {
        await api.post(`/sales/returns/${returnId}/items/`, {
          sale_item: item.sale_item,
          quantity: item.quantity
        });
      }

      resetCreateForm();
      await loadReturns();

      await openReturn({ id: returnId });
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail ||
        data?.message ||
        err.message ||
        JSON.stringify(data || "Unable to create return.")
      );
    } finally {
      setSaving(false);
    }
  };

  const openReturn = async (item) => {
    setDetailLoading(true);
    setSelectedReturn(null);
    setError("");
    setRefundMethod("");
    setRefundReference("");

    try {
      const response = await api.get(`/sales/returns/${item.id}/`);
      setSelectedReturn(response.data);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to load return details."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const completeReturn = async () => {
    if (!selectedReturn) return;

    if (!canApproveReturns) {
      setError("Only a store manager or administrator can approve returns.");
      return;
    }

    if (!refundMethod) {
      setError("Select the account used to pay the refund.");
      return;
    }

    const amount = Number(selectedReturn.refund_amount || 0);

    if (!selectedReturn.items?.length || amount <= 0) {
      setError(
        "This draft has no saved return items or refundable amount. Cancel it and create a new return, selecting a quantity for at least one item."
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await api.post(
        `/sales/returns/${selectedReturn.id}/complete/`,
        {
          refund_payments: [
            {
              amount: amount.toFixed(2),
              payment_method: refundMethod,
              transaction_reference: refundReference.trim()
            }
          ]
        }
      );

      setSelectedReturn(response.data);
      await loadReturns();
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail ||
        data?.message ||
        JSON.stringify(data || "Unable to complete return.")
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelReturn = async () => {
    if (!selectedReturn) return;

    if (!window.confirm("Are you sure you want to cancel this return?")) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api.post(
        `/sales/returns/${selectedReturn.id}/cancel/`
      );

      setSelectedReturn(null);
      await loadReturns();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to cancel return."
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteReturn = async () => {
    if (!selectedReturn) return;

    const confirmed = window.confirm(
      `Delete ${selectedReturn.reference} and its return items? Completed returns cannot be deleted.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");

    try {
      await api.delete(`/sales/returns/${selectedReturn.id}/`);
      setSelectedReturn(null);
      await loadReturns();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to delete this return."
      );
    } finally {
      setSaving(false);
    }
  };

  const totalRefunded = returns
    .filter((item) => item.status === "COMPLETED")
    .reduce(
      (sum, item) => sum + Number(item.refund_amount || 0),
      0
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Sales Returns
          </h1>
          <p className="text-sm text-gray-500">
            Manage returned products and customer refunds.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadReturns}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={17} />
            New Return
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total return records</p>
          <p className="mt-2 text-2xl font-bold">{returns.length}</p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Completed returns</p>
          <p className="mt-2 text-2xl font-bold">
            {returns.filter((item) => item.status === "COMPLETED").length}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total refunds processed</p>
          <p className="mt-2 text-xl font-bold">{money(totalRefunded)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search return reference, sale reference or reason..."
            className="w-full rounded-lg border py-2.5 pl-10 pr-3 outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border px-3 py-2.5 outline-none"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="responsive-table-wrap overflow-x-auto">
          <table className="responsive-table w-full min-w-[750px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-4">Return reference</th>
                <th className="px-5 py-4">Original sale</th>
                <th className="px-5 py-4">Reason</th>
                <th className="px-5 py-4">Refund</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    Loading returns...
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    No return records found.
                  </td>
                </tr>
              ) : (
                filteredReturns.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td data-label="Return reference" className="px-5 py-4 font-semibold text-blue-700">
                      {item.reference}
                    </td>
                    <td data-label="Original sale" className="px-5 py-4">{item.sale_reference || item.sale}</td>
                    <td data-label="Reason" className="px-5 py-4">{item.reason}</td>
                    <td data-label="Refund" className="px-5 py-4 font-semibold">{money(item.refund_amount)}</td>
                    <td data-label="Date" className="px-5 py-4 whitespace-nowrap">{dateTime(item.created_at)}</td>
                    <td data-label="Status" className="px-5 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td data-mobile-action className="px-5 py-4 text-right">
                      <button
                        onClick={() => openReturn(item)}
                        className="rounded-lg border p-2 hover:bg-gray-100"
                        title="View return"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE RETURN */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white p-5">
              <div>
                <h2 className="text-lg font-bold">Create Sales Return</h2>
                <p className="text-sm text-gray-500">
                  Select the original completed sale.
                </p>
              </div>
              <button onClick={resetCreateForm} className="rounded-lg p-2 hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {!selectedSale ? (
                <>
                  <input
                    value={saleSearch}
                    onChange={(event) => setSaleSearch(event.target.value)}
                    placeholder="Search receipt number, customer or phone..."
                    className="w-full rounded-lg border px-4 py-3 outline-none focus:border-blue-500"
                  />

                  <div className="max-h-80 overflow-y-auto rounded-lg border">
                    {filteredSales.length === 0 ? (
                      <p className="p-6 text-center text-sm text-gray-500">
                        No eligible completed sales found.
                      </p>
                    ) : (
                      filteredSales.map((sale) => (
                        <button
                          key={sale.id}
                          onClick={() => chooseSale(sale)}
                          className="flex w-full flex-col justify-between gap-2 border-b p-4 text-left hover:bg-blue-50 sm:flex-row sm:items-center"
                        >
                          <div>
                            <p className="font-semibold">{sale.reference}</p>
                            <p className="text-sm text-gray-500">
                              {sale.customer_name || "Walk-in customer"} · {sale.customer_phone || "No phone"}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="font-semibold">{money(sale.total_amount)}</p>
                            <p className="text-xs text-gray-500">{dateTime(sale.completed_at || sale.created_at)}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col justify-between gap-2 rounded-lg bg-blue-50 p-4 sm:flex-row">
                    <div>
                      <p className="text-xs text-gray-500">Selected sale</p>
                      <p className="font-bold">{selectedSale.reference}</p>
                      <p className="text-sm text-gray-600">
                        {selectedSale.customer_name || "Walk-in customer"}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedSale(null)}
                      className="text-sm font-semibold text-blue-700"
                    >
                      Change sale
                    </button>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Reason for return
                    </label>
                    <select
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
                    >
                      <option value="">Select a reason</option>
                      <option value="DEFECTIVE">Defective product</option>
                      <option value="DAMAGED">Damaged</option>
                      <option value="WRONG_ITEM">Wrong item</option>
                      <option value="CUSTOMER_CHANGED_MIND">
                        Customer changed mind
                      </option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={2}
                      placeholder="Describe the issue or add other return details..."
                      className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <h3 className="mb-3 font-semibold">Select returned products</h3>
                    <div className="responsive-table-wrap overflow-x-auto rounded-lg border">
                      <table className="responsive-table w-full min-w-[650px] text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="p-3 text-left">Product</th>
                            <th className="p-3 text-right">Sold qty</th>
                            <th className="p-3 text-right">Unit price</th>
                            <th className="p-3 text-right">Return qty</th>
                            <th className="p-3 text-right">Refund</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {returnItems.map((item, index) => (
                            <tr key={item.sale_item}>
                              <td data-label="Product" className="p-3">
                                <p className="font-medium">{item.product_name}</p>
                                <p className="text-xs text-gray-500">{item.sku}</p>
                              </td>
                              <td data-label="Sold quantity" className="p-3 text-right">{item.sold_quantity}</td>
                              <td data-label="Unit price" className="p-3 text-right">{money(item.unit_price)}</td>
                              <td data-label="Return quantity" className="p-3 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.sold_quantity}
                                  step="1"
                                  value={item.quantity}
                                  onChange={(event) => updateQuantity(index, event.target.value)}
                                  className="w-20 rounded border px-2 py-1 text-right"
                                />
                              </td>
                              <td data-label="Refund" className="p-3 text-right font-semibold">
                                {money(item.refund_amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-between rounded-lg bg-gray-50 p-4">
                    <span className="font-semibold">Estimated refund</span>
                    <span className="text-lg font-bold">{money(estimatedRefund)}</span>
                  </div>

                  <div className="flex justify-end gap-2 border-t pt-4">
                    <button
                      onClick={resetCreateForm}
                      className="rounded-lg border px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createReturn}
                      disabled={saving}
                      className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {saving ? "Creating..." : "Create Draft Return"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RETURN DETAILS */}
      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white p-5">Loading return...</div>
        </div>
      )}

      {selectedReturn && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white p-5">
              <div>
                <h2 className="text-lg font-bold">Return Details</h2>
                <p className="text-sm text-gray-500">{selectedReturn.reference}</p>
              </div>
              <button
                onClick={() => setSelectedReturn(null)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {canDeleteReturns &&
                selectedReturn.status !== "COMPLETED" && (
                  <div className="flex justify-end">
                    <button
                      onClick={deleteReturn}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                      Delete Return
                    </button>
                  </div>
                )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Original sale</p>
                  <p className="font-semibold">{selectedReturn.sale_reference || selectedReturn.sale}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date created</p>
                  <p className="font-medium">{dateTime(selectedReturn.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Reason</p>
                  <p className="font-medium">{selectedReturn.reason}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <StatusBadge status={selectedReturn.status} />
                </div>
              </div>

              <div>
                <h3 className="mb-3 font-semibold">Returned items</h3>
                <div className="responsive-table-wrap overflow-x-auto rounded-lg border">
                  <table className="responsive-table w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-3 text-left">Product</th>
                        <th className="p-3 text-right">Quantity</th>
                        <th className="p-3 text-right">Unit price</th>
                        <th className="p-3 text-right">Refund</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(selectedReturn.items || []).map((item) => (
                        <tr key={item.id}>
                          <td data-label="Product" className="p-3">{item.product_name}</td>
                          <td data-label="Quantity" className="p-3 text-right">{item.quantity}</td>
                          <td data-label="Unit price" className="p-3 text-right">{money(item.unit_price)}</td>
                          <td data-label="Refund" className="p-3 text-right font-semibold">{money(item.refund_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between rounded-lg bg-gray-50 p-4">
                <span className="font-semibold">Total refund</span>
                <span className="text-lg font-bold">{money(selectedReturn.refund_amount)}</span>
              </div>

              {selectedReturn.status === "DRAFT" &&
                (!selectedReturn.items?.length ||
                  Number(selectedReturn.refund_amount || 0) <= 0) && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    This draft has no saved return items. Cancel it, then create a new return and select a quantity for at least one item.
                  </p>
                )}

              {selectedReturn.status === "DRAFT" && canApproveReturns && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold">Approve return and process refund</h3>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Refund method
                      </label>
                      <select
                        value={refundMethod}
                        onChange={(event) => setRefundMethod(event.target.value)}
                        className="w-full rounded-lg border px-3 py-2.5"
                      >
                        <option value="">Select refund account</option>
                        <option value="CASH">Cash</option>
                        <option value="MPESA">M-Pesa</option>
                        <option value="BANK">Bank</option>
                        <option value="CARD">Card</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Transaction reference
                      </label>
                      <input
                        value={refundReference}
                        onChange={(event) => setRefundReference(event.target.value)}
                        placeholder="Optional reference"
                        className="w-full rounded-lg border px-3 py-2.5"
                      />
                    </div>
                  </div>

                  <p className="text-sm text-gray-500">
                    Approval records the refund against the selected payment method and processes the stock return.
                  </p>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={cancelReturn}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Ban size={16} />
                      Cancel Return
                    </button>

                    <button
                      onClick={completeReturn}
                      disabled={
                        saving ||
                        !selectedReturn.items?.length ||
                        Number(selectedReturn.refund_amount || 0) <= 0
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle size={16} />
                      {saving ? "Processing..." : "Approve and record refund"}
                    </button>
                  </div>
                </div>
              )}

              {selectedReturn.status === "DRAFT" && !canApproveReturns && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="text-sm text-gray-600">
                    This return is waiting for a store manager to approve it.
                  </p>
                  <button
                    onClick={cancelReturn}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Ban size={16} />
                    Cancel Return
                  </button>
                </div>
              )}

              {selectedReturn.status !== "DRAFT" && (
                <div className="border-t pt-4 text-sm text-gray-500">
                  This return is {selectedReturn.status?.toLowerCase()} and can no longer be edited.
                </div>
              )}

              {selectedReturn.status === "COMPLETED" && (
                <div className="no-print flex justify-end border-t pt-4">
                  <button
                    onClick={() => window.print()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Print Refund Receipt
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>

          {selectedReturn.status === "COMPLETED" && (
            <div className="print-only mx-auto mt-6 max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-center">
              <h2 className="text-2xl font-extrabold tracking-wide">
                ELECTRONICS POS
              </h2>
              <p className="mt-1 text-sm text-slate-500">Refund Receipt</p>
              <div className="my-4 border-t border-dashed border-slate-400" />
            </div>

            <div className="space-y-1 text-sm">
              <p><strong>Refund No:</strong> {selectedReturn.reference}</p>
              <p><strong>Original sale:</strong> {selectedReturn.sale_reference || selectedReturn.sale}</p>
              <p><strong>Date:</strong> {dateTime(selectedReturn.completed_at || selectedReturn.created_at)}</p>
              <p><strong>Customer:</strong> {selectedReturn.customer_name || "Walk-in customer"}</p>
              <p><strong>Phone:</strong> {selectedReturn.customer_phone || "-"}</p>
              <p><strong>Reason:</strong> {returnReasonLabel(selectedReturn.reason)}</p>
            </div>

            <div className="my-4 border-t border-dashed border-slate-400" />

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Refund</th>
                </tr>
              </thead>
              <tbody>
                {(selectedReturn.items || []).map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2">{item.product_name}</td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-right">{money(item.refund_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="my-4 border-t border-dashed border-slate-400" />

            <div className="flex justify-between text-lg font-bold">
              <span>TOTAL REFUNDED</span>
              <span>{money(selectedReturn.refund_amount)}</span>
            </div>

            <div className="my-4 border-t border-dashed border-slate-400" />

            <div className="space-y-2 text-sm">
              {(selectedReturn.refund_payments || []).map((payment) => (
                <div key={payment.id}>
                  <p>
                    <strong>Refund method:</strong>{" "}
                    {paymentMethodLabel(payment.payment_method)}
                  </p>
                  <p><strong>Amount:</strong> {money(payment.amount)}</p>
                  {payment.transaction_reference && (
                    <p>
                      <strong>Transaction reference:</strong>{" "}
                      {payment.transaction_reference}
                    </p>
                  )}
                  {payment.processed_by_name && (
                    <p><strong>Approved by:</strong> {payment.processed_by_name}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="my-4 border-t border-dashed border-slate-400" />

            <p className="text-center text-sm font-medium">
              Refund processed. Please keep this receipt for your records.
            </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
