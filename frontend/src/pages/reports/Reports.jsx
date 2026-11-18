
import { useEffect, useState } from "react";
import api from "../../api/axios";
import {
  RefreshCw, Download, BarChart3, Package,
  ShoppingCart, TrendingUp, AlertCircle
} from "lucide-react";

const money = (value) =>
  `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatLabel = (value) =>
  String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function findMetrics(data, prefix = "") {
  const output = [];

  if (!data || typeof data !== "object") return output;

  Object.entries(data).forEach(([key, value]) => {
    const label = prefix
      ? `${prefix} / ${formatLabel(key)}`
      : formatLabel(key);

    if (
      value === null ||
      ["string", "number", "boolean"].includes(typeof value)
    ) {
      const displayValue =
        value === null && ["date_from", "date_to"].includes(key)
          ? "All time"
          : value === null
          ? "Not available"
          : value;
      output.push({ label, value: displayValue });
    } else if (Array.isArray(value)) {
      output.push({
        label,
        value: `${value.length} records`,
        array: value
      });
    } else if (typeof value === "object") {
      output.push(...findMetrics(value, label));
    }
  });

  return output;
}

function formatMetricValue(value, label) {
  const isMoney = /revenue|refund|amount|profit|discount|tax|invoiced|paid|outstanding|overdue|estimated cost value/i.test(
    label
  );
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
        value.trim() !== "" &&
        Number.isFinite(Number(value))
      ? Number(value)
      : null;

  if (numericValue === null) return String(value);
  if (isMoney) return money(numericValue);
  return numericValue.toLocaleString("en-KE", { maximumFractionDigits: 3 });
}

function downloadCSV(filename, rows) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);

  const escapeCSV = (value) => {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  };

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCSV(row[header])).join(",")
    )
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function ReportSection({ title, icon: Icon, data, loading, error }) {
  const metrics = findMetrics(data);

  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <Icon size={20} />
          </div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
        </div>

        {data && (
          <button
            onClick={() =>
              downloadCSV(
                `${title.toLowerCase().replaceAll(" ", "_")}.csv`,
                metrics.map((item) => ({
                  Metric: item.label,
                  Value: item.value
                }))
              )
            }
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-50"
          >
            <Download size={14} />
            Export CSV
          </button>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <p className="text-sm text-gray-500">Loading report...</p>
        ) : error ? (
          <div className="flex gap-2 text-sm text-red-600">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        ) : !data ? (
          <p className="text-sm text-gray-500">No report data available.</p>
        ) : metrics.length === 0 ? (
          <p className="text-sm text-gray-500">The report returned no metrics.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((metric, index) => (
              <div
                key={`${metric.label}-${index}`}
                className="rounded-lg bg-gray-50 p-4"
              >
                <p className="text-xs font-medium text-gray-500">
                  {metric.label}
                </p>
                <p className="mt-2 break-words text-lg font-bold text-gray-900">
                  {formatMetricValue(metric.value, metric.label)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Reports() {
  const [dashboard, setDashboard] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [purchasing, setPurchasing] = useState(null);

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  const loadReports = async () => {
    setLoading(true);
    setErrors({});

    const requests = [
      {
        key: "dashboard",
        url: "/reports/dashboard/",
        setter: setDashboard
      },
      {
        key: "inventory",
        url: "/reports/inventory/",
        setter: setInventory
      },
      {
        key: "purchasing",
        url: "/reports/purchasing/",
        setter: setPurchasing
      }
    ];

    await Promise.all(
      requests.map(async (request) => {
        try {
          const response = await api.get(request.url);
          request.setter(response.data);
        } catch (error) {
          request.setter(null);

          setErrors((current) => ({
            ...current,
            [request.key]:
              error.response?.data?.detail ||
              error.response?.data?.message ||
              `Unable to load ${request.key} report.`
          }));
        }
      })
    );

    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const dashboardMetrics = findMetrics(dashboard);

  const findValue = (keywords) => {
    const match = dashboardMetrics.find((metric) =>
      keywords.some((keyword) =>
        metric.label.toLowerCase().includes(keyword)
      )
    );

    return match?.value;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Reports & Analytics
          </h1>
          <p className="text-sm text-gray-500">
            Monitor business performance, inventory and purchasing.
          </p>
        </div>

        <button
          onClick={loadReports}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Refresh Reports
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Sales-related metric</p>
            <TrendingUp className="text-green-600" />
          </div>
          <p className="mt-2 text-xl font-bold">
            {findValue(["sales today", "today sales", "total sales"]) !== undefined
              ? money(findValue(["sales today", "today sales", "total sales"]))
              : "See report"}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Inventory metric</p>
            <Package className="text-blue-600" />
          </div>
          <p className="mt-2 text-xl font-bold">
            {findValue(["total products", "product count", "stock items"]) !== undefined
              ? Number(findValue(["total products", "product count", "stock items"])).toLocaleString("en-KE")
              : "See report"}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Purchasing metric</p>
            <ShoppingCart className="text-purple-600" />
          </div>
          <p className="mt-2 text-xl font-bold">
            {findValue(["purchase total", "total purchases", "purchase amount"]) !== undefined
              ? money(findValue(["purchase total", "total purchases", "purchase amount"]))
              : "See report"}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Profit metric</p>
            <BarChart3 className="text-orange-600" />
          </div>
          <p className="mt-2 text-xl font-bold">
            {findValue(["gross profit", "total profit", "net profit"]) !== undefined
              ? money(findValue(["gross profit", "total profit", "net profit"]))
              : "See report"}
          </p>
        </div>
      </div>

      <ReportSection
        title="Business Dashboard"
        icon={BarChart3}
        data={dashboard}
        loading={loading}
        error={errors.dashboard}
      />

      <ReportSection
        title="Inventory Report"
        icon={Package}
        data={inventory}
        loading={loading}
        error={errors.inventory}
      />

      <ReportSection
        title="Purchasing Report"
        icon={ShoppingCart}
        data={purchasing}
        loading={loading}
        error={errors.purchasing}
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Reporting note:</strong> The figures displayed above come from
        your backend report endpoints. Detailed date-range analysis, cashier
        comparisons and product profitability require corresponding backend
        report data.
      </div>
    </div>
  );
}
