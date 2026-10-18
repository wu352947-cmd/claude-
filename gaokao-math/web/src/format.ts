export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDue(iso: string | null): string {
  if (!iso) return "—";
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(due);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const date = `${due.getMonth() + 1}月${due.getDate()}日`;
  if (diff <= 0) return `今天（${date}）`;
  if (diff === 1) return `明天（${date}）`;
  return `${diff} 天后（${date}）`;
}
