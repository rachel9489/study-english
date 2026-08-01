"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConversationIcon, ScriptLines } from "@/components/ScriptLines";
import { AudioOrTtsPlayer } from "@/components/AudioOrTtsPlayer";
import {
  acquireMicStream,
  listenOnce,
  releaseAudioForMic,
  speakEnglishWithHighlight,
  startRecordingFromStream,
  stopSpeaking,
  transcribeBlob,
} from "@/lib/tts";
import {
  micHelpMessage,
  needsFollowTapAfterListen,
  probeMicAccess,
  type MicProbeResult,
} from "@/lib/mic-support";
import { patchChildTaskProgress } from "@/lib/child-today-cache";
import type { PreviewLineResult, PreviewProgress } from "@/lib/types";

type Material = {
  title: string;
  scriptText: string;
  audioPath?: string | null;
  vocabularies: { word: string; meaning: string; phonetic?: string }[];
};

type FollowResult = PreviewLineResult & { passed: boolean };

function scoreTone(score: number) {
  if (score >= 80) return "good";
  if (score >= 50) return "ok";
  return "low";
}

export function PreviewTask({
  taskId,
  materialId,
  material,
  initial,
  onSaved,
}: {
  taskId: string;
  materialId?: string;
  material: Material;
  initial: PreviewProgress;
  onSaved: () => void;
}) {
  const lines = useMemo(
    () => material.scriptText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [material.scriptText],
  );
  const [progress, setProgress] = useState<PreviewProgress>({
    ...initial,
    listenedLines: initial.listenedLines ?? [],
  });
  const progressRef = useRef(progress);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [readingLineIndex, setReadingLineIndex] = useState<number | null>(null);
  const [readingWordIndex, setReadingWordIndex] = useState<number | null>(null);
  const [processingFollow, setProcessingFollow] = useState(false);
  const [cloudTranscribe, setCloudTranscribe] = useState(false);
  const [micProbe, setMicProbe] = useState<MicProbeResult | null>(null);
  const [awaitingFollowTap, setAwaitingFollowTap] = useState(false);
  const [followTapIndex, setFollowTapIndex] = useState<number | null>(null);
  const [msg, setMsg] = useState("点任意一句，自动播放并跟读纠音");
  const [followResult, setFollowResult] = useState<FollowResult | null>(null);
  const recorderRef = useRef<ReturnType<typeof startRecordingFromStream> | null>(null);
  const pendingStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const flowLockRef = useRef(false);
  const fullAudioStopRef = useRef<(() => void) | null>(null);

  const selectedLine = lines[selectedIndex] ?? "";
  const fullAudioText = useMemo(
    () => lines.join(" "),
    [lines],
  );
  const listenedLines = progress.listenedLines ?? [];
  const savedResult = progress.lineResults?.[String(selectedIndex)];
  const micOk = micProbe?.ok ?? false;
  const padFollowMode = needsFollowTapAfterListen();
  const padHost = typeof window !== "undefined" ? window.location.hostname : "电脑IP";

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    void probeMicAccess().then(setMicProbe);
    void fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setCloudTranscribe(Boolean(d.transcribe)))
      .catch(() => setCloudTranscribe(false));

    return () => {
      cleanupRecording();
      stopSpeaking();
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    };
  }, []);

  async function recheckMic() {
    const probe = await probeMicAccess();
    setMicProbe(probe);
    if (!probe.ok) {
      setMsg(micHelpMessage(probe, padHost));
    } else {
      setMsg("麦克风已就绪，点句子开始练习");
    }
  }

  useEffect(() => {
    if (!recording) {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
      setRecordSeconds(0);
      return;
    }
    setRecordSeconds(0);
    recordTimerRef.current = window.setInterval(() => setRecordSeconds((n) => n + 1), 1000);
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    };
  }, [recording]);

  function cleanupRecording() {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    pendingStreamRef.current?.getTracks().forEach((t) => t.stop());
    pendingStreamRef.current = null;
    setRecording(false);
    setAwaitingFollowTap(false);
    setFollowTapIndex(null);
  }

  async function saveProgress(next: PreviewProgress, complete = false) {
    setProgress(next);
    progressRef.current = next;
    const result = await patchChildTaskProgress(taskId, {
      progress: next,
      complete,
      session: { stage: "preview", payload: next },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    if (complete) onSaved();
  }

  function saveProgressQuiet(next: PreviewProgress) {
    setProgress(next);
    progressRef.current = next;
    void saveProgress(next).catch(() => {
      setMsg("纠音结果保存失败，请稍后重试");
    });
  }

  async function evaluateFollow(expected: string, transcript: string): Promise<FollowResult> {
    const res = await fetch("/api/ai/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "read_aloud",
        scriptText: expected,
        spoken: transcript,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "纠音评估失败");
    return {
      score: data.score ?? 0,
      feedback: data.feedback ?? "",
      transcript,
      missed: data.missed,
      passed: Boolean(data.passed),
    };
  }

  function showSavedResult(index: number) {
    const saved = progressRef.current.lineResults?.[String(index)];
    if (saved) {
      setFollowResult({ ...saved, passed: saved.score >= 50 });
    } else {
      setFollowResult(null);
    }
  }

  function markListened(index: number) {
    const listened = Array.from(new Set([...(progressRef.current.listenedLines ?? []), index]));
    saveProgressQuiet({ ...progressRef.current, listenedLines: listened });
  }

  async function finishRecording(index: number) {
    if (!recorderRef.current) return;
    setProcessingFollow(true);
    setMsg("正在识别并纠音…");
    try {
      const blob = await recorderRef.current.stop();
      recorderRef.current = null;
      setRecording(false);

      if (blob.size < 800) {
        setMsg("录音太短，请再点这句重试");
        setFollowResult(null);
        return;
      }

      let transcript = "";
      if (cloudTranscribe) {
        try {
          transcript = await transcribeBlob(blob);
        } catch {
          // fallback below
        }
      }
      if (!transcript.trim()) {
        try {
          transcript = await listenOnce("en-US");
        } catch {
          setMsg("没听清你的发音，请再点这句重试");
          setFollowResult(null);
          return;
        }
      }

      const result = await evaluateFollow(lines[index] ?? "", transcript);
      setFollowResult(result);

      const key = String(index);
      const followed = Array.from(new Set([...progressRef.current.followedLines, index]));
      const lineResults = {
        ...progressRef.current.lineResults,
        [key]: {
          score: result.score,
          feedback: result.feedback,
          transcript: result.transcript,
          missed: result.missed,
        },
      };
      saveProgressQuiet({ ...progressRef.current, followedLines: followed, lineResults });
      setMsg(`第 ${index + 1} 句 · ${result.score} 分，纠音结果已保存`);

      const nextIndex = index + 1;
      if (nextIndex < lines.length) {
        window.setTimeout(() => void playLine(nextIndex), 800);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "纠音失败");
      setFollowResult(null);
      cleanupRecording();
    } finally {
      setProcessingFollow(false);
    }
  }

  function stopLineFlow() {
    fullAudioStopRef.current?.();
    cleanupRecording();
    stopSpeaking();
    setListening(false);
    setReadingLineIndex(null);
    setReadingWordIndex(null);
    flowLockRef.current = false;
  }

  async function startFollowRecording(index: number) {
    if (!micOk) {
      setMsg(micProbe ? micHelpMessage(micProbe, padHost) : "麦克风不可用");
      return;
    }

    setAwaitingFollowTap(false);
    setFollowTapIndex(null);
    setFollowResult(null);
    setSelectedIndex(index);

    try {
      cleanupRecording();
      await releaseAudioForMic();
      const stream = await acquireMicStream();
      recorderRef.current = startRecordingFromStream(stream);
      setRecording(true);
      setMsg(`请跟读第 ${index + 1} 句，读完点「说完了」`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "无法打开麦克风，请检查权限");
      void recheckMic();
    }
  }

  async function playLine(index: number) {
    const line = lines[index];
    if (!line || flowLockRef.current) return;

    flowLockRef.current = true;
    setSelectedIndex(index);
    setFollowResult(null);

    try {
      fullAudioStopRef.current?.();
      cleanupRecording();
      stopSpeaking();

      setListening(true);
      setReadingLineIndex(index);
      setReadingWordIndex(0);
      setMsg(`播放第 ${index + 1} 句…`);

      let stream: MediaStream | null = null;
      const preAcquireMic = micOk && !padFollowMode;
      if (preAcquireMic) {
        try {
          stream = await acquireMicStream();
          stream.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          pendingStreamRef.current = stream;
        } catch (e) {
          setMsg(e instanceof Error ? e.message : "麦克风不可用，只能听不能纠音");
          void recheckMic();
        }
      }

      await speakEnglishWithHighlight(line, {
        rate: 0.85,
        onWordIndex: (wordIdx) => setReadingWordIndex(wordIdx),
      });

      markListened(index);
      setListening(false);
      setReadingLineIndex(null);
      setReadingWordIndex(null);

      if (padFollowMode && micOk) {
        setAwaitingFollowTap(true);
        setFollowTapIndex(index);
        setMsg(`第 ${index + 1} 句听完了，点「开始跟读」开麦克风`);
      } else if (stream && micOk) {
        stream.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
        await new Promise((r) => setTimeout(r, 250));
        pendingStreamRef.current = null;
        recorderRef.current = startRecordingFromStream(stream);
        setRecording(true);
        setMsg(`请跟读第 ${index + 1} 句，读完点「说完了」`);
      } else {
        pendingStreamRef.current?.getTracks().forEach((t) => t.stop());
        pendingStreamRef.current = null;
        showSavedResult(index);
        if (!micOk && micProbe) {
          setMsg(micHelpMessage(micProbe, padHost));
        } else {
          setMsg(`第 ${index + 1} 句听完了`);
        }
      }
    } catch (e) {
      pendingStreamRef.current?.getTracks().forEach((t) => t.stop());
      pendingStreamRef.current = null;
      setMsg(e instanceof Error ? e.message : "播放失败");
      setListening(false);
      setReadingLineIndex(null);
      setReadingWordIndex(null);
    } finally {
      flowLockRef.current = false;
    }
  }

  async function onLineClick(index: number) {
    if (processingFollow) return;

    if (recording && index === selectedIndex) {
      await finishRecording(index);
      return;
    }

    if (recording || listening) {
      cleanupRecording();
      stopSpeaking();
      setListening(false);
      setReadingLineIndex(null);
      setReadingWordIndex(null);
    }

    await playLine(index);
  }

  const canFinish = listenedLines.length >= 1 || progress.followedLines.length >= 1;
  const displayResult =
    followResult ??
    (savedResult ? { ...savedResult, passed: savedResult.score >= 50 } : null);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="brand-mark flex items-center gap-2 text-3xl">
            <ConversationIcon className="h-8 w-8 text-[var(--brand)]" />
            预习 · {material.title}
          </h2>
          <AudioOrTtsPlayer
            compact
            audioPath={material.audioPath}
            text={fullAudioText}
            label="播放全文"
            rate={0.9}
            stopRef={fullAudioStopRef}
            onPlayStart={stopLineFlow}
            cacheMaterialId={materialId}
          />
        </div>
        <p className="mt-2 text-[var(--ink-soft)]">
          点哪句播哪句：先自动朗读，再跟读纠音。
          {padFollowMode ? " 平板（含华为鸿蒙）听完需点「开始跟读」开麦克风。" : ""}
          {!material.audioPath ? "（未上传原音时将用英音朗读全文）" : ""}
        </p>
      </div>

      {micProbe && !micProbe.ok ? (
        <div className="rounded-xl border border-[rgba(232,93,74,0.35)] bg-[rgba(232,93,74,0.08)] px-4 py-3 text-sm text-[var(--ink-soft)]">
          <p className="font-bold text-[var(--ink)]">平板无法录音：{micHelpMessage(micProbe, padHost)}</p>
          {micProbe.reason === "need_https" ? (
            <p className="mt-2">
              正确地址：
              <code className="ml-1 text-xs">https://{padHost}:3000/child</code>
              <br />
              电脑请先运行 <code className="text-xs">npm run dev:pad</code>，首次打开需信任证书。
            </p>
          ) : null}
          <button type="button" className="btn btn-ghost mt-2" onClick={() => void recheckMic()}>
            重新检测麦克风
          </button>
        </div>
      ) : null}

      {micProbe?.ok && padFollowMode ? (
        <p className="rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--ink-soft)]">
          麦克风已就绪。每句听完后请点 <strong>开始跟读</strong>（华为/iPad 等平板需在点击时授权麦克风）。
        </p>
      ) : null}

      <section className="script-panel">
        <div className="script-panel-head">
          <ConversationIcon className="script-panel-head-icon" />
          <p className="font-bold">对话文本 · 点击句子开始</p>
        </div>
        <div className="script-panel-body script-panel-body-flat">
          <ScriptLines
            variant="document"
            scriptText={material.scriptText}
            vocabularies={material.vocabularies}
            activeIndex={selectedIndex}
            doneIndexes={progress.followedLines}
            readingLineIndex={readingLineIndex}
            readingWordIndex={readingWordIndex}
            recordingIndex={recording ? selectedIndex : null}
            lineScores={progress.lineResults}
            showSpeaker={false}
            onLineClick={(index) => void onLineClick(index)}
          />
        </div>
      </section>

      {awaitingFollowTap && followTapIndex != null && !recording ? (
        <div className="follow-recording-panel">
          <p className="follow-recording-title">第 {followTapIndex + 1} 句听完了</p>
          <p className="follow-recording-line mt-2">&ldquo;{lines[followTapIndex]}&rdquo;</p>
          <button
            type="button"
            className="btn btn-accent mt-3 w-full text-lg"
            onClick={() => void startFollowRecording(followTapIndex)}
          >
            🎤 开始跟读
          </button>
        </div>
      ) : null}

      {recording ? (
        <div className="follow-recording-panel" aria-live="polite">
          <div className="follow-recording-head">
            <span className="follow-recording-mic" aria-hidden>
              🎤
            </span>
            <div>
              <p className="follow-recording-title">请跟读第 {selectedIndex + 1} 句</p>
              <p className="follow-recording-timer">{recordSeconds}s</p>
            </div>
          </div>
          <p className="follow-recording-line">&ldquo;{selectedLine}&rdquo;</p>
          <div className="follow-recording-bars" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="follow-recording-bar" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary mt-3 w-full"
            disabled={processingFollow}
            onClick={() => void finishRecording(selectedIndex)}
          >
            {processingFollow ? "纠音中…" : "说完了"}
          </button>
        </div>
      ) : null}

      {displayResult && !recording && !processingFollow ? (
        <div className={`follow-result-panel follow-result-${scoreTone(displayResult.score)}`}>
          <div className="follow-result-head">
            <span className="follow-score">{displayResult.score}</span>
            <div>
              <p className="follow-result-label">纠音结果（已保存）</p>
              <p className="follow-result-pass">{displayResult.passed ? "读得不错！" : "再练一次会更好"}</p>
            </div>
          </div>
          <div className="follow-result-compare">
            <p>
              <strong>原句：</strong>
              {selectedLine}
            </p>
            <p>
              <strong>你说：</strong>
              {displayResult.transcript || "（未识别）"}
            </p>
          </div>
          {displayResult.missed?.length ? (
            <p className="follow-result-missed">注意这些词：{displayResult.missed.join(", ")}</p>
          ) : null}
          <p className="follow-result-feedback">{displayResult.feedback}</p>
          <button
            type="button"
            className="btn btn-ghost mt-2"
            disabled={listening || recording || processingFollow}
            onClick={() => void onLineClick(selectedIndex)}
          >
            再练这一句
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className="badge">
          已听 {listenedLines.length}/{lines.length} · 已纠音 {progress.followedLines.length}/{lines.length}
        </span>
        {msg ? <span className="text-sm text-[var(--brand-deep)]">{msg}</span> : null}
        <button
          type="button"
          className="btn btn-accent"
          disabled={!canFinish || finishing || recording || processingFollow}
          onClick={() => {
            setFinishing(true);
            void saveProgress(progressRef.current, true).finally(() => setFinishing(false));
          }}
        >
          {finishing ? "保存中…" : "完成预习，去上课"}
        </button>
      </div>
    </div>
  );
}
