#!/usr/bin/env python3
"""Package the current SciMemo visual system with the English-only v04 logo.

Run after the native Illustrator masters and exported review PDF are saved:
    python3 design/visual-system/source/package_system.py

Use --list to inspect the package contents without creating or replacing a ZIP.
Source scripts, historical versions, references and dependencies stay in the
workspace. The existing delivery ZIP is replaced atomically after validation.
"""
from __future__ import annotations

import argparse
import os
import tempfile
import zipfile
from pathlib import Path

SYSTEM = Path(__file__).resolve().parents[1]
DESIGN = SYSTEM.parent
LOGO = DESIGN / "logo"
OUTPUT = SYSTEM / "exports" / "scimemo-visual-system-v01.zip"
PACKAGE_ROOT = "SciMemo-Visual-System-v01"
LOGO_VERSION = "v04"

START_HERE = """SciMemo Visual System v01 / Logo v04

Open visual-system/source/scimemo-visual-system-master-v01.ai in Adobe Illustrator.
Open logo/source/scimemo-logo-master-v04.ai for the current English-only logo.
Review visual-system/exports/scimemo-visual-system-guide-v01.pdf first for the complete system.
The logo/exports/scimemo-ribbon-comparison-v04.png image shows the ribbon refinement.
Standalone SVG icons, illustrations, patterns, previews and theme tokens are in visual-system/exports.

Text in the vector masters is outlined. Editable board copy is preserved separately
in visual-system/source/board-copy.json.
The UI panels are design concepts; application code has not been changed.
Authoring scripts, references and historical files mentioned in the two README
documents remain in the workspace and are intentionally excluded from this delivery.
"""

AUTHORING_SUFFIXES = {".py", ".pyc", ".cjs", ".mjs", ".js", ".ts", ".tsx", ".jsx", ".sh"}
EXCLUDED_DIRECTORIES = {"archive", "references", "node_modules", "__pycache__", ".cache"}


def included_export(path: Path) -> bool:
    relative = path.relative_to(SYSTEM / "exports")
    return (
        path.is_file()
        and path.suffix.lower() not in {".zip", ".tmp"} | AUTHORING_SUFFIXES
        and "thumbnail" not in path.name.lower()
        and not any(part.startswith(".") or part in EXCLUDED_DIRECTORIES for part in relative.parts)
    )


def collect_files() -> list[tuple[Path, str]]:
    """Return an explicit source allowlist plus the current exported assets."""
    required = [
        LOGO / "README.md",
        LOGO / "source" / f"scimemo-logo-master-{LOGO_VERSION}.ai",
        LOGO / "source" / f"scimemo-logo-master-{LOGO_VERSION}.svg",
        LOGO / "source" / f"scimemo-icon-{LOGO_VERSION}.svg",
        SYSTEM / "README.md",
        SYSTEM / "source" / "scimemo-visual-system-master-v01.ai",
        SYSTEM / "source" / "scimemo-visual-system-master-v01.svg",
        SYSTEM / "source" / "board-copy.json",
        SYSTEM / "exports" / "scimemo-visual-system-guide-v01.pdf",
    ]
    logo_exports = sorted(
        path for path in (LOGO / "exports").iterdir()
        if path.is_file() and path.suffix.lower() in {".svg", ".png"}
        and path.stem.endswith(f"-{LOGO_VERSION}")
    )
    # These are required delivery assets, so an unfinished render cannot silently
    # produce a ZIP that appears complete but is missing one of the core lockups.
    required_logo_exports = {
        f"scimemo-icon-{LOGO_VERSION}.svg",
        f"scimemo-icon-1024-{LOGO_VERSION}.png",
        f"scimemo-icon-2048-{LOGO_VERSION}.png",
        f"scimemo-logo-preview-{LOGO_VERSION}.png",
        f"scimemo-ribbon-comparison-{LOGO_VERSION}.png",
        *(f"scimemo-{name}-{LOGO_VERSION}.{extension}"
          for name in ("wordmark", "logo-stacked", "logo-horizontal")
          for extension in ("svg", "png")),
    }
    missing = [str(path.relative_to(DESIGN)) for path in required
               if not path.is_file() or path.stat().st_size == 0]
    missing.extend(f"logo/exports/{name}" for name in
                   sorted(required_logo_exports - {path.name for path in logo_exports}))
    missing.extend(str(path.relative_to(DESIGN)) for path in logo_exports if path.stat().st_size == 0)
    if missing:
        raise RuntimeError("Delivery is incomplete. Missing or empty files:\n" + "\n".join(missing))

    source_allowlist = [path for path in required if path.parent.name != "exports"]
    exports = [path for path in (SYSTEM / "exports").rglob("*") if included_export(path)]
    paths = sorted(set(source_allowlist + logo_exports + exports), key=lambda p: p.relative_to(DESIGN).as_posix())
    return [(path, f"{PACKAGE_ROOT}/{path.relative_to(DESIGN).as_posix()}") for path in paths]


def package() -> Path:
    files = collect_files()
    before = {path: (path.stat().st_size, path.stat().st_mtime_ns) for path, _ in files}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=".scimemo-package-", suffix=".tmp", dir=OUTPUT.parent)
    os.close(handle)
    temporary = Path(temporary_name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr(f"{PACKAGE_ROOT}/START-HERE.txt", START_HERE)
            for path, destination in files:
                archive.write(path, destination)
        changed = [str(path.relative_to(DESIGN)) for path, _ in files
                   if not path.is_file() or (path.stat().st_size, path.stat().st_mtime_ns) != before[path]]
        if changed:
            raise RuntimeError("Files changed during packaging. Save them and run again:\n" + "\n".join(changed))
        with zipfile.ZipFile(temporary) as archive:
            failed = archive.testzip()
            if failed:
                raise RuntimeError(f"ZIP integrity check failed: {failed}")
            expected = {destination for _, destination in files} | {f"{PACKAGE_ROOT}/START-HERE.txt"}
            if set(archive.namelist()) != expected:
                raise RuntimeError("ZIP contents differ from the delivery manifest.")
        os.replace(temporary, OUTPUT)
    finally:
        if temporary.exists():
            temporary.unlink()
    print(f"Packaged {len(files) + 1} files with Logo {LOGO_VERSION}: {OUTPUT}")
    return OUTPUT


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="List delivery files without writing a ZIP.")
    args = parser.parse_args()
    if args.list:
        for _, destination in collect_files():
            print(destination)
        print(f"{PACKAGE_ROOT}/START-HERE.txt")
    else:
        package()
