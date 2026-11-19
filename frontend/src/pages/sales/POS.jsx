
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import ReceiptPreview from "../../components/ReceiptPreview";
import {
  Search, ScanBarcode, Plus, Minus, Trash2,
  ShoppingCart, CreditCard
} from "lucide-react";

function getList(data) {
  if (Array.isArray(data)) return data;
  return data?.results || data?.products || data?.data || [];
}

function getProduct(data) {
  return data?.product || data?.data?.product || data?.data || data;
}

export default function POS() {
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const initialCart = routeLocation.state?.initialCart;

  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);
  const [location, setLocation] = useState(
    routeLocation.state?.initialLocation
      ? String(routeLocation.state.initialLocation)
      : ""
  );
  const [cart, setCart] = useState(() =>
    Array.isArray(initialCart)
      ? initialCart.map((item) => ({
          ...item,
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 0),
        }))
      : []
  );
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [barcode, setBarcode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    initialCart?.length
      ? "Dashboard cart loaded. Select a payment method to continue."
      : ""
  );
  const [error, setError] = useState("");
  const [receiptSale, setReceiptSale] = useState(null);
  const [draftSale, setDraftSale] = useState(null);
  const [loadedDraftId, setLoadedDraftId] = useState(null);
  const [failedDraftId, setFailedDraftId] = useState(null);

  const draftSaleId = routeLocation.state?.draftSaleId;
  const isLoadingDraft = Boolean(
    draftSaleId &&
    loadedDraftId !== draftSaleId &&
    failedDraftId !== draftSaleId
  );

  useEffect(() => {
    api.get("/inventory/locations/")
      .then((response) => {
        const activeLocations = getList(response.data).filter(
          (item) => item.is_active
        );
        setLocations(activeLocations);

        if (!draftSaleId) {
          const defaultLocation = activeLocations.find(
            (item) => item.is_default
          );
          if (defaultLocation) {
            setLocation((current) => current || String(defaultLocation.id));
          }
          else if (activeLocations.length) {
            setLocation((current) => current || String(activeLocations[0].id));
          }
        }
      })
      .catch(() => setError("Unable to load stock locations."));
  }, [draftSaleId]);

  useEffect(() => {
    Promise.all([
      api.get("/products/categories/"),
      api.get("/products/product-types/"),
      api.get("/products/brands/"),
      api.get("/products/units/"),
    ])
      .then(([categoryResponse, productTypeResponse, brandResponse, unitResponse]) => {
        setCategories(
          getList(categoryResponse.data).filter((item) => item.is_active)
        );
        setProductTypes(
          getList(productTypeResponse.data).filter((item) => item.is_active)
        );
        setBrands(
          getList(brandResponse.data).filter((item) => item.is_active)
        );
        setUnits(
          getList(unitResponse.data).filter((item) => item.is_active)
        );
      })
      .catch(() => setError("Unable to load product filters."));
  }, []);

  useEffect(() => {
    if (!Array.isArray(initialCart) || !initialCart.length) return;
    navigate("/pos", { replace: true, state: null });
  }, [initialCart, navigate]);

  useEffect(() => {
    if (!draftSaleId) return undefined;

    let active = true;

    api.get(`/sales/sales/${draftSaleId}/`)
      .then((response) => {
        const sale = response.data?.sale || response.data;

        if (sale.status !== "DRAFT") {
          throw new Error("Only draft sales can be continued.");
        }

        if (!active) return;

        setDraftSale(sale);
        setLoadedDraftId(draftSaleId);
        setLocation(String(sale.location));
        setCustomerName(sale.customer_name || "");
        setCustomerPhone(sale.customer_phone || "");
        setCart((sale.items || []).map((item) => ({
          id: item.product,
          saleItemId: item.id,
          name: item.product_name,
          sku: item.sku,
          price: Number(item.unit_price || 0),
          discountAmount: Number(item.discount_amount || 0),
          quantity: Number(item.quantity || 0),
        })));
        setProducts([]);
        setSearch("");
        setMessage(
          `Draft ${sale.reference} loaded. Select a payment method to continue.`
        );
      })
      .catch((err) => {
        if (!active) return;
        setFailedDraftId(draftSaleId);
        setError(
          err.response?.data?.detail ||
          err.message ||
          "Unable to load this draft sale."
        );
      });

    return () => {
      active = false;
    };
  }, [draftSaleId]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const hasFilters = [
        search,
        skuFilter,
        modelFilter,
        categoryFilter,
        productTypeFilter,
        brandFilter,
        unitFilter,
      ].some((value) => value.trim());

      if (!hasFilters || !location) {
        setProducts([]);
        return;
      }

      const params = {
        location,
        in_stock: inStockOnly,
      };
      if (search.trim()) params.search = search.trim();
      if (skuFilter.trim()) params.sku = skuFilter.trim();
      if (modelFilter.trim()) params.model_number = modelFilter.trim();
      if (categoryFilter) params.category = categoryFilter;
      if (productTypeFilter) params.product_type = productTypeFilter;
      if (brandFilter) params.brand = brandFilter;
      if (unitFilter) params.unit = unitFilter;

      api.get("/products/products/", {
        params
      })
        .then((response) => {
          if (active) setProducts(getList(response.data));
        })
        .catch(() => {
          if (active) setError("Unable to search products.");
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    search,
    skuFilter,
    modelFilter,
    categoryFilter,
    productTypeFilter,
    brandFilter,
    unitFilter,
    inStockOnly,
    location,
  ]);

  const addProduct = (product) => {
    if (!product?.id) {
      setError("The product response is missing its ID.");
      return;
    }

    if (Number(product.location_quantity_available || 0) <= 0) {
      setError("This product has no available stock at the selected location.");
      return;
    }

    setError("");
    setMessage("");

    setCart((current) => {
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
          quantity: 1
        }
      ];
    });
  };

  const scanBarcode = async (event) => {
    event.preventDefault();
    if (!barcode.trim()) return;

    if (!location) {
      setError("Select a stock location before scanning a product.");
      return;
    }

    setError("");

    try {
      const response = await api.get("/products/products/lookup/", {
        params: { code: barcode.trim(), location }
      });

      const product = getProduct(response.data);
      if (!product?.id) {
        setError("No product was found for that barcode.");
        return;
      }

      addProduct(product);
      setBarcode("");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        (err.response?.status === 404
          ? "No available product matches this code at the selected location."
          : "Barcode lookup failed. Check your connection and try again.")
      );
    }
  };

  const changeQuantity = (id, amount) => {
    setCart((current) => {
      const target = current.find((item) => item.id === id);
      if (draftSale && target && target.quantity + amount <= 0) {
        return current;
      }

      return current
        .map((item) =>
          item.id === id
            ? { ...item, quantity: item.quantity + amount }
            : item
        )
        .filter((item) => item.quantity > 0);
    });
  };

  const removeItem = (id) => {
    if (draftSale) return;
    setCart((current) => current.filter((item) => item.id !== id));
  };

  const total = Number(
    (
      cart.reduce(
        (sum, item) =>
          sum +
          item.price * item.quantity -
          Number(item.discountAmount || 0),
        0
      ) -
      Number(draftSale?.discount_amount || 0) +
      Number(draftSale?.tax_amount || 0)
    ).toFixed(2)
  );

  const [pendingMpesaTransactionId, setPendingMpesaTransactionId] = useState("");
  const [pendingMpesaSaleId, setPendingMpesaSaleId] = useState("");
  const [mpesaStatus, setMpesaStatus] = useState("");

  const buildReceipt = (sale) => {
    setReceiptSale(sale);
    setMessage(`Sale completed successfully. Reference: ${sale.reference || sale.id}`);
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setPaymentReference("");
    setSearch("");
    setSkuFilter("");
    setModelFilter("");
    setCategoryFilter("");
    setProductTypeFilter("");
    setBrandFilter("");
    setUnitFilter("");
    setInStockOnly(true);
    setProducts([]);
    setPendingMpesaTransactionId("");
    setPendingMpesaSaleId("");
    setMpesaStatus("");
    setDraftSale(null);
    if (routeLocation.state?.draftSaleId) {
      navigate("/pos", { replace: true, state: null });
    }
  };

  const pollMpesaTransaction = async (transactionId, fallbackSaleId = "") => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await api.get(`/sales/mpesa/status/${transactionId}/`);
      const result = response.data?.transaction || response.data;
      const statusValue = String(result?.status || "").toUpperCase();

      if (statusValue === "SUCCESS") {
        if (result.processing_error) {
          setMpesaStatus("REVIEW");
          setError(
            `M-Pesa payment was received, but the sale could not be completed automatically. ` +
            `Receipt: ${result.mpesa_receipt_number || "not provided"}. ` +
            `Please contact your manager. Do not initiate payment again.`
          );
          return;
        }

        // The callback is the authority for completing the sale. Confirm the sale
        // can now provide a receipt before clearing the cashier's cart.
        const saleId = result.sale_id || result.sale || fallbackSaleId;
        if (saleId) {
          const saleResponse = await api.get(`/sales/sales/${saleId}/receipt/`);
          buildReceipt(saleResponse.data?.sale || saleResponse.data);
        } else {
          setMpesaStatus("SUCCESS");
          setMessage(
            `M-Pesa payment confirmed. Receipt: ${result.mpesa_receipt_number || "not provided"}. ` +
            "Please open the completed sale to print its receipt."
          );
          setPendingMpesaTransactionId("");
          setPendingMpesaSaleId("");
        }
        return;
      }

      if (statusValue === "FAILED") {
        setMpesaStatus("FAILED");
        setError(
          result.result_description ||
          "M-Pesa payment was not completed. Check the customer's phone before trying again."
        );
        setPendingMpesaTransactionId("");
        setPendingMpesaSaleId("");
        return;
      }

      if (statusValue === "REVIEW") {
        setMpesaStatus("REVIEW");
        setError(
          "This M-Pesa transaction requires manager review. Do not initiate another payment for this sale."
        );
        setPendingMpesaTransactionId("");
        setPendingMpesaSaleId("");
        return;
      }

      setMpesaStatus(statusValue || "PENDING");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    setMpesaStatus("PENDING");
    setMessage(
      "The M-Pesa request is still pending. Check the customer's phone and use “Check payment status” before attempting another payment."
    );
  };

  const checkPendingMpesa = async () => {
    if (!pendingMpesaTransactionId) return;
    setLoading(true);
    setError("");
    setMessage("Checking M-Pesa payment status...");
    try {
      await pollMpesaTransaction(pendingMpesaTransactionId, pendingMpesaSaleId);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        err.message ||
        "Unable to check M-Pesa status. The transaction may still be pending."
      );
    } finally {
      setLoading(false);
    }
  };

  const syncDraftItems = async (sale, cartItems) => {
    let persistedItems = sale.items || [];

    for (const item of cartItems) {
      const payload = {
        quantity: item.quantity,
        unit_price: item.price,
        discount_amount: Number(item.discountAmount || 0),
      };

      if (item.saleItemId) {
        await api.patch(
          `/sales/sales/${sale.id}/items/${item.saleItemId}/`,
          payload
        );
        continue;
      }

      const response = await api.post(
        `/sales/sales/${sale.id}/items/`,
        {
          product: item.id,
          ...payload,
        }
      );
      const savedItem = response.data?.item || response.data;

      if (!savedItem?.id) {
        throw new Error("The server did not return the saved sale item.");
      }

      setCart((current) =>
        current.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, saleItemId: savedItem.id }
            : cartItem
        )
      );
      persistedItems = [...persistedItems, savedItem];
      setDraftSale((current) =>
        current?.id === sale.id
          ? { ...current, items: persistedItems }
          : current
      );
    }
  };

  const checkout = async () => {
    if (!location) {
      setError("Select a stock location before checkout.");
      return;
    }

    if (!cart.length) {
      setError("Add at least one product to the cart.");
      return;
    }

    if (paymentMethod === "MPESA" && !customerPhone.trim()) {
      setError("Enter the customer's M-Pesa phone number.");
      return;
    }

    if (paymentMethod === "MPESA" && !Number.isInteger(total)) {
      setError("M-Pesa STK Push requires a whole-number amount in KSh. Adjust the sale total first.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setReceiptSale(null);
    setMpesaStatus("");

    try {
      let sale = draftSale;
      let saleId = draftSale?.id;

      if (!draftSale) {
        const saleResponse = await api.post("/sales/sales/", {
          location: Number(location),
          customer_name: customerName,
          customer_phone: customerPhone
        });

        sale = {
          ...(saleResponse.data?.sale || saleResponse.data),
          items: [],
        };
        saleId = sale?.id;

        if (!saleId) {
          throw new Error("The server did not return a sale ID.");
        }

        setDraftSale(sale);
      }

      if (!saleId) {
        throw new Error("The draft sale could not be loaded.");
      }

      await syncDraftItems(sale, cart);

      if (paymentMethod === "MPESA") {
        // Initiate STK Push. Never send M-Pesa through the normal checkout endpoint.
        const stkResponse = await api.post("/sales/mpesa/initiate/", {
          sale_id: saleId,
          phone_number: customerPhone.trim(),
        });

        const transactionId =
          stkResponse.data?.transaction_id ||
          stkResponse.data?.transaction?.id ||
          stkResponse.data?.id;

        if (!transactionId) {
          throw new Error(
            "The server did not return an M-Pesa transaction ID. Check the transaction before retrying."
          );
        }

        setPendingMpesaTransactionId(transactionId);
        setPendingMpesaSaleId(String(saleId));
        setMpesaStatus("PENDING");
        setMessage(
          stkResponse.data?.customer_message ||
          "STK Push sent. Ask the customer to check their phone and enter their M-Pesa PIN."
        );

        await pollMpesaTransaction(transactionId, saleId);
      } else {
        // Cash, card, bank and other supported non-M-Pesa methods use normal checkout.
        await api.post(`/sales/sales/${saleId}/checkout/`, {
          payments: [
            {
              amount: total.toFixed(2),
              payment_method: paymentMethod,
              transaction_reference: paymentReference
            }
          ]
        });

        const receiptResponse = await api.get(
          `/sales/sales/${saleId}/receipt/`
        );
        buildReceipt(receiptResponse.data?.sale || receiptResponse.data);
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Checkout failed. Please check the sale and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pos-page space-y-5">
      <div className="no-print">
        <h1 className="text-2xl font-bold text-slate-800">Point of Sale</h1>
        <p className="text-slate-500">Search products and process customer sales.</p>
      </div>

      {error && (
        <div className="no-print rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="no-print rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {draftSale && (
        <div className="no-print rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Continuing draft {draftSale.reference}. Edit the cart, then select a payment method.
        </div>
      )}

      <div className="no-print grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-2">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium">Stock location</label>
            <select
              value={location}
              disabled={Boolean(draftSale)}
              onChange={(event) => {
                if (cart.length && event.target.value !== location) {
                  setError("Remove the cart items before changing stock location.");
                  return;
                }
                setLocation(event.target.value);
                setProducts([]);
              }}
              className="w-full rounded-lg border border-slate-300 p-3"
            >
              <option value="">Select location</option>
              {locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <form onSubmit={scanBarcode} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-3 text-slate-400" size={20} />
                <input
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  disabled={loading || isLoadingDraft}
                  placeholder="Scan or enter barcode..."
                  className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3"
                />
              </div>
              <button
                disabled={loading || isLoadingDraft}
                className="rounded-lg bg-slate-800 px-5 text-white disabled:opacity-50"
              >
                Scan
              </button>
            </form>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-3 text-slate-400" size={20} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={loading || isLoadingDraft}
                placeholder={
                  location
                    ? "Search product name, SKU or model..."
                    : "Select a stock location before searching..."
                }
                className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3"
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <select
                value={productTypeFilter}
                onChange={(event) => setProductTypeFilter(event.target.value)}
                disabled={loading || isLoadingDraft}
                className="w-full rounded-lg border border-slate-300 p-3"
                aria-label="Filter by product type"
              >
                <option value="">All product types</option>
                {productTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                disabled={loading || isLoadingDraft}
                className="w-full rounded-lg border border-slate-300 p-3"
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <select
                value={unitFilter}
                onChange={(event) => setUnitFilter(event.target.value)}
                disabled={loading || isLoadingDraft}
                className="w-full rounded-lg border border-slate-300 p-3"
                aria-label="Filter by unit"
              >
                <option value="">All units</option>
                {units.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.abbreviation})
                  </option>
                ))}
              </select>
              <select
                value={brandFilter}
                onChange={(event) => setBrandFilter(event.target.value)}
                disabled={loading || isLoadingDraft}
                className="w-full rounded-lg border border-slate-300 p-3"
                aria-label="Filter by brand"
              >
                <option value="">All brands</option>
                {brands.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <input
                value={modelFilter}
                onChange={(event) => setModelFilter(event.target.value)}
                disabled={loading || isLoadingDraft}
                placeholder="Filter by model..."
                aria-label="Filter by model"
                className="w-full rounded-lg border border-slate-300 p-3"
              />
              <input
                value={skuFilter}
                onChange={(event) => setSkuFilter(event.target.value)}
                disabled={loading || isLoadingDraft}
                placeholder="Filter by SKU..."
                aria-label="Filter by SKU"
                className="w-full rounded-lg border border-slate-300 p-3"
              />
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(event) => setInStockOnly(event.target.checked)}
                  disabled={loading || isLoadingDraft}
                  className="h-4 w-4"
                />
                In-stock items only
              </label>
            </div>
          </div>

          {location &&
            (search.trim() ||
              skuFilter.trim() ||
              modelFilter.trim() ||
              productTypeFilter ||
              categoryFilter ||
              brandFilter ||
              unitFilter) &&
            products.length === 0 && (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              {inStockOnly
                ? "No products with available stock match these filters."
                : "No products match these filters."}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                disabled={
                  loading ||
                  isLoadingDraft ||
                  Number(product.location_quantity_available || 0) <= 0
                }
                className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
              >
                <h3 className="font-semibold text-slate-800">{product.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  SKU: {product.sku}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Available here: {product.location_quantity_available}
                </p>
                <p className="mt-3 font-bold text-blue-700">
                  KSh {Number(product.selling_price || 0).toLocaleString()}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600">
                  {Number(product.location_quantity_available || 0) > 0 ? (
                    <><Plus size={16} /> Add to cart</>
                  ) : (
                    "Out of stock"
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ShoppingCart size={20} /> Cart
            </h2>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
              {cart.length} items
            </span>
          </div>

          <div className="space-y-3">
            {cart.map((item) => (
              <div key={item.id} className="border-b border-slate-100 pb-3">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800">{item.name}</p>
                    <p className="text-sm text-slate-500">
                      KSh {item.price.toLocaleString()} each
                    </p>
                  </div>
                  {!draftSale && (
                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={loading || isLoadingDraft}
                      className="text-red-500"
                      title="Remove item"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => changeQuantity(item.id, -1)}
                      disabled={
                        loading ||
                        isLoadingDraft ||
                        (draftSale && item.quantity <= 1)
                      }
                      className="rounded border p-1 disabled:opacity-50"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => changeQuantity(item.id, 1)}
                      disabled={loading || isLoadingDraft}
                      className="rounded border p-1 disabled:opacity-50"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <strong>
                    KSh {(
                      item.price * item.quantity -
                      Number(item.discountAmount || 0)
                    ).toLocaleString()}
                  </strong>
                </div>
              </div>
            ))}

            {!cart.length && (
              <p className="py-8 text-center text-sm text-slate-400">
                Your cart is empty.
              </p>
            )}
          </div>

          <div className="mt-5 space-y-3 border-t pt-4">
            <label className="block text-sm font-medium">Customer name (optional)</label>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              readOnly={Boolean(draftSale)}
              className="w-full rounded-lg border p-2.5"
              placeholder="Customer name"
            />

            <label className="block text-sm font-medium">
              {paymentMethod === "MPESA" ? "M-Pesa phone number (required)" : "Customer phone (optional)"}
            </label>
            <input
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              className="w-full rounded-lg border p-2.5"
              placeholder="07XXXXXXXX or 2547XXXXXXXX"
            />

            <label className="block text-sm font-medium">Payment method</label>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              className="w-full rounded-lg border p-2.5"
            >
              <option value="CASH">Cash</option>
              <option value="MPESA">M-Pesa</option>
              <option value="CARD">Card</option>
              <option value="BANK">Bank</option>
              <option value="OTHER">Other</option>
            </select>

            {paymentMethod !== "CASH" && paymentMethod !== "MPESA" && (
              <>
                <label className="block text-sm font-medium">
                  Transaction reference (optional)
                </label>
                <input
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  className="w-full rounded-lg border p-2.5"
                  placeholder="Transaction reference"
                />
              </>
            )}

            <div className="flex justify-between border-t pt-4 text-lg font-bold">
              <span>Total</span>
              <span>KSh {total.toLocaleString()}</span>
            </div>

            <button
              onClick={checkout}
              disabled={loading || isLoadingDraft || !cart.length || !location}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard size={18} />
              {isLoadingDraft
                ? "Loading draft..."
                : loading
                ? "Processing..."
                : paymentMethod === "MPESA"
                ? "Send M-Pesa STK Push"
                : "Complete Sale"}
            </button>

            {pendingMpesaTransactionId && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">M-Pesa status: {mpesaStatus || "PENDING"}</p>
                <p className="mt-1">
                  Transaction ID: <span className="break-all">{pendingMpesaTransactionId}</span>
                </p>
                <button
                  type="button"
                  onClick={checkPendingMpesa}
                  disabled={loading}
                  className="mt-3 w-full rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold disabled:opacity-50"
                >
                  {loading ? "Checking..." : "Check payment status"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {receiptSale && (
        <ReceiptPreview
          sale={receiptSale}
          onClose={() => setReceiptSale(null)}
          autoPrint
        />
      )}
    </div>
  );
}
