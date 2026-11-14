/**
 * StorageService — a tiny typed wrapper over a key/value store.
 * In the browser/Electron renderer this is localStorage; in tests and Node it
 * falls back to memory. A future version can persist to a SQLite file via IPC
 * by implementing the same `KeyValueStore` interface.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function browserStore(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return null;
    const probe = '__kelmo_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export class StorageService {
  private store: KeyValueStore;
  private readonly prefix: string;

  constructor(store?: KeyValueStore, prefix = 'kelmo:v1:') {
    this.store = store ?? browserStore() ?? new MemoryStore();
    this.prefix = prefix;
  }

  read<T>(key: string, fallback: T): T {
    try {
      const raw = this.store.getItem(this.prefix + key);
      if (raw == null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  write<T>(key: string, value: T): boolean {
    try {
      this.store.setItem(this.prefix + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    try {
      this.store.removeItem(this.prefix + key);
    } catch {
      /* ignore */
    }
  }
}

export const storage = new StorageService();
