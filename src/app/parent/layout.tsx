import Link from "next/link";

const links = [
  { href: "/parent", label: "总览" },
  { href: "/parent/materials", label: "资料库" },
  { href: "/parent/plans", label: "每日排课" },
  { href: "/parent/report", label: "学习报告" },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--ink-soft)]">家长后台</p>
          <h1 className="brand-mark text-4xl">Study English</h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="btn btn-ghost">
              {l.label}
            </Link>
          ))}
          <Link href="/child" className="btn btn-accent">
            打开孩子端
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
