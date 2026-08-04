#!/usr/bin/env python3
"""Write the MASTER dataset: one folder of plain CSVs that is the whole project.

The website is generated FROM this. The CSVs are the backup, the thing you can
open in Excel, and the thing you can hand to someone who does not run the
pipeline. Every build refreshes them, so master/ and the site never drift.

Version history is git: every build is committed with the override rows that
produced it, so any figure can be traced to the decision that made it and any
decision can be reversed by flipping one status field.

  python3 pipeline/master.py          (called automatically by build.py)
"""
import csv, json, re, unicodedata
from pathlib import Path

K = Path(__file__).resolve().parent.parent
OUT = K / "master"
OUT.mkdir(exist_ok=True)

lin = json.load(open(K / "pipeline/out/lineage.json", encoding="utf-8"))
sty = json.load(open(K / "pipeline/out/styles.json", encoding="utf-8"))["styles"]
kata = json.load(open(K / "pipeline/out/kata.json", encoding="utf-8"))
N = {n["id"]: n for n in lin["nodes"]}
S = {s["id"]: s for s in sty}


def w(name, fields, rows):
    with open(OUT / name, "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        wr.writeheader()
        for r in rows:
            wr.writerow({k: r.get(k, "") for k in fields})
    return len(rows)


# Kata credits arrive as free text: "Matayoshi Shinko" for our "Shinko Matayoshi",
# "Ryu Ryu Ko (transmitted; creator unknown)" with a parenthetical, or a body such
# as "KTA/Kukkiwon poomsae committee" that is not an individual at all. Resolve
# what can be resolved and label the rest honestly.
def _norm(x):
    x = unicodedata.normalize("NFKD", x or "")
    return re.sub(r"[^a-z]", "", x.lower())

_BY_NAME = {}
for _n in lin["nodes"]:
    for _f in (_n["name"], _n.get("name_romaji") or ""):
        if not _f:
            continue
        _BY_NAME.setdefault(_norm(_f), _n)
        _p = _f.split()
        if len(_p) == 2:                       # accept either name order
            _BY_NAME.setdefault(_norm(_p[1] + _p[0]), _n)

GROUP_WORDS = ("committee", "team", "association", "federation", "lineage", "family tradition",
               "senior students", "unknown", "tradition ascribes", "kwan", "society")

def resolve_person(raw):
    """-> (node or None, cleaned_name, kind) where kind is person|group|unresolved"""
    txt = (raw or "").strip()
    if not txt:
        return None, "", "unresolved"
    head = re.split(r"\s*[;(]", txt)[0].strip().rstrip(",")
    head = re.sub(r"^(attributed to|traditionally|probably|possibly)\s+", "", head, flags=re.I)
    for cand in (txt, head):
        hit = _BY_NAME.get(_norm(cand))
        if hit:
            return hit, hit["name"], "person"
    # "A and B", "A with B": try each part
    for part in re.split(r"\s+(?:and|with|&)\s+", head):
        hit = _BY_NAME.get(_norm(part))
        if hit:
            return hit, hit["name"], "person"
    low = txt.lower()
    if any(g in low for g in GROUP_WORDS):
        return None, head or txt, "group"
    return None, head or txt, "unresolved"


def chain(sid):
    out, cur, hops = [], sid, 0
    while cur and cur in S and hops < 12:
        out.append(S[cur]["label"]); cur = S[cur].get("parent"); hops += 1
    return " < ".join(out)


# 1. people
people = []
for n in sorted(lin["nodes"], key=lambda n: n["name"]):
    people.append({
        "id": n["id"], "name": n["name"], "name_native": n.get("name_native") or "",
        "name_romaji": n.get("name_romaji") or "",
        "birth_year": n.get("birth_year") or "", "death_year": n.get("death_year") or "",
        "trained_from_est": n.get("active_from") or "",
        "locality": n.get("locality") or "",
        "styles": "|".join(n["styles"]), "primary_style": n.get("primary_style") or "",
        "family": (S.get(n.get("primary_style") or "", {}) or {}).get("family", ""),
        "generation": n["generation"] if n.get("generation") is not None else "",
        "n_students": n.get("n_students", 0), "n_descendants": n.get("n_descendants", 0),
        "connected": "yes" if n["connected"] else "",
        "honours": "; ".join(n.get("honours") or []),
        "legendary": "yes" if n["flags"]["legendary"] else "",
        "added_by_research": "yes" if n["flags"].get("added_by_research") else "",
        "wikipedia_url": n.get("wikipedia_url") or "",
    })

# 2. links
links = []
for e in sorted(lin["edges"], key=lambda e: (N[e["source"]]["name"], N[e["target"]]["name"])):
    links.append({
        "teacher_id": e["source"], "teacher": N[e["source"]]["name"],
        "student_id": e["target"], "student": N[e["target"]]["name"],
        "confidence": e["confidence"], "primary": "yes" if e["is_primary"] else "",
        "evidence": " | ".join(e.get("evidence") or []),
    })

# 3. styles
styles = []
for s in sorted(sty, key=lambda s: (s.get("family", ""), s["id"])):
    members = [n for n in lin["nodes"] if s["id"] in n["styles"]]
    styles.append({
        "id": s["id"], "label": s["label"], "parent": s.get("parent") or "",
        "family": s.get("family", ""), "founder": s.get("founder") or "",
        "founded": s.get("founded") or "", "ancestry": chain(s["id"]),
        "n_people": len(members),
        "aliases": "; ".join(s.get("aliases") or []),
    })

# 4. kata
krows = []
for k in sorted(kata, key=lambda k: (k.get("family", ""), k["name"])):
    krows.append({
        "name": k["name"], "native": k.get("native") or "",
        "variants": "; ".join(k.get("variants") or []),
        "family": k.get("family", ""), "styles": "|".join(k.get("style_ids") or []),
        "meaning": k.get("meaning", ""), "era": k.get("era", ""),
        "origin_person": k.get("origin_person", ""), "origin_place": k.get("origin_place", ""),
        "modifier": k.get("modifier", ""), "modified_era": k.get("modified_era", ""),
        "introduced_by": "; ".join(f"{p['name']} ({p['role']})" for p in (k.get("introduced_by") or [])),
        "disputed": "yes" if k.get("disputed") else "",
        "provenance": k.get("provenance", "") or k.get("note", ""),
        "sources": " | ".join(k.get("sources") or []),
    })

# 5. kata <-> person, the mapping the client asked for as its own table
kp = []
for k in kata:
    seen = {}
    if k.get("origin_person"): seen[k["origin_person"]] = "originated"
    for p in (k.get("introduced_by") or []):
        if p.get("name"): seen[p["name"]] = p["role"]
    if k.get("modifier"): seen.setdefault(k["modifier"], "modified")
    for nm, role in seen.items():
        hit, clean, kind = resolve_person(nm)
        kp.append({"kata": k["name"], "person": clean, "person_as_written": nm,
                   "person_id": hit["id"] if hit else "",
                   "in_dataset": "yes" if hit else ("group or body, not an individual"
                                                    if kind == "group" else "NO — person missing"),
                   "role": role, "era": k.get("era", ""),
                   "disputed": "yes" if k.get("disputed") else ""})

n1 = w("people.csv", list(people[0].keys()), people)
n2 = w("links.csv", list(links[0].keys()), links)
n3 = w("styles.csv", list(styles[0].keys()), styles)
n4 = w("kata.csv", list(krows[0].keys()), krows)
n5 = w("kata_people.csv", list(kp[0].keys()), kp)
missing = sum(1 for r in kp if r["in_dataset"].startswith("NO"))
resolved = sum(1 for r in kp if r["in_dataset"] == "yes")
groups = sum(1 for r in kp if r["in_dataset"].startswith("group"))

(OUT / "README.md").write_text(f"""# Master dataset

Regenerated by every build (`python3 pipeline/build.py`). The website is
generated from the same data, so these files and the site never drift apart.

| file | rows | what it is |
|---|---:|---|
| `people.csv` | {n1} | every person, dates, styles, honours, connectivity |
| `links.csv` | {n2} | every teacher-to-student link, graded, with its sources |
| `styles.csv` | {n3} | every style with its ancestry back to the originating group |
| `kata.csv` | {n4} | every kata: meaning, era, originator, modifier, provenance |
| `kata_people.csv` | {n5} | kata mapped to the people who made or carried them |

`links.csv` is a standard edge list and `people.csv` a node list, so the pair
imports directly into Gephi, Cytoscape, R (igraph) or NetworkX.

**Version history** is the git history of this folder. Every change was made by
a row in `pipeline/overrides/`, each carrying a reason and a source, and each
reversible by setting its `status` to `rejected`. To see how a figure changed:
`git log -p master/people.csv`.

**Kata attributions still needing a person:** {missing} of {n5} rows are marked
`NO — person missing`, meaning the kata credits someone who is not yet in the
dataset. Those are the gaps to research next.
""", encoding="utf-8")
print(f"master/: {n1} people, {n2} links, {n3} styles, {n4} kata, {n5} kata-person links "
      f"({resolved} resolved to a person, {groups} to a body, {missing} still missing)")
