import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { FillInput, Options } from "../components/Inputs";
import { MathText } from "../components/MathText";
import { formatSeconds } from "../format";
import { TYPE_LABELS, type ExamBrief, type ExamDetail, type ExamSlot } from "../types";

type Answers = Record<string, Record<string, unknown>>;
interface Draft {
  answers: Answers;
  seconds: Record<string, number>;
}

const STATUS_LABEL = { ongoing: "进行中", grading: "待自评", done: "已完成" };

export function Exams({ onPractice }: { onPractice: (ids: string[]) => void }) {
  const [list, setList] = useState<ExamBrief[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<ExamBrief[]>("/exams")
      .then(setList)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function start() {
    if (!confirm("开始一场 120 分钟的模考？\n计时从现在开始，中途离开页面会自动保存作答。")) return;
    setBusy(true);
    try {
      const exam = await api<ExamBrief>("/exams", { body: {} });
      setOpenId(exam.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (openId !== null)
    return (
      <ExamView
        id={openId}
        onBack={() => {
          setOpenId(null);
          load();
        }}
        onPractice={onPractice}
      />
    );
  if (error) return <p className="error">{error}</p>;
  if (!list) return <p className="muted">加载中…</p>;

  return (
    <section>
      <div className="section-head">
        <p className="muted small">按新课标 I 卷 19 个题位从题库组卷，限时 120 分钟，交卷后解答题对照得分点自评。</p>
        <button className="primary" disabled={busy} onClick={start}>
          开始模考
        </button>
      </div>
      {list.length === 0 ? (
        <p className="empty">还没有模考记录。题库题目越多，组出来的卷子越完整。</p>
      ) : (
        <ul className="list">
          {list.map((e) => (
            <li key={e.id}>
              <button className="card exam-card" onClick={() => setOpenId(e.id)}>
                <div>
                  <strong>{e.title}</strong>
                  <p className="muted small">
                    {new Date(e.created_at).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {STATUS_LABEL[e.status]}
                  </p>
                </div>
                <span className="exam-score">
                  {e.score !== null ? `${e.score}` : "—"}
                  <span className="muted small"> / 150</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExamView({ id, onBack, onPractice }: { id: number; onBack: () => void; onPractice: (ids: string[]) => void }) {
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    api<ExamDetail>(`/exams/${id}`)
      .then(setExam)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!exam) return <p className="muted">加载中…</p>;
  return (
    <>
      <button className="back" onClick={onBack}>
        ← 模考列表
      </button>
      {exam.status === "ongoing" && <ExamTake exam={exam} onDone={setExam} onAbandon={onBack} />}
      {exam.status === "grading" && <ExamGrade exam={exam} onDone={setExam} />}
      {exam.status === "done" && <ExamReportView exam={exam} onPractice={onPractice} />}
    </>
  );
}

// ---------------------------------------------------------------- 作答

function answered(slot: ExamSlot, a: Record<string, unknown> | undefined): boolean {
  if (!slot.question || slot.type === "solve") return false;
  if (!a) return false;
  return Boolean(a.choice || (Array.isArray(a.choices) && a.choices.length) || (typeof a.value === "string" && a.value.trim()));
}

function ExamTake({ exam, onDone, onAbandon }: { exam: ExamDetail; onDone: (e: ExamDetail) => void; onAbandon: () => void }) {
  const key = `gm-exam-${exam.id}`;
  const slots = exam.slots;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "") as Draft;
    } catch {
      return { answers: {}, seconds: {} };
    }
  });
  const [index, setIndex] = useState(() => Math.max(0, slots.findIndex((s) => s.question)));
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = slots[index];
  const indexRef = useRef(index);
  indexRef.current = index;

  // 每秒给当前题累计用时，并保存草稿
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      setDraft((d) => {
        const no = String(slots[indexRef.current].no);
        return { ...d, seconds: { ...d.seconds, [no]: (d.seconds[no] ?? 0) + 1 } };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [slots]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* 存不了也不影响作答 */
    }
  }, [draft, key]);

  const deadline = new Date(exam.created_at).getTime() + exam.minutes * 60_000;
  const remaining = Math.max(0, Math.round((deadline - now) / 1000));
  const setAnswer = (a: Record<string, unknown>) =>
    setDraft((d) => ({ ...d, answers: { ...d.answers, [String(current.no)]: a } }));

  async function finish(auto = false) {
    const objective = slots.filter((s) => s.question && s.type !== "solve");
    const blank = objective.filter((s) => !answered(s, draft.answers[String(s.no)])).length;
    if (!auto && !confirm(blank ? `还有 ${blank} 道客观题没作答，确定交卷？` : "确定交卷？")) return;
    setBusy(true);
    try {
      const r = await api<ExamDetail>(`/exams/${exam.id}/finish`, { body: draft });
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      onDone(r);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function abandon() {
    if (!confirm("放弃这场模考？不会留下任何记录。")) return;
    await api(`/exams/${exam.id}`, { method: "DELETE" });
    onAbandon();
  }

  const timeUp = remaining === 0;
  const a = draft.answers[String(current.no)] ?? {};
  const q = current.question;

  return (
    <article className="runner exam">
      <header className="runner-head">
        <strong>{exam.title}</strong>
        <span className={`timer big ${remaining < 600 ? "over" : ""}`}>{formatSeconds(remaining)}</span>
      </header>
      {timeUp && <p className="warn">时间到了，请交卷。</p>}

      <nav className="slot-grid" aria-label="题号">
        {slots.map((s, i) => (
          <button
            key={s.no}
            className={`slot ${i === index ? "current" : ""} ${answered(s, draft.answers[String(s.no)]) ? "done" : ""} ${s.question ? "" : "no-q"}`}
            onClick={() => setIndex(i)}
            disabled={!s.question}
            title={s.question ? `${s.no}. ${TYPE_LABELS[s.type]}` : `${s.no}. 题库里没有合适的题`}
          >
            {s.no}
          </button>
        ))}
      </nav>

      <div className="tags">
        <span className="tag strong">第 {current.no} 题</span>
        <span className="tag">{TYPE_LABELS[current.type]}</span>
        <span className="tag">{current.points} 分</span>
        {current.matched !== "kp" && current.matched !== "none" && <span className="tag">{current.matched_label}</span>}
      </div>

      {q ? (
        <>
          <MathText text={q.stem} className="math-text stem" />
          {q.figure && <img className="figure" src={q.figure} alt="题目配图" />}
          {q.options && (
            <Options
              options={q.options}
              type={q.type}
              selected={q.type === "single" ? (a.choice ? [String(a.choice)] : []) : ((a.choices as string[]) ?? [])}
              onChange={(sel) => setAnswer(q.type === "single" ? { choice: sel[0] ?? "" } : { choices: sel })}
            />
          )}
          {q.type === "fill" && (
            <FillInput value={String(a.value ?? "")} onChange={(v) => setAnswer({ value: v })} kind={q.answer_kind} />
          )}
          {q.type === "solve" && (
            <p className="muted small">
              在答题纸上写完整过程（{q.parts.map((p) => `${p.label} ${p.points} 分`).join("，")}），交卷后对照得分点自评。
            </p>
          )}
        </>
      ) : (
        <p className="empty">题库里没有适合这个题位的题，这题不计分。</p>
      )}

      {error && <p className="error">{error}</p>}
      <footer className="actions">
        <div className="buttons">
          <button className="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            上一题
          </button>
          <button className="ghost" disabled={index === slots.length - 1} onClick={() => setIndex(index + 1)}>
            下一题
          </button>
        </div>
        <div className="buttons">
          <button className="ghost danger" onClick={abandon}>
            放弃
          </button>
          <button className="primary" disabled={busy} onClick={() => finish()}>
            交卷
          </button>
        </div>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------- 解答题自评

function ExamGrade({ exam, onDone }: { exam: ExamDetail; onDone: (e: ExamDetail) => void }) {
  const solveSlots = exam.slots.filter((s) => s.type === "solve" && s.question && s.reveal);
  const [scores, setScores] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(solveSlots.map((s) => [String(s.no), s.reveal!.parts.map(() => 0)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    try {
      onDone(await api<ExamDetail>(`/exams/${exam.id}/grade`, { body: { part_scores: scores } }));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="form">
      <h2>解答题自评</h2>
      <p className="muted small">对照每一问的得分点，按高考阅卷标准给自己打分。宁可严一点，预测分才准。</p>
      {solveSlots.map((s) => (
        <article key={s.no} className="runner">
          <div className="tags">
            <span className="tag strong">第 {s.no} 题</span>
            <span className="tag">{s.points} 分</span>
          </div>
          <MathText text={s.question!.stem} className="math-text stem" />
          {s.question!.figure && <img className="figure" src={s.question!.figure} alt="题目配图" />}
          <details>
            <summary>标准解答</summary>
            <MathText text={s.reveal!.solution} />
          </details>
          {s.reveal!.parts.map((p, i) => (
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
                  value={scores[String(s.no)][i]}
                  onChange={(e) => {
                    const next = [...scores[String(s.no)]];
                    next[i] = Math.min(p.points, Math.max(0, Number(e.target.value) || 0));
                    setScores({ ...scores, [String(s.no)]: next });
                  }}
                />{" "}
                / {p.points}
              </label>
            </div>
          ))}
        </article>
      ))}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy} onClick={submit}>
        生成成绩报告
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- 成绩报告

function ExamReportView({ exam, onPractice }: { exam: ExamDetail; onPractice: (ids: string[]) => void }) {
  const r = exam.report!;
  const lost = exam.slots.filter((s, i) => s.question_id && r.slots[i].score < r.slots[i].points);
  const maxLost = Math.max(1, ...r.lost_by_module.map((m) => m.lost));
  return (
    <section>
      <div className="hero">
        <div>
          <span className="hero-number">{r.total}</span>
          <span className="muted"> / 150</span>
        </div>
        <p className="muted small">
          {exam.title} · 用时 {r.minutes_used} 分钟
          {r.predicted !== null && ` · 考前预测 ${r.predicted} 分`}
        </p>
        {r.available_points < 150 && (
          <p className="warn small">
            题库里的题还不够，这次只组出了 {r.available_points} 分的题，没出题的题位按 0 分计。多录题后模考会更完整。
          </p>
        )}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>题型</th>
            <th>得分</th>
            <th>用时</th>
          </tr>
        </thead>
        <tbody>
          {r.by_type.map((t) => (
            <tr key={t.type}>
              <td>{t.label}</td>
              <td>
                {t.score} / {t.points}
              </td>
              <td>{t.minutes} 分钟</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>逐题</h2>
      <table className="table">
        <thead>
          <tr>
            <th>题号</th>
            <th>考点</th>
            <th>得分</th>
            <th>用时</th>
          </tr>
        </thead>
        <tbody>
          {r.slots.map((s) => (
            <tr key={s.no} className={s.question_id ? (s.score >= s.points ? "row-ok" : "row-bad") : "row-empty"}>
              <td>{s.no}</td>
              <td>{s.question_id ? s.kps.join("、") : "（未出题）"}</td>
              <td>
                {s.score} / {s.points}
              </td>
              <td>{s.question_id ? formatSeconds(s.seconds) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {r.lost_by_module.length > 0 && (
        <>
          <h2>丢分模块</h2>
          <ul className="modules">
            {r.lost_by_module.map((m) => (
              <li key={m.module} className="kp-rows-item">
                <span>{m.module}</span>
                <div className="bar">
                  <div className="track">
                    <div className="fill neutral" style={{ width: `${(m.lost / maxLost) * 100}%` }} />
                  </div>
                  <span>{m.lost} 分</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.multi.count > 0 && (
        <>
          <h2>多选题</h2>
          <p>
            漏选丢 {r.multi.missed.lost} 分，错选丢 {r.multi.wrong.lost} 分。{r.multi.advice}
          </p>
        </>
      )}

      {lost.length > 0 && (
        <button className="primary next" onClick={() => onPractice(lost.map((s) => s.question_id!))}>
          重做丢分的 {lost.length} 道题
        </button>
      )}
    </section>
  );
}
