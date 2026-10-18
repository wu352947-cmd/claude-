import { useEffect, useState } from "react";
import { api } from "../api";
import { QuestionCard } from "../components/QuestionCard";
import { formatDue } from "../format";
import type { ReviewItem } from "../types";

const SCOPES = [
  { value: "due", label: "到期" },
  { value: "active", label: "全部" },
  { value: "graduated", label: "已毕业" },
] as const;

export function Mistakes({ onStart }: { onStart: (ids: string[]) => void }) {
  const [scope, setScope] = useState<(typeof SCOPES)[number]["value"]>("due");
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(null);
    api<ReviewItem[]>(`/review?scope=${scope}`)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [scope]);

  if (error) return <p className="error">{error}</p>;

  return (
    <section>
      <div className="section-head">
        <div className="chips">
          {SCOPES.map((s) => (
            <button key={s.value} className={`chip ${scope === s.value ? "on" : ""}`} onClick={() => setScope(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        {items && items.length > 0 && scope !== "graduated" && (
          <button className="primary" onClick={() => onStart(items.map((i) => i.id))}>
            全部重做
          </button>
        )}
      </div>
      {!items ? (
        <p className="muted">加载中…</p>
      ) : items.length === 0 ? (
        <p className="empty">{scope === "due" ? "没有到期的错题 🎉" : "这里还是空的。"}</p>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <QuestionCard
              key={item.id}
              q={item}
              badge={item.is_due ? "到期" : undefined}
              onClick={() => onStart([item.id])}
              extra={
                <p className="muted small">
                  {item.graduated ? "已毕业" : `下次复习：${formatDue(item.due)}`} · 复习 {item.reps} 次 · 重错 {item.lapses} 次
                  {item.last_error_label && ` · 上次错因：${item.last_error_label}`}
                </p>
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
