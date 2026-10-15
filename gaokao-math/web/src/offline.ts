// 离线作答队列：断网时把作答存进 IndexedDB，联网后批量同步到服务器判分。
import { api } from "./api";

const DB = "gm-offline";
const STORE = "attempts";

export interface QueuedAttempt {
  id?: number;
  question_id: string;
  response: Record<string, unknown>;
  seconds: number;
  hints_used: number;
  revealed: boolean;
  confidence: string;
  answered_at: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const listeners = new Set<(n: number) => void>();

export function onQueueChange(fn: (n: number) => void): () => void {
  listeners.add(fn);
  queueSize().then(fn).catch(() => {});
  return () => listeners.delete(fn);
}

async function notify() {
  const n = await queueSize().catch(() => 0);
  listeners.forEach((fn) => fn(n));
}

export async function enqueue(item: QueuedAttempt): Promise<void> {
  await tx("readwrite", (s) => s.add(item));
  await notify();
}

export function queueSize(): Promise<number> {
  return tx("readonly", (s) => s.count());
}

let flushing = false;

/** 把队列里的作答发给服务器。返回同步了多少题、其中全对多少题。 */
export async function flush(): Promise<{ synced: number; correct: number } | null> {
  if (flushing || !navigator.onLine) return null;
  flushing = true;
  try {
    const items = (await tx("readonly", (s) => s.getAll())) as QueuedAttempt[];
    if (!items.length) return null;
    const r = await api<{ results: { full: boolean }[]; skipped: string[] }>("/attempts/batch", {
      body: { attempts: items.map(({ id: _id, ...rest }) => rest) },
    });
    for (const item of items) await tx("readwrite", (s) => s.delete(item.id!));
    await notify();
    return { synced: r.results.length, correct: r.results.filter((x) => x.full).length };
  } catch {
    return null; // 还是连不上，下次再试
  } finally {
    flushing = false;
  }
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || !navigator.onLine;
}
