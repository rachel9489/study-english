import { NextResponse } from "next/server";
import { z } from "zod";
import {
  evaluateQaAnswer,
  evaluateReadAloud,
  evaluateRetell,
  generateQaQuestions,
} from "@/lib/ai/tutor";

const schema = z.object({
  mode: z.enum(["read_aloud", "retell", "qa", "questions"]),
  scriptText: z.string(),
  title: z.string().optional().default(""),
  spoken: z.string().optional().default(""),
  question: z.string().optional().default(""),
  answer: z.string().optional().default(""),
});

export async function POST(req: Request) {
  try {
    const data = schema.parse(await req.json());

    if (data.mode === "read_aloud") {
      if (!data.spoken.trim()) {
        return NextResponse.json({ error: "请先朗读或输入内容" }, { status: 400 });
      }
      return NextResponse.json(await evaluateReadAloud(data.scriptText, data.spoken));
    }

    if (data.mode === "retell") {
      if (!data.spoken.trim()) {
        return NextResponse.json({ error: "请先复述大意" }, { status: 400 });
      }
      return NextResponse.json(await evaluateRetell(data.scriptText, data.spoken));
    }

    if (data.mode === "questions") {
      return NextResponse.json(await generateQaQuestions(data.scriptText, data.title));
    }

    if (!data.answer.trim()) {
      return NextResponse.json({ error: "请先回答问题" }, { status: 400 });
    }
    return NextResponse.json(
      await evaluateQaAnswer(data.scriptText, data.question, data.answer),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "评估失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
