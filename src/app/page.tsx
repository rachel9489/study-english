import Link from "next/link";

export default function HomePage() {
  return (
    <main className="app-shell">
      <section className="panel anim-rise overflow-hidden px-6 py-10 md:px-12 md:py-14">
        <p className="badge mb-4">家庭自用 · 华为平板友好</p>
        <h1 className="brand-mark text-5xl leading-tight md:text-7xl">
          Study English
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--ink-soft)] md:text-xl">
          把「预习 → AI 外教 → 听力阶梯 → 裸听 → 早餐巩固」做成每天都能完成的闭环教练。
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/child" className="btn btn-accent anim-pulse text-lg">
            孩子开始今日学习
          </Link>
          <Link href="/parent" className="btn btn-primary text-lg">
            家长后台排课
          </Link>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["严格闭环", "按任务顺序解锁，不做 Free Talk 跑题"],
            ["家长可控", "音视频文本自建，日历一键排课"],
            ["平板上手", "大按钮、大字号，支持 PWA 加到桌面"],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl bg-white/70 p-5">
              <h3 className="brand-mark text-2xl">{title}</h3>
              <p className="mt-2 text-[var(--ink-soft)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
