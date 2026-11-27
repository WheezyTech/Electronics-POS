import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ChevronDown,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";

import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

const money = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const number = (value) => Number(value || 0).toLocaleString("en-KE");

const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfWeekKey = () => {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dateKey(date);
};

const getList = (data) =>
  Array.isArray(data) ? data : data?.results || data?.products || data?.data || [];

const formatChartDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-KE", { weekday: "short" });
};

function MetricCard({ label, value, detail, icon: Icon, tone }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${tone}`}>
          <Icon size={21} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 truncate text-xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function SalesChart({ data }) {
  const points = data.slice(-7);

  if (!points.length) {
    return (
      <div className="grid h-56 place-items-center text-sm text-slate-400">
        No sales recorded for this period.
      </div>
    );
  }

  const width = 620;
  const height = 220;
  const left = 54;
  const right = 18;
  const top = 18;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(
    1,
    ...points.map((point) => Number(point.revenue || 0))
  );
  const chartPoints = points.map((point, index) => {
    const x = points.length === 1
      ? left + plotWidth / 2
      : left + (index / (points.length - 1)) * plotWidth;
    const value = Number(point.revenue || 0);
    const y = top + (1 - Math.max(0, value) / maximum) * plotHeight;
    return { ...point, x, y, value };
  });
  const linePath = chartPoints
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
    )
    .join(" ");
  const areaPath =
    `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${top + plotHeight} ` +
    `L ${chartPoints[0].x} ${top + plotHeight} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Sales by day"
        className="h-56 w-full overflow-visible"
      >
        <defs>
          <linearGradient id="sales-area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((tick) => {
          const y = top + (tick / 3) * plotHeight;
          const value = maximum * (1 - tick / 3);
          return (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3 5"
              />
              <text
                x={left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400"
                fontSize="10"
              >
                {value >= 1000
                  ? `${(value / 1000).toFixed(0)}k`
                  : Math.round(value)}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#sales-area-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="#2563eb"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {chartPoints.map((point) => (
          <g key={point.date}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill="white"
              stroke="#2563eb"
              strokeWidth="2"
            >
              <title>{`${point.date}: ${money(point.value)}`}</title>
            </circle>
            <text
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-500"
              fontSize="10"
            >
              {formatChartDate(point.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function HorizontalBarChart({
  data,
  labelKey,
  valueKey,
  chartLabel,
  formatValue = number,
  secondaryValueKey,
  formatSecondaryValue,
  emptyMessage,
  barColor = "bg-blue-500",
}) {
  if (!data.length) {
    return (
      <div className="grid min-h-40 place-items-center text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const maximum = Math.max(
    0,
    ...data.map((item) => Number(item[valueKey] || 0))
  );

  return (
    <div
      className="space-y-4"
      role="group"
      aria-label={chartLabel}
    >
      {data.map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = maximum > 0 && value > 0
          ? Math.max(3, (value / maximum) * 100)
          : 0;
        const key =
          item.product_id ??
          item.cashier_id ??
          item.payment_method ??
          item[labelKey];

        return (
          <div key={key}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium text-slate-700">
                {item[labelKey] || "Unknown"}
              </span>
              <span className="shrink-0 font-semibold text-slate-600">
                {formatValue(value)}
              </span>
            </div>
            {secondaryValueKey && (
              <p className="mb-1.5 -mt-1 text-[11px] text-slate-500">
                Revenue: {formatSecondaryValue(item[secondaryValueKey])}
              </p>
            )}
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [todayReport, setTodayReport] = useState(null);
  const [todayElectronicsReport, setTodayElectronicsReport] = useState(null);
  const [todayGasReport, setTodayGasReport] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [customerCount, setCustomerCount] = useState(null);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchError, setProductSearchError] = useState("");
  const [quickCart, setQuickCart] = useState([]);
  const [dateFrom, setDateFrom] = useState(startOfWeekKey);
  const [dateTo, setDateTo] = useState(() => dateKey(new Date()));
  const [periodPreset, setPeriodPreset] = useState("THIS_WEEK");
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [error, setError] = useState("");
  const [auxiliaryError, setAuxiliaryError] = useState("");
  const [posError, setPosError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const isCashier = [
    "CASHIER",
    "ELECTRONICS_CASHIER",
    "GAS_LPG_CASHIER",
  ].includes(user?.role);
  const todayKey = dateKey(new Date());

  useEffect(() => {
    if (isCashier) return undefined;

    let active = true;
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (selectedCategory) params.category = selectedCategory;

    api.get("/reports/dashboard/", { params })
      .then((response) => {
        if (active) {
          setReport(response.data);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.error ||
            requestError.response?.data?.detail ||
            "Could not load dashboard reports."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dateFrom, dateTo, selectedCategory, isCashier, refreshKey]);

  useEffect(() => {
    if (isCashier) return undefined;

    let active = true;
    const params = { date_from: todayKey, date_to: todayKey };
    if (selectedCategory) params.category = selectedCategory;
    api.get("/reports/dashboard/", {
      params,
    })
      .then((response) => {
        if (active) setTodayReport(response.data);
      })
      .catch(() => {
        if (active) setTodayReport(null);
      });

    return () => {
      active = false;
    };
  }, [isCashier, selectedCategory, refreshKey, todayKey]);

  useEffect(() => {
    if (isCashier) return undefined;

    let active = true;
    api.get("/reports/dashboard/", {
      params: {
        date_from: todayKey,
        date_to: todayKey,
        sector: "ELECTRONICS",
      },
    })
      .then((response) => {
        if (active) setTodayElectronicsReport(response.data);
      })
      .catch(() => {
        if (active) setTodayElectronicsReport(null);
      });

    return () => {
      active = false;
    };
  }, [isCashier, refreshKey, todayKey]);

  useEffect(() => {
    if (isCashier) return undefined;

    let active = true;
    api.get("/gas/reports/", {
      params: { date_from: todayKey, date_to: todayKey },
    })
      .then((response) => {
        if (active) setTodayGasReport(response.data);
      })
      .catch(() => {
        if (active) setTodayGasReport(null);
      });

    return () => {
      active = false;
    };
  }, [isCashier, refreshKey, todayKey]);

  useEffect(() => {
    if (isCashier) return undefined;

    let active = true;
    const inventoryParams = selectedCategory
      ? { params: { category: selectedCategory } }
      : undefined;
    api.get("/reports/inventory/", inventoryParams)
      .then((response) => {
        if (active) {
          setInventory(response.data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setAuxiliaryError(
            requestError.response?.data?.detail ||
            "Inventory summary could not be loaded."
          );
        }
      })
      .finally(() => {
        if (active) setInventoryLoading(false);
      });

    api.get("/sales/sales/", { params: { page_size: 1000 } })
      .then((response) => {
        if (!active) return;
        const customerKeys = new Set();
        getList(response.data).forEach((sale) => {
          const name = sale.customer_name?.trim();
          const phone = sale.customer_phone?.trim();
          if (phone || name) {
            customerKeys.add(phone || name.toLocaleLowerCase());
          }
        });
        setCustomerCount(customerKeys.size);
      })
      .catch((requestError) => {
        if (active) {
          setAuxiliaryError(
            requestError.response?.data?.detail ||
            "Customer summary could not be loaded."
          );
        }
      })
      .finally(() => {
        if (active) setCustomersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isCashier, selectedCategory, refreshKey]);

  useEffect(() => {
    if (isCashier) return undefined;

    let active = true;
    api.get("/products/categories/")
      .then((response) => {
        if (!active) return;
        setCategories(
          getList(response.data).filter((category) => category.is_active)
        );
      })
      .catch(() => {
        if (active) setCategories([]);
      });

    return () => {
      active = false;
    };
  }, [isCashier, refreshKey]);

  useEffect(() => {
    if (isCashier) return undefined;

    let active = true;
    api.get("/inventory/locations/")
      .then((response) => {
        if (!active) return;
        const activeLocations = getList(response.data).filter(
          (location) => location.is_active
        );
        setLocations(activeLocations);
        const defaultLocation = activeLocations.find(
          (location) => location.is_default
        );
        const firstLocation = defaultLocation || activeLocations[0];
        if (firstLocation) setSelectedLocation(String(firstLocation.id));
      })
      .catch((requestError) => {
        if (active) {
          setPosError(
            requestError.response?.data?.detail ||
            "Stock locations could not be loaded."
          );
        }
      });

    return () => {
      active = false;
    };
  }, [isCashier]);

  useEffect(() => {
    let active = true;
    const query = productSearch.trim();
    const params = { search: query, location: selectedLocation };
    if (selectedCategory) params.category = selectedCategory;
    const timer = setTimeout(() => {
      if (!query || !selectedLocation) {
        setProductResults([]);
        setProductSearchError("");
        setProductSearchLoading(false);
        return;
      }

      setProductSearchLoading(true);
      setProductSearchError("");
      api.get("/products/products/", { params })
        .then((response) => {
          if (active) setProductResults(getList(response.data));
        })
        .catch((requestError) => {
          if (active) {
            setProductSearchError(
              requestError.response?.data?.detail ||
              "Product search failed. Try again."
            );
          }
        })
        .finally(() => {
          if (active) setProductSearchLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [productSearch, selectedLocation, selectedCategory]);

  const sales = report?.sales || {};
  const dailySales = report?.daily_sales || [];
  const topProducts = report?.top_products || [];
  const paymentBreakdown = report?.payment_breakdown || [];
  const cashierPerformance = report?.cashier_performance || [];
  const gasPaymentBreakdown = report?.gas_payment_breakdown || [];
  const gasCashierPerformance = report?.gas_cashier_performance || [];
  const todayGasSales = (() => {
    const daily = todayGasReport?.daily || {};
    return Number(daily.refill_sales || 0)
      + Number(daily.exchange_sales || 0)
      + Number(daily.new_cylinder_sales_amount || 0);
  })();
  const electronicsTodaySales = Number(
    todayElectronicsReport?.sales?.revenue ?? 0
  );
  const combinedTodaySales = electronicsTodaySales + todayGasSales;
  const inventoryStock = inventory?.stock || {};
  const totalProducts =
    inventoryStock.active_products ?? inventoryStock.products;
  const quickCartTotal = quickCart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  const setPreset = (preset) => {
    setPeriodPreset(preset);
    const today = new Date();
    const todayValue = dateKey(today);

    if (preset === "CUSTOM") return;
    if (preset === "ALL_TIME") {
      setDateFrom("");
      setDateTo("");
      return;
    }

    let start = new Date(today);
    if (preset === "THIS_WEEK") {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    } else if (preset === "THIS_MONTH") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    setDateFrom(dateKey(start));
    setDateTo(todayValue);
  };

  const updateDate = (setter) => (event) => {
    setPeriodPreset("CUSTOM");
    setter(event.target.value);
  };

  const addProduct = (product) => {
    setPosError("");
    setQuickCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: Number(product.selling_price || 0),
          quantity: 1,
        },
      ];
    });
  };

  const changeCartQuantity = (productId, delta) => {
    setQuickCart((current) =>
      current
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const continueInPOS = () => {
    if (!selectedLocation || !quickCart.length) return;
    navigate("/pos", {
      state: {
        initialCart: quickCart,
        initialLocation: selectedLocation,
      },
    });
  };

  const refresh = () => {
    setLoading(true);
    setInventoryLoading(true);
    setCustomersLoading(true);
    setError("");
    setAuxiliaryError("");
    setRefreshKey((key) => key + 1);
  };

  if (isCashier) {
    return (
      <div className="min-h-full bg-slate-50">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-blue-700">Retail workspace</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Welcome, {user?.first_name || user?.username}
            </h1>
          </div>
          <Link
            to="/pos"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <ShoppingCart size={18} />
            Open POS
            <ArrowRight size={16} />
          </Link>
        </header>
        <section className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-700">
            <ShoppingBag size={25} />
          </div>
          <h2 className="mt-5 text-xl font-bold text-slate-900">Ready for your next sale?</h2>
          <p className="mt-2 max-w-lg text-sm text-slate-500">
            Open the POS terminal to scan products, manage the cart, and collect payment.
          </p>
        </section>
      </div>
    );
  }

  const chartSales = dailySales;
  const periodLabel = {
    THIS_WEEK: "This week",
    TODAY: "Today",
    THIS_MONTH: "This month",
    ALL_TIME: "All time",
    CUSTOM: "Custom range",
  }[periodPreset];

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-14 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 md:top-0">
        <div className="relative min-w-0 flex-[1_1_100%] sm:min-w-[220px] sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="Search products, SKU or barcode..."
            aria-label="Search products"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={17} className="text-slate-400" />
          <select
            value={selectedLocation}
            onChange={(event) => setSelectedLocation(event.target.value)}
            aria-label="POS stock location"
            className="max-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400"
          >
            <option value="">Select outlet</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <select
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          aria-label="Filter overview by category"
          className="max-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {(user?.first_name || user?.username || "U").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="max-w-36 truncate text-sm font-semibold text-slate-800">
              {user?.first_name || user?.username}
            </p>
            <p className="text-xs text-slate-500">{user?.role?.replaceAll("_", " ")}</p>
          </div>
        </div>
      </header>

      <main className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-700">Business overview</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Sales, products, customers, and inventory at a glance.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={refresh} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {auxiliaryError && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle size={17} />
            {auxiliaryError}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
          <MetricCard
            label="Today's sales"
            value={
              loading && (!todayElectronicsReport || !todayGasReport)
                ? "..."
                : money(combinedTodaySales)
            }
            detail="Electronics and gas, net of electronics refunds"
            icon={ShoppingBag}
            tone="bg-blue-100 text-blue-700"
          />
          <MetricCard
            label="Today's electronics sales"
            value={loading && !todayReport ? "..." : money(electronicsTodaySales)}
            detail="Electronics and accessories"
            icon={Package}
            tone="bg-cyan-100 text-cyan-700"
          />
          <MetricCard
            label="Today's Gas & LPG sales"
            value={loading && !todayGasReport ? "..." : money(todayGasSales)}
            detail="Refills, exchanges and cylinders"
            icon={ShoppingBag}
            tone="bg-orange-100 text-orange-700"
          />
          <MetricCard
            label="Total orders"
            value={loading && !report ? "..." : number(sales.transactions)}
            detail={`${periodLabel} completed sales`}
            icon={TrendingUp}
            tone="bg-violet-100 text-violet-700"
          />
          <MetricCard
            label="Total products"
            value={
              inventoryLoading
                ? "..."
                : totalProducts === undefined || totalProducts === null
                ? "-"
                : number(totalProducts)
            }
            detail="Active catalog products"
            icon={Package}
            tone="bg-emerald-100 text-emerald-700"
          />
          <MetricCard
            label="Total customers"
            value={
              customersLoading
                ? "..."
                : customerCount === null
                ? "-"
                : number(customerCount)
            }
            detail="Customers saved with sales"
            icon={Users}
            tone="bg-amber-100 text-amber-700"
          />
        </section>

        <section className="grid items-start gap-5 2xl:grid-cols-12">
          <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm 2xl:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-900">POS Terminal</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Build a cart here, then continue to the POS to collect payment.
                </p>
              </div>
              <Link
                to="/pos"
                className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                Open full POS <ArrowRight size={15} />
              </Link>
            </div>

            {productSearch.trim() && (
              <div className="border-b border-slate-100 bg-slate-50/70 p-3">
                {!selectedLocation ? (
                  <p className="p-2 text-sm text-amber-700">
                    Select an outlet before searching for available products.
                  </p>
                ) : productSearchLoading ? (
                  <p className="p-2 text-sm text-slate-500">Searching stock...</p>
                ) : productSearchError ? (
                  <p className="p-2 text-sm text-red-600">{productSearchError}</p>
                ) : productResults.length ? (
                  <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 bg-white">
                    {productResults.slice(0, 8).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addProduct(product)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-blue-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-800">
                            {product.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            SKU: {product.sku} · Available: {number(product.location_quantity_available)}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold text-blue-700">
                          {money(product.selling_price)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="p-2 text-sm text-slate-500">
                    No available products match that search at this outlet.
                  </p>
                )}
              </div>
            )}

            {posError && (
              <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">
                {posError}
              </div>
            )}

            <div className="px-5 py-3">
              <div className="hidden grid-cols-[minmax(0,1fr)_6rem_8rem] gap-3 border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
                <span>Product</span>
                <span className="text-right">Price</span>
                <span className="text-right">Quantity / total</span>
              </div>
              {quickCart.length ? (
                <div className="max-h-[290px] divide-y divide-slate-100 overflow-y-auto">
                  {quickCart.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem] sm:gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                          <Boxes size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {item.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            SKU: {item.sku || "-"}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 sm:text-right">
                        {money(item.price)}
                      </p>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() => changeCartQuantity(item.id, -1)}
                            aria-label={`Decrease ${item.name} quantity`}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="min-w-4 text-center text-xs font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeCartQuantity(item.id, 1)}
                            aria-label={`Increase ${item.name} quantity`}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <span className="min-w-20 text-right text-sm font-bold text-slate-800">
                          {money(item.price * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuickCart((current) =>
                              current.filter((entry) => entry.id !== item.id)
                            )
                          }
                          aria-label={`Remove ${item.name}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-44 place-items-center py-8 text-center">
                  <div>
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
                      <ShoppingCart size={21} />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-600">
                      Your cart is empty
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Search products above to start an order.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setQuickCart([])}
                  disabled={!quickCart.length}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Clear cart
                </button>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total amount</p>
                  <p className="text-xl font-bold text-blue-700">{money(quickCartTotal)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={continueInPOS}
                disabled={!quickCart.length || !selectedLocation}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue to payment <ArrowRight size={17} />
              </button>
            </div>
          </article>

          <div className="space-y-5 2xl:col-span-5">
            <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">Sales Overview</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Net completed revenue by day
                  </p>
                </div>
                <div className="relative">
                  <select
                    value={periodPreset}
                    onChange={(event) => setPreset(event.target.value)}
                    aria-label="Sales chart period"
                    className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs font-semibold text-slate-600 outline-none focus:border-blue-400"
                  >
                    <option value="TODAY">Today</option>
                    <option value="THIS_WEEK">This week</option>
                    <option value="THIS_MONTH">This month</option>
                    <option value="ALL_TIME">All time</option>
                    <option value="CUSTOM">Custom dates</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>
              {periodPreset === "CUSTOM" && (
                <div className="mb-2 flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    From
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={updateDate(setDateFrom)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    To
                    <input
                      type="date"
                      value={dateTo}
                      onChange={updateDate(setDateTo)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    />
                  </label>
                </div>
              )}
              {loading && !report ? (
                <div className="grid h-56 place-items-center text-sm text-slate-400">
                  Loading sales...
                </div>
              ) : (
                <SalesChart data={chartSales} />
              )}
            </article>

            <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-bold text-slate-900">Top Products</h2>
                  <p className="mt-1 text-xs text-slate-500">Best sellers by quantity</p>
                </div>
                <Link
                  to="/products"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                >
                  View all <ArrowRight size={13} />
                </Link>
              </div>
              {topProducts.length ? (
                <div className="p-5">
                  <HorizontalBarChart
                    data={topProducts.slice(0, 5)}
                    labelKey="name"
                    valueKey="quantity_sold"
                    chartLabel="Top selling products by quantity"
                    formatValue={(value) => `${number(value)} sold`}
                    secondaryValueKey="revenue"
                    formatSecondaryValue={money}
                    emptyMessage="No product sales recorded for this period."
                    barColor="bg-violet-500"
                  />
                </div>
              ) : (
                <p className="p-6 text-center text-sm text-slate-500">
                  No product sales recorded for this period.
                </p>
              )}
            </article>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="font-bold text-slate-900">Payment Methods</h2>
              <p className="mt-1 text-xs text-slate-500">
                Amount collected by payment type
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Electronics
                </h3>
                <HorizontalBarChart
                  data={paymentBreakdown}
                  labelKey="payment_method"
                  valueKey="collected"
                  chartLabel="Electronics collected sales by payment method"
                  formatValue={money}
                  emptyMessage="No electronics payments recorded."
                  barColor="bg-cyan-500"
                />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Gas &amp; LPG
                </h3>
                <HorizontalBarChart
                  data={gasPaymentBreakdown}
                  labelKey="payment_method"
                  valueKey="collected"
                  chartLabel="Gas collected sales by payment method"
                  formatValue={money}
                  emptyMessage="No gas payments recorded."
                  barColor="bg-orange-500"
                />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="font-bold text-slate-900">Cashier Performance</h2>
              <p className="mt-1 text-xs text-slate-500">
                Completed sales revenue by cashier
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Electronics
                </h3>
                <HorizontalBarChart
                  data={cashierPerformance.slice(0, 5)}
                  labelKey="cashier"
                  valueKey="revenue"
                  chartLabel="Electronics sales revenue by cashier"
                  formatValue={money}
                  emptyMessage="No electronics cashier sales recorded."
                  barColor="bg-cyan-500"
                />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Gas &amp; LPG
                </h3>
                <HorizontalBarChart
                  data={gasCashierPerformance.slice(0, 5)}
                  labelKey="cashier"
                  valueKey="revenue"
                  chartLabel="Gas sales revenue by cashier"
                  formatValue={money}
                  emptyMessage="No gas cashier sales recorded."
                  barColor="bg-orange-500"
                />
              </div>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-900">Inventory Summary</h2>
              <p className="mt-1 text-xs text-slate-500">
                Current stock levels and valuation
              </p>
            </div>
            <Link
              to="/inventory"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
            >
              View inventory <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-blue-50/70 p-4">
              <p className="text-2xl font-bold text-blue-700">
                {inventoryLoading
                  ? "..."
                  : totalProducts === undefined || totalProducts === null
                  ? "-"
                  : number(totalProducts)}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">Total products</p>
            </div>
            <div className="rounded-xl bg-amber-50/70 p-4">
              <p className="text-2xl font-bold text-amber-600">
                {inventoryLoading
                  ? "..."
                  : inventory?.low_stock_count === undefined ||
                    inventory?.low_stock_count === null
                  ? "-"
                  : number(inventory.low_stock_count)}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">Low stock</p>
            </div>
            <div className="rounded-xl bg-rose-50/70 p-4">
              <p className="text-2xl font-bold text-rose-600">
                {inventoryLoading
                  ? "..."
                  : inventoryStock.out_of_stock_products === undefined ||
                    inventoryStock.out_of_stock_products === null
                  ? "-"
                  : number(inventoryStock.out_of_stock_products)}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">Out of stock</p>
            </div>
            <div className="rounded-xl bg-emerald-50/70 p-4">
              <p className="text-2xl font-bold text-emerald-600">
                {inventoryLoading
                  ? "..."
                  : inventoryStock.estimated_cost_value === undefined ||
                    inventoryStock.estimated_cost_value === null
                  ? "-"
                  : money(inventoryStock.estimated_cost_value)}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Inventory value at cost
              </p>
            </div>
          </div>
        </section>

        {Number(sales.gross_profit || 0) > Number(sales.gross_revenue || sales.revenue || 0) && (
          <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle size={19} className="mt-0.5 shrink-0" />
            <p>
              <strong>Profit data needs review.</strong> Reported gross profit
              is greater than gross sales revenue. Check recorded item prices,
              costs, and discounts.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
