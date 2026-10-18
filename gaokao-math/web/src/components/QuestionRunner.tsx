import { useEffect, useRef, useState } from "react";
import { AI_NOTE, aiStatus } from "../ai";
import { api } from "../api";
import { enqueue, isNetworkError } from "../offline";
import { formatDue, formatSeconds } from "../format";
import {
  ERROR_TYPES,
  TYPE_LABELS,
  type AiStatus,
  type AttemptResult,
  type Confidence,
  type ErrorType,
  type QuestionDetail,
  type Reveal,
} from "../types";
import { FlagControl } from "./FlagControl";
import { FillInput, Options } from "./Inputs";
import { MathText } from "./MathText";

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
  const [error, setError] = useState(""); // 题目加载失败
  const [notice, setNotice] = useState(""); // 操作失败，题目照常显示
  const [choice, setChoice] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [hints, setHints] = useState<{ text: string; ai: boolean }[]>([]);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [confidence, setConfidence] = useState<Confidence>("sure");
  const [selfGrading, setSelfGrading] = useState<Reveal | null>(null);
  const [partScores, setPartScores] = useState<number[]>([]);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState<number | null>(null);
  const elapsed = useElapsed(frozen === null);
  const seconds = frozen ?? elapsed;

  useEffect(() => {
    api<QuestionDetail>(`/questions/${encodeURIComponent(questionId)}`)
      .then(setQ)
      .catch((e) => setError(e.message));
    aiStatus().then(setAi);
  }, [questionId]);

  if (error) return <p className="error">{error}</p>;
  if (!q) return <p className="muted">加载中…</p>;

  const overtime = seconds > q.est_seconds * 1.5;

  const manualHints = hints.filter((h) => !h.ai).length;
  const aiHints = hints.filter((h) => h.ai).length;

  async function nextHint() {
    if (!q) return;
    const r = await api<{ hint: string }>(`/questions/${encodeURIComponent(q.id)}/hints/${manualHints + 1}`);
    setHints([...hints, { text: r.hint, ai: false }]);
  }

  async function aiHint() {
    if (!q || aiBusy) return;
    setAiBusy(true);
    try {
      const r = await api<{ hint: string }>("/ai/hint", {
        body: { question_id: q.id, level: aiHints + 1, current_answer: value || choice || choices.join("") },
      });
      setHints([...hints, { text: r.hint, ai: true }]);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setAiBusy(false);
    }
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
    const body = { question_id: q.id, response, seconds, hints_used: hints.length, revealed, confidence };
    try {
      setResult(await api<AttemptResult>("/attempts", { body }));
    } catch (e) {
      if (isNetworkError(e) && !revealed) {
        await enqueue({ ...body, answered_at: new Date().toISOString() });
        setResult({ attempt_id: 0, queued: true } as AttemptResult);
      } else {
        setNotice(isNetworkError(e) ? "没有网络：看答案需要联网" : (e as Error).message);
        setFrozen(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function startSelfGrading() {
    if (!q) return;
    try {
      const r = await api<Reveal>(`/questions/${encodeURIComponent(q.id)}/reveal`, { method: "POST" });
      setFrozen(seconds);
      setPartScores(r.parts.map(() => 0));
      setSelfGrading(r);
    } catch (e) {
      setNotice(isNetworkError(e) ? "没有网络：对照答案需要联网" : (e as Error).message);
    }
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
      {q.figure && <img className="figure" src={q.figure} alt="题目配图" loading="lazy" />}

      {q.options && (
        <Options
          options={q.options}
          type={q.type}
          selected={q.type === "single" ? (choice ? [choice] : []) : choices}
          onChange={(sel) => (q.type === "single" ? setChoice(sel[0] ?? "") : setChoices(sel))}
          correct={result && !result.queued ? ([] as string[]).concat(result.reveal.answer ?? []) : undefined}
        />
      )}

      {q.type === "fill" && (
        <FillInput
          value={value}
          onChange={setValue}
          kind={q.answer_kind}
          disabled={!!result}
          onEnter={() => canSubmit && submit()}
        />
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
              <MathText text={h.text} />
              {h.ai && <span className="ai-note">{AI_NOTE}</span>}
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

      {notice && <p className="error">{notice}</p>}
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
            {manualHints < q.hints_total && (
              <button className="ghost" onClick={nextHint}>
                提示 {manualHints + 1}/{q.hints_total}
              </button>
            )}
            {ai?.text && aiHints < 2 && (
              <button className="ghost" disabled={aiBusy} onClick={aiHint}>
                {aiBusy ? "AI 思考中…" : `AI 提示 ${aiHints + 1}/2`}
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

      {result?.queued && (
        <section className="result queued">
          <h3>已离线保存</h3>
          <p>现在没有网络，这道题的作答已经存在手机上，联网后会自动判分并更新错题本。</p>
          {onNext && (
            <button className="primary next" onClick={onNext}>
              下一题 →
            </button>
          )}
        </section>
      )}
      {result && !result.queued && <ResultPanel result={result} q={q} ai={ai} onNext={onNext} />}
      <FlagControl key={q.id} q={q} />
    </article>
  );
}

interface Explanation {
  explanation: string;
  error_type: ErrorType | null;
  error_reason: string;
}

function ResultPanel({ result, q, ai, onNext }: { result: AttemptResult; q: QuestionDetail; ai: AiStatus | null; onNext?: () => void }) {
  const type = q.type;
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [explain, setExplain] = useState<Explanation | null>(null);
  const [variantMsg, setVariantMsg] = useState("");
  const [aiBusy, setAiBusy] = useState("");
  const [aiError, setAiError] = useState("");
  const { reveal, review } = result;

  async function askExplain() {
    setAiBusy("explain");
    setAiError("");
    try {
      const r = await api<Explanation>("/ai/explain", { body: { attempt_id: result.attempt_id } });
      setExplain(r);
      if (r.error_type && !errorType) setErrorType(r.error_type);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy("");
    }
  }

  async function makeVariants() {
    setAiBusy("variants");
    setAiError("");
    try {
      const r = await api<{ created: string[]; rejected: string[] }>("/ai/variants", {
        body: { question_id: q.id, count: 2 },
      });
      setVariantMsg(
        r.created.length
          ? `已生成 ${r.created.length} 道变式题（通过交叉验证），以后复习这道题时会交替出现。`
          : `这次没有生成成功：${r.rejected[0] ?? "原因未知"}`,
      );
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy("");
    }
  }

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

      {ai?.text && (
        <div className="ai-actions">
          {!explain && (
            <button className="ghost" disabled={!!aiBusy} onClick={askExplain}>
              {aiBusy === "explain" ? "AI 讲解中…" : "AI 讲解我的作答"}
            </button>
          )}
          {!q.parent_id && !variantMsg && (
            <button className="ghost" disabled={!!aiBusy} onClick={makeVariants}>
              {aiBusy === "variants" ? "生成并验证中，约半分钟…" : "生成变式题"}
            </button>
          )}
        </div>
      )}
      {aiError && <p className="error">{aiError}</p>}
      {explain && (
        <div className="ai-box">
          <MathText text={explain.explanation} />
          {explain.error_type && (
            <p className="muted small">
              AI 判断错因：{ERROR_TYPES.find((t) => t.value === explain.error_type)?.label}——
              <MathText text={explain.error_reason} inline />
            </p>
          )}
          <span className="ai-note">{AI_NOTE}</span>
        </div>
      )}
      {variantMsg && <p className="muted small">{variantMsg}</p>}

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
