"use client";

/** 与 /api/child/today 响应一致 */
export type ChildTodayTask = {
  id: string;
  type: string;
  status: string;
  materialId?: string | null;
  durationMin?: number;
  unlockAfter?: string | null;
  scheduledFor?: string | null;
  progressJson?: string;
  material?: {
    title: string;
    scriptText?: string;
    audioPath?: string | null;
    vocabularies?: { word: string; meaning: string; phonetic?: string }[];
  } | null;
  [key: string]: unknown;
};

export type ChildTodayData = {
  child: { name: string; streak: number; phaseWeek: number };
  date: string;
  plan: null | {
    id: string;
    phaseWeek: number;
    tasks: ChildTodayTask[];
  };
  breakfastTask: ChildTodayTask | null;
};

type CacheEnvelope = {
  date: string;
  data: ChildTodayData;
};

const STORAGE_KEY = "study-english:child-today:v1";

export function clientTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readEnvelope(): CacheEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed?.date || !parsed?.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 日期变更时清除前一天的「任务列表」缓存（音频缓存按材料 ID 单独管理） */
export function clearStaleChildTodayCache() {
  if (typeof window === "undefined") return;
  const today = clientTodayKey();
  const env = readEnvelope();
  if (env && env.date !== today) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** 今日计划里仍会出现的学习材料 ID（含早餐巩固用的昨日材料） */
export function collectActiveMaterialIds(data: ChildTodayData): string[] {
  const ids = new Set<string>();
  for (const task of data.plan?.tasks ?? []) {
    if (task.materialId) ids.add(task.materialId);
  }
  if (data.breakfastTask?.materialId) {
    ids.add(data.breakfastTask.materialId);
  }
  return [...ids];
}

async function syncAudioCacheForToday(data: ChildTodayData) {
  const ids = collectActiveMaterialIds(data);
  if (!ids.length) return;
  const { syncAudioCacheWithMaterials } = await import("@/lib/audio-cache");
  await syncAudioCacheWithMaterials(ids);
}

export function getCachedChildToday(): ChildTodayData | null {
  clearStaleChildTodayCache();
  const today = clientTodayKey();
  const env = readEnvelope();
  if (env?.date === today) {
    void syncAudioCacheForToday(env.data);
    return env.data;
  }
  return null;
}

export function setCachedChildToday(data: ChildTodayData) {
  if (typeof window === "undefined") return;
  const envelope: CacheEnvelope = {
    date: data.date || clientTodayKey(),
    data,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  void syncAudioCacheForToday(data);
}

export async function fetchChildToday(options?: { force?: boolean }): Promise<ChildTodayData> {
  clearStaleChildTodayCache();

  if (!options?.force) {
    const hit = getCachedChildToday();
    if (hit) return hit;
  }

  const res = await fetch("/api/child/today", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`加载失败（${res.status}）`);
  }
  const data = (await res.json()) as ChildTodayData;
  setCachedChildToday(data);
  return data;
}

type ProgressPatchPayload = {
  plan?: {
    tasks?: ChildTodayTask[];
    child?: { name: string; streak: number; phaseWeek: number };
  };
  task?: ChildTodayTask;
};

/** 进度保存成功后，把最新任务状态写回当日缓存 */
export function applyProgressToTodayCache(payload: ProgressPatchPayload) {
  const cached = getCachedChildToday();
  if (!cached?.plan || !payload.plan?.tasks) return;

  const byId = new Map(payload.plan.tasks.map((t) => [t.id, t]));
  const tasks = cached.plan.tasks.map((t) => byId.get(t.id) ?? t);

  let breakfastTask = cached.breakfastTask;
  if (payload.task?.type === "BREAKFAST_REVIEW") {
    breakfastTask = payload.task;
  } else if (breakfastTask && byId.has(breakfastTask.id)) {
    breakfastTask = byId.get(breakfastTask.id)!;
  }

  const child = payload.plan.child
    ? {
        name: payload.plan.child.name,
        streak: payload.plan.child.streak,
        phaseWeek: payload.plan.child.phaseWeek,
      }
    : cached.child;

  setCachedChildToday({
    ...cached,
    child,
    plan: { ...cached.plan, tasks },
    breakfastTask,
  });
}

export async function patchChildTaskProgress(
  taskId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: ProgressPatchPayload } | { ok: false; error: string }> {
  const res = await fetch(`/api/tasks/${taskId}/progress`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ProgressPatchPayload & { error?: string };
  if (!res.ok) {
    return { ok: false, error: data.error || "保存失败" };
  }
  applyProgressToTodayCache(data);
  return { ok: true, data };
}
