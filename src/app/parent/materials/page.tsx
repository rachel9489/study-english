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

  async function uploadAudioFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = (await res.json()) as { path?: string; storage?: string; error?: string };
    if (!res.ok || !data.path) {
      throw new Error(data.error || "上传失败");
    }
    return data;
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setMsg("");
    try {
      const data = await uploadAudioFile(file);
      setForm((f) => ({ ...f, audioPath: data.path! }));
      setMsg(
        data.storage === "blob"
          ? `已上传到云端 Blob（线上可播）：${data.path}`
          : `已上传到本机（仅本地可播）：${data.path}`,
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "上传失败");
    }
  }

  async function reuploadMaterialAudio(materialId: string, file: File | null) {
    if (!file) return;
    setMsg("");
    try {
      const data = await uploadAudioFile(file);
      const res = await fetch(`/api/materials/${materialId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioPath: data.path }),
      });
      if (!res.ok) throw new Error("保存音频路径失败");
      setMsg(`已更新「${materialId.slice(0, 6)}…」音频为云端地址`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "更新音频失败");
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
            <label className="mb-2 block text-sm text-[var(--ink-soft)]">
              音频文件（可选，推荐上传原音以节省 CosyVoice 额度）
            </label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
            {form.audioPath ? <p className="mt-2 text-sm break-all">{form.audioPath}</p> : null}
            {form.audioPath?.startsWith("/uploads/") ? (
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                这是本机路径，线上无法播放。请在 Vercel 配置 Blob 后重新上传。
              </p>
            ) : null}
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
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    {m.audioPath?.startsWith("http")
                      ? "原音：云端可播"
                      : m.audioPath?.startsWith("/uploads/")
                        ? "原音：本机路径（线上无效，请重传）"
                        : "原音：未上传（将用浏览器朗读）"}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => void remove(m.id)}>
                  删除
                </button>
              </div>
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
                {m.scriptText}
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--brand-deep)]">
                <span className="btn btn-ghost">重新上传原音</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    void reuploadMaterialAudio(m.id, e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            </article>
          ))}
          {!list.length && <p className="text-[var(--ink-soft)]">还没有资料，先上传一份对话。</p>}
        </div>
      </section>
    </div>
  );
}
