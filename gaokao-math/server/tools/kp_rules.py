"""按关键词给真题标知识点。

规则只看题干（含选项）和解析里的关键词，给每个知识点打分，取最高分的 1–3 个。
这只是导入时的初步标注：可以在题目 YAML 里手动改，配置了大模型后也可以用 AI 重新标注。
"""

from __future__ import annotations

import re

# (知识点, 正则, 权重)。正则在去掉空格后的文本上匹配。
RULES: list[tuple[str, str, float]] = [
    # 集合与常用逻辑用语
    ("set.operations", r"集合|补集|\\complement|子集|[A-Z](\\cap|\\cup|∩|∪)\(?[A-Z]|C_\{?[UR]\}?[A-Z(]", 2),
    ("logic.condition", r"充分|必要条件|充要", 4),
    ("logic.quantifier", r"\\forall|\\exists|∀|∃|全称|存在量词|命题.{0,6}否定|的否定是|\\neg|\\wedge|\\vee|真命题|假命题", 2.5),
    # 复数
    ("complex.arith", r"复数|虚数|虚部|实部", 2),
    ("complex.arith", r"(?<![A-Za-z\\])\d*i(?![A-Za-z])|\}i(?![A-Za-z])", 1),
    ("complex.modulus", r"\|z\||\\bar\{z\}|\\overline\{z\}|共轭|\|[^|]{0,20}i\|", 2),
    ("complex.geometry", r"复平面|(复数|z).{0,30}对应的点", 2),
    # 不等式
    ("ineq.properties", r"若[a-z]>[a-z](>0)?(,|，|\$|则)|[a-z]>[a-z]>0|[a-z]<[a-z]<0|下列不等式|不等式.{0,4}(一定)?成立", 2),
    ("ineq.quadratic", r"不等式.{0,40}x\^\{?2|x\^\{?2.{0,30}[<>≤≥]|\\le.{0,4}0的解集|解集", 1.5),
    ("ineq.mean", r"\\frac\{\d*\}\{x\}.{0,30}最小值|基本不等式|最小值.{0,10}(正数|a>0,b>0)|(正数|a>0,b>0|x>0,y>0).{0,40}最(小|大)值|\\frac\{1\}\{a\}\+\\frac\{\d?\}\{b\}|ab的最大值", 3),
    # 函数概念与性质
    ("func.domain_range", r"定义域|值域", 2.5),
    ("func.monotonic", r"单调|增函数|减函数|递增|递减", 1.2),
    ("func.parity", r"奇函数|偶函数|奇偶", 3),
    ("func.symmetry", r"周期|对称轴|对称中心|关于直线.{0,10}对称|关于点.{0,12}对称|f\(x\+\d\)=f\(|f\(\d-x\)|f\(-x\)=|图象关于", 2),
    ("func.abstract", r"f\(x\+y\)|f\(xy\)|f\(x\)\+f\(y\)|f\(x_\{?1\}?\)-f\(x_\{?2\}?\)|定义在.{0,4}R上的函数.{0,20}满足", 2.5),
    ("func.piecewise", r"(f\(x\)|y|g\(x\))=\\\{\\begin\{(array|cases)\}|(f\(x\)|y|g\(x\))=\\begin\{cases\}|分段", 2.5),
    ("func.graph", r"图象大致|图像大致|大致图象|大致图像|函数的图象", 3),
    # 指对幂
    ("expo.ops", r"\\log|\\lg|\\ln|对数|\\sqrt\[\d\]|根式|有理数指数", 1),
    ("expo.functions", r"指数函数|对数函数|幂函数|\\log_\{?a|a\^\{?x", 2),
    ("expo.compare", r"(a|b|c)=.{0,40},(b|c)=.{0,40},c=.{0,40}(则|大小)|大小关系|[abc][<>][abc][<>][abc]", 3),
    ("func.zeros", r"零点|实根|根的个数|有.{0,3}个(不同的)?(实数)?(根|解)|交点.{0,4}个数|交点的个数", 3),
    # 三角函数与解三角形
    ("trig.definition", r"终边|\\tan\\alpha=|\\sin\\alpha=|\\cos\\alpha=|\\tan\\theta=|\\sin\\theta=|\\cos\\theta=|同角", 1.5),
    ("trig.identities", r"\\sin2|\\cos2|\\tan2|\\sin\(\\alpha[+-]|\\cos\(\\alpha[+-]|\\tan\(\\alpha[+-]|\\sin\\left\(\\alpha|\\cos\\left\(\\alpha|\\tan\\left\(\\alpha|\\sin\^\{?2|\\cos\^\{?2|二倍角|和角|差角|\\sin\\left\(\\theta|\\cos\\left\(\\theta|\\tan\\left\(\\theta", 2),
    ("trig.graph", r"最小正周期|\\omega|ω|\\sin\(\d?x|\\cos\(\d?x|\\sin\\left\(\d?\\?omega?x|\\cos\\left\(\d?\\?omega?x|\\sin\\left\(\d*x|\\cos\\left\(\d*x|\\sinx|\\cosx|y=\\sin|y=\\cos|y=\\tan|f\(x\)=\\sin|f\(x\)=\\cos|f\(x\)=\d*\\sin|f\(x\)=\d*\\cos", 2),
    ("trig.transform", r"平移|伸长|缩短|横坐标.{0,4}(变为|缩|伸)", 3),
    ("tri.laws", r"正弦定理|余弦定理|对边|内角|所对的边", 2.5),
    ("tri.laws", r"\\triangle|△|三角形", 1.2),
    ("tri.range", r"(\\triangle|△|三角形).{0,200}(面积的最大值|周长的最大值|取值范围|最大值|最小值)", 2),
    # 平面向量
    ("vec.linear", r"\\overrightarrow|\\vec|向量", 1),
    ("vec.linear", r"共线|\\lambda\\overrightarrow|\\lambda\\vec|=\\lambda|x\\overrightarrow|基底|中点.{0,20}\\overrightarrow", 1),
    ("vec.dot", r"(\\overrightarrow|\\vec|向量).{0,80}(\\cdot|数量积|\\perp|⊥|垂直)|(\\cdot|\\perp).{0,40}(\\overrightarrow|\\vec)|\|\\vec\{?[ab]\}?[+-]|\|\\overrightarrow\{?[a-zA-Z]+\}?[+-]", 2),
    ("vec.projection", r"投影|(\\overrightarrow|\\vec|向量).{0,80}夹角", 2.5),
    # 数列
    ("seq.arith", r"等差", 3),
    ("seq.geom", r"等比", 3),
    ("seq.recurrence", r"a_\{n\+1\}|a_\{n\+2\}|S_\{n\}=|S_n=|递推|a_\{n\}=.{0,20}a_\{n-1\}|a_\{n\+1\}=", 2),
    ("seq.sum_telescoping", r"\\frac\{1\}\{a_\{n\}a_\{n\+1\}\}|\\frac\{1\}\{.{0,10}\(n\+1\)\}|裂项", 2),
    ("seq.sum_dislocation", r"n\\cdot\d\^|n\\cdot\\left|n\d\^\{n|错位相减|\(2n-1\)\\cdot|n\\times\d\^", 2),
    # 立体几何
    ("solid.measure", r"体积|表面积|侧面积|棱锥|棱柱|圆锥|圆柱|圆台|几何体", 1.5),
    ("solid.sphere", r"外接球|内切球|球面|球心|球O|球的(表面积|体积|半径|直径)|球体|该球|此球|球与|的球(?![赛队员场])", 3),
    ("solid.position", r"(平面|直线).{0,30}(平行|垂直|\\parallel|\\perp|⊥|//)|异面|线面|面面|\\perp平面|\\parallel平面|//平面|⊥平面", 2),
    ("solid.vector", r"二面角|所成角|所成的角|夹角的(余弦|正弦)|线面角|到平面.{0,20}距离|法向量|\\sin\\theta.{0,8}平面", 3),
    ("solid.section", r"截面|截得|截球", 2.5),
    # 直线与圆
    ("line.equation", r"直线.{0,40}(方程|斜率|倾斜角|平行|垂直)|斜率|倾斜角|点到直线", 1.2),
    ("circle.equation", r"(?<!椭)圆(?![锥柱台周率])[A-Z]?[:：]|(⊙|\\odot)[A-Z]?[:：]|x\^\{?2\}?\+y\^\{?2\}?[+-=]|圆心|圆的方程", 1.5),
    ("circle.line", r"(直线.{0,60}(?<!椭)圆(?![锥柱台周率])|(?<!椭)圆(?![锥柱台周率]).{0,60}直线)|切线.{0,20}(?<!椭)圆(?![锥柱台周率])|(?<!椭)圆(?![锥柱台周率]).{0,30}切线|相切|弦长|(⊙|\\odot)[A-Z].{0,60}(⊙|\\odot)[A-Z]", 1.5),
    # 圆锥曲线
    ("conic.ellipse", r"椭圆", 3),
    ("conic.hyperbola", r"双曲线|渐近线", 3),
    ("conic.parabola", r"抛物线|y\^\{?2\}?=\d*px|y\^\{?2\}?=\d+x|x\^\{?2\}?=\d+y|准线", 3),
    ("conic.eccentricity", r"离心率", 4),
    ("conic.chord", r"(椭圆|双曲线|抛物线|曲线C).{0,120}(交于|相交|弦|\|AB\||中点)|韦达|根与系数", 2),
    ("conic.fixed", r"(椭圆|双曲线|抛物线|曲线C).{0,400}(定点|定值|过定点|最大值|最小值|取值范围|面积的最)", 1.8),
    # 计数原理与概率统计
    ("count.perm_comb", r"排列|组合数|安排|种不同|不同的.{0,6}(方法|方案|排法|选法|站法|种数)|多少种|共有.{0,10}种|A_\{\d\}\^|C_\{\d\}\^|\\mathrm\{C\}_|\\mathrm\{A\}_", 2),
    ("count.binomial", r"展开式|二项式|\(.{1,20}\)\^\{?\d\}?的展开|常数项|\^\{?[5-9n]\}?.{0,8}展开", 3),
    ("prob.classical", r"概率|随机|任取|抽取|骰子|摸球|等可能", 1.2),
    ("prob.classical", r"事件|互斥|对立|相互独立", 2.5),
    ("prob.conditional", r"条件概率|P\(.\|.\)|已知.{0,20}的条件下|全概率", 3),
    ("prob.distribution", r"分布列|数学期望|期望|E\(X\)|E\(\\xi\)|EX|DX|D\(X\)|方差.{0,6}(X|\\xi)|随机变量", 2.5),
    ("prob.binomial_normal", r"二项分布|(\\sim|~|～)[BN]\(|服从.{0,6}[BN]\(|正态", 3),
    ("stat.sample", r"柱形图|折线图|饼图|雷达图|统计图|条形图|平均|中位数|众数|方差|标准差|极差|百分位|样本|抽样|频率分布|直方图|频数|样本数据|分层", 1.5),
    ("stat.regression", r"回归|相关系数|独立性检验|K\^\{?2|\\chi\^\{?2|列联表|2\\times2|残差", 3),
    # 导数
    ("deriv.basic", r"f\^\{?\\prime|f'\(|y'|导数|导函数", 1),
    ("deriv.tangent", r"(曲线|函数|f\(x\)|y=|图象|图像).{0,60}切线|处的切线|公切线", 2.5),
    ("deriv.monotonic", r"(单调|递增|递减|增函数|减函数).{0,100}(e\^|\\ln|\\mathrm\{e\}|导|x\^\{?3)|(e\^|\\ln|\\mathrm\{e\}\^|x\^\{?3).{0,100}(单调|递增|递减)|讨论f\(x\)的单调性", 2),
    ("deriv.extremum", r"极值|极大值|极小值|极值点|(f\(x\)|函数).{0,60}(最大值|最小值|最值)", 2),
    ("deriv.always_true", r"f\(x\)(\\geqslant|\\geq|≥|\\leqslant|\\leq|≤)0|恒成立|恒有|\\geqslant0恒|对任意.{0,20}x.{0,40}(≥|≤|\\geq|\\leq|\\geqslant|\\leqslant|>|<)|取值范围.{0,4}$", 1.5),
    ("deriv.zeros", r"(e\^|\\ln|\\mathrm\{e\}\^).{0,150}(零点|实根|交点)|(零点|实根).{0,150}(e\^|\\ln|\\mathrm\{e\}\^)", 1.5),
    ("deriv.construct", r"证明.{0,30}(f\(x\)|\\ln|e\^|\\mathrm\{e\}\^|不等式)|(e\^|\\ln).{0,60}(大小关系|a<b<c|c<b<a|b<a<c)", 1.5),
    ("tri.laws", r"三角高程|仰角|俯角|方位角", 1.5),
    ("solid.position", r"正方体|长方体", 1),
    ("seq.recurrence", r"数列", 0.5),
    ("seq.sum_dislocation", r"b_\{n\}=na_\{n\}|b_\{n\}=n\\cdota_|\\frac\{n\}\{\d\^\{?n|\\frac\{a_\{n\}\}\{\d\^\{?n", 2),
    ("count.perm_comb", r"分配方案|分成.{0,10}(组|小组)|分组", 2),
    ("prob.conditional", r"已知.{0,40}(则|，)其.{0,20}概率|在.{0,30}的条件下|P\([A-Z]\|[A-Z]\)", 3),
    ("func.abstract", r"定义域(均)?为R.{0,60}(满足|且)f\(|f\(x\)\+g\(\d-x\)|f\(x\)>f\(x-1\)\+f\(x-2\)", 2.5),
    # 新定义
    ("novel.definition", r"甲说|乙说|丙说|甲:|乙:|丙:|预测|新定义|定义(?!域|在|为R)|则称|叫做|称为.{0,8}数列|称.{0,10}为.{0,10}(数列|函数|点|集)", 1.5),
]

COMPILED = [(k, re.compile(p), w) for k, p, w in RULES]

# 同时出现时，后者是前者更具体的情形：只保留更具体的
SUBSUMES = {
    "conic.eccentricity": ["conic.ellipse", "conic.hyperbola"],
    "deriv.tangent": ["deriv.basic"],
    "deriv.extremum": ["deriv.basic"],
    "deriv.monotonic": ["deriv.basic", "func.monotonic"],
    "deriv.always_true": ["deriv.basic"],
    "deriv.zeros": ["deriv.basic", "func.zeros"],
    "solid.vector": ["solid.position"],
    "solid.sphere": ["solid.measure"],
    "complex.modulus": ["complex.arith"],
    "complex.geometry": ["complex.arith"],
    "prob.conditional": ["prob.classical"],
    "prob.binomial_normal": ["prob.distribution"],
    "tri.range": ["tri.laws"],
    "seq.sum_telescoping": ["seq.recurrence"],
    "seq.sum_dislocation": ["seq.recurrence"],
    "circle.line": ["circle.equation", "line.equation"],
    "conic.chord": ["line.equation"],
}

# 有这些更具体的知识点时，宽泛的规则不算
GENERIC = {"vec.linear", "deriv.basic", "expo.ops", "func.monotonic", "line.equation",
           "solid.measure", "stat.sample", "ineq.quadratic", "deriv.always_true", "set.operations"}


# 有些知识点的关键词容易误伤，要求全文同时出现相应的「语境」
CONTEXT = {
    "solid.": r"平面|棱|锥|柱|圆台|棱台|正方体|长方体|球|几何体|异面|四面体",
    "complex.": r"复|虚|\\mathrm\{i\}|\di(?![A-Za-z_^{])|\}i(?![A-Za-z_^{])|[+-]i(?![A-Za-z_^{])|^i\(|=i",
    "vec.": r"向量|\\vec|\\overrightarrow",
    "conic.chord": r"椭圆|双曲线|抛物线|曲线|轨迹",
    "conic.fixed": r"椭圆|双曲线|抛物线|曲线|轨迹",
    "circle.": r"(?<!椭)圆(?![锥柱台周率])|⊙|\\odot",
    "logic.quantifier": r"命题|\\forall|\\exists|∀|∃|量词|否定",
    "set.operations": r"集合|补集|子集|\\complement|C_\{?[UR]|[A-Z]=\\\{|[A-Z]\\(cap|cup)",
    "expo.compare": r"\\log|\\ln|\\lg|\^|\\sqrt|\\sin|\\cos|\\tan|e",
    "seq.": r"数列|a_\{?n|S_\{?n",
    "trig.": r"\\sin|\\cos|\\tan|三角|角",
}


def squash(text: str) -> str:
    s = re.sub(r"\\(mathrm|mathbf|text|boldsymbol)\{([^{}]*)\}", r"\2", text)
    s = re.sub(r"\\(left|right)(?![a-z])|\\[,;!]|~", "", s)
    return re.sub(r"[\s$]+", "", s)


def score_text(text: str) -> dict[str, float]:
    s = squash(text)
    out: dict[str, float] = {}
    for kp, rx, w in COMPILED:
        n = len(rx.findall(s))
        if n:
            out[kp] = out.get(kp, 0.0) + w * min(n, 3) ** 0.5
    return out


# 这些规则只看题干：解析里出现「必要性」「定义域」之类的词很常见，不代表考这个
STEM_ONLY = {"logic.condition", "novel.definition", "func.piecewise", "logic.quantifier"}

# 解答题里，函数题的各问基本都是导数题
SOLVE_DERIV = [
    ("deriv.monotonic", r"单调"),
    ("deriv.extremum", r"极值|极大值|极小值|最大值|最小值|最值"),
    ("deriv.zeros", r"零点|实根|交点个数"),
    ("deriv.always_true", r"(≥|≤|\\geq|\\leq|>|<).{0,30}取值范围|恒成立|取值范围.{0,4}$"),
    ("deriv.construct", r"证明"),
]


def tag(stem: str, analysis: str, qtype: str) -> dict[str, float]:
    """返回 {知识点: 权重}，权重之和为 1；没有命中任何规则时返回空字典。"""
    scores = score_text(stem)
    for k, v in score_text(analysis).items():
        if k not in STEM_ONLY:
            scores[k] = scores.get(k, 0.0) + 0.3 * v
    flat = squash(stem)
    if qtype == "solve" and re.search(r"(函数|f\(x\)=)", flat) and not re.search(r"\\sin|\\cos|数列|椭圆|双曲线|抛物线", flat):
        for k, rx in SOLVE_DERIV:
            if re.search(rx, flat):
                scores[k] = scores.get(k, 0.0) + 2
    full = squash(stem + analysis)
    for prefix, rx in CONTEXT.items():
        if not re.search(rx, full):
            for k in [k for k in scores if k.startswith(prefix)]:
                del scores[k]
    if not scores:
        return {}
    if "事件" in flat:
        scores.pop("set.operations", None)
    if any(k.startswith("conic.") for k in scores) and "tri.laws" in scores:
        scores["tri.laws"] *= 0.4
        scores.pop("tri.range", None)
    # 解答题才考的知识点，选择填空里出现关键词也不太可能是主考点
    if qtype != "solve":
        for k in ("conic.fixed", "deriv.construct"):
            if k in scores:
                scores[k] *= 0.5
    else:
        for k in ("prob.classical",):
            if "prob.distribution" in scores and k in scores:
                scores[k] *= 0.4
    for specific, generals in SUBSUMES.items():
        if scores.get(specific, 0) >= 1.5:
            for g in generals:
                if g in scores:
                    scores[g] *= 0.35
    top = max(scores.values())
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    picked = [(k, v) for k, v in ranked if v >= 0.55 * top][:3]
    if len(picked) > 1:
        specific = [(k, v) for k, v in picked if k not in GENERIC]
        if specific:
            picked = specific
    total = sum(v for _, v in picked)
    return {k: round(v / total, 2) for k, v in picked}
