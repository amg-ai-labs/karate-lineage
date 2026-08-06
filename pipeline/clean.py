#!/usr/bin/env python3
"""Karate lineage cleaning pipeline.

Reads ../nodes.csv and ../edges.csv (never modifies them), applies the
decisions recorded in overrides/, and writes:
  out/lineage.json   clean graph (guaranteed acyclic) for the visualisation
  out/styles.json    canonical style taxonomy
  review/*.csv       everything a human should look at, regenerated per run

Pure stdlib (Python 3.9+). Deterministic: identical inputs (source CSVs +
overrides/) produce byte-identical outputs.

Override semantics: every override row has a `status` column.
  proposed   applied, and listed in review/01_applied_fixes.csv for veto
  confirmed  applied, not re-listed
  rejected   not applied
  needs_decision  not applied, listed in review/02_needs_your_decision.csv

Usage: python3 clean.py
"""

import csv
import hashlib
import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

PIPELINE_VERSION = "1.0.0"
HERE = Path(__file__).resolve().parent
SRC_NODES = HERE.parent / "nodes.csv"
SRC_EDGES = HERE.parent / "edges.csv"
OVR = HERE / "overrides"
OUT = HERE / "out"
REVIEW = HERE / "review"

YEAR_MIN, YEAR_MAX_BIRTH, YEAR_MAX_DEATH = 500, 2015, 2026
CONF_RANK = {"high": 3, "medium": 2, "low": 1, "": 0}
APPLY = {"proposed", "confirmed"}

# Founding year of organised styles, for anachronism checks: a person who died
# well before a style existed cannot have it as their primary style. Seed values;
# style_map.csv's `founded` column adds to this at load time.
STYLE_FOUNDED = {
    "shotokan": 1936, "shotokai": 1930, "wado-ryu": 1934, "shito-ryu": 1934,
    "goju-ryu": 1929, "goju-kai": 1950, "meibukan": 1952, "kyokushin": 1953,
    "isshin-ryu": 1956, "matsubayashi-ryu": 1947, "uechi-ryu": 1940,
    "chito-ryu": 1946, "shorin-ryu": 1933, "kobayashi-shorin-ryu": 1933,
    "taekwondo": 1955, "tang-soo-do": 1944, "shudokan": 1930,
    "seidokaikan": 1980, "ashihara": 1980, "kudo": 1981, "motobu-ryu": 1922,
}

applied = []    # rows for 01_applied_fixes.csv
decisions = []  # rows for 02_needs_your_decision.csv
quality = []    # rows for 05_data_quality.csv


def norm_name(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def read_csv(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [{k: (v or "").strip() for k, v in row.items() if k is not None}
                for row in csv.DictReader(f)]


def write_csv(path, rows, fields):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})


def coerce_year(raw):
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return int(float(raw))
    except ValueError:
        return None


def load_sources():
    nodes = read_csv(SRC_NODES)
    edges = read_csv(SRC_EDGES)
    if not nodes or not edges:
        sys.exit("FATAL: nodes.csv / edges.csv not found next to pipeline/")
    return nodes, edges


def source_hash():
    h = hashlib.sha256()
    for p in [SRC_NODES, SRC_EDGES] + sorted(OVR.glob("*.csv")):
        h.update(p.name.encode())
        h.update(p.read_bytes())
    return h.hexdigest()[:16]


def main():
    nodes_raw, edges_raw = load_sources()

    ovr_verdicts = read_csv(OVR / "node_verdicts.csv")
    ovr_merges = read_csv(OVR / "node_merges.csv")
    ovr_edges = read_csv(OVR / "edge_fixes.csv")
    ovr_styles = read_csv(OVR / "style_map.csv")
    ovr_years = read_csv(OVR / "year_fixes.csv")
    ovr_names = read_csv(OVR / "name_fixes.csv")
    ovr_node_add = read_csv(OVR / "node_additions.csv")
    ovr_edge_add = read_csv(OVR / "edge_additions.csv")
    ovr_style_assign = read_csv(OVR / "style_assignments.csv")
    ovr_honours = read_csv(OVR / "honours.csv")

    # ---------- 1. build node table ----------
    nodes = {}
    for n in nodes_raw:
        nid = n["node_id"]
        styles = []
        for i in range(1, 11):
            s = n.get(f"style_{i}", "").strip()
            if s and s not in styles:
                styles.append(s)
        uni, asc = n.get("name_unicode", ""), n.get("name_ascii", "")
        nodes[nid] = {
            "id": nid,
            "qid": nid if nid.startswith("Q") else None,
            "name": asc or uni,
            "name_ascii": asc,
            "name_romaji": uni if uni and uni != asc else None,
            "name_native": None,
            "birth_year": coerce_year(n.get("birth_year")),
            "death_year": coerce_year(n.get("death_year")),
            "active_from": coerce_year(n.get("instructor_start_year")),
            "locality": n.get("okinawa_locality") if n.get("okinawa_locality") not in ("", "unknown") else None,
            "raw_styles": styles,
            "needs_review": n.get("needs_review") == "1",
            "wikipedia_url": n.get("wikipedia_url") or None,
            "flags": {"legendary": False, "wrong_entity": False, "merged_from": [], "years_nulled": []},
            "name_alt": [],
        }

    # ---------- 1b. researched node additions ----------
    for r in ovr_node_add:
        if r["status"] == "needs_decision":
            decisions.append({"kind": "node_addition", "who": r.get("name", ""),
                              "question": "add this researched person?", "context": r.get("reason", ""),
                              "override_file": "node_additions.csv", "row_key": r["node_id"]})
            continue
        if r["status"] not in APPLY or r["node_id"] in nodes:
            continue
        styles = [s.strip() for s in r.get("styles", "").split("|") if s.strip()]
        nodes[r["node_id"]] = {
            "id": r["node_id"], "qid": None,
            "name": r["name"], "name_ascii": r["name"],
            "name_romaji": None, "name_native": r.get("name_native") or None,
            "birth_year": coerce_year(r.get("birth_year")),
            "death_year": coerce_year(r.get("death_year")),
            "active_from": None,
            "locality": r.get("locality") or None,
            "raw_styles": styles, "needs_review": True,
            "wikipedia_url": r.get("wikipedia_url") or None,
            "flags": {"legendary": False, "wrong_entity": False, "merged_from": [],
                      "years_nulled": [], "added_by_research": True},
            "name_alt": [],
        }
        applied.append({"kind": "node_addition", "what": f"{r['name']} ({r['node_id']})",
                        "reason": r.get("reason", ""), "override_file": "node_additions.csv"})

    # honours: verified rank/recognition rows (e.g. the Okinawa 10th-dan register)
    for r in ovr_honours:
        if r.get("status") not in APPLY or r["node_id"] not in nodes:
            continue
        node = nodes[r["node_id"]]
        node.setdefault("honours", []).append(r["honour"])
        applied.append({"kind": "honour", "what": f"{node['name_ascii']}: {r['honour']}",
                        "reason": r.get("source", ""), "override_file": "honours.csv"})

    # ---------- 2. year fixes (explicit overrides first, then range check) ----------
    for r in ovr_years:
        if r["node_id"] not in nodes:
            continue
        if r["status"] == "needs_decision":
            node = nodes[r["node_id"]]
            decisions.append({"kind": "year", "who": node["name_ascii"],
                              "question": f"{r['field']}: keep {r['old']} or adopt {r['new']}?",
                              "context": r.get("reason", ""), "override_file": "year_fixes.csv",
                              "row_key": f"{r['node_id']}|{r['field']}"})
            continue
        if r["status"] not in APPLY:
            continue
        node = nodes[r["node_id"]]
        node[r["field"]] = coerce_year(r["new"]) if r["new"] else None
        applied.append({"kind": "year_fix", "what": f"{node['name_ascii']}: {r['field']} {r['old']} -> {r['new'] or 'null'}",
                        "reason": r.get("reason", ""), "override_file": "year_fixes.csv"})

    for node in nodes.values():
        for field, hi in [("birth_year", YEAR_MAX_BIRTH), ("death_year", YEAR_MAX_DEATH), ("active_from", YEAR_MAX_DEATH)]:
            v = node[field]
            if v is not None and not (YEAR_MIN <= v <= hi):
                node["flags"]["years_nulled"].append(f"{field}={v}")
                node[field] = None
                quality.append({"kind": "year_out_of_range", "node_id": node["id"], "name": node["name_ascii"],
                                "detail": f"{field}={v} nulled (outside {YEAR_MIN}-{hi})"})
        b, d = node["birth_year"], node["death_year"]
        if b and d and d < b:
            node["flags"]["years_nulled"].append(f"death_year={d}<birth")
            node["death_year"] = None
            quality.append({"kind": "death_before_birth", "node_id": node["id"], "name": node["name_ascii"],
                            "detail": f"death {d} < birth {b}, death nulled"})

    # ---------- 3. node verdicts: drop non-persons, flag legendary / wrong entity ----------
    dropped_nodes = set()
    for r in ovr_verdicts:
        nid = r["node_id"]
        if nid not in nodes:
            continue
        if r["status"] == "needs_decision":
            decisions.append({"kind": "node_verdict", "who": r.get("name", ""),
                              "question": f"verdict '{r['verdict']}' ({r.get('category','')})",
                              "context": r.get("reason", ""), "override_file": "node_verdicts.csv", "row_key": nid})
            continue
        if r["status"] not in APPLY:
            continue
        if r["verdict"] == "non_person":
            dropped_nodes.add(nid)
            applied.append({"kind": "drop_non_person", "what": f"{r.get('name','')} ({nid}, {r.get('category','')})",
                            "reason": r.get("reason", ""), "override_file": "node_verdicts.csv"})
        elif r["verdict"] == "legendary":
            nodes[nid]["flags"]["legendary"] = True
        elif r["verdict"] == "wrong_entity_suspected":
            nodes[nid]["flags"]["wrong_entity"] = True
            quality.append({"kind": "wrong_entity_suspected", "node_id": nid, "name": r.get("name", ""),
                            "detail": r.get("reason", "")})

    # ---------- 4. merges ----------
    merged_into = {}  # old_id -> survivor_id

    def resolve_merge(nid):
        seen = set()
        while nid in merged_into and nid not in seen:
            seen.add(nid)
            nid = merged_into[nid]
        return nid

    for r in ovr_merges:
        if r["status"] == "needs_decision":
            decisions.append({"kind": "merge", "who": r.get("reason", ""),
                              "question": f"merge {r['merged_ids']} into {r['survivor_id']}?",
                              "context": r.get("reason", ""), "override_file": "node_merges.csv", "row_key": r["survivor_id"]})
            continue
        if r["status"] not in APPLY:
            continue
        surv = resolve_merge(r["survivor_id"])   # follow earlier merges; blocks A<->B cycles
        if surv not in nodes:
            quality.append({"kind": "stale_override", "node_id": r["survivor_id"], "name": "",
                            "detail": "node_merges.csv survivor no longer exists"})
            continue
        for old in r["merged_ids"].split("|"):
            old = resolve_merge(old.strip())
            if not old or old == surv or old not in nodes:
                continue
            merged_into[old] = surv
            src, dst = nodes[old], nodes[surv]
            dst["flags"]["merged_from"].append(old)
            if src["name_ascii"] and norm_name(src["name_ascii"]) != norm_name(dst["name_ascii"]):
                dst["name_alt"].append(src["name_ascii"])
            for field in ["birth_year", "death_year", "active_from", "locality", "wikipedia_url"]:
                if dst[field] is None and src[field] is not None:
                    dst[field] = src[field]
            for s in src["raw_styles"]:
                if s not in dst["raw_styles"]:
                    dst["raw_styles"].append(s)
            dropped_nodes.add(old)
            applied.append({"kind": "merge", "what": f"{src['name_ascii']} ({old}) merged into ({surv})",
                            "reason": r.get("reason", ""), "override_file": "node_merges.csv"})

    def resolve(nid):
        seen = set()
        while nid in merged_into and nid not in seen:
            seen.add(nid)
            nid = merged_into[nid]
        return nid

    # ---------- 4b. name fixes (display / romaji / native script) ----------
    n_native = n_romaji = 0
    for r in ovr_names:
        if r["status"] == "needs_decision":
            decisions.append({"kind": "name_fix", "who": r.get("node_id", ""),
                              "question": f"display '{r.get('display_name','')}' native '{r.get('name_native','')}'",
                              "context": r.get("note", ""), "override_file": "name_fixes.csv", "row_key": r["node_id"]})
            continue
        if r["status"] not in APPLY:
            continue
        nid = resolve(r["node_id"])
        if nid not in nodes or nid in dropped_nodes:
            quality.append({"kind": "stale_override", "node_id": r["node_id"], "name": "",
                            "detail": "name_fixes.csv row targets a dropped/unknown node"})
            continue
        node = nodes[nid]
        new = r.get("display_name", "")
        if new and norm_name(new) != norm_name(node["name"]):
            node["name_alt"].append(node["name"])
            applied.append({"kind": "name_fix", "what": f"{node['name']} -> {new}",
                            "reason": r.get("note", ""), "override_file": "name_fixes.csv"})
            node["name"] = new
        elif new:
            node["name"] = new  # case/spacing polish, not worth a review line
        if r.get("name_native"):
            node["name_native"] = r["name_native"]
            n_native += 1
        if r.get("name_romaji"):
            node["name_romaji"] = r["name_romaji"]
            n_romaji += 1

    # ---------- 4c. researched edge additions ----------
    for r in ovr_edge_add:
        if r["status"] == "needs_decision":
            decisions.append({"kind": "edge_addition",
                              "who": f"{r.get('source_name','')} -> {r.get('target_name','')}",
                              "question": "add this researched teacher-student link?",
                              "context": r.get("reason", ""), "override_file": "edge_additions.csv",
                              "row_key": f"{r['source']}->{r['target']}"})
            continue
        if r["status"] not in APPLY:
            continue
        edges_raw.append({"source": r["source"], "target": r["target"],
                          "interaction": "teacher_of",
                          "evidence": r.get("evidence", "research"),
                          "confidence": r.get("confidence", "low"),
                          # a researched ruling on whether this link carried the
                          # style; read later when picking the style-bearing teacher
                          "primary": r.get("primary", ""),
                          "source_name_ascii": r.get("source_name", ""),
                          "target_name_ascii": r.get("target_name", "")})
        applied.append({"kind": "edge_addition",
                        "what": f"{r.get('source_name','?')} -> {r.get('target_name','?')} ({r.get('confidence','low')})",
                        "reason": r.get("reason", ""), "override_file": "edge_additions.csv"})

    # ---------- 5. edge fixes ----------
    edge_actions = {}
    for r in ovr_edges:
        key = (r["source"], r["target"])
        if r["status"] == "needs_decision":
            decisions.append({"kind": "edge", "who": f"{r.get('source_name','')} -> {r.get('target_name','')}",
                              "question": f"proposed action: {r['action']}", "context": r.get("reason", ""),
                              "override_file": "edge_fixes.csv", "row_key": f"{key[0]}->{key[1]}"})
        elif r["status"] in APPLY:
            edge_actions[key] = r

    edges = []
    seen_edge_fix = set()
    for e in edges_raw:
        s, t = e["source"], e["target"]
        fix = edge_actions.get((s, t))
        inferred_flip = False
        if fix:
            seen_edge_fix.add((s, t))
            act = fix["action"]
            what = f"{e.get('source_name_ascii','')} -> {e.get('target_name_ascii','')}"
            if act == "keep" and fix.get("new_confidence"):
                e = {**e, "confidence": fix["new_confidence"]}
                applied.append({"kind": "edge_confidence", "what": f"{what}: confidence -> {fix['new_confidence']}",
                                "reason": fix.get("reason", ""), "override_file": "edge_fixes.csv"})
            if act == "drop":
                applied.append({"kind": "edge_drop", "what": what, "reason": fix.get("reason", ""), "override_file": "edge_fixes.csv"})
                continue
            if act == "flip":
                s, t = t, s
                inferred_flip = True
                applied.append({"kind": "edge_flip", "what": what, "reason": fix.get("reason", ""), "override_file": "edge_fixes.csv"})
            if act == "repoint_target" and fix.get("repoint_to"):
                applied.append({"kind": "edge_repoint", "what": f"{what}: target -> {fix['repoint_to']}",
                                "reason": fix.get("reason", ""), "override_file": "edge_fixes.csv"})
                t = fix["repoint_to"]
            if act == "repoint_source" and fix.get("repoint_to"):
                applied.append({"kind": "edge_repoint", "what": f"{what}: source -> {fix['repoint_to']}",
                                "reason": fix.get("reason", ""), "override_file": "edge_fixes.csv"})
                s = fix["repoint_to"]
        s, t = resolve(s), resolve(t)
        if s in dropped_nodes or t in dropped_nodes:
            continue
        if s == t:
            quality.append({"kind": "self_loop_dropped", "node_id": s,
                            "name": nodes.get(s, {}).get("name_ascii", s), "detail": "edge to self removed"})
            continue
        if s not in nodes or t not in nodes:
            quality.append({"kind": "dangling_edge", "node_id": "", "name": "", "detail": f"{s} -> {t} endpoint missing"})
            continue
        edges.append({"source": s, "target": t, "confidence": e.get("confidence", ""),
                      "evidence": [p.strip() for p in e.get("evidence", "").split("|") if p.strip()],
                      "primary": e.get("primary", ""),
                      "inferred_flip": inferred_flip})

    for key, r in edge_actions.items():
        if key not in seen_edge_fix:
            quality.append({"kind": "stale_override", "node_id": "", "name": "",
                            "detail": f"edge_fixes.csv row {key[0]}->{key[1]} matches no source edge"})

    # dedupe edges (post-merge collisions): keep max confidence, union evidence
    by_key = {}
    for e in edges:
        k = (e["source"], e["target"])
        if k in by_key:
            prev = by_key[k]
            if CONF_RANK[e["confidence"]] > CONF_RANK[prev["confidence"]]:
                prev["confidence"] = e["confidence"]
            prev["evidence"] = sorted(set(prev["evidence"]) | set(e["evidence"]))
            prev["inferred_flip"] = prev["inferred_flip"] or e["inferred_flip"]
            # a researched ruling on the same pair should not be lost to whichever
            # copy of the edge happened to be read first
            if not prev.get("primary") and e.get("primary"):
                prev["primary"] = e["primary"]
        else:
            by_key[k] = e
    edges = list(by_key.values())

    # ---------- 6. cycle safety net: break remaining cycles at lowest confidence ----------
    def find_cycle(adj):
        state, stack = {}, []
        def dfs(u):
            state[u] = 1
            stack.append(u)
            for v in adj.get(u, []):
                if state.get(v) == 1:
                    return stack[stack.index(v):] + [v]
                if state.get(v, 0) == 0:
                    found = dfs(v)
                    if found:
                        return found
            stack.pop()
            state[u] = 2
            return None
        for n in sorted(adj):
            if state.get(n, 0) == 0:
                found = dfs(n)
                if found:
                    return found
        return None

    while True:
        adj = defaultdict(list)
        for e in edges:
            adj[e["source"]].append(e["target"])
        for v in adj.values():
            v.sort()
        cyc = find_cycle(adj)
        if not cyc:
            break
        cyc_edges = [(cyc[i], cyc[i + 1]) for i in range(len(cyc) - 1)]
        victim = min(cyc_edges, key=lambda k: (CONF_RANK[by_key[k]["confidence"]], k))
        edges = [e for e in edges if (e["source"], e["target"]) != victim]
        path = " -> ".join(nodes[x]["name_ascii"] for x in cyc)
        quality.append({"kind": "cycle_broken", "node_id": victim[0], "name": nodes[victim[0]]["name_ascii"],
                        "detail": f"cycle [{path}] broken by dropping lowest-confidence edge "
                                  f"{nodes[victim[0]]['name_ascii']} -> {nodes[victim[1]]['name_ascii']} "
                                  f"({by_key[victim]['confidence']}); review direction manually"})

    # ---------- 7. style normalisation ----------
    style_rows = {r["raw"]: r for r in ovr_styles if r.get("status", "confirmed") != "rejected"}
    canon = {}
    for r in ovr_styles:
        cid = r["canonical_id"]
        if cid and cid not in canon:
            fy = (r.get("founded", "") or "").strip()
            founded = int(fy) if fy.isdigit() and 1600 <= int(fy) <= 2026 else None
            canon[cid] = {"id": cid, "label": r["label"], "parent": r.get("parent", "") or None,
                          "family": r.get("family", "other"), "founder": r.get("founder", "") or None,
                          # the other tradition a style is a hybrid of, where it is one:
                          # Wado-ryu is karate AND Shindo Yoshin-ryu jujutsu, and saying so
                          # is more honest than filing it as karate and losing the jujutsu
                          "hybrid_with": r.get("hybrid_with", "") or None,
                          "founded": founded, "aliases": []}
            if founded:
                STYLE_FOUNDED.setdefault(cid, founded)
    for r in ovr_styles:
        if r["raw"] != "(synthetic)" and r["canonical_id"] in canon:
            canon[r["canonical_id"]]["aliases"].append(r["raw"])

    # the style tree must be a tree: drop parents that do not exist, and break cycles
    for c in sorted(canon.values(), key=lambda c: c["id"]):
        if c["parent"] and c["parent"] not in canon:
            quality.append({"kind": "style_parent_missing", "name": c["id"],
                            "detail": f"unknown parent style '{c['parent']}'"})
            c["parent"] = None
    for c in sorted(canon.values(), key=lambda c: c["id"]):
        seen_p, p = {c["id"]}, c["parent"]
        while p:
            if p in seen_p:
                quality.append({"kind": "style_parent_cycle", "name": c["id"],
                                "detail": f"parent chain loops at '{p}'"})
                c["parent"] = None
                break
            seen_p.add(p)
            p = canon[p]["parent"]

    unmapped = defaultdict(int)
    GENERIC = {"karate-generic", "okinawan-karate-generic", "japanese-karate-generic",
               "martial-arts-generic", "korean-martial-arts", "scrape-artefact"}

    # Some early figures carry no dates at all (Kusanku, the Chinese envoy), so the
    # anachronism guard below has nothing to test them against and a 1956 style tag
    # would survive on an 18th-century man. Place them roughly in time from the
    # people around them: a teacher was alive when his earliest student was learning.
    kids_of, teachers_of = defaultdict(list), defaultdict(list)
    for e in edges:
        kids_of[e["source"]].append(e["target"])
        teachers_of[e["target"]].append(e["source"])
    est_floruit = {}
    for nid, node in nodes.items():
        if node["birth_year"] or node["death_year"]:
            continue
        sb = [nodes[s]["birth_year"] for s in kids_of.get(nid, [])
              if s in nodes and nodes[s]["birth_year"]]
        tb = [nodes[t]["birth_year"] for t in teachers_of.get(nid, [])
              if t in nodes and nodes[t]["birth_year"]]
        if sb:
            est_floruit[nid] = min(sb) + 20        # active when his earliest student was ~20
        elif tb:
            est_floruit[nid] = max(tb) + 55

    def anachronistic(node, cid):
        founded = STYLE_FOUNDED.get(cid)
        if not founded:
            return False
        d, b = node["death_year"], node["birth_year"]
        if d is not None:
            return d < founded - 5
        if b is not None:
            return b + 90 < founded
        f = est_floruit.get(node["id"])
        return f is not None and f + 60 < founded

    # researched per-person style assignments (canonical ids) join raw_styles
    for r in ovr_style_assign:
        if r.get("status") not in APPLY:
            continue
        nid = resolve_merge(r["node_id"]) if r["node_id"] in nodes or True else r["node_id"]
        node = nodes.get(nid)
        if node is None or r["style_id"] in node["raw_styles"]:
            continue
        node["raw_styles"].append(r["style_id"])
        applied.append({"kind": "style_assignment", "what": f"{node['name_ascii']} += {r['style_id']}",
                        "reason": r.get("reason", ""), "override_file": "style_assignments.csv"})

    for node in nodes.values():
        mapped = []
        for s in node["raw_styles"]:
            row = style_rows.get(s)
            if row:
                cid = row["canonical_id"]
                if cid and cid not in mapped:
                    mapped.append(cid)
            elif s in canon:            # researched additions may use canonical ids
                if s not in mapped:
                    mapped.append(s)
            else:
                unmapped[s] += 1
        node["styles"] = mapped
        good = [c for c in mapped if c not in GENERIC]
        # A style founded after someone died is not a style they practised: it is a
        # scrape artefact from the style's own lineage page (Kusanku is listed under
        # Shito-ryu because Shito-ryu claims descent from him). Drop the tag outright,
        # or the style browser counts 17th-century masters as members of a 1934 school.
        ana = [c for c in good if anachronistic(node, c)]
        for c in ana:
            quality.append({"kind": "anachronistic_style", "node_id": node["id"], "name": node["name_ascii"],
                            "detail": f"style '{c}' (founded c.{STYLE_FOUNDED[c]}) postdates their lifespan "
                                      f"{node['birth_year']}-{node['death_year']}; tag dropped (ancestry, "
                                      f"not membership)"})
        node["styles"] = [c for c in mapped if c not in ana]
        # bare 'te' is a weak identity: prefer a named stream/style when one exists,
        # so early masters colour by their Shuri/Tomari/Naha stream
        live_good = [c for c in node["styles"] if c not in GENERIC]
        ranked = [c for c in live_good if c != "te"] + [c for c in live_good if c == "te"]
        node["primary_style"] = ranked[0] if ranked else (node["styles"][0] if node["styles"] else None)

    # ---------- 8. graph derivations ----------
    live = {nid: n for nid, n in nodes.items() if nid not in dropped_nodes}
    children = defaultdict(list)
    parents = defaultdict(list)
    for e in edges:
        children[e["source"]].append(e["target"])
        parents[e["target"]].append(e["source"])
    connected = set(children) | set(parents)

    # A student cannot predate their teacher. The existing guard only caught a
    # teacher who died before the student was born, which let through the reverse:
    # Kenwa Mabuni (1889-1952) recorded as teaching Gima Shinjo (1557-1644), who
    # was in fact a 17th-century agricultural official and not a martial artist
    # at all. Both directions are checked now.
    impossible = []
    for e in list(edges):
        s_n, t_n = live.get(e["source"]) or {}, live.get(e["target"]) or {}
        sb, tb = s_n.get("birth_year"), t_n.get("birth_year")
        sd, td = s_n.get("death_year"), t_n.get("death_year")
        why = ""
        # A YOUNGER teacher is perfectly possible: Carlos Machado really did teach
        # Chuck Norris, 23 years his senior. Only a gap no lifetime can bridge is
        # an error, so the test is 50 years, not any inversion at all.
        if sb and tb and sb - tb > 50:
            why = f"student born {tb}, teacher born {sb}: {sb - tb} years apart"
        elif sd and tb and tb > sd:
            why = f"teacher died {sd}, student born {tb}"
        elif td and sb and sb > td:
            why = f"student died {td}, teacher born {sb}"
        if why:
            impossible.append((e, why))
    for e, why in impossible:
        edges.remove(e)
        quality.append({"kind": "impossible_chronology",
                        "node_id": e["source"], "name": (live.get(e["source"]) or {}).get("name_ascii", ""),
                        "detail": f"{(live.get(e['source']) or {}).get('name_ascii','?')} -> "
                                  f"{(live.get(e['target']) or {}).get('name_ascii','?')}: {why}; edge dropped"})
    if impossible:
        print(f"Dropped {len(impossible)} chronologically impossible edges "
              f"(see review/05_data_quality.csv).")

    # Which teacher carried the style. A solid line on the chart asserts exactly
    # that, so it should not be decided by "whichever teacher we are surest of,
    # tie-broken by age", which is what the old rule did. Order of authority:
    #
    #   1. a researched ruling (primary=yes/no on the edge row)
    #   2. the teacher whose own style sits on the student's style chain, when
    #      exactly one teacher qualifies. A student teaching Ryuei-ryu took it
    #      from the Ryuei-ryu teacher, whatever the other links say.
    #   3. failing both, the old heuristic, so a student with no style recorded
    #      still gets one solid line rather than none.
    #
    # The rest stay as documented study that did not carry the style: kept,
    # drawn dash-dot, and excluded from a style-bearing lineage walk.
    def style_chain(sid):
        out, cur, hops = [], sid, 0
        while cur and cur in canon and hops < 10:
            out.append(cur)
            cur = canon[cur].get("parent")
            hops += 1
        return out

    edge_by_target = defaultdict(list)
    for e in edges:
        edge_by_target[e["target"]].append(e)
    prim_stats = {"ruled": 0, "by_style": 0, "heuristic": 0, "single": 0}
    for t, incoming in edge_by_target.items():
        incoming.sort(key=lambda e: (-CONF_RANK[e["confidence"]],
                                     live.get(e["source"], {}).get("birth_year") or 9999, e["source"]))
        if len(incoming) == 1:
            incoming[0]["is_primary"] = True
            incoming[0]["primary_basis"] = "sole"
            prim_stats["single"] += 1
            continue
        ruled = [e for e in incoming if str(e.get("primary", "")).lower() in ("yes", "true", "1")]
        chosen, basis = None, "assumed"
        if len(ruled) == 1:
            chosen, basis = ruled[0], "ruled"
            prim_stats["ruled"] += 1
        else:
            st = (live.get(t) or {}).get("primary_style")
            # A placeholder style is not a style. Norisato Nakaima and Wai Shin Zan
            # both carry "karate-generic", and matching on that displaced Ryu Ryu Ko
            # as the source of Ryuei-ryu, which is the one thing every account agrees on.
            if st and st not in GENERIC:
                anc = set(style_chain(st)) - GENERIC
                def tstyle(e):
                    v = (live.get(e["source"]) or {}).get("primary_style") or ""
                    return "" if v in GENERIC else v
                match = [e for e in incoming
                         if (tstyle(e) and tstyle(e) in anc)
                         or (tstyle(e) and st in set(style_chain(tstyle(e))))]
                if len(match) == 1:
                    chosen, basis = match[0], "style"
                    prim_stats["by_style"] += 1
        if chosen is None:
            chosen = incoming[0]
            prim_stats["heuristic"] += 1
        for e in incoming:
            e["is_primary"] = e is chosen
            # Say how the call was made. Where it is "assumed", the chart is
            # showing a best guess, and a reader is entitled to know that before
            # citing it. These are the rows worth researching next.
            e["primary_basis"] = basis if e is chosen else ("secondary_" + basis)
    for e in edges:
        e.setdefault("is_primary", True)
    print(f"Style-bearing teacher: {prim_stats['single']} had only one teacher; of those with "
          f"several, {prim_stats['ruled']} settled by a researched ruling, "
          f"{prim_stats['by_style']} by matching the student's own style, "
          f"{prim_stats['heuristic']} left to confidence and age.")

    # generation = longest path from any root, via iterative topological DP
    indeg = {n: 0 for n in connected}
    for e in edges:
        indeg[e["target"]] += 1
    order, queue = [], sorted(n for n, d in indeg.items() if d == 0)
    indeg_work = dict(indeg)
    while queue:
        u = queue.pop(0)
        order.append(u)
        added = []
        for v in sorted(children.get(u, [])):
            indeg_work[v] -= 1
            if indeg_work[v] == 0:
                added.append(v)
        queue = sorted(queue + added)
    gen = {n: 0 for n in order}
    for u in order:
        for v in children.get(u, []):
            gen[v] = max(gen[v], gen[u] + 1)

    # descendant counts (distinct), reverse topological
    desc = {n: set() for n in connected}
    for u in reversed(order):
        for v in children.get(u, []):
            desc[u] |= desc[v] | {v}

    for nid, node in live.items():
        node["connected"] = nid in connected
        node["generation"] = gen.get(nid)
        node["n_descendants"] = len(desc.get(nid, ()))
        node["n_students"] = len(children.get(nid, []))

    # ---------- 9. orphan suggestions ----------
    suggestions = []
    conn_by_token = defaultdict(list)
    for nid in connected:
        for tok in norm_name(live[nid]["name_ascii"]).split():
            if len(tok) > 2:
                conn_by_token[tok].append(nid)
    for nid, node in sorted(live.items()):
        if node["connected"]:
            continue
        fams = {canon[c]["family"] for c in node["styles"] if c in canon}
        cands = {}
        for tok in norm_name(node["name_ascii"]).split():
            for c in conn_by_token.get(tok, []):
                cfams = {canon[x]["family"] for x in live[c]["styles"] if x in canon}
                score = 1 + (2 if fams & cfams else 0)
                cands[c] = max(cands.get(c, 0), score)
        top = sorted(cands.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
        if top:
            suggestions.append({
                "orphan_id": nid, "orphan_name": node["name_ascii"],
                "orphan_styles": "|".join(node["styles"]),
                "possible_relatives": "; ".join(
                    f"{live[c]['name_ascii']} ({c}{', shared style family' if v >= 3 else ''})" for c, v in top),
            })

    # ---------- 10. outputs ----------
    OUT.mkdir(exist_ok=True)
    REVIEW.mkdir(exist_ok=True)

    out_nodes = []
    for nid in sorted(live):
        n = live[nid]
        active_est = (n["active_from"] is not None and n["birth_year"] is not None
                      and n["active_from"] == n["birth_year"] + 25)
        out_nodes.append({
            "id": n["id"], "qid": n["qid"], "name": n["name"], "name_ascii": n["name_ascii"],
            "name_romaji": n["name_romaji"], "name_native": n["name_native"],
            "name_alt": sorted(set(n["name_alt"])),
            "birth_year": n["birth_year"], "death_year": n["death_year"], "active_from": n["active_from"],
            "active_from_estimated": active_est,
            "locality": n["locality"], "styles": n["styles"], "primary_style": n["primary_style"],
            "connected": n["connected"], "generation": n["generation"],
            "n_students": n["n_students"], "n_descendants": n["n_descendants"],
            "flags": {"legendary": n["flags"]["legendary"], "wrong_entity": n["flags"]["wrong_entity"],
                      "merged_from": sorted(n["flags"]["merged_from"]),
                      "years_nulled": sorted(n["flags"]["years_nulled"]),
                      "needs_review": n["needs_review"],
                      "added_by_research": n["flags"].get("added_by_research", False)},
            "wikipedia_url": n["wikipedia_url"],
            "honours": sorted(set(n.get("honours", []))),
        })
    out_edges = sorted(edges, key=lambda e: (e["source"], e["target"]))
    for e in out_edges:
        e["id"] = f"{e['source']}->{e['target']}"

    n_conn = sum(1 for n in out_nodes if n["connected"])
    lineage = {
        "meta": {"pipeline_version": PIPELINE_VERSION, "source_hash": source_hash(),
                 "counts": {"nodes": len(out_nodes), "edges": len(out_edges),
                            "connected": n_conn, "orphans": len(out_nodes) - n_conn,
                            "open_review_items": len(decisions) + len(unmapped)}},
        "nodes": out_nodes,
        "edges": out_edges,
    }
    with open(OUT / "lineage.json", "w", encoding="utf-8") as f:
        json.dump(lineage, f, ensure_ascii=False, indent=1, sort_keys=True)
    styles_out = {"styles": sorted(
        ({**c, "aliases": sorted(set(c["aliases"]))} for c in canon.values()), key=lambda c: c["id"])}
    with open(OUT / "styles.json", "w", encoding="utf-8") as f:
        json.dump(styles_out, f, ensure_ascii=False, indent=1, sort_keys=True)

    # ---------- 10b. reconciled flat CSVs (the finalised dataset, for records) ----------
    write_csv(OUT / "nodes_reconciled.csv", [
        {"node_id": n["id"], "name": n["name"], "name_native": n["name_native"] or "",
         "name_romaji": n["name_romaji"] or "", "birth_year": n["birth_year"] or "",
         "death_year": n["death_year"] or "", "trained_from_est": n["active_from"] or "",
         "locality": n["locality"] or "", "styles": "|".join(n["styles"]),
         "primary_style": n["primary_style"] or "", "connected": "yes" if n["connected"] else "",
         "generation": n["generation"] if n["generation"] is not None else "",
         "legendary": "yes" if n["flags"]["legendary"] else "",
         "added_by_research": "yes" if n["flags"].get("added_by_research") else "",
         "wikipedia_url": n["wikipedia_url"] or ""} for n in out_nodes],
        ["node_id", "name", "name_native", "name_romaji", "birth_year", "death_year",
         "trained_from_est", "locality", "styles", "primary_style", "connected",
         "generation", "legendary", "added_by_research", "wikipedia_url"])
    name_of = {n["id"]: n["name"] for n in out_nodes}
    write_csv(OUT / "edges_reconciled.csv", [
        {"teacher_id": e["source"], "teacher": name_of.get(e["source"], ""),
         "student_id": e["target"], "student": name_of.get(e["target"], ""),
         "confidence": e["confidence"], "evidence": " | ".join(e["evidence"]),
         "direction_flipped": "yes" if e["inferred_flip"] else ""} for e in out_edges],
        ["teacher_id", "teacher", "student_id", "student", "confidence", "evidence", "direction_flipped"])

    # ---------- 11. review workbook ----------
    write_csv(REVIEW / "01_applied_fixes.csv", sorted(applied, key=lambda r: (r["kind"], r["what"])),
              ["kind", "what", "reason", "override_file"])
    write_csv(REVIEW / "02_needs_your_decision.csv", sorted(decisions, key=lambda r: (r["kind"], r["who"])),
              ["kind", "who", "question", "context", "override_file", "row_key"])
    write_csv(REVIEW / "03_unmapped_styles.csv",
              [{"raw_style": k, "n_people": v} for k, v in sorted(unmapped.items(), key=lambda kv: (-kv[1], kv[0]))],
              ["raw_style", "n_people"])
    write_csv(REVIEW / "04_orphan_suggestions.csv", suggestions,
              ["orphan_id", "orphan_name", "orphan_styles", "possible_relatives"])
    quality_live = [q for q in quality if q.get("node_id", "") not in dropped_nodes]
    write_csv(REVIEW / "05_data_quality.csv", sorted(quality_live, key=lambda r: (r["kind"], r["name"])),
              ["kind", "node_id", "name", "detail"])

    summary = (
        f"Karate lineage pipeline v{PIPELINE_VERSION}  (source hash {lineage['meta']['source_hash']})\n"
        f"\n"
        f"Nodes: {len(out_nodes)} ({n_conn} connected, {len(out_nodes) - n_conn} orphans)\n"
        f"Edges: {len(out_edges)} (guaranteed acyclic)\n"
        f"Dropped as non-person / merged away: {len(dropped_nodes)}\n"
        f"Canonical styles: {len(canon)}\n"
        f"Native-script names: {n_native}; romaji forms: {n_romaji}\n"
        f"Note: every instructor_start_year in the source equals birth + 25, so all\n"
        f"'trained from' dates are flagged estimated (shown with * in the cladogram).\n"
        f"\n"
        f"Review files:\n"
        f"  01_applied_fixes.csv        {len(applied)} fixes applied automatically - veto by setting status=rejected in overrides/\n"
        f"  02_needs_your_decision.csv  {len(decisions)} items waiting on you - set status in the named override file\n"
        f"  03_unmapped_styles.csv      {len(unmapped)} style strings with no mapping yet\n"
        f"  04_orphan_suggestions.csv   {len(suggestions)} orphans with possible relatives (suggestions only)\n"
        f"  05_data_quality.csv         {len(quality_live)} oddities logged (nulled years, broken cycles, stale overrides)\n"
    )
    (REVIEW / "00_SUMMARY.txt").write_text(summary, encoding="utf-8")
    print(summary)


if __name__ == "__main__":
    main()
