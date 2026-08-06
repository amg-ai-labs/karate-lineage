#!/usr/bin/env python3
"""Assert the prose still matches the build.

README.md, METHOD.md and CITATION.cff quote figures that change with every
research pass, and hand-written prose drifts silently: the README claimed 633
undated people when the build held 722, and CITATION.cff was three research
rounds and 486 people out of date. Numbers in prose are a claim like any other,
so they get a test.

  python3 pipeline/test/check_docs.py
"""
import csv
import glob
import json
import re
import sys
from collections import Counter
from pathlib import Path

K = Path(__file__).resolve().parent.parent.parent
OUT = K / "pipeline" / "out"


def figures():
    lin = json.loads((OUT / "lineage.json").read_text(encoding="utf-8"))
    nodes, edges = lin["nodes"], lin["edges"]
    conf = Counter(e["confidence"] for e in edges)
    return {
        "people": len(nodes),
        "connected": sum(1 for n in nodes if n["connected"]),
        "orphans": sum(1 for n in nodes if not n["connected"]),
        "links": len(edges),
        "high": conf["high"],
        "medium": conf["medium"],
        "low": conf["low"],
        "undated": sum(1 for n in nodes if not n["birth_year"]),
        "bishop": sum(1 for e in edges
                      if any("Bishop" in s for s in (e.get("evidence") or []))),
        "styles": len(json.loads((OUT / "styles.json").read_text(encoding="utf-8"))["styles"]),
        "kata": len(json.loads((OUT / "kata.json").read_text(encoding="utf-8"))),
        "overrides": sum(len(list(csv.reader(open(f, encoding="utf-8")))) - 1
                         for f in sorted(glob.glob(str(K / "pipeline/overrides/*.csv")))),
    }


# (file, what the prose says, regex with one capturing group, key in figures())
CLAIMS = [
    ("README.md", "headline people",   r"\*\*([\d,]+) people, [\d,]+ instructor-to-student links", "people"),
    ("README.md", "headline links",    r"\*\*[\d,]+ people, ([\d,]+) instructor-to-student links", "links"),
    ("README.md", "headline styles",   r"instructor-to-student links, ([\d,]+) styles",            "styles"),
    ("README.md", "headline kata",     r"styles and ([\d,]+) kata\*\*",                            "kata"),
    ("README.md", "one lineage",       r"([\d,]+) of the [\d,]+ people sit in one lineage",        "connected"),
    ("README.md", "of how many",       r"[\d,]+ of the ([\d,]+) people sit in one lineage",        "people"),
    ("README.md", "unlinked remainder", r"the remaining ([\d,]+) are honestly marked",             "orphans"),
    ("README.md", "high-confidence",   r"\|\s*High\s*\|\s*([\d,]+)\s*\|",                          "high"),
    ("README.md", "medium-confidence", r"\|\s*Medium\s*\|\s*([\d,]+)\s*\|",                        "medium"),
    ("README.md", "low-confidence",    r"\|\s*Low\s*\|\s*([\d,]+)\s*\|",                           "low"),
    ("README.md", "Bishop citations",  r"\*\*([\d,]+) links cite Mark Bishop",                     "bishop"),
    ("README.md", "override rows",     r"([\d,]+) rows deep",                                      "overrides"),
    ("README.md", "kata in features",  r"\*\*Browse the kata\*\*: ([\d,]+) kata",                  "kata"),
    ("README.md", "unlinked limit",    r"\*\*([\d,]+) people are not linked\*\*",                  "orphans"),
    ("README.md", "undated",           r"\*\*([\d,]+) people have no recorded birth year",         "undated"),
    ("METHOD.md", "unattached",        r"([\d,]+) people remain unattached",                       "orphans"),
    ("CITATION.cff", "people",         r"taekwondo: ([\d,]+) people",                              "people"),
    ("CITATION.cff", "links",          r"taekwondo: [\d,]+ people, ([\d,]+) links",                "links"),
    ("CITATION.cff", "styles",         r"([\d,]+) styles and [\d,]+ kata",                         "styles"),
    ("CITATION.cff", "kata",           r"[\d,]+ styles and ([\d,]+) kata",                         "kata"),
]


def main():
    fig = figures()
    fails, checked = [], 0
    cache = {}
    for fname, what, pattern, key in CLAIMS:
        if fname not in cache:
            cache[fname] = (K / fname).read_text(encoding="utf-8")
        m = re.search(pattern, cache[fname])
        if not m:
            fails.append(f"{fname}: cannot find the {what} figure "
                         f"(pattern {pattern!r} matched nothing; did the sentence change?)")
            continue
        said = int(m.group(1).replace(",", ""))
        checked += 1
        if said != fig[key]:
            fails.append(f"{fname}: says {said:,} for {what}, build has {fig[key]:,}")

    if fails:
        print("FAIL:")
        for f in fails:
            print("  " + f)
        print("\nThe prose is a claim like any other. Correct the file, or the figure.")
        sys.exit(1)
    print(f"docs match the build: {checked} figures checked across "
          f"{len(cache)} files ({fig['people']:,} people, {fig['links']:,} links, "
          f"{fig['styles']} styles, {fig['kata']} kata)")


if __name__ == "__main__":
    main()
