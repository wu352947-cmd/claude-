import { TYPE_LABELS, type QuestionSummary } from "../types";
import { MathText } from "./MathText";

interface Props {
  q: QuestionSummary;
  note?: string;
  badge?: string;
  extra?: React.ReactNode;
  onClick: () => void;
}

export function QuestionCard({ q, note, badge, extra, onClick }: Props) {
  return (
    <li>
      <button className="card" onClick={onClick}>
        <div className="tags">
          {badge && <span className="tag strong">{badge}</span>}
          <span className="tag">{TYPE_LABELS[q.type]}</span>
          <span className="tag">{q.difficulty_label}</span>
          {q.kps.slice(0, 3).map((k) => (
            <span key={k.id} className="tag kp">
              {k.name}
            </span>
          ))}
        </div>
        <MathText text={q.preview} className="math-text preview" />
        {note && <p className="reason">{note}</p>}
        {extra}
      </button>
    </li>
  );
}
