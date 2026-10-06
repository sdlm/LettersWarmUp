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
