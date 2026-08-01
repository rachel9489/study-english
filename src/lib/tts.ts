"use client";

import { getOrFetchTts, type TtsCacheOptions } from "@/lib/audio-cache";
import { isIOSDevice, isTouchMobileDevice } from "@/lib/mic-support";

export { isMicAvailable } from "@/lib/mic-support";

let cachedAiTts: boolean | null = null;
let currentAudio: HTMLAudioElement | null = null;
let highlightTimer: number | null = null;
let highlightCleanup: (() => void) | null = null;
let playbackDone: (() => void) | null = null;
let speechDone: (() => void) | null = null;

type ActiveRecorder = {
  stop: () => Promise<Blob>;
  cancel: () => void;
  isRecording: () => boolean;
};

let activeRecorder: ActiveRecorder | null = null;

export async function isCloudTtsAvailable() {
  if (cachedAiTts !== null) return cachedAiTts;
  try {
    const res = await fetch("/api/ai/status");
    const data = (await res.json()) as { tts?: boolean };
    cachedAiTts = Boolean(data.tts);
  } catch {
    cachedAiTts = false;
  }
  return cachedAiTts;
}

export function stopSpeaking() {
  if (highlightTimer) {
    window.clearInterval(highlightTimer);
    highlightTimer = null;
  }
  highlightCleanup?.();
  highlightCleanup = null;

  playbackDone?.();
  playbackDone = null;
  speechDone?.();
  speechDone = null;

  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

/** 暂停朗读（不清进度，可 resumeSpeaking 继续） */
export function pauseSpeaking() {
  if (currentAudio && !currentAudio.paused && !currentAudio.ended) {
    currentAudio.pause();
    return true;
  }
  const syn = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (syn?.speaking && !syn.paused) {
    syn.pause();
    return true;
  }
  return false;
}

/** 从暂停处继续朗读 */
export function resumeSpeaking() {
  if (currentAudio?.paused && currentAudio.currentTime > 0 && !currentAudio.ended) {
    void currentAudio.play();
    return true;
  }
  const syn = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (syn?.paused) {
    syn.resume();
    return true;
  }
  return false;
}

/** Let the device release the speaker before opening the mic (helps iOS/tablets). */
export async function releaseAudioForMic() {
  stopSpeaking();
  await new Promise((r) => setTimeout(r, 180));
}

export function tokenizeWords(text: string) {
  return text.match(/[A-Za-z']+/g) ?? [];
}

function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const mobile = isTouchMobileDevice();
  const ios = isIOSDevice();
  const candidates = ios
    ? ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
    : mobile
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function createMediaRecorder(stream: MediaStream) {
  const mimeType = pickRecorderMimeType();
  if (mimeType) {
    return new MediaRecorder(stream, { mimeType });
  }
  return new MediaRecorder(stream);
}

async function speakWithCloud(text: string, rate = 0.95, cache?: TtsCacheOptions) {
  const blob = await getOrFetchTts(text, rate, cache);
  const url = URL.createObjectURL(blob);
  return new Promise<HTMLAudioElement>((resolve, reject) => {
    const audio = new Audio();
    currentAudio = audio;
    let settled = false;
    let playStarted = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      finish(() => reject(new Error("云端音频播放失败")));
    };

    const startPlay = () => {
      if (playStarted) return;
      playStarted = true;
      void audio
        .play()
        .then(() => finish(() => resolve(audio)))
        .catch((err) => finish(() => reject(err instanceof Error ? err : new Error("播放失败"))));
    };

    audio.addEventListener("loadedmetadata", startPlay, { once: true });
    audio.src = url;
    audio.load();
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) startPlay();
  });
}

function waitForAudioEnd(audio: HTMLAudioElement) {
  return new Promise<void>((resolve, reject) => {
    if (audio.ended) return resolve();

    const finish = () => {
      playbackDone = null;
      resolve();
    };
    const fail = () => {
      playbackDone = null;
      reject(new Error("播放失败"));
    };

    playbackDone = finish;
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", fail, { once: true });
  });
}

function waitForSpeech(utter: SpeechSynthesisUtterance) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      speechDone = null;
      resolve();
    };
    const fail = () => {
      speechDone = null;
      reject(new Error("朗读失败"));
    };

    speechDone = finish;
    utter.onend = finish;
    utter.onerror = fail;
    window.speechSynthesis.speak(utter);
  });
}

function speakWithBrowser(text: string, rate = 0.9) {
  return waitForSpeech(createBrowserUtterance(text, rate)).then(() => undefined);
}

export async function speakEnglish(
  text: string,
  rate = 0.9,
  cache?: TtsCacheOptions,
) {
  await speakEnglishWithHighlight(text, { rate, cache });
}

export type { TtsCacheOptions };

function wordIndexFromChar(text: string, charIndex: number, words: string[]) {
  if (!words.length) return 0;
  let pos = 0;
  for (let i = 0; i < words.length; i++) {
    const idx = text.indexOf(words[i], pos);
    if (idx === -1) continue;
    const end = idx + words[i].length;
    if (charIndex >= idx && charIndex < end) return i;
    if (charIndex < idx) return Math.max(0, i);
    pos = end;
  }
  return words.length - 1;
}

function scheduleHighlightsFromAudio(
  audio: HTMLAudioElement,
  words: string[],
  onWordIndex: (index: number) => void,
) {
  if (!words.length) return;
  const weights = words.map((w) => Math.max(w.length, 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const starts = weights.map((w) => {
    const start = acc / total;
    acc += w;
    return start;
  });

  const onTime = () => {
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const p = Math.min(1, audio.currentTime / duration);
    let idx = 0;
    while (idx + 1 < starts.length && p >= starts[idx + 1]) idx++;
    onWordIndex(idx);
  };

  onWordIndex(0);
  audio.addEventListener("timeupdate", onTime);
  highlightCleanup = () => audio.removeEventListener("timeupdate", onTime);
}

function scheduleProportionalHighlights(
  words: string[],
  durationSec: number,
  onWordIndex: (index: number) => void,
) {
  if (!words.length || !Number.isFinite(durationSec) || durationSec <= 0) return;
  const weights = words.map((w) => Math.max(w.length, 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const starts = weights.map((w) => {
    const start = (acc / total) * durationSec;
    acc += w;
    return start;
  });

  let idx = 0;
  onWordIndex(0);
  const started = performance.now();
  highlightTimer = window.setInterval(() => {
    const elapsed = (performance.now() - started) / 1000;
    while (idx + 1 < starts.length && elapsed >= starts[idx + 1]) idx++;
    onWordIndex(idx);
    if (elapsed >= durationSec) {
      if (highlightTimer) window.clearInterval(highlightTimer);
      highlightTimer = null;
    }
  }, 80);

  highlightCleanup = () => {
    if (highlightTimer) window.clearInterval(highlightTimer);
    highlightTimer = null;
  };
}

export async function speakEnglishWithHighlight(
  text: string,
  opts?: {
    rate?: number;
    onWordIndex?: (index: number) => void;
    cache?: TtsCacheOptions;
  },
) {
  const rate = opts?.rate ?? 0.9;
  const words = tokenizeWords(text);
  const onWordIndex = opts?.onWordIndex;
  stopSpeaking();

  const useCloud = await isCloudTtsAvailable();
  if (useCloud) {
    try {
      const audio = await speakWithCloud(text, rate, opts?.cache);
      if (onWordIndex && words.length) {
        scheduleHighlightsFromAudio(audio, words, onWordIndex);
      }
      await waitForAudioEnd(audio);
      highlightCleanup?.();
      highlightCleanup = null;
      return;
    } catch {
      // fall through to browser
    }
  }

  if (typeof window !== "undefined" && window.speechSynthesis && words.length > 0) {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-GB";
      utter.rate = rate;
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => v.lang.startsWith("en-GB")) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (preferred) utter.voice = preferred;

      const estDuration = Math.max(1.5, (words.length * 0.35) / rate);
      if (onWordIndex) {
        let boundarySeen = false;
        utter.onboundary = (ev) => {
          boundarySeen = true;
          if (ev.name === "word" || ev.charLength > 0) {
            onWordIndex(wordIndexFromChar(text, ev.charIndex, words));
          }
        };
        scheduleProportionalHighlights(words, estDuration, (idx) => {
          if (!boundarySeen) onWordIndex(idx);
        });
        onWordIndex(0);
      }

      await waitForSpeech(utter);
      highlightCleanup?.();
      highlightCleanup = null;
      return;
    } catch {
      // fall through
    }
  }

  await waitForSpeech(createBrowserUtterance(text, rate));
}

function createBrowserUtterance(text: string, rate = 0.9) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    throw new Error("当前浏览器不支持语音朗读");
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en-GB";
  utter.rate = rate;
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    utter.lang === "zh-CN"
      ? voices.find((v) => v.lang.startsWith("zh"))
      : voices.find((v) => v.lang.startsWith("en-GB")) ||
        voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utter.voice = preferred;
  return utter;
}

export async function listenOnce(lang = "en-US"): Promise<string> {
  const SR =
    typeof window !== "undefined"
      ? (window as unknown as {
          SpeechRecognition?: new () => SpeechRecognition;
          webkitSpeechRecognition?: new () => SpeechRecognition;
        }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition })
          .webkitSpeechRecognition
      : undefined;

  if (!SR) {
    throw new Error("当前浏览器不支持语音识别，请改用打字或云端录音");
  }

  return new Promise((resolve, reject) => {
    const recog = new SR();
    recog.lang = lang;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      resolve(text);
    };
    recog.onerror = () => reject(new Error("没有听清，请再试一次或改用打字"));
    recog.onend = () => {};
    recog.start();
  });
}

async function blobToTranscript(blob: Blob) {
  const ext =
    blob.type.includes("mp4") || blob.type.includes("aac")
      ? "audio.mp4"
      : blob.type.includes("ogg")
        ? "audio.ogg"
        : "audio.webm";
  const fd = new FormData();
  fd.append("file", blob, ext);
  const res = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "云端转写失败");
  return String(data.text || "").trim();
}

export async function acquireMicStream() {
  if (typeof window === "undefined" || !window.isSecureContext) {
    throw new Error("当前页面无法使用麦克风，请用 https 访问。");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持麦克风");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
}

function buildRecorderHandle(stream: MediaStream): ActiveRecorder {
  const mimeType = pickRecorderMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = createMediaRecorder(stream);
  } catch {
    recorder = new MediaRecorder(stream);
  }
  const chunks: BlobPart[] = [];
  let cancelled = false;

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("录音失败"));
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cancelled) {
        reject(new Error("录音已取消"));
        return;
      }
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/mp4" }));
    };
  });

  try {
    recorder.start(isTouchMobileDevice() ? 1000 : 300);
  } catch {
    recorder.start();
  }

  const handle: ActiveRecorder = {
    isRecording: () => recorder.state === "recording",
    stop: async () => {
      if (recorder.state === "recording") recorder.stop();
      const blob = await stopped;
      activeRecorder = null;
      return blob;
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state === "recording") recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      activeRecorder = null;
    },
  };

  return handle;
}

/** Start recording from a stream acquired during the user's click (helps iOS/tablets). */
export function startRecordingFromStream(stream: MediaStream): ActiveRecorder {
  if (activeRecorder) {
    activeRecorder.cancel();
    activeRecorder = null;
  }
  const handle = buildRecorderHandle(stream);
  activeRecorder = handle;
  return handle;
}

/** Start cloud recording; call stop() to get audio blob. */
export async function startCloudRecording(): Promise<ActiveRecorder> {
  if (activeRecorder) {
    activeRecorder.cancel();
    activeRecorder = null;
  }
  const stream = await acquireMicStream();
  return startRecordingFromStream(stream);
}

export async function transcribeBlob(blob: Blob) {
  return blobToTranscript(blob);
}

export async function recordAndTranscribe(seconds = 12): Promise<string> {
  const rec = await startCloudRecording();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const blob = await rec.stop();
  return blobToTranscript(blob);
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
