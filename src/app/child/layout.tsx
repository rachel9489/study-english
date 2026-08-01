import Link from "next/link";

export default function ChildLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/child" className="brand-mark text-3xl md:text-4xl">
          Study English
        </Link>
        <Link href="/" className="btn btn-ghost">
          首页
        </Link>
      </header>
      {children}
    </div>
  );
}
