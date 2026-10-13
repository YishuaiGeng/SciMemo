#!/usr/bin/env python3
"""Build SciMemo's original, editable 24 px symbol family using only SVG paths.

Import ICONS and icon_svg() to reuse this exact geometry in brand boards.
Run this file to write exports/icons/*.svg and the accompanying manifest.
"""
from __future__ import annotations

import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAVY = "#0B2D5B"
BLUE = "#1E88FF"


def p(d: str, **attrs: str) -> str:
    return '<path d="' + d + '"' + ''.join(f' {k.replace("_", "-")}="{v}"' for k, v in attrs.items()) + '/>'


def icon(label: str, category: str, body: str, *, description: str, accent: str = "", kind: str | None = None, status: str | None = None) -> dict:
    result = {"label": label, "category": category, "body": body, "description": description}
    if accent:
        result["accent"] = accent
    if kind:
        result["kind"] = kind
    if status:
        result["status"] = status
    return result


# On a 24 unit viewBox, artwork centre lines stay inside 2–22.
# Every curve is authored with intentional tangents. No image tracing is used.
ICONS = {
    "manuscripts": icon("稿件", "module",
        p("M14 3.5H6.5A2 2 0 0 0 4.5 5.5v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9L14 3.5Z") +
        p("M14 3.5v4a2 2 0 0 0 2 2h3.5M8 7.5h2M8 17h5.5") +
        p("M4.5 12c4.5-3 10.5 5 15 2"),
        accent=p("M4.5 12c4.5-3 10.5 5 15 2"), kind="paper",
        description="折页稿纸与流动丝带；记录稿件、投稿尝试和事件历史。"),
    "ideas": icon("想法与笔记", "module",
        p("M6 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM7.5 13h6M7.5 16.5H12") +
        p("m17.5 3.5-1 2.5M21 7l-2 1.5"),
        accent=p("m17.5 3.5-1 2.5M21 7l-2 1.5"), kind="note",
        description="独立方形便笺与双胶囊灵感光芒；延续 Logo 的两道圆头光芒，笔记无需挂靠任何稿件。"),
    "venues": icon("期刊与会议", "module",
        p("M12 6.5C10.2 4.8 8.6 4.5 6.5 4.5h-3v15h3c2.1 0 3.7.3 5.5 2 1.8-1.7 3.4-2 5.5-2h3v-15h-3c-2.1 0-3.7.3-5.5 2ZM12 6.5v15M6.5 9h2M6.5 12.5h2") +
        p("M15.5 4.7V12l2-1.5 2 1.5V4.5"),
        accent=p("M15.5 4.7V12l2-1.5 2 1.5V4.5"), kind="venue",
        description="展开的期刊与丝带书签；统一表示期刊、会议及届次。"),
    "dates": icon("日期与日程", "module",
        p("M5.5 5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM7.5 3v4M16.5 3v4M3.5 10h17M15.5 14h1M15.5 17.5h1") +
        p("m7 15.5 1.5 1.5 3-3"),
        accent=p("m7 15.5 1.5 1.5 3-3"), kind="deadline",
        description="独立日期格与确认标记；不暗示任何未记录的时刻或时区。"),
    "status-submitted": icon("已投稿", "status",
        p("m3.5 10 17-6.5-6.5 17-4-6.5-6.5-4ZM10 14 20.5 3.5"), status="submitted",
        description="送出箭头；仅对应已记录的投稿。"),
    "status-editorial": icon("编辑处理中", "status",
        p("M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H12M14 3.5v4a2 2 0 0 0 2 2h3.5L14 3.5ZM8 8h2M8 12h3") +
        p("M21 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17 14.5V17l1.5 1"), status="editorial",
        description="稿纸与处理时钟；表明编辑环节，不能用作等待审稿的替代状态。"),
    "status-under-review": icon("审稿中", "status",
        p("M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H10M14 3.5v4a2 2 0 0 0 2 2h3.5L14 3.5ZM8 8h2M8 12h1.5") +
        p("M18.5 14.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17.5 17.5l3.5 3.5"), status="under_review",
        description="审阅镜与稿纸；仅对应 under_review。"),
    "status-major-revision": icon("需要大修", "status",
        p("M7 4.5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Z") +
        p("M8 9h8l-2.5-2.5M16 9v3M16 15H8l2.5 2.5M8 15v-3"), status="major_revision",
        description="双向修订环，表示较大范围的修订；配合文字区分大修、小修。"),
    "status-minor-revision": icon("需要小修", "status",
        p("M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H11M14 3.5v4a2 2 0 0 0 2 2h3.5L14 3.5ZM8 8h2M8 12h3") +
        p("m12 20 1-4 6-6 3 3-6 6-4 1ZM17 12l3 3"), status="minor_revision",
        description="稿纸与局部修订笔；配合文字区分大修、小修。"),
    "status-resubmitted": icon("已提交修订", "status",
        p("M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H11M14 3.5v4a2 2 0 0 0 2 2h3.5L14 3.5ZM8 8h2M8 12h3") +
        p("M17 21V13m-4 4 4-4 4 4"), status="resubmitted",
        description="修订稿与上送箭头；仅在已记录提交修订事件时使用。"),
    "status-accepted": icon("已接收", "status",
        p("M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7.5 12l3 3 6-6"), status="accepted",
        description="闭合圆与确认勾；稿件已接收。"),
    "status-rejected": icon("已拒稿", "status",
        p("M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8.5 8.5l7 7M15.5 8.5l-7 7"), status="rejected",
        description="闭合圆与交叉；仅表示拒稿，不能代替删除操作。"),
    "status-withdrawn": icon("已撤稿", "status",
        p("M10 3.5h7.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H10M15.5 12H3m4-4-4 4 4 4"), status="withdrawn",
        description="向外返回箭头；已结束的撤稿尝试仍保留历史。"),
    "search": icon("搜索", "action", p("M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15.5 15.5l5.5 5.5"), description="搜索本机记录。"),
    "add": icon("新建", "action", p("M12 4.5v15M4.5 12h15"), description="新建稿件、独立想法、期刊会议或日期。"),
    "edit": icon("编辑", "action", p("m4 20 1-5 11-11a2.12 2.12 0 0 1 3 0l1 1a2.12 2.12 0 0 1 0 3L9 19l-5 1ZM14 6l4 4M5 15l4 4"), description="编辑现有记录。"),
    "archive": icon("归档", "action", p("M3 4.5h18v4H3v-4ZM4.5 8.5v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-10M9 12.5h6"), description="归档稿件；不表示删除。"),
    "trash": icon("删除与回收站", "action", p("M3.5 6.5h17M9 6.5v-3h6v3M5.5 6.5l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M10 10.5v6M14 10.5v6"), description="移入回收站或打开回收站；不暗示永久清除。"),
    "import": icon("恢复备份", "action", p("M4 14v4.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V14M12 3.5v12m-4-4 4 4 4-4"), description="将 JSON 备份恢复到符合条件的空工作区。"),
    "export": icon("导出", "action", p("M4 14v4.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V14M12 15.5v-12m-4 4 4-4 4 4"), description="导出 JSON 完整备份或稿件概览 CSV。"),
    "pin": icon("置顶", "action", p("m9 3.5 8 2-2.5 4 1 5-5.5-1-4 2.5-2-2 4-3 1-7.5ZM10.5 13.5l-6 7"), description="笔记置顶；不是必需的层级或项目。"),
    "link": icon("关联", "action", p("m10 7 2.5-2.5a5 5 0 0 1 7 7L17 14M14 17l-2.5 2.5a5 5 0 0 1-7-7L7 10M8.5 15.5l7-7"), description="表示已有记录间的可选关联或网址。"),
    "settings": icon("设置与数据", "action", p("M10 3h4l.6 2.6 2 .9L19 5l2 3.5-1.9 1.9v3.2l1.9 1.9-2 3.5-2.4-1.5-2 .9L14 21h-4l-.6-2.6-2-.9L5 19l-2-3.5 1.9-1.9v-3.2L3 8.5 5 5l2.4 1.5 2-.9L10 3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"), description="存储、备份、手动可选同步和数据检查。"),
    "history": icon("投稿历史", "action", p("M4.5 6.5A9 9 0 1 1 3 14M3 3.5v4h4M12 7.5V12l3 2"), description="查看追加保存的投稿尝试与事件时间线。"),
}


def icon_svg(slug: str, *, duotone: bool = False, size: int = 24, titled: bool = True) -> str:
    data = ICONS[slug]
    attrs = f'xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'
    if titled:
        attrs += ' role="img"'
    # Single-color SVG remains fully themeable when inserted inline. The fallback
    # color also makes a bare file opened in Illustrator readable in brand navy.
    attrs += f' color="{NAVY}"'
    parts = [f'<svg {attrs}>']
    if titled:
        parts.append(f'<title>{escape(data["label"])}</title>')
    parts.append(data["body"])
    if duotone:
        if data["category"] != "module":
            raise ValueError("Duotone display variants exist only for the four module symbols.")
        parts.append(f'<g stroke="{BLUE}">{data["accent"]}</g>')
    parts.append('</svg>')
    return '\n'.join(parts)


def build() -> None:
    output = ROOT / "exports" / "icons"
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for slug, data in ICONS.items():
        file = f"scimemo-{slug}.svg"
        (output / file).write_text(icon_svg(slug) + '\n', encoding="utf-8")
        record = {"slug": slug, "file": file, **{k: v for k, v in data.items() if k not in {"body", "accent"}}}
        if data["category"] == "module":
            variant = f"scimemo-{slug}-duotone.svg"
            (output / variant).write_text(icon_svg(slug, duotone=True, size=48) + '\n', encoding="utf-8")
            record["displayVariant"] = variant
        entries.append(record)
    manifest = {
        "name": "SciMemo Symbols", "version": "1.0.0", "baseGlyphs": len(ICONS),
        "moduleDisplayVariants": 4, "geometry": {"viewBox": "0 0 24 24", "strokeWidth": 1.75, "linecap": "round", "linejoin": "round", "safeBounds": [2.0, 2.0, 22.0, 22.0]},
        "colors": {"default": NAVY, "accent": BLUE, "action": "#0866C8"},
        "usage": {
            "inline": "Base icons use currentColor. Set CSS color on the inline SVG to theme it; the color attribute is the navy fallback.",
            "size": "Use 20–24 px in navigation and controls; 16 px is the minimum, 48 px duotone variants are for module cards and editorial display.",
            "active": "Use the same outline geometry for active navigation; set color to #0866C8 and place on #EAF4FF for functional contrast. Reserve #1E88FF for decorative accents. Avoid switching the silhouette or stroke weight.",
            "accessibility": "Icons supplement text labels. For an icon-only button, provide aria-label; for an inline icon next to text, use aria-hidden=true and omit the SVG title.",
            "status": "All nine status slugs map directly to src/core/types.ts. Always show the status text; never communicate submission status by color alone.",
            "product": "These are reusable design assets. Their presence does not mean the application has been wired to use them.",
        },
        "icons": entries,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding="utf-8")
    # Reusable geometry for consumers that cannot import a Python module.
    (output / "geometry.json").write_text(json.dumps(ICONS, ensure_ascii=False, separators=(',', ':')) + '\n', encoding="utf-8")
    print(f"Built {len(ICONS)} glyphs and 4 duotone display variants in {output}")


if __name__ == "__main__":
    build()
