"use client";

import { useEffect, useMemo, useState } from "react";
import { ScriptLines } from "@/components/ScriptLines";
import { AudioOrTtsPlayer } from "@/components/AudioOrTtsPlayer";
import { AiStatusBadge } from "@/components/AiStatusBadge";
import { VoiceCapture } from "@/components/VoiceCapture";
import { speakEnglish } from "@/lib/tts";
import type { AiLessonProgress } from "@/lib/types";

type Material = {
  title: string;
  scriptText: string;
  audioPath?: string | null;
  vocabularies: { word: string; meaning: string; phonetic?: string }[];
};

export function AiLessonTask({
  taskId,
  material,
  initial,
  onSaved,
}: {
  taskId: string;
  material: Material;
  initial: AiLessonProgress;
  onSaved: () => void;
}) {
  const [progress, setProgress] = useState<AiLessonProgress>(initial);
  const [spoken, setSpoken] = useState("");
  const [feedback, setFeedback] = useState("");
  const [provider, setProvider] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [qaIndex, setQaIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const stage = progress.stage;

  useEffect(() => {
    void fetch("/api/ai/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "questions",
        scriptText: material.scriptText,
        title: material.title,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        setQuestions(d.questions ?? []);
        if (d.provider) setProvider(d.provider);
      });
  }, [material.scriptText, material.title]);

  const stageLabel = useMemo(() => {
    if (stage === "read_aloud") return "阶段 1/3 · 朗读纠音";
    if (stage === "retell") return "阶段 2/3 · 范读复述";
    if (stage === "qa") return "阶段 3/3 · 主题问答";
    return "已完成";
  }, [stage]);

  async function save(next: AiLessonProgress, complete = false) {
    setProgress(next);
    await fetch(`/api/tasks/${taskId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progress: next,
        complete,
        session: { stage: next.stage, payload: { feedback, provider } },
      }),
    });
    if (complete) onSaved();
  }

  async function evaluate(mode: "read_aloud" | "retell", text = spoken) {
    setBusy(true);
    setFeedback("");
    try {
      const res = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          scriptText: material.scriptText,
          spoken: text,
          title: material.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback(data.error || "评估失败");
        return;
      }
      setFeedback(data.feedback);
      if (data.provider) setProvider(data.provider);
      try {
        await speakEnglish(data.feedback, 1);
      } catch {
        // ignore speak errors
      }

      if (mode === "read_aloud" && data.passed) {
        await save({
          ...progress,
          readAloudDone: true,
          stage: "retell",
          wrongWords: data.missed ?? [],
        });
        setSpoken("");
      }
      if (mode === "retell" && data.passed) {
        await save({
          ...progress,
          retellDone: true,
          stage: "qa",
        });
        setSpoken("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitQa() {
    if (!questions[qaIndex]) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "qa",
          scriptText: material.scriptText,
          question: questions[qaIndex],
          answer: spoken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback(data.error || "评估失败");
        return;
      }
      setFeedback(data.feedback);
      if (data.provider) setProvider(data.provider);
      try {
        await speakEnglish(data.feedback, 1);
      } catch {
        // ignore
      }
      const answers = [
        ...progress.qaAnswers,
        { question: questions[qaIndex], answer: spoken, feedback: data.feedback },
      ];
      if (qaIndex < questions.length - 1) {
        setQaIndex(qaIndex + 1);
        setSpoken("");
        await save({ ...progress, qaAnswers: answers });
      } else {
        await save(
          {
            ...progress,
            qaAnswers: answers,
            qaDone: true,
            stage: "done",
          },
          true,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="badge">{stageLabel}</p>
          <AiStatusBadge />
          {provider ? <span className="badge">本次：{provider}</span> : null}
        </div>
        <h2 className="brand-mark mt-2 text-3xl">AI 外教 · {material.title}</h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          固定三件事：朗读纠音 → 范读复述 → 主题问答（禁止 Free Talk）
        </p>
      </div>

      {stage === "read_aloud" && (
        <>
          <ScriptLines scriptText={material.scriptText} vocabularies={material.vocabularies} />
          <textarea
            className="field min-h-28"
            placeholder="点「AI 云端录音」朗读，或打字输入你读到的内容"
            value={spoken}
            onChange={(e) => setSpoken(e.target.value)}
          />
          <VoiceCapture
            onText={setSpoken}
            onError={setFeedback}
            labelCloud="AI 云端录音（Whisper）"
            labelBrowser="浏览器即时语音"
          />
          <button
            type="button"
            className="btn btn-accent"
            disabled={busy || !spoken.trim()}
            onClick={() => void evaluate("read_aloud")}
          >
            {busy ? "外教批改中…" : "交给外教纠音"}
          </button>
        </>
      )}

      {stage === "retell" && (
        <>
          <AudioOrTtsPlayer
            audioPath={material.audioPath}
            text={material.scriptText}
            label="外教正常语速范读"
            rate={1}
          />
          <p className="text-[var(--ink-soft)]">听完后用中文或英语复述大意（抓住关键词即可）</p>
          <textarea
            className="field min-h-28"
            placeholder="例如：有人在市场买苹果和香蕉……"
            value={spoken}
            onChange={(e) => setSpoken(e.target.value)}
          />
          <VoiceCapture
            onText={setSpoken}
            onError={setFeedback}
            labelCloud="AI 云端复述录音"
            labelBrowser="浏览器语音复述"
          />
          <button
            type="button"
            className="btn btn-accent"
            disabled={busy || !spoken.trim()}
            onClick={() => void evaluate("retell")}
          >
            {busy ? "评判中…" : "提交复述"}
          </button>
        </>
      )}

      {stage === "qa" && (
        <>
          <div className="rounded-2xl bg-white/80 p-5 text-xl">
            {questions[qaIndex] ?? "加载问题中…"}
          </div>
          <textarea
            className="field min-h-28"
            placeholder="口头回答后自动填入，或直接打字"
            value={spoken}
            onChange={(e) => setSpoken(e.target.value)}
          />
          <VoiceCapture
            onText={setSpoken}
            onError={setFeedback}
            labelCloud="AI 云端回答录音"
            labelBrowser="浏览器语音回答"
          />
          <button
            type="button"
            className="btn btn-accent"
            disabled={busy || !spoken.trim()}
            onClick={() => void submitQa()}
          >
            {busy ? "外教回应中…" : "下一题 / 完成"}
          </button>
        </>
      )}

      {stage === "done" && (
        <div className="rounded-2xl bg-[var(--accent-soft)] p-6">
          <h3 className="brand-mark text-3xl">外教课完成！</h3>
          <p className="mt-2">可以继续听力阶梯了。</p>
          <button type="button" className="btn btn-primary mt-4" onClick={onSaved}>
            返回今日任务
          </button>
        </div>
      )}

      {feedback ? (
        <div className="rounded-2xl border border-[var(--line)] bg-white/90 p-4">
          <p className="mb-1 text-sm text-[var(--ink-soft)]">外教反馈</p>
          {feedback}
        </div>
      ) : null}
    </div>
  );
}
