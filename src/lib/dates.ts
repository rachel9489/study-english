import { formatInTimeZone } from "date-fns-tz";

/** App day boundary and unlock clocks use China local time (Vercel is UTC). */
export const APP_TIMEZONE = "Asia/Shanghai";

export function todayKey(date = new Date()) {
  return formatInTimeZone(date, APP_TIMEZONE, "yyyy-MM-dd");
}

export function tomorrowKey(date = new Date()) {
  return addDaysKey(todayKey(date), 1);
}

export function addDaysKey(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatInTimeZone(d, APP_TIMEZONE, "yyyy-MM-dd");
}

export function nowTimeKey(date = new Date()) {
  return formatInTimeZone(date, APP_TIMEZONE, "HH:mm");
}

/** 当日新任务开始时间（AI课/听力等；预习对话不受此限制） */
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
