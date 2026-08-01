"use client";

let cachedAiTts: boolean | null = null;
let currentAudio: HTMLAudioElement | null = null;

type ActiveRecorder = {
  stop: () => Promise<string>;
  cancel: () => void;
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
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

async function speakWithCloud(text: string, rate = 0.95) {
  const res = await fetch("/api/ai/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed: Math.min(1.5, Math.max(0.7, rate)) }),
  });
  if (!res.ok) throw new Error("云端朗读失败");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      reject(new Error("云端音频播放失败"));
    };
    void audio.play().catch(reject);
  });
}

function speakWithBrowser(text: string, rate = 0.9) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.reject(new Error("当前浏览器不支持语音朗读"));
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
  return new Promise<void>((resolve, reject) => {
    utter.onend = () => resolve();
    utter.onerror = () => reject(new Error("朗读失败"));
    window.speechSynthesis.speak(utter);
  });
}

export async function speakEnglish(text: string, rate = 0.9) {
  stopSpeaking();
  const useCloud = await isCloudTtsAvailable();
  if (useCloud) {
    try {
      await speakWithCloud(text, rate);
      return;
    } catch {
      // fall through
    }
  }
  await speakWithBrowser(text, rate);
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
  const fd = new FormData();
  fd.append("file", blob, "speech.webm");
  const res = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "云端转写失败");
  return String(data.text || "").trim();
}

/** Start cloud recording; call returned stop() when finished speaking. */
export async function startCloudRecording(): Promise<ActiveRecorder> {
  if (activeRecorder) {
    activeRecorder.cancel();
    activeRecorder = null;
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前设备不支持录音");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";

  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
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
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };
  });

  recorder.start();

  const handle: ActiveRecorder = {
    stop: async () => {
      if (recorder.state === "recording") recorder.stop();
      const blob = await stopped;
      activeRecorder = null;
      return blobToTranscript(blob);
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state === "recording") recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      activeRecorder = null;
    },
  };

  activeRecorder = handle;
  return handle;
}

export async function recordAndTranscribe(seconds = 12): Promise<string> {
  const rec = await startCloudRecording();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  return rec.stop();
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
