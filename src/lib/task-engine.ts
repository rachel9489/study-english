import { prisma } from "@/lib/prisma";
import {
  isDayStudyStarted,
  isTimeUnlocked,
  listeningModeForWeek,
  todayKey,
  tomorrowKey,
} from "@/lib/dates";
import type { AiLessonProgress, ListeningProgress, PreviewProgress, ShadowProgress, TaskType } from "@/lib/types";
import { DEFAULT_DURATIONS } from "@/lib/types";

export async function getOrCreateChild() {
  const existing = await prisma.childProfile.findFirst();
  if (existing) return existing;
  return prisma.childProfile.create({
    data: { name: "豆豆", phaseWeek: 1, streak: 0 },
  });
}

export function defaultProgress(type: TaskType, phaseWeek = 1) {
  switch (type) {
    case "PREVIEW":
      return { followedLines: [], listenedLines: [], vocabOpened: [] } satisfies PreviewProgress;
    case "AI_LESSON":
      return {
        stage: "read_aloud",
        readAloudDone: false,
        retellDone: false,
        qaDone: false,
        qaAnswers: [],
        wrongWords: [],
      } satisfies AiLessonProgress;
    case "LISTENING_LADDER":
      return {
        mode: listeningModeForWeek(phaseWeek),
        followDone: false,
        blindPlays: 0,
      } satisfies ListeningProgress;
    case "NIGHT_SHADOW":
      return { plays: 0, required: 3 } satisfies ShadowProgress;
    case "BREAKFAST_REVIEW":
      return { plays: 0 };
    default:
      return {};
  }
}

export async function ensurePlanForDate(date: string, childId?: string) {
  const child = childId
    ? await prisma.childProfile.findUniqueOrThrow({ where: { id: childId } })
    : await getOrCreateChild();

  const existing = await prisma.dailyPlan.findUnique({
    where: { childId_date: { childId: child.id, date } },
    include: {
      tasks: {
        include: { material: { include: { vocabularies: true } } },
        orderBy: { sortOrder: "asc" },
      },
      child: true,
    },
  });

  if (existing) {
    return refreshTaskLocks(existing.id);
  }

  // No plan yet — return null so UI can prompt parent to schedule
  return null;
}

export async function createDailyPlan(params: {
  date: string;
  phaseWeek: number;
  previewMaterialId: string;
  listeningMaterialId: string;
  forceOrder?: boolean;
  nightUnlock?: string;
}) {
  const child = await getOrCreateChild();
  const {
    date,
    phaseWeek,
    previewMaterialId,
    listeningMaterialId,
    forceOrder = true,
    nightUnlock = "18:00",
  } = params;

  await prisma.childProfile.update({
    where: { id: child.id },
    data: { phaseWeek },
  });

  const existing = await prisma.dailyPlan.findUnique({
    where: { childId_date: { childId: child.id, date } },
  });
  if (existing) {
    await prisma.taskItem.deleteMany({ where: { planId: existing.id } });
    await prisma.dailyPlan.delete({ where: { id: existing.id } });
  }

  const tomorrow = tomorrowKey(new Date(date + "T12:00:00"));

  const plan = await prisma.dailyPlan.create({
    data: {
      date,
      phaseWeek,
      childId: child.id,
      forceOrder,
      nightUnlock,
      tasks: {
        create: [
          {
            type: "PREVIEW",
            sortOrder: 1,
            materialId: previewMaterialId,
            durationMin: DEFAULT_DURATIONS.PREVIEW,
            status: "available",
            progressJson: JSON.stringify(defaultProgress("PREVIEW")),
          },
          {
            type: "AI_LESSON",
            sortOrder: 2,
            materialId: previewMaterialId,
            durationMin: DEFAULT_DURATIONS.AI_LESSON,
            status: "locked",
            progressJson: JSON.stringify(defaultProgress("AI_LESSON")),
          },
          {
            type: "LISTENING_LADDER",
            sortOrder: 3,
            materialId: listeningMaterialId,
            durationMin: DEFAULT_DURATIONS.LISTENING_LADDER,
            status: "locked",
            progressJson: JSON.stringify(defaultProgress("LISTENING_LADDER", phaseWeek)),
          },
          {
            type: "NIGHT_SHADOW",
            sortOrder: 4,
            materialId: previewMaterialId,
            durationMin: DEFAULT_DURATIONS.NIGHT_SHADOW,
            status: "locked",
            unlockAfter: nightUnlock,
            progressJson: JSON.stringify(defaultProgress("NIGHT_SHADOW")),
          },
          {
            type: "BREAKFAST_REVIEW",
            sortOrder: 5,
            materialId: previewMaterialId,
            durationMin: DEFAULT_DURATIONS.BREAKFAST_REVIEW,
            status: "locked",
            scheduledFor: tomorrow,
            progressJson: JSON.stringify(defaultProgress("BREAKFAST_REVIEW")),
          },
        ],
      },
    },
  });

  // Also ensure tomorrow plan has breakfast as first available if parent hasn't planned yet —
  // breakfast lives on today's plan but is meant for tomorrow morning; child home shows it when date matches scheduledFor.
  return refreshTaskLocks(plan.id);
}

export async function createWeeklyPlans(params: {
  days: {
    date: string;
    phaseWeek: number;
    previewMaterialId: string;
    listeningMaterialId: string;
  }[];
  forceOrder?: boolean;
  nightUnlock?: string;
}) {
  const plans = [];
  for (const day of params.days) {
    const plan = await createDailyPlan({
      ...day,
      forceOrder: params.forceOrder,
      nightUnlock: params.nightUnlock,
    });
    plans.push(plan);
  }
  return plans;
}

export async function refreshTaskLocks(planId: string) {
  const plan = await prisma.dailyPlan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      tasks: {
        include: { material: { include: { vocabularies: true } } },
        orderBy: { sortOrder: "asc" },
      },
      child: true,
    },
  });

  const today = todayKey();
  const tasks = plan.tasks;
  let previousCompleted = true;

  for (const task of tasks) {
    if (task.status === "completed") {
      previousCompleted = true;
      continue;
    }

    let available = !plan.forceOrder || previousCompleted;

    if (task.type === "NIGHT_SHADOW") {
      available = available && isTimeUnlocked(task.unlockAfter ?? plan.nightUnlock);
    }

    if (task.type === "BREAKFAST_REVIEW") {
      // Only show as available on its scheduled morning
      available = task.scheduledFor === today && previousCompleted;
      // If viewing from parent report on plan date, keep locked until next day
      if (plan.date === today && task.scheduledFor !== today) {
        available = false;
      }
    }

    // 当日新计划：10:00 前锁定（早餐巩固在昨日计划里，不受影响）
    if (
      plan.date === today &&
      task.type !== "BREAKFAST_REVIEW" &&
      !isDayStudyStarted() &&
      task.status !== "in_progress"
    ) {
      available = false;
    }

    const nextStatus = available
      ? task.status === "in_progress"
        ? "in_progress"
        : "available"
      : "locked";

    if (nextStatus !== task.status) {
      await prisma.taskItem.update({
        where: { id: task.id },
        data: { status: nextStatus },
      });
      task.status = nextStatus;
    }

    previousCompleted = false;
  }

  return prisma.dailyPlan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      tasks: {
        include: { material: { include: { vocabularies: true } } },
        orderBy: { sortOrder: "asc" },
      },
      child: true,
    },
  });
}

export async function completeTask(taskId: string) {
  const task = await prisma.taskItem.findUniqueOrThrow({
    where: { id: taskId },
    include: { plan: { include: { child: true, tasks: true } } },
  });

  const alreadyDone = task.status === "completed";

  if (!alreadyDone) {
    await prisma.taskItem.update({
      where: { id: taskId },
      data: { status: "completed", completedAt: new Date() },
    });
  }

  const plan = await refreshTaskLocks(task.planId);

  const coreDone = plan.tasks
    .filter((t) => t.type !== "BREAKFAST_REVIEW")
    .every((t) => t.status === "completed");

  if (!alreadyDone && coreDone && plan.date === todayKey()) {
    const justFinishedCore = plan.tasks
      .filter((t) => t.type !== "BREAKFAST_REVIEW")
      .every((t) => t.status === "completed");
    if (justFinishedCore) {
      await prisma.childProfile.update({
        where: { id: plan.childId },
        data: { streak: plan.child.streak + 1 },
      });
    }
  }

  return refreshTaskLocks(task.planId);
}

export function parseProgress<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return {} as T;
  }
}

export async function updateTaskProgress(taskId: string, progress: unknown, markInProgress = true) {
  const data: { progressJson: string; status?: string } = {
    progressJson: JSON.stringify(progress),
  };
  if (markInProgress) {
    const task = await prisma.taskItem.findUniqueOrThrow({ where: { id: taskId } });
    if (task.status === "available") data.status = "in_progress";
  }
  await prisma.taskItem.update({ where: { id: taskId }, data });
  const task = await prisma.taskItem.findUniqueOrThrow({
    where: { id: taskId },
    include: { plan: true },
  });
  return refreshTaskLocks(task.planId);
}
