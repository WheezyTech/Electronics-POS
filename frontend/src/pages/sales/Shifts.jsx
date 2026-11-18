
import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import {
  RefreshCw, Plus, Eye, X, Wallet,
  ArrowDownCircle, ArrowUpCircle, Lock,
  Clock, CheckCircle
} from "lucide-react";

const money = (value) =>
  `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const dateTime = (value) =>
  value ? new Date(value).toLocaleString("en-KE") : "-";

const getList = (data) =>
  Array.isArray(data) ? data : data?.results || data?.data || [];

function StatusBadge({ status }) {
  const active = status === "OPEN";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
      active
        ? "bg-green-100 text-green-700"
        : "bg-gray-100 text-gray-600"
    }`}>
      {status || "UNKNOWN"}
    </span>
  );
}

export default function Shifts() {
  const { user } = useAuth();
  const canOpenShift = [
    "ADMINISTRATOR",
    "STORE_MANAGER",
  ].includes(user?.role);

  const [shifts, setShifts] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [shiftSummary, setShiftSummary] = useState(null);

  const [location, setLocation] = useState("");
  const [cashier, setCashier] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [openingNotes, setOpeningNotes] = useState("");

  const [movementType, setMovementType] = useState("CASH_IN");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");

  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const params = statusFilter ? { status: statusFilter } : {};

      const [shiftResponse, locationResponse] = await Promise.all([
        api.get("/sales/shifts/", { params }),
        api.get("/inventory/locations/")
      ]);

      setShifts(getList(shiftResponse.data));
      setLocations(
        getList(locationResponse.data).filter((location) => location.is_active)
      );
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to load cashier shifts."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const activeShifts = shifts.filter(
    (shift) => shift.status === "OPEN"
  );

  const totalOpeningCash = activeShifts.reduce(
    (sum, shift) => sum + Number(shift.opening_cash || 0),
    0
  );

  const filteredShifts = useMemo(() => shifts, [shifts]);

  const showOpenShiftForm = async () => {
    setError("");

    try {
      const response = await api.get("/sales/shifts/cashiers/");
      const availableCashiers = getList(response.data);
      setCashiers(availableCashiers);

      if (!availableCashiers.length) {
        setError("There are no active cashier accounts to assign a shift.");
        return;
      }

      setCashier("");
      setLocation("");
      setOpeningCash("0");
      setOpeningNotes("");
      setShowOpenForm(true);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to load active cashiers."
      );
    }
  };

  const openShift = async (event) => {
    event.preventDefault();

    if (!cashier) {
      setError("Select a cashier for this shift.");
      return;
    }

    if (!location) {
      setError("Select a stock location.");
      return;
    }

    if (Number(openingCash) < 0) {
      setError("Opening cash cannot be negative.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api.post("/sales/shifts/", {
        cashier: Number(cashier),
        location: Number(location),
        opening_cash: Number(openingCash),
        notes: openingNotes.trim()
      });

      setShowOpenForm(false);
      setCashier("");
      setLocation("");
      setOpeningCash("0");
      setOpeningNotes("");

      await loadData();
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail ||
        data?.message ||
        JSON.stringify(data || "Unable to open shift.")
      );
    } finally {
      setSaving(false);
    }
  };

  const viewShift = async (shift) => {
    setError("");
    setSelectedShift(shift);
    setShiftSummary(null);
    setMovementAmount("");
    setMovementReason("");
    setClosingCash("");
    setClosingNotes("");

    try {
      const response = await api.get(
        `/sales/shifts/${shift.id}/summary/`
      );

      setShiftSummary(response.data);
    } catch (err) {
      // Display the shift record if a summary endpoint is unavailable.
      setShiftSummary(null);
      setError(
        err.response?.data?.detail ||
        "Could not load shift summary. Showing available shift information."
      );
    }
  };

  const recordMovement = async (event) => {
    event.preventDefault();

    if (!selectedShift) return;

    if (Number(movementAmount) <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    if (!movementReason.trim()) {
      setError("Enter a reason for this cash movement.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api.post(
        `/sales/shifts/${selectedShift.id}/movements/`,
        {
          movement_type: movementType,
          amount: Number(movementAmount),
          reason: movementReason.trim(),
          notes: movementReason.trim()
        }
      );

      setMovementAmount("");
      setMovementReason("");

      await viewShift(selectedShift);
      await loadData();
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail ||
        data?.message ||
        JSON.stringify(data || "Unable to record cash movement.")
      );
    } finally {
      setSaving(false);
    }
  };

  const closeShift = async (event) => {
    event.preventDefault();

    if (!selectedShift) return;

    if (closingCash === "" || Number(closingCash) < 0) {
      setError("Enter a valid physical cash count.");
      return;
    }

    if (!window.confirm(
      "Are you sure you want to close this cashier shift?"
    )) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api.post(
        `/sales/shifts/${selectedShift.id}/close/`,
        {
          closing_cash: Number(closingCash),
          notes: closingNotes.trim()
        }
      );

      setSelectedShift(null);
      setShiftSummary(null);
      await loadData();
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail ||
        data?.message ||
        JSON.stringify(data || "Unable to close shift.")
      );
    } finally {
      setSaving(false);
    }
  };

  const summary = shiftSummary || selectedShift || {};

  const expectedCash =
    summary.expected_cash ??
    summary.expected_cash_amount ??
    summary.cash_expected;

  const cashDifference =
    summary.cash_difference ??
    summary.difference ??
    summary.variance;

  const movements =
    shiftSummary?.movements ||
    selectedShift?.movements ||
    [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Cashier Shifts
          </h1>
          <p className="text-sm text-gray-500">
            Open shifts, manage cash movements and reconcile cash.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          {canOpenShift && (
            <button
              onClick={showOpenShiftForm}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus size={17} />
              Open Shift
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Open shifts</p>
            <Clock className="text-green-600" />
          </div>
          <p className="mt-2 text-2xl font-bold">{activeShifts.length}</p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Opening cash in active shifts</p>
            <Wallet className="text-blue-600" />
          </div>
          <p className="mt-2 text-xl font-bold">{money(totalOpeningCash)}</p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Total shift records</p>
            <CheckCircle className="text-purple-600" />
          </div>
          <p className="mt-2 text-2xl font-bold">{shifts.length}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border bg-white px-3 py-2.5 text-sm"
        >
          <option value="">All shifts</option>
          <option value="OPEN">Open shifts</option>
          <option value="CLOSED">Closed shifts</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-4">Cashier</th>
                <th className="px-5 py-4">Location</th>
                <th className="px-5 py-4">Opening cash</th>
                <th className="px-5 py-4">Opened</th>
                <th className="px-5 py-4">Closed</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    Loading shifts...
                  </td>
                </tr>
              ) : filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    No cashier shifts found.
                  </td>
                </tr>
              ) : (
                filteredShifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium">
                      {shift.cashier_name || shift.cashier || "-"}
                    </td>
                    <td className="px-5 py-4">
                      {shift.location_name || shift.location || "-"}
                    </td>
                    <td className="px-5 py-4 font-semibold">
                      {money(shift.opening_cash)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {dateTime(shift.opened_at || shift.created_at)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {dateTime(shift.closed_at)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={shift.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => viewShift(shift)}
                        className="rounded-lg border p-2 hover:bg-gray-100"
                        title="View shift"
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

      {/* OPEN SHIFT */}
      {showOpenForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="text-lg font-bold">Open Cashier Shift</h2>
              <button
                onClick={() => setShowOpenForm(false)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={openShift} className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Cashier
                </label>
                <select
                  value={cashier}
                  onChange={(event) => setCashier(event.target.value)}
                  required
                  className="w-full rounded-lg border px-3 py-2.5"
                >
                  <option value="">Select cashier</option>
                  {cashiers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.username}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Stock location
                </label>
                <select
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  required
                  className="w-full rounded-lg border px-3 py-2.5"
                >
                  <option value="">Select location</option>
                  {locations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Opening cash (KSh)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingCash}
                  onChange={(event) => setOpeningCash(event.target.value)}
                  required
                  className="w-full rounded-lg border px-3 py-2.5"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Notes
                </label>
                <textarea
                  value={openingNotes}
                  onChange={(event) => setOpeningNotes(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2.5"
                  placeholder="Optional opening notes..."
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Opening shift..." : "Open Shift"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SHIFT DETAILS */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white p-5">
              <div>
                <h2 className="text-lg font-bold">Shift Details</h2>
                <p className="text-sm text-gray-500">
                  {selectedShift.cashier_name || selectedShift.cashier || "Cashier"}
                </p>
              </div>

              <button
                onClick={() => {
                  setSelectedShift(null);
                  setShiftSummary(null);
                }}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Opening cash</p>
                  <p className="mt-1 text-xl font-bold">
                    {money(summary.opening_cash)}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Expected cash</p>
                  <p className="mt-1 text-xl font-bold">
                    {expectedCash === undefined ? "Not available" : money(expectedCash)}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Cash difference</p>
                  <p className="mt-1 text-xl font-bold">
                    {cashDifference === undefined ? "Not available" : money(cashDifference)}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Shift status</p>
                  <div className="mt-2">
                    <StatusBadge status={selectedShift.status} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Opened</p>
                  <p className="font-medium">
                    {dateTime(selectedShift.opened_at || selectedShift.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Closed</p>
                  <p className="font-medium">{dateTime(selectedShift.closed_at)}</p>
                </div>
              </div>

              {selectedShift.status === "OPEN" && (
                <>
                  <div className="border-t pt-5">
                    <h3 className="mb-3 font-semibold">Record cash movement</h3>

                    <form onSubmit={recordMovement} className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <select
                          value={movementType}
                          onChange={(event) => setMovementType(event.target.value)}
                          className="rounded-lg border px-3 py-2.5"
                        >
                          <option value="CASH_IN">Cash In</option>
                          <option value="CASH_OUT">Cash Out</option>
                        </select>

                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={movementAmount}
                          onChange={(event) => setMovementAmount(event.target.value)}
                          placeholder="Amount (KSh)"
                          className="rounded-lg border px-3 py-2.5"
                          required
                        />
                      </div>

                      <input
                        value={movementReason}
                        onChange={(event) => setMovementReason(event.target.value)}
                        placeholder="Reason for movement"
                        className="w-full rounded-lg border px-3 py-2.5"
                        required
                      />

                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Record Movement"}
                      </button>
                    </form>
                  </div>

                  <div className="border-t pt-5">
                    <h3 className="mb-3 font-semibold">Close shift and reconcile</h3>

                    <form onSubmit={closeShift} className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Physical cash counted (KSh)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={closingCash}
                          onChange={(event) => setClosingCash(event.target.value)}
                          required
                          className="w-full rounded-lg border px-3 py-2.5"
                          placeholder="Enter actual cash in drawer"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Closing notes
                        </label>
                        <textarea
                          value={closingNotes}
                          onChange={(event) => setClosingNotes(event.target.value)}
                          rows={2}
                          className="w-full rounded-lg border px-3 py-2.5"
                          placeholder="Explain any cash difference..."
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <Lock size={16} />
                        {saving ? "Closing..." : "Close Shift"}
                      </button>
                    </form>
                  </div>
                </>
              )}

              <div className="border-t pt-5">
                <h3 className="mb-3 font-semibold">Cash movements</h3>

                {movements.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No cash movements are available in this summary.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {movements.map((movement) => {
                      const isIn = movement.movement_type === "CASH_IN";

                      return (
                        <div
                          key={movement.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-3">
                            {isIn ? (
                              <ArrowDownCircle className="text-green-600" />
                            ) : (
                              <ArrowUpCircle className="text-red-600" />
                            )}
                            <div>
                              <p className="font-medium">
                                {movement.reason || movement.notes || movement.movement_type}
                              </p>
                              <p className="text-xs text-gray-500">
                                {dateTime(movement.created_at)}
                              </p>
                            </div>
                          </div>

                          <p className={`font-semibold ${isIn ? "text-green-700" : "text-red-700"}`}>
                            {isIn ? "+" : "-"}{money(movement.amount)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
