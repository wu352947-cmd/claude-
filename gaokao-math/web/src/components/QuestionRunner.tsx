import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { formatDue, formatSeconds } from "../format";
import {
  ERROR_TYPES,
  TYPE_LABELS,
  type AttemptResult,
  type Confidence,
  type ErrorType,
  type QuestionDetail,
  type Reveal,
} from "../types";
import { AnswerPreview, MathText } from "./MathText";

const KIND_TIPS: Record<string, string> = {
  expr: "可以写 LaTeX，也可以直接写 √3/2、2π/3",
  set: "有多个答案时用逗号或「或」隔开",
  interval: "如 (2,+∞)，多段用 ∪ 连接",
  equation: "写成方程，如 x-y+1=0",
};
const INSERTS = ["√", "π", "∞", "∪", "(", ")", "[", "]", ",", "/", "^"];
const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: "sure", label: "有把握" },
  { value: "unsure", label: "不踏实" },
  { value: "guess", label: "蒙的" },
];

function useElapsed(running: boolean): number {
  const start = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return Math.max(0, Math.round((now - start.current) / 1000));
}

interface Props {
  questionId: string;
  reason?: string;
  position?: { index: number; total: number };
  onNext?: () => void;
}

export function QuestionRunner({ questionId, reason, position, onNext }: Props) {
  const [q, setQ] = useState<QuestionDetail | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Confidence>("sure");
  const [selfGrading, setSelfGrading] = useState<Reveal | null>(null);
  const [partScores, setPartScores] = useState<number[]>([]);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const elapsed = useElapsed(frozen === null);
  const seconds = frozen ?? elapsed;

  useEffect(() => {
    api<QuestionDetail>(`/questions/${encodeURIComponent(questionId)}`)
      .then(setQ)
      .catch((e) => setError(e.message));
  }, [questionId]);

  if (error) return <p className="error">{error}</p>;
  if (!q) return <p className="muted">加载中…</p>;

  const overtime = seconds > q.est_seconds * 1.5;

  async function nextHint() {
    if (!q) return;
    const r = await api<{ hint: string }>(`/questions/${encodeURIComponent(q.id)}/hints/${hints.length + 1}`);
    setHints([...hints, r.hint]);
  }

  async function submit(revealed = false) {
    if (!q || busy) return;
    const response =
      q.type === "single"
        ? { choice }
        : q.type === "multi"
          ? { choices }
          : q.type === "fill"
            ? { value }
            : { part_scores: partScores };
    setBusy(true);
    setFrozen(seconds);
    try {
      const r = await api<AttemptResult>("/attempts", {
        body: { question_id: q.id, response, seconds, hints_used: hints.length, revealed, confidence },
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startSelfGrading() {
    if (!q) return;
    setFrozen(seconds);
    const r = await api<Reveal>(`/questions/${encodeURIComponent(q.id)}/reveal`, { method: "POST" });
    setPartScores(r.parts.map(() => 0));
    setSelfGrading(r);
  }

  function insert(text: string) {
    const el = inputRef.current;
    if (!el) return setValue(value + text);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const canSubmit =
    (q.type === "single" && choice) || (q.type === "multi" && choices.length) || (q.type === "fill" && value.trim());

  return (
    <article className="runner">
      <header className="runner-head">
        <div className="tags">
          {position && (
            <span className="tag strong">
              {position.index + 1} / {position.total}
            </span>
          )}
          <span className="tag">{TYPE_LABELS[q.type]}</span>
          <span className="tag">{q.difficulty_label}</span>
          <span className="tag">{q.points} 分</span>
          {q.kps.map((k) => (
            <span key={k.id} className="tag kp">
              {k.name}
            </span>
          ))}
        </div>
        <span className={`timer ${overtime ? "over" : ""}`} title={`建议用时 ${formatSeconds(q.est_seconds)}`}>
          {formatSeconds(seconds)} / {formatSeconds(q.est_seconds)}
        </span>
      </header>
      {reason && <p className="reason">{reason}</p>}
      {q.source && <p className="muted small">{q.source}</p>}

      <MathText text={q.stem} className="math-text stem" />

      {q.options && (
        <div className="options">
          {Object.entries(q.options).map(([letter, text]) => {
            const selected = q.type === "single" ? choice === letter : choices.includes(letter);
            const correct = result && (result.reveal.answer as string[] | string).includes(letter);
            return (
              <button
                key={letter}
                className={`option ${selected ? "selected" : ""} ${result ? (correct ? "correct" : selected ? "wrong" : "") : ""}`}
                disabled={!!result}
                onClick={() =>
                  q.type === "single"
                    ? setChoice(letter)
                    : setChoices(selected ? choices.filter((c) => c !== letter) : [...choices, letter].sort())
                }
              >
                <span className="letter">{letter}</span>
                <MathText text={text} inline className="math-text" />
              </button>
            );
          })}
        </div>
      )}

      {q.type === "fill" && (
        <div className="fill">
          <input
            ref={inputRef}
            value={value}
            disabled={!!result}
            placeholder="你的答案"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
          />
          {!result && (
            <div className="inserts">
              {INSERTS.map((s) => (
                <button key={s} className="chip" onClick={() => insert(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <p className="muted small">
            {KIND_TIPS[q.answer_kind ?? "expr"]}
            {value.trim() && (
              <>
                　预览：
                <AnswerPreview value={value} />
              </>
            )}
          </p>
        </div>
      )}

      {q.type === "solve" && !selfGrading && (
        <div className="parts">
          {q.parts.map((p) => (
            <span key={p.label} className="tag">
              {p.label} {p.points} 分
            </span>
          ))}
          <p className="muted small">在纸上写完整过程，写完后对照答案按得分点给自己打分。</p>
        </div>
      )}

      {hints.length > 0 && (
        <ol className="hints">
          {hints.map((h, i) => (
            <li key={i}>
              <MathText text={h} />
            </li>
          ))}
        </ol>
      )}

      {selfGrading && !result && (
        <section className="self-grade">
          <h3>对照答案自评</h3>
          <MathText text={selfGrading.solution} />
          {selfGrading.parts.map((p, i) => (
            <div key={p.label} className="part-score">
              <div>
                <strong>{p.label}</strong> {p.answer && <MathText text={p.answer} inline />}
                {p.rubric.length > 0 && (
                  <ul className="rubric">
                    {p.rubric.map((r, j) => (
                      <li key={j}>
                        <MathText text={r} inline />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <label>
                <input
                  type="number"
                  min={0}
                  max={p.points}
                  step={1}
                  value={partScores[i]}
                  onChange={(e) => {
                    const next = [...partScores];
                    next[i] = Math.min(p.points, Math.max(0, Number(e.target.value) || 0));
                    setPartScores(next);
                  }}
                />{" "}
                / {p.points}
              </label>
            </div>
          ))}
        </section>
      )}

      {!result && (
        <footer className="actions">
          <div className="confidence">
            {CONFIDENCE.map((c) => (
              <button
                key={c.value}
                className={`chip ${confidence === c.value ? "on" : ""}`}
                onClick={() => setConfidence(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="buttons">
            {hints.length < q.hints_total && (
              <button className="ghost" onClick={nextHint}>
                提示 {hints.length + 1}/{q.hints_total}
              </button>
            )}
            {q.type === "solve" ? (
              selfGrading ? (
                <button className="primary" disabled={busy} onClick={() => submit(true)}>
                  记录得分
                </button>
              ) : (
                <button className="primary" onClick={startSelfGrading}>
                  我做完了，对照答案
                </button>
              )
            ) : (
              <>
                <button className="ghost" disabled={busy} onClick={() => confirm("不会做，直接看答案？") && submit(true)}>
                  不会，看答案
                </button>
                <button className="primary" disabled={!canSubmit || busy} onClick={() => submit()}>
                  提交
                </button>
              </>
            )}
          </div>
        </footer>
      )}

      {result && <ResultPanel result={result} type={q.type} onNext={onNext} />}
    </article>
  );
}

function ResultPanel({ result, type, onNext }: { result: AttemptResult; type: string; onNext?: () => void }) {
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const { reveal, review } = result;

  async function save() {
    await api(`/attempts/${result.attempt_id}/reflection`, { body: { error_type: errorType, note } });
    setSaved(true);
  }

  const answerText = Array.isArray(reveal.answer) ? reveal.answer.join("") : reveal.answer;

  return (
    <section className={`result ${result.full ? "ok" : "bad"}`}>
      <h3>
        {result.full ? "✓ 做对了" : result.score > 0 ? "部分得分" : "✗ 没做对"}
        <span className="score">
          {result.score} / {result.max_score} 分
        </span>
      </h3>
      {type !== "solve" && (
        <p>
          正确答案：
          {type === "fill" ? <MathText text={`$${answerText}$`} inline /> : <strong>{answerText}</strong>}
        </p>
      )}
      {type !== "solve" && reveal.solution && (
        <details open={!result.full}>
          <summary>解答</summary>
          <MathText text={reveal.solution} />
        </details>
      )}

      <ul className="changes">
        {result.mastery.map((m) => (
          <li key={m.kp_id}>
            {m.name}：{m.before}% → <strong className={m.after >= m.before ? "up" : "down"}>{m.after}%</strong>
          </li>
        ))}
        {review &&
          (review.graduated ? (
            <li>这道题已从错题本毕业 🎓</li>
          ) : (
            <li>
              {review.created ? "已加入错题本" : "错题本已更新"}，下次复习：{formatDue(review.due)}
            </li>
          ))}
      </ul>

      {!result.full && !saved && (
        <div className="reflection">
          <p>这道题主要错在哪？</p>
          <div className="chips">
            {ERROR_TYPES.map((t) => (
              <button
                key={t.value}
                className={`chip ${errorType === t.value ? "on" : ""}`}
                onClick={() => setErrorType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            maxLength={500}
            placeholder="一句话反思：下次看到什么条件要想到什么？"
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="ghost" disabled={!errorType && !note.trim()} onClick={save}>
            保存反思
          </button>
        </div>
      )}
      {saved && <p className="muted">反思已保存。</p>}

      {onNext && (
        <button className="primary next" onClick={onNext}>
          下一题 →
        </button>
      )}
    </section>
  );
}
