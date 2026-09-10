#!/usr/bin/env python3
"""Bundle src/ into a single self-contained dist/index.html.

This is a deliberately minimal inliner, not a general bundler. It only
understands simple, static, single-line `import ... from "./x.js"` /
`export ...` statements from local files, concatenated in a module order
declared by hand below (MODULE_ORDER). It does not resolve imports, does
not support dynamic import(), multi-line import statements, or anything
CommonJS. The project uses none of that and never will, so this is
intentional scope, not an oversight.

Usage: python3 build.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

# Fixed dependency order: alphabets.js and scheduler.js import nothing;
# app.js is the entry point and imports from both of the others.
MODULE_ORDER = ["alphabets.js", "scheduler.js", "app.js"]

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

    DIST.mkdir(parents=True, exist_ok=True)
    out_path = DIST / "index.html"
    out_path.write_text(output, encoding="utf-8")

    size_kb = out_path.stat().st_size / 1024
    print(f"Wrote {out_path} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
