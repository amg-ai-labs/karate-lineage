#!/usr/bin/env python3
"""Boot every dangerous payload shape and assert the chart still renders.

The published build strips fields the curator build has (evidence, wiki, flags,
source_hash). Code that assumes a stripped field is present throws during init
and the chart never draws — a blank page for the reader. This shipped once: the
footer did `DATA.meta.source_hash.slice(0,8)` whenever curator mode was on, and
the public payload has no source_hash, so anyone whose browser had curator mode
enabled got a blank chart.

The nasty shape is not "public build" or "curator build" but the MIXTURE:
curator mode ON while a curator-only field is absent. So each field is stripped
in turn from a payload that still looks like a curator build.

  python3 pipeline/test/check_both_builds.py
"""
import json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
K = HERE.parent.parent
app = (K / "pipeline/viz/app.js").read_text(encoding="utf-8")
stub_src = (HERE / "dom_stub.js").read_text(encoding="utf-8")


def payload(f):
    h = f.read_text(encoding="utf-8")
    return json.loads(re.search(r'<script id="data" type="application/json">(.*?)</script>',
                                h, re.S).group(1))


def boot(pl, label, fails):
    stub = stub_src.replace("__VIZ_DATA__", json.dumps(json.dumps(pl, ensure_ascii=False)))
    tail = ("try {\n"
            "  document.getElementById('stamp').textContent;\n"
            "  var __imgs = exportFormats([['a','svg'],['b','png4'],['c','tiff'],['d','csv']]);\n"
            "  console.log('RENDERED ' + nodeEls.size + ' nodes, curator=' + curator()\n"
            "    + ', images=' + canExportImages() + ', formats=' + __imgs.length);\n"
            "} catch (e) { console.log('THREW: ' + e); }")
    run = HERE / "_both.js"
    run.write_text(stub + "\n" + app + "\n" + tail, encoding="utf-8")
    r = subprocess.run(["osascript", "-l", "JavaScript", str(run)],
                       capture_output=True, text=True, timeout=600)
    out = ((r.stdout or "") + (r.stderr or "")).strip()
    run.unlink(missing_ok=True)
    m = re.search(r"RENDERED (\d+) nodes, curator=(\w+), images=(\w+), formats=(\d+)", out)
    if not m or int(m.group(1)) == 0 or "THREW" in out:
        fails.append(f"{label}: {out[-260:]}")
        print(f"  {label}: FAILED")
    else:
        print(f"  {label}: {m.group(1)} nodes rendered, curator={m.group(2)}, "
              f"image export={m.group(3)} ({m.group(4)} of 4 formats offered)")
        # The published copy offers no export at all, figure or data. It used to
        # keep the data formats; the client's instruction is that output is the
        # curator's alone, so the expected count here is zero, not one.
        if m.group(2) == "false" and (m.group(3) != "false" or m.group(4) != "0"):
            fails.append(f"{label}: public build still offers an export "
                         f"(images={m.group(3)}, formats={m.group(4)})")
            print(f"  FAIL: {label} is public but still offers an export")


fails = []
cur = payload(K / "karate-cladogram.html")
pub = payload(K / "docs/index.html")

print("the two builds as shipped:")
boot(cur, "curator build", fails)
boot(pub, "public build", fails)

print("\ncurator mode ON with each curator-only field stripped (the shape that shipped broken):")
# keep one evidence array so the page believes it is the curator copy...
def curator_like(mut):
    p = json.loads(json.dumps(pub))
    p["edges"][0]["evidence"] = ["research:https://example.org"]   # curator() -> true
    mut(p)
    return p

def strip_meta(p): p["meta"].pop("source_hash", None)
def strip_wiki(p): [n.pop("wiki", None) for n in p["nodes"]]
def strip_flags(p): [n.pop("flags", None) for n in p["nodes"]]
def strip_katasrc(p): [k.pop("sources", None) for k in p["kata"]]
def strip_all_ev(p): [e.pop("evidence", None) for e in p["edges"][1:]]

for name, mut in (("no meta.source_hash", strip_meta), ("no node.wiki", strip_wiki),
                  ("no node.flags", strip_flags), ("no kata.sources", strip_katasrc),
                  ("only one edge has evidence", strip_all_ev)):
    boot(curator_like(mut), name, fails)

if fails:
    print("\nFAIL:"); [print("  " + x) for x in fails]; sys.exit(1)
print("\nALL PAYLOAD SHAPES RENDER")
