import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { todayKey } from "@/lib/dates";
import { getOrCreateChild } from "@/lib/task-engine";
import { getPublicAiStatus } from "@/lib/ai/config";
import { AiStatusBadge } from "@/components/AiStatusBadge";

export const dynamic = "force-dynamic";

export default async function ParentHomePage() {
  const child = await getOrCreateChild();
  const materials = await prisma.learningMaterial.count();
  const ai = getPublicAiStatus();
  const plan = await prisma.dailyPlan.findUnique({
    where: { childId_date: { childId: child.id, date: todayKey() } },
    include: { tasks: true },
  });
  const done = plan?.tasks.filter((t) => t.status === "completed").length ?? 0;
  const total = plan?.tasks.length ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="panel anim-rise p-6 md:col-span-2">
        <h2 className="brand-mark text-3xl">今日安排</h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          {child.name} · 第 {child.phaseWeek} 周 · 连续打卡 {child.streak} 天
        </p>
        {plan ? (
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-sm">
              <span>完成进度</span>
              <span>
                {done}/{total}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-all"
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </div>
            <ul className="mt-5 space-y-2">
              {plan.tasks
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3"
                  >
                    <span>
                      {t.sortOrder}. {t.type}
                    </span>
                    <span className="badge">{t.status}</span>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <p className="mt-6 text-[var(--ink-soft)]">今天还没有排课，去「每日排课」创建任务。</p>
        )}
      </section>
      <section className="panel anim-rise p-6">
        <h2 className="brand-mark text-3xl">快捷入口</h2>
        <div className="mt-4">
          <AiStatusBadge />
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {ai.enabled
              ? `已接入 ${ai.model}（LLM / Whisper / TTS）`
              : "未配置 AI_API_KEY，当前使用本地规则外教。在 .env 中填写后重启即可。"}
          </p>
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <Link href="/parent/materials" className="btn btn-primary">
            资料库（{materials}）
          </Link>
          <Link href="/parent/plans" className="btn btn-primary">
            排今日任务
          </Link>
          <Link href="/parent/report" className="btn btn-ghost">
            查看报告
          </Link>
        </div>
      </section>
    </div>
  );
}
