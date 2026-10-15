import { useRef } from "react";
import type { AnswerKind, QType } from "../types";
import { AnswerPreview, MathText } from "./MathText";

const KIND_TIPS: Record<string, string> = {
  expr: "可以写 LaTeX，也可以直接写 √3/2、2π/3",
  set: "有多个答案时用逗号或「或」隔开",
  interval: "如 (2,+∞)，多段用 ∪ 连接",
  equation: "写成方程，如 x-y+1=0",
};
const INSERTS = ["√", "π", "∞", "∪", "(", ")", "[", "]", ",", "/", "^"];

interface OptionsProps {
  options: Record<string, string>;
  type: QType;
  selected: string[];
  onChange: (selected: string[]) => void;
  correct?: string[]; // 交卷 / 提交后标出对错
}

export function Options({ options, type, selected, onChange, correct }: OptionsProps) {
  return (
    <div className="options">
      {Object.entries(options).map(([letter, text]) => {
        const on = selected.includes(letter);
        const state = correct ? (correct.includes(letter) ? "correct" : on ? "wrong" : "") : "";
        return (
          <button
            key={letter}
            className={`option ${on ? "selected" : ""} ${state}`}
            disabled={!!correct}
            aria-pressed={on}
            onClick={() =>
              onChange(type === "single" ? [letter] : on ? selected.filter((c) => c !== letter) : [...selected, letter].sort())
            }
          >
            <span className="letter">{letter}</span>
            <MathText text={text} inline className="math-text" />
          </button>
        );
      })}
    </div>
  );
}

interface FillProps {
  value: string;
  onChange: (v: string) => void;
  kind: AnswerKind | null;
  disabled?: boolean;
  onEnter?: () => void;
}

export function FillInput({ value, onChange, kind, disabled, onEnter }: FillProps) {
  const ref = useRef<HTMLInputElement>(null);

  function insert(text: string) {
    const el = ref.current;
    if (!el) return onChange(value + text);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="fill">
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        placeholder="你的答案"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
      />
      {!disabled && (
        <div className="inserts">
          {INSERTS.map((s) => (
            <button key={s} className="chip" onClick={() => insert(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <p className="muted small">
        {KIND_TIPS[kind ?? "expr"]}
        {value.trim() && (
          <>
            {" · 预览："}
            <AnswerPreview value={value} />
          </>
        )}
      </p>
    </div>
  );
}
