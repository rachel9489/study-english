import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayKey } from "@/lib/dates";
import { ensurePlanForDate, getOrCreateChild, refreshTaskLocks } from "@/lib/task-engine";

export async function GET() {
  const child = await getOrCreateChild();
  const date = todayKey();

  // Today's plan
  let plan = await ensurePlanForDate(date, child.id);

  // Also surface breakfast task from yesterday if scheduled for today
  const yesterdayPlans = await prisma.dailyPlan.findMany({
    where: { childId: child.id },
    include: {
      tasks: {
        where: { type: "BREAKFAST_REVIEW", scheduledFor: date },
        include: { material: { include: { vocabularies: true } } },
      },
    },
    orderBy: { date: "desc" },
    take: 3,
  });

  const breakfastFromYesterday = yesterdayPlans
    .flatMap((p) => p.tasks)
    .find((t) => t.scheduledFor === date);

  if (breakfastFromYesterday && breakfastFromYesterday.planId) {
    await refreshTaskLocks(breakfastFromYesterday.planId);
  }

  if (plan) {
    plan = await refreshTaskLocks(plan.id);
  }

  return NextResponse.json({
    child,
    date,
    plan,
    breakfastTask: breakfastFromYesterday
      ? await prisma.taskItem.findUnique({
          where: { id: breakfastFromYesterday.id },
          include: { material: { include: { vocabularies: true } } },
        })
      : null,
  });
}
