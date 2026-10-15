import katex from "katex";
import { useMemo } from "react";

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;

// 解析里的插图：[[图:<16位十六进制>.png]]，文件放在 data/figures/
const FIGURE = /\[\[图:([0-9a-f]{16}\.(?:png|jpg|webp))\]\]/g;

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>")
    .replace(FIGURE, (_, name) => `<img class="figure solution-figure" src="/api/figures/${name}" alt="解析配图" loading="lazy"/>`);
}

function tex(src: string, displayMode: boolean): string {
  return katex.renderToString(src, { displayMode, throwOnError: false, strict: "ignore" });
}

/** 把「文字 + $行内公式$ + $$独立公式$$」渲染成 HTML。文字部分先转义，KaTeX 输出本身是安全的。 */
export function renderMathText(src: string): string {
  const s = src.trim();
  const out: string[] = [];
  let last = 0;
  for (const m of s.matchAll(MATH)) {
    out.push(escapeText(s.slice(last, m.index)));
    out.push(m[1] !== undefined ? tex(m[1], true) : tex(m[2], false));
    last = m.index + m[0].length;
  }
  out.push(escapeText(s.slice(last)));
  return out.join("");
}

export function MathText({ text, className, inline }: { text: string; className?: string; inline?: boolean }) {
  const html = useMemo(() => renderMathText(text), [text]);
  const Tag = inline ? "span" : "div";
  return <Tag className={className ?? "math-text"} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 学生输入的答案：像 LaTeX 就当公式渲染，否则原样显示。 */
export function AnswerPreview({ value }: { value: string }) {
  const html = useMemo(() => {
    const v = value.trim();
    if (!v) return "";
    return /[\\{}^_]/.test(v) ? tex(v.replace(/^\$|\$$/g, ""), false) : escapeText(v);
  }, [value]);
  return <span className="answer-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
