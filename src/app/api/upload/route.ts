import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || ".bin";
  const name = `materials/${randomUUID()}${ext}`;
  const contentType = file.type || "application/octet-stream";

  // Production / linked Vercel: store on Blob
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, bytes, {
      access: "public",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({
      path: blob.url,
      name: file.name,
      size: file.size,
      storage: "blob",
    });
  }

  // Local fallback when Blob token is not configured
  const localName = `${randomUUID()}${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, localName), bytes);
  return NextResponse.json({
    path: `/uploads/${localName}`,
    name: file.name,
    size: file.size,
    storage: "local",
  });
}
