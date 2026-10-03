// 字体工具：fetch-fonts.mjs 与 build-demo.mjs 共用
// ZCOOL XiaoWei 的「回」(U+56DE) 字形轮廓有误，会渲染成实心方块；把它从 unicode-range 里剔除，交给后备字体
export function excludeGlyphs(css, family, cps) {
  return css.replace(/@font-face \{[^}]*\}/g, block => {
    if (!block.includes(`'${family}'`)) return block;
    return block.replace(/unicode-range: ([^;]+);/, (_, r) => {
      const parts = r.split(',').flatMap(p => {
        const [a, b = a] = p.trim().slice(2).split('-').map(x => parseInt(x, 16));
        let segs = [[a, b]];
        for (const cp of cps) segs = segs.flatMap(([x, y]) => cp < x || cp > y ? [[x, y]] : [[x, cp - 1], [cp + 1, y]].filter(([m, n]) => m <= n));
        return segs.map(([x, y]) => 'U+' + x.toString(16) + (y !== x ? '-' + y.toString(16) : ''));
      });
      return `unicode-range: ${parts.join(', ')};`;
    });
  });
}
