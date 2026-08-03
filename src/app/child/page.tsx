"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchChildToday, getCachedChildToday, type ChildTodayData, type ChildTodayTask } from "@/lib/child-today-cache";
import { DAY_STUDY_START, isDayStudyStarted } from "@/lib/dates";
import { getTaskLabel } from "@/lib/types";

type Task = ChildTodayTask;

const statusUI: Record<string, { label: string; icon: string }> = {
  completed: { label: "已完成", icon: "✅" },
  available: { label: "可开始", icon: "▶" },
  in_progress: { label: "进行中", icon: "▶" },
  locked: { label: "未解锁", icon: "🔒" },
};

export default function ChildHomePage() {
  const [data, setData] = useState<ChildTodayData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(options?: { silent?: boolean }) {
    if (!options?.silent) {
      const cached = getCachedChildToday();
      if (cached) {
        setData(cached);
        setLoading(false);
        setError("");
      } else {
        setLoading(true);
        setError("");
      }
    }

    try {
      setData(await fetchChildToday({ force: true }));
      setError("");
    } catch (e) {
      if (!getCachedChildToday()) {
        setError(e instanceof Error ? e.message : "网络异常，请重试");
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => void load({ silent: true });
    window.addEventListener("pageshow", refresh);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
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

  const studyStarted = isDayStudyStarted();

  const breakfastTask = data?.breakfastTask ?? null;
  const breakfastPending =
    breakfastTask &&
    (breakfastTask.status === "available" || breakfastTask.status === "in_progress");

  const current = useMemo(() => {
    const active = tasks.filter((t) => t.status === "available" || t.status === "in_progress");
    const breakfast = active.find((t) => t.type === "BREAKFAST_REVIEW");
    const todayCore = active.find((t) => t.type !== "BREAKFAST_REVIEW");

    if (!studyStarted && breakfast) return breakfast;
    if (todayCore) return todayCore;
    return breakfast ?? active[0];
  }, [tasks, studyStarted]);

  const doneCount = tasks.filter((t) => t.status === "completed").length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  if (loading) {
    return (
      <div className="panel p-8">
        <p className="brand-mark text-2xl">正在准备今日任务…</p>
        <p className="mt-3 text-[var(--ink-soft)]">
          首次打开可能需要十几秒（云端数据库唤醒），请稍等。
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel p-8 space-y-4">
        <p className="brand-mark text-2xl">加载失败</p>
        <p className="text-[var(--ink-soft)]">{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          重新加载
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="panel p-8 space-y-4">
        <p>暂无数据</p>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          重新加载
        </button>
      </div>
    );
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

        {!studyStarted ? (
          <div className="mt-4 rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink-soft)]">
            <strong>预习对话</strong>今天可随时开始
            {breakfastPending ? (
              <>
                ；建议先做完 <strong>早餐巩固</strong>
              </>
            ) : null}
            。其余新任务 <strong>{DAY_STUDY_START}</strong> 后解锁（早餐未做完也可之后补做）。
          </div>
        ) : null}

        {current && (
          <Link href={`/child/task/${current.id}`} className="btn btn-accent mt-6 w-full text-xl">
            继续学习 · {getTaskLabel(current.type)}
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
            {tasks.map((task, index) => {
              const ui = statusUI[task.status] ?? statusUI.locked;
              const clickable =
                task.status === "available" ||
                task.status === "in_progress" ||
                task.status === "completed";
              const actionLabel =
                task.status === "completed"
                  ? "复习"
                  : task.status === "in_progress"
                    ? "继续"
                    : "开始";
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
                      {task.status === "locked" &&
                      !studyStarted &&
                      task.type !== "BREAKFAST_REVIEW" &&
                      task.type !== "PREVIEW" &&
                      data.plan?.tasks.some((t) => t.id === task.id)
                        ? ` · ${DAY_STUDY_START} 后开始`
                        : ""}
                    </p>
                    <h3 className="text-xl font-extrabold">
                      {index + 1}. {getTaskLabel(task.type)}（{task.durationMin}分钟）
                    </h3>
                    <p className="text-[var(--ink-soft)]">{task.material?.title}</p>
                  </div>
                  {clickable ? (
                    <span className={`btn ${task.status === "completed" ? "btn-ghost" : "btn-primary"}`}>
                      {actionLabel}
                    </span>
                  ) : null}
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
