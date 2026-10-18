import { useState } from "react";
import { api } from "../api";
import type { QuestionDetail } from "../types";

const REASONS = ["题干或选项有乱码", "答案不对", "缺图或图不对", "知识点标错了", "其他"];

/** 题库里的真题是 OCR 识别的，难免有错：标记后不再推送、不进模考，改好 YAML 后取消标记。 */
export function FlagControl({ q }: { q: QuestionDetail }) {
  const [flag, setFlag] = useState(q.flag);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [error, setError] = useState("");

  async function save(on: boolean) {
    setError("");
    try {
      const path = `/questions/${encodeURIComponent(q.id)}/flag`;
      if (on) {
        await api(path, { body: { reason } });
        setFlag({ reason, created_at: new Date().toISOString() });
      } else {
        await api(path, { method: "DELETE" });
        setFlag(null);
      }
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (flag) {
    return (
      <p className="flag-note small">
        已标记有问题（{flag.reason || "未注明"}）：不会再推送、也不进模考。题目文件：
        <code>{q.file}</code>，改好后{" "}
        <button className="link" onClick={() => save(false)}>
          取消标记
        </button>
        {error && <span className="error"> {error}</span>}
      </p>
    );
  }
  if (!open) {
    return (
      <p className="flag-note small">
        <button className="link" onClick={() => setOpen(true)}>
          这道题有问题？
        </button>
      </p>
    );
  }
  return (
    <div className="flag-form">
      <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="问题类型">
        {REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <button className="ghost" onClick={() => save(true)}>
        标记，以后不再推送
      </button>
      <button className="link" onClick={() => setOpen(false)}>
        算了
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
