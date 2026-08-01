"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConversationIcon, ScriptLines } from "@/components/ScriptLines";
import { AudioOrTtsPlayer } from "@/components/AudioOrTtsPlayer";
import { BlindListenPlayer } from "@/components/BlindListenPlayer";
import { speakEnglish } from "@/lib/tts";
import { patchChildTaskProgress } from "@/lib/child-today-cache";
import type { ListeningProgress } from "@/lib/types";

type Material = {
  title: string;
  scriptText: string;
  audioPath?: string | null;
  vocabularies: { word: string; meaning: string; phonetic?: string }[];
};

type PreviewFullAudio = {
  audioPath?: string | null;
  text: string;
  materialId?: string;
};

export function ListeningTask({
  taskId,
  materialId,
  material,
  initial,
  previewFullAudio,
  onSaved,
}: {
  taskId: string;
  materialId?: string;
  material: Material;
  initial: ListeningProgress;
  /** 第一步预习的全文音频；盲听时优先使用 */
  previewFullAudio?: PreviewFullAudio;
  onSaved: () => void;
}) {
  const [progress, setProgress] = useState<ListeningProgress>(initial);
  const progressRef = useRef(initial);
  const [showText, setShowText] = useState(!initial.followDone);
  const [text, setText] = useState(initial.retellText || initial.summaryText || "");
  const [active, setActive] = useState(0);
  const [blindPlayTrigger, setBlindPlayTrigger] = useState(0);
  const blindControlRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const lines = useMemo(
    () => material.scriptText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [material.scriptText],
  );
  const fullAudioText = useMemo(() => lines.join(" "), [lines]);
  const blindAudioPath = previewFullAudio?.audioPath ?? null;
  const blindAudioText = previewFullAudio?.text?.trim() || fullAudioText;

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
    await patchChildTaskProgress(taskId, { progress: next, complete });
    if (complete) onSaved();
  }

  async function followLine(index: number, line: string) {
    setActive(index);
    await speakEnglish(line, 0.9);
  }

  async function markFollowDone() {
    await save({ ...progressRef.current, followDone: true });
    setShowText(false);
    setBlindPlayTrigger((n) => n + 1);
  }

  function startBlindListen() {
    setShowText(false);
    blindControlRef.current?.cancel();
    setBlindPlayTrigger((n) => n + 1);
  }

  async function onBlindRoundComplete() {
    const plays = progressRef.current.blindPlays + 1;
    const next = { ...progressRef.current, blindPlays: plays };
    const done = progressRef.current.followDone && plays >= 3;
    await save(next, done);
    return { plays, done };
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

  function ScriptTextPanel({
    title = "对话文本",
    activeIndex,
    onLineClick,
  }: {
    title?: string;
    activeIndex?: number;
    onLineClick?: (index: number, line: string) => void;
  }) {
    return (
      <section className="script-panel">
        <div className="script-panel-head">
          <ConversationIcon className="script-panel-head-icon" />
          <p className="font-bold">{title}</p>
        </div>
        <div className="script-panel-body script-panel-body-flat">
          <ScriptLines
            variant="document"
            scriptText={material.scriptText}
            vocabularies={material.vocabularies}
            showSpeaker={false}
            activeIndex={activeIndex}
            onLineClick={onLineClick}
          />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="brand-mark text-3xl">听力阶梯 · {material.title}</h2>
        <p className="mt-2 text-[var(--ink-soft)]">{modeTip}</p>
      </div>

      {needsFollowFirst && !progress.followDone && (
        <>
          <ScriptTextPanel
            title="对话文本 · 点击句子跟读"
            activeIndex={active}
            onLineClick={(i, line) => void followLine(i, line)}
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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => (showText ? startBlindListen() : setShowText(true))}
            >
              {showText ? "隐藏文本（盲听）" : "显示文本"}
            </button>
          )}
          {showText && progress.mode !== "bare_summary" && <ScriptTextPanel />}
          {needsFollowFirst ? (
            <>
              <BlindListenPlayer
                audioPath={blindAudioPath}
                text={blindAudioText}
                rate={0.9}
                completedPlays={progress.blindPlays}
                onRoundComplete={onBlindRoundComplete}
                playTrigger={blindPlayTrigger}
                controlRef={blindControlRef}
                cacheMaterialId={previewFullAudio?.materialId ?? materialId}
              />
              <p className="text-sm text-[var(--ink-soft)]">
                点一次「盲听」自动连播 3 遍；播放中可「暂停」，点「继续播放」从原位置接着听。
              </p>
              <p className="badge">已盲听 {progress.blindPlays}/3 遍</p>
            </>
          ) : (
            <AudioOrTtsPlayer
              audioPath={material.audioPath}
              text={fullAudioText}
              label="整集播放"
              rate={1}
            />
          )}
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
