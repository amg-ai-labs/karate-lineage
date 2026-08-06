#!/usr/bin/env python3
"""Assert every internal link on the site resolves to a file that exists.

The three copies of the chart sit at three different depths relative to the
site's other pages: karate-cladogram.html is beside docs/, docs/index.html is
inside it, and docs/hutan/index.html is one level further down. They shared a
single set of relative hrefs, so the navigation worked from exactly one of them
and pointed at directories that do not exist from the other two. Nothing failed
loudly; the links simply led nowhere.

  python3 pipeline/test/check_links.py
"""
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

K = Path(__file__).resolve().parent.parent.parent

# every page that ships, and the directory its relative links resolve against
PAGES = [
    ("karate-cladogram.html", K),
    ("docs/index.html", K / "docs"),
    ("docs/hutan/index.html", K / "docs" / "hutan"),
    ("docs/history/index.html", K / "docs" / "history"),
    ("docs/about/index.html", K / "docs" / "about"),
    ("docs/contact/index.html", K / "docs" / "contact"),
]


def targets(html):
    """Internal href and src values, skipping anchors, external links and data."""
    for attr in ("href", "src"):
        for raw in re.findall(attr + r'="([^"]+)"', html):
            u = urlparse(raw)
            if u.scheme or u.netloc or raw.startswith("#") or raw.startswith("data:"):
                continue
            path = u.path
            if path:
                yield raw, path


def main():
    fails, checked = [], 0
    for name, base in PAGES:
        page = K / name
        if not page.exists():
            if name.startswith("docs/hutan") :
                print(f"{name}: absent (no passphrase on this machine)")
                continue
            fails.append(f"{name}: missing")
            continue
        html = page.read_text(encoding="utf-8")
        for raw, path in targets(html):
            resolved = (base / path).resolve()
            if resolved.is_dir():
                resolved = resolved / "index.html"
            checked += 1
            if not resolved.exists():
                fails.append(f"{name}: {raw!r} leads nowhere ({resolved})")

    # and the curator copy must not advertise itself from a public page
    for name in ("docs/index.html", "docs/history/index.html",
                 "docs/about/index.html", "docs/contact/index.html"):
        p = K / name
        if p.exists() and re.search(r'href="[^"]*hutan/', p.read_text(encoding="utf-8")):
            fails.append(f"{name}: links to the curator copy, which must stay unadvertised")

    if fails:
        print("FAIL:")
        for f in fails:
            print("  " + f)
        return 1
    print(f"links resolve: {checked} internal targets across {len(PAGES)} pages, "
          f"and no public page advertises /hutan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
