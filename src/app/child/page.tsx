"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TASK_LABELS, type TaskType } from "@/lib/types";

type Task = {
  id: string;
  type: TaskType;
  status: string;
  durationMin: number;
  unlockAfter?: string | null;
  scheduledFor?: string | null;
  material?: { title: string } | null;
};

type TodayResp = {
  child: { name: string; streak: number; phaseWeek: number };
  date: string;
  plan: null | {
    id: string;
    phaseWeek: number;
    tasks: Task[];
  };
  breakfastTask: Task | null;
};

const statusUI: Record<string, { label: string; icon: string }> = {
  completed: { label: "已完成", icon: "✅" },
  available: { label: "可开始", icon: "▶" },
  in_progress: { label: "进行中", icon: "▶" },
  locked: { label: "未解锁", icon: "🔒" },
};

export default function ChildHomePage() {
  const [data, setData] = useState<TodayResp | null>(null);

  async function load() {
    const res = await fetch("/api/child/today");
    setData(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  const tasks = useMemo(() => {
    if (!data?.plan) return [] as Task[];
    const list = [...data.plan.tasks];
    if (data.breakfastTask) {
      const idx = list.findIndex((t) => t.type === "BREAKFAST_REVIEW");
      if (idx >= 0) list[idx] = data.breakfastTask;
      else list.unshift(data.breakfastTask);
    }
    return list.sort((a, b) => {
      if (a.type === "BREAKFAST_REVIEW" && a.status !== "locked") return -1;
      if (b.type === "BREAKFAST_REVIEW" && b.status !== "locked") return 1;
      return 0;
    });
  }, [data]);

  const current = tasks.find((t) => t.status === "available" || t.status === "in_progress");
  const doneCount = tasks.filter((t) => t.status === "completed").length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  if (!data) {
    return <div className="panel p-8">正在准备今日任务…</div>;
  }

  return (
    <div className="space-y-4">
      <section className="panel anim-rise p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[var(--ink-soft)]">Hi, {data.child.name}</p>
            <h1 className="brand-mark text-4xl md:text-5xl">今天要做的事</h1>
            <p className="mt-2 text-[var(--ink-soft)]">
              {data.date} · 第 {data.child.phaseWeek} 周 · 连续打卡 {data.child.streak} 天
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[var(--ink-soft)]">今日进度</p>
            <p className="text-3xl font-extrabold">
              {doneCount}/{tasks.length || 0}
            </p>
          </div>
        </div>

        {allDone && (
          <div className="anim-pulse mt-6 rounded-2xl bg-[var(--accent-soft)] p-5 text-center">
            <p className="brand-mark text-3xl">今日达标！</p>
            <p className="mt-1 text-[var(--ink-soft)]">太棒了，明天早餐记得听昨天的对话。</p>
          </div>
        )}

        {current && (
          <Link href={`/child/task/${current.id}`} className="btn btn-accent mt-6 w-full text-xl">
            继续学习 · {TASK_LABELS[current.type]}
          </Link>
        )}
      </section>

      {!data.plan ? (
        <section className="panel p-6 text-[var(--ink-soft)]">
          今天还没有任务。请让家长在后台排课，或运行种子数据：
          <code className="ml-2">npm run db:seed</code>
        </section>
      ) : (
        <section className="panel anim-rise p-4 md:p-6">
          <ul className="space-y-3">
            {data.plan.tasks.map((task, index) => {
              const ui = statusUI[task.status] ?? statusUI.locked;
              const clickable = task.status === "available" || task.status === "in_progress";
              const content = (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/75 px-4 py-4">
                  <div>
                    <p className="text-sm text-[var(--ink-soft)]">
                      {ui.icon} {ui.label}
                      {task.type === "NIGHT_SHADOW" && task.unlockAfter
                        ? ` · ${task.unlockAfter} 后解锁`
                        : ""}
                      {task.type === "BREAKFAST_REVIEW" && task.scheduledFor
                        ? ` · ${task.scheduledFor} 早餐`
                        : ""}
                    </p>
                    <h3 className="text-xl font-extrabold">
                      {index + 1}. {TASK_LABELS[task.type]}（{task.durationMin}分钟）
                    </h3>
                    <p className="text-[var(--ink-soft)]">{task.material?.title}</p>
                  </div>
                  {clickable ? <span className="btn btn-primary">开始</span> : null}
                </div>
              );
              return (
                <li key={task.id}>
                  {clickable ? <Link href={`/child/task/${task.id}`}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
