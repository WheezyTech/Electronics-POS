import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { Flame, RefreshCw, Plus, ShoppingCart, ArrowLeftRight, X } from "lucide-react";

const list = (data) => Array.isArray(data) ? data : data?.results || [];
const money = (value) => `KSh ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function Gas() {
  const { user } = useAuth();
  const canManageGas = user?.is_superuser || ["ADMINISTRATOR", "STORE_MANAGER"].includes(user?.role);
  const [tab, setTab] = useState("overview");
  const [brands, setBrands] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [brandName, setBrandName] = useState("");
  const [sizeName, setSizeName] = useState("");
  const [sizeKg, setSizeKg] = useState("");
  const [editingBrand, setEditingBrand] = useState(null);
  const [editingSize, setEditingSize] = useState(null);
  const [stockAdjustment, setStockAdjustment] = useState({
    location: "", brand: "", size: "", full_direction: "ADD", full_quantity: "0",
    empty_direction: "ADD", empty_quantity: "0",
    notes: "", reference: "",
  });

  const [refill, setRefill] = useState({ location: "", brand: "", customer_brand: "", size: "", quantity: "1", refill_price: "", payment_method: "", customer_name: "", customer_phone: "", transaction_reference: "" });
  const [exchange, setExchange] = useState({ location: "", brand: "", size: "", quantity: "1", refill_payment: "", payment_method: "", customer_name: "", customer_phone: "", transaction_reference: "" });
  const [sale, setSale] = useState({ location: "", brand: "", size: "", status: "FULL", quantity: "1", selling_price: "", deposit_amount: "", includes_gas: true, payment_method: "", customer_name: "", customer_phone: "", transaction_reference: "", accessories: "" });
  const [saleAccessories, setSaleAccessories] = useState([{ product: "", quantity: "1" }]);
  const [purchase, setPurchase] = useState({ location: "", supplier: "", brand: "", size: "", full_cylinders_received: "0", empty_cylinders_returned: "0", purchase_price: "", delivery_date: "", invoice_reference: "", compliance_reference: "" });

  const gasAccessoryProducts = products.filter((product) => {
    const searchable = [
      product.category_name,
      product.product_type_name,
      product.name,
    ].filter(Boolean).join(" ").toLowerCase();
    return product.is_active && /gas|lpg|burner|regulat|grill|cook|pipe|clip|connector/.test(searchable);
  });
  const accessoryTotal = saleAccessories.reduce((total, item) => {
    const product = products.find((candidate) => String(candidate.id) === String(item.product));
    return total + Number(product?.selling_price || 0) * Number(item.quantity || 0);
  }, 0);
  const completeSaleTotal =
    Number(sale.selling_price || 0) * Number(sale.quantity || 0) + accessoryTotal;

  const load = async () => {
    setError("");
    try {
      const [brandsR, sizesR, locationsR, suppliersR, productsR, stockR, reportR, movementsR] = await Promise.all([
        api.get("/gas/brands/"), api.get("/gas/sizes/"), api.get("/inventory/locations/"),
        api.get("/purchases/suppliers/"), api.get("/products/products/"),
        api.get("/gas/stock/"), api.get("/gas/reports/"),
        api.get("/gas/movements/?ordering=-created_at"),
      ]);
      setBrands(list(brandsR.data)); setSizes(list(sizesR.data)); setLocations(list(locationsR.data));
      setSuppliers(list(suppliersR.data)); setProducts(list(productsR.data));
      setStock(list(stockR.data)); setReport(reportR.data);
      setMovements(list(movementsR.data));
    } catch {
      setError("Unable to load gas data.");
    }
  };

  useEffect(() => {
    Promise.resolve().then(load);
  }, []);

  const create = async (path, payload, successMessage) => {
    setError(""); setMessage("");
    try {
      await api.post(path, payload);
      setMessage(successMessage);
      await load();
    } catch (err) {
      const data = err?.response?.data;
      setError(typeof data === "string" ? data : data?.detail || data?.non_field_errors?.[0] || "Transaction could not be recorded.");
    }
  };

  const addBrand = (event) => {
    event.preventDefault();
    const request = editingBrand
      ? api.patch(`/gas/brands/${editingBrand}/`, { name: brandName })
      : api.post("/gas/brands/", { name: brandName, is_active: true, compliance_details: "" });
    request.then(async () => {
      setMessage(editingBrand ? "Gas brand updated." : "Gas brand added.");
      setError("");
      setBrandName("");
      setEditingBrand(null);
      await load();
    }).catch((err) => setError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || "Unable to save gas brand."));
  };

  const addSize = (event) => {
    event.preventDefault();
    const payload = { name: sizeName, weight_kg: sizeKg };
    const request = editingSize
      ? api.patch(`/gas/sizes/${editingSize}/`, payload)
      : api.post("/gas/sizes/", { ...payload, is_active: true });
    request.then(async () => {
      setMessage(editingSize ? "Cylinder size updated." : "Cylinder size added.");
      setError("");
      setSizeName("");
      setSizeKg("");
      setEditingSize(null);
      await load();
    }).catch((err) => setError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || "Unable to save cylinder size."));
  };

  const tabs = [
    ["overview", "Overview"], ["refill", "Gas refill"], ["exchange", "Empty exchange"],
    ["sale", "New cylinder sale"], ["purchase", "Gas purchase"], ["stock", "Record stock"],
    ["setup", "Brands & sizes"],
  ].filter(([id]) => canManageGas || !["purchase", "stock", "setup"].includes(id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800"><Flame className="text-orange-500" /> Gas & LPG</h1><p className="text-sm text-slate-500">Refills, exchanges, cylinder stock and gas purchases</p></div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"><RefreshCw size={16}/>Refresh</button>
      </div>
      {message && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="flex gap-2 overflow-x-auto border-b">
        {tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`px-4 py-3 text-sm font-medium ${tab === id ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}>{label}</button>)}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title="Full cylinders" value={report?.stock?.full_cylinders || 0} icon={Flame}/>
            <Metric title="Empty cylinders" value={report?.stock?.empty_cylinders || 0} icon={ArrowLeftRight}/>
            <Metric title="Refill sales" value={money(report?.daily?.refill_sales)} icon={RefreshCw}/>
            <Metric title="Outstanding deposits" value={money(report?.outstanding_cylinder_deposits)} icon={ShoppingCart}/>
          </div>
          <Card title="Cylinder stock">
            <Table headers={["Location", "Brand", "Size", "Full", "Empty"]}>
              {stock.map((row) => <tr key={row.id} className="border-t"><td>{row.location_name}</td><td>{row.brand_name}</td><td>{row.size_name}</td><td>{row.full_quantity}</td><td>{row.empty_quantity}</td></tr>)}
            </Table>
          </Card>
          <Card title="Recent stock movements">
            <Table headers={["Date", "Transaction", "Brand", "Size", "Status", "Quantity"]}>
              {movements.map((row) => <tr key={row.id} className="border-t"><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.movement_type}</td><td>{row.brand_name}</td><td>{row.size_name}</td><td>{row.cylinder_status}</td><td>{row.quantity_delta}</td></tr>)}
            </Table>
          </Card>
        </div>
      )}

      {tab === "refill" && (
        <Card title="Record gas refill">
          <p className="mb-4 text-sm text-slate-600">
            Record the empty cylinder brand received and the full cylinder brand supplied. If the brands differ, stock records the empty under the customer’s brand and the full cylinder under the supplied brand.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); create("/gas/refills/create_refill/", { ...refill, customer_brand: refill.customer_brand || refill.brand, quantity: Number(refill.quantity), refill_price: refill.refill_price }, "Gas refill recorded."); }} className="grid gap-3 md:grid-cols-3">
            <Select value={refill.location} onChange={(v) => setRefill({...refill, location: v})} label="Location" options={locations.map(x => [x.id, x.name])}/>
            <Select value={refill.customer_brand} onChange={(v) => setRefill({...refill, customer_brand: v})} label="Customer's empty cylinder brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={refill.brand} onChange={(v) => setRefill({...refill, brand: v, customer_brand: refill.customer_brand || v})} label="Full cylinder brand supplied" options={brands.map(x => [x.id, x.name])}/>
            <Select value={refill.size} onChange={(v) => setRefill({...refill, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <Input label="Quantity" type="number" value={refill.quantity} onChange={(v) => setRefill({...refill, quantity: v})}/>
            <Input label="Refill price" type="number" value={refill.refill_price} onChange={(v) => setRefill({...refill, refill_price: v})}/>
            <Select required={false} value={refill.payment_method} onChange={(v) => setRefill({...refill, payment_method: v})} label="Payment method (optional)" options={[["CASH","Cash"],["MPESA","M-Pesa"],["BANK","Bank"],["CARD","Card"],["OTHER","Other"]]}/>
            <Input required={false} label="Customer name (optional)" value={refill.customer_name} onChange={(v) => setRefill({...refill, customer_name: v})}/>
            <Input required={false} label="Customer phone (optional)" value={refill.customer_phone} onChange={(v) => setRefill({...refill, customer_phone: v})}/>
            <Input required={false} label="Payment reference (optional)" value={refill.transaction_reference} onChange={(v) => setRefill({...refill, transaction_reference: v})}/>
            <Submit label="Record refill"/>
          </form>
        </Card>
      )}

      {tab === "exchange" && (
        <Card title="Empty cylinder exchange">
          <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            Exchange records the customer’s empty cylinder into empty stock and issues one full cylinder from full stock. For example, a 13kg Total exchange changes Full by -1 and Empty by +1. It will be rejected if there is not enough full stock.
          </div>
          <form onSubmit={(e) => { e.preventDefault(); create("/gas/exchanges/create_exchange/", { ...exchange, quantity: Number(exchange.quantity), refill_payment: exchange.refill_payment }, "Cylinder exchange recorded."); }} className="grid gap-3 md:grid-cols-3">
            <Select value={exchange.location} onChange={(v) => setExchange({...exchange, location: v})} label="Location" options={locations.map(x => [x.id, x.name])}/>
            <Select value={exchange.brand} onChange={(v) => setExchange({...exchange, brand: v})} label="Gas brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={exchange.size} onChange={(v) => setExchange({...exchange, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <Input label="Quantity" type="number" value={exchange.quantity} onChange={(v) => setExchange({...exchange, quantity: v})}/>
            <Input label="Refill/payment amount" type="number" value={exchange.refill_payment} onChange={(v) => setExchange({...exchange, refill_payment: v})}/>
            <Select required={false} value={exchange.payment_method} onChange={(v) => setExchange({...exchange, payment_method: v})} label="Payment method (optional)" options={[["CASH","Cash"],["MPESA","M-Pesa"],["BANK","Bank"],["CARD","Card"],["OTHER","Other"]]}/>
            <Input required={false} label="Customer name (optional)" value={exchange.customer_name} onChange={(v) => setExchange({...exchange, customer_name: v})}/>
            <Input required={false} label="Customer phone (optional)" value={exchange.customer_phone} onChange={(v) => setExchange({...exchange, customer_phone: v})}/>
            <Input required={false} label="Payment reference (optional)" value={exchange.transaction_reference} onChange={(v) => setExchange({...exchange, transaction_reference: v})}/>
            <Submit label="Record exchange"/>
          </form>
        </Card>
      )}

      {tab === "sale" && (
        <Card title="Sell a new or complete cylinder">
          <form onSubmit={(e) => {
            e.preventDefault();
            create("/gas/sales/create_sale/", {
              ...sale,
              quantity: Number(sale.quantity),
              selling_price: sale.selling_price,
              deposit_amount: sale.deposit_amount || "0",
              accessories: sale.status === "COMPLETE"
                ? []
                : sale.accessories.split(",").map((item) => item.trim()).filter(Boolean),
              accessory_items: sale.status === "COMPLETE"
                ? saleAccessories.map((item) => ({
                    product: Number(item.product),
                    quantity: Number(item.quantity),
                  }))
                : [],
            }, "Cylinder sale recorded.");
          }} className="grid gap-3 md:grid-cols-3">
            <Select value={sale.location} onChange={(v) => setSale({...sale, location: v})} label="Location" options={locations.map(x => [x.id, x.name])}/>
            <Select value={sale.brand} onChange={(v) => setSale({...sale, brand: v})} label="Cylinder brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={sale.size} onChange={(v) => setSale({...sale, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <Select
              value={sale.status}
              onChange={(v) => setSale({
                ...sale,
                status: v,
                includes_gas: v === "COMPLETE" ? true : sale.includes_gas,
              })}
              label="Cylinder status"
              options={[["FULL","Full"],["EMPTY","Empty"],["COMPLETE","Complete"]]}
            />
            <Input label="Quantity" type="number" min="1" step="1" value={sale.quantity} onChange={(v) => setSale({...sale, quantity: v})}/>
            <Input label={sale.status === "COMPLETE" ? "Cylinder selling price (each)" : "Selling price"} type="number" min="0" step="0.01" value={sale.selling_price} onChange={(v) => setSale({...sale, selling_price: v})}/>
            <Input required={false} label="Deposit (optional)" type="number" value={sale.deposit_amount} onChange={(v) => setSale({...sale, deposit_amount: v})}/>
            <Select required={false} value={sale.payment_method} onChange={(v) => setSale({...sale, payment_method: v})} label="Payment method (optional)" options={[["CASH","Cash"],["MPESA","M-Pesa"],["BANK","Bank"],["CARD","Card"],["OTHER","Other"]]}/>
            <Input required={false} label="Customer name (optional)" value={sale.customer_name} onChange={(v) => setSale({...sale, customer_name: v})}/>
            <Input required={false} label="Customer phone (optional)" value={sale.customer_phone} onChange={(v) => setSale({...sale, customer_phone: v})}/>
            <label className="flex items-center gap-2 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={sale.status === "COMPLETE" || sale.includes_gas}
                disabled={sale.status === "COMPLETE"}
                onChange={(e) => setSale({...sale, includes_gas: e.target.checked})}
              />
              {sale.status === "COMPLETE" ? "Complete package includes gas" : "Sale includes gas"}
            </label>
            {sale.status === "COMPLETE" ? (
              <div className="space-y-3 rounded-lg border p-3 md:col-span-3">
                <div>
                  <h3 className="font-medium text-slate-800">Choose registered accessories</h3>
                  <p className="text-sm text-slate-500">
                    Select burners, regulators, grills, or other gas products. Their registered selling prices are included in the total and their stock will be reduced.
                  </p>
                </div>
                {!gasAccessoryProducts.length && (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    No active gas accessories were found. Register them under a Gas/LPG category or type first.
                  </p>
                )}
                {saleAccessories.map((item, index) => {
                  const usedProductIds = saleAccessories
                    .filter((_, itemIndex) => itemIndex !== index)
                    .map((otherItem) => String(otherItem.product));
                  return (
                    <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_150px_auto]">
                      <label className="text-sm text-slate-600">
                        Accessory product
                        <select
                          required
                          value={item.product}
                          onChange={(event) => setSaleAccessories((current) =>
                            current.map((entry, itemIndex) => itemIndex === index
                              ? { ...entry, product: event.target.value }
                              : entry)
                          )}
                          className="mt-1 w-full rounded-lg border p-2.5"
                        >
                          <option value="">Select registered product</option>
                          {gasAccessoryProducts
                            .filter((product) =>
                              !usedProductIds.includes(String(product.id)) ||
                              String(product.id) === String(item.product)
                            )
                            .map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name} ({product.sku}) · {money(product.selling_price)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <Input
                        label="Quantity"
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(value) => setSaleAccessories((current) =>
                          current.map((entry, itemIndex) => itemIndex === index
                            ? { ...entry, quantity: value }
                            : entry)
                        )}
                      />
                      {saleAccessories.length > 1 && (
                        <button
                          type="button"
                          aria-label="Remove accessory"
                          onClick={() => setSaleAccessories((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index)
                          )}
                          className="rounded-lg border p-2.5 text-slate-500 hover:bg-slate-50"
                        >
                          <X size={18}/>
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSaleAccessories((current) => [...current, { product: "", quantity: "1" }])}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                >
                  <Plus size={16}/> Add another accessory
                </button>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p>Accessories: {money(accessoryTotal)}</p>
                  <p className="font-semibold text-slate-800">
                    Cylinder and accessories total: {money(completeSaleTotal)}
                  </p>
                </div>
              </div>
            ) : (
              <Input label="Accessories (comma separated)" value={sale.accessories} onChange={(v) => setSale({...sale, accessories: v})}/>
            )}
            <Submit label={sale.status === "COMPLETE" ? "Record complete cylinder sale" : "Record cylinder sale"}/>
          </form>
        </Card>
      )}

      {tab === "purchase" && (
        <Card title="Record gas purchase">
          <form onSubmit={(e) => { e.preventDefault(); create("/gas/purchases/create_purchase/", purchase, "Gas purchase recorded."); }} className="grid gap-3 md:grid-cols-3">
            <Select value={purchase.location} onChange={(v) => setPurchase({...purchase, location: v})} label="Destination" options={locations.map(x => [x.id, x.name])}/>
            <Select value={purchase.supplier} onChange={(v) => setPurchase({...purchase, supplier: v})} label="Supplier" options={suppliers.map(x => [x.id, x.name])}/>
            <Select value={purchase.brand} onChange={(v) => setPurchase({...purchase, brand: v})} label="Gas brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={purchase.size} onChange={(v) => setPurchase({...purchase, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <Input label="Full cylinders received" type="number" value={purchase.full_cylinders_received} onChange={(v) => setPurchase({...purchase, full_cylinders_received: v})}/>
            <Input label="Empty cylinders returned" type="number" value={purchase.empty_cylinders_returned} onChange={(v) => setPurchase({...purchase, empty_cylinders_returned: v})}/>
            <Input label="Purchase price" type="number" value={purchase.purchase_price} onChange={(v) => setPurchase({...purchase, purchase_price: v})}/>
            <Input label="Delivery date" type="date" value={purchase.delivery_date} onChange={(v) => setPurchase({...purchase, delivery_date: v})}/>
            <Input label="Invoice/reference" value={purchase.invoice_reference} onChange={(v) => setPurchase({...purchase, invoice_reference: v})}/>
            <Input label="Compliance/reference" value={purchase.compliance_reference} onChange={(v) => setPurchase({...purchase, compliance_reference: v})}/>
            <Submit label="Record purchase"/>
          </form>
        </Card>
      )}

      {tab === "stock" && (
        <Card title="Record stock entry or adjustment">
          <p className="mb-4 text-sm text-slate-600">
            Choose whether to add or remove full and empty cylinders. Adjustments are restricted to managers and administrators, cannot reduce stock below zero, and are recorded in stock movement history.
          </p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const signedQuantity = (quantity, direction) => {
              const value = Number(quantity);
              return direction === "REMOVE" ? -value : value;
            };
            create("/gas/stock/record/", {
              location: stockAdjustment.location,
              brand: stockAdjustment.brand,
              size: stockAdjustment.size,
              full_quantity: signedQuantity(stockAdjustment.full_quantity, stockAdjustment.full_direction),
              empty_quantity: signedQuantity(stockAdjustment.empty_quantity, stockAdjustment.empty_direction),
              reference: stockAdjustment.reference,
              notes: stockAdjustment.notes,
            }, "Gas stock recorded.");
          }} className="grid gap-3 md:grid-cols-3">
            <Select value={stockAdjustment.location} onChange={(v) => setStockAdjustment({...stockAdjustment, location: v})} label="Location" options={locations.map(x => [x.id, x.name])}/>
            <Select value={stockAdjustment.brand} onChange={(v) => setStockAdjustment({...stockAdjustment, brand: v})} label="Gas brand" options={brands.map(x => [x.id, x.name])}/>
            <Select value={stockAdjustment.size} onChange={(v) => setStockAdjustment({...stockAdjustment, size: v})} label="Cylinder size" options={sizes.map(x => [x.id, x.name])}/>
            <div className="grid grid-cols-2 gap-2">
              <Select value={stockAdjustment.full_direction} onChange={(v) => setStockAdjustment({...stockAdjustment, full_direction: v})} label="Full cylinders" options={[["ADD", "Add"], ["REMOVE", "Remove"]]}/>
              <Input label="Quantity" type="number" min="0" step="1" value={stockAdjustment.full_quantity} onChange={(v) => setStockAdjustment({...stockAdjustment, full_quantity: v})}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={stockAdjustment.empty_direction} onChange={(v) => setStockAdjustment({...stockAdjustment, empty_direction: v})} label="Empty cylinders" options={[["ADD", "Add"], ["REMOVE", "Remove"]]}/>
              <Input label="Quantity" type="number" min="0" step="1" value={stockAdjustment.empty_quantity} onChange={(v) => setStockAdjustment({...stockAdjustment, empty_quantity: v})}/>
            </div>
            <Input label="Reference (optional)" value={stockAdjustment.reference} onChange={(v) => setStockAdjustment({...stockAdjustment, reference: v})} required={false}/>
            <Input required={false} label="Reason for adjustment (optional)" value={stockAdjustment.notes} onChange={(v) => setStockAdjustment({...stockAdjustment, notes: v})}/>
            <Submit label="Record stock adjustment"/>
          </form>
        </Card>
      )}

      {tab === "setup" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Gas brands">
            <form onSubmit={addBrand} className="mb-4 flex gap-2">
              <input required className="flex-1 rounded-lg border p-2" placeholder="Brand name" value={brandName} onChange={(e) => setBrandName(e.target.value)}/>
              <button className="rounded-lg bg-blue-600 px-3 text-white"><Plus size={18}/>{editingBrand ? "Save" : ""}</button>
              {editingBrand && <button type="button" onClick={() => {setEditingBrand(null); setBrandName("");}} className="rounded-lg border px-3">Cancel</button>}
            </form>
            <Table headers={["Brand", "Status", "Actions"]}>
              {brands.map((item) => <tr key={item.id} className="border-t"><td className="py-2">{item.name}</td><td>{item.is_active ? "Active" : "Inactive"}</td><td><button type="button" onClick={() => {setEditingBrand(item.id); setBrandName(item.name);}} className="text-blue-700">Edit</button></td></tr>)}
              {!brands.length && <tr><td colSpan="3" className="py-3 text-slate-500">No brands yet</td></tr>}
            </Table>
          </Card>
          <Card title="Cylinder sizes">
            <form onSubmit={addSize} className="mb-4 flex flex-wrap gap-2">
              <input required className="min-w-28 flex-1 rounded-lg border p-2" placeholder="Size name (e.g. 13kg)" value={sizeName} onChange={(e) => setSizeName(e.target.value)}/>
              <input required className="w-28 rounded-lg border p-2" type="number" step="0.01" placeholder="Weight KG" value={sizeKg} onChange={(e) => setSizeKg(e.target.value)}/>
              <button className="rounded-lg bg-blue-600 px-3 text-white"><Plus size={18}/>{editingSize ? "Save" : ""}</button>
              {editingSize && <button type="button" onClick={() => {setEditingSize(null); setSizeName(""); setSizeKg("");}} className="rounded-lg border px-3">Cancel</button>}
            </form>
            <Table headers={["Size", "Weight (kg)", "Status", "Actions"]}>
              {sizes.map((item) => <tr key={item.id} className="border-t"><td className="py-2">{item.name}</td><td>{item.weight_kg}</td><td>{item.is_active ? "Active" : "Inactive"}</td><td><button type="button" onClick={() => {setEditingSize(item.id); setSizeName(item.name); setSizeKg(item.weight_kg);}} className="text-blue-700">Edit</button></td></tr>)}
              {!sizes.length && <tr><td colSpan="4" className="py-3 text-slate-500">No sizes yet</td></tr>}
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

function Metric({ title, value, icon: Icon }) { return <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{title}</p><Icon size={20} className="text-orange-500"/></div><p className="mt-2 text-2xl font-bold text-slate-800">{value}</p></div>; }
function Card({ title, children }) { return <div className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-slate-800">{title}</h2>{children}</div>; }
function Input({ label, value, onChange, type = "text", required = true, min, step }) { return <label className="text-sm text-slate-600">{label}<input required={required} type={type} min={min} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5"/></label>; }
function Select({ label, value, onChange, options, required = true }) { return <label className="text-sm text-slate-600">{label}<select required={required} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Select {label.toLowerCase()}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function Submit({ label }) { return <button type="submit" className="md:col-span-3 mt-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white">{label}</button>; }
function Table({ headers, children }) { return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-slate-500">{headers.map(h => <th key={h} className="pb-3">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
