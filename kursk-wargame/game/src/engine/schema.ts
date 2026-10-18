import { z } from 'zod';

/** 中英双语文本（地名、单位名等以后会加上俄文、德文）。 */
export const LocalizedText = z.object({
  zh: z.string().min(1),
  en: z.string().min(1),
});

/** data/game.json：游戏基本信息。 */
export const GameMeta = z.object({
  title: LocalizedText,
  subtitle: LocalizedText,
  dataVersion: z.number().int().positive(),
});
export type GameMeta = z.infer<typeof GameMeta>;
