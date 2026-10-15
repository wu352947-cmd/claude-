import { useEffect, useState } from "react";
import { api } from "../api";
import { QuestionCard } from "../components/QuestionCard";
import type { Overview, TodayPlan } from "../types";

export function Today({ onStart }: { onStart: (ids: string[], reasons: Record<string, string>) => void }) {
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<TodayPlan>("/today"), api<Overview>("/stats/overview")])
      .then(([p, o]) => {
        setPlan(p);
        setOverview(o);
        // 预先取一遍今天的题，Service Worker 会缓存下来，路上没网也能做
        p.items.forEach((i) => api(`/questions/${encodeURIComponent(i.question_id)}`).catch(() => {}));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!plan || !overview) return <p className="muted">加载中…</p>;

  const reviews = plan.items.filter((i) => i.kind === "review").length;
  const explore = plan.items.filter((i) => i.kind === "explore").length;
  const fresh = plan.items.length - reviews;
  const start = () =>
    onStart(
      plan.items.map((i) => i.question_id),
      Object.fromEntries(plan.items.map((i) => [i.question_id, i.reason])),
    );

  return (
    <section>
      <div className="tiles">
        <div className="tile">
          <b>{overview.attempts_today}</b>今天已做
        </div>
        <div className="tile">
          <b>{overview.streak_days}</b>连续天数
        </div>
        <div className="tile">
          <b>{overview.cards_due}</b>到期错题
        </div>
        <div className="tile">
          <b>{overview.score_rate_7d ?? "—"}{overview.score_rate_7d !== null && "%"}</b>近 7 天得分率
        </div>
      </div>

      {overview.bank_errors.length > 0 && (
        <p className="warn">有 {overview.bank_errors.length} 个题目文件格式有误，去「看板」查看。</p>
      )}

      <div className="section-head">
        <h2>
          今日题单 <span className="muted small">{reviews} 道错题复习 + {fresh - explore} 道新题{explore ? ` + ${explore} 道随机题` : ""}</span>
        </h2>
        {plan.items.length > 0 && (
          <button className="primary" onClick={start}>
            开始
          </button>
        )}
      </div>

      {plan.items.length === 0 ? (
        <p className="empty">
          {plan.unseen_total === 0
            ? "题库里的题都做过了，到期错题也清空了。去「录题」添加新题吧。"
            : "今天没有推荐。"}
        </p>
      ) : (
        <ul className="list">
          {plan.items.map((item) => (
            <QuestionCard
              key={item.question_id}
              q={item.question}
              note={item.reason}
              badge={item.kind === "review" ? "复习" : item.kind === "explore" ? "随机" : "新题"}
              onClick={() => onStart([item.question_id], { [item.question_id]: item.reason })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
