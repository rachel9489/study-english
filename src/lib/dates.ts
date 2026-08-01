import { format } from "date-fns";

export function todayKey(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

export function tomorrowKey(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return format(d, "yyyy-MM-dd");
}

export function addDaysKey(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

export function nowTimeKey(date = new Date()) {
  return format(date, "HH:mm");
}

/** 当日新任务开始时间（之前只做早餐巩固） */
export const DAY_STUDY_START = "10:00";

export function isDayStudyStarted(now = new Date()) {
  return nowTimeKey(now) >= DAY_STUDY_START;
}

export function isTimeUnlocked(unlockAfter: string | null | undefined, now = new Date()) {
  if (!unlockAfter) return true;
  return nowTimeKey(now) >= unlockAfter;
}

export function listeningModeForWeek(week: number) {
  if (week <= 2) return "text_then_blind_x3" as const;
  if (week <= 4) return "story_retell" as const;
  if (week <= 6) return "subtitle_then_blind" as const;
  return "bare_summary" as const;
}
