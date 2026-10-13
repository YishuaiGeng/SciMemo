#!/usr/bin/env python3
"""Compose SciMemo's vector visual system and eight application/specification boards.

Only local artwork and fonts are used. All board lettering is outlined; the
standalone UI icons remain currentColor SVGs. No application code is changed.
"""
from pathlib import Path
from html import escape
import json
import sys
import re
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from build_symbols import ICONS
from build_illustrations import ILLUSTRATIONS

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'exports'
W,H=1600,1000
NAVY='#0B2D5B'; BLUE='#1E88FF'; ACTION='#0866C8'; SKY='#64C8FF'
GOLD='#FFB93C'; CREAM='#FFF9EE'; CANVAS='#F5F8FC'; MUTED='#526780'
BORDER='#D5E0EC'; PALE='#EBF3FC'; WHITE='#FFFFFF'
FONTS={
 'regular':TTFont('/System/Library/Fonts/Avenir Next.ttc',fontNumber=7),
 'medium':TTFont('/System/Library/Fonts/Avenir Next.ttc',fontNumber=5),
 'bold':TTFont('/System/Library/Fonts/Avenir Next.ttc',fontNumber=2),
 'cjk':TTFont('/System/Library/Fonts/Hiragino Sans GB.ttc',fontNumber=0),
 'cjk-bold':TTFont('/System/Library/Fonts/Hiragino Sans GB.ttc',fontNumber=2),
}
GLYPHS={}
TEXT_LOG=[]
SVGNS='{http://www.w3.org/2000/svg}'
XLINK='{http://www.w3.org/1999/xlink}'

def normalize(e):
    e.tag=e.tag.replace(SVGNS,'')
    for k in list(e.attrib):
        if k.startswith(XLINK): e.attrib['xlink:'+k[len(XLINK):]]=e.attrib.pop(k)
    for child in e: normalize(child)
    return e

logo=normalize(ET.parse(ROOT.parent/'logo/source/scimemo-logo-master-v04.svg').getroot())
LOGO_DEFS=ET.tostring(logo.find('defs'),encoding='unicode')[6:-7]
LOGO_GROUPS=[re.sub(r' id="[^"]+"','',ET.tostring(e,encoding='unicode')) for e in logo if e.tag=='g' and not e.attrib.get('id','').startswith(('00_','20_'))]
LOGO_ICON=''.join(s for s in LOGO_GROUPS if 'wordmark-' not in s and 'chinese-' not in s and 'divider-' not in s)
LOGO_WORD=''.join(s for s in LOGO_GROUPS if 'wordmark-' in s)

def g(name,body,transform=''):
    return f'<g data-name="{escape(name)}"'+(f' transform="{transform}"' if transform else '')+f'>{body}</g>'

def rect(x,y,w,h,fill=WHITE,r=14,stroke=None,sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'

def path(d,fill='none',stroke=None,sw=1,extra=''):
    return f'<path d="{d}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+f' {extra}/>'

def line(x1,y1,x2,y2,color=BORDER,sw=1,extra=''):
    return path(f'M{x1} {y1}L{x2} {y2}',stroke=color,sw=sw,extra=extra)

def circle(x,y,r,fill,stroke=None):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+'/>'

def font_for(ch,weight):
    key=weight if ord(ch)<0x3000 else ('cjk-bold' if weight=='bold' else 'cjk')
    f=FONTS[key]
    if ord(ch) not in f.getBestCmap():
        key='cjk-bold' if weight=='bold' else 'cjk';f=FONTS[key]
    if ord(ch) not in f.getBestCmap(): raise ValueError(f'Missing glyph: {ch!r}')
    return key,f

def measure(s,size,weight='regular',tracking=0):
    width=0
    for ch in s:
        key,f=font_for(ch,weight)
        name=f.getBestCmap()[ord(ch)]
        width+=f['hmtx'][name][0]/f['head'].unitsPerEm*size+tracking
    return width-tracking if s else 0

def text(s,x,y,size=18,color=NAVY,weight='regular',align='left',tracking=0):
    TEXT_LOG.append(s)
    if align!='left':x-=measure(s,size,weight,tracking)*(1 if align=='right' else .5)
    body=[]
    for ch in s:
        key,f=font_for(ch,weight);name=f.getBestCmap()[ord(ch)];upem=f['head'].unitsPerEm
        gid=f'font-{key}-{ord(ch):x}'
        if gid not in GLYPHS:
            pen=SVGPathPen(f.getGlyphSet());f.getGlyphSet()[name].draw(pen)
            GLYPHS[gid]=f'<path id="{gid}" d="{pen.getCommands()}"/>'
        body.append(f'<use xlink:href="#{gid}" transform="translate({x:.3f} {y}) scale({size/upem:.7f} {-size/upem:.7f})"/>')
        x+=f['hmtx'][name][0]/upem*size+tracking
    return f'<g fill="{color}" aria-label="{escape(s)}">'+''.join(body)+'</g>'

def lines(items,x,y,size=18,color=MUTED,leading=30,weight='regular'):
    return ''.join(text(s,x,y+i*leading,size,color,weight) for i,s in enumerate(items))

def symbol(slug,x,y,size=24,color=NAVY,duotone=False):
    if slug=='warning':
        body='<path d="M10.3 3.9a2 2 0 0 1 3.4 0l8 13.6a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3Z"/><path d="M12 8v5.5"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>'
        return f'<g transform="translate({x} {y}) scale({size/24})" fill="none" stroke="{color}" color="{color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{body}</g>'
    d=ICONS[slug]
    body=d['body']
    if duotone:body+=f'<g stroke="{BLUE}">{d.get("accent", "")}</g>'
    return f'<g transform="translate({x} {y}) scale({size/24})" fill="none" stroke="{color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{body}</g>'

def illustration(slug,x,y,width=320):
    return g(f'Empty illustration {slug}',ILLUSTRATIONS[slug]['body'],f'translate({x} {y}) scale({width/320})')

def mark(x,y,size=100):
    return g('SciMemo mascot',LOGO_ICON,f'translate({x-175*size/592:.3f} {y-170*size/592:.3f}) scale({size/592:.6f})')

def word(x,y,width=400,reverse=False):
    body=LOGO_WORD
    if reverse:
        body=body.replace('url(#wordNavy)',WHITE).replace('url(#wordBlue)',SKY).replace('#03234E',WHITE).replace('#90A9C6','#829BB9')
    return g('SciMemo wordmark',body,f'translate({x-99*width/751:.3f} {y-800*width/751:.3f}) scale({width/751:.6f})')

def lockup(x,y,width=420,reverse=False):
    m=width*.25
    return mark(x,y,m)+word(x+m+width*.07,y+m*.15,width*.68,reverse)

def spark(x,y,scale=1,color=GOLD):
    return g('Two capsule rays',path('M7 22L17 0 M29 33L51 19',stroke=color,sw=10,extra='stroke-linecap="round"'),f'translate({x} {y}) scale({scale})')

def ribbon(x,y,scale=1,color=BLUE):
    return g('Continuous ribbon',path('M0 70C90-20 180 150 290 70S470-20 580 70',stroke=color,sw=34,extra='stroke-linecap="round"'),f'translate({x} {y}) scale({scale})')

def header(num,kicker,title,sub,dark=False):
    fg=WHITE if dark else NAVY;mut='#ACBED4' if dark else MUTED
    return text(f'{num:02d} / {kicker}',88,72,14,SKY if dark else ACTION,'bold',tracking=2)+text(title,88,135,40,fg,'bold')+text(sub,88,177,17,mut)+line(88,207,1512,207,'#2A4669' if dark else BORDER)

def footer(num,dark=False):
    c='#91A7C0' if dark else MUTED
    return line(88,930,1512,930,'#2A4669' if dark else BORDER)+text('SciMemo',88,964,14,c,'bold')+text('VISUAL SYSTEM 1.0  ·  2026',800,964,12,c,align='center',tracking=1.5)+text(f'{num:02d} / 08',1512,964,13,c,align='right')

def panel(x,y,w,h,fill=WHITE):return rect(x,y,w,h,fill,20,BORDER)

def pill(label,x,y,fg=ACTION,bg='#E9F3FF',icon=None,size=14):
    width=measure(label,size,'medium')+28+(24 if icon else 0)
    b=rect(x,y,width,32,bg,8)
    if icon:b+=symbol(icon,x+9,y+7,18,fg)
    return b+text(label,x+14+(22 if icon else 0),y+22,size,fg,'medium'),width

SEM={
 'processing':('#075DAE','#E9F3FF'), 'warning':('#865400','#FFF2D6'),
 'success':('#176443','#E7F5ED'), 'danger':('#A33A32','#FDECE9'),
 'neutral':('#4C6079','#EEF3F8'), 'conflict':('#6F3A9F','#F2EBFA'),
}

def cover():
    b=rect(0,0,W,H,NAVY,0)
    b+=path('M915-90C1140 40 1280 80 1525-60L1710 80C1440 250 1240 190 1055 95Z','#123E73')
    b+=path('M-140 610C200 510 330 850 660 710S1040 625 1160 740L1120 815C920 685 780 810 670 835C320 985 220 650-140 745Z','#10487F')
    b+=lockup(88,72,362,True)
    b+=text('从一页纸，长成一套语言。',88,323,47,WHITE,'bold')
    b+=lines(['记录想法，也记录每次投稿的去向。','让图标、状态、插画与界面使用同一种节奏。'],91,386,23,'#ACBED4',40)
    b+=text('SCIMEMO VISUAL SYSTEM',91,513,16,SKY,'bold',tracking=3)
    b+=text('纸张  /  丝带  /  两束灵感',91,553,20,WHITE)
    b+=mark(1070,218,350)+spark(1434,226,.7)
    modules=[('manuscripts','我的稿件','投稿与修改，始终有迹可循'),('ideas','灵感随笔','一个念头，也可以独立保存'),('venues','期刊会议','收藏目标，写下选择理由'),('dates','近期日程','区分真实截止与个人跟进')]
    for i,(slug,label,desc) in enumerate(modules):
        x=88+i*360
        b+=rect(x,694,344,174,'#123E68',20)
        b+=symbol(slug,x+24,718,42,WHITE)
        b+=text(label,x+24,806,24,WHITE,'bold')+text(desc,x+24,840,14,'#ACBED4')
    return b+footer(1,True)

def identity():
    b=rect(0,0,W,H,CANVAS,0)+header(2,'IDENTITY & COLOR','同一个品牌，清晰的颜色角色。','保留原标识的层次，把功能界面收敛为平面、稳定、易读的蓝色系统。')
    b+=panel(88,240,812,300)+text('标准组合',116,276,16,NAVY,'bold')
    b+=rect(140,304,686,185,'none',0,BORDER)+lockup(207,328,548)
    b+=text('组合四周保留至少 24 px 空白（本页示意尺寸）。',116,515,14,MUTED)
    b+=rect(924,240,588,300,NAVY,20)+text('深色背景 / 反白字标',952,277,16,WHITE,'bold')+lockup(971,328,486,True)
    b+=text('品牌色',88,599,23,NAVY,'bold')+text('亮蓝用于识别；操作蓝负责按钮与文字链接。',1512,599,15,MUTED,align='right')
    swatches=[('深海蓝',NAVY,'标题与品牌骨架'),('品牌蓝',BLUE,'图标与图形强调'),('天空蓝',SKY,'大面积装饰'),('纸张奶白',CREAM,'笔记与纸张插画'),('灵感金',GOLD,'小面积点亮'),('操作蓝',ACTION,'主按钮与链接')]
    for i,(label,c,desc) in enumerate(swatches):
        x=88+i*240
        b+=rect(x,625,224,118,c,14,BORDER if c==CREAM else None)
        fg='#071A33' if c==BLUE else NAVY if c in [SKY,CREAM,GOLD] else WHITE
        b+=text(c,x+18,718,16,fg,'bold')+text(label,x,780,19,NAVY,'bold')+text(desc,x,810,14,MUTED)
    b+=rect(88,848,1424,52,'#E9F3FF',10)+text('可读性规则',106,881,15,ACTION,'bold')+text('白字主按钮用 #0866C8（5.61:1）；金色和天空蓝只作装饰，状态必须同时配文字。',245,881,15,NAVY)
    return b+footer(2)

def typography():
    b=rect(0,0,W,H,CANVAS,0)+header(3,'TYPE & GEOMETRY','温和的圆角，准确的秩序。','本地系统字体、24 像素图标与 4 像素间距基线，统一日常工作界面的节奏。')
    b+=panel(88,240,704,470)+text('文字层级',116,281,17,NAVY,'bold')
    specs=[('页面标题','我的稿件',30,40),('章节标题','最近的投稿记录',20,28),('记录标题','蓝色笔记的阅读实验',16,24),('正文 / 控件','先把当前的想法记下来。',14,21),('辅助信息','仅日期 · 2026-11-20',12,18)]
    for i,(role,s,size,leading) in enumerate(specs):
        y=340+i*76
        b+=text(role,116,y,14,MUTED)+text(s,280,y,size,NAVY,'bold' if i<3 else 'regular')+text(f'{size} / {leading}',760,y,13,MUTED,align='right')
    b+=panel(816,240,696,470)+text('图标骨架',844,281,17,NAVY,'bold')
    gx,gy,step=905,316,12
    b+=rect(gx,gy,288,288,'#F8FBFF',0)
    for i in range(25):b+=line(gx+i*step,gy,gx+i*step,gy+288,'#DCE8F5',.7)+line(gx,gy+i*step,gx+288,gy+i*step,'#DCE8F5',.7)
    b+=rect(gx+24,gy+24,240,240,'none',24,'#8DBBE5',1.2)+symbol('manuscripts',gx,gy,288,ACTION)
    b+=lines(['24 × 24 基础网格','1.75 px 描边','圆端点 / 圆转角','20 × 20 光学区域'],1240,366,17,MUTED,42)
    b+=text('间距与圆角',88,764,23,NAVY,'bold')
    for i,n in enumerate([4,8,12,16,24,32,48]):
        x=90+i*103;b+=rect(x,809,n*1.5,32,ACTION,3)+text(str(n),x,870,16,MUTED)
    for i,(r,label) in enumerate([(8,'控件 8'),(14,'卡片 14'),(20,'插画容器 20')]):
        x=867+i*222;b+=rect(x,799,190,76,WHITE,r,BORDER)+text(label,x+95,845,17,NAVY,align='center')
    return b+footer(3)

def symbols_board():
    b=rect(0,0,W,H,CANVAS,0)+header(4,'SYMBOL FAMILY','四个入口，一套相同的笔触。','24 个基础图标 + 4 个双色展示版。选中态保持同一轮廓，只改变颜色与底色。')
    modules=[('manuscripts','我的稿件','折页与流动丝带'),('ideas','灵感随笔','纸张与两束灵感'),('venues','期刊会议','书页与书签'),('dates','近期日程','日期格与确认记号')]
    for i,(slug,label,desc) in enumerate(modules):
        x=88+i*360;b+=panel(x,240,344,208)
        b+=rect(x+24,264,72,72,PALE,20)+symbol(slug,x+36,276,48,duotone=True)
        b+=text(label,x+24,384,23,NAVY,'bold')+text(desc,x+24,416,15,MUTED)
    b+=text('动作与投稿状态',88,505,20,NAVY,'bold')
    glyphs=[(s,d) for s,d in ICONS.items() if d['category']!='module']
    for i,(slug,d) in enumerate(glyphs):
        row,col=divmod(i,7);x=88+col*205;y=546+row*116
        b+=rect(x,y,192,100,WHITE,14,BORDER)+symbol(slug,x+18,y+18,28,ACTION)
        b+=text(d['label'],x+18,y+76,13,NAVY)
    b+=text('最小 16 px；常用 20 / 24 px；双色展示版用于 48 px 以上。图标旁保留文字。',88,912,14,MUTED)
    return b+footer(4)

def states():
    b=rect(0,0,W,H,CANVAS,0)+header(5,'STATES & MEANING','状态有区别，颜色有分寸。','工作阶段与投稿状态分别表达；每个状态同时拥有符号、文字和明确的色彩角色。')
    statuses=[('submitted','已投稿','processing'),('editorial','编辑处理中','processing'),('under-review','审稿中','processing'),('major-revision','需要大修','warning'),('minor-revision','需要小修','warning'),('resubmitted','已提交修订','processing'),('accepted','已接收','success'),('rejected','已拒稿','danger'),('withdrawn','已撤稿','neutral')]
    for i,(slug,label,tone) in enumerate(statuses):
        row,col=divmod(i,3);x=88+col*480;y=240+row*112
        fg,bg=SEM[tone];b+=panel(x,y,464,96)
        b+=pill(label,x+20,y+17,fg,bg,'status-'+slug,size=15)[0]
        b+=text(slug.replace('-','_'),x+20,y+77,12,MUTED)
    b+=text('工作阶段',88,629,22,NAVY,'bold')+text('“已完成”是写作阶段，不等同于“已接收”。',1512,629,15,MUTED,align='right')
    for i,s in enumerate(['构思中','实验中','写作中','修改中','已暂停','已完成']):
        x=88+i*240;b+=rect(x,655,224,58,'#EEF3F8',10)+text(s,x+112,692,17,'#4C6079','medium',align='center')
    b+=text('日期与数据反馈',88,775,22,NAVY,'bold')
    specs=[('仅日期','不补造时间与时区',ACTION,'#E9F3FF','dates'),('已过期','用文字和警示共同提示','#865400','#FFF2D6','warning'),('已完成','日期事项已完成','#176443','#E7F5ED','status-accepted'),('版本冲突','保留双方，等待选择','#6F3A9F','#F2EBFA','history')]
    for i,(label,desc,fg,bg,ic) in enumerate(specs):
        x=88+i*360;b+=rect(x,802,344,98,bg,14)+symbol(ic,x+18,822,24,fg)+text(label,x+55,843,17,fg,'bold')+text(desc,x+18,879,14,fg)
    return b+footer(5)

def motifs():
    b=rect(0,0,W,H,CANVAS,0)+header(6,'ILLUSTRATIONS & MOTIFS','从 Logo 生长出的辅助图形。','纸张、连续丝带与两束胶囊状金色光线，组成可扩展的辅助图形语言。')
    empties=[('manuscripts','从第一篇稿件开始','先填名称，再补充投稿经历。'),('ideas','一个念头，也值得留一页','笔记可以独立保存。'),('venues','收藏一个投稿目标','写下选择理由与官方来源。'),('dates','记下下一次截止日期','也可记录个人跟进计划。')]
    for i,(slug,title,desc) in enumerate(empties):
        x=88+i*360;b+=panel(x,240,344,352)+illustration(slug,x+12,255,320)+text(title,x+172,520,17,NAVY,'bold',align='center')+text(desc,x+172,555,13,MUTED,align='center')
    for i,(name,desc) in enumerate([('纸张','奶白留白与单个折角'),('丝带','连续弧线，避开正文'),('两束灵感','只作小面积金色强调')]):
        x=88+i*480;b+=panel(x,626,464,274)
        if i==0:
            b+=path(f'M{x+41} 654H{x+137}L{x+162} 679V770H{x+41}Z',CREAM,NAVY,2)+path(f'M{x+137} 654V679H{x+162}',PALE,NAVY,2)
            b+=line(x+63,704,x+132,704,SKY,4)+line(x+63,724,x+111,724,SKY,4)
        elif i==1:b+=ribbon(x+40,666,.65)
        else:b+=spark(x+190,667,1.2)
        b+=text(name,x+28,832,22,NAVY,'bold')+text(desc,x+28,867,16,MUTED)
    return b+footer(6)

def desktop(x,y,w=1050):
    s=w/1120
    c=rect(0,0,1120,650,WHITE,18,BORDER)
    c+=rect(0,0,220,650,'#EBF3FC',18)+rect(204,0,16,650,'#EBF3FC',0)+lockup(24,27,171)
    c+=text('我的工作区',27,118,12,MUTED)
    for i,(slug,label,count) in enumerate([('manuscripts','我的稿件','03'),('ideas','灵感随笔','08'),('venues','期刊会议','06'),('dates','近期日程','04')]):
        yy=140+i*56
        if i==0:c+=rect(15,yy,190,46,'#DCEEFF',8)
        c+=symbol(slug,28,yy+12,22,ACTION if i==0 else MUTED)+text(label,63,yy+29,14,ACTION if i==0 else MUTED,'bold' if i==0 else 'regular')+text(count,185,yy+28,12,MUTED,align='right')
    c+=symbol('settings',28,590,20,MUTED)+text('设置与数据',62,605,13,MUTED)
    c+=line(220,64,1120,64)+text('SciMemo / 我的稿件',247,40,12,MUTED)
    c+=rect(793,17,235,34,CANVAS,8,BORDER)+symbol('search',804,25,18,MUTED)+text('搜索题名、想法、期刊…',833,40,12,MUTED)
    c+=text('我的稿件',251,118,30,NAVY,'bold')+text('每篇论文，当前状态与下一步。',251,148,14,MUTED)
    c+=rect(950,91,142,42,ACTION,8)+symbol('add',967,102,20,WHITE)+text('新建稿件',995,118,14,WHITE,'bold')
    for i,(label,n) in enumerate([('进行中的稿件','03'),('投稿与审稿中','02'),('等待修回','01')]):
        xx=251+i*283;c+=rect(xx,180,266,82,WHITE,14,BORDER)+text(label,xx+18,208,13,MUTED)+text(n,xx+18,244,28,NAVY,'medium')
    c+=rect(251,284,170,36,PALE,8)+rect(255,288,82,28,WHITE,6)+text('进行中',296,308,12,ACTION,'bold',align='center')+text('已归档',377,308,12,MUTED,align='center')
    c+=symbol('export',980,293,16,ACTION)+text('导出概览',1006,307,12,ACTION)
    cards=[('蓝色笔记的阅读实验','审稿中','processing','status-under-review','示例期刊 A','下一步  整理补充实验材料'),('一页纸的灵感记录','需要小修','warning','status-minor-revision','示例会议 B','下一步  核对修订说明'),('研究手账的界面探索','尚未投稿','neutral',None,'写作中','下一步  完成方法段落')]
    for i,(title,state,tone,ic,venue,next_) in enumerate(cards):
        yy=339+i*91;c+=rect(251,yy,841,80,WHITE,12,BORDER)+text(title,270,yy+27,16,NAVY,'bold')
        fg,bg=SEM[tone];p,pw=pill(state,270,yy+39,fg,bg,ic,size=12);c+=p+text(venue,282+pw,yy+61,12,MUTED)
        c+=text(next_,748,yy+28,12,MUTED)+text('打开',1059,yy+60,12,ACTION,align='right')
    c+=text('数据在本机 · 同步由你决定',251,631,12,MUTED)
    return g('Light application concept',c,f'translate({x} {y}) scale({s})')

def mobile(x,y):
    c=rect(0,0,300,624,NAVY,34)+rect(8,8,284,608,CANVAS,29)
    c+=rect(109,17,82,17,NAVY,9)+mark(24,58,29)+text('灵感随笔',65,80,20,NAVY,'bold')
    c+=text('一个念头，也可以独立保存。',24,114,12,MUTED)
    for i,(title,body,tag) in enumerate([('把灵感留在纸上',['今天的讨论里，有一个问题','值得继续想下去。'],'创新灵感'),('读完这一段之后',['用自己的语言，记下理解，','也记下暂时没有答案的地方。'],'随笔')]):
        yy=142+i*174;c+=rect(20,yy,260,156,CREAM,14,'#E6DDCF')+pill(tag,35,yy+15,NAVY,'#FFF2D6',size=12)[0]+text(title,35,yy+69,16,NAVY,'bold')+lines(body,35,yy+101,12,MUTED,21)
    c+=rect(20,514,260,40,ACTION,8)+symbol('add',80,524,20,WHITE)+text('写一条随笔',111,540,13,WHITE,'bold')
    c+=rect(8,572,284,44,WHITE,0)
    for i,(slug,label) in enumerate([('manuscripts','稿件'),('ideas','随笔'),('venues','期刊会议'),('dates','日程')]):
        xx=28+i*70;c+=symbol(slug,xx+7,575,20,ACTION if i==1 else MUTED)+text(label,xx+17,610,12,ACTION if i==1 else MUTED,align='center')
    return g('Mobile notes concept',c,f'translate({x} {y})')

def application():
    b=rect(0,0,W,H,CANVAS,0)+header(7,'APPLICATION','品牌走进界面，也让内容安静下来。','桌面稿件列表与移动端独立笔记的应用示意，保持现有四模块结构。')
    b+=desktop(88,250,1080)+mobile(1212,250)
    b+=text('桌面 / 稿件',88,913,14,MUTED)+text('移动端 / 独立笔记',1212,913,14,MUTED)
    return b+footer(7)

def dark_and_handoff():
    b=rect(0,0,W,H,'#071A33',0)+header(8,'DARK & HANDOFF','白天和夜晚，保持同一个 SciMemo。','深色方案沿用相同几何与状态语义；源文件、独立素材和设计变量一起交付。',True)
    x,y=88,240
    b+=rect(x,y,856,570,'#0E294A',20,'#2A4669')+lockup(x+28,y+25,262,True)
    b+=text('灵感随笔',x+28,y+166,30,'#EEF5FF','bold')+text('先把想法记下来，不必立即成为一篇论文。',x+28,y+205,16,'#ACBED4')
    b+=rect(x+28,y+237,800,228,'#143456',14,'#2A4669')+symbol('ideas',x+51,y+261,27,SKY)
    b+=text('让每次思考，都有一个落点。',x+50,y+331,28,'#EEF5FF','bold')+lines(['可以是一段读后感，一个实验设想，','也可以是暂时没有标题的片段。'],x+50,y+378,17,'#ACBED4',32)
    b+=rect(x+28,y+494,169,44,SKY,8)+symbol('add',x+44,y+506,20,'#08264A')+text('写一条随笔',x+76,y+523,14,'#08264A','bold')
    b+=text('交付内容',992,270,25,WHITE,'bold')
    deliverables=[('01','可编辑 Illustrator 总图','8 个规范与应用画板区域'),('02','图标与空状态插画','24 基础图标 / 4 双色版 / 4 插画'),('03','辅助图形与组合标','纸张 / 丝带 / 两束灵感'),('04','浅色与深色设计变量','JSON / CSS / 对比度记录')]
    for i,(n,title,desc) in enumerate(deliverables):
        yy=326+i*116;b+=text(n,992,yy,15,SKY,'bold')+text(title,1030,yy,19,WHITE,'bold')+text(desc,1030,yy+35,14,'#ACBED4')+line(992,yy+67,1512,yy+67,'#2A4669')
    b+=rect(88,850,1424,51,'#143456',10)+text('使用原则',107,883,15,SKY,'bold')+text('控件保持平面；完整吉祥物留给品牌。用文字补足状态，不用颜色替代含义。',247,883,15,'#EEF5FF')
    return b+footer(8,True)

PAGES=[('01-overview',cover),('02-identity-color',identity),('03-type-geometry',typography),('04-symbol-family',symbols_board),('05-states-meaning',states),('06-illustrations-motifs',motifs),('07-application',application),('08-dark-handoff',dark_and_handoff)]

def svg(body,width,height,title):
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+f'<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{width}" height="{height}" viewBox="0 0 {width} {height}" stroke-linecap="round" stroke-linejoin="round"><title>{escape(title)}</title><defs>'+LOGO_DEFS+'<clipPath id="boardClip"><rect width="1600" height="1000"/></clipPath>'+''.join(GLYPHS.values())+'</defs>'+body+'</svg>'

def unique_ids(body,prefix):
    # Logo groups are repeated across boards. Their gradient refs stay shared.
    import re
    return re.sub(r' id="(?!font-)([^"]+)"',lambda m:f' id="{prefix}-{m[1]}"',body)

def build_patterns():
    patt=OUT/'patterns';patt.mkdir(parents=True,exist_ok=True)
    bodies={
      'ribbon':rect(0,0,960,360,PALE,0)+ribbon(-65,45,1.8)+spark(795,57,.8),
      'paper':rect(0,0,960,360,CANVAS,0),
      'spark':rect(0,0,960,360,NAVY,0),
    }
    for row in range(3):
        for col in range(8):
            x=col*135-15+(row%2)*55;y=row*132-15
            bodies['paper']+=path(f'M{x} {y}H{x+62}L{x+80} {y+18}V{y+94}H{x}Z',CREAM,'#D5E0EC',1.5)+path(f'M{x+62} {y}V{y+18}H{x+80}',PALE,'#D5E0EC',1.5)
            bodies['spark']+=spark(x+18,y+34,.65, GOLD if (row+col)%3==0 else '#2A5684')
    for slug,body in bodies.items():(patt/f'scimemo-pattern-{slug}.svg').write_text(svg(body,960,360,f'SciMemo {slug} brand pattern'))

def build():
    boards=OUT/'boards';boards.mkdir(parents=True,exist_ok=True)
    pages=[(name,unique_ids(fn(),name)) for name,fn in PAGES]
    # Text glyph definitions are complete after every board has been composed.
    for name,body in pages:(boards/f'scimemo-{name}.svg').write_text(svg(body,W,H,name))
    master=rect(0,0,3440,4400,'#DBE5EF',0)
    for i,(name,body) in enumerate(pages):
        row,col=divmod(i,2)
        master+=g(name,f'<g clip-path="url(#boardClip)">{body}</g>',f'translate({80+1680*col} {80+1080*row})')
    (ROOT/'source/scimemo-visual-system-master-v01.svg').write_text(svg(master,3440,4400,'SciMemo visual system - eight editable boards'))
    build_patterns()
    feedback=OUT/'feedback';feedback.mkdir(parents=True,exist_ok=True)
    (feedback/'scimemo-warning.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img"><title>SciMemo warning</title>'+symbol('warning',0,0,24,'currentColor')+'</svg>\n')
    (ROOT/'source/board-copy.json').write_text(json.dumps(TEXT_LOG,ensure_ascii=False,indent=2)+'\n')
    (OUT/'boards/manifest.json').write_text(json.dumps({'version':'1.0','boardSize':[W,H],'pages':[{'name':n,'file':f'scimemo-{n}.svg'} for n,_ in pages]},ensure_ascii=False,indent=2)+'\n')
    print(f'Built {len(pages)} vector boards; {len(GLYPHS)} outlined font glyphs; all lettering from local fonts.')

if __name__=='__main__':build()
