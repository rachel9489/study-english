import { NextResponse } from "next/server";
import { z } from "zod";
import { createWeeklyPlans } from "@/lib/task-engine";

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phaseWeek: z.number().int().min(1).max(8),
  previewMaterialId: z.string().min(1),
  listeningMaterialId: z.string().min(1),
});

const weekSchema = z.object({
  days: z.array(daySchema).min(1).max(7),
  forceOrder: z.boolean().optional(),
  nightUnlock: z.string().optional(),
});

export async function POST(req: Request) {
  const data = weekSchema.parse(await req.json());
  const plans = await createWeeklyPlans(data);
  return NextResponse.json({ plans, count: plans.length }, { status: 201 });
}
