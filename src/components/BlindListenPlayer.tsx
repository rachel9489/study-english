"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolvePlayableAudioPath } from "@/lib/audio-path";
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

/** Wait until the element can play, or fail if the URL is missing/404. */
function waitAudioReady(audio: HTMLAudioElement) {
  return new Promise<void>((resolve, reject) => {
    if (audio.error) {
      reject(new Error("音频不可用"));
      return;
    }
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("音频加载失败"));
    };
    const cleanup = () => {
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("loadeddata", onReady);
      audio.removeEventListener("error", onErr);
    };
    audio.addEventListener("canplay", onReady, { once: true });
    audio.addEventListener("loadeddata", onReady, { once: true });
    audio.addEventListener("error", onErr, { once: true });
    // Kick load for paths that haven't started yet
    audio.load();
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
  const fileUrl = useMemo(() => resolvePlayableAudioPath(audioPath), [audioPath]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const sessionActiveRef = useRef(false);
  const runningRef = useRef(false);
  const playsRef = useRef(completedPlays);
  /** true when the current round is playing a file URL (not cloud/browser TTS) */
  const usingFileRef = useRef(false);

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
    usingFileRef.current = false;
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
    usingFileRef.current = false;

    // 1) DB 里的 material.audioPath（上传原音）优先
    // 2) 路径为空 / 404 / 播放失败 → 再走云端/浏览器 TTS
    if (fileUrl && audioRef.current) {
      const audio = audioRef.current;
      try {
        await waitAudioReady(audio);
        audio.currentTime = 0;
        setStatus("playing");
        usingFileRef.current = true;
        await audio.play();
        await waitAudioEnded(audio);
        return;
      } catch {
        usingFileRef.current = false;
        audio.pause();
        audio.currentTime = 0;
      }
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
      if (usingFileRef.current && audioRef.current) {
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
    if (usingFileRef.current && audioRef.current && !audioRef.current.paused) {
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
      {fileUrl ? (
        <audio ref={audioRef} src={fileUrl} preload="metadata" />
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
      {!hint && !fileUrl && !finished ? (
        <span className="text-sm text-[var(--ink-soft)]">未上传全文原音时用英音朗读全文</span>
      ) : null}
    </div>
  );
}
