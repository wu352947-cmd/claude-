import { useState } from "react";
import type { TrendPoint } from "../types";

const W = 640;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

/** 每日得分率折线。没做题的日子断开不连线；悬停（或手指按住）显示当天数据。 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / 100) * innerH;

  // 连续有数据的日子连成一段
  const segments: string[] = [];
  let current: string[] = [];
  data.forEach((d, i) => {
    if (d.score_rate === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else {
      current.push(`${current.length ? "L" : "M"}${x(i).toFixed(1)},${y(d.score_rate).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current.join(" "));

  const point = hover !== null ? data[hover] : null;
  const pick = (clientX: number, box: DOMRect) => {
    const px = ((clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / innerW) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="chart">
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="近 30 天每日得分率"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
              <text className="axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
                {v}%
              </text>
            </g>
          ))}
          {[0, data.length - 1].map((i) => (
            <text key={i} className="axis" x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : "end"}>
              {data[i]?.date.slice(5).replace("-", "/")}
            </text>
          ))}
          {segments.map((d, i) => (
            <path key={i} className="line" d={d} />
          ))}
          {data.map((d, i) =>
            d.score_rate === null ? null : <circle key={i} className="dot" cx={x(i)} cy={y(d.score_rate)} r={4} />,
          )}
          {point && hover !== null && (
            <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />
          )}
        </svg>
        {point && hover !== null && (
          <div className="tooltip" style={{ left: `${Math.min(82, Math.max(18, (x(hover) / W) * 100))}%` }}>
            <strong>{point.date.slice(5).replace("-", "月")}日</strong>
            <br />
            {point.attempts ? `${point.attempts} 题 · 得分率 ${point.score_rate}%` : "没有做题"}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>每日得分率</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.attempts} 题</td>
              <td>{d.score_rate === null ? "—" : `${d.score_rate}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
