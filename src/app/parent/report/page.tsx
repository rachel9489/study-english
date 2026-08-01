"use client";

import { useEffect, useState } from "react";

type Report = {
  child: { name: string; streak: number; phaseWeek: number };
  summary: {
    date: string;
    phaseWeek: number;
    completed: number;
    total: number;
    rate: number;
    tasks: { type: string; status: string; title: string }[];
  }[];
};

export default function ReportPage() {
  const [data, setData] = useState<Report | null>(null);

  useEffect(() => {
    void fetch("/api/report")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return <div className="panel p-6">加载报告中…</div>;
  }

  return (
    <div className="space-y-4">
      <section className="panel anim-rise p-6">
        <h2 className="brand-mark text-3xl">{data.child.name} 的学习报告</h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          连续打卡 {data.child.streak} 天 · 当前第 {data.child.phaseWeek} 周
        </p>
      </section>
      {data.summary.map((day) => (
        <section key={day.date} className="panel anim-rise p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-2xl font-extrabold">{day.date}</h3>
            <span className="badge">
              完成 {day.completed}/{day.total}（{day.rate}%）· Week {day.phaseWeek}
            </span>
          </div>
          <ul className="mt-4 grid gap-2 md:grid-cols-2">
            {day.tasks.map((t, idx) => (
              <li key={`${day.date}-${idx}`} className="rounded-xl bg-white/70 px-3 py-2 text-sm">
                <span className="font-bold">{t.type}</span>
                <span className="mx-2 text-[var(--ink-soft)]">{t.status}</span>
                <span>{t.title}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!data.summary.length && (
        <section className="panel p-6 text-[var(--ink-soft)]">暂无学习记录</section>
      )}
    </div>
  );
}
