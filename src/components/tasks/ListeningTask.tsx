"use client";

import { useMemo, useState } from "react";
import { ScriptLines } from "@/components/ScriptLines";
import { AudioOrTtsPlayer } from "@/components/AudioOrTtsPlayer";
import { speakEnglish } from "@/lib/tts";
import type { ListeningProgress } from "@/lib/types";

type Material = {
  title: string;
  scriptText: string;
  audioPath?: string | null;
  vocabularies: { word: string; meaning: string; phonetic?: string }[];
};

export function ListeningTask({
  taskId,
  material,
  initial,
  onSaved,
}: {
  taskId: string;
  material: Material;
  initial: ListeningProgress;
  onSaved: () => void;
}) {
  const [progress, setProgress] = useState<ListeningProgress>(initial);
  const [showText, setShowText] = useState(!initial.followDone);
  const [text, setText] = useState(initial.retellText || initial.summaryText || "");
  const [active, setActive] = useState(0);

  const modeTip = useMemo(() => {
    switch (progress.mode) {
      case "text_then_blind_x3":
        return "第1-2周：先看文本跟读，再盲听 3 遍";
      case "story_retell":
        return "第3-4周：整集听完，用中文复述大意";
      case "subtitle_then_blind":
        return "第5-6周：先看字幕听，再关字幕听";
      case "bare_summary":
        return "第7-8周：裸听后用 3 句话概括";
      default:
        return "";
    }
  }, [progress.mode]);

  async function save(next: ListeningProgress, complete = false) {
    setProgress(next);
    await fetch(`/api/tasks/${taskId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: next, complete }),
    });
    if (complete) onSaved();
  }

  async function followLine(index: number, line: string) {
    setActive(index);
    await speakEnglish(line, 0.9);
  }

  async function markFollowDone() {
    await save({ ...progress, followDone: true });
    setShowText(false);
  }

  async function onBlindEnded() {
    const plays = progress.blindPlays + 1;
    const next = { ...progress, blindPlays: plays };
    const done =
      (progress.mode === "text_then_blind_x3" || progress.mode === "subtitle_then_blind") &&
      progress.followDone &&
      plays >= 3;
    await save(next, done);
  }

  async function submitText() {
    if (progress.mode === "story_retell") {
      await save({ ...progress, retellText: text }, text.trim().length >= 6);
    } else {
      await save({ ...progress, summaryText: text }, text.trim().length >= 6);
    }
  }

  const needsFollowFirst =
    progress.mode === "text_then_blind_x3" || progress.mode === "subtitle_then_blind";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="brand-mark text-3xl">听力阶梯 · {material.title}</h2>
        <p className="mt-2 text-[var(--ink-soft)]">{modeTip}</p>
      </div>

      {needsFollowFirst && !progress.followDone && (
        <>
          <ScriptLines
            scriptText={material.scriptText}
            vocabularies={material.vocabularies}
            activeIndex={active}
            onSelect={(i, line) => void followLine(i, line)}
          />
          <button type="button" className="btn btn-primary" onClick={() => void markFollowDone()}>
            跟读完成，开始盲听
          </button>
        </>
      )}

      {((needsFollowFirst && progress.followDone) ||
        progress.mode === "story_retell" ||
        progress.mode === "bare_summary") && (
        <>
          {(progress.mode === "subtitle_then_blind" || progress.mode === "text_then_blind_x3") && (
            <button type="button" className="btn btn-ghost" onClick={() => setShowText((v) => !v)}>
              {showText ? "隐藏文本（盲听）" : "显示文本"}
            </button>
          )}
          {showText && progress.mode !== "bare_summary" && (
            <ScriptLines scriptText={material.scriptText} vocabularies={material.vocabularies} />
          )}
          <AudioOrTtsPlayer
            audioPath={material.audioPath}
            text={material.scriptText}
            label={needsFollowFirst ? `盲听（${progress.blindPlays}/3）` : "整集播放"}
            rate={1}
            onEnded={() => {
              if (needsFollowFirst) void onBlindEnded();
            }}
          />
          {needsFollowFirst && <p className="badge">已盲听 {progress.blindPlays}/3 遍</p>}
        </>
      )}

      {(progress.mode === "story_retell" || progress.mode === "bare_summary") && (
        <>
          <textarea
            className="field min-h-32"
            placeholder={
              progress.mode === "story_retell"
                ? "用中文复述大意（不用抠每个词）"
                : "用 3 句话概括新闻内容"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-accent"
            disabled={text.trim().length < 6}
            onClick={() => void submitText()}
          >
            提交并完成
          </button>
        </>
      )}
    </div>
  );
}
