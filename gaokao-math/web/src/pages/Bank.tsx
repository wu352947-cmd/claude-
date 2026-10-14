import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { QuestionCard } from "../components/QuestionCard";
import { TYPE_LABELS, type BankItem, type Kp, type QType } from "../types";

const PAGE = 30;
const ORIGINS: Record<string, { label: string; test: (q: BankItem) => boolean }> = {
  "": { label: "全部来源", test: () => true },
  xkb: { label: "新课标卷（新高考）", test: (q) => q.source.includes("新课标I") },
  real: { label: "全部真题", test: (q) => q.year !== null },
  own: { label: "自己录的 / 变式", test: (q) => q.year === null },
};

function byNewest(a: BankItem, b: BankItem): number {
  return (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id);
}

export function Bank({ onStart }: { onStart: (ids: string[]) => void }) {
  const [items, setItems] = useState<BankItem[] | null>(null);
  const [kps, setKps] = useState<Kp[]>([]);
  const [module, setModule] = useState("");
  const [type, setType] = useState<QType | "">("");
  const [query, setQuery] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [origin, setOrigin] = useState("");
  const [year, setYear] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<BankItem[]>("/questions"), api<Kp[]>("/kps")])
      .then(([q, k]) => {
        setItems([...q].sort(byNewest));
        setKps(k);
      })
      .catch((e) => setError(e.message));
  }, []);

  const modules = useMemo(() => [...new Set(kps.map((k) => k.module))], [kps]);
  const years = useMemo(
    () => [...new Set((items ?? []).map((q) => q.year).filter((y): y is number => y !== null))].sort((a, b) => b - a),
    [items],
  );
  const shown = (items ?? []).filter(
    (q) =>
      (!module || q.kps.some((k) => k.module === module)) &&
      (!type || q.type === type) &&
      (!onlyNew || q.attempts === 0) &&
      ORIGINS[origin].test(q) &&
      (!year || q.year === Number(year)) &&
      (!query || q.preview.includes(query) || q.source.includes(query) || q.id.includes(query)),
  );
  // 换筛选条件时回到第一页
  useEffect(() => setLimit(PAGE), [module, type, onlyNew, origin, year, query]);

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
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="来源">
          {Object.entries(ORIGINS).map(([v, o]) => (
            <option key={v} value={v}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="年份">
          <option value="">全部年份</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
        <input placeholder="搜索题干 / 来源（如 新课标I卷）" value={query} onChange={(e) => setQuery(e.target.value)} />
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
        {shown.slice(0, limit).map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            badge={q.flagged ? "已报错" : q.in_review ? "错题本" : q.is_variant ? "变式" : undefined}
            onClick={() => onStart([q.id])}
            extra={
              <p className="muted small">
                {q.source || q.id} · 做过 {q.attempts} 次{q.variants ? ` · ${q.variants} 道变式` : ""}
              </p>
            }
          />
        ))}
      </ul>
      {shown.length > limit && (
        <button className="ghost more" onClick={() => setLimit(limit + PAGE)}>
          再显示 {Math.min(PAGE, shown.length - limit)} 道（还有 {shown.length - limit} 道）
        </button>
      )}
    </section>
  );
}
