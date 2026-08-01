import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional().default(""),
  scriptText: z.string().min(1),
  audioPath: z.string().optional().nullable(),
  videoPath: z.string().optional().nullable(),
  levelTag: z.string().optional().default(""),
  vocabularies: z
    .array(
      z.object({
        word: z.string().min(1),
        meaning: z.string().min(1),
        phonetic: z.string().optional().default(""),
      }),
    )
    .optional()
    .default([]),
});

export async function GET() {
  const materials = await prisma.learningMaterial.findMany({
    include: { vocabularies: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(materials);
}

export async function POST(req: Request) {
  const body = await req.json();
  const data = createSchema.parse(body);
  const material = await prisma.learningMaterial.create({
    data: {
      title: data.title,
      category: data.category,
      description: data.description,
      scriptText: data.scriptText,
      audioPath: data.audioPath ?? null,
      videoPath: data.videoPath ?? null,
      levelTag: data.levelTag,
      vocabularies: { create: data.vocabularies },
    },
    include: { vocabularies: true },
  });
  return NextResponse.json(material, { status: 201 });
}
