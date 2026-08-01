"use client";

import { useEffect, useState } from "react";
import { MATERIAL_CATEGORIES } from "@/lib/types";

type Vocab = { word: string; meaning: string; phonetic?: string };
type Material = {
  id: string;
  title: string;
  category: string;
  description: string;
  scriptText: string;
  audioPath?: string | null;
  levelTag: string;
  vocabularies: Vocab[];
};

const emptyForm = {
  title: "",
  category: "easy_conversations",
  description: "",
  scriptText: "",
  levelTag: "",
  audioPath: "",
  vocabText: "",
};

export default function MaterialsPage() {
  const [list, setList] = useState<Material[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/materials");
    setList(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  function parseVocab(text: string): Vocab[] {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [word, meaning, phonetic = ""] = line.split(/[,，|]/).map((s) => s.trim());
        return { word, meaning, phonetic };
      })
      .filter((v) => v.word && v.meaning);
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.path) {
      setForm((f) => ({ ...f, audioPath: data.path }));
      setMsg(`已上传音频：${data.path}`);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          description: form.description,
          scriptText: form.scriptText,
          levelTag: form.levelTag,
          audioPath: form.audioPath || null,
          vocabularies: parseVocab(form.vocabText),
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      setForm(emptyForm);
      setMsg("资料已保存");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("确认删除这份资料？")) return;
    await fetch(`/api/materials/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="panel anim-rise p-6" onSubmit={onSubmit}>
        <h2 className="brand-mark text-3xl">上传 / 新建资料</h2>
        <div className="mt-5 space-y-3">
          <input
            className="field"
            placeholder="标题，如 Buying Fruit"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <select
            className="field"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            className="field"
            placeholder="阶段标签，如 Week 1-2 / L4"
            value={form.levelTag}
            onChange={(e) => setForm({ ...form, levelTag: e.target.value })}
          />
          <textarea
            className="field min-h-28"
            placeholder="简介"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <textarea
            className="field min-h-48"
            placeholder="对话/文本（每行一句）"
            value={form.scriptText}
            onChange={(e) => setForm({ ...form, scriptText: e.target.value })}
            required
          />
          <textarea
            className="field min-h-28"
            placeholder={"生词表，每行：word,中文释义,音标\napples,苹果,/ˈæplz/"}
            value={form.vocabText}
            onChange={(e) => setForm({ ...form, vocabText: e.target.value })}
          />
          <div>
            <label className="mb-2 block text-sm text-[var(--ink-soft)]">音频文件（可选）</label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
            {form.audioPath ? <p className="mt-2 text-sm">{form.audioPath}</p> : null}
          </div>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "保存中…" : "保存资料"}
          </button>
          {msg ? <p className="text-sm text-[var(--brand-deep)]">{msg}</p> : null}
        </div>
      </form>

      <section className="panel anim-rise p-6">
        <h2 className="brand-mark text-3xl">资料库（{list.length}）</h2>
        <div className="mt-5 space-y-3">
          {list.map((m) => (
            <article key={m.id} className="rounded-2xl bg-white/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-extrabold">{m.title}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    {m.category} · {m.levelTag || "未标阶段"} · 生词 {m.vocabularies.length}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => void remove(m.id)}>
                  删除
                </button>
              </div>
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
                {m.scriptText}
              </p>
            </article>
          ))}
          {!list.length && <p className="text-[var(--ink-soft)]">还没有资料，先上传一份对话。</p>}
        </div>
      </section>
    </div>
  );
}
