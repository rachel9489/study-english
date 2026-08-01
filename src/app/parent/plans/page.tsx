"use client";

import { useEffect, useMemo, useState } from "react";
import { addDaysKey, todayKey } from "@/lib/dates";

type Material = { id: string; title: string; category: string };
type PlanResp = {
  plan: null | {
    id: string;
    date: string;
    phaseWeek: number;
    nightUnlock: string;
    tasks: { id: string; type: string; status: string; material?: { title: string } | null }[];
  };
  child: { name: string; phaseWeek: number };
};

type WeekRow = {
  date: string;
  phaseWeek: number;
  previewMaterialId: string;
  listeningMaterialId: string;
};

function buildWeekRows(startDate: string, phaseWeek: number, materials: Material[]): WeekRow[] {
  const preview = materials[0]?.id ?? "";
  const listening = materials[Math.min(1, materials.length - 1)]?.id ?? preview;
  return Array.from({ length: 7 }, (_, i) => ({
    date: addDaysKey(startDate, i),
    phaseWeek: Math.min(8, phaseWeek + i),
    previewMaterialId: preview,
    listeningMaterialId: listening,
  }));
}

export default function PlansPage() {
  const [date, setDate] = useState(todayKey());
  const [materials, setMaterials] = useState<Material[]>([]);
  const [previewMaterialId, setPreviewMaterialId] = useState("");
  const [listeningMaterialId, setListeningMaterialId] = useState("");
  const [phaseWeek, setPhaseWeek] = useState(1);
  const [nightUnlock, setNightUnlock] = useState("18:00");
  const [current, setCurrent] = useState<PlanResp | null>(null);
  const [msg, setMsg] = useState("");

  const [weekStart, setWeekStart] = useState(todayKey());
  const [weekRows, setWeekRows] = useState<WeekRow[]>([]);
  const [weekMsg, setWeekMsg] = useState("");

  async function loadMaterials() {
    const res = await fetch("/api/materials");
    const data = (await res.json()) as Material[];
    setMaterials(data);
    if (data[0]) {
      setPreviewMaterialId((v) => v || data[0].id);
      setListeningMaterialId((v) => v || data[Math.min(1, data.length - 1)].id);
      setWeekRows((rows) =>
        rows.length ? rows : buildWeekRows(weekStart, phaseWeek, data),
      );
    }
  }

  async function loadPlan(d = date) {
    const res = await fetch(`/api/plans?date=${d}`);
    const data = (await res.json()) as PlanResp;
    setCurrent(data);
    if (data.child?.phaseWeek) setPhaseWeek(data.child.phaseWeek);
  }

  useEffect(() => {
    void loadMaterials();
  }, []);

  useEffect(() => {
    void loadPlan(date);
  }, [date]);

  useEffect(() => {
    if (materials.length) {
      setWeekRows(buildWeekRows(weekStart, phaseWeek, materials));
    }
  }, [weekStart, phaseWeek, materials]);

  async function savePlan() {
    setMsg("");
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        phaseWeek,
        previewMaterialId,
        listeningMaterialId,
        forceOrder: true,
        nightUnlock,
      }),
    });
    if (!res.ok) {
      setMsg("排课失败，请检查资料是否已选择");
      return;
    }
    setMsg("排课成功！孩子端可开始学习。");
    await loadPlan(date);
  }

  async function saveWeek() {
    setWeekMsg("");
    const res = await fetch("/api/plans/week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days: weekRows,
        forceOrder: true,
        nightUnlock,
      }),
    });
    if (!res.ok) {
      setWeekMsg("批量排课失败，请检查每一天的材料");
      return;
    }
    const data = (await res.json()) as { count: number };
    setWeekMsg(`已生成 ${data.count} 天计划。孩子 10:00 前做早餐巩固，之后学新内容。`);
    await loadPlan(date);
  }

  function updateWeekRow(index: number, patch: Partial<WeekRow>) {
    setWeekRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const weekRangeLabel = useMemo(() => {
    if (!weekRows.length) return "";
    return `${weekRows[0].date} ～ ${weekRows[weekRows.length - 1].date}`;
  }, [weekRows]);

  return (
    <div className="space-y-6">
      <section className="panel anim-rise p-6">
        <h2 className="brand-mark text-3xl">一次排课 · 一整周</h2>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          每天自动生成 5 步任务；次日早餐巩固可在 10:00 前完成，10:00 后解锁当日新计划（早餐未做完仍可补做）。
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm text-[var(--ink-soft)]">本周起始日</label>
            <input
              type="date"
              className="field mt-1"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--ink-soft)]">起始听力周次</label>
            <input
              type="number"
              min={1}
              max={8}
              className="field mt-1 w-24"
              value={phaseWeek}
              onChange={(e) => setPhaseWeek(Number(e.target.value))}
            />
          </div>
          <button type="button" className="btn btn-accent" onClick={() => void saveWeek()}>
            生成本周 7 天计划
          </button>
        </div>
        {weekMsg ? <p className="mt-3 text-[var(--brand-deep)]">{weekMsg}</p> : null}
        <p className="mt-2 text-sm text-[var(--ink-soft)]">{weekRangeLabel}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-[var(--ink-soft)]">
                <th className="pb-2 pr-2">日期</th>
                <th className="pb-2 pr-2">周次</th>
                <th className="pb-2 pr-2">预习 + AI 外教</th>
                <th className="pb-2">听力阶梯</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((row, i) => (
                <tr key={row.date} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-2 font-mono">{row.date}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={1}
                      max={8}
                      className="field w-16"
                      value={row.phaseWeek}
                      onChange={(e) =>
                        updateWeekRow(i, { phaseWeek: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      className="field"
                      value={row.previewMaterialId}
                      onChange={(e) =>
                        updateWeekRow(i, { previewMaterialId: e.target.value })
                      }
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <select
                      className="field"
                      value={row.listeningMaterialId}
                      onChange={(e) =>
                        updateWeekRow(i, { listeningMaterialId: e.target.value })
                      }
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel anim-rise p-6">
          <h2 className="brand-mark text-3xl">单日调整</h2>
          <div className="mt-5 space-y-3">
            <label className="block text-sm text-[var(--ink-soft)]">日期</label>
            <input
              type="date"
              className="field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <label className="block text-sm text-[var(--ink-soft)]">当前听力阶梯周次（1-8）</label>
            <input
              type="number"
              min={1}
              max={8}
              className="field"
              value={phaseWeek}
              onChange={(e) => setPhaseWeek(Number(e.target.value))}
            />
            <label className="block text-sm text-[var(--ink-soft)]">预习 + AI 外教材料</label>
            <select
              className="field"
              value={previewMaterialId}
              onChange={(e) => setPreviewMaterialId(e.target.value)}
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}（{m.category}）
                </option>
              ))}
            </select>
            <label className="block text-sm text-[var(--ink-soft)]">听力阶梯材料</label>
            <select
              className="field"
              value={listeningMaterialId}
              onChange={(e) => setListeningMaterialId(e.target.value)}
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}（{m.category}）
                </option>
              ))}
            </select>
            <label className="block text-sm text-[var(--ink-soft)]">课后裸听解锁时间</label>
            <input
              type="time"
              className="field"
              value={nightUnlock}
              onChange={(e) => setNightUnlock(e.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={() => void savePlan()}>
              生成 / 覆盖当日任务
            </button>
            {msg ? <p className="text-[var(--brand-deep)]">{msg}</p> : null}
          </div>
        </section>

        <section className="panel anim-rise p-6">
          <h2 className="brand-mark text-3xl">当日任务预览</h2>
          {!current?.plan ? (
            <p className="mt-5 text-[var(--ink-soft)]">该日尚未排课。</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {current.plan.tasks.map((t, i) => (
                <li key={t.id} className="rounded-2xl bg-white/70 px-4 py-3">
                  <div className="flex justify-between gap-3">
                    <strong>
                      {i + 1}. {t.type}
                    </strong>
                    <span className="badge">{t.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{t.material?.title}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
