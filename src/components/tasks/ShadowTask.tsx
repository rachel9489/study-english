"use client";

import { useState } from "react";
import { AudioOrTtsPlayer } from "@/components/AudioOrTtsPlayer";
import type { ShadowProgress } from "@/lib/types";

type Material = {
  title: string;
  scriptText: string;
  audioPath?: string | null;
};

export function ShadowTask({
  taskId,
  material,
  initial,
  onSaved,
  title = "晚上裸听",
  requiredPlays,
}: {
  taskId: string;
  material: Material;
  initial: ShadowProgress | { plays: number };
  onSaved: () => void;
  title?: string;
  requiredPlays?: number;
}) {
  const required = requiredPlays ?? ("required" in initial ? initial.required : 1) ?? 1;
  const [plays, setPlays] = useState(initial.plays ?? 0);
  const [recalling, setRecalling] = useState(false);

  async function onEnded() {
    const next = plays + 1;
    setPlays(next);
    setRecalling(true);
    const progress = required > 1 ? { plays: next, required } : { plays: next };
    await fetch(`/api/tasks/${taskId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress, complete: next >= required }),
    });
    if (next >= required) {
      setTimeout(() => onSaved(), 800);
      return;
    }
    setTimeout(() => setRecalling(false), 12000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="brand-mark text-3xl">
          {title} · {material.title}
        </h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          默认隐藏文本。听完后闭眼回忆外教发音与口型。
        </p>
      </div>
      <div className="rounded-3xl bg-white/70 p-8 text-center">
        <p className="text-6xl font-extrabold text-[var(--brand)]">
          {plays}/{required}
        </p>
        <p className="mt-2 text-[var(--ink-soft)]">已完成遍数</p>
      </div>
      {recalling ? (
        <div className="anim-pulse rounded-2xl bg-[var(--accent-soft)] p-6 text-center text-xl">
          闭眼回忆 12 秒…想一想刚才的发音口型
        </div>
      ) : (
        <AudioOrTtsPlayer
          audioPath={material.audioPath}
          text={material.scriptText}
          label="开始裸听"
          rate={1}
          onEnded={() => void onEnded()}
        />
      )}
    </div>
  );
}
