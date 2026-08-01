import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createDailyPlan, ensurePlanForDate, getOrCreateChild } from "@/lib/task-engine";
import { todayKey } from "@/lib/dates";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? todayKey();
  const plan = await ensurePlanForDate(date);
  if (!plan) {
    const child = await getOrCreateChild();
    return NextResponse.json({ plan: null, child, date });
  }
  return NextResponse.json({ plan, child: plan.child, date });
}

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phaseWeek: z.number().int().min(1).max(8),
  previewMaterialId: z.string().min(1),
  listeningMaterialId: z.string().min(1),
  forceOrder: z.boolean().optional(),
  nightUnlock: z.string().optional(),
});

export async function POST(req: Request) {
  const data = createSchema.parse(await req.json());
  const plan = await createDailyPlan(data);
  return NextResponse.json({ plan }, { status: 201 });
}

export async function PUT(req: Request) {
  // list recent plans
  void req;
  const child = await getOrCreateChild();
  const plans = await prisma.dailyPlan.findMany({
    where: { childId: child.id },
    include: {
      tasks: { include: { material: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { date: "desc" },
    take: 30,
  });
  return NextResponse.json({ plans, child });
}
