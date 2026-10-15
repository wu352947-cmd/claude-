export type QType = "single" | "multi" | "fill" | "solve";
export type AnswerKind = "expr" | "set" | "interval" | "equation";
export type Confidence = "sure" | "unsure" | "guess";
export type ErrorType = "concept" | "method" | "calc" | "reading" | "time" | "guess";

export interface KpRef {
  id: string;
  name: string;
  module: string;
}

export interface QuestionSummary {
  id: string;
  is_variant?: boolean;
  type: QType;
  source: string;
  year: number | null;
  difficulty_label: string;
  points: number;
  preview: string;
  kps: KpRef[];
}

export interface BankItem extends QuestionSummary {
  attempts: number;
  in_review: boolean;
  variants: number;
  flagged: boolean;
}

export interface QuestionDetail extends QuestionSummary {
  stem: string;
  options: Record<string, string> | null;
  answer_kind: AnswerKind | null;
  parts: { label: string; points: number }[];
  hints_total: number;
  est_seconds: number;
  figure: string | null;
  parent_id: string | null;
  history: { created_at: string; score: number; max_score: number; seconds: number; error_type: ErrorType | null }[];
  card: { due: string; reps: number; lapses: number; graduated: boolean } | null;
  file: string;
  flag: { reason: string; created_at: string } | null;
}

export interface SolvePart {
  label: string;
  points: number;
  answer: string;
  rubric: string[];
}

export interface Reveal {
  answer: string | string[] | null;
  answer_kind: AnswerKind | null;
  solution: string;
  parts: SolvePart[];
}

export interface AttemptResult {
  attempt_id: number;
  queued?: boolean; // 离线保存，联网后再判分
  score: number;
  max_score: number;
  full: boolean;
  perf: number;
  reveal: Reveal;
  review: { due: string | null; rating: string; graduated: boolean; created: boolean } | null;
  mastery: { kp_id: string; name: string; before: number; after: number }[];
}

export interface PlanItem {
  question_id: string;
  kind: "review" | "new" | "explore";
  reason: string;
  question: QuestionSummary;
}

export interface TodayPlan {
  items: PlanItem[];
  due_total: number;
  unseen_total: number;
}

export interface ReviewItem extends QuestionSummary {
  due: string;
  is_due: boolean;
  reps: number;
  lapses: number;
  graduated: boolean;
  last_error_label: string | null;
}

export interface Overview {
  questions: number;
  attempts_total: number;
  attempts_today: number;
  attempts_7d: number;
  score_rate_7d: number | null;
  cards_active: number;
  cards_due: number;
  cards_graduated: number;
  streak_days: number;
  bank_errors: string[];
  blueprint: string;
}

export interface ModuleMastery {
  module: string;
  exam_weight: number;
  mastery: number | null;
  practiced: number;
  kps: { id: string; name: string; exam_weight: number; mastery: number; n_attempts: number }[];
}

export interface ErrorBreakdown {
  days: number;
  lost_points: number;
  items: { error_type: string; label: string; count: number; lost_points: number; share: number }[];
}

export interface Kp {
  id: string;
  name: string;
  module: string;
  exam_weight: number;
}

export const TYPE_LABELS: Record<QType, string> = {
  single: "单选",
  multi: "多选",
  fill: "填空",
  solve: "解答",
};

export const ERROR_TYPES: { value: ErrorType; label: string }[] = [
  { value: "concept", label: "概念不清" },
  { value: "method", label: "方法没想到" },
  { value: "calc", label: "计算失误" },
  { value: "reading", label: "审题错误" },
  { value: "time", label: "时间不够" },
  { value: "guess", label: "不会，蒙的" },
];

export interface AiStatus {
  text: boolean;
  vision: boolean;
  used_today: number;
  daily_limit: number;
}

export interface Prediction {
  total: number;
  points: number;
  blueprint: string;
  practiced_kps: number;
  by_type: { type: QType; label: string; expected: number; points: number }[];
  slots: { no: number; type: QType; points: number; expected: number; main_kp: string }[];
  gains: { kp_id: string; name: string; gain: number }[];
  exams: { id: number; title: string; date: string; score: number; predicted: number | null }[];
}

export interface TrendPoint {
  date: string;
  attempts: number;
  score_rate: number | null;
}

export interface MultiAnalysis {
  count: number;
  full: number;
  missed: { count: number; lost: number };
  wrong: { count: number; lost: number };
  blank: { count: number; lost: number };
  advice: string;
  days?: number;
}

export interface ExamBrief {
  id: number;
  title: string;
  status: "ongoing" | "grading" | "done";
  created_at: string;
  minutes: number;
  score: number | null;
  predicted: number | null;
}

export interface ExamSlot {
  no: number;
  type: QType;
  points: number;
  question_id: string | null;
  matched: string;
  matched_label: string;
  question: QuestionDetail | null;
  reveal?: Reveal;
  response?: { response: Record<string, unknown>; seconds: number };
}

export interface ExamReport {
  total: number;
  predicted: number | null;
  by_type: { type: QType; label: string; score: number; points: number; minutes: number }[];
  slots: { no: number; type: QType; points: number; score: number; seconds: number; question_id: string | null; kps: string[] }[];
  multi: MultiAnalysis;
  lost_by_module: { module: string; lost: number }[];
  minutes_used: number;
  available_points: number;
}

export interface ExamDetail extends ExamBrief {
  slots: ExamSlot[];
  report: ExamReport | null;
}

export interface OcrDraft {
  type: QType;
  stem: string;
  options: Record<string, string> | null;
  answer: string | string[] | null;
  parts: string[] | null;
  note: string;
}
