"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PreviewTask } from "@/components/tasks/PreviewTask";
import { AiLessonTask } from "@/components/tasks/AiLessonTask";
import { ListeningTask } from "@/components/tasks/ListeningTask";
import { ShadowTask } from "@/components/tasks/ShadowTask";
import { fetchChildToday, type ChildTodayTask } from "@/lib/child-today-cache";
import type {
  AiLessonProgress,
  ListeningProgress,
  PreviewProgress,
  ShadowProgress,
  TaskType,
} from "@/lib/types";

type TaskDetail = ChildTodayTask & {
  type: TaskType;
  progressJson: string;
  materialId?: string | null;
  material: {
    title: string;
    scriptText: string;
    audioPath?: string | null;
    vocabularies: { word: string; meaning: string; phonetic?: string }[];
  };
};

function previewFullAudioFromPlan(tasks: ChildTodayTask[]) {
  const preview = tasks.find((t) => t.type === "PREVIEW");
  const scriptText = preview?.material?.scriptText;
  if (!scriptText) return undefined;
  const text = scriptText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
  return {
    audioPath: preview?.material?.audioPath ?? null,
    text,
    materialId: preview?.materialId ?? undefined,
  };
}

function isTaskDetail(t: ChildTodayTask): t is TaskDetail {
  return Boolean(t.material?.scriptText != null && t.progressJson != null);
}

export default function TaskPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [previewFullAudio, setPreviewFullAudio] = useState<
    { audioPath?: string | null; text: string } | undefined
  >();
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchChildToday();
        const planTasks = data.plan?.tasks ?? [];
        const all = [...planTasks, ...(data.breakfastTask ? [data.breakfastTask] : [])];
        setPreviewFullAudio(previewFullAudioFromPlan(planTasks));
        const found = all.find((t) => t.id === params.id);
        if (!found) {
          setError("找不到这个任务");
          return;
        }
        if (found.status === "locked") {
          setError("任务还未解锁，请按顺序完成前一步");
          return;
        }
        if (!isTaskDetail(found)) {
          setError("任务资料不完整，请返回首页重新加载");
          return;
        }
        setTask(found);
      } catch {
        setError("加载任务失败，请返回重试");
      }
    })();
  }, [params.id]);

  if (error) {
    return (
      <div className="panel p-6">
        <p>{error}</p>
        <Link href="/child" className="btn btn-primary mt-4">
          返回今日任务
        </Link>
      </div>
    );
  }

  if (!task || !task.material) {
    return <div className="panel p-6">加载任务中…</div>;
  }

  const progress = JSON.parse(task.progressJson || "{}");
  const back = () => router.push("/child");

  return (
    <section className="panel anim-rise p-5 md:p-8">
      <Link href="/child" className="btn btn-ghost mb-4">
        ← 返回
      </Link>
      {task.type === "PREVIEW" && (
        <PreviewTask
          taskId={task.id}
          materialId={task.materialId ?? undefined}
          material={task.material}
          initial={progress as PreviewProgress}
          onSaved={back}
        />
      )}
      {task.type === "AI_LESSON" && (
        <AiLessonTask
          taskId={task.id}
          material={task.material}
          initial={progress as AiLessonProgress}
          onSaved={back}
        />
      )}
      {task.type === "LISTENING_LADDER" && (
        <ListeningTask
          taskId={task.id}
          materialId={task.materialId ?? undefined}
          material={task.material}
          initial={progress as ListeningProgress}
          previewFullAudio={previewFullAudio}
          onSaved={back}
        />
      )}
      {task.type === "NIGHT_SHADOW" && (
        <ShadowTask
          taskId={task.id}
          materialId={task.materialId ?? undefined}
          material={task.material}
          initial={progress as ShadowProgress}
          onSaved={back}
          title="晚上裸听"
          requiredPlays={3}
        />
      )}
      {task.type === "BREAKFAST_REVIEW" && (
        <ShadowTask
          taskId={task.id}
          materialId={task.materialId ?? undefined}
          material={task.material}
          initial={progress as { plays: number }}
          onSaved={back}
          title="早餐巩固"
          requiredPlays={1}
        />
      )}
    </section>
  );
}
