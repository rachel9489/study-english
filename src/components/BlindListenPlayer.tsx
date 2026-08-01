"use client";

import { useEffect, useRef, useState } from "react";
import { pauseSpeaking, resumeSpeaking, speakEnglish, stopSpeaking } from "@/lib/tts";

function waitAudioEnded(audio: HTMLAudioElement) {
  return new Promise<void>((resolve, reject) => {
    if (audio.ended) {
      resolve();
      return;
    }
    const onEnd = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("播放失败"));
    };
    const cleanup = () => {
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onErr);
    };
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onErr);
  });
}

export function BlindListenPlayer({
  audioPath,
  text,
  rate = 0.9,
  completedPlays,
  requiredPlays = 3,
  autoRepeat = true,
  startLabel,
  finishedLabel,
  onRoundComplete,
  playTrigger,
  controlRef,
  hint,
  cacheMaterialId,
}: {
  audioPath?: string | null;
  text: string;
  rate?: number;
  completedPlays: number;
  requiredPlays?: number;
  /** true：播完自动下一遍；false：每遍需手动点播放 */
  autoRepeat?: boolean;
  startLabel?: string;
  finishedLabel?: string;
  onRoundComplete: () => Promise<{ plays: number; done: boolean }>;
  playTrigger?: number;
  controlRef?: React.MutableRefObject<{ cancel: () => void } | null>;
  hint?: string;
  /** 参与 TTS 本地缓存 key（同一天同材料只合成一次） */
  cacheMaterialId?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const sessionActiveRef = useRef(false);
  const runningRef = useRef(false);
  const playsRef = useRef(completedPlays);

  useEffect(() => {
    playsRef.current = completedPlays;
  }, [completedPlays]);

  function cancelSession() {
    sessionActiveRef.current = false;
    stopSpeaking();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setStatus("idle");
  }

  useEffect(() => {
    if (controlRef) controlRef.current = { cancel: cancelSession };
    return () => {
      cancelSession();
      if (controlRef) controlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlRef]);

  async function playOneRound() {
    if (audioPath && audioRef.current) {
      const audio = audioRef.current;
      audio.currentTime = 0;
      setStatus("playing");
      await audio.play();
      await waitAudioEnded(audio);
      return;
    }

    stopSpeaking();
    setStatus("playing");
    await speakEnglish(text, rate, { materialId: cacheMaterialId });
  }

  async function runSession() {
    if (runningRef.current || playsRef.current >= requiredPlays) return;
    runningRef.current = true;
    sessionActiveRef.current = true;

    try {
      while (sessionActiveRef.current && playsRef.current < requiredPlays) {
        await playOneRound();
        if (!sessionActiveRef.current) break;

        const { plays, done } = await onRoundComplete();
        playsRef.current = plays;
        if (done || plays >= requiredPlays) break;
        if (!autoRepeat) break;
      }
    } catch {
      // 播放被取消或失败
    } finally {
      runningRef.current = false;
      sessionActiveRef.current = false;
      setStatus("idle");
    }
  }

  useEffect(() => {
    if (playTrigger && playTrigger > 0 && completedPlays < requiredPlays) {
      cancelSession();
      void runSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playTrigger]);

  function handleMainClick() {
    if (completedPlays >= requiredPlays) return;
    if (status === "paused") {
      if (audioRef.current && audioPath) {
        void audioRef.current.play();
      } else {
        resumeSpeaking();
      }
      setStatus("playing");
      return;
    }
    if (status === "idle" && !runningRef.current) {
      void runSession();
    }
  }

  function handlePauseClick() {
    if (status !== "playing") return;
    if (audioRef.current && audioPath && !audioRef.current.paused) {
      audioRef.current.pause();
    } else {
      pauseSpeaking();
    }
    setStatus("paused");
  }

  const finished = completedPlays >= requiredPlays;
  const defaultStart = autoRepeat
    ? `盲听（${completedPlays}/${requiredPlays}）`
    : startLabel ?? "开始播放";
  const mainLabel =
    status === "playing"
      ? "播放中…"
      : status === "paused"
        ? "继续播放"
        : startLabel ?? defaultStart;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {audioPath ? (
        <audio ref={audioRef} src={audioPath} preload="metadata" />
      ) : null}
      {!finished ? (
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleMainClick}
            disabled={status === "playing"}
          >
            {mainLabel}
          </button>
          {status === "playing" ? (
            <button type="button" className="btn btn-ghost" onClick={handlePauseClick}>
              暂停
            </button>
          ) : null}
        </>
      ) : (
        <p className="badge">{finishedLabel ?? `已完成 ${requiredPlays} 遍`}</p>
      )}
      {hint && !finished ? (
        <span className="text-sm text-[var(--ink-soft)]">{hint}</span>
      ) : null}
      {!hint && !audioPath && !finished ? (
        <span className="text-sm text-[var(--ink-soft)]">未上传全文原音时用英音朗读全文</span>
      ) : null}
    </div>
  );
}
