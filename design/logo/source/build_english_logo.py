#!/usr/bin/env python3
"""Create the English-only v03 lockups from the approved v02 vector artwork.

Preserve every retained path, gradient and layer name. Historical v01/v02 files
are inputs only. Running this script also renders the requested PNG exports
locally with the bundled sharp library; use --svg-only to skip rendering.
"""
from __future__ import annotations

import argparse
import copy
import json
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"
EXPORTS = ROOT / "exports"
SVG = "http://www.w3.org/2000/svg"
XLINK = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", XLINK)


def clean_metadata(root: ET.Element, title: str) -> None:
    root.find(f"{{{SVG}}}title").text = title
    root.find(f"{{{SVG}}}desc").text = (
        "SciMemo English-only logo. Editable vector paths and gradients. "
        "The mascot and Latin wordmark retain the approved v02 geometry."
    )


def remove_chinese_and_dividers(root: ET.Element) -> None:
    for parent in root.iter():
        for child in list(parent):
            if child.get("id", "").startswith(("chinese-", "divider-")):
                parent.remove(child)


def write_svg(path: Path, root: ET.Element) -> None:
    ET.ElementTree(root).write(path, encoding="UTF-8", xml_declaration=True)


def compose(template: ET.Element, content: list[ET.Element], viewbox: str,
            width: int, height: int, title: str) -> ET.Element:
    root = copy.deepcopy(template)
    for child in list(root):
        if child.tag == f"{{{SVG}}}g":
            root.remove(child)
    root.set("viewBox", viewbox)
    root.set("width", str(width))
    root.set("height", str(height))
    clean_metadata(root, title)
    root.extend(copy.deepcopy(content))
    return root


def wrapped(name: str, transform: str, nodes: list[ET.Element]) -> ET.Element:
    layer = ET.Element(f"{{{SVG}}}g", {"id": name, "data-name": name})
    positioned = ET.SubElement(layer, f"{{{SVG}}}g", {"transform": transform})
    positioned.extend(copy.deepcopy(nodes))
    return layer


def build(render: bool = True) -> list[Path]:
    EXPORTS.mkdir(exist_ok=True)
    master = ET.parse(SOURCE / "scimemo-logo-master-v02.svg").getroot()
    remove_chinese_and_dividers(master)
    clean_metadata(master, "SciMemo — English-only editable logo master")
    master.set("viewBox", "0 0 1254 1100")
    master.set("height", "1100")
    background = master.find(f"{{{SVG}}}g[@id='00_White_presentation_background']/{{{SVG}}}rect")
    background.set("height", "1100")

    icon_layers = [node for node in master if node.get("id", "").startswith(
        tuple(f"{i:02d}_" for i in range(1, 13))) ]
    word_layers = [node for node in master if node.get("id", "").startswith("wordmark-")]
    if len(icon_layers) != 12 or len(word_layers) != 8:
        raise ValueError("Expected the 12 v02 mascot layers and 8 Latin wordmark layers.")

    vector_files: dict[Path, ET.Element] = {
        SOURCE / "scimemo-logo-master-v03.svg": master,
        EXPORTS / "scimemo-wordmark-v03.svg": compose(
            master, word_layers, "99 800 751 155", 1502, 310,
            "SciMemo — English wordmark"),
        EXPORTS / "scimemo-logo-stacked-v03.svg": compose(
            master, icon_layers + word_layers, "90 155 765 810", 1530, 1620,
            "SciMemo — English stacked logo"),
        EXPORTS / "scimemo-logo-horizontal-v03.svg": compose(
            master, [wrapped("App_icon", "translate(-112 -109) scale(.64)", icon_layers),
                     wrapped("Wordmark", "translate(312 -690) scale(1.01)", word_layers)],
            "0 0 1180 380", 2360, 760, "SciMemo — English horizontal logo"),
    }

    app_icon = ET.parse(SOURCE / "scimemo-icon-v02.svg").getroot()
    clean_metadata(app_icon, "SciMemo — app icon")
    vector_files[SOURCE / "scimemo-icon-v03.svg"] = app_icon
    vector_files[EXPORTS / "scimemo-icon-v03.svg"] = app_icon
    for path, document in vector_files.items():
        write_svg(path, document)

    raster_files = [
        (SOURCE / "scimemo-logo-master-v03.svg", EXPORTS / "scimemo-logo-preview-v03.png", 1254),
        (EXPORTS / "scimemo-wordmark-v03.svg", EXPORTS / "scimemo-wordmark-v03.png", 1502),
        (EXPORTS / "scimemo-logo-stacked-v03.svg", EXPORTS / "scimemo-logo-stacked-v03.png", 1530),
        (EXPORTS / "scimemo-logo-horizontal-v03.svg", EXPORTS / "scimemo-logo-horizontal-v03.png", 2360),
        (SOURCE / "scimemo-icon-v03.svg", EXPORTS / "scimemo-icon-1024-v03.png", 1024),
        (SOURCE / "scimemo-icon-v03.svg", EXPORTS / "scimemo-icon-2048-v03.png", 2048),
    ]
    if render:
        sharp_path = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"
        script = """const sharp = require(process.argv[1]);
const jobs = JSON.parse(process.argv[2]);
(async () => { for (const [input, output, width] of jobs) {
  await sharp(input, {density: 288}).resize({width, kernel: 'lanczos3'}).png().toFile(output);
  console.log(output);
} })().catch(error => { console.error(error); process.exitCode = 1; });"""
        subprocess.run(["node", "-e", script, str(sharp_path),
                        json.dumps([[str(a), str(b), w] for a, b, w in raster_files])], check=True)
    return list(vector_files) + ([b for _, b, _ in raster_files] if render else [])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--svg-only", action="store_true")
    args = parser.parse_args()
    files = build(render=not args.svg_only)
    print(f"Generated {len(files)} English-only v03 assets; historical files preserved.")
