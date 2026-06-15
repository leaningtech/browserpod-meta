const DB_NAME = 'browserpod-pdf-studio';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const KEY = 'latest';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function withStore(mode, handler) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = handler(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export function getSessionBundle() {
  return withStore('readonly', (store) => store.get(KEY));
}

export function saveSessionBundle(bundle) {
  return withStore('readwrite', (store) => store.put(bundle, KEY));
}

export function clearSessionBundle() {
  return withStore('readwrite', (store) => store.delete(KEY));
}
