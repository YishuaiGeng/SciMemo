#!/usr/bin/env python3
"""Build SciMemo's four editable, font-free empty-state SVG illustrations.

ILLUSTRATIONS is also the import interface for the visual-system brandbook.
Every body is a complete SVG group in a shared 320 x 220 coordinate system.
Run with the standard library only: python3 build_illustrations.py
"""

from __future__ import annotations

import json
from pathlib import Path
from xml.etree import ElementTree


ILLUSTRATIONS = {
    "manuscripts": {
        "label": "Manuscripts — a page with a flowing ribbon",
        "body": '''<g fill="none" stroke="#0B2D5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="160" cy="194" rx="88" ry="8" fill="#EFF6FF" stroke="none"/>
  <ellipse cx="160" cy="194" rx="61" ry="4" fill="#64C8FF" opacity="0.12" stroke="none"/>
  <path d="M106 30H197L224 57V175Q224 184 215 184H106Q97 184 97 175V39Q97 30 106 30Z" fill="#FFF9EE"/>
  <path d="M197 30V50Q197 57 204 57H224" fill="#EFF6FF"/>
  <path d="M192 74C178 64 151 63 139 75C126 88 137 100 156 106L178 113C192 118 193 129 181 137C168 146 145 144 130 135L121 151C140 163 170 166 190 154C214 140 212 115 190 103L165 95C151 90 145 85 152 79C159 73 177 74 185 81Z" fill="#1E88FF"/>
  <path d="M131 168H181" stroke="#64C8FF"/>
  <circle cx="76" cy="81" r="3.5" fill="#64C8FF" stroke="none"/>
  <circle cx="246" cy="139" r="4" fill="#FFB93C" stroke="none"/>
</g>''',
    },
    "ideas": {
        "label": "Independent ideas and notes — a notebook and a spark",
        "body": '''<g fill="none" stroke="#0B2D5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="160" cy="194" rx="88" ry="8" fill="#EFF6FF" stroke="none"/>
  <ellipse cx="160" cy="194" rx="61" ry="4" fill="#64C8FF" opacity="0.12" stroke="none"/>
  <path d="M108 48H211Q220 48 220 57V176Q220 184 212 184H108Q100 184 100 176V56Q100 48 108 48Z" fill="#EFF6FF"/>
  <path d="M100 42H203Q211 42 211 50V170Q211 178 203 178H100Q92 178 92 170V50Q92 42 100 42Z" fill="#FFF9EE"/>
  <path d="M114 43V177" stroke="#64C8FF"/>
  <path d="M98 63H88Q83 63 83 68Q83 73 88 73H98M98 91H88Q83 91 83 96Q83 101 88 101H98M98 119H88Q83 119 83 124Q83 129 88 129H98M98 147H88Q83 147 83 152Q83 157 88 157H98"/>
  <path d="M132 91H180M132 108H188M132 125H172" stroke="#64C8FF"/>
  <path d="M135 151C143 141 153 141 158 148C162 154 169 154 177 145" stroke="#1E88FF"/>
  <path d="M224 30L230 46M240 58L255 50" stroke="#FFB93C" stroke-width="8"/>
  <circle cx="248" cy="84" r="3.5" fill="#64C8FF" stroke="none"/>
  <circle cx="70" cy="111" r="3.5" fill="#1E88FF" stroke="none"/>
</g>''',
    },
    "venues": {
        "label": "Journals and conferences — two books and a target card",
        "body": '''<g fill="none" stroke="#0B2D5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="160" cy="194" rx="88" ry="8" fill="#EFF6FF" stroke="none"/>
  <ellipse cx="160" cy="194" rx="61" ry="4" fill="#64C8FF" opacity="0.12" stroke="none"/>
  <path d="M94 64H129Q134 64 134 69V180H88V70Q88 64 94 64Z" fill="#64C8FF"/>
  <path d="M88 82H134M88 163H134"/>
  <path d="M107 100H116M107 109H116" stroke="#0B2D5B"/>
  <path d="M145 47H180Q186 47 186 53V180H140V53Q140 47 145 47Z" fill="#FFF9EE"/>
  <path d="M140 66H186M140 163H186"/>
  <path d="M158 85H168M158 94H168" stroke="#1E88FF"/>
  <path d="M174 180V105Q174 97 182 97H239Q247 97 247 105V172Q247 180 239 180Z" fill="#EFF6FF"/>
  <path d="M218 97H232V126L225 121L218 126Z" fill="#FFB93C"/>
  <path d="M189 139H232M189 151H220M189 163H210" stroke="#1E88FF"/>
  <path d="M76 180H252"/>
  <circle cx="222" cy="57" r="3.5" fill="#64C8FF" stroke="none"/>
  <circle cx="70" cy="127" r="3.5" fill="#FFB93C" stroke="none"/>
</g>''',
    },
    "dates": {
        "label": "Dates — a calendar page with a date dot and a ribbon tab",
        "body": '''<g fill="none" stroke="#0B2D5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="160" cy="194" rx="88" ry="8" fill="#EFF6FF" stroke="none"/>
  <ellipse cx="160" cy="194" rx="61" ry="4" fill="#64C8FF" opacity="0.12" stroke="none"/>
  <path d="M102 53H219Q228 53 228 62V176Q228 184 220 184H102Q94 184 94 176V61Q94 53 102 53Z" fill="#EFF6FF"/>
  <path d="M94 46H211Q220 46 220 55V169Q220 178 211 178H94Q86 178 86 170V54Q86 46 94 46Z" fill="#FFF9EE"/>
  <path d="M94 46H211Q220 46 220 55V81H86V54Q86 46 94 46Z" fill="#64C8FF"/>
  <path d="M86 81H220"/>
  <path d="M116 35V58M190 35V58"/>
  <path d="M113 106H120M149 106H156M185 106H192M113 132H120M185 132H192M113 156H120M149 156H156" stroke="#64C8FF"/>
  <circle cx="152.5" cy="132" r="10" fill="#1E88FF"/>
  <path d="M190 145H207V190L198.5 184L190 190Z" fill="#FFB93C"/>
  <circle cx="67" cy="113" r="3.5" fill="#64C8FF" stroke="none"/>
  <circle cx="245" cy="66" r="3.5" fill="#FFB93C" stroke="none"/>
</g>''',
    },
}


def svg(slug: str) -> str:
    """Wrap a reusable illustration body in a standalone accessible SVG."""
    from html import escape

    item = ILLUSTRATIONS[slug]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" '
        'viewBox="0 0 320 220" fill="none" role="img" '
        f'aria-labelledby="{slug}-title">\n'
        f'  <title id="{slug}-title">{escape(item["label"])}</title>\n'
        f'{item["body"]}\n'
        '</svg>\n'
    )


def main() -> None:
    export_dir = Path(__file__).resolve().parents[1] / "exports" / "illustrations"
    export_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "viewBox": "0 0 320 220",
        "strokeWidth": 2.5,
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "background": "transparent",
        "palette": {
            "navy": "#0B2D5B", "blue": "#1E88FF", "sky": "#64C8FF",
            "cream": "#FFF9EE", "gold": "#FFB93C", "paleBlue": "#EFF6FF",
        },
        "illustrations": [],
    }
    allowed = {"svg", "title", "g", "path", "rect", "circle", "ellipse"}
    for slug, item in ILLUSTRATIONS.items():
        source = svg(slug)
        root = ElementTree.fromstring(source)
        assert root.attrib["viewBox"] == "0 0 320 220"
        assert all(node.tag.rsplit("}", 1)[-1] in allowed for node in root.iter())
        filename = f"scimemo-empty-{slug}.svg"
        (export_dir / filename).write_text(source, encoding="utf-8")
        manifest["illustrations"].append({
            "slug": slug, "label": item["label"], "file": filename,
        })
        print(export_dir / filename)
    (export_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
