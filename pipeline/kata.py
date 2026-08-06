#!/usr/bin/env python3
"""Kata as the application and the master tables should see them.

`pipeline/out/kata.json` holds the researched record, one row per kata. Three
things have to happen to it before it is usable, and they were happening
nowhere, so both the site and the CSVs carried the raw shape.

ONE. The relationship rows are directed and were written from one end only.
"Bassai (Wadō-ryū) is the same kata as Passai (Wadō-ryū)" was recorded on the
Bassai row, so anyone who opened Passai saw a kata with no relatives at all.
Every relation is now mirrored onto the other kata, with the inverse wording,
marked `implied` so the interface can say it the right way round.

TWO. Some rows are the same kata twice, split by romanisation. The research
notes say so in terms, and name the form to keep. A `duplicate` row in the
override file merges one into the other: styles, variants, credits and any
relations pointing at the dead name all move across.

THREE. Kata that share their native characters are redactions of one form, and
that is a fact about the data rather than a research finding: 平安三段 and
Pinan Sandan are the same three characters. The reading is not the kata. Every
row therefore carries its siblings, so a reader who opens Heian Sandan is told
that Pinan Sandan exists even where nobody has yet written the relation down.
Thirty-four such groups have no researched relation between their members; the
build lists them in review/06_kata_relations.csv rather than leaving the gap
implicit.

The override file is `pipeline/overrides/kata_relations.csv`, with the same
status discipline as every other override: proposed, confirmed, rejected or
needs_decision. The interface exports corrections in exactly its shape.
"""

import csv
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
APPLY = {"", "proposed", "confirmed"}

# What a relation becomes when read from the other end.
INVERSE = {
    "same": "same",
    "variant": "variant",
    "cognate": "cognate",
    "namesake": "namesake",
    "uncertain": "uncertain",
    "derived_from": "ancestor_of",
    "ancestor_of": "derived_from",
}
FIELDS = ["from", "to", "relation", "confidence", "note", "sources", "status"]


def read_overrides(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load(out_dir=None, overrides_dir=None, report=None):
    """The kata list, enriched. `report` receives the rows for the review file."""
    out_dir = Path(out_dir or HERE / "out")
    overrides_dir = Path(overrides_dir or HERE / "overrides")
    kata = json.loads((out_dir / "kata.json").read_text(encoding="utf-8"))
    rows = read_overrides(overrides_dir / "kata_relations.csv")

    by_name = {k["name"]: k for k in kata}
    for k in kata:
        k.setdefault("relations", [])

    # ---- 1. overrides: added relations, and merges ----
    merges = {}          # dead name -> surviving name
    for r in rows:
        if r.get("status") not in APPLY:
            continue
        a, b = r.get("from", "").strip(), r.get("to", "").strip()
        if a not in by_name or b not in by_name or a == b:
            continue
        if r.get("relation") == "duplicate":
            merges[a] = b
            continue
        by_name[a]["relations"].append({
            "relation": r.get("relation", "uncertain"),
            "to": b,
            "confidence": r.get("confidence") or "medium",
            "note": r.get("note", ""),
            "sources": [s for s in (r.get("sources") or "").split(" | ") if s],
            "verifier": "",
        })

    # resolve chains (a -> b -> c) so a merge target is never itself merged away
    def survivor(name):
        seen = set()
        while name in merges and name not in seen:
            seen.add(name)
            name = merges[name]
        return name

    for dead in list(merges):
        keep = survivor(dead)
        if keep == dead:
            del merges[dead]

    merged_note = defaultdict(list)
    for dead, keep_name in merges.items():
        d, keep = by_name[dead], by_name[survivor(dead)]
        for field in ("style_ids", "variants", "introduced_by"):
            have = keep.get(field) or []
            seen = {json.dumps(x, sort_keys=True) for x in have}
            for x in (d.get(field) or []):
                key = json.dumps(x, sort_keys=True)
                if key not in seen:
                    seen.add(key)
                    have.append(x)
            keep[field] = have
        # the dead name survives as a name people will still search for
        if dead not in (keep.get("variants") or []):
            keep.setdefault("variants", []).append(dead)
        for field in ("meaning", "era", "origin_person", "origin_place",
                      "modifier", "modified_era", "provenance", "level"):
            if not keep.get(field) and d.get(field):
                keep[field] = d[field]
        keep["sources"] = list(dict.fromkeys((keep.get("sources") or []) + (d.get("sources") or [])))
        # its relations move across, minus the one that declared the duplication
        for rel in (d.get("relations") or []):
            if survivor(rel["to"]) != keep["name"]:
                keep["relations"].append(rel)
        merged_note[keep["name"]].append(dead)

    kata = [k for k in kata if k["name"] not in merges]
    by_name = {k["name"]: k for k in kata}
    for name, deads in merged_note.items():
        by_name[name]["merged_from"] = sorted(deads)

    # a kata is not a variant of itself, and a merge can easily make it look so:
    # the dead row often listed the surviving name among its variants
    for k in kata:
        if k.get("variants"):
            k["variants"] = [v for v in dict.fromkeys(k["variants"]) if v != k["name"]]

    # relations pointing at a merged name follow it
    for k in kata:
        fixed, seen = [], set()
        for rel in k["relations"]:
            to = survivor(rel["to"])
            if to == k["name"] or to not in by_name:
                continue
            key = (rel["relation"], to)
            if key in seen:
                continue
            seen.add(key)
            fixed.append({**rel, "to": to})
        k["relations"] = fixed

    # ---- 2. reciprocity ----
    for k in list(kata):
        for rel in list(k["relations"]):
            other = by_name.get(rel["to"])
            if not other:
                continue
            inv = INVERSE.get(rel["relation"], rel["relation"])
            if any(r["to"] == k["name"] for r in other["relations"]):
                continue
            other["relations"].append({
                "relation": inv, "to": k["name"], "confidence": rel.get("confidence", "medium"),
                "note": rel.get("note", ""), "sources": rel.get("sources", []),
                "verifier": rel.get("verifier", ""), "implied": True,
            })

    for k in kata:
        k["relations"].sort(key=lambda r: (r.get("implied", False), r["relation"], r["to"]))

    # ---- 3. siblings: the same characters are the same form ----
    groups = defaultdict(list)
    for k in kata:
        nat = (k.get("native") or "").strip()
        if nat:
            groups[nat].append(k["name"])
    unstated = []
    for nat, names in sorted(groups.items()):
        if len(names) < 2:
            continue
        names.sort()
        stated = any(r["to"] in names for n in names for r in by_name[n]["relations"])
        for n in names:
            by_name[n]["siblings"] = [x for x in names if x != n]
        if not stated:
            unstated.append({"native": nat, "kata": " | ".join(names),
                             "question": "how are these related? same form, variant, "
                                         "derivative, or only a shared name?",
                             "override_file": "kata_relations.csv"})

    if report is not None:
        report.extend(unstated)
    kata.sort(key=lambda k: k["name"])
    return kata, {"merged": sum(len(v) for v in merged_note.values()),
                  "relations": sum(len(k["relations"]) for k in kata),
                  "implied": sum(1 for k in kata for r in k["relations"] if r.get("implied")),
                  "sibling_groups": sum(1 for v in groups.values() if len(v) > 1),
                  "unstated": len(unstated)}


if __name__ == "__main__":
    report = []
    ks, stats = load(report=report)
    print(f"{len(ks)} kata, {stats['merged']} merged away, {stats['relations']} relations "
          f"({stats['implied']} mirrored), {stats['sibling_groups']} groups share their "
          f"characters, {stats['unstated']} of those have no relation recorded")
