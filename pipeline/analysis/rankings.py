#!/usr/bin/env python3
"""Influence rankings over the lineage graph.

Six DISTINCT measures, deliberately not collapsed into one score, because
"influence" is several different things:

  reach        how many people descend from them at all (transitive closure)
  direct       how many students they taught personally
  prominent    how many of their direct students are themselves notable
               (notable = teaches >= 3 students, or heads/founds a style,
                or holds a recorded honour)
  breadth      how many distinct styles appear among their descendants
  generations  how many generations deep their line runs
  teachers     how many teachers THEY had, and how diverse those teachers were

CAUTION ON "reach": it rewards ANTIQUITY, not influence. Anyone at the root of
the tree inherits every later descendant, so an 18th-century figure with a
single student outranks Funakoshi. `inherited` marks people whose reach passes
through a single student (a chain, not a fan-out); `branch_reach` counts only
descendants reached through a person who actually taught two or more people,
which is the fairer "did the art spread BECAUSE of them" measure.

Also: terminal lineages — people who taught nobody recorded, so the line
stops with them.

  python3 pipeline/analysis/rankings.py [--csv]
"""
import csv, json, sys
from collections import defaultdict, deque
from pathlib import Path

K = Path(__file__).resolve().parent.parent.parent
d = json.load(open(K / "pipeline/out/lineage.json", encoding="utf-8"))
S = {s["id"]: s for s in json.load(open(K / "pipeline/out/styles.json", encoding="utf-8"))["styles"]}
N = {n["id"]: n for n in d["nodes"]}
kids, parents = defaultdict(list), defaultdict(list)
for e in d["edges"]:
    kids[e["source"]].append(e["target"])
    parents[e["target"]].append(e["source"])

def descendants(v):
    seen, q = set(), deque([v])
    while q:
        u = q.popleft()
        for w in kids.get(u, []):
            if w not in seen:
                seen.add(w); q.append(w)
    return seen

def depth(v):
    best, seen, q = 0, {v}, deque([(v, 0)])
    while q:
        u, dpt = q.popleft()
        best = max(best, dpt)
        for w in kids.get(u, []):
            if w not in seen:
                seen.add(w); q.append((w, dpt + 1))
    return best

def fam(n):
    for s in n["styles"]:
        f = S.get(s, {}).get("family")
        if f and f != "other": return f
    return "other"

# notability: a student who themselves taught several people, founded a style,
# or carries a recorded honour
founders = {(s.get("founder") or "").strip() for s in S.values() if s.get("founder")}
def notable(v):
    n = N[v]
    return (len(kids.get(v, [])) >= 3 or bool(n.get("honours"))
            or n["name"] in founders or n.get("n_descendants", 0) >= 10)

rows = []
for v, n in N.items():
    desc = descendants(v)
    styles_below = {s for w in desc for s in N[w]["styles"] if s in S and S[s]["family"] != "other"}
    direct = kids.get(v, [])
    tstyles = {s for t in parents.get(v, []) for s in N[t]["styles"] if s in S}
    # reach inherited through a single student is a chain, not influence
    inherited = len(direct) == 1
    # descendants reached only via branching teachers
    branch = 0
    if len(direct) >= 2:
        branch = len(desc)
    rows.append({
        "inherited": "yes" if inherited else "",
        "branch_reach": branch,
        "id": v, "name": n["name"], "native": n.get("name_native") or "",
        "born": n.get("birth_year") or "", "died": n.get("death_year") or "",
        "style": n.get("style_label") or "", "family": fam(n),
        "reach": len(desc), "direct": len(direct),
        "prominent": sum(1 for s in direct if notable(s)),
        "breadth": len(styles_below), "generations": depth(v),
        "teachers": len(parents.get(v, [])), "teacher_styles": len(tstyles),
        "honours": "; ".join(n.get("honours") or []),
    })

def top(key, n=50, tie=("reach", "direct")):
    return sorted(rows, key=lambda r: tuple([-r[key]] + [-r[t] for t in tie] + [r["name"]]))[:n]

def show(title, key, cols, n=50):
    print(f"\n{'='*100}\n{title}\n{'='*100}")
    hdr = f"{'#':>3}  {'name':30s} {'dates':11s} {'style':22s} " + " ".join(f"{c:>10s}" for c in cols)
    print(hdr); print("-" * len(hdr))
    for i, r in enumerate(top(key, n), 1):
        dates = f"{r['born'] or '?'}–{r['died'] or ''}".strip("–") or "?"
        print(f"{i:3d}  {r['name'][:30]:30s} {dates:11s} {r['style'][:22]:22s} "
              + " ".join(f"{r[c]:>10d}" if isinstance(r[c], int) else f"{r[c]:>10s}" for c in cols))

if "--csv" in sys.argv:
    out = K / "pipeline/analysis"
    with open(out / "influence_rankings.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in sorted(rows, key=lambda r: -r["reach"]): w.writerow(r)
    term = [r for r in rows if r["direct"] == 0 and r["teachers"] > 0]
    with open(out / "terminal_lineages.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in sorted(term, key=lambda r: (str(r["born"] or "9999"), r["name"])): w.writerow(r)
    print(f"wrote influence_rankings.csv ({len(rows)} people) and "
          f"terminal_lineages.csv ({len(term)} people)")
    sys.exit(0)

print("\nNOTE ON METHOD: 'reach' rewards being early. A root figure inherits every")
print("later descendant, so it ranks antiquity as much as influence. Ranking 1 is")
print("shown for completeness; rankings 2 and 3 are the defensible influence measures.")
show("1. WIDEST REACH — total descendants (NB: dominated by position in time)", "reach",
     ["reach", "direct", "generations", "breadth"], 25)
show("1b. WIDEST REACH, excluding pass-through figures (2+ direct students)", "branch_reach",
     ["branch_reach", "direct", "prominent", "generations"], 30)
show("2. MOST PROMINENT STUDENTS — direct students who are themselves notable", "prominent",
     ["prominent", "direct", "reach"])
show("3. MOST DIRECT STUDENTS taught personally", "direct", ["direct", "prominent", "reach"])
show("4. MOST AND MOST DIVERSE TEACHERS — people who studied most widely", "teachers",
     ["teachers", "teacher_styles", "reach"], 50)
show("5. BROADEST STYLISTIC SPREAD — distinct styles among their descendants", "breadth",
     ["breadth", "reach", "generations"], 30)

term = [r for r in rows if r["direct"] == 0 and r["teachers"] > 0]
print(f"\n{'='*100}\n6. TERMINAL LINEAGES — no recorded students, so the line stops with them: "
      f"{len(term)} people\n{'='*100}")
pre1950 = [r for r in term if r["born"] and int(r["born"]) < 1950]
print(f"   of whom born before 1950 (so genuinely closed, not merely still teaching): {len(pre1950)}")
for r in sorted(pre1950, key=lambda r: str(r["born"]))[:35]:
    print(f"   {r['born']}  {r['name'][:32]:32s} {r['style'][:26]:26s} taught by {r['teachers']}")
