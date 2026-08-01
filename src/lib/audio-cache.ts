"use client";

const CACHE_VERSION = "v1";
const DB_NAME = "study-english-audio-v1";
const STORE = "tts";

type StoredEntry = {
  blob: Blob;
  materialId: string;
  lastUsedAt: number;
};

const memory = new Map<string, Blob>();
const inFlight = new Map<string, Promise<Blob>>();

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function hashText(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/** 缓存 key：学习材料 ID + 文本 + 语速（不含日期，便于早餐巩固复用昨日音频） */
export function buildTtsCacheKey(text: string, rate: number, materialId?: string) {
  const normalized = normalizeText(text);
  const textHash = hashText(normalized);
  const mid = materialId?.trim() || `t${textHash}`;
  const rateKey = rate.toFixed(2);
  return `${mid}|${textHash}|r${rateKey}|${CACHE_VERSION}`;
}

function materialIdFromKey(key: string) {
  return key.split("|")[0] ?? "";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

async function idbGet(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as StoredEntry | undefined;
        resolve(row?.blob ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPut(key: string, blob: Blob, materialId: string) {
  if (blob.size > 2 * 1024 * 1024) return;
  try {
    const db = await openDb();
    const entry: StoredEntry = {
      blob,
      materialId,
      lastUsedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(entry, key);
    });
  } catch {
    // 隐私模式或配额满时跳过持久化
  }
}

async function idbDeleteKeys(keys: string[]) {
  if (!keys.length) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const key of keys) {
        store.delete(key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

async function idbKeysNotIn(active: Set<string>): Promise<string[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const stale: string[] = [];
      const tx = db.transaction(STORE, "readonly");
      const cursorReq = tx.objectStore(STORE).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const row = cursor.value as StoredEntry;
        const key = String(cursor.key);
        const mid = row.materialId || materialIdFromKey(key);
        if (!active.has(mid)) {
          stale.push(key);
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(stale);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return [];
  }
}

/**
 * 加载今日计划后同步音频缓存：只保留「今日任务 + 早餐巩固」仍会用到的材料。
 * 不在列表里的旧材料（例如已完成早餐、已换新材料）才会被清掉。
 */
export async function syncAudioCacheWithMaterials(materialIds: string[]) {
  if (typeof window === "undefined") return;
  const active = new Set(materialIds.filter(Boolean));
  if (active.size === 0) return;

  for (const key of memory.keys()) {
    if (!active.has(materialIdFromKey(key))) {
      memory.delete(key);
    }
  }

  const stale = await idbKeysNotIn(active);
  await idbDeleteKeys(stale);
}

async function fetchTtsBlob(text: string, rate: number) {
  const res = await fetch("/api/ai/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed: Math.min(1.5, Math.max(0.7, rate)) }),
  });
  if (!res.ok) throw new Error("云端朗读失败");
  return res.blob();
}

export type TtsCacheOptions = {
  /** 学习材料 ID（LearningMaterial.id），同一天/早餐巩固共用同一 ID */
  materialId?: string;
};

/** L1 内存 → L2 IndexedDB → 网络；同 key 并发请求合并 */
export async function getOrFetchTts(
  text: string,
  rate: number,
  opts?: TtsCacheOptions,
): Promise<Blob> {
  const key = buildTtsCacheKey(text, rate, opts?.materialId);
  const mid = opts?.materialId?.trim() || materialIdFromKey(key);

  const hit = memory.get(key);
  if (hit) return hit;

  const stored = await idbGet(key);
  if (stored) {
    memory.set(key, stored);
    return stored;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = fetchTtsBlob(text, rate)
    .then((blob) => {
      memory.set(key, blob);
      void idbPut(key, blob, mid);
      return blob;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, task);
  return task;
}
