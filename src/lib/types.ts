export const TASK_TYPES = [
  "PREVIEW",
  "AI_LESSON",
  "LISTENING_LADDER",
  "NIGHT_SHADOW",
  "BREAKFAST_REVIEW",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUS = [
  "locked",
  "available",
  "in_progress",
  "completed",
] as const;

export type TaskStatus = (typeof TASK_STATUS)[number];

export const MATERIAL_CATEGORIES = [
  { value: "peppa", label: "小猪佩奇" },
  { value: "easy_conversations", label: "Easy English Conversations" },
  { value: "little_fox", label: "Little Fox" },
  { value: "newsround", label: "BBC Newsround" },
  { value: "custom", label: "自定义" },
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]["value"];

export type PreviewLineResult = {
  score: number;
  feedback: string;
  transcript: string;
  missed?: string[];
};

export type PreviewProgress = {
  followedLines: number[];
  listenedLines?: number[];
  vocabOpened: string[];
  lineResults?: Record<string, PreviewLineResult>;
};

export type AiLessonProgress = {
  stage: "read_aloud" | "retell" | "qa" | "done";
  readAloudDone: boolean;
  retellDone: boolean;
  qaDone: boolean;
  qaAnswers: {
    question: string;
    answer: string;
    feedback: string;
    correctedSentence?: string;
    grammarFixes?: { issue: string; suggestion: string }[];
  }[];
  wrongWords: string[];
};

export type ListeningProgress = {
  mode: "text_then_blind_x3" | "story_retell" | "subtitle_then_blind" | "bare_summary";
  followDone: boolean;
  blindPlays: number;
  retellText?: string;
  summaryText?: string;
};

export type ShadowProgress = {
  plays: number;
  required: number;
};

export type BreakfastProgress = {
  plays: number;
};

export type TaskProgress =
  | PreviewProgress
  | AiLessonProgress
  | ListeningProgress
  | ShadowProgress
  | BreakfastProgress
  | Record<string, unknown>;

export const TASK_LABELS: Record<TaskType, string> = {
  PREVIEW: "预习对话",
  AI_LESSON: "AI 外教课",
  LISTENING_LADDER: "听力阶梯",
  NIGHT_SHADOW: "晚上裸听",
  BREAKFAST_REVIEW: "早餐巩固",
};

export const DEFAULT_DURATIONS: Record<TaskType, number> = {
  PREVIEW: 5,
  AI_LESSON: 25,
  LISTENING_LADDER: 20,
  NIGHT_SHADOW: 5,
  BREAKFAST_REVIEW: 5,
};
