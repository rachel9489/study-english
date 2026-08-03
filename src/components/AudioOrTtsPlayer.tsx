"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolvePlayableAudioPath } from "@/lib/audio-path";
import { speakEnglish, stopSpeaking } from "@/lib/tts";

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
    audio.load();
  });
}

export function AudioOrTtsPlayer({
  audioPath,
  text,
  label = "播放",
  rate = 0.95,
  compact = false,
  onEnded,
  onPlayStart,
  stopRef,
  playTrigger,
  cacheMaterialId,
}: {
  audioPath?: string | null;
  text: string;
  label?: string;
  rate?: number;
  compact?: boolean;
  onEnded?: () => void;
  onPlayStart?: () => void;
  stopRef?: React.MutableRefObject<(() => void) | null>;
  /** 递增时自动开始播放（用于进入盲听等场景） */
  playTrigger?: number;
  cacheMaterialId?: string;
}) {
  const fileUrl = useMemo(() => resolvePlayableAudioPath(audioPath), [audioPath]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function stopPlayback() {
    stopSpeaking();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
  }

  useEffect(() => {
    if (stopRef) stopRef.current = stopPlayback;
    return () => {
      stopPlayback();
      if (stopRef) stopRef.current = null;
    };
  }, [stopRef]);

  useEffect(() => {
    if (playTrigger && playTrigger > 0) {
      void play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playTrigger 是唯一触发源
  }, [playTrigger]);

  async function play() {
    onPlayStart?.();
    stopPlayback();

    // 1) 数据库 material.audioPath 优先
    // 2) 没有路径或文件打不开 → TTS
    const audio = audioRef.current;
    if (fileUrl && audio) {
      try {
        await waitAudioReady(audio);
        audio.currentTime = 0;
        setPlaying(true);
        await audio.play();
        return;
      } catch {
        audio.pause();
        audio.currentTime = 0;
        setPlaying(false);
      }
    }

    setPlaying(true);
    try {
      await speakEnglish(text, rate, { materialId: cacheMaterialId });
      onEnded?.();
    } finally {
      setPlaying(false);
    }
  }

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2">
        {fileUrl ? (
          <audio
            ref={audioRef}
            src={fileUrl}
            preload="metadata"
            onEnded={() => {
              setPlaying(false);
              onEnded?.();
            }}
          />
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void play()}
          disabled={playing}
          aria-label={label}
        >
          {playing ? "播放中…" : `🔊 ${label}`}
        </button>
        {playing ? (
          <button type="button" className="btn btn-ghost" onClick={stopPlayback}>
            停止
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {fileUrl ? (
        <audio
          ref={audioRef}
          src={fileUrl}
          preload="metadata"
          onEnded={() => {
            setPlaying(false);
            onEnded?.();
          }}
        />
      ) : null}
      <button type="button" className="btn btn-primary" onClick={() => void play()} disabled={playing}>
        {playing ? "播放中…" : label}
      </button>
      <button type="button" className="btn btn-ghost" onClick={stopPlayback}>
        停止
      </button>
      {!fileUrl ? (
        <span className="text-sm text-[var(--ink-soft)]">未上传全文原音时用英音朗读全文</span>
      ) : null}
    </div>
  );
}
