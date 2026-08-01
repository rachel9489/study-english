"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PreviewTask } from "@/components/tasks/PreviewTask";
import { AiLessonTask } from "@/components/tasks/AiLessonTask";
import { ListeningTask } from "@/components/tasks/ListeningTask";
import { ShadowTask } from "@/components/tasks/ShadowTask";
import type {
  AiLessonProgress,
  ListeningProgress,
  PreviewProgress,
  ShadowProgress,
  TaskType,
} from "@/lib/types";

type TaskDetail = {
  id: string;
  type: TaskType;
  status: string;
  progressJson: string;
  material: {
    title: string;
    scriptText: string;
    audioPath?: string | null;
    vocabularies: { word: string; meaning: string; phonetic?: string }[];
  } | null;
};

export default function TaskPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/child/today");
      const data = await res.json();
      const all = [
        ...(data.plan?.tasks ?? []),
        ...(data.breakfastTask ? [data.breakfastTask] : []),
      ];
      const found = all.find((t: TaskDetail) => t.id === params.id);
      if (!found) {
        setError("找不到这个任务");
        return;
      }
      if (found.status === "locked") {
        setError("任务还未解锁，请按顺序完成前一步");
        return;
      }
      setTask(found);
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
          material={task.material}
          initial={progress as ListeningProgress}
          onSaved={back}
        />
      )}
      {task.type === "NIGHT_SHADOW" && (
        <ShadowTask
          taskId={task.id}
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
