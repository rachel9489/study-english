"use client";

import { upload } from "@vercel/blob/client";

function extOf(file: File) {
  const fromName = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  if (fromName && fromName.length <= 8) return fromName.toLowerCase();
  if (file.type.includes("mpeg") || file.type.includes("mp3")) return ".mp3";
  if (file.type.includes("mp4") || file.type.includes("m4a")) return ".m4a";
  if (file.type.includes("wav")) return ".wav";
  return ".mp3";
}

export type MaterialAudioUpload = {
  path: string;
  name: string;
  size: number;
  storage: "blob" | "local";
};

/**
 * Prefer browser → Vercel Blob direct upload (avoids Vercel 4.5MB / 413 limit).
 * Fall back to local /api/upload FormData only when Blob is unavailable (local dev).
 */
export async function uploadMaterialAudio(
  file: File,
  opts?: { onProgress?: (pct: number) => void },
): Promise<MaterialAudioUpload> {
  const pathname = `materials/${crypto.randomUUID()}${extOf(file)}`;

  try {
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      multipart: true,
      contentType: file.type || undefined,
      onUploadProgress: (p) => {
        if (typeof p.percentage === "number") opts?.onProgress?.(Math.round(p.percentage));
      },
    });
    return {
      path: blob.url,
      name: file.name,
      size: file.size,
      storage: "blob",
    };
  } catch (err) {
    // Local without BLOB_READ_WRITE_TOKEN → FormData to public/uploads
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    let data: { path?: string; storage?: string; error?: string; size?: number } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      throw new Error(
        res.status === 413
          ? "文件过大（超过 Vercel 4.5MB 限制）。请确认已配置 BLOB_READ_WRITE_TOKEN 并重新部署后再传。"
          : `上传失败（HTTP ${res.status}）`,
      );
    }
    if (!res.ok || !data.path) {
      const blobHint =
        err instanceof Error && err.message
          ? `（云端直传：${err.message}）`
          : "";
      throw new Error((data.error || `上传失败（HTTP ${res.status}）`) + blobHint);
    }
    opts?.onProgress?.(100);
    return {
      path: data.path,
      name: file.name,
      size: data.size ?? file.size,
      storage: data.storage === "blob" ? "blob" : "local",
    };
  }
}
