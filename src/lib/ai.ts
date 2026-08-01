/** Compatibility barrel — prefer importing from `@/lib/ai/*`. */

export {
  evaluateQaAnswerLocal as evaluateQaAnswer,
  evaluateReadAloudLocal as evaluateReadAloud,
  evaluateRetellLocal as evaluateRetell,
  generateQaQuestionsLocal as generateQaQuestions,
  splitLines,
  tokenize,
  extractKeywords,
} from "@/lib/ai/local";
