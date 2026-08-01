"use client";

import { useEffect, useState } from "react";
import { todayKey } from "@/lib/dates";

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

export default function PlansPage() {
  const [date, setDate] = useState(todayKey());
  const [materials, setMaterials] = useState<Material[]>([]);
  const [previewMaterialId, setPreviewMaterialId] = useState("");
  const [listeningMaterialId, setListeningMaterialId] = useState("");
  const [phaseWeek, setPhaseWeek] = useState(1);
  const [nightUnlock, setNightUnlock] = useState("18:00");
  const [current, setCurrent] = useState<PlanResp | null>(null);
  const [msg, setMsg] = useState("");

  async function loadMaterials() {
    const res = await fetch("/api/materials");
    const data = (await res.json()) as Material[];
    setMaterials(data);
    if (data[0]) {
      setPreviewMaterialId((v) => v || data[0].id);
      setListeningMaterialId((v) => v || data[Math.min(1, data.length - 1)].id);
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel anim-rise p-6">
        <h2 className="brand-mark text-3xl">制定每日任务</h2>
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
          <p className="text-sm text-[var(--ink-soft)]">
            将自动创建：预习 → AI 外教 → 听力阶梯 → 晚上裸听 → 次日早餐巩固。
          </p>
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
  );
}
