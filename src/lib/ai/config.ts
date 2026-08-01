export type AiConfig = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  transcribeModel: string;
  ttsModel: string;
  ttsVoice: string;
  audioEnabled: boolean;
};

function flag(name: string, fallback: boolean) {
  const v = process.env[name];
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

export function getAiConfig(): AiConfig {
  const apiKey = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const enabled = flag("AI_ENABLED", Boolean(apiKey)) && Boolean(apiKey);

  return {
    enabled,
    apiKey,
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.AI_MODEL || "gpt-4o-mini",
    transcribeModel: process.env.AI_TRANSCRIBE_MODEL || "whisper-1",
    ttsModel: process.env.AI_TTS_MODEL || "tts-1",
    ttsVoice: process.env.AI_TTS_VOICE || "nova",
    // DeepSeek 等仅 Chat 的供应商请设 AI_AUDIO_ENABLED=false
    audioEnabled: flag("AI_AUDIO_ENABLED", true),
  };
}

export function getPublicAiStatus() {
  const cfg = getAiConfig();
  return {
    enabled: cfg.enabled,
    provider: cfg.enabled ? cfg.baseUrl : "local",
    model: cfg.enabled ? cfg.model : "local-rules",
    transcribe: cfg.enabled && cfg.audioEnabled,
    tts: cfg.enabled && cfg.audioEnabled,
  };
}
