/** Offline fallback when no AI API key is configured. */

const STOP = new Set([
  "a", "an", "the", "is", "are", "am", "i", "you", "he", "she", "it", "we", "they",
  "to", "of", "and", "or", "in", "on", "at", "for", "with", "my", "your", "do", "does",
  "did", "have", "has", "be", "been", "was", "were", "this", "that", "what", "how",
]);

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function extractKeywords(scriptText: string, limit = 8) {
  const freq = new Map<string, number>();
  for (const w of tokenize(scriptText)) {
    if (STOP.has(w) || w.length < 3) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

export function evaluateReadAloudLocal(expected: string, spoken: string) {
  const exp = tokenize(expected);
  const sp = new Set(tokenize(spoken));
  const missed = exp.filter((w) => !STOP.has(w) && !sp.has(w));
  const hit = exp.filter((w) => STOP.has(w) || sp.has(w)).length;
  const score = exp.length ? Math.round((hit / exp.length) * 100) : 0;
  const feedback =
    score >= 80
      ? "发音很棒！注意连读时把词轻轻连起来。"
      : score >= 50
        ? `还不错。可以再练这几个词：${missed.slice(0, 5).join(", ") || "连读部分"}。`
        : `慢慢来，先看文本再读。重点词：${missed.slice(0, 6).join(", ")}。`;
  return { score, missed: missed.slice(0, 8), feedback, passed: score >= 50, provider: "local" as const };
}

export function evaluateRetellLocal(scriptText: string, retell: string) {
  const keys = extractKeywords(scriptText, 10);
  const spoken = new Set(tokenize(retell));
  const hasChinese = /[\u4e00-\u9fff]/.test(retell);
  const hitKeys = keys.filter((k) => spoken.has(k));
  const score = keys.length
    ? Math.round((hitKeys.length / Math.min(keys.length, 5)) * 100)
    : hasChinese && retell.trim().length >= 8
      ? 70
      : 40;
  const clamped = Math.min(100, score);
  const passed = clamped >= 40 || (hasChinese && retell.trim().length >= 10);
  const feedback = passed
    ? `抓住了大意${hitKeys.length ? `，关键词：${hitKeys.slice(0, 4).join(", ")}` : ""}。很好！`
    : `再听一遍，试着说出这些关键词：${keys.slice(0, 5).join(", ")}。也可以用中文讲大意。`;
  return {
    score: clamped,
    hitKeys,
    missedKeys: keys.filter((k) => !hitKeys.includes(k)).slice(0, 5),
    feedback,
    passed,
    provider: "local" as const,
  };
}

export function generateQaQuestionsLocal(scriptText: string, title: string) {
  const keys = extractKeywords(scriptText, 6);
  const topic = keys[0] ?? "this topic";
  const questions = [
    `What is this dialogue mainly about?`,
    `What's your favorite ${topic}? Why?`,
    `Can you use one sentence from "${title}" in your own life?`,
  ];
  if (keys[1]) {
    questions.push(`Have you ever talked about ${keys[1]} with a friend?`);
  }
  return { questions: questions.slice(0, 3), provider: "local" as const };
}

export function evaluateQaAnswerLocal(question: string, answer: string) {
  const len = answer.trim().length;
  const hasChinese = /[\u4e00-\u9fff]/.test(answer);
  const hasEnglish = /[a-zA-Z]/.test(answer);

  if (len < 2) {
    return {
      feedback: "试着用一句话回答，英文或中文都可以。",
      passed: false,
      provider: "local" as const,
    };
  }
  if (len < 8) {
    return {
      feedback: "可以再说详细一点点吗？比如加上 why / because。",
      passed: true,
      provider: "local" as const,
    };
  }

  const correctedSentence = hasChinese
    ? "Try answering in a full English sentence next time."
    : hasEnglish
      ? answer.trim().replace(/\bi\b/g, "I").replace(/^\w/, (c) => c.toUpperCase())
      : undefined;

  const grammarFixes =
    hasEnglish && /\bi\b/.test(answer)
      ? [{ issue: "代词 i 没有大写", suggestion: "句首或单独使用时写 I" }]
      : undefined;

  return {
    feedback: `Nice try! You answered the question about "${question.slice(0, 36)}${question.length > 36 ? "…" : ""}".`,
    passed: true,
    grammarFixes,
    correctedSentence:
      correctedSentence && correctedSentence !== answer.trim() ? correctedSentence : undefined,
    provider: "local" as const,
  };
}

export function splitLines(scriptText: string) {
  return scriptText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
