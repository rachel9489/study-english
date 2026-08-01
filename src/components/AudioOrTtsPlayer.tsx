"use client";

import { useEffect, useRef, useState } from "react";
import { speakEnglish, stopSpeaking } from "@/lib/tts";

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
    const useFile = audioPath && audioRef.current;
    if (useFile) {
      audioRef.current.currentTime = 0;
      setPlaying(true);
      try {
        await audioRef.current.play();
      } catch {
        setPlaying(false);
      }
      return;
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
        {audioPath ? (
          <audio
            ref={audioRef}
            src={audioPath}
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
      {audioPath ? (
        <audio
          ref={audioRef}
          src={audioPath}
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
      {!audioPath ? (
        <span className="text-sm text-[var(--ink-soft)]">未上传全文原音时用英音朗读全文</span>
      ) : null}
    </div>
  );
}
