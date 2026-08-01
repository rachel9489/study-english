"use client";

import { useMemo, useState } from "react";

type Vocab = { word: string; meaning: string; phonetic?: string };

export function ScriptLines({
  scriptText,
  vocabularies = [],
  activeIndex,
  doneIndexes = [],
  onSelect,
  showSpeaker = true,
}: {
  scriptText: string;
  vocabularies?: Vocab[];
  activeIndex?: number;
  doneIndexes?: number[];
  onSelect?: (index: number, line: string) => void;
  showSpeaker?: boolean;
}) {
  const lines = useMemo(
    () => scriptText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [scriptText],
  );
  const [tip, setTip] = useState<Vocab | null>(null);

  const vocabMap = useMemo(() => {
    const m = new Map<string, Vocab>();
    for (const v of vocabularies) m.set(v.word.toLowerCase(), v);
    return m;
  }, [vocabularies]);

  function renderLine(line: string) {
    return line.split(/(\s+)/).map((token, i) => {
      const clean = token.toLowerCase().replace(/[^a-z']/g, "");
      const vocab = clean ? vocabMap.get(clean) : undefined;
      if (!vocab) return <span key={i}>{token}</span>;
      return (
        <button
          key={i}
          type="button"
          className="vocab-mark"
          onClick={(e) => {
            e.stopPropagation();
            setTip(vocab);
          }}
        >
          {token}
        </button>
      );
    });
  }

  return (
    <div>
      {lines.map((line, index) => {
        const classes = [
          "line-chip",
          activeIndex === index ? "active" : "",
          doneIndexes.includes(index) ? "done" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={index}
            type="button"
            className={classes}
            onClick={() => onSelect?.(index, line)}
          >
            {showSpeaker && (
              <span className="mb-1 block text-xs text-[var(--ink-soft)]">
                第 {index + 1} 句
              </span>
            )}
            <span className="text-lg leading-relaxed">{renderLine(line)}</span>
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
