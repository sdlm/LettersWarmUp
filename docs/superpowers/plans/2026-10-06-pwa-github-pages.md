# PWA и GitHub Pages — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение устанавливается на телефон с `https://sdlm.github.io/LettersWarmUp/` и работает без сети, а `dist/index.html` по `file://` работает как раньше.

**Architecture:** Один `dist/index.html` плюс манифест, service worker и иконки рядом. PWA-части включаются только по `http(s)`. `build.py` копирует ассеты, генерирует `sw.js` с хешем содержимого в имени кеша и проверяет согласованность. GitHub Actions выкладывает закоммиченный `dist/` на Pages.

**Tech Stack:** ванильный JS (ES-модули в `src/`, инлайнятся в один файл), Python 3.11+ stdlib для сборки и её тестов (`unittest`), Swift/AppKit для разовой генерации иконок, GitHub Actions + Pages.

**Спека:** `docs/superpowers/specs/2026-10-06-pwa-github-pages-design.md`

---

## Важные особенности проекта (прочитать до начала)

- **Бандлер в `build.py` примитивный.** Он склеивает `src/alphabets.js`, `src/scheduler.js`, `src/app.js` и затем падает, если в результате встречаются слова `import`, `export` или `require` целиком (регулярка `\b(import|export|require)\b`), в том числе **в комментариях и строках**. Новый код в `src/app.js` не должен содержать этих слов нигде. Также запрещена подстрока `</script>`.
- `src/sw.js` в бандл **не** входит — это отдельный файл, на него ограничение не распространяется.
- JS-тесты запускаются строго как `node --test` из корня, без аргументов (на новом Node `node --test tests/` ломается).
- Python-тесты сборки — `python3 -m unittest discover -s tests -p 'test_*.py'`. `node --test` их не подхватывает (он ищет только `.js`).
- `dist/` коммитится. После любой правки в `src/` нужно запустить `python3 build.py` и закоммитить `dist/` вместе с исходниками.
- В репозитории нет зависимостей и их не должно появиться.
- Сообщения коммитов в стиле репозитория: повелительное наклонение на английском, без префиксов вроде `feat:`. Каждый коммит заканчивается строкой
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (через пустую строку).

## Файлы

| Файл | Что делает |
|---|---|
| `build.py` | + три чистые функции (`shell_files`, `cache_version`, `render_sw`), копирование ассетов, генерация `dist/sw.js`, новые проверки |
| `tests/test_build.py` | новый, `unittest` для трёх функций |
| `src/sw.js` | новый, service worker с плейсхолдером `__CACHE_VERSION__` и списком оболочки |
| `src/manifest.webmanifest` | новый |
| `src/index.html` | + мета-теги и ссылки в `<head>` |
| `src/app.js` | + регистрация SW, Wake Lock, обновление `theme-color` |
| `tools/make_icons.swift` | новый, разовый генератор PNG |
| `src/icons/*.png` | новые, коммитятся |
| `.github/workflows/pages.yml` | новый, деплой `dist/` |
| `docs/superpowers/specs/2026-09-10-letters-warmup-design.md` | + раздел ручной проверки PWA |

---

### Task 1: Чистые функции сборки для service worker

**Files:**
- Create: `tests/test_build.py`
- Modify: `build.py` (добавить импорт `hashlib`, константы и три функции перед `def main()`)

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/test_build.py`:

```python
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import build  # noqa: E402


SW_SAMPLE = '''const CACHE_VERSION = "__CACHE_VERSION__";
const SHELL = [
  "./",
  "./index.html",
  "./icon-192.png",
];
'''


class ShellFilesTest(unittest.TestCase):
    def test_extracts_quoted_relative_paths_in_order(self):
        self.assertEqual(
            build.shell_files(SW_SAMPLE),
            ["./", "./index.html", "./icon-192.png"],
        )

    def test_ignores_non_relative_strings(self):
        self.assertEqual(build.shell_files('const A = "abc";\n'), [])


class CacheVersionTest(unittest.TestCase):
    def _write(self, directory, name, content):
        path = Path(directory) / name
        path.write_bytes(content)
        return path

    def test_is_12_hex_chars(self):
        with tempfile.TemporaryDirectory() as d:
            a = self._write(d, "a.txt", b"one")
            version = build.cache_version([a])
        self.assertRegex(version, r"^[0-9a-f]{12}$")

    def test_does_not_depend_on_argument_order(self):
        with tempfile.TemporaryDirectory() as d:
            a = self._write(d, "a.txt", b"one")
            b = self._write(d, "b.txt", b"two")
            self.assertEqual(build.cache_version([a, b]), build.cache_version([b, a]))

    def test_changes_when_content_changes(self):
        with tempfile.TemporaryDirectory() as d:
            a = self._write(d, "a.txt", b"one")
            before = build.cache_version([a])
            a.write_bytes(b"two")
            after = build.cache_version([a])
        self.assertNotEqual(before, after)

    def test_changes_when_file_is_renamed(self):
        with tempfile.TemporaryDirectory() as d:
            a = self._write(d, "a.txt", b"same")
            b = self._write(d, "b.txt", b"same")
            self.assertNotEqual(build.cache_version([a]), build.cache_version([b]))


class RenderSwTest(unittest.TestCase):
    def test_substitutes_placeholder(self):
        rendered = build.render_sw(SW_SAMPLE, "abc123def456")
        self.assertIn('const CACHE_VERSION = "abc123def456";', rendered)
        self.assertNotIn("__CACHE_VERSION__", rendered)

    def test_rejects_missing_placeholder(self):
        with self.assertRaises(SystemExit):
            build.render_sw("const CACHE_VERSION = 1;\n", "abc123def456")

    def test_rejects_duplicate_placeholder(self):
        with self.assertRaises(SystemExit):
            build.render_sw("__CACHE_VERSION__ __CACHE_VERSION__", "abc123def456")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `python3 -m unittest discover -s tests -p 'test_*.py' -v`
Expected: ошибки `AttributeError: module 'build' has no attribute 'shell_files'` (и аналогичные для `cache_version`, `render_sw`).

- [ ] **Step 3: Реализовать функции**

В `build.py` заменить блок импортов

```python
import re
from pathlib import Path
```

на

```python
import hashlib
import re
from pathlib import Path
```

Сразу после строки `LEFTOVER_TOKEN_RE = re.compile(r"\b(import|export|require)\b")` добавить:

```python


# Service worker support. src/sw.js carries a placeholder for the cache
# version and the list of app-shell URLs; the build fills in the version
# and uses the same list to verify every precached file exists in dist/.
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
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `python3 -m unittest discover -s tests -p 'test_*.py' -v`
Expected: `Ran 9 tests ... OK`

Run: `node --test`
Expected: все прежние тесты зелёные (20 тестов, `fail 0`).

- [ ] **Step 5: Commit**

```bash
git add build.py tests/test_build.py
git commit -m "Add build helpers for the service worker cache version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Service worker, манифест и разметка

**Files:**
- Create: `src/sw.js`
- Create: `src/manifest.webmanifest`
- Modify: `src/index.html` (блок `<head>`)

- [ ] **Step 1: Создать `src/sw.js`**

```js
// Service worker for the installed (PWA) version of LettersWarmUp.
// Cache-first for the whole app shell: the app makes no network requests
// of its own, so after the first visit everything is served offline.
// build.py replaces the version placeholder with a hash of dist/ contents,
// so every rebuild that changes a file gets a fresh cache.

const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_PREFIX = "letters-warmup-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    caches
      .match(event.request, { ignoreSearch: true })
      .then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 2: Создать `src/manifest.webmanifest`**

```json
{
  "name": "Алфавит",
  "short_name": "Алфавит",
  "lang": "ru",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: Дополнить `<head>` в `src/index.html`**

Заменить

```html
<title>Алфавит</title>
<link rel="stylesheet" href="styles.css">
```

на

```html
<title>Алфавит</title>
<meta name="theme-color" content="#ffffff">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Алфавит">
<link rel="stylesheet" href="styles.css">
```

Строку `<link rel="stylesheet" href="styles.css">` не трогать — это якорь для `build.py`.

- [ ] **Step 4: Проверить, что манифест — валидный JSON и сборка не сломалась**

Run: `python3 -c "import json; print(json.load(open('src/manifest.webmanifest'))['name'])"`
Expected: `Алфавит`

Run: `python3 build.py`
Expected: `Wrote .../dist/index.html (... KB)` без ошибок. (`dist/` на этом шаге не коммитим — он будет пересобран в Task 4.)

Run: `git checkout dist/index.html`

- [ ] **Step 5: Commit**

```bash
git add src/sw.js src/manifest.webmanifest src/index.html
git commit -m "Add service worker, web manifest, and PWA head tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Иконки

**Files:**
- Create: `tools/make_icons.swift`
- Create: `src/icons/icon-192.png`, `src/icons/icon-512.png`, `src/icons/apple-touch-icon.png`

Стиль иконки следует монохромной палитре приложения (`--fg: #111111`): белые «Аа» на почти чёрном сплошном фоне.

- [ ] **Step 1: Создать `tools/make_icons.swift`**

```swift
// One-off icon generator for the PWA manifest and the iOS home screen.
// Not part of the build: run it by hand from the repository root when the
// icon should change, then commit the PNGs in src/icons/.
//
//   swift tools/make_icons.swift

import AppKit

let background = NSColor(srgbRed: 0x11 / 255.0, green: 0x11 / 255.0, blue: 0x11 / 255.0, alpha: 1)
let foreground = NSColor.white
let label = "Аа"

let outputs: [(size: Int, name: String)] = [
    (192, "icon-192.png"),
    (512, "icon-512.png"),
    (180, "apple-touch-icon.png"),
]

func render(size: Int) -> Data {
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fatalError("make_icons: could not allocate a \(size)px bitmap")
    }
    let side = CGFloat(size)
    rep.size = NSSize(width: side, height: side)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    background.setFill()
    NSRect(x: 0, y: 0, width: side, height: side).fill()

    let font = NSFont.systemFont(ofSize: side * 0.42, weight: .heavy)
    let text = NSAttributedString(
        string: label,
        attributes: [.font: font, .foregroundColor: foreground]
    )
    let textSize = text.size()
    text.draw(at: NSPoint(x: (side - textSize.width) / 2, y: (side - textSize.height) / 2))

    NSGraphicsContext.restoreGraphicsState()

    guard let png = rep.representation(using: .png, properties: [:]) else {
        fatalError("make_icons: could not encode a \(size)px PNG")
    }
    return png
}

let directory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    .appendingPathComponent("src/icons")
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

for output in outputs {
    let url = directory.appendingPathComponent(output.name)
    try render(size: output.size).write(to: url)
    print("Wrote \(url.path) (\(output.size)x\(output.size))")
}
```

- [ ] **Step 2: Сгенерировать иконки**

Run: `swift tools/make_icons.swift`
Expected: три строки `Wrote .../src/icons/<name> (NxN)`.

- [ ] **Step 3: Проверить размеры и внешний вид**

Run: `sips -g pixelWidth -g pixelHeight src/icons/*.png`
Expected: 192×192, 512×512, 180×180.

Открыть `src/icons/icon-512.png` (Read-инструментом или в Preview) и убедиться: белые «Аа» читаются, примерно по центру, не обрезаны, фон сплошной без прозрачных углов. Если текст заметно смещён по вертикали или обрезан — подправить множитель `0.42` или вертикальное смещение в скрипте и перегенерировать.

- [ ] **Step 4: Commit**

```bash
git add tools/make_icons.swift src/icons/
git commit -m "Add app icons and the script that draws them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Сборка ассетов и `sw.js` в `build.py`

**Files:**
- Modify: `build.py` (константы рядом с `MODULE_ORDER`, хвост `main()`, docstring модуля)

- [ ] **Step 1: Добавить константы**

После строки `MODULE_ORDER = ["alphabets.js", "scheduler.js", "app.js"]` добавить:

```python

# Static files copied verbatim into dist/ next to index.html.
STATIC_ASSETS = [
    SRC / "manifest.webmanifest",
    SRC / "icons" / "icon-192.png",
    SRC / "icons" / "icon-512.png",
    SRC / "icons" / "apple-touch-icon.png",
]

MANIFEST_LINK = '<link rel="manifest"'
```

- [ ] **Step 2: Дописать `main()`**

Заменить хвост `main()`

```python
    DIST.mkdir(parents=True, exist_ok=True)
    out_path = DIST / "index.html"
    out_path.write_text(output, encoding="utf-8")

    size_kb = out_path.stat().st_size / 1024
    print(f"Wrote {out_path} ({size_kb:.1f} KB)")
```

на

```python
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
```

Порядок важен: ассеты копируются до проверки списка оболочки, а хеш считается по уже записанным в `dist/` файлам.

- [ ] **Step 3: Обновить docstring модуля**

Первую строку docstring

```python
"""Bundle src/ into a single self-contained dist/index.html.
```

заменить на

```python
"""Bundle src/ into a single self-contained dist/index.html.

Also copies the PWA files (web manifest, icons) next to it and writes
dist/sw.js with a cache version derived from the contents of dist/.
dist/index.html alone still works when opened over file://; the PWA
files only matter when the folder is served over http(s).
```

- [ ] **Step 4: Собрать и проверить результат**

Run: `python3 build.py`
Expected:
```
Wrote .../dist/index.html (... KB)
Wrote .../dist/sw.js (cache <12 hex>) and 4 assets
```

Run: `ls dist`
Expected: `apple-touch-icon.png  icon-192.png  icon-512.png  index.html  manifest.webmanifest  sw.js`

Run: `grep -c __CACHE_VERSION__ dist/sw.js`
Expected: `0`

Run: `python3 build.py | tail -1` дважды подряд
Expected: одинаковый `cache <hash>` оба раза (сборка детерминирована).

- [ ] **Step 5: Проверить, что защиты срабатывают**

Run: `mv src/icons/icon-192.png /tmp/icon-192.png; python3 build.py; echo "exit=$?"; mv /tmp/icon-192.png src/icons/icon-192.png`
Expected: сообщение `missing PWA asset src/icons/icon-192.png` и `exit=1`.

Run: `python3 -m unittest discover -s tests -p 'test_*.py' && node --test`
Expected: оба набора зелёные.

- [ ] **Step 6: Пересобрать и закоммитить**

Run: `python3 build.py`

```bash
git add build.py dist/
git commit -m "Build the manifest, icons, and service worker into dist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: PWA-поведение в `app.js`

**Files:**
- Modify: `src/app.js` (константы вверху, `applyTheme`, новые функции перед `init`, конец `init`)

Помнить: в новом коде (включая комментарии) не должно быть слов `import`, `export`, `require`.

- [ ] **Step 1: Константы цветов панели**

После строки `const TIMER_TICK_MS = 250;` добавить:

```js
// Mirrors --bg in styles.css; used for the system bar of the installed app.
const THEME_COLORS = { light: "#ffffff", dark: "#0b0b0b" };
```

- [ ] **Step 2: Обновлять `theme-color` в `applyTheme`**

Заменить

```js
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  elements.themeToggle.textContent = theme === "dark" ? "☾" : "☼";
}
```

на

```js
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  elements.themeToggle.textContent = theme === "dark" ? "☾" : "☼";
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", THEME_COLORS[theme]);
  }
}
```

- [ ] **Step 3: Регистрация SW и Wake Lock**

Перед строкой `function init() {` добавить:

```js
function registerServiceWorker() {
  // Over file:// there is nothing to register; the single-file app works as is.
  const servedOverHttp = location.protocol === "http:" || location.protocol === "https:";
  if (!servedOverHttp || !("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register("sw.js").catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}

function keepScreenAwake() {
  if (!("wakeLock" in navigator)) {
    return;
  }
  const acquire = () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    navigator.wakeLock.request("screen").catch(() => {
      // Denied (low battery, insecure context, policy) — the screen may dim.
    });
  };
  // The browser drops the lock whenever the page is hidden; take it again on return.
  document.addEventListener("visibilitychange", acquire);
  acquire();
}

```

- [ ] **Step 4: Вызвать их из `init`**

Заменить конец `init()`

```js
  showNextLetter();
  setInterval(updateTimerDisplay, TIMER_TICK_MS);
}
```

на

```js
  showNextLetter();
  setInterval(updateTimerDisplay, TIMER_TICK_MS);

  registerServiceWorker();
  keepScreenAwake();
}
```

- [ ] **Step 5: Собрать и прогнать тесты**

Run: `python3 build.py`
Expected: обе строки `Wrote ...` без ошибок. Если сборка падает на `import/export/require token` — в новом коде есть запрещённое слово, переформулировать.

Run: `node --test && python3 -m unittest discover -s tests -p 'test_*.py'`
Expected: всё зелёное.

Run: `grep -c 'serviceWorker.register' dist/index.html`
Expected: `1`

- [ ] **Step 6: Commit**

```bash
git add src/app.js dist/
git commit -m "Register the service worker, keep the screen awake, sync theme-color

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Локальная проверка по HTTP

**Files:** нет изменений, только проверка.

- [ ] **Step 1: Поднять сервер в фоне**

Run (в фоне): `python3 -m http.server 8765 -d dist`

- [ ] **Step 2: Проверить, что всё отдаётся**

Run:
```bash
for f in "" index.html manifest.webmanifest sw.js icon-192.png icon-512.png apple-touch-icon.png; do
  printf '%-24s ' "/$f"; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "http://localhost:8765/$f"
done
```
Expected: все `200`; `sw.js` — `text/javascript` (или `application/javascript`), PNG — `image/png`.

- [ ] **Step 3: Проверить в браузере (если доступен headless Chrome)**

Run: `ls "/Applications/Google Chrome.app" 2>/dev/null && echo has-chrome`

Если Chrome есть, открыть `http://localhost:8765/` и в DevTools → Application проверить: Manifest распознан без ошибок, Service worker в статусе activated, в Cache Storage кеш `letters-warmup-<hash>` с шестью записями; в Network включить Offline, перезагрузить — приложение работает. Если среда агента не позволяет взаимодействовать с браузером, отметить шаг как невыполненный и передать проверку на Task 7 (живой URL) и на ручной чек-лист — **не** сообщать, что офлайн проверен.

- [ ] **Step 4: Проверить `file://`**

Убедиться, что `dist/index.html` в Chrome/Safari по `file://` показывает букву, таймер идёт, кнопки работают. (В консоли допустимо одно предупреждение про недоступный манифест.)

- [ ] **Step 5: Остановить сервер**

---

### Task 7: Деплой на GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Создать workflow**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Включить Pages с источником GitHub Actions**

Run: `gh api -X POST repos/sdlm/LettersWarmUp/pages -f build_type=workflow`
Expected: JSON с `"build_type": "workflow"` и `"html_url": "https://sdlm.github.io/LettersWarmUp/"`. Если ответ `409` (Pages уже включён) — выполнить `gh api -X PUT repos/sdlm/LettersWarmUp/pages -f build_type=workflow`.

- [ ] **Step 3: Commit и push**

```bash
git add .github/workflows/pages.yml
git commit -m "Deploy dist to GitHub Pages on push to main

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 4: Дождаться деплоя**

Run: `gh run watch $(gh run list --workflow pages.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status`
Expected: run завершился успешно. При ошибке — `gh run view --log-failed` и разбираться, не продолжать.

- [ ] **Step 5: Проверить живой сайт**

Run:
```bash
for f in "" manifest.webmanifest sw.js icon-192.png icon-512.png apple-touch-icon.png; do
  printf '%-24s ' "/$f"; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "https://sdlm.github.io/LettersWarmUp/$f"
done
curl -s https://sdlm.github.io/LettersWarmUp/sw.js | grep 'const CACHE_VERSION'
grep 'const CACHE_VERSION' dist/sw.js
```
Expected: все `200`; версия кеша на сайте совпадает с локальной.

---

### Task 8: Документация

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-letters-warmup-design.md` (конец раздела `### Ручная проверка UI`, перед `## Что сознательно не делаем (YAGNI)`)
- Modify: `docs/pwa-and-github-pages.md` (строка статуса)

- [ ] **Step 1: Дополнить ручной чек-лист основной спеки**

Перед строкой `## Что сознательно не делаем (YAGNI)` вставить:

```markdown
### Ручная проверка PWA

Адрес: `https://sdlm.github.io/LettersWarmUp/`. Подробности — в
`docs/superpowers/specs/2026-10-06-pwa-github-pages-design.md`.

- Android/Chrome: «Установить приложение», иконка на главном экране;
- iOS/Safari: «Поделиться → На экран Домой», иконка не пустая;
- запуск с иконки — без адресной строки;
- самолётный режим, запуск с иконки — работает;
- экран не гаснет больше минуты без касаний;
- переключение темы меняет цвет системной панели (Android);
- тема и алфавит переживают перезапуск;
- после деплоя новой версии: первое открытие может показать старую, со
  следующего запуска — новая.

```

- [ ] **Step 2: Обновить статус намерения**

В `docs/pwa-and-github-pages.md` заменить строку, начинающуюся с `**Статус:**`, на

```markdown
**Статус:** реализовано, см. `docs/superpowers/specs/2026-10-06-pwa-github-pages-design.md`. Дальше — исходное намерение, сохранено как история.
```

и удалить следующие за ней две строки продолжения абзаца (`обычный цикл: дизайн → план → код, …` и `(см. в конце) и как минимум одно …`), чтобы абзац не обрывался на середине. Проверить: `sed -n 1,8p docs/pwa-and-github-pages.md` — статус одной цельной фразой, дальше пустая строка и `Дата фиксации`.

- [ ] **Step 3: Commit и push**

```bash
git add docs/superpowers/specs/2026-09-10-letters-warmup-design.md docs/pwa-and-github-pages.md
git commit -m "Document PWA manual checks and mark the intent as done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

Push снова запустит деплой; `dist/` не менялся, так что сайт останется прежним.
