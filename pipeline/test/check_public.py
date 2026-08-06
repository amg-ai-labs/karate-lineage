#!/usr/bin/env python3
"""Assert the PUBLISHED files carry no evidence layer.

The interface's curator mode is cosmetic — anyone can read a page's source — so
the guarantee has to hold in the payload itself. This checks the bytes that
actually go to GitHub Pages and Netlify.

  python3 pipeline/test/check_public.py
"""
import json, re, sys
from pathlib import Path

K = Path(__file__).resolve().parent.parent.parent
FORBIDDEN_FIELDS = {"edges": "evidence", "nodes": "wiki", "kata": "sources"}
fails = []

# docs/ is what GitHub Pages serves and must always be present. website/ is the
# same bytes kept on disk for a drag-and-drop host; it is gitignored, so it is
# absent from a fresh checkout and from CI, where demanding it fails the build
# for a file that was never meant to be committed.
REQUIRED = {"docs/index.html"}
for name in ("docs/index.html", "website/index.html"):
    f = K / name
    if not f.exists():
        if name in REQUIRED:
            fails.append(f"{name}: missing")
        else:
            print(f"{name}: absent (local mirror, not tracked)")
        continue
    h = f.read_text(encoding="utf-8")
    m = re.search(r'<script id="data" type="application/json">(.*?)</script>', h, re.S)
    if not m:
        fails.append(f"{name}: no data payload"); continue
    raw = m.group(1)
    d = json.loads(raw)
    for pat in ("http", "research:", "wikidata:", "book:Bishop", "source_hash"):
        n = len(re.findall(re.escape(pat), raw))
        if n:
            fails.append(f"{name}: payload contains {n}× {pat!r}")
    for coll, field in FORBIDDEN_FIELDS.items():
        n = sum(1 for r in d.get(coll, []) if field in r)
        if n:
            fails.append(f"{name}: {n} {coll} still carry {field!r}")
    if any("flags" in n for n in d.get("nodes", [])):
        fails.append(f"{name}: nodes carry internal review flags")
    for n in d.get("nodes", []):
        for hon in n.get("hon", []):
            if "—" in hon:
                fails.append(f"{name}: honour still cites its source: {hon!r}"); break
    # and the content must still be all there
    if len(d.get("nodes", [])) < 1000 or len(d.get("edges", [])) < 1300:
        fails.append(f"{name}: content looks truncated "
                     f"({len(d.get('nodes', []))} nodes, {len(d.get('edges', []))} edges)")
    if not fails:
        print(f"{name}: clean — {len(d['nodes'])} people, {len(d['edges'])} links, "
              f"{len(d['styles'])} styles, {len(d['kata'])} kata, no evidence layer")

# the curator's own copy must KEEP its evidence
cur = (K / "karate-cladogram.html").read_text(encoding="utf-8")
ev = len(re.findall("research:", cur))
if ev < 100:
    fails.append(f"curator file lost its evidence layer ({ev} citations)")
else:
    print(f"karate-cladogram.html: curator copy retains {ev} source citations")

# ---- the gated copy at /hutan ----
# It carries the curator payload over the public web, so the guarantee is the
# opposite one: the data must be present, and must be unreadable without the
# passphrase. Both halves are asserted, because either alone is worthless.
sys.path.insert(0, str(K / "pipeline" / "viz"))
import gate                                                          # noqa: E402

gated = K / "docs/hutan/index.html"
if not gate.KEYFILE.exists():
    print("docs/hutan: skipped (no pipeline/curator_key.txt on this machine)")
elif not gated.exists():
    fails.append("docs/hutan/index.html: missing, though a passphrase exists")
else:
    g = gated.read_text(encoding="utf-8")
    inline = re.search(r'<script id="data" type="application/json">(.*?)</script>', g, re.S)
    blob = re.search(r'<script id="blob" type="text/plain">(.*?)</script>', g, re.S)
    if not inline or inline.group(1).strip():
        fails.append("docs/hutan: the data element is not empty; the payload is in the clear")
    if not blob:
        fails.append("docs/hutan: no encrypted blob")
    else:
        try:
            plain = gate.decrypt(blob.group(1).strip(),
                                 gate.KEYFILE.read_text(encoding="utf-8").strip())
        except Exception as exc:                                     # noqa: BLE001
            fails.append(f"docs/hutan: the blob will not decrypt with the stored passphrase ({exc})")
            plain = b""
        if plain:
            d = json.loads(plain)
            citations = sum(len(e.get("evidence", [])) for e in d.get("edges", []))
            if citations < 100:
                fails.append(f"docs/hutan: decrypts, but has no evidence layer ({citations})")
            # and nothing of it may be legible in the page itself
            rest = g.replace(blob.group(1), "")
            leaked = [u for e in d["edges"] for u in e.get("evidence", [])
                      if u.startswith("http") and u in rest][:3]
            if leaked:
                fails.append(f"docs/hutan: source URLs readable outside the blob: {leaked}")
            if not fails:
                print(f"docs/hutan/index.html: {len(d['nodes'])} people and {citations} "
                      f"citations, encrypted; nothing legible in the page")

if fails:
    print("\nFAIL:"); [print("  " + x) for x in fails]; sys.exit(1)
print("\nPUBLIC BUILD CLEAN")
