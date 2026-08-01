import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateChild } from "@/lib/task-engine";

export async function GET() {
  const child = await getOrCreateChild();
  const plans = await prisma.dailyPlan.findMany({
    where: { childId: child.id },
    include: {
      tasks: {
        include: {
          material: true,
          sessions: { orderBy: { createdAt: "desc" }, take: 5 },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { date: "desc" },
    take: 14,
  });

  const summary = plans.map((plan) => {
    const completed = plan.tasks.filter((t) => t.status === "completed").length;
    const total = plan.tasks.length;
    return {
      date: plan.date,
      phaseWeek: plan.phaseWeek,
      completed,
      total,
      rate: total ? Math.round((completed / total) * 100) : 0,
      tasks: plan.tasks.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        title: t.material?.title ?? "",
        completedAt: t.completedAt,
        sessions: t.sessions,
      })),
    };
  });

  return NextResponse.json({ child, summary });
}
