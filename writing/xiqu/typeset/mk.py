COLS=r'@{}>{\raggedright\arraybackslash}p{3.2em}>{\raggedright\arraybackslash}p{3.6em}>{\raggedright\arraybackslash}X>{\raggedright\arraybackslash}X>{\centering\arraybackslash}p{2em}>{\raggedright\arraybackslash}X>{\raggedright\arraybackslash}p{4.4em}@{}'
import re
src=open('draft_v3.md').read()
F='/tmp/claude-0/-home-user-claude-/c1a27eb2-c79d-5946-ac3c-9665e56d2a9f/scratchpad/fonts/'
def esc(t):
    t=t.replace('\\','\\textbackslash{}')
    for a,b in [('&','\\&'),('%','\\%'),('#','\\#'),('_','\\_'),('$','\\$'),('~','\\textasciitilde{}'),('^','\\^{}')]:
        t=t.replace(a,b)
    return t
def inline(t):
    # convert 〔N:...〕 nested to footnotes
    out='';pos=0
    while True:
        k=t.find('〔N:',pos)
        if k<0: out+=esc(t[pos:]);break
        out+=esc(t[pos:k]);d=1;j=k+3
        while d:
            d+=(t[j]=='〔')-(t[j]=='〕');j+=1
        out+='\\footnote{'+esc(t[k+3:j-1])+'}';pos=j
    out=re.sub(r'\*\*(.+?)\*\*',r'{\\heiti \1}',out)
    return out
lines=src.split('\n')
title=lines[0][2:]; sub=lines[1][3:]
body=[];i=2
abstract=kw=''
blocks=src.split('\n\n')
tex=[]
for b in blocks[1:] if False else blocks:
    b=b.strip()
    if not b or b.startswith('# ') or b.startswith('## ——') or b=='---': 
        if b.startswith('# ') and '\n## ——' in b: pass
        continue
    if b.startswith('**摘　要：**'): abstract=inline(b.replace('**摘　要：**','').strip()); continue
    if b.startswith('**关键词：**'): kw=inline(b.replace('**关键词：**','').strip()); continue
    if b.startswith('## '):
        h=b[3:]
        if h.startswith('结'): tex.append('\\jiesection{结\\hspace{2em}语}')
        else: tex.append('\\xsection{'+inline(h)+'}')
        continue
    if b.startswith('### '): tex.append('\\xsubsection{'+inline(b[4:])+'}'); continue
    if b.startswith('> '): tex.append('\\begin{yinwen}'+inline(b[2:])+'\\end{yinwen}'); continue
    if b.startswith('**表 1'): tex.append('\\tablecap{'+inline(b.strip('*'))+'}'); continue
    if b.startswith('|'):
        rows=[r for r in b.split('\n') if not r.startswith('| ---')]
        cells=[[inline(c.strip()) for c in r.strip('|').split('|')] for r in rows]
        t='\\begin{center}\\biaofont\\begin{tabularx}{\\textwidth}{'+COLS+'}\n\\toprule\n'+' & '.join('{\\heiti '+c+'}' for c in cells[0])+'\\\\\n\\midrule\n'
        t+='\n'.join(' & '.join(r)+'\\\\' for r in cells[1:])+'\n\\bottomrule\n\\end{tabularx}\\end{center}'
        cap=tex.pop() if tex and tex[-1].startswith('\\tablecap') else ''
        tex.append('\\par\\noindent\\begin{minipage}{\\textwidth}'+cap+t+'\\end{minipage}\\par');continue
    if b.startswith('说明：'): tex.append('\\biaozhu{'+inline(b)+'}'); continue
    tex.append(inline(b)+'\n')
pre=open('pre.tex').read().replace('FONTDIR',F)
doc=pre+r'''
\begin{document}
\thispagestyle{first}
\noindent{\fangsong\zihao{5}·\,专题研究\,·}\par\vspace{6mm}
\huawen
\begin{center}
{\biaoti '''+esc(title.split('：')[0])+r'''}\\[2mm]
{\fubiaoti '''+esc(title.split('：')[1])+r'''}\\[4mm]
{\fubiaoti '''+esc(sub)+r'''}
\end{center}
\huawen\vspace{8mm}
\begin{zhaiyao}{\heiti 摘\hspace{1em}要：}'''+abstract+r'''\par
{\heiti 关键词：}'''+kw.replace('　','\\hspace{1em}')+r'''\end{zhaiyao}
\vspace{6mm}
\par\hspace*{2em}'''+'\n\n'.join(tex)+r'''
\end{document}'''
open('tex/paper.tex','w').write(doc)
