#!/usr/bin/env python3
"""One-command rebuild: clean the data, then regenerate the cladogram.

    cd pipeline && python3 build.py
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for script in [HERE / "clean.py", HERE / "viz" / "build_viz.py"]:
    r = subprocess.run([sys.executable, str(script)])
    if r.returncode:
        sys.exit(f"FAILED at {script.name}")
print("\nDone. Open karate-cladogram.html (next to nodes.csv) in a browser.")
