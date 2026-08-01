import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayKey } from "@/lib/dates";
import { ensurePlanForDate, getOrCreateChild, refreshTaskLocks } from "@/lib/task-engine";

export async function GET() {
  const child = await getOrCreateChild();
  const date = todayKey();

  // Today's plan already refreshes locks inside ensurePlanForDate
  const plan = await ensurePlanForDate(date, child.id);

  let breakfastTask = await prisma.taskItem.findFirst({
    where: {
      type: "BREAKFAST_REVIEW",
      scheduledFor: date,
      plan: { childId: child.id },
    },
    include: { material: { include: { vocabularies: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Breakfast may live on yesterday's plan — refresh that plan once
  if (breakfastTask && breakfastTask.planId !== plan?.id) {
    await refreshTaskLocks(breakfastTask.planId);
    breakfastTask = await prisma.taskItem.findUnique({
      where: { id: breakfastTask.id },
      include: { material: { include: { vocabularies: true } } },
    });
  }

  return NextResponse.json({
    child,
    date,
    plan,
    breakfastTask,
  });
}
