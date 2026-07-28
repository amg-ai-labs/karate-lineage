#!/usr/bin/env python3
"""Headless smoke test: runs the built cladogram's app.js under JavaScriptCore
with a minimal DOM stub, asserting every interactive feature end to end.

  python3 pipeline/test/run_smoke.py     (from the repo root; needs macOS osascript)
"""
import json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
K = HERE.parent.parent
h = (K / "karate-cladogram.html").read_text(encoding="utf-8")
data = re.search(r'<script id="data" type="application/json">(.*?)</script>', h, re.S).group(1)
app = (K / "pipeline/viz/app.js").read_text(encoding="utf-8")
stub = (HERE / "dom_stub.js").read_text(encoding="utf-8").replace("__VIZ_DATA__", json.dumps(data))
run = HERE / "run.js"
run.write_text(stub + "\n" + app + "\n" + (HERE / "tail.js").read_text(encoding="utf-8"),
               encoding="utf-8")
out = subprocess.run(["osascript", "-l", "JavaScript", str(run)],
                     capture_output=True, text=True, timeout=600)
print(out.stdout.strip() or out.stderr.strip())
ok = "SMOKE OK" in (out.stdout + out.stderr)
run.unlink(missing_ok=True)
sys.exit(0 if ok else 1)
