
import { useEffect, useState } from "react";
import {
  Search, Plus, RefreshCw, Edit, X, Package,
  AlertCircle
} from "lucide-react";
import api from "../../api/axios";

const emptyForm = {
  name: "",
  sku: "",
  category: "",
  brand: "",
  model_number: "",
  description: "",
  unit: "",
  cost_price: "",
  selling_price: "",
  wholesale_price: "",
  minimum_selling_price: "",
  warranty_months: 0,
  reorder_level: 0,
  is_active: true,
};

function Field({ label, children, required = false }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [productRes, categoryRes, brandRes, unitRes] =
        await Promise.all([
          api.get("/products/products/"),
          api.get("/products/categories/"),
          api.get("/products/brands/"),
          api.get("/products/units/"),
        ]);

      const getList = (data) =>
        Array.isArray(data) ? data : data.results || [];

      setProducts(getList(productRes.data));
      setCategories(getList(categoryRes.data));
      setBrands(getList(brandRes.data));
      setUnits(getList(unitRes.data));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to load product information."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProducts = products.filter((product) => {
    const term = search.toLowerCase();

    return (
      product.name?.toLowerCase().includes(term) ||
      product.sku?.toLowerCase().includes(term) ||
      product.model_number?.toLowerCase().includes(term)
    );
  });

  const formatMoney = (amount) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

  const openAddForm = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEditForm = (product) => {
    setEditingProduct(product);
    setForm({
      ...emptyForm,
      ...product,
      category: product.category?.id || product.category || "",
      brand: product.brand?.id || product.brand || "",
      unit: product.unit?.id || product.unit || "",
    });
    setError("");
    setShowForm(true);
  };

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const saveProduct = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      const payload = {
        ...form,
        category: Number(form.category),
        brand: form.brand ? Number(form.brand) : null,
        unit: Number(form.unit),
        cost_price: Number(form.cost_price),
        selling_price: Number(form.selling_price),
        wholesale_price: form.wholesale_price
          ? Number(form.wholesale_price)
          : null,
        minimum_selling_price: form.minimum_selling_price
          ? Number(form.minimum_selling_price)
          : null,
        warranty_months: Number(form.warranty_months || 0),
        reorder_level: Number(form.reorder_level || 0),
      };

      if (editingProduct) {
        await api.patch(
          `/products/products/${editingProduct.id}/`,
          payload
        );
      } else {
        await api.post("/products/products/", payload);
      }

      setShowForm(false);
      setEditingProduct(null);
      setForm(emptyForm);
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
          : "Unable to save product."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (product) => {
    try {
      await api.patch(`/products/products/${product.id}/`, {
        is_active: !product.is_active,
      });
      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to update product status."
      );
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Product Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your electronics, prices and product information.
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
            onClick={openAddForm}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={17} />
            Add Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total Products</p>
          <h2 className="mt-2 text-2xl font-bold">{products.length}</h2>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Active Products</p>
          <h2 className="mt-2 text-2xl font-bold">
            {products.filter((p) => p.is_active).length}
          </h2>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Inactive Products</p>
          <h2 className="mt-2 text-2xl font-bold">
            {products.filter((p) => !p.is_active).length}
          </h2>
        </div>
      </div>

      {error && !showForm && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU or model..."
              className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Loading products...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-10 text-center">
            <Package className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="font-medium text-gray-700">No products found</p>
            <p className="mt-1 text-sm text-gray-500">
              Add a product or change your search.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Cost Price</th>
                  <th className="px-5 py-3">Selling Price</th>
                  <th className="px-5 py-3">Warranty</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">
                        {product.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {product.model_number || "No model number"}
                      </p>
                    </td>

                    <td className="px-5 py-4">{product.sku}</td>
                    <td className="px-5 py-4">
                      {formatMoney(product.cost_price)}
                    </td>
                    <td className="px-5 py-4 font-semibold">
                      {formatMoney(product.selling_price)}
                    </td>
                    <td className="px-5 py-4">
                      {product.warranty_months || 0} months
                    </td>

                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        product.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {product.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditForm(product)}
                          className="rounded-lg border p-2 hover:bg-gray-100"
                          title="Edit product"
                        >
                          <Edit size={15} />
                        </button>

                        <button
                          onClick={() => toggleStatus(product)}
                          className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-100"
                        >
                          {product.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white p-5">
              <div>
                <h2 className="text-lg font-bold">
                  {editingProduct ? "Edit Product" : "Add New Product"}
                </h2>
                <p className="text-sm text-gray-500">
                  Enter the product details below.
                </p>
              </div>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveProduct} className="space-y-5 p-5">
              {error && (
                <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Product Name" required>
                  <input
                    required
                    className={inputClass}
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="e.g. Samsung 55 inch Smart TV"
                  />
                </Field>

                <Field label="SKU" required>
                  <input
                    required
                    className={inputClass}
                    value={form.sku}
                    onChange={(e) => updateField("sku", e.target.value)}
                    placeholder="e.g. TV-SAM-001"
                  />
                </Field>

                <Field label="Category" required>
                  <select
                    required
                    className={inputClass}
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                  >
                    <option value="">Select category</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Brand">
                  <select
                    className={inputClass}
                    value={form.brand}
                    onChange={(e) => updateField("brand", e.target.value)}
                  >
                    <option value="">Select brand</option>
                    {brands.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Model Number">
                  <input
                    className={inputClass}
                    value={form.model_number || ""}
                    onChange={(e) => updateField("model_number", e.target.value)}
                    placeholder="Model number"
                  />
                </Field>

                <Field label="Unit" required>
                  <select
                    required
                    className={inputClass}
                    value={form.unit}
                    onChange={(e) => updateField("unit", e.target.value)}
                  >
                    <option value="">Select unit</option>
                    {units.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Cost Price (KES)" required>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    className={inputClass}
                    value={form.cost_price}
                    onChange={(e) => updateField("cost_price", e.target.value)}
                  />
                </Field>

                <Field label="Selling Price (KES)" required>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    className={inputClass}
                    value={form.selling_price}
                    onChange={(e) => updateField("selling_price", e.target.value)}
                  />
                </Field>

                <Field label="Wholesale Price (KES)">
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    className={inputClass}
                    value={form.wholesale_price ?? ""}
                    onChange={(e) => updateField("wholesale_price", e.target.value)}
                  />
                </Field>

                <Field label="Minimum Selling Price (KES)">
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    className={inputClass}
                    value={form.minimum_selling_price ?? ""}
                    onChange={(e) => updateField("minimum_selling_price", e.target.value)}
                  />
                </Field>

                <Field label="Warranty (Months)">
                  <input
                    min="0"
                    type="number"
                    className={inputClass}
                    value={form.warranty_months}
                    onChange={(e) => updateField("warranty_months", e.target.value)}
                  />
                </Field>

                <Field label="Reorder Level">
                  <input
                    min="0"
                    type="number"
                    className={inputClass}
                    value={form.reorder_level}
                    onChange={(e) => updateField("reorder_level", e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  rows={3}
                  className={inputClass}
                  value={form.description || ""}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Product description..."
                />
              </Field>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_active)}
                  onChange={(e) => updateField("is_active", e.target.checked)}
                />
                Product is active and available for sale
              </label>

              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border px-5 py-2.5 text-sm"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingProduct ? "Update Product" : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
