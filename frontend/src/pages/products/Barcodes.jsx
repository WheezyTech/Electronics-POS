
import { useEffect, useState } from "react";
import {
  Barcode,
  Search,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import api from "../../api/axios";

const initialForm = {
  product: "",
  barcode: "",
  barcode_type: "EAN13",
};

export default function Barcodes() {
  const [barcodes, setBarcodes] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);

  const getList = (data) =>
    Array.isArray(data) ? data : data?.results || [];

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [barcodeResponse, productResponse] = await Promise.all([
        api.get("/products/barcodes/"),
        api.get("/products/products/", {
          params: { page_size: 1000 },
        }),
      ]);

      setBarcodes(getList(barcodeResponse.data));
      setProducts(getList(productResponse.data));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to load barcode records."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getProduct = (barcode) => {
    if (barcode.product && typeof barcode.product === "object") {
      return barcode.product;
    }

    return products.find(
      (product) => String(product.id) === String(barcode.product)
    );
  };

  const filteredBarcodes = barcodes.filter((item) => {
    const product = getProduct(item);
    const term = search.toLowerCase();

    return (
      String(item.barcode || "")
        .toLowerCase()
        .includes(term) ||
      String(product?.name || "").toLowerCase().includes(term) ||
      String(product?.sku || "").toLowerCase().includes(term)
    );
  });

  const saveBarcode = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await api.post("/products/barcodes/", {
        product: Number(form.product),
        barcode: form.barcode.trim(),
        barcode_type: form.barcode_type,
      });

      setSuccess("Barcode added successfully.");
      setForm(initialForm);
      setShowForm(false);
      await loadData();
    } catch (err) {
      const data = err.response?.data;

      setError(
        typeof data === "object"
          ? Object.entries(data)
              .map(([key, value]) =>
                `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
              )
              .join(" | ")
          : "Unable to save barcode."
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteBarcode = async (barcode) => {
    if (!window.confirm("Are you sure you want to delete this barcode?")) {
      return;
    }

    try {
      setError("");
      setSuccess("");

      await api.delete(`/products/barcodes/${barcode.id}/`);

      setSuccess("Barcode deleted successfully.");
      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to delete this barcode."
      );
    }
  };

  const lookupBarcode = async () => {
    const code = form.barcode.trim();

    if (!code) {
      setError("Enter a barcode to test.");
      return;
    }

    try {
      setError("");
      const response = await api.get("/products/products/lookup/", {
        params: { code },
      });

      const product = response.data.product || response.data;

      setSuccess(
        `Barcode found: ${product.name || "Product matched successfully"}`
      );
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "No product was found for this barcode."
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Barcode Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Assign and manage product barcodes for faster checkout.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm hover:bg-gray-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            onClick={() => {
              setError("");
              setSuccess("");
              setForm(initialForm);
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={17} />
            Add Barcode
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Registered Barcodes</p>
          <h2 className="mt-2 text-2xl font-bold">{barcodes.length}</h2>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Products Available</p>
          <h2 className="mt-2 text-2xl font-bold">{products.length}</h2>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search barcode, product or SKU..."
              className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Loading barcodes...
          </div>
        ) : filteredBarcodes.length === 0 ? (
          <div className="p-10 text-center">
            <Barcode className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="font-medium text-gray-700">No barcodes found</p>
            <p className="mt-1 text-sm text-gray-500">
              Add a barcode to start using barcode lookup.
            </p>
          </div>
        ) : (
          <div className="responsive-table-wrap overflow-x-auto">
            <table className="responsive-table w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-5 py-3">Barcode</th>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredBarcodes.map((item) => {
                  const product = getProduct(item);

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td data-label="Barcode" className="px-5 py-4 font-mono font-medium">
                        {item.barcode}
                      </td>
                      <td data-label="Product" className="px-5 py-4">
                        {product?.name || "Unknown product"}
                      </td>
                      <td data-label="SKU" className="px-5 py-4">
                        {product?.sku || "-"}
                      </td>
                      <td data-label="Type" className="px-5 py-4">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                          {item.barcode_type || item.type || "-"}
                        </span>
                      </td>
                      <td data-mobile-action className="px-5 py-4 text-right">
                        <button
                          onClick={() => deleteBarcode(item)}
                          className="rounded-lg border p-2 text-red-600 hover:bg-red-50"
                          title="Delete barcode"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-bold">Add Product Barcode</h2>
                <p className="text-sm text-gray-500">
                  Link a barcode to an existing product.
                </p>
              </div>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveBarcode} className="space-y-4 p-5">
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
                      {product.name} — {product.sku}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Barcode Number
                </span>
                <input
                  required
                  value={form.barcode}
                  onChange={(e) =>
                    setForm({ ...form, barcode: e.target.value })
                  }
                  className="w-full rounded-lg border p-2.5 text-sm"
                  placeholder="Scan or enter barcode number"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Barcode Type
                </span>
                <select
                  value={form.barcode_type}
                  onChange={(e) =>
                    setForm({ ...form, barcode_type: e.target.value })
                  }
                  className="w-full rounded-lg border p-2.5 text-sm"
                >
                  <option value="EAN13">EAN-13</option>
                  <option value="EAN8">EAN-8</option>
                  <option value="UPC_A">UPC-A</option>
                  <option value="UPC_E">UPC-E</option>
                  <option value="CODE128">Code 128</option>
                  <option value="QR">QR Code</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>

              <button
                type="button"
                onClick={lookupBarcode}
                className="w-full rounded-lg border px-4 py-2.5 text-sm hover:bg-gray-50"
              >
                Test Barcode Lookup
              </button>

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
                  {saving ? "Saving..." : "Save Barcode"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
