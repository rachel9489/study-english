import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { completeTask, parseProgress, updateTaskProgress } from "@/lib/task-engine";
import type { AiLessonProgress, ListeningProgress, PreviewProgress, ShadowProgress } from "@/lib/types";

const bodySchema = z.object({
  progress: z.unknown(),
  complete: z.boolean().optional().default(false),
  session: z
    .object({
      stage: z.string(),
      payload: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

function canComplete(type: string, progress: unknown): boolean {
  if (type === "PREVIEW") {
    const p = progress as PreviewProgress;
    return (p.followedLines?.length ?? 0) >= 1;
  }
  if (type === "AI_LESSON") {
    const p = progress as AiLessonProgress;
    return Boolean(p.readAloudDone && p.retellDone && p.qaDone);
  }
  if (type === "LISTENING_LADDER") {
    const p = progress as ListeningProgress;
    if (p.mode === "text_then_blind_x3" || p.mode === "subtitle_then_blind") {
      return Boolean(p.followDone && p.blindPlays >= 3);
    }
    if (p.mode === "story_retell") {
      return Boolean(p.retellText && p.retellText.trim().length >= 6);
    }
    if (p.mode === "bare_summary") {
      return Boolean(p.summaryText && p.summaryText.trim().length >= 6);
    }
  }
  if (type === "NIGHT_SHADOW") {
    const p = progress as ShadowProgress;
    return (p.plays ?? 0) >= (p.required ?? 3);
  }
  if (type === "BREAKFAST_REVIEW") {
    const p = progress as { plays?: number };
    return (p.plays ?? 0) >= 1;
  }
  return false;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = bodySchema.parse(await req.json());
  const task = await prisma.taskItem.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (task.status === "locked") {
    return NextResponse.json({ error: "任务尚未解锁" }, { status: 400 });
  }

  if (body.session) {
    await prisma.learningSession.create({
      data: {
        taskId: id,
        stage: body.session.stage,
        payload: JSON.stringify(body.session.payload ?? {}),
      },
    });
  }

  let plan = await updateTaskProgress(id, body.progress, true);

  const shouldComplete = body.complete || canComplete(task.type, body.progress);
  if (shouldComplete && canComplete(task.type, body.progress)) {
    plan = await completeTask(id);
  }

  const updated = plan.tasks.find((t) => t.id === id);
  return NextResponse.json({
    plan,
    task: updated,
    progress: updated ? parseProgress(updated.progressJson) : body.progress,
  });
}
