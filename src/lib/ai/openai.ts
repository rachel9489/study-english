import { getAiConfig } from "@/lib/ai/config";

export class AiRequestError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const { apiKey } = getAiConfig();
  return {
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };
}

export async function chatJson<T>(params: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<T> {
  const cfg = getAiConfig();
  if (!cfg.enabled) {
    throw new AiRequestError("AI 未配置", 503);
  }

  const payload = {
    model: cfg.model,
    temperature: params.temperature ?? 0.4,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  };

  let res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  // Some compatible providers reject response_format — retry without it.
  if (!res.ok) {
    const first = await res.text();
    if (res.status === 400 && /response_format|json_object/i.test(first)) {
      const { response_format: _rf, ...rest } = payload;
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(rest),
      });
    } else {
      throw new AiRequestError(`LLM 调用失败: ${res.status} ${first.slice(0, 200)}`, res.status);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new AiRequestError(`LLM 调用失败: ${res.status} ${text.slice(0, 200)}`, res.status);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AiRequestError("LLM 返回为空");

  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new AiRequestError("LLM 返回不是合法 JSON");
    return JSON.parse(match[0]) as T;
  }
}

export async function transcribeAudio(file: File | Blob, filename = "audio.webm") {
  const cfg = getAiConfig();
  if (!cfg.enabled || !cfg.audioEnabled) {
    throw new AiRequestError("AI 音频未启用，无法转写", 503);
  }

  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", cfg.transcribeModel);
  form.append("language", "en");
  form.append("response_format", "json");

  const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AiRequestError(`语音转写失败: ${res.status} ${text.slice(0, 200)}`, res.status);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}

export async function synthesizeSpeech(text: string, opts?: { voice?: string; speed?: number }) {
  const cfg = getAiConfig();
  if (!cfg.enabled || !cfg.audioEnabled) {
    throw new AiRequestError("AI 音频未启用，无法合成语音", 503);
  }

  const res = await fetch(`${cfg.baseUrl}/audio/speech`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      model: cfg.ttsModel,
      voice: opts?.voice || cfg.ttsVoice,
      input: text.slice(0, 4000),
      speed: opts?.speed ?? 1,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new AiRequestError(`TTS 失败: ${res.status} ${errText.slice(0, 200)}`, res.status);
  }

  return Buffer.from(await res.arrayBuffer());
}
