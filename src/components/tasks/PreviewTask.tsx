"use client";

import { useMemo, useState } from "react";
import { ScriptLines } from "@/components/ScriptLines";
import { AudioOrTtsPlayer } from "@/components/AudioOrTtsPlayer";
import { speakEnglish } from "@/lib/tts";
import type { PreviewProgress } from "@/lib/types";

type Material = {
  title: string;
  scriptText: string;
  audioPath?: string | null;
  vocabularies: { word: string; meaning: string; phonetic?: string }[];
};

export function PreviewTask({
  taskId,
  material,
  initial,
  onSaved,
}: {
  taskId: string;
  material: Material;
  initial: PreviewProgress;
  onSaved: () => void;
}) {
  const lines = useMemo(
    () => material.scriptText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [material.scriptText],
  );
  const [progress, setProgress] = useState<PreviewProgress>(initial);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);

  async function persist(next: PreviewProgress, complete = false) {
    setSaving(true);
    setProgress(next);
    await fetch(`/api/tasks/${taskId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progress: next,
        complete,
        session: { stage: "preview", payload: next },
      }),
    });
    setSaving(false);
    if (complete) onSaved();
  }

  async function followLine(index: number, line: string) {
    setActive(index);
    await speakEnglish(line, 0.85);
    const followed = Array.from(new Set([...progress.followedLines, index]));
    await persist({ ...progress, followedLines: followed });
  }

  const canFinish = progress.followedLines.length >= 1;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="brand-mark text-3xl">预习 · {material.title}</h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          点生词看翻译，点句子让 AI 带读。至少跟读 1 句后可完成预习。
        </p>
      </div>
      <AudioOrTtsPlayer
        audioPath={material.audioPath}
        text={material.scriptText}
        label="整段带读"
        rate={0.85}
      />
      <ScriptLines
        scriptText={material.scriptText}
        vocabularies={material.vocabularies}
        activeIndex={active}
        doneIndexes={progress.followedLines}
        onSelect={(index, line) => void followLine(index, line)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="badge">
          已跟读 {progress.followedLines.length}/{lines.length} 句
        </span>
        <button
          type="button"
          className="btn btn-accent"
          disabled={!canFinish || saving}
          onClick={() => void persist(progress, true)}
        >
          完成预习，去上课
        </button>
      </div>
    </div>
  );
}
