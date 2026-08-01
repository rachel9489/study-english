import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai/config";
import { AiRequestError, transcribeAudio } from "@/lib/ai/openai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const cfg = getAiConfig();
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: "未配置 AI_API_KEY，无法使用云端转写。请用浏览器语音或打字。" },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少音频文件" }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "音频过大（上限 25MB）" }, { status: 400 });
    }

    const text = await transcribeAudio(file, file.name || "audio.webm");
    if (!text) {
      return NextResponse.json({ error: "没有识别到内容，请再试一次" }, { status: 422 });
    }
    return NextResponse.json({ text, provider: "whisper", model: cfg.transcribeModel });
  } catch (err) {
    const message = err instanceof AiRequestError ? err.message : "转写失败";
    const status = err instanceof AiRequestError ? err.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
