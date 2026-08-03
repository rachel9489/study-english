/**
 * Resolve a material.audioPath for playback.
 * Local `/uploads/...` only works on the machine that wrote the file; on Vercel they 404.
 * Prefer Blob/https URLs; treat dead local paths as missing so players use browser TTS.
 */
export function resolvePlayableAudioPath(path?: string | null): string | null {
  const p = path?.trim();
  if (!p) return null;
  if (p.startsWith("/uploads/")) {
    if (typeof window === "undefined") return null;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return p;
    return null;
  }
  return p;
}
