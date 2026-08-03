import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

/**
 * - JSON body: client-direct Blob upload token exchange (supports large MP3s; avoids 413)
 * - multipart: local-only fallback when BLOB_READ_WRITE_TOKEN is unset
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return localFormUpload(request);
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          isVercelRuntime()
            ? "线上未配置 BLOB_READ_WRITE_TOKEN，无法上传大文件。"
            : "本地未配置 BLOB_READ_WRITE_TOKEN。可改用小文件本机上传，或在 .env 填入 Blob 令牌。",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "audio/mpeg",
          "audio/mp3",
          "audio/mp4",
          "audio/x-m4a",
          "audio/m4a",
          "audio/wav",
          "audio/x-wav",
          "audio/webm",
          "audio/ogg",
          "audio/*",
          "application/octet-stream",
        ],
        maximumSizeInBytes: 200 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      // DB update is done by the parent materials page after upload() resolves.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传授权失败" },
      { status: 400 },
    );
  }
}

async function localFormUpload(request: Request) {
  if (isVercelRuntime()) {
    return NextResponse.json(
      {
        error:
          "线上请使用云端直传（已自动启用）。若仍走本机上传，请确认 BLOB_READ_WRITE_TOKEN 已配置并重新部署。",
      },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || ".bin";
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
