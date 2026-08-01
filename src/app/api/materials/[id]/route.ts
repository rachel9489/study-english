import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  description: z.string().optional(),
  scriptText: z.string().min(1).optional(),
  audioPath: z.string().nullable().optional(),
  videoPath: z.string().nullable().optional(),
  levelTag: z.string().optional(),
  vocabularies: z
    .array(
      z.object({
        word: z.string().min(1),
        meaning: z.string().min(1),
        phonetic: z.string().optional().default(""),
      }),
    )
    .optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const material = await prisma.learningMaterial.findUnique({
    where: { id },
    include: { vocabularies: true },
  });
  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(material);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = updateSchema.parse(await req.json());
  if (data.vocabularies) {
    await prisma.vocabularyItem.deleteMany({ where: { materialId: id } });
  }
  const material = await prisma.learningMaterial.update({
    where: { id },
    data: {
      title: data.title,
      category: data.category,
      description: data.description,
      scriptText: data.scriptText,
      audioPath: data.audioPath,
      videoPath: data.videoPath,
      levelTag: data.levelTag,
      ...(data.vocabularies
        ? { vocabularies: { create: data.vocabularies } }
        : {}),
    },
    include: { vocabularies: true },
  });
  return NextResponse.json(material);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.learningMaterial.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
