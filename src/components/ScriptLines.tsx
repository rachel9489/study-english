"use client";

import { useMemo, useState } from "react";
import { tokenizeWords } from "@/lib/tts";

type Vocab = { word: string; meaning: string; phonetic?: string };

function ConversationIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

export function ScriptLines({
  scriptText,
  vocabularies = [],
  activeIndex,
  doneIndexes = [],
  readingLineIndex,
  readingWordIndex,
  variant = "chips",
  onSelect,
  onLineClick,
  recordingIndex,
  lineScores,
  showSpeaker = true,
}: {
  scriptText: string;
  vocabularies?: Vocab[];
  activeIndex?: number;
  doneIndexes?: number[];
  readingLineIndex?: number | null;
  readingWordIndex?: number | null;
  variant?: "chips" | "document";
  onSelect?: (index: number, line: string) => void;
  /** document 模式：点击句子 */
  onLineClick?: (index: number, line: string) => void;
  recordingIndex?: number | null;
  lineScores?: Record<string, { score: number }>;
  showSpeaker?: boolean;
}) {
  const lines = useMemo(
    () => scriptText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [scriptText],
  );
  const [tip, setTip] = useState<Vocab | null>(null);
  const documentMode = variant === "document";

  const vocabMap = useMemo(() => {
    const m = new Map<string, Vocab>();
    for (const v of vocabularies) m.set(v.word.toLowerCase(), v);
    return m;
  }, [vocabularies]);

  function renderLine(line: string, lineIndex: number) {
    const words = tokenizeWords(line);
    let wordCursor = 0;

    return line.split(/(\s+|[^\s]+)/).map((token, i) => {
      const clean = token.toLowerCase().replace(/[^a-z']/g, "");
      const isWord = /[A-Za-z']+/.test(token);
      const vocab = clean ? vocabMap.get(clean) : undefined;
      const wordIdx = isWord ? wordCursor++ : -1;
      const reading =
        readingLineIndex === lineIndex &&
        wordIdx >= 0 &&
        readingWordIndex != null &&
        wordIdx === readingWordIndex;

      const highlightClass = reading ? "word-reading" : "";

      if (vocab && isWord) {
        return (
          <button
            key={i}
            type="button"
            className={`vocab-mark ${highlightClass}`.trim()}
            onClick={(e) => {
              e.stopPropagation();
              setTip(vocab);
            }}
          >
            {token}
          </button>
        );
      }

      if (isWord) {
        return (
          <span key={i} className={highlightClass}>
            {token}
          </span>
        );
      }

      return <span key={i}>{token}</span>;
    });
  }

  function handleLineActivate(index: number, line: string) {
    if (onLineClick) {
      onLineClick(index, line);
      return;
    }
    onSelect?.(index, line);
  }

  return (
    <div className={documentMode ? "script-lines-document" : undefined}>
      {lines.map((line, index) => {
        const score = lineScores?.[String(index)]?.score;
        const classes = [
          documentMode ? "script-doc-line" : "line-chip",
          !documentMode && onSelect ? "clickable" : "",
          documentMode ? "clickable" : "",
          activeIndex === index ? "active" : "",
          doneIndexes.includes(index) ? "done" : "",
          recordingIndex === index ? "recording" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const lineBody = (
          <>
            {showSpeaker && !documentMode ? (
              <span className="mb-1 block text-xs text-[var(--ink-soft)]">
                第 {index + 1} 句
                {doneIndexes.includes(index) ? " · 已跟读 ✓" : ""}
              </span>
            ) : null}
            <span className={documentMode ? "script-doc-text" : "text-lg leading-relaxed"}>
              {documentMode && doneIndexes.includes(index) ? (
                <span className="script-doc-check" aria-hidden>
                  ✓{" "}
                </span>
              ) : null}
              {renderLine(line, index)}
              {documentMode && score != null ? (
                <span className="script-line-score">{score}分</span>
              ) : null}
            </span>
          </>
        );

        return (
          <button
            key={index}
            type="button"
            className={classes}
            onClick={() => handleLineActivate(index, line)}
          >
            {lineBody}
          </button>
        );
      })}
      {tip && (
        <div className="mt-3 rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-[var(--ink)]">
          <strong>{tip.word}</strong>
          {tip.phonetic ? <span className="ml-2 opacity-70">{tip.phonetic}</span> : null}
          <div className="mt-1">{tip.meaning}</div>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => setTip(null)}>
            关闭
          </button>
        </div>
      )}
    </div>
  );
}

export { ConversationIcon };
