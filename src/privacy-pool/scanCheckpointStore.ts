/**
 * Encrypted scan checkpoints returned by the pool worker, kept in IndexedDB on
 * this device only. The worker encrypts and authenticates them with a key
 * derived from the private wallet; this page stores the opaque string.
 */
const DATABASE = 'neurai-privacy';
const STORE = 'scan-checkpoints';

export interface ScanCheckpointStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Checkpoint storage is blocked by another tab'));
  });
}

async function withStore<T>(factory: IDBFactory, mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Checkpoint storage aborted'));
    });
  } finally {
    database.close();
  }
}

function indexedDbFactory(): IDBFactory | undefined {
  try { return globalThis.indexedDB; } catch { return undefined; }
}

/** Null when the browser has no IndexedDB, for example in some private modes. */
export function scanCheckpointStore(): ScanCheckpointStore | null {
  const factory = indexedDbFactory();
  if (!factory) return null;
  return {
    async get(key) {
      const value = await withStore(factory, 'readonly', store => store.get(key));
      return typeof value === 'string' ? value : undefined;
    },
    async set(key, value) {
      await withStore(factory, 'readwrite', store => store.put(value, key));
    },
  };
}
