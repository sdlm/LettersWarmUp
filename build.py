#!/usr/bin/env python3
"""Bundle src/ into a single self-contained dist/index.html.

Also copies the PWA files (web manifest, icons) next to it and writes
dist/sw.js with a cache version derived from the contents of dist/.
dist/index.html alone still works when opened over file://; the PWA
files only matter when the folder is served over http(s).

This is a deliberately minimal inliner, not a general bundler. It only
understands simple, static, single-line `import ... from "./x.js"` /
`export ...` statements from local files, concatenated in a module order
declared by hand below (MODULE_ORDER). It does not resolve imports, does
not support dynamic import(), multi-line import statements, or anything
CommonJS. The project uses none of that and never will, so this is
intentional scope, not an oversight.

Usage: python3 build.py
"""

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

# Fixed dependency order: alphabets.js and scheduler.js import nothing;
# app.js is the entry point and imports from both of the others.
MODULE_ORDER = ["alphabets.js", "scheduler.js", "app.js"]

# Static files copied verbatim into dist/ next to index.html.
STATIC_ASSETS = [
    SRC / "manifest.webmanifest",
    SRC / "icons" / "icon-192.png",
    SRC / "icons" / "icon-512.png",
    SRC / "icons" / "apple-touch-icon.png",
]

MANIFEST_LINK = '<link rel="manifest"'

STYLESHEET_LINE = '<link rel="stylesheet" href="styles.css">'
SCRIPT_LINE = '<script type="module" src="app.js"></script>'

# Matches "import" / "export" / "require" as whole words (not as a
# substring of a longer identifier like "exportable"). This is a simple
# heuristic, not a JS parser: it would false-positive on those words
# appearing as whole words inside a string literal or comment. We accept
# that tradeoff deliberately — a correct-but-blunt check beats a clever
# one we can't fully trust, and we control the source files here, none of
# which contain "import"/"export"/"require" as English words in comments
# or strings.
LEFTOVER_TOKEN_RE = re.compile(r"\b(import|export|require)\b")


# Service worker support. src/sw.js carries a placeholder for the cache
# version and the list of app-shell URLs; the build fills in the version
# and uses the same list to verify every precached file exists in dist/.
# Every double-quoted "./..." literal anywhere in src/sw.js counts as a
# precached shell file (single-quoted ones are not seen), so sw.js must not
# contain such strings elsewhere.
CACHE_VERSION_PLACEHOLDER = "__CACHE_VERSION__"
SHELL_PATH_RE = re.compile(r'"(\./[^"]*)"')


def shell_files(sw_source: str) -> list[str]:
    """Return the "./..." string literals in sw_source, in order."""
    return SHELL_PATH_RE.findall(sw_source)


def cache_version(paths: list[Path]) -> str:
    """Hash file names and contents into a short, order-independent id."""
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda p: p.name):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:12]


def render_sw(sw_source: str, version: str) -> str:
    count = sw_source.count(CACHE_VERSION_PLACEHOLDER)
    if count != 1:
        raise SystemExit(
            f"build.py: src/sw.js must contain the placeholder "
            f"{CACHE_VERSION_PLACEHOLDER!r} exactly once, found {count}. "
            f"Refusing to write a dist/sw.js that never invalidates its cache."
        )
    return sw_source.replace(CACHE_VERSION_PLACEHOLDER, version)


def bundle_js() -> str:
    parts = []
    for name in MODULE_ORDER:
        text = (SRC / name).read_text(encoding="utf-8")
        kept_lines = []
        for lineno, line in enumerate(text.splitlines(), start=1):
            if line.startswith("import "):
                # A single-line `import ... from "./x.js"` always carries
                # its `from "` / `from '` clause on this same line. If it
                # doesn't, this is the first line of a multi-line import,
                # which this inliner's "single-line imports only" limit
                # (see module docstring) does not support — the remaining
                # lines of such an import (e.g. `} from "./x.js";`) don't
                # start with "import " and would otherwise slip through as
                # broken leftover JS with no import/export/require token
                # for the later bundle-wide check to catch.
                if 'from "' not in line and "from '" not in line:
                    raise SystemExit(
                        f"build.py: src/{name}:{lineno} looks like the "
                        f"start of a multi-line import, which this "
                        f"inliner doesn't support (see the "
                        f"'single-line imports only' limitation in "
                        f"build.py's module docstring): {line!r}. "
                        f"Refusing to write a broken dist/index.html."
                    )
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            kept_lines.append(line)
        parts.append("\n".join(kept_lines))
    return "\n".join(parts)


def main() -> None:
    template = (SRC / "index.html").read_text(encoding="utf-8")

    if STYLESHEET_LINE not in template:
        raise SystemExit(
            f"build.py: could not find the stylesheet anchor line in "
            f"src/index.html: {STYLESHEET_LINE!r}. The template may have "
            f"changed — refusing to build a possibly-broken dist/index.html."
        )
    if SCRIPT_LINE not in template:
        raise SystemExit(
            f"build.py: could not find the script anchor line in "
            f"src/index.html: {SCRIPT_LINE!r}. The template may have "
            f"changed — refusing to build a possibly-broken dist/index.html."
        )

    css = (SRC / "styles.css").read_text(encoding="utf-8")
    js = bundle_js()

    leftover = LEFTOVER_TOKEN_RE.search(js)
    if leftover:
        raise SystemExit(
            f"build.py: bundled JS still contains an "
            f"import/export/require token ({leftover.group(0)!r} at "
            f"offset {leftover.start()}) after stripping module syntax. "
            f"A module in src/ likely uses a form this simple inliner "
            f"doesn't handle (e.g. a multi-line import). Refusing to "
            f"write a broken dist/index.html."
        )
    if "</script>" in js:
        raise SystemExit(
            "build.py: bundled JS contains the literal string '</script>', "
            "which would terminate the inline <script> tag early. Refusing "
            "to write a broken dist/index.html."
        )

    output = template.replace(
        STYLESHEET_LINE, f"<style>\n{css}\n</style>"
    ).replace(
        SCRIPT_LINE, f"<script>\n{js}\n</script>"
    )

    if MANIFEST_LINK not in output:
        raise SystemExit(
            f"build.py: built index.html has no {MANIFEST_LINK!r} tag. "
            f"src/index.html must link the web manifest, otherwise the "
            f"app can't be installed. Refusing to build."
        )

    DIST.mkdir(parents=True, exist_ok=True)
    out_path = DIST / "index.html"
    out_path.write_text(output, encoding="utf-8")

    size_kb = out_path.stat().st_size / 1024
    print(f"Wrote {out_path} ({size_kb:.1f} KB)")

    build_pwa_files(out_path)


def build_pwa_files(index_path: Path) -> None:
    copied = []
    for asset in STATIC_ASSETS:
        if not asset.is_file():
            raise SystemExit(
                f"build.py: missing PWA asset {asset.relative_to(ROOT)}. "
                f"Icons are generated by `swift tools/make_icons.swift`."
            )
        target = DIST / asset.name
        target.write_bytes(asset.read_bytes())
        copied.append(target)

    sw_source = (SRC / "sw.js").read_text(encoding="utf-8")
    for url in shell_files(sw_source):
        if url == "./":
            continue
        if not (DIST / url[len("./"):]).is_file():
            raise SystemExit(
                f"build.py: src/sw.js precaches {url!r}, but dist/ has no "
                f"such file. The offline app would fail to install. "
                f"Refusing to build."
            )

    version = cache_version([index_path, *copied])
    sw_path = DIST / "sw.js"
    sw_path.write_text(render_sw(sw_source, version), encoding="utf-8")
    print(f"Wrote {sw_path} (cache {version}) and {len(copied)} assets")


if __name__ == "__main__":
    main()
