import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { QuestionCard } from "../components/QuestionCard";
import { TYPE_LABELS, type BankItem, type Kp, type QType } from "../types";

export function Bank({ onStart }: { onStart: (ids: string[]) => void }) {
  const [items, setItems] = useState<BankItem[] | null>(null);
  const [kps, setKps] = useState<Kp[]>([]);
  const [module, setModule] = useState("");
  const [type, setType] = useState<QType | "">("");
  const [query, setQuery] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<BankItem[]>("/questions"), api<Kp[]>("/kps")])
      .then(([q, k]) => {
        setItems(q);
        setKps(k);
      })
      .catch((e) => setError(e.message));
  }, []);

  const modules = useMemo(() => [...new Set(kps.map((k) => k.module))], [kps]);
  const shown = (items ?? []).filter(
    (q) =>
      (!module || q.kps.some((k) => k.module === module)) &&
      (!type || q.type === type) &&
      (!onlyNew || q.attempts === 0) &&
      (!query || q.preview.includes(query) || q.source.includes(query) || q.id.includes(query)),
  );

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p className="muted">加载中…</p>;

  return (
    <section>
      <div className="filters">
        <select value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">全部模块</option>
          {modules.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as QType | "")}>
          <option value="">全部题型</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input placeholder="搜索题干 / 来源" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> 只看没做过的
        </label>
      </div>
      <div className="section-head">
        <p className="muted">共 {shown.length} 道</p>
        {shown.length > 0 && (
          <button className="ghost" onClick={() => onStart(shown.map((q) => q.id))}>
            按顺序做这些题
          </button>
        )}
      </div>
      <ul className="list">
        {shown.map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            badge={q.in_review ? "错题本" : q.is_variant ? "变式" : undefined}
            onClick={() => onStart([q.id])}
            extra={
              <p className="muted small">
                {q.source || q.id} · 做过 {q.attempts} 次{q.variants ? ` · ${q.variants} 道变式` : ""}
              </p>
            }
          />
        ))}
      </ul>
    </section>
  );
}
