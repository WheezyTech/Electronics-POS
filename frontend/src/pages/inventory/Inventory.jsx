
import { useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, Package, AlertTriangle,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  History, X, Plus, Minus, Pencil
} from "lucide-react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

export default function Inventory() {
  const { user } = useAuth();
  const canAdjustStock = ["ADMINISTRATOR", "STORE_MANAGER"].includes(user?.role);
  const canEditMovements =
    user?.is_superuser || user?.role === "ADMINISTRATOR";
  const [balances, setBalances] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [lowStock, setLowStock] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [action, setAction] = useState("receive");
  const [openingProductSearch, setOpeningProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingMovement, setEditingMovement] = useState(null);
  const [movementForm, setMovementForm] = useState({
    quantity_delta: "",
    movement_type: "",
    unit_cost: "",
    reference: "",
    notes: "",
  });

  const [form, setForm] = useState({
    product: "",
    location: "",
    destination_location: "",
    quantity: "",
    notes: "",
  });

  const getList = (data) =>
    Array.isArray(data) ? data : data?.results || [];

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [
        balanceRes,
        locationRes,
        productRes,
        movementRes,
        lowRes,
      ] = await Promise.all([
        api.get("/inventory/balances/"),
        api.get("/inventory/locations/"),
        api.get("/products/products/"),
        api.get("/inventory/movements/"),
        api.get("/inventory/low-stock/"),
      ]);

      setBalances(getList(balanceRes.data));
      setLocations(
        getList(locationRes.data).filter((location) => location.is_active)
      );
      setProducts(getList(productRes.data));
      setMovements(getList(movementRes.data));
      setLowStock(getList(lowRes.data));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Failed to load inventory information."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadInventory);
  }, [loadInventory]);

  const getProductName = (product) => {
    if (typeof product === "object" && product !== null) {
      return product.name || "Unknown product";
    }

    return products.find((p) => String(p.id) === String(product))?.name ||
      "Unknown product";
  };

  const getLocationName = (location) => {
    if (typeof location === "object" && location !== null) {
      return location.name || "Unknown location";
    }

    return locations.find((l) => String(l.id) === String(location))?.name ||
      "Unknown location";
  };

  const filteredBalances = balances.filter((item) => {
    const name = getProductName(item.product).toLowerCase();
    const location = getLocationName(item.location).toLowerCase();
    const term = search.toLowerCase();

    return name.includes(term) || location.includes(term);
  });

  const filteredOpeningProducts = products.filter((product) => {
    const term = openingProductSearch.trim().toLowerCase();
    return (
      product.name?.toLowerCase().includes(term) ||
      product.sku?.toLowerCase().includes(term) ||
      product.model_number?.toLowerCase().includes(term) ||
      product.brand?.name?.toLowerCase().includes(term) ||
      product.brand_name?.toLowerCase().includes(term)
    );
  });

  const recordedProductIds = new Set(
    balances.map((item) =>
      String(
        typeof item.product === "object"
          ? item.product?.id
          : item.product
      )
    )
  );

  const unrecordedProducts = products
    .filter((product) => product.is_active !== false)
    .filter((product) => !recordedProductIds.has(String(product.id)))
    .filter((product) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;

      return (
        product.name?.toLowerCase().includes(term) ||
        product.sku?.toLowerCase().includes(term) ||
        product.model_number?.toLowerCase().includes(term) ||
        product.brand?.name?.toLowerCase().includes(term) ||
        product.brand_name?.toLowerCase().includes(term)
      );
    });

  const totalUnits = balances.reduce(
    (sum, item) =>
      sum + Number(
        item.quantity_on_hand ??
        item.quantity ??
        item.available_quantity ??
        0
      ),
    0
  );

  const openAction = (type) => {
    setAction(type);
    setOpeningProductSearch("");
    setForm({
      product: "",
      location: locations.length === 1 ? String(locations[0].id) : "",
      destination_location: "",
      quantity: "",
      notes: "",
    });
    setError("");
    setShowForm(true);
  };

  const openAdjustment = (balance, direction) => {
    setAction(direction > 0 ? "adjust-increase" : "adjust-decrease");
    setOpeningProductSearch("");
    setForm({
      product: String(balance.product?.id ?? balance.product),
      location: String(balance.location?.id ?? balance.location),
      destination_location: "",
      quantity: "",
      notes: "",
    });
    setError("");
    setShowForm(true);
  };

  const openUnrecordedProduct = (product) => {
    setAction("opening");
    setOpeningProductSearch(
      `${product.name}${product.sku ? ` (${product.sku})` : ""}`
    );
    setForm({
      product: String(product.id),
      location: locations.length === 1 ? String(locations[0].id) : "",
      destination_location: "",
      quantity: "",
      notes: "",
    });
    setError("");
    setShowForm(true);
  };

  const submitAction = async (e) => {
    e.preventDefault();

    if (action === "opening" && !form.product) {
      setError("Search for a product and select it from the results.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const quantity = Number(form.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError("Enter a quantity greater than zero.");
        return;
      }

      const payload = {
        product: Number(form.product),
        location: Number(form.location),
        quantity,
        notes: form.notes,
      };

      if (action === "opening") {
        await api.post("/inventory/adjustments/", {
          ...payload,
          reference: "OPENING",
          notes: [
            "Opening stock entered manually.",
            form.notes,
          ].filter(Boolean).join(" "),
        });
      } else if (action === "receive") {
        await api.post("/inventory/receive/", payload);
      } else if (action === "issue") {
        await api.post("/inventory/issue/", payload);
      } else if (action === "adjust-increase" || action === "adjust-decrease") {
        await api.post("/inventory/adjustments/", {
          ...payload,
          quantity: action === "adjust-increase" ? quantity : -quantity,
          reference: "MANUAL-ADJUSTMENT",
        });
      } else {
        await api.post("/inventory/transfers/", {
          product: Number(form.product),
          source_location: Number(form.location),
          destination_location: Number(form.destination_location),
          quantity,
          notes: form.notes,
        });
      }

      setShowForm(false);
      await loadInventory();
    } catch (err) {
      const data = err.response?.data;
      setError(
        typeof data === "object"
          ? Object.entries(data)
              .map(([key, value]) =>
                `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
              )
              .join(" | ")
          : "Inventory operation failed."
      );
    } finally {
      setSaving(false);
    }
  };

  const openMovementEditor = (movement) => {
    setEditingMovement(movement);
    setMovementForm({
      quantity_delta: movement.quantity_delta,
      movement_type: movement.movement_type,
      unit_cost: movement.unit_cost ?? "",
      reference: movement.reference || "",
      notes: movement.notes || "",
    });
    setError("");
  };

  const saveMovement = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      await api.patch(
        `/inventory/movements/${editingMovement.id}/edit/`,
        {
          quantity_delta: movementForm.quantity_delta,
          movement_type: movementForm.movement_type,
          unit_cost: movementForm.unit_cost || null,
          reference: movementForm.reference,
          notes: movementForm.notes,
        }
      );
      setEditingMovement(null);
      await loadInventory();
    } catch (err) {
      const data = err.response?.data;
      setError(
        typeof data === "object"
          ? Object.entries(data)
              .map(([key, value]) =>
                `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
              )
              .join(" | ")
          : "Unable to update this stock movement."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Inventory Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and manage the stock available at your shop.
          </p>
        </div>

        <button
          onClick={loadInventory}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Stock Records</p>
          <h2 className="mt-2 text-2xl font-bold">{balances.length}</h2>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Stock Not Recorded</p>
          <h2 className="mt-2 text-2xl font-bold text-amber-600">
            {products.filter((product) =>
              product.is_active !== false &&
              !recordedProductIds.has(String(product.id))
            ).length}
          </h2>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total Stock Units</p>
          <h2 className="mt-2 text-2xl font-bold">{totalUnits}</h2>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Low Stock Records</p>
          <h2 className="mt-2 text-2xl font-bold text-red-600">
            {lowStock.length}
          </h2>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => openAction("opening")}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <ArrowDownToLine size={17} />
          Enter Opening Stock
        </button>

        <button
          onClick={() => openAction("receive")}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
        >
          <ArrowDownToLine size={17} />
          Receive Stock
        </button>

        <button
          onClick={() => openAction("issue")}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          <ArrowUpFromLine size={17} />
          Issue Stock
        </button>

        {locations.filter((location) => location.is_active).length > 1 && (
          <button
            onClick={() => openAction("transfer")}
            className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeftRight size={17} />
            Transfer Stock
          </button>
        )}
      </div>

      {error && !showForm && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
          <h2 className="font-semibold">Stock Balances</h2>

          <div className="relative w-full sm:max-w-sm">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or location..."
              className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Loading inventory...
          </div>
        ) : filteredBalances.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <Package className="mx-auto mb-3 text-gray-300" size={38} />
            No stock balances found.
          </div>
        ) : (
          <div className="responsive-table-wrap overflow-x-auto">
            <table className="responsive-table w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Quantity</th>
                  <th className="px-5 py-3">Reserved</th>
                  <th className="px-5 py-3">Available</th>
                  {canAdjustStock && <th className="px-5 py-3">Adjust</th>}
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredBalances.map((item) => {
                  const quantity = Number(
                    item.quantity_on_hand ?? item.quantity ?? 0
                  );
                  const reserved = Number(
                    item.quantity_reserved ?? item.reserved_quantity ?? 0
                  );
                  const available = Number(
                    item.quantity_available ??
                    item.available_quantity ??
                    quantity - reserved
                  );

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td data-label="Product" className="px-5 py-4 font-medium">
                        {getProductName(item.product)}
                      </td>
                      <td data-label="Location" className="px-5 py-4">
                        {getLocationName(item.location)}
                      </td>
                      <td data-label="Quantity" className="px-5 py-4">{quantity}</td>
                      <td data-label="Reserved" className="px-5 py-4">{reserved}</td>
                      <td data-label="Available" className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          available <= 0
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {available}
                        </span>
                      </td>
                      {canAdjustStock && (
                        <td data-label="Adjust" className="px-5 py-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              aria-label={`Add stock for ${getProductName(item.product)}`}
                              onClick={() => openAdjustment(item, 1)}
                              className="rounded-lg border border-green-200 p-2 text-green-700 hover:bg-green-50"
                            >
                              <Plus size={16} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove stock for ${getProductName(item.product)}`}
                              onClick={() => openAdjustment(item, -1)}
                              className="rounded-lg border border-orange-200 p-2 text-orange-700 hover:bg-orange-50"
                            >
                              <Minus size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-semibold">Stock Not Recorded</h2>
            <p className="mt-1 text-xs text-gray-500">
              Registered active products without a stock balance
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
            {unrecordedProducts.length}
          </span>
        </div>

        {unrecordedProducts.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">
            {search.trim()
              ? "No unrecorded products match your search."
              : "All registered active products have a stock balance."}
          </p>
        ) : (
          <div className="responsive-table-wrap overflow-x-auto">
            <table className="responsive-table w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Brand</th>
                  <th className="px-5 py-3">Status</th>
                  {canAdjustStock && <th className="px-5 py-3">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {unrecordedProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td data-label="Product" className="px-5 py-4 font-medium">
                      {product.name}
                    </td>
                    <td data-label="SKU" className="px-5 py-4">
                      {product.sku || "-"}
                    </td>
                    <td data-label="Brand" className="px-5 py-4">
                      {product.brand?.name || product.brand_name || "-"}
                    </td>
                    <td data-label="Status" className="px-5 py-4">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                        Not recorded
                      </span>
                    </td>
                    {canAdjustStock && (
                      <td data-label="Action" className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => openUnrecordedProduct(product)}
                          className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Enter Stock
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center gap-2 border-b p-4">
          <AlertTriangle className="text-orange-500" size={19} />
          <h2 className="font-semibold">Low Stock Alerts</h2>
        </div>

        {lowStock.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">
            No low-stock products reported by the backend.
          </p>
        ) : (
          <div className="responsive-table-wrap overflow-x-auto">
            <table className="responsive-table w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Quantity</th>
                  <th className="px-5 py-3">Reorder Level</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lowStock.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Product" className="px-5 py-4 font-medium">
                      {getProductName(item.product)}
                    </td>
                    <td data-label="Location" className="px-5 py-4">
                      {getLocationName(item.location)}
                    </td>
                    <td data-label="Quantity" className="px-5 py-4 text-red-600">
                      {item.quantity_on_hand ??
                        item.quantity ??
                        item.quantity_available ??
                        item.available_quantity ??
                        0}
                    </td>
                    <td data-label="Reorder level" className="px-5 py-4">
                      {item.reorder_level ?? item.product?.reorder_level ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center gap-2 border-b p-4">
          <History size={19} />
          <h2 className="font-semibold">Recent Stock Movements</h2>
        </div>

        <div className="responsive-table-wrap overflow-x-auto">
          <table className="responsive-table w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Quantity</th>
                <th className="px-5 py-3">Location</th>
                {canEditMovements && <th className="px-5 py-3">Action</th>}
              </tr>
            </thead>

            <tbody className="divide-y">
              {movements.slice(0, 10).map((movement) => (
                <tr key={movement.id}>
                  <td data-label="Date" className="px-5 py-4">
                    {movement.created_at
                      ? new Date(movement.created_at).toLocaleString("en-KE")
                      : "-"}
                  </td>
                  <td data-label="Product" className="px-5 py-4">
                    {movement.product_name ||
                      getProductName(movement.product)}
                  </td>
                  <td data-label="Type" className="px-5 py-4">
                    {movement.movement_type || movement.type || "-"}
                  </td>
                  <td data-label="Quantity" className="px-5 py-4 font-medium">
                    {movement.quantity_delta ?? movement.quantity ?? "-"}
                  </td>
                  <td data-label="Location" className="px-5 py-4">
                    {movement.location_name ||
                      getLocationName(movement.location)}
                  </td>
                  {canEditMovements && (
                    <td data-label="Action" className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => openMovementEditor(movement)}
                        aria-label={`Edit movement for ${movement.product_name || "product"}`}
                        className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {movements.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    No stock movements found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="text-lg font-bold capitalize">
                {action === "opening"
                  ? "Enter Opening Stock"
                  : action.startsWith("adjust-")
                    ? `${action === "adjust-increase" ? "Add to" : "Remove from"} Stock`
                    : `${action} Stock`}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={submitAction} className="space-y-4 p-5">
              {action === "opening" && (
                <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                  Record stock you already purchased and have in the shop.
                  This creates a stock adjustment, not a purchase receipt or
                  transfer. Enter only the amount not already recorded.
                </p>
              )}

              {editingMovement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b p-5">
                      <h2 className="text-lg font-bold">Edit Stock Movement</h2>
                      <button
                        type="button"
                        onClick={() => setEditingMovement(null)}
                        className="rounded-lg p-2 hover:bg-gray-100"
                        aria-label="Close movement editor"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <form onSubmit={saveMovement} className="space-y-4 p-5">
                      <p className="text-sm text-gray-600">
                        {editingMovement.product_name} · {editingMovement.location_name}
                      </p>
                      {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                          {error}
                        </div>
                      )}
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">Movement type</span>
                        <select
                          required
                          value={movementForm.movement_type}
                          onChange={(event) =>
                            setMovementForm({ ...movementForm, movement_type: event.target.value })
                          }
                          className="w-full rounded-lg border p-2.5 text-sm"
                        >
                          {[
                            "RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER_IN",
                            "TRANSFER_OUT", "CUSTOMER_RETURN", "SUPPLIER_RETURN", "DAMAGE",
                          ].map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">Quantity change (+/-)</span>
                        <input
                          required
                          type="number"
                          step="0.001"
                          value={movementForm.quantity_delta}
                          onChange={(event) =>
                            setMovementForm({ ...movementForm, quantity_delta: event.target.value })
                          }
                          className="w-full rounded-lg border p-2.5 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">Unit cost</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={movementForm.unit_cost}
                          onChange={(event) =>
                            setMovementForm({ ...movementForm, unit_cost: event.target.value })
                          }
                          className="w-full rounded-lg border p-2.5 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">Reference</span>
                        <input
                          value={movementForm.reference}
                          onChange={(event) =>
                            setMovementForm({ ...movementForm, reference: event.target.value })
                          }
                          className="w-full rounded-lg border p-2.5 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">Notes</span>
                        <textarea
                          value={movementForm.notes}
                          onChange={(event) =>
                            setMovementForm({ ...movementForm, notes: event.target.value })
                          }
                          className="w-full rounded-lg border p-2.5 text-sm"
                          rows={3}
                        />
                      </label>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingMovement(null)}
                          className="rounded-lg border px-4 py-2 text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {saving ? "Saving..." : "Save Movement"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {action.startsWith("adjust-") && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                {action === "adjust-increase"
                  ? "Add the received quantity to this stock balance."
                  : "Remove the quantity from this stock balance. Stock cannot fall below reserved quantities."}
              </p>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {action === "opening" ? (
                <div>
                  <label
                    htmlFor="opening-stock-product-search"
                    className="mb-1 block text-sm font-medium"
                  >
                    Search product
                  </label>
                  <div className="relative">
                    <Search
                      size={17}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      id="opening-stock-product-search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={
                        !form.product && Boolean(openingProductSearch.trim())
                      }
                      value={openingProductSearch}
                      onChange={(event) => {
                        setOpeningProductSearch(event.target.value);
                        setForm({ ...form, product: "" });
                      }}
                      className="w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm outline-none focus:border-blue-500"
                      placeholder="Search product name, SKU, model or brand..."
                    />
                    {form.product && (
                      <button
                        type="button"
                        aria-label="Clear selected product"
                        onClick={() => {
                          setOpeningProductSearch("");
                          setForm({ ...form, product: "" });
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  {!form.product && openingProductSearch.trim() && (
                    <div
                      role="listbox"
                      aria-label="Matching products"
                      className="mt-1 max-h-52 overflow-y-auto rounded-lg border bg-white shadow-sm"
                    >
                      {filteredOpeningProducts.length ? (
                        filteredOpeningProducts.slice(0, 20).map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            role="option"
                            aria-selected="false"
                            onClick={() => {
                              setForm({ ...form, product: String(product.id) });
                              setOpeningProductSearch(
                                `${product.name}${product.sku ? ` (${product.sku})` : ""}`
                              );
                            }}
                            className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-blue-50"
                          >
                            <span className="font-medium">{product.name}</span>
                            {(product.sku || product.brand?.name || product.brand_name) && (
                              <span className="ml-2 text-xs text-gray-500">
                                {[product.sku, product.brand?.name || product.brand_name]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-sm text-gray-500">
                          No products match your search.
                        </p>
                      )}
                    </div>
                  )}
                  {form.product && (
                    <p className="mt-1 text-xs text-green-700">
                      Product selected. Clear the field to choose another.
                    </p>
                  )}
                </div>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Product</span>
                  <select
                    required
                    value={form.product}
                    onChange={(e) =>
                      setForm({ ...form, product: e.target.value })
                    }
                    className="w-full rounded-lg border p-2.5 text-sm"
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  {action === "transfer" ? "Source Location" : "Location"}
                </span>
                <select
                  required
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  className="w-full rounded-lg border p-2.5 text-sm"
                >
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>

              {action === "transfer" && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    Destination Location
                  </span>
                  <select
                    required
                    value={form.destination_location}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        destination_location: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border p-2.5 text-sm"
                  >
                    <option value="">Select destination</option>
                    {locations
                      .filter(
                        (location) =>
                          String(location.id) !== String(form.location)
                      )
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  {action === "opening" || action === "adjust-increase"
                    ? "Quantity to add"
                    : "Quantity"}
                </span>
                <input
                  required
                  min="0.001"
                  step="any"
                  type="number"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  className="w-full rounded-lg border p-2.5 text-sm"
                  placeholder={
                    action === "opening" || action === "adjust-increase"
                      ? "Enter existing stock quantity"
                      : "Enter quantity"
                  }
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  className="w-full rounded-lg border p-2.5 text-sm"
                  placeholder="Reason or additional notes..."
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
                  {saving
                    ? "Processing..."
                    : action === "opening"
                      ? "Add Opening Stock"
                      : action.startsWith("adjust-")
                        ? "Save Adjustment"
                      : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
