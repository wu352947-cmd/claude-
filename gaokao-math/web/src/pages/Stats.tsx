import { useEffect, useState } from "react";
import { api } from "../api";
import { TrendChart } from "../components/TrendChart";
import type { ErrorBreakdown, ModuleMastery, MultiAnalysis, Overview, Prediction, TrendPoint } from "../types";

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
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [multi, setMulti] = useState<MultiAnalysis | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([
      api<Overview>("/stats/overview"),
      api<ModuleMastery[]>("/stats/mastery"),
      api<ErrorBreakdown>("/stats/errors"),
      api<Prediction>("/stats/prediction"),
      api<TrendPoint[]>("/stats/trend"),
      api<MultiAnalysis>("/stats/multi"),
    ])
      .then(([o, m, e, p, t, mu]) => {
        setOverview(o);
        setModules(m);
        setErrors(e);
        setPrediction(p);
        setTrend(t);
        setMulti(mu);
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
  if (!overview || !modules || !errors || !prediction || !trend || !multi) return <p className="muted">加载中…</p>;

  return (
    <section>
      <div className="hero">
        <p className="muted small">按现在的掌握程度，{prediction.blueprint}预计能考</p>
        <div>
          <span className="hero-number">{Math.round(prediction.total)}</span>
          <span className="muted"> / {prediction.points}</span>
        </div>
        <p className="muted small">
          {prediction.practiced_kps < 15
            ? `只练过 ${prediction.practiced_kps} 个知识点，没练过的按「中档题五五开」估计，多做题后会越来越准。`
            : "每次模考后对照一下：预测和实际差得多，说明自评偏松或偏紧。"}
        </p>
        <div className="type-row">
          {prediction.by_type.map((t) => (
            <span key={t.type}>
              {t.label} <b>{t.expected}</b>/{t.points}
            </span>
          ))}
        </div>
      </div>

      <h2>
        最值得练的知识点 <span className="muted small">每多认真练 1 小时，预计能多拿的分</span>
      </h2>
      <ol className="gains">
        {prediction.gains.map((g) => (
          <li key={g.kp_id}>
            <span>{g.name}</span>
            <b>+{g.gain.toFixed(1)} 分</b>
          </li>
        ))}
      </ol>

      <h2>
        近 30 天得分率 <span className="muted small">按住或悬停看每天的数据</span>
      </h2>
      {trend.some((d) => d.attempts) ? <TrendChart data={trend} /> : <p className="empty">做题后这里会出现趋势。</p>}

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

      <h2>
        多选题 <span className="muted small">近 {multi.days ?? 60} 天 · {multi.count} 道</span>
      </h2>
      {multi.count === 0 ? (
        <p className="empty">还没有做过多选题。</p>
      ) : (
        <>
          <div className="tiles three">
            <div className="tile">
              <b>{multi.full}</b>全对
            </div>
            <div className="tile">
              <b>{multi.missed.lost}</b>漏选丢分
            </div>
            <div className="tile">
              <b>{multi.wrong.lost}</b>错选丢分
            </div>
          </div>
          <p>{multi.advice}</p>
        </>
      )}

      {prediction.exams.length > 0 && (
        <>
          <h2>模考成绩</h2>
          <table className="table">
            <thead>
              <tr>
                <th>模考</th>
                <th>实际</th>
                <th>考前预测</th>
                <th>差</th>
              </tr>
            </thead>
            <tbody>
              {prediction.exams.map((e) => (
                <tr key={e.id}>
                  <td>{e.title}</td>
                  <td>{e.score}</td>
                  <td>{e.predicted ?? "—"}</td>
                  <td>{e.predicted === null ? "—" : `${e.score - e.predicted > 0 ? "+" : ""}${(e.score - e.predicted).toFixed(1)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
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
