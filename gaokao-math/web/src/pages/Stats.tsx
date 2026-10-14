import { useEffect, useState } from "react";
import { api } from "../api";
import type { ErrorBreakdown, ModuleMastery, Overview } from "../types";

// 掌握度按高低着色；失分占比只是比例，用中性色
function Bar({ value, neutral }: { value: number | null; neutral?: boolean }) {
  const tone = neutral ? "neutral" : value === null ? "none" : value >= 70 ? "good" : value >= 50 ? "mid" : "low";
  return (
    <div className="bar">
      <div className="track">
        <div className={`fill ${tone}`} style={{ width: `${value ?? 0}%` }} />
      </div>
      <span>{value === null ? "未练" : `${value}%`}</span>
    </div>
  );
}

export function Stats() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [modules, setModules] = useState<ModuleMastery[] | null>(null);
  const [errors, setErrors] = useState<ErrorBreakdown | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([
      api<Overview>("/stats/overview"),
      api<ModuleMastery[]>("/stats/mastery"),
      api<ErrorBreakdown>("/stats/errors"),
    ])
      .then(([o, m, e]) => {
        setOverview(o);
        setModules(m);
        setErrors(e);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function reload() {
    await api("/bank/reload", { method: "POST" });
    await load();
  }

  if (error) return <p className="error">{error}</p>;
  if (!overview || !modules || !errors) return <p className="muted">加载中…</p>;

  return (
    <section>
      <div className="tiles">
        <div className="tile">
          <b>{overview.questions}</b>题库
        </div>
        <div className="tile">
          <b>{overview.attempts_total}</b>累计作答
        </div>
        <div className="tile">
          <b>{overview.cards_active}</b>错题本
        </div>
        <div className="tile">
          <b>{overview.cards_graduated}</b>已毕业
        </div>
      </div>

      <h2>
        各模块把握 <span className="muted small">按卷面分值加权；点开看知识点</span>
      </h2>
      <ul className="modules">
        {modules.map((m) => (
          <li key={m.module}>
            <button className="module-row" onClick={() => setOpen(open === m.module ? null : m.module)}>
              <span className="module-name">
                {m.module}
                <span className="muted small"> 约 {m.exam_weight} 分</span>
              </span>
              <Bar value={m.mastery} />
            </button>
            {open === m.module && (
              <ul className="kp-rows">
                {m.kps.map((k) => (
                  <li key={k.id}>
                    <span>
                      {k.name}
                      <span className="muted small">
                        {" "}
                        {k.exam_weight} 分 · 做过 {k.n_attempts} 题
                      </span>
                    </span>
                    <Bar value={k.n_attempts ? k.mastery : null} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <h2>
        近 {errors.days} 天失分 <span className="muted small">共 {errors.lost_points} 分</span>
      </h2>
      {errors.items.length === 0 ? (
        <p className="empty">还没有失分记录。</p>
      ) : (
        <ul className="modules">
          {errors.items.map((e) => (
            <li key={e.error_type} className="kp-rows-item">
              <span>
                {e.label}
                <span className="muted small">
                  {" "}
                  {e.count} 题 · {e.lost_points} 分
                </span>
              </span>
              <Bar value={e.share} neutral />
            </li>
          ))}
        </ul>
      )}

      <h2>题库</h2>
      <p className="muted small">修改了 data/questions 里的 YAML 后，点这里重新加载，不用重启。</p>
      <button className="ghost" onClick={reload}>
        重新加载题库
      </button>
      {overview.bank_errors.length > 0 && (
        <ul className="bank-errors">
          {overview.bank_errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
