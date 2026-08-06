#!/usr/bin/env python3
"""One-command rebuild: clean the data, then regenerate the cladogram.

    cd pipeline && python3 build.py
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# order matters: clean writes lineage.json, rankings reads it and writes the
# figures the site embeds, so rankings must run before the viz is rendered
STEPS = [
    (HERE / "clean.py", []),
    (HERE / "analysis" / "rankings.py", ["--json", "--csv"]),
    (HERE / "viz" / "build_viz.py", []),
    (HERE / "master.py", []),
    (HERE / "site.py", []),
]
for script, args in STEPS:
    r = subprocess.run([sys.executable, str(script)] + args)
    if r.returncode:
        sys.exit(f"FAILED at {script.name}")
print("\nDone. Open karate-cladogram.html (next to nodes.csv) in a browser.")
