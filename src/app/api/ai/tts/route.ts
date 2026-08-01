import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiConfig } from "@/lib/ai/config";
import { AiRequestError, synthesizeSpeech } from "@/lib/ai/openai";

export const runtime = "nodejs";

const schema = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4).optional(),
});

export async function POST(req: Request) {
  const cfg = getAiConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ error: "未配置 AI，请使用浏览器朗读" }, { status: 503 });
  }

  try {
    const body = schema.parse(await req.json());
    const audio = await synthesizeSpeech(body.text, {
      voice: body.voice,
      speed: body.speed,
    });

    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }
    const message = err instanceof AiRequestError ? err.message : "TTS 失败";
    const status = err instanceof AiRequestError ? err.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
