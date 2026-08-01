export type AiProvider = "bailian" | "openai";

export type AiConfig = {
  enabled: boolean;
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  /** DashScope / MaaS root, e.g. https://dashscope.aliyuncs.com */
  dashscopeRoot: string;
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

function detectProvider(baseUrl: string, explicit?: string): AiProvider {
  if (explicit === "bailian" || explicit === "openai") return explicit;
  if (/dashscope\.aliyuncs\.com|maas\.aliyuncs\.com/i.test(baseUrl)) {
    return "bailian";
  }
  return "openai";
}

function dashscopeRootFromBase(baseUrl: string) {
  return baseUrl
    .replace(/\/compatible-mode\/v1\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/$/, "");
}

export function getAiConfig(): AiConfig {
  const apiKey = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const provider = detectProvider(baseUrl, process.env.AI_PROVIDER?.trim());
  const enabled = flag("AI_ENABLED", Boolean(apiKey)) && Boolean(apiKey);

  const defaults =
    provider === "bailian"
      ? {
          model: "qwen-plus",
          transcribeModel: "qwen3-asr-flash",
          ttsModel: "cosyvoice-v3-flash",
          ttsVoice: "longxiaochun_v3",
        }
      : {
          model: "gpt-4o-mini",
          transcribeModel: "whisper-1",
          ttsModel: "tts-1",
          ttsVoice: "nova",
        };

  return {
    enabled,
    provider,
    apiKey,
    baseUrl,
    dashscopeRoot: process.env.AI_DASHSCOPE_ROOT?.replace(/\/$/, "") || dashscopeRootFromBase(baseUrl),
    model: process.env.AI_MODEL || defaults.model,
    transcribeModel: process.env.AI_TRANSCRIBE_MODEL || defaults.transcribeModel,
    ttsModel: process.env.AI_TTS_MODEL || defaults.ttsModel,
    ttsVoice: process.env.AI_TTS_VOICE || defaults.ttsVoice,
    audioEnabled: flag("AI_AUDIO_ENABLED", enabled),
  };
}

export function getPublicAiStatus() {
  const cfg = getAiConfig();
  return {
    enabled: cfg.enabled,
    provider: cfg.enabled ? cfg.provider : "local",
    baseUrl: cfg.enabled ? cfg.baseUrl : "local",
    model: cfg.enabled ? cfg.model : "local-rules",
    transcribeModel: cfg.enabled && cfg.audioEnabled ? cfg.transcribeModel : null,
    ttsModel: cfg.enabled && cfg.audioEnabled ? cfg.ttsModel : null,
    ttsVoice: cfg.enabled && cfg.audioEnabled ? cfg.ttsVoice : null,
    transcribe: cfg.enabled && cfg.audioEnabled,
    tts: cfg.enabled && cfg.audioEnabled,
  };
}
