const DATABASE_NAME = "electronics-pos-offline";
const DATABASE_VERSION = 1;
const PENDING_SALES_STORE = "pendingSales";
const PRODUCTS_STORE = "cachedProducts";
const LOCATIONS_STORE = "cachedLocations";

let syncInProgress = false;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore(PENDING_SALES_STORE, {
        keyPath: "reference",
      });
      database.createObjectStore(PRODUCTS_STORE, { keyPath: "key" });
      database.createObjectStore(LOCATIONS_STORE, { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact(storeName, mode, execute) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;

    execute(store, (value) => {
      result = value;
    }, reject);

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function savePendingSale(sale) {
  if (navigator.storage?.persist) {
    await navigator.storage.persist();
  }

  return transact(PENDING_SALES_STORE, "readwrite", (store) => {
    store.put({ ...sale, sync_status: "PENDING" });
  });
}

export function getPendingSales() {
  return transact(PENDING_SALES_STORE, "readonly", (store, setResult, reject) => {
    const request = store.getAll();
    request.onsuccess = () => setResult(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function removePendingSale(reference) {
  return transact(PENDING_SALES_STORE, "readwrite", (store) => {
    store.delete(reference);
  });
}

export function cacheProducts(locationId, products) {
  return transact(PRODUCTS_STORE, "readwrite", (store) => {
    products.forEach((product) => {
      store.put({
        key: `${locationId}:${product.id}`,
        product,
      });
    });
  });
}

export function getCachedProducts(locationId) {
  return transact(PRODUCTS_STORE, "readonly", (store, setResult, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      setResult(
        request.result
          .filter((entry) => entry.key.startsWith(`${locationId}:`))
          .map((entry) => entry.product)
      );
    };
    request.onerror = () => reject(request.error);
  });
}

export function cacheLocations(locations) {
  return transact(LOCATIONS_STORE, "readwrite", (store) => {
    locations.forEach((location) => store.put(location));
  });
}

export function getCachedLocations() {
  return transact(LOCATIONS_STORE, "readonly", (store, setResult, reject) => {
    const request = store.getAll();
    request.onsuccess = () => setResult(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function syncSale(api, pendingSale) {
  if (!pendingSale.offline_authorization_id) {
    throw new Error(
      `Sale ${pendingSale.reference} has no offline authorization and remains pending.`
    );
  }

  let saleId = pendingSale.remote_sale_id;
  let remoteSale;

  if (saleId) {
    try {
      const response = await api.get(`/sales/sales/${saleId}/`);
      remoteSale = response.data?.sale || response.data;
    } catch (error) {
      if (error.response?.status !== 404) throw error;
      saleId = null;
    }
  }

  if (!saleId) {
    const response = await api.post("/sales/sales/", {
      reference: pendingSale.reference,
      location: pendingSale.location,
      customer_name: pendingSale.customer_name,
      customer_phone: pendingSale.customer_phone,
      discount_amount: pendingSale.discount_amount,
      tax_amount: pendingSale.tax_amount,
      client_completed_at: pendingSale.completed_at,
      offline_authorization: pendingSale.offline_authorization_id,
    });
    remoteSale = response.data?.sale || response.data;
    saleId = remoteSale.id;
    pendingSale.remote_sale_id = saleId;
    await savePendingSale(pendingSale);
  }

  if (remoteSale?.status !== "COMPLETED") {
    const detailResponse = await api.get(`/sales/sales/${saleId}/`);
    remoteSale = detailResponse.data?.sale || detailResponse.data;

    if (remoteSale.status !== "DRAFT") {
      throw new Error(`Sale ${pendingSale.reference} is not a draft.`);
    }

    const saleUpdates = {};
    if (!remoteSale.client_completed_at) {
      saleUpdates.client_completed_at = pendingSale.completed_at;
    }
    if (!remoteSale.offline_authorization) {
      saleUpdates.offline_authorization =
        pendingSale.offline_authorization_id;
    } else if (
      Number(remoteSale.offline_authorization) !==
      Number(pendingSale.offline_authorization_id)
    ) {
      throw new Error(
        `Sale ${pendingSale.reference} is linked to a different offline authorization.`
      );
    }
    if (Object.keys(saleUpdates).length) {
      await api.patch(`/sales/sales/${saleId}/`, saleUpdates);
    }

    for (const item of pendingSale.items) {
      const existing = (remoteSale.items || []).find(
        (remoteItem) => String(remoteItem.product) === String(item.product)
      );
      const payload = {
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount,
      };

      if (existing) {
        await api.patch(
          `/sales/sales/${saleId}/items/${existing.id}/`,
          payload
        );
      } else {
        await api.post(`/sales/sales/${saleId}/items/`, {
          product: item.product,
          ...payload,
        });
      }
    }

    await api.post(`/sales/sales/${saleId}/checkout/`, {
      payments: pendingSale.payments,
    });
  }

  const receiptResponse = await api.get(
    `/sales/sales/${saleId}/receipt/`
  );
  const receipt = receiptResponse.data?.sale || receiptResponse.data;
  await removePendingSale(pendingSale.reference);
  window.dispatchEvent(new CustomEvent("offline-sale-synced", {
    detail: { reference: pendingSale.reference, receipt },
  }));
  return receipt;
}

export async function syncPendingSales(api) {
  if (syncInProgress || !navigator.onLine) {
    return { synced: [], failed: [] };
  }

  syncInProgress = true;
  try {
    const pendingSales = (await getPendingSales()).sort(
      (left, right) =>
        Date.parse(left.created_at) - Date.parse(right.created_at)
    );
    const synced = [];
    const failed = [];

    for (const sale of pendingSales) {
      try {
        synced.push(await syncSale(api, sale));
      } catch (error) {
        const syncError =
          error.response?.data?.detail ||
          error.response?.data?.error ||
          error.message ||
          "The sale could not be synchronized.";
        await savePendingSale({ ...sale, sync_error: syncError });
        failed.push({ reference: sale.reference, error });
      }
    }

    return { synced, failed };
  } finally {
    syncInProgress = false;
  }
}
