import { getAiConfig } from "@/lib/ai/config";
import { chatJson } from "@/lib/ai/openai";
import {
  evaluateQaAnswerLocal,
  evaluateReadAloudLocal,
  evaluateRetellLocal,
  generateQaQuestionsLocal,
} from "@/lib/ai/local";

const TUTOR_SYSTEM = `You are a warm British English tutor for a Chinese primary-school child.
Rules:
- Stay strictly on the given dialogue topic. No free chat.
- Feedback must be short (1-3 sentences), encouraging, concrete.
- Prefer simple English; you may add brief Chinese tips for corrections.
- Focus on pronunciation/liaison for read-aloud, keywords for retell, relevance and grammar for Q&A.
- Always return valid JSON only.`;

export type ReadAloudResult = {
  score: number;
  missed: string[];
  feedback: string;
  passed: boolean;
  provider: "llm" | "local";
};

export type RetellResult = {
  score: number;
  hitKeys: string[];
  missedKeys: string[];
  feedback: string;
  passed: boolean;
  provider: "llm" | "local";
};

export type QaGrammarFix = {
  issue: string;
  suggestion: string;
};

export type QaResult = {
  feedback: string;
  passed: boolean;
  provider: "llm" | "local";
  grammarFixes?: QaGrammarFix[];
  correctedSentence?: string;
};

export type QuestionsResult = {
  questions: string[];
  provider: "llm" | "local";
};

function clampScore(n: unknown, fallback = 60) {
  const v = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export async function evaluateReadAloud(
  scriptText: string,
  spoken: string,
): Promise<ReadAloudResult> {
  const local = evaluateReadAloudLocal(scriptText, spoken);
  if (!getAiConfig().enabled) return local;

  try {
    const data = await chatJson<{
      score?: number;
      missed?: string[];
      feedback?: string;
      passed?: boolean;
    }>({
      system: TUTOR_SYSTEM,
      temperature: 0.3,
      user: `Task: evaluate child's read-aloud against the dialogue.
Return JSON: {"score":0-100,"missed":["word"],"feedback":"...","passed":true|false}
Pass if score >= 55 OR major meaning words are present.

Dialogue:
${scriptText}

Child said:
${spoken}`,
    });

    return {
      score: clampScore(data.score, local.score),
      missed: Array.isArray(data.missed) ? data.missed.slice(0, 8).map(String) : local.missed,
      feedback: data.feedback?.trim() || local.feedback,
      passed: typeof data.passed === "boolean" ? data.passed : clampScore(data.score, local.score) >= 55,
      provider: "llm",
    };
  } catch (err) {
    console.warn("[ai] read_aloud fallback:", err);
    return { ...local, feedback: `${local.feedback}（已切换本地评估）` };
  }
}

export async function evaluateRetell(scriptText: string, spoken: string): Promise<RetellResult> {
  const local = evaluateRetellLocal(scriptText, spoken);
  if (!getAiConfig().enabled) return local;

  try {
    const data = await chatJson<{
      score?: number;
      hitKeys?: string[];
      missedKeys?: string[];
      feedback?: string;
      passed?: boolean;
    }>({
      system: TUTOR_SYSTEM,
      temperature: 0.3,
      user: `Task: evaluate child's retell of the dialogue gist.
Chinese retell is allowed. Do not require every word.
Return JSON: {"score":0-100,"hitKeys":[],"missedKeys":[],"feedback":"...","passed":true|false}
Pass if they capture the main idea.

Dialogue:
${scriptText}

Child retell:
${spoken}`,
    });

    return {
      score: clampScore(data.score, local.score),
      hitKeys: Array.isArray(data.hitKeys) ? data.hitKeys.map(String).slice(0, 8) : local.hitKeys,
      missedKeys: Array.isArray(data.missedKeys)
        ? data.missedKeys.map(String).slice(0, 5)
        : local.missedKeys,
      feedback: data.feedback?.trim() || local.feedback,
      passed: typeof data.passed === "boolean" ? data.passed : clampScore(data.score, local.score) >= 40,
      provider: "llm",
    };
  } catch (err) {
    console.warn("[ai] retell fallback:", err);
    return { ...local, feedback: `${local.feedback}（已切换本地评估）` };
  }
}

export async function generateQaQuestions(
  scriptText: string,
  title: string,
): Promise<QuestionsResult> {
  const local = generateQaQuestionsLocal(scriptText, title);
  if (!getAiConfig().enabled) return local;

  try {
    const data = await chatJson<{ questions?: string[] }>({
      system: TUTOR_SYSTEM,
      temperature: 0.6,
      user: `Task: create exactly 3 short spoken Q&A questions for a child, based ONLY on this dialogue topic.
Questions should expand the topic personally (e.g. favorite fruit if dialogue is shopping for fruit).
Return JSON: {"questions":["...","...","..."]}

Title: ${title}
Dialogue:
${scriptText}`,
    });

    const questions = (data.questions || []).map(String).filter(Boolean).slice(0, 3);
    if (questions.length < 3) {
      return { questions: [...questions, ...local.questions].slice(0, 3), provider: "llm" };
    }
    return { questions, provider: "llm" };
  } catch (err) {
    console.warn("[ai] questions fallback:", err);
    return local;
  }
}

export async function evaluateQaAnswer(
  scriptText: string,
  question: string,
  answer: string,
): Promise<QaResult> {
  const local = evaluateQaAnswerLocal(question, answer);
  if (!getAiConfig().enabled) return local;

  try {
    const data = await chatJson<{
      feedback?: string;
      passed?: boolean;
      grammarFixes?: { issue?: string; suggestion?: string }[];
      correctedSentence?: string;
    }>({
      system: TUTOR_SYSTEM,
      temperature: 0.4,
      user: `Task: evaluate a primary-school child's spoken Q&A answer. Chinese or English OK.
Stay on dialogue topic. Be warm and brief in feedback (1-2 sentences).

If the answer is in English (or mixed), check grammar and word choice:
- List specific mistakes in grammarFixes. Write issue and suggestion in Simplified Chinese (简短、易懂，适合小学生).
  issue = 错在哪里（中文说明）; suggestion = 怎么改（中文说明，可附带英文词/短语示例）
- Give one natural correctedSentence in English that answers the same question correctly
If the answer is only in Chinese, grammarFixes may be [] or note they should try English; still give correctedSentence in English.

Return JSON:
{"feedback":"...","passed":true|false,"grammarFixes":[{"issue":"...","suggestion":"..."}],"correctedSentence":"..."}

Only fail if empty or completely irrelevant. grammarFixes may be [] if perfect.

Dialogue:
${scriptText}

Question: ${question}
Answer: ${answer}`,
    });

    const grammarFixes = Array.isArray(data.grammarFixes)
      ? data.grammarFixes
          .map((g) => ({
            issue: String(g.issue ?? "").trim(),
            suggestion: String(g.suggestion ?? "").trim(),
          }))
          .filter((g) => g.issue || g.suggestion)
          .slice(0, 5)
      : local.grammarFixes;

    const correctedSentence = data.correctedSentence?.trim() || local.correctedSentence;

    return {
      feedback: data.feedback?.trim() || local.feedback,
      passed: typeof data.passed === "boolean" ? data.passed : local.passed,
      grammarFixes,
      correctedSentence,
      provider: "llm",
    };
  } catch (err) {
    console.warn("[ai] qa fallback:", err);
    return { ...local, feedback: `${local.feedback}（已切换本地评估）` };
  }
}
