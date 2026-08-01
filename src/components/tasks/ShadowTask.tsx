"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BlindListenPlayer } from "@/components/BlindListenPlayer";
import { patchChildTaskProgress } from "@/lib/child-today-cache";
import type { ShadowProgress } from "@/lib/types";

type Material = {
  title: string;
  scriptText: string;
  audioPath?: string | null;
};

export function ShadowTask({
  taskId,
  materialId,
  material,
  initial,
  onSaved,
  title = "晚上裸听",
  requiredPlays,
}: {
  taskId: string;
  materialId?: string;
  material: Material;
  initial: ShadowProgress | { plays: number };
  onSaved: () => void;
  title?: string;
  requiredPlays?: number;
}) {
  const required = requiredPlays ?? ("required" in initial ? initial.required : 1) ?? 1;
  const [plays, setPlays] = useState(initial.plays ?? 0);
  const playsRef = useRef(initial.plays ?? 0);
  const [recalling, setRecalling] = useState(false);

  useEffect(() => {
    playsRef.current = plays;
  }, [plays]);

  const fullAudioText = useMemo(
    () =>
      material.scriptText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" "),
    [material.scriptText],
  );

  async function onRoundComplete() {
    const next = playsRef.current + 1;
    playsRef.current = next;
    setPlays(next);
    setRecalling(true);
    const progress = required > 1 ? { plays: next, required } : { plays: next };
    await patchChildTaskProgress(taskId, { progress, complete: next >= required });
    if (next >= required) {
      setTimeout(() => onSaved(), 800);
    } else {
      setTimeout(() => setRecalling(false), 12000);
    }
    return { plays: next, done: next >= required };
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
        <BlindListenPlayer
          audioPath={material.audioPath}
          text={fullAudioText}
          rate={1}
          completedPlays={plays}
          requiredPlays={required}
          autoRepeat={false}
          startLabel="开始裸听"
          finishedLabel={`裸听 ${required} 遍已完成`}
          onRoundComplete={onRoundComplete}
          cacheMaterialId={materialId}
          hint="播放中可「暂停」，点「继续播放」从原位置接着听；完整播完才算 1 遍。"
        />
      )}
    </div>
  );
}
