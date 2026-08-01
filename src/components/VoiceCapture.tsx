"use client";

import { useEffect, useRef, useState } from "react";
import { listenOnce, startCloudRecording } from "@/lib/tts";

type Props = {
  onText: (text: string) => void;
  onError?: (message: string) => void;
  labelBrowser?: string;
  labelCloud?: string;
};

export function VoiceCapture({
  onText,
  onError,
  labelBrowser = "浏览器语音",
  labelCloud = "AI 云端录音",
}: Props) {
  const [cloudOk, setCloudOk] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const recorderRef = useRef<Awaited<ReturnType<typeof startCloudRecording>> | null>(null);

  useEffect(() => {
    void fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setCloudOk(Boolean(d.transcribe)))
      .catch(() => setCloudOk(false));
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.cancel();
    };
  }, []);

  async function useBrowser() {
    try {
      const text = await listenOnce("en-US");
      if (text) onText(text);
      else onError?.("没有识别到内容");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "语音识别失败");
    }
  }

  async function toggleCloud() {
    if (transcribing) return;

    if (!recording) {
      try {
        const rec = await startCloudRecording();
        recorderRef.current = rec;
        setRecording(true);
        setElapsed(0);
        timerRef.current = window.setInterval(() => setElapsed((n) => n + 1), 1000);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : "无法开始录音");
      }
      return;
    }

    setRecording(false);
    setTranscribing(true);
    if (timerRef.current) window.clearInterval(timerRef.current);
    try {
      const text = await recorderRef.current!.stop();
      recorderRef.current = null;
      if (text) onText(text);
      else onError?.("没有识别到内容");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "云端转写失败");
    } finally {
      setTranscribing(false);
      setElapsed(0);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      {cloudOk && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={transcribing}
          onClick={() => void toggleCloud()}
        >
          {transcribing
            ? "Whisper 转写中…"
            : recording
              ? `说完了，点我停止（${elapsed}s）`
              : labelCloud}
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        disabled={recording || transcribing}
        onClick={() => void useBrowser()}
      >
        {labelBrowser}
      </button>
    </div>
  );
}
