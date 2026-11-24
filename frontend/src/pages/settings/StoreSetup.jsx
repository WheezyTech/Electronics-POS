import { useEffect, useState } from "react";
import { Edit, Plus, RefreshCw, Users, X } from "lucide-react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

const tabs = [
  { id: "users", label: "Team Members" },
  { id: "categories", label: "Categories" },
  { id: "product-types", label: "Product Types" },
  { id: "brands", label: "Brands" },
  { id: "units", label: "Units" },
];

const catalogLabels = {
  categories: "category",
  "product-types": "product type",
  brands: "brand",
  units: "unit",
};

const emptyUser = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  phone_number: "",
  password: "",
  role: "CASHIER",
};

const emptyCatalogItem = {
  name: "",
  abbreviation: "",
  description: "",
  is_active: true,
};

const getList = (data) => (
  Array.isArray(data) ? data : data.results || []
);

function getErrorMessage(error, fallback) {
  const data = error.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  return Object.entries(data)
    .map(([field, messages]) => {
      const message = Array.isArray(messages)
        ? messages.join(", ")
        : messages;
      return `${field}: ${message}`;
    })
    .join(" | ") || fallback;
}

async function fetchStoreData() {
  const [users, categories, productTypes, brands, units] = await Promise.all([
    api.get("/auth/users/"),
    api.get("/products/categories/"),
    api.get("/products/product-types/"),
    api.get("/products/brands/"),
    api.get("/products/units/"),
  ]);

  return {
    users: getList(users.data),
    categories: getList(categories.data),
    "product-types": getList(productTypes.data),
    brands: getList(brands.data),
    units: getList(units.data),
  };
}

export default function StoreSetup() {
  const { user } = useAuth();
  const availableRoles = user?.role === "STORE_MANAGER"
    ? ["CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR", "ACCOUNTANT", "AUDITOR"]
    : ["STORE_MANAGER", "CASHIER", "ELECTRONICS_CASHIER", "GAS_LPG_CASHIER", "SUPERVISOR", "ACCOUNTANT", "AUDITOR"];
  const [activeTab, setActiveTab] = useState("users");
  const [data, setData] = useState({
    users: [],
    categories: [],
    "product-types": [],
    brands: [],
    units: [],
  });
  const [userForm, setUserForm] = useState(emptyUser);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogItem);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      setData(await fetchStoreData());
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load store setup data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      try {
        const storeData = await fetchStoreData();
        if (active) setData(storeData);
      } catch (loadError) {
        if (active) {
          setError(
            getErrorMessage(loadError, "Unable to load store setup data.")
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  const handleUserChange = (event) => {
    const { name, value } = event.target;
    setUserForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleCatalogChange = (event) => {
    const { name, value } = event.target;
    setCatalogForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (activeTab === "users") {
        const response = await api.post("/auth/users/", {
          ...userForm,
        });
        setData((previous) => ({
          ...previous,
          users: [response.data, ...previous.users],
        }));
        setUserForm(emptyUser);
        setMessage(
          response.data?.email_verification_sent
            ? "Account created. A verification link was sent to the user’s email."
            : "Account created, but the verification email could not be sent. Resend it after configuring email delivery."
        );
      } else {
        const payload = {
          name: catalogForm.name,
          description: catalogForm.description,
          is_active: catalogForm.is_active,
        };
        if (activeTab === "units") {
          payload.abbreviation = catalogForm.abbreviation;
        }

        const response = editingItem
          ? await api.patch(
              `/products/${activeTab}/${editingItem.id}/`,
              payload
            )
          : await api.post(`/products/${activeTab}/`, payload);
        setData((previous) => ({
          ...previous,
          [activeTab]: editingItem
            ? previous[activeTab].map((item) =>
                item.id === editingItem.id ? response.data : item
              )
            : [...previous[activeTab], response.data],
        }));
        setCatalogForm(emptyCatalogItem);
        setMessage(
          `${catalogLabels[activeTab]} ${
            editingItem ? "updated" : "added"
          } successfully.`
        );
        setEditingItem(null);
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Unable to save changes."));
    } finally {
      setSaving(false);
    }
  };

  const isUsersTab = activeTab === "users";
  const activeItems = data[activeTab];

  const handleTeamMemberEmailAction = async (teamMember, action) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post(
        `/auth/users/${teamMember.id}/${action}/`
      );
      if (action === "mark-email-verified") {
        setData((previous) => ({
          ...previous,
          users: previous.users.map((member) =>
            member.id === teamMember.id
              ? {
                  ...member,
                  email_verified: true,
                  email_verification_otp: "",
                  email_verification_otp_expires_at: null,
                }
              : member
          ),
        }));
      }
      if (action === "mark-phone-verified") {
        setData((previous) => ({
          ...previous,
          users: previous.users.map((member) =>
            member.id === teamMember.id
              ? { ...member, phone_verified: true }
              : member
          ),
        }));
      }
      setMessage(response.data?.detail || "Email action completed.");
    } catch (actionError) {
      setError(getErrorMessage(actionError, "Unable to update email verification."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Setup</h1>
          <p className="mt-1 text-sm text-gray-500">
            Register team members and manage product categories, types, brands, and units.
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
      </div>

      {message && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setEditingItem(null);
              setCatalogForm(emptyCatalogItem);
              setError("");
              setMessage("");
            }}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="rounded-xl border bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            {isUsersTab ? <Users size={19} /> : <Plus size={19} />}
            <h2 className="font-semibold">
              {isUsersTab ? "Registered team members" : `Existing ${activeTab}`}
            </h2>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading...</p>
          ) : activeItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No {tabs.find((tab) => tab.id === activeTab).label.toLowerCase()} have been added yet.
            </p>
          ) : isUsersTab ? (
            <div className="divide-y">
              {activeItems.map((teamMember) => (
                <div key={teamMember.id} className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-medium text-gray-900">
                      {[teamMember.first_name, teamMember.last_name].filter(Boolean).join(" ") || teamMember.username}
                    </p>
                    <p className="text-sm text-gray-500">
                      {teamMember.email} · @{teamMember.username} · {teamMember.role}
                    </p>
                    <p className="text-xs text-gray-500">
                      Email: {teamMember.email_verified ? "Verified" : "Not verified"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Phone: {teamMember.phone_verified ? "Verified" : "Not verified"}
                    </p>
                    {!teamMember.email_verified && teamMember.email_verification_otp && (
                      <p className="mt-1 text-xs text-amber-700">
                        OTP: <span className="font-mono font-bold">{teamMember.email_verification_otp}</span>
                        {teamMember.email_verification_otp_expires_at
                          ? ` · expires ${new Date(teamMember.email_verification_otp_expires_at).toLocaleString()}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-fit rounded-full px-2.5 py-1 text-xs ${
                      teamMember.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {teamMember.is_active ? "Active" : "Inactive"}
                    </span>
                    {!teamMember.email_verified && (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            handleTeamMemberEmailAction(teamMember, "resend-verification")
                          }
                          className="rounded-lg border px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          Resend OTP
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            handleTeamMemberEmailAction(teamMember, "mark-email-verified")
                          }
                          className="rounded-lg border border-green-200 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                        >
                          Mark verified
                        </button>
                      </>
                    )}
                    {!teamMember.phone_verified && teamMember.phone_number && (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            handleTeamMemberEmailAction(teamMember, "mark-phone-verified")
                          }
                          className="rounded-lg border border-green-200 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                        >
                          Approve phone
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {activeItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {item.name}
                      {item.abbreviation && (
                        <span className="ml-2 text-sm text-gray-500">
                          ({item.abbreviation})
                        </span>
                      )}
                    </p>
                    {item.description && (
                      <p className="mt-1 text-sm text-gray-500">
                        {item.description}
                      </p>
                    )}
                    <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs ${
                      item.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(item);
                      setCatalogForm({
                        name: item.name,
                        abbreviation: item.abbreviation || "",
                        description: item.description || "",
                        is_active: item.is_active,
                      });
                      setError("");
                      setMessage("");
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <Edit size={14} />
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <form onSubmit={handleSubmit} className="h-fit space-y-4 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">
            {isUsersTab
              ? "Register a team member"
              : `${editingItem ? "Edit" : "Add"} ${catalogLabels[activeTab]}`}
          </h2>

          {isUsersTab ? (
            <>
              <label className="block text-sm font-medium text-gray-700">
                Username
                <input
                  required
                  name="username"
                  value={userForm.username}
                  onChange={handleUserChange}
                  autoComplete="username"
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Email
                <input
                  required
                  type="email"
                  name="email"
                  value={userForm.email}
                  onChange={handleUserChange}
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  First name
                  <input
                    name="first_name"
                    value={userForm.first_name}
                    onChange={handleUserChange}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Last name
                  <input
                    name="last_name"
                    value={userForm.last_name}
                    onChange={handleUserChange}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Phone number
                <input
                  name="phone_number"
                  value={userForm.phone_number}
                  onChange={handleUserChange}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Temporary password
                <input
                  required
                  type="password"
                  name="password"
                  value={userForm.password}
                  onChange={handleUserChange}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Account role
                <select
                  required
                  name="role"
                  value={userForm.role}
                  onChange={handleUserChange}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                >
                  {availableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-gray-500">
                An email verification link will be sent before password recovery is enabled.
              </p>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700">
                Name
                <input
                  required
                  name="name"
                  value={catalogForm.name}
                  onChange={handleCatalogChange}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                />
              </label>
              {activeTab === "units" && (
                <label className="block text-sm font-medium text-gray-700">
                  Abbreviation
                  <input
                    required
                    name="abbreviation"
                    value={catalogForm.abbreviation}
                    onChange={handleCatalogChange}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                  />
                </label>
              )}
              <label className="block text-sm font-medium text-gray-700">
                Description
                <textarea
                  name="description"
                  rows={3}
                  value={catalogForm.description}
                  onChange={handleCatalogChange}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(catalogForm.is_active)}
                  onChange={(event) =>
                    setCatalogForm((previous) => ({
                      ...previous,
                      is_active: event.target.checked,
                    }))
                  }
                />
                Active
              </label>
            </>
          )}

          {!isUsersTab && editingItem && (
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setCatalogForm(emptyCatalogItem);
                setError("");
                setMessage("");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm hover:bg-gray-50"
            >
              <X size={16} />
              Cancel editing
            </button>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={16} />
            {saving
              ? "Saving..."
              : isUsersTab
                ? "Register account"
                : editingItem
                  ? "Save changes"
                  : "Add"}
          </button>
        </form>
      </div>
    </div>
  );
}
