const DB_NAME = 'bee-offline';
const DB_VERSION = 1;
const STORE_OPERATIONS = 'operations';

let dbPromise;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_OPERATIONS)) {
        database.createObjectStore(STORE_OPERATIONS, { keyPath: 'id' });
      }
    };
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error);
  });
  return dbPromise;
}

export async function initOfflineStorage() {
  await openDatabase();
}

export async function queueOperation(operation) {
  const database = await openDatabase();
  const tx = database.transaction(STORE_OPERATIONS, 'readwrite');
  const store = tx.objectStore(STORE_OPERATIONS);
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    operation
  };
  store.put(record);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(record);
    tx.onerror = event => reject(event.target.error);
  });
}

export async function listOperations() {
  const database = await openDatabase();
  const tx = database.transaction(STORE_OPERATIONS, 'readonly');
  const store = tx.objectStore(STORE_OPERATIONS);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = event => resolve(event.target.result || []);
    request.onerror = event => reject(event.target.error);
  });
}

export async function removeOperation(id) {
  const database = await openDatabase();
  const tx = database.transaction(STORE_OPERATIONS, 'readwrite');
  const store = tx.objectStore(STORE_OPERATIONS);
  store.delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = event => reject(event.target.error);
  });
}
