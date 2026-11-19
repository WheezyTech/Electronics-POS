
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Users,
  Phone,
  ShoppingBag,
  Wallet,
  RefreshCw,
  Eye,
  X,
} from "lucide-react";
import api from "../../api/axios";

export default function Customers() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const getSales = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/sales/sales/", {
        params: { page_size: 1000 },
      });

      const data = response.data;
      const records = Array.isArray(data)
        ? data
        : data.results || [];

      setSales(records);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Failed to load customer records."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getSales();
  }, []);

  const customers = useMemo(() => {
    const customerMap = new Map();

    sales.forEach((sale) => {
      const name = sale.customer_name?.trim();
      const phone = sale.customer_phone?.trim();

      if (!name && !phone) return;

      const key = phone || name.toLowerCase();

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: name || "Unnamed Customer",
          phone: phone || "No phone number",
          purchases: 0,
          totalSpent: 0,
          lastPurchase: null,
          sales: [],
        });
      }

      const customer = customerMap.get(key);

      if (sale.status === "COMPLETED") {
        customer.purchases += 1;
        customer.totalSpent += Number(sale.total_amount || 0);

        const purchaseDate = sale.completed_at || sale.created_at;

        if (
          purchaseDate &&
          (!customer.lastPurchase ||
            new Date(purchaseDate) > new Date(customer.lastPurchase))
        ) {
          customer.lastPurchase = purchaseDate;
        }
      }

      customer.sales.push(sale);
    });

    return Array.from(customerMap.values()).sort(
      (a, b) => b.totalSpent - a.totalSpent
    );
  }, [sales]);

  const filteredCustomers = customers.filter((customer) => {
    const term = search.toLowerCase();

    return (
      customer.name.toLowerCase().includes(term) ||
      customer.phone.toLowerCase().includes(term)
    );
  });

  const totalCustomers = customers.length;

  const totalPurchases = customers.reduce(
    (sum, customer) => sum + customer.purchases,
    0
  );

  const totalRevenue = customers.reduce(
    (sum, customer) => sum + customer.totalSpent,
    0
  );

  const formatMoney = (amount) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2,
    }).format(amount || 0);

  const formatDate = (date) =>
    date
      ? new Date(date).toLocaleDateString("en-KE", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "No completed purchases";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Customers
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            View customers and their purchase history.
          </p>
        </div>

        <button
          onClick={getSales}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Customers</p>
              <h2 className="mt-2 text-2xl font-bold">
                {totalCustomers}
              </h2>
            </div>
            <Users className="text-blue-600" size={28} />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Completed Purchases</p>
              <h2 className="mt-2 text-2xl font-bold">
                {totalPurchases}
              </h2>
            </div>
            <ShoppingBag className="text-green-600" size={28} />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Customer Revenue</p>
              <h2 className="mt-2 text-xl font-bold">
                {formatMoney(totalRevenue)}
              </h2>
            </div>
            <Wallet className="text-purple-600" size={28} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-gray-900">
            Customer Directory
          </h2>

          <div className="relative w-full sm:max-w-sm">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone..."
              className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {error && (
          <div className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Loading customers...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="font-medium text-gray-700">
              No customers found
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Customers will appear here when sales contain customer details.
            </p>
          </div>
        ) : (
          <div className="responsive-table-wrap overflow-x-auto">
            <table className="responsive-table w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Purchases</th>
                  <th className="px-5 py-3 font-medium">Total Spent</th>
                  <th className="px-5 py-3 font-medium">Last Purchase</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredCustomers.map((customer, index) => (
                  <tr key={`${customer.phone}-${index}`} className="hover:bg-gray-50">
                    <td data-label="Customer" className="px-5 py-4 font-medium text-gray-900">
                      {customer.name}
                    </td>

                    <td data-label="Phone" className="px-5 py-4 text-gray-600">
                      {customer.phone}
                    </td>

                    <td data-label="Purchases" className="px-5 py-4">
                      {customer.purchases}
                    </td>

                    <td data-label="Total spent" className="px-5 py-4 font-semibold text-gray-900">
                      {formatMoney(customer.totalSpent)}
                    </td>

                    <td data-label="Last purchase" className="px-5 py-4 text-gray-600">
                      {formatDate(customer.lastPurchase)}
                    </td>

                    <td data-mobile-action className="px-5 py-4 text-right">
                      <button
                        onClick={() => setSelectedCustomer(customer)}
                        className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-100"
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-bold">
                  {selectedCustomer.name}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Customer purchase history
                </p>
              </div>

              <button
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Phone</p>
                <p className="mt-2 flex items-center gap-2 font-medium">
                  <Phone size={15} />
                  {selectedCustomer.phone}
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Purchases</p>
                <p className="mt-2 text-xl font-bold">
                  {selectedCustomer.purchases}
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Total Spent</p>
                <p className="mt-2 text-lg font-bold">
                  {formatMoney(selectedCustomer.totalSpent)}
                </p>
              </div>
            </div>

            <div className="px-5 pb-5">
              <h3 className="mb-3 font-semibold">Sales History</h3>

              <div className="responsive-table-wrap overflow-x-auto rounded-lg border">
                <table className="responsive-table w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Amount</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {selectedCustomer.sales.map((sale) => (
                      <tr key={sale.id}>
                        <td data-label="Reference" className="px-4 py-3">
                          {sale.reference || sale.id}
                        </td>
                        <td data-label="Date" className="px-4 py-3">
                          {formatDate(sale.completed_at || sale.created_at)}
                        </td>
                        <td data-label="Status" className="px-4 py-3">
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                            {sale.status}
                          </span>
                        </td>
                        <td data-label="Amount" className="px-4 py-3 font-medium">
                          {formatMoney(sale.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
