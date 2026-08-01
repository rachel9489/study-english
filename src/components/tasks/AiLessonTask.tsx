"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScriptLines, ConversationIcon } from "@/components/ScriptLines";
import { AudioOrTtsPlayer } from "@/components/AudioOrTtsPlayer";
import { AiStatusBadge } from "@/components/AiStatusBadge";
import { VoiceCapture } from "@/components/VoiceCapture";
import { speakEnglish, stopSpeaking } from "@/lib/tts";
import { patchChildTaskProgress } from "@/lib/child-today-cache";
import type { QaGrammarFix } from "@/lib/ai/tutor";
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
  const progressRef = useRef(initial);
  const [spoken, setSpoken] = useState("");
  const [feedback, setFeedback] = useState("");
  const [grammarFixes, setGrammarFixes] = useState<QaGrammarFix[]>([]);
  const [correctedSentence, setCorrectedSentence] = useState("");
  const [provider, setProvider] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [qaIndex, setQaIndex] = useState(0);
  const [qaSubmitted, setQaSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const stage = progress.stage;

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

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

  useEffect(() => {
    stopSpeaking();
  }, [qaIndex]);

  const stageLabel = useMemo(() => {
    if (stage === "read_aloud") return "阶段 1/3 · 朗读纠音";
    if (stage === "retell") return "阶段 2/3 · 范读复述";
    if (stage === "qa") return "阶段 3/3 · 主题问答";
    return "已完成";
  }, [stage]);

  function ScriptTextPanel() {
    return (
      <section className="script-panel">
        <div className="script-panel-head">
          <ConversationIcon className="script-panel-head-icon" />
          <p className="font-bold">对话文本</p>
        </div>
        <div className="script-panel-body script-panel-body-flat">
          <ScriptLines
            variant="document"
            scriptText={material.scriptText}
            vocabularies={material.vocabularies}
            showSpeaker={false}
          />
        </div>
      </section>
    );
  }

  async function save(next: AiLessonProgress, complete = false) {
    setProgress(next);
    progressRef.current = next;
    const result = await patchChildTaskProgress(taskId, {
      progress: next,
      complete,
      session: { stage: next.stage, payload: { feedback, provider } },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    if (complete) onSaved();
  }

  function clearQaFeedback() {
    setFeedback("");
    setGrammarFixes([]);
    setCorrectedSentence("");
  }

  function buildQaSpeechText(data: {
    feedback: string;
    correctedSentence?: string;
  }) {
    const parts = [data.feedback];
    if (data.correctedSentence?.trim()) {
      parts.push(`You can say: ${data.correctedSentence.trim()}`);
    }
    return parts.join(" ");
  }

  function QaFeedbackPanel() {
    if (!feedback) return null;
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/90 p-4 space-y-3">
        <div>
          <p className="mb-1 text-sm text-[var(--ink-soft)]">外教反馈</p>
          <p>{feedback}</p>
        </div>
        {grammarFixes.length > 0 ? (
          <div className="rounded-xl bg-[rgba(255,209,102,0.15)] px-3 py-2">
            <p className="text-sm font-bold text-[var(--ink)]">语法纠正</p>
            <ul className="mt-2 space-y-1 text-sm">
              {grammarFixes.map((g, i) => (
                <li key={i}>
                  <span className="text-[var(--accent)]">{g.issue}</span>
                  {g.suggestion ? ` → ${g.suggestion}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {correctedSentence ? (
          <div className="rounded-xl bg-[rgba(14,124,134,0.08)] px-3 py-2">
            <p className="text-sm font-bold text-[var(--brand-deep)]">正确说法</p>
            <p className="mt-1 text-lg">{correctedSentence}</p>
          </div>
        ) : null}
      </div>
    );
  }

  async function evaluate(mode: "read_aloud" | "retell", text = spoken) {
    setBusy(true);
    clearQaFeedback();
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
        try {
          await save({
            ...progressRef.current,
            readAloudDone: true,
            stage: "retell",
            wrongWords: data.missed ?? [],
          });
          setSpoken("");
        } catch (e) {
          setFeedback(e instanceof Error ? e.message : "保存失败，请重试");
        }
      }
      if (mode === "retell" && data.passed) {
        try {
          await save({
            ...progressRef.current,
            retellDone: true,
            stage: "qa",
          });
          setSpoken("");
        } catch (e) {
          setFeedback(e instanceof Error ? e.message : "保存失败，请重试");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitQa(answerText = spoken) {
    if (!questions[qaIndex] || !answerText.trim() || qaSubmitted) return;
    setBusy(true);
    clearQaFeedback();
    try {
      const res = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "qa",
          scriptText: material.scriptText,
          question: questions[qaIndex],
          answer: answerText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback(data.error || "评估失败");
        return;
      }
      setFeedback(data.feedback);
      setGrammarFixes(Array.isArray(data.grammarFixes) ? data.grammarFixes : []);
      setCorrectedSentence(data.correctedSentence ?? "");
      if (data.provider) setProvider(data.provider);
      try {
        await speakEnglish(
          buildQaSpeechText({
            feedback: data.feedback,
            correctedSentence: data.correctedSentence,
          }),
          0.92,
        );
      } catch {
        // ignore speak errors
      }
      const answers = [
        ...progressRef.current.qaAnswers,
        {
          question: questions[qaIndex],
          answer: answerText,
          feedback: data.feedback,
          correctedSentence: data.correctedSentence,
          grammarFixes: data.grammarFixes,
        },
      ];
      const nextProgress = { ...progressRef.current, qaAnswers: answers };
      setProgress(nextProgress);
      progressRef.current = nextProgress;
      const result = await patchChildTaskProgress(taskId, {
        progress: nextProgress,
        complete: false,
        session: { stage: "qa", payload: { feedback: data.feedback, provider: data.provider } },
      });
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setQaSubmitted(true);
    } finally {
      setBusy(false);
    }
  }

  async function goNextQa() {
    if (!qaSubmitted) return;

    if (qaIndex < questions.length - 1) {
      clearQaFeedback();
      setSpoken("");
      setQaSubmitted(false);
      stopSpeaking();
      setQaIndex(qaIndex + 1);
      return;
    }

    stopSpeaking();
    const nextProgress = { ...progressRef.current, qaDone: true, stage: "done" as const };
    setProgress(nextProgress);
    progressRef.current = nextProgress;
    const result = await patchChildTaskProgress(taskId, {
      progress: nextProgress,
      complete: true,
      session: { stage: "done", payload: { provider } },
    });
    if (!result.ok) {
      setFeedback(result.error);
      setQaSubmitted(true);
      return;
    }
    onSaved();
  }

  async function finishLesson() {
    const next = progressRef.current;
    const result = await patchChildTaskProgress(taskId, {
      progress: next,
      complete: true,
      session: { stage: "done", payload: { provider } },
    });
    if (!result.ok) {
      setFeedback(result.error);
      return;
    }
    onSaved();
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
          <ScriptTextPanel />
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
          <ScriptTextPanel />
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
          <div className="rounded-2xl bg-white/80 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="flex-1 text-xl leading-relaxed">
                {questions[qaIndex] ?? "加载问题中…"}
              </p>
              {questions[qaIndex] ? (
                <AudioOrTtsPlayer
                  compact
                  text={questions[qaIndex]}
                  label="听题目"
                  rate={0.92}
                />
              ) : null}
            </div>
          </div>
          <textarea
            className="field min-h-28"
            placeholder="口头回答后自动填入，或直接打字"
            value={spoken}
            disabled={qaSubmitted || busy}
            onChange={(e) => setSpoken(e.target.value)}
          />
          {!qaSubmitted ? (
            <VoiceCapture
              onText={(text) => {
                setSpoken(text);
                void submitQa(text);
              }}
              onError={setFeedback}
              labelCloud="AI 云端回答录音"
              labelBrowser="浏览器语音回答"
            />
          ) : null}
          {!qaSubmitted ? (
            <p className="text-sm text-[var(--ink-soft)]">
              录完音会自动提交；外教会用语音纠正语法并示范正确句子。
            </p>
          ) : null}
          <QaFeedbackPanel />
          {qaSubmitted ? (
            <button type="button" className="btn btn-accent" onClick={() => void goNextQa()}>
              {qaIndex < questions.length - 1 ? "下一题" : "完成"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-accent"
              disabled={busy || !spoken.trim()}
              onClick={() => void submitQa()}
            >
              {busy ? "外教回应中…" : "提交回答"}
            </button>
          )}
        </>
      )}

      {stage === "done" && (
        <div className="rounded-2xl bg-[var(--accent-soft)] p-6">
          <h3 className="brand-mark text-3xl">外教课完成！</h3>
          <p className="mt-2">可以继续听力阶梯了。</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => void finishLesson()}>
            返回今日任务
          </button>
        </div>
      )}

      {stage !== "qa" && feedback ? (
        <div className="rounded-2xl border border-[var(--line)] bg-white/90 p-4">
          <p className="mb-1 text-sm text-[var(--ink-soft)]">外教反馈</p>
          <p>{feedback}</p>
        </div>
      ) : null}
    </div>
  );
}
