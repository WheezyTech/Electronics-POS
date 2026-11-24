import { useEffect, useState } from "react";
import { KeyRound, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import api from "../../api/axios";

function getList(data) {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error, fallback) {
  const data = error.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  return Object.entries(data)
    .map(([field, messages]) => {
      const message = Array.isArray(messages) ? messages.join(", ") : messages;
      return `${field}: ${message}`;
    })
    .join(" | ") || fallback;
}

function getGrantStatus(grant) {
  if (grant.revoked_at) return "Revoked";
  if (Date.parse(grant.expires_at) <= Date.now()) return "Expired";
  return "Active";
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

export default function OfflineAccess() {
  const [cashiers, setCashiers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [grants, setGrants] = useState([]);
  const [cashierId, setCashierId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [usersResponse, devicesResponse, grantsResponse] =
        await Promise.all([
          api.get("/auth/users/"),
          api.get("/auth/devices/"),
          api.get("/auth/offline-authorizations/"),
        ]);
      const activeCashiers = getList(usersResponse.data).filter(
        (user) => ["CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR"].includes(user.role) && user.is_active
      );
      const activeDevices = getList(devicesResponse.data).filter(
        (device) => device.is_active
      );
      setCashiers(activeCashiers);
      setDevices(activeDevices);
      setGrants(getList(grantsResponse.data));
      setCashierId((current) =>
        activeCashiers.some((user) => String(user.id) === current)
          ? current
          : String(activeCashiers[0]?.id || "")
      );
      setDeviceId((current) =>
        activeDevices.some((device) => String(device.id) === current)
          ? current
          : String(activeDevices[0]?.id || "")
      );
    } catch (loadError) {
      setError(
        getErrorMessage(loadError, "Unable to load offline access data.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadData);
  }, []);

  const handleIssue = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api.post("/auth/offline-authorizations/", {
        user: Number(cashierId),
        device: Number(deviceId),
        operation: "CASH_SALE",
      });
      setMessage(
        "Offline cash-sale access granted for 12 hours. Any previous active grant for this cashier and device was revoked."
      );
      await loadData();
    } catch (issueError) {
      setError(
        getErrorMessage(issueError, "Unable to issue offline access.")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (grant) => {
    setRevokingId(grant.id);
    setError("");
    setMessage("");

    try {
      await api.post(
        `/auth/offline-authorizations/${grant.id}/revoke/`
      );
      setMessage("Offline access revoked.");
      await loadData();
    } catch (revokeError) {
      setError(
        getErrorMessage(revokeError, "Unable to revoke offline access.")
      );
    } finally {
      setRevokingId(null);
    }
  };

  const cashierById = new Map(
    cashiers.map((cashier) => [cashier.id, cashier])
  );
  const deviceById = new Map(devices.map((device) => [device.id, device]));

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offline Access</h1>
          <p className="mt-1 text-sm text-gray-500">
            Authorize a cashier to complete cash sales offline on a specific
            device. Grants expire after 12 hours.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {message && (
        <div role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section className="rounded-xl border bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck size={19} />
            <h2 className="font-semibold">Cashier device grants</h2>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading...</p>
          ) : grants.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No offline access grants have been issued.
            </p>
          ) : (
            <div className="divide-y">
              {grants.map((grant) => {
                const status = getGrantStatus(grant);
                const canRevoke = status === "Active";
                const cashier = cashierById.get(grant.user);
                const device = deviceById.get(grant.device);

                return (
                  <article
                    key={grant.id}
                    className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-gray-900">
                          {cashier?.username || `Cashier #${grant.user}`}
                        </p>
                        <span className={`rounded-full px-2.5 py-1 text-xs ${
                          status === "Active"
                            ? "bg-green-100 text-green-700"
                            : status === "Revoked"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                        }`}>
                          {status}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-gray-600">
                        {device?.name || `Device #${grant.device}`}
                        {device && ` · ${device.platform}`}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Granted {formatDate(grant.granted_at)} · Expires{" "}
                        {formatDate(grant.expires_at)}
                      </p>
                    </div>
                    {canRevoke && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(grant)}
                        disabled={revokingId === grant.id}
                        className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle size={16} />
                        {revokingId === grant.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <form
          onSubmit={handleIssue}
          className="h-fit space-y-4 rounded-xl border bg-white p-5"
        >
          <div className="flex items-center gap-2">
            <KeyRound size={19} />
            <h2 className="font-semibold">Grant offline access</h2>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Cashier
            <select
              required
              value={cashierId}
              onChange={(event) => setCashierId(event.target.value)}
              disabled={loading || cashiers.length === 0}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 font-normal"
            >
              {cashiers.length === 0 && <option value="">No active cashiers</option>}
              {cashiers.map((cashier) => (
                <option key={cashier.id} value={cashier.id}>
                  {cashier.username} — {cashier.email}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Device
            <select
              required
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              disabled={loading || devices.length === 0}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 font-normal"
            >
              {devices.length === 0 && <option value="">No active devices</option>}
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} — {device.platform}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            Cash sales only · expires in 12 hours · bound to this cashier and
            device
          </div>

          <button
            type="submit"
            disabled={
              saving || loading || !cashierId || !deviceId ||
              cashiers.length === 0 || devices.length === 0
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <KeyRound size={16} />
            {saving ? "Granting..." : "Grant 12-hour access"}
          </button>
        </form>
      </div>
    </div>
  );
}
