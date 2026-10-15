import { useEffect, useMemo, useState } from "react";
import { aiStatus } from "../ai";
import { api } from "../api";
import { MathText } from "../components/MathText";
import { PhotoCropper } from "../components/PhotoCropper";
import { TYPE_LABELS, type AiStatus, type AnswerKind, type Kp, type OcrDraft, type QType } from "../types";

const LETTERS = ["A", "B", "C", "D"];
const DIFFICULTIES = ["基础", "中档", "较难", "压轴"];
const KINDS: { value: AnswerKind; label: string }[] = [
  { value: "expr", label: "一个值" },
  { value: "set", label: "多个值" },
  { value: "interval", label: "区间" },
  { value: "equation", label: "方程" },
];

interface Part {
  label: string;
  points: number;
  answer: string;
}

export function AddQuestion({ onCreated }: { onCreated: (id: string) => void }) {
  const [kps, setKps] = useState<Kp[]>([]);
  const [type, setType] = useState<QType>("single");
  const [source, setSource] = useState("");
  const [stem, setStem] = useState("");
  const [chosenKps, setChosenKps] = useState<string[]>([]);
  const [kpQuery, setKpQuery] = useState("");
  const [difficulty, setDifficulty] = useState("中档");
  const [options, setOptions] = useState<Record<string, string>>({ A: "", B: "", C: "", D: "" });
  const [single, setSingle] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const [fill, setFill] = useState("");
  const [kind, setKind] = useState<AnswerKind>("expr");
  const [loose, setLoose] = useState(false);
  const [parts, setParts] = useState<Part[]>([
    { label: "(1)", points: 6, answer: "" },
    { label: "(2)", points: 7, answer: "" },
  ]);
  const [hints, setHints] = useState("");
  const [solution, setSolution] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [aiBusy, setAiBusy] = useState("");
  const [figure, setFigure] = useState<{ name: string; url: string } | null>(null);
  const [ocrNote, setOcrNote] = useState("");

  useEffect(() => {
    api<Kp[]>("/kps")
      .then(setKps)
      .catch((e) => setError(e.message));
    aiStatus(true).then(setAi);
  }, []);

  async function suggestKps(text: string) {
    if (!ai?.text || !text.trim()) return;
    setAiBusy("kps");
    try {
      const r = await api<{ kps: string[] }>("/ai/suggest-kps", { body: { stem: text } });
      setChosenKps((old) => [...new Set([...old, ...r.kps])]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy("");
    }
  }

  async function ocr(dataUrl: string) {
    setAiBusy("ocr");
    setError("");
    try {
      const d = await api<OcrDraft>("/ai/ocr", { body: { image: dataUrl } });
      setType(d.type);
      setStem(d.stem);
      setOcrNote(d.note);
      if (d.options) setOptions({ A: "", B: "", C: "", D: "", ...d.options });
      if (d.answer) {
        const ans = Array.isArray(d.answer) ? d.answer : String(d.answer);
        if (d.type === "single") setSingle(String(ans).trim().toUpperCase().slice(0, 1));
        else if (d.type === "multi") setMulti([...(Array.isArray(ans) ? ans.join("") : ans).toUpperCase()].filter((c) => "ABCD".includes(c)));
        else if (d.type === "fill") setFill(String(ans));
      }
      if (d.type === "solve" && d.parts?.length) {
        setParts(d.parts.map((label) => ({ label, points: Math.round(13 / d.parts!.length), answer: "" })));
      }
      setAiBusy("");
      await suggestKps(d.stem);
    } catch (e) {
      setError((e as Error).message);
      setAiBusy("");
    }
  }

  async function uploadFigure(dataUrl: string) {
    setAiBusy("figure");
    try {
      setFigure(await api<{ name: string; url: string }>("/figures", { body: { image: dataUrl } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy("");
    }
  }

  const kpById = useMemo(() => Object.fromEntries(kps.map((k) => [k.id, k])), [kps]);
  const matches = kpQuery.trim()
    ? kps.filter((k) => !chosenKps.includes(k.id) && (k.name + k.module + k.id).includes(kpQuery.trim())).slice(0, 8)
    : [];

  async function submit() {
    setError("");
    const body: Record<string, unknown> = {
      type,
      stem,
      kps: chosenKps,
      source,
      difficulty_label: difficulty,
      figure: figure?.name,
      hints: hints
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean),
      solution,
    };
    if (type === "single" || type === "multi") {
      body.options = Object.fromEntries(Object.entries(options).filter(([, v]) => v.trim()));
      body.answer = type === "single" ? single : multi;
    } else if (type === "fill") {
      body.answer = fill;
      body.answer_kind = kind;
      if (kind === "interval") body.loose_endpoints = loose;
    } else {
      body.parts = parts;
    }
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/questions", { body });
      onCreated(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form">
      <p className="muted small">
        公式用 $...$ 包起来（如 $\frac{"{1}{2}"}$）。保存后会在 data/questions/inbox/ 生成一个 YAML 文件，之后也可以直接改文件。
      </p>

      <PhotoCropper canOcr={!!ai?.vision} busy={aiBusy} onOcr={ocr} onFigure={uploadFigure} />
      {ocrNote && <p className="notice">{ocrNote}</p>}

      <div className="chips">
        {(Object.keys(TYPE_LABELS) as QType[]).map((t) => (
          <button key={t} className={`chip ${type === t ? "on" : ""}`} onClick={() => setType(t)}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <label>
        来源
        <input value={source} placeholder="如：2026 某市一模 第 7 题" onChange={(e) => setSource(e.target.value)} />
      </label>

      <label>
        题干
        <textarea rows={5} value={stem} onChange={(e) => setStem(e.target.value)} />
      </label>
      {stem.trim() && <MathText text={stem} className="math-text preview-box" />}
      {figure && (
        <div className="figure-row">
          <img className="figure" src={figure.url} alt="题目配图" />
          <button className="ghost" onClick={() => setFigure(null)}>
            去掉配图
          </button>
        </div>
      )}

      {(type === "single" || type === "multi") && (
        <fieldset>
          <legend>选项与答案（点字母标记正确答案）</legend>
          {LETTERS.map((l) => {
            const on = type === "single" ? single === l : multi.includes(l);
            return (
              <div key={l} className="option-row">
                <button
                  className={`letter-btn ${on ? "on" : ""}`}
                  onClick={() =>
                    type === "single" ? setSingle(l) : setMulti(on ? multi.filter((m) => m !== l) : [...multi, l].sort())
                  }
                >
                  {l}
                </button>
                <input value={options[l]} onChange={(e) => setOptions({ ...options, [l]: e.target.value })} />
              </div>
            );
          })}
        </fieldset>
      )}

      {type === "fill" && (
        <fieldset>
          <legend>答案</legend>
          <div className="chips">
            {KINDS.map((k) => (
              <button key={k.value} className={`chip ${kind === k.value ? "on" : ""}`} onClick={() => setKind(k.value)}>
                {k.label}
              </button>
            ))}
          </div>
          <input value={fill} placeholder="如 \frac{1}{2}、-1, \sqrt{2}、(2,+\infty)" onChange={(e) => setFill(e.target.value)} />
          {kind === "interval" && (
            <label className="check">
              <input type="checkbox" checked={loose} onChange={(e) => setLoose(e.target.checked)} />
              端点开闭都算对（单调区间常用）
            </label>
          )}
        </fieldset>
      )}

      {type === "solve" && (
        <fieldset>
          <legend>各问分值与答案</legend>
          {parts.map((p, i) => (
            <div key={i} className="option-row">
              <input
                className="narrow"
                value={p.label}
                onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                className="narrow"
                type="number"
                min={1}
                value={p.points}
                onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))}
              />
              <input
                placeholder="这一问的答案（可选）"
                value={p.answer}
                onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
              />
            </div>
          ))}
          <div className="buttons">
            <button
              className="ghost"
              onClick={() => setParts([...parts, { label: `(${parts.length + 1})`, points: 5, answer: "" }])}
            >
              加一问
            </button>
            {parts.length > 1 && (
              <button className="ghost" onClick={() => setParts(parts.slice(0, -1))}>
                删最后一问
              </button>
            )}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>知识点</legend>
        {ai?.text && (
          <button className="ghost small-btn" disabled={!stem.trim() || !!aiBusy} onClick={() => suggestKps(stem)}>
            {aiBusy === "kps" ? "AI 推荐中…" : "AI 推荐知识点"}
          </button>
        )}
        <div className="chips">
          {chosenKps.map((id) => (
            <button key={id} className="chip on" onClick={() => setChosenKps(chosenKps.filter((k) => k !== id))}>
              {kpById[id]?.name ?? id} ×
            </button>
          ))}
        </div>
        <input placeholder="搜索知识点，如 离心率、导数" value={kpQuery} onChange={(e) => setKpQuery(e.target.value)} />
        {matches.length > 0 && (
          <ul className="kp-picker">
            {matches.map((k) => (
              <li key={k.id}>
                <button
                  onClick={() => {
                    setChosenKps([...chosenKps, k.id]);
                    setKpQuery("");
                  }}
                >
                  {k.name} <span className="muted small">{k.module}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <label>
        难度
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          {DIFFICULTIES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>

      <label>
        分级提示（每行一级，可不填）
        <textarea rows={3} value={hints} onChange={(e) => setHints(e.target.value)} />
      </label>

      <label>
        解答{type === "solve" && "（必填，自评时要对照）"}
        <textarea rows={6} value={solution} onChange={(e) => setSolution(e.target.value)} />
      </label>
      {solution.trim() && <MathText text={solution} className="math-text preview-box" />}

      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy} onClick={submit}>
        保存
      </button>
    </section>
  );
}
