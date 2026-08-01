"use client";

import { useEffect, useState } from "react";

type Status = {
  enabled: boolean;
  provider: string;
  model: string;
  transcribe: boolean;
  tts: boolean;
};

export function AiStatusBadge({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void fetch("/api/ai/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() =>
        setStatus({
          enabled: false,
          provider: "local",
          model: "local-rules",
          transcribe: false,
          tts: false,
        }),
      );
  }, []);

  if (!status) return null;

  return (
    <span className={`badge ${className}`} title={status.provider}>
      {status.enabled ? `AI 外教 · ${status.model}` : "本地规则外教（未配置 AI_API_KEY）"}
    </span>
  );
}
