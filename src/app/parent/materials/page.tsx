"use client";

import { useEffect, useRef, useState } from "react";
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

function audioStatusLabel(audioPath?: string | null) {
  if (audioPath?.startsWith("http")) return "原音：云端可播";
  if (audioPath?.startsWith("/uploads/")) return "原音：本机路径（线上无效，请重传）";
  return "原音：未上传（全文将用浏览器/TTS）";
}

export default function MaterialsPage() {
  const [list, setList] = useState<Material[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formUploading, setFormUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"ok" | "err" | "info">("info");
  const [reuploadingId, setReuploadingId] = useState<string | null>(null);
  const [cardMsg, setCardMsg] = useState<Record<string, { text: string; tone: "ok" | "err" | "info" }>>(
    {},
  );
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    const res = await fetch("/api/materials");
    setList(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  function showMsg(text: string, tone: "ok" | "err" | "info" = "info") {
    setMsg(text);
    setMsgTone(tone);
  }

  function showCardMsg(id: string, text: string, tone: "ok" | "err" | "info" = "info") {
    setCardMsg((prev) => ({ ...prev, [id]: { text, tone } }));
  }

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
    let data: { path?: string; storage?: string; error?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      throw new Error(`上传失败（HTTP ${res.status}）`);
    }
    if (!res.ok || !data.path) {
      throw new Error(data.error || `上传失败（HTTP ${res.status}）`);
    }
    return data;
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setFormUploading(true);
    showMsg(`正在上传「${file.name}」…`, "info");
    try {
      const data = await uploadAudioFile(file);
      setForm((f) => ({ ...f, audioPath: data.path! }));
      showMsg(
        data.storage === "blob"
          ? `已上传到云端 Blob（线上可播）：${data.path}`
          : `已上传到本机（仅本地可播）：${data.path}`,
        "ok",
      );
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "上传失败", "err");
    } finally {
      setFormUploading(false);
    }
  }

  async function reuploadMaterialAudio(material: Material, file: File | null) {
    if (!file) return;
    setReuploadingId(material.id);
    showCardMsg(material.id, `正在上传「${file.name}」…`, "info");
    showMsg(`正在为「${material.title}」上传原音…`, "info");
    try {
      const data = await uploadAudioFile(file);
      const res = await fetch(`/api/materials/${material.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioPath: data.path }),
      });
      if (!res.ok) {
        let detail = "保存音频路径失败";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const okText =
        data.storage === "blob"
          ? `上传成功：云端可播\n${data.path}`
          : `上传成功：本机路径（线上可能无效）\n${data.path}`;
      showCardMsg(material.id, okText, data.storage === "blob" ? "ok" : "err");
      showMsg(`「${material.title}」原音已更新`, "ok");
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : "更新音频失败";
      showCardMsg(material.id, text, "err");
      showMsg(`「${material.title}」上传失败：${text}`, "err");
    } finally {
      setReuploadingId(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    showMsg("", "info");
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
      showMsg("资料已保存", "ok");
      await load();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "保存失败", "err");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("确认删除这份资料？")) return;
    await fetch(`/api/materials/${id}`, { method: "DELETE" });
    await load();
  }

  const bannerClass =
    msgTone === "ok"
      ? "bg-[var(--accent-soft)] text-[var(--brand-deep)]"
      : msgTone === "err"
        ? "bg-red-50 text-red-700"
        : "bg-white/80 text-[var(--ink-soft)]";

  return (
    <div className="space-y-4">
      {msg ? (
        <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-all ${bannerClass}`}>
          {msg}
        </div>
      ) : null}

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
                音频文件（可选，推荐上传整段原音：全文/裸听播 MP3，预习逐句仍用云端 TTS）
              </label>
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav"
                disabled={formUploading}
                onChange={(e) => {
                  void onUpload(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              {formUploading ? <p className="mt-2 text-sm text-[var(--ink-soft)]">上传中…</p> : null}
              {form.audioPath ? <p className="mt-2 text-sm break-all">{form.audioPath}</p> : null}
              {form.audioPath?.startsWith("/uploads/") ? (
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  这是本机路径，线上无法播放。请在 Vercel 配置 Blob 后重新上传。
                </p>
              ) : null}
            </div>
            <button className="btn btn-primary" disabled={saving || formUploading}>
              {saving ? "保存中…" : "保存资料"}
            </button>
          </div>
        </form>

        <section className="panel anim-rise p-6">
          <h2 className="brand-mark text-3xl">资料库（{list.length}）</h2>
          <div className="mt-5 space-y-3">
            {list.map((m) => {
              const busy = reuploadingId === m.id;
              const local = cardMsg[m.id];
              return (
                <article key={m.id} className="rounded-2xl bg-white/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-extrabold">{m.title}</h3>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        {m.category} · {m.levelTag || "未标阶段"} · 生词 {m.vocabularies.length}
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">{audioStatusLabel(m.audioPath)}</p>
                      {m.audioPath ? (
                        <p className="mt-1 text-xs break-all text-[var(--ink-soft)]">{m.audioPath}</p>
                      ) : null}
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => void remove(m.id)}>
                      删除
                    </button>
                  </div>
                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
                    {m.scriptText}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      ref={(el) => {
                        fileInputRefs.current[m.id] = el;
                      }}
                      type="file"
                      accept="audio/*,.mp3,.m4a,.wav"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        void reuploadMaterialAudio(m, e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || reuploadingId !== null}
                      onClick={() => fileInputRefs.current[m.id]?.click()}
                    >
                      {busy ? "上传中…" : "重新上传原音"}
                    </button>
                  </div>

                  {local ? (
                    <p
                      className={`mt-2 whitespace-pre-wrap break-all text-sm ${
                        local.tone === "ok"
                          ? "text-[var(--brand-deep)]"
                          : local.tone === "err"
                            ? "text-red-700"
                            : "text-[var(--ink-soft)]"
                      }`}
                    >
                      {local.text}
                    </p>
                  ) : null}
                </article>
              );
            })}
            {!list.length && <p className="text-[var(--ink-soft)]">还没有资料，先上传一份对话。</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
