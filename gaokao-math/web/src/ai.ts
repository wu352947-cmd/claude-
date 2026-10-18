import { api } from "./api";
import type { AiStatus } from "./types";

const OFF: AiStatus = { text: false, vision: false, used_today: 0, daily_limit: 0 };
let cached: Promise<AiStatus> | null = null;

/** 没配置大模型、或离线时，AI 按钮都不显示。 */
export function aiStatus(refresh = false): Promise<AiStatus> {
  if (!cached || refresh) cached = api<AiStatus>("/ai/status").catch(() => OFF);
  return cached;
}

export const AI_NOTE = "AI 生成，仅供参考";
