"use client";

import { useEffect, useRef, useState } from "react";
import { speakEnglish, stopSpeaking } from "@/lib/tts";

export function AudioOrTtsPlayer({
  audioPath,
  text,
  label = "播放",
  rate = 0.95,
  onEnded,
}: {
  audioPath?: string | null;
  text: string;
  label?: string;
  rate?: number;
  onEnded?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => stopSpeaking(), []);

  async function play() {
    stopSpeaking();
    if (audioPath && audioRef.current) {
      audioRef.current.currentTime = 0;
      setPlaying(true);
      await audioRef.current.play();
      return;
    }
    setPlaying(true);
    try {
      await speakEnglish(text, rate);
      onEnded?.();
    } finally {
      setPlaying(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {audioPath ? (
        <audio
          ref={audioRef}
          src={audioPath}
          onEnded={() => {
            setPlaying(false);
            onEnded?.();
          }}
        />
      ) : null}
      <button type="button" className="btn btn-primary" onClick={play} disabled={playing}>
        {playing ? "播放中…" : label}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          stopSpeaking();
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          setPlaying(false);
        }}
      >
        停止
      </button>
      {!audioPath && (
        <span className="text-sm text-[var(--ink-soft)]">未上传音频时使用英音 TTS</span>
      )}
    </div>
  );
}
