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

for name in ("docs/index.html", "website/index.html"):
    f = K / name
    if not f.exists():
        fails.append(f"{name}: missing"); continue
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

if fails:
    print("\nFAIL:"); [print("  " + x) for x in fails]; sys.exit(1)
print("\nPUBLIC BUILD CLEAN")
