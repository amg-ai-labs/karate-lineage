#!/usr/bin/env python3
"""Build the karate lineage cladogram HTML from pipeline output.

Reads  ../out/lineage.json + ../out/styles.json
Writes ../../karate-cladogram.html          (single self-contained file)
       ../out/viz_data.json                 (the baked payload, for inspection)

Layout: layered (Sugiyama) per weakly-connected component, layers pinned to
generation, barycentre crossing reduction, priority-based coordinate
assignment with variable node widths, then a diagonal shear so generations
flow top-left to bottom-right. Pure stdlib.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "out"
TARGET = HERE.parent.parent / "karate-cladogram.html"

sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import gate                                    # noqa: E402  (path set above)
import kata as kata_module                     # noqa: E402
KEYFILE = gate.KEYFILE

ROW_H = 46               # vertical slot per person within a column
GAP = 10                 # extra min gap between slots (soft)
COL_GAP = 90             # horizontal gap between generation columns
EMPTY_W = 26             # width of a decade column nobody was born in
EMPTY_GAP = 14           # gap after an empty column (runs stay narrow)
SHEAR_Y = 12             # downward drift per generation (diagonal flow)
ISLAND_GAP = 220         # gap between component blocks
CHAR_W = 6.9             # approx px per char, 12px system sans
CHAR_W_CJK = 12.5        # approx px per CJK char beside the name
CHAR_W2 = 5.3            # approx px per char, 10.5px secondary line

# Categorical palette: reference instance of the dataviz method, adopted
# verbatim (validated slot order; worst adjacent CVD dE 24.2 light / 10.3
# dark). 8 hue slots + 2 neutrals; sub-styles are tints of the family hue.
FAMILY_SLOTS = [
    ("shuri-te",  "Shuri-te lineage",   "#2a78d6", "#3987e5"),
    ("naha-te",   "Naha-te lineage",    "#1baf7a", "#199e70"),
    ("tomari-te", "Tomari-te lineage",  "#eda100", "#c98500"),
    ("uechi-ryu", "Uechi-Ryū",          "#008300", "#008300"),
    ("japanese",  "Japanese karate",    "#4a3aa7", "#9085e9"),
    ("kyokushin", "Kyokushin & offshoots", "#e34948", "#e66767"),
    ("korean",    "Korean arts",        "#e87ba4", "#d55181"),
    ("kenpo",     "Kenpō lines",        "#eb6834", "#d95926"),
]
# neutral non-hue classes (warm brown-grey for antecedents, grey for other)
NEUTRAL_TE = ("te", "Antecedents (Te / Chinese)", "#8a7358", "#a68d6f")
NEUTRAL_OTHER = ("other", "Other / unspecified", "#898781", "#898781")
FOLD = {"chinese": "te", "kobudo": "other", "other": "other", "te": "te"}


def mix(hex_a, hex_b, t):
    a = [int(hex_a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(a[i] + (b[i] - a[i]) * t):02x}" for i in range(3))


def build_style_colours(styles):
    by_id = {s["id"]: s for s in styles}

    def depth(sid, seen=None):
        seen = seen or set()
        d = 0
        while sid in by_id and by_id[sid].get("parent") and sid not in seen:
            seen.add(sid)
            sid = by_id[sid]["parent"]
            d += 1
        return d

    fam_light = {k: l for k, _, l, _ in FAMILY_SLOTS}
    fam_dark = {k: d for k, _, _, d in FAMILY_SLOTS}
    for key, _, l, d in (NEUTRAL_TE, NEUTRAL_OTHER):
        fam_light[key], fam_dark[key] = l, d
    colours = {}
    for s in styles:
        fam = FOLD.get(s["family"], s["family"])
        if fam not in fam_light:
            fam = "other"
        t = min(depth(s["id"]), 2) * 0.16   # tint deeper sub-styles
        colours[s["id"]] = {
            "family": fam,
            "light": mix(fam_light[fam], "#fcfcfb", t),
            "dark": mix(fam_dark[fam], "#1a1a19", t),
        }
    return colours


# ---------------- layout ----------------

def font_size(n):
    """Cartographic name hierarchy: founders large, minor figures small.
    Must match the tiers in app.js."""
    d = n["n_descendants"]
    return 16 if d >= 60 else 13.5 if d >= 20 else 12 if d >= 5 else 11


def label_width(n):
    """World-space width of the two-line label block, from the dot centre."""
    fs = font_size(n)
    line1 = len(n["name"]) * CHAR_W * (fs / 12)
    if n.get("name_native"):
        line1 += 6 + len(n["name_native"]) * CHAR_W_CJK * (fs / 12)
    bits = []
    if n["birth_year"] or n["death_year"]:
        bits.append("0000–0000")
    else:
        bits.append("c. 0000 (est.)")   # estimated cohort shown when undated
    if n["active_from"]:
        bits.append("tr. c.0000*")
    if n.get("style_label"):
        bits.append(n["style_label"])
    fs2 = 11 if fs >= 13.5 else 10.5
    line2 = len(" · ".join(bits)) * CHAR_W2 * (fs2 / 10.5)
    return max(line1, line2, 36) + 30   # dot offset + breathing room


def order_layers(comp, layers, parents, children):
    """Median-barycentre sweeps keeping the best-seen configuration (the
    DFS initial order is itself a candidate), then transposition polish.
    Mutates layer order in place."""
    pos = {}

    def reindex():
        for layer in layers:
            for i, v in enumerate(layer):
                pos[v] = i

    reindex()

    def bary(v, neigh):
        ns = sorted(pos[u] for u in neigh.get(v, []) if u in pos)
        if not ns:
            return pos[v]
        m = len(ns) // 2
        return ns[m] if len(ns) % 2 else (ns[m - 1] + ns[m]) / 2

    def crossings(a_layer, b_layer):
        pairs = []
        bpos = {v: i for i, v in enumerate(b_layer)}
        for i, u in enumerate(a_layer):
            for w in children.get(u, []):
                if w in bpos:
                    pairs.append((i, bpos[w]))
        pairs.sort()
        cnt, seen = 0, []
        for _, y in pairs:
            cnt += sum(1 for s in seen if s > y)
            seen.append(y)
        return cnt

    def total():
        return sum(crossings(layers[i], layers[i + 1]) for i in range(len(layers) - 1))

    best = [list(l) for l in layers]
    best_c = total()
    for it in range(16):
        down = it % 2 == 0
        rng = range(1, len(layers)) if down else range(len(layers) - 2, -1, -1)
        neigh = parents if down else children
        for li in rng:
            layers[li].sort(key=lambda v: (bary(v, neigh), pos[v]))
            reindex()
        c = total()
        if c < best_c:
            best_c = c
            best = [list(l) for l in layers]
    for i, l in enumerate(best):
        layers[i][:] = l
    reindex()
    # transposition polish (only ever improves)
    for _ in range(4):
        improved = False
        for li, layer in enumerate(layers):
            for i in range(len(layer) - 1):
                before = (crossings(layers[li - 1], layer) if li > 0 else 0) + \
                         (crossings(layer, layers[li + 1]) if li < len(layers) - 1 else 0)
                layer[i], layer[i + 1] = layer[i + 1], layer[i]
                reindex()
                after = (crossings(layers[li - 1], layer) if li > 0 else 0) + \
                        (crossings(layer, layers[li + 1]) if li < len(layers) - 1 else 0)
                if after < before:
                    improved = True
                else:
                    layer[i], layer[i + 1] = layer[i + 1], layer[i]
                    reindex()
        if not improved:
            break


def assign_coords(layers, parents, children, prio, edge_w):
    """Vertical (within-column) coordinate relaxation: each pass pulls nodes
    toward the weighted mean y of their neighbours, then restores ordering
    with a top-to-bottom spread re-centred on the pre-spread mean. Slots are
    uniform (ROW_H), so monotonic order == no overlap."""
    PITCH = ROW_H + GAP
    y = {}
    for layer in layers:
        for i, v in enumerate(layer):
            y[v] = i * PITCH

    def desired(v, neigh):
        num = den = 0.0
        for u in neigh.get(v, []):
            if u in y:
                w = (edge_w.get((u, v)) or edge_w.get((v, u)) or 1.0) * (1 + prio.get(u, 0) * 1e-6)
                num += y[u] * w
                den += w
        return num / den if den else None

    def relax(layer, neigh):
        if not layer:
            return
        for v in layer:
            t = desired(v, neigh)
            if t is not None:
                y[v] = y[v] * 0.25 + t * 0.75
        before = sum(y[v] for v in layer) / len(layer)
        for i in range(1, len(layer)):
            lo = y[layer[i - 1]] + PITCH
            if y[layer[i]] < lo:
                y[layer[i]] = lo
        after = sum(y[v] for v in layer) / len(layer)
        for v in layer:
            y[v] += before - after

    for rnd in range(14):
        down = rnd % 2 == 0
        rng = range(1, len(layers)) if down else range(len(layers) - 2, -1, -1)
        neigh = parents if down else children
        for li in rng:
            relax(layers[li], neigh)
    for layer in layers:              # final integrity sweep
        for i in range(1, len(layer)):
            lo = y[layer[i - 1]] + PITCH
            if y[layer[i]] < lo:
                y[layer[i]] = lo
    return y


ERA_BIN = 10    # years per column: decade-of-birth cohorts


def estimate_births(comp, nodes, parents, children):
    """Birth year per node: known values fixed, unknowns relaxed from
    neighbours (teacher ~28 years older than student), seeded from
    longest-path depth so isolated chains still land sensibly."""
    # structural depth as a seed
    indeg = {v: len(parents.get(v, [])) for v in comp}
    depth = {v: 0 for v in comp if indeg[v] == 0}
    queue = sorted(depth)
    work = dict(indeg)
    while queue:
        u = queue.pop(0)
        for v in sorted(children.get(u, [])):
            depth[v] = max(depth.get(v, 0), depth[u] + 1)
            work[v] -= 1
            if work[v] == 0:
                queue.append(v)
    known = {v: nodes[v]["birth_year"] for v in comp if nodes[v]["birth_year"]}
    if known:
        base = min(known.values())
    else:
        base = 1650
    order = sorted(comp)         # fixed sweep order: byte-identical reruns
    est = {v: known.get(v, base + depth.get(v, 0) * 28) for v in order}
    for _ in range(40):
        for v in order:
            if v in known:
                continue
            guesses = [est[u] + 28 for u in parents.get(v, [])] + \
                      [est[u] - 28 for u in children.get(v, [])]
            if guesses:
                est[v] = sum(guesses) / len(guesses)
    return {v: max(1600, min(1996, e)) for v, e in est.items()}


def layout_component(comp_ids, nodes, edges):
    comp = set(comp_ids)
    parents = defaultdict(list)
    children = defaultdict(list)
    edge_w = {}
    for e in edges:
        s, t = e["source"], e["target"]
        if s in comp and t in comp:
            parents[t].append(s)
            children[s].append(t)
            edge_w[(s, t)] = 3.0 if e["is_primary"] else 1.0
    # columns are TIME: 25-year birth cohorts (estimated where unknown)
    est = estimate_births(comp, nodes, parents, children)
    era0 = int(min(est.values()) // ERA_BIN) * ERA_BIN
    gen = {v: int((est[v] - era0) // ERA_BIN) for v in comp}
    n_layers = max(gen.values()) + 1 if gen else 1
    layers = [[] for _ in range(n_layers)]
    # deterministic initial order: DFS from roots following primary edges
    seen = set()
    stack = sorted([v for v in comp if not parents.get(v)],
                   key=lambda v: (-nodes[v]["n_descendants"], v))
    while stack:
        u = stack.pop(0)
        if u in seen:
            continue
        seen.add(u)
        layers[gen[u]].append(u)
        kids = sorted(children.get(u, []), key=lambda v: -nodes[v]["n_descendants"])
        stack = kids + stack
    for v in sorted(comp):   # safety: anything unreached
        if v not in seen:
            layers[gen[v]].append(v)
            seen.add(v)

    prio = {v: nodes[v]["n_descendants"] * 10 + len(parents.get(v, [])) + len(children.get(v, [])) for v in comp}
    order_layers(comp, layers, parents, children)
    y = assign_coords(layers, parents, children, prio, edge_w)

    # busy era columns split into side-by-side lanes so the canvas stays
    # screen-shaped; consecutive (barycentre-ordered) people share a lane
    LANE_CAP = 42
    lane_of, lane_idx = {}, {}
    lanes_per_col = []
    for layer in layers:
        n_lanes = max(1, -(-len(layer) // LANE_CAP))
        per = -(-len(layer) // n_lanes) if layer else 0
        order = sorted(layer, key=lambda v: y[v])
        for i, v in enumerate(order):
            lane_of[v] = i // per if per else 0
            lane_idx[v] = i % per if per else 0
        lanes_per_col.append(n_lanes)

    col_w, lane_w = [], []
    for g, layer in enumerate(layers):
        if not layer:            # a decade nobody was born in stays narrow
            lane_w.append([EMPTY_W])
            col_w.append(EMPTY_W)
            continue
        widths = [max((label_width(nodes[v]) for v in layer if lane_of[v] == ln), default=80)
                  for ln in range(lanes_per_col[g])]
        lane_w.append(widths)
        col_w.append(sum(widths) + 34 * (len(widths) - 1))
    col_x = []
    cx = 0.0
    for g, w in enumerate(col_w):
        col_x.append(cx)
        cx += w + (COL_GAP if layers[g] else EMPTY_GAP)

    PITCH = ROW_H + GAP
    coords = {}
    for g, layer in enumerate(layers):
        # sparse columns keep some of the relaxed alignment, but compressed
        # so no column outgrows a lane's height
        order = sorted(layer, key=lambda v: y[v])
        span_cap = (LANE_CAP - 1) * PITCH
        if layer and lanes_per_col[g] == 1:
            raw = [y[v] for v in order]
            lo, hi = raw[0], raw[-1]
            scale = min(1.0, span_cap / (hi - lo)) if hi > lo else 1.0
            comp_y = {}
            prev = None
            for v in order:
                cy = (y[v] - lo) * scale
                if prev is not None and cy < prev + PITCH:
                    cy = prev + PITCH
                comp_y[v] = cy
                prev = cy
        else:
            comp_y = {v: lane_idx[v] * PITCH for v in layer}
        for v in layer:
            lx = col_x[g] + sum(lane_w[g][:lane_of[v]]) + 34 * lane_of[v]
            coords[v] = {"x": lx, "y": comp_y[v] + g * SHEAR_Y, "gen": g,
                         "eb": int(round(est[v] / 5.0) * 5)}
    w = cx - COL_GAP if comp else 0
    h = max(c["y"] for c in coords.values()) + ROW_H if comp else 0
    cols = [{"gen": g, "x0": col_x[g] - 20, "x1": col_x[g] + col_w[g] + 20,
             "y0": era0 + g * ERA_BIN, "y1": era0 + g * ERA_BIN + ERA_BIN - 1,
             "n": len(layers[g])} for g in range(n_layers)]
    return coords, cols, w, h, n_layers


def main():
    lineage = json.load(open(OUT / "lineage.json", encoding="utf-8"))
    styles = json.load(open(OUT / "styles.json", encoding="utf-8"))["styles"]
    kata = kata_module.load(OUT, OUT.parent / "overrides")[0] if (OUT / "kata.json").exists() else []
    rank_path = OUT / "rankings.json"
    rankings = json.load(open(rank_path, encoding="utf-8")) if rank_path.exists() else None
    style_by_id = {s["id"]: s for s in styles}
    colours = build_style_colours(styles)

    nodes = {n["id"]: n for n in lineage["nodes"]}
    # kobudo involvement uses the pre-fold family from styles.json
    raw_family = {s["id"]: s["family"] for s in styles}
    for n in nodes.values():
        ps = n["primary_style"]
        n["style_label"] = style_by_id[ps]["label"] if ps and ps in style_by_id else ""
        n["family"] = colours[ps]["family"] if ps and ps in colours else "other"
        n["kobudo"] = any(raw_family.get(s) == "kobudo" for s in n["styles"])
        n["family_inherited"] = False
    edges = lineage["edges"]

    # clade colouring: a person with no recorded style inherits their primary
    # teacher's family, so lineages read as continuous coloured streams
    primary_teacher = {e["target"]: e["source"] for e in edges if e["is_primary"]}
    for nid, n in nodes.items():
        if n["family"] != "other":
            continue
        t, hops = primary_teacher.get(nid), 0
        while t and hops < 14:
            if nodes[t]["family"] not in ("other",):
                n["family"] = nodes[t]["family"]
                n["family_inherited"] = True
                break
            t, hops = primary_teacher.get(t), hops + 1

    # components over connected nodes
    adj = defaultdict(set)
    for e in edges:
        adj[e["source"]].add(e["target"])
        adj[e["target"]].add(e["source"])
    seen, comps = set(), []
    for v in sorted(adj):
        if v in seen:
            continue
        c, st = set(), [v]
        while st:
            u = st.pop()
            if u in seen:
                continue
            seen.add(u)
            c.add(u)
            st.extend(adj[u] - seen)
        comps.append(sorted(c))
    comps.sort(key=len, reverse=True)

    placed, blocks = {}, []
    # main component at origin
    main_coords, main_cols, mw, mh, m_layers = layout_component(comps[0], nodes, edges)
    placed.update({v: c for v, c in main_coords.items()})
    blocks.append({"kind": "main", "x": 0, "y": 0, "w": mw, "h": mh, "layers": m_layers})

    # unlinked groups sit in a strip along the foot of the canvas, each person
    # under the era column their estimated birth belongs to
    stray_base = mh + 150
    PITCH = ROW_H + GAP
    stray_next, stray_count = {}, 0
    for comp in comps[1:]:
        cset = set(comp)
        par2, chi2 = defaultdict(list), defaultdict(list)
        for e in edges:
            if e["source"] in cset and e["target"] in cset:
                par2[e["target"]].append(e["source"])
                chi2[e["source"]].append(e["target"])
        est2 = estimate_births(cset, nodes, par2, chi2)
        for v in sorted(comp, key=lambda x: (est2[x], x)):
            yr = est2[v]
            col = min(main_cols, key=lambda c: 0 if c["y0"] <= yr <= c["y1"]
                      else min(abs(yr - c["y0"]), abs(yr - c["y1"])))
            y = stray_next.get(col["gen"], stray_base)
            stray_next[col["gen"]] = y + PITCH
            placed[v] = {"x": col["x0"] + 20, "y": y, "gen": col["gen"],
                         "eb": int(round(yr / 5.0) * 5)}
            stray_count += 1
    if stray_count:
        blocks[0]["h"] = max(stray_next.values()) + ROW_H
        blocks[0]["strayY"] = stray_base - 34
        blocks[0]["strayCount"] = stray_count

    # time columns of the main component: 25-year birth cohorts + naming epoch
    def epoch(year):
        if year < 1830:
            return "ti era"
        if year < 1880:
            return "ti → tōde"
        if year < 1920:
            return "tōde → karate"
        return "karate era"

    bands = []
    for col in main_cols:
        if col["n"] == 0:        # runs of empty decades merge into one narrow gap
            if bands and bands[-1]["empty"]:
                bands[-1]["x1"] = round(col["x1"], 1)
                continue
            bands.append({"gen": col["gen"], "caption": "", "epoch": "", "empty": True,
                          "x0": round(col["x0"], 1), "x1": round(col["x1"], 1)})
            continue
        bands.append({"gen": col["gen"], "caption": f"born {col['y0']}–{str(col['y1'])[2:]}",
                      "epoch": epoch(col["y0"]), "empty": False,
                      "x0": round(col["x0"], 1), "x1": round(col["x1"], 1)})
    for b in reversed(bands):    # the tree is alive: the last cohort stays open
        if not b["empty"]:
            b["caption"] = b["caption"].split("–")[0] + "–"
            break

    payload = {
        "meta": {**lineage["meta"], "row_h": ROW_H + GAP, "shear_y": SHEAR_Y},
        "families": [{"id": k, "label": lb, "light": l, "dark": d}
                     for k, lb, l, d in FAMILY_SLOTS] +
                    [{"id": k, "label": lb, "light": l, "dark": d}
                     for k, lb, l, d in (NEUTRAL_TE, NEUTRAL_OTHER)],
        "styleColours": colours,
        "kata": kata,
        "rankings": rankings,
        "styles": [{"id": s["id"], "label": s["label"], "parent": s["parent"],
                    "famRaw": raw_family.get(s["id"], "other"),
                    "founder": s.get("founder") or "", "founded": s.get("founded") or "",
                    "hybrid": s.get("hybrid_with") or "",
                    "family": colours[s["id"]]["family"]} for s in styles],
        "bands": bands,
        "blocks": blocks,
        "nodes": [],
        "edges": [{"source": e["source"], "target": e["target"],
                   "primary": e["is_primary"], "confidence": e["confidence"],
                   "pbasis": e.get("primary_basis", ""),
                   "evidence": e["evidence"]} for e in edges],
    }
    for nid, n in sorted(nodes.items()):
        row = {
            "id": nid, "name": n["name"], "ascii": n["name_ascii"],
            "romaji": n.get("name_romaji"), "native": n.get("name_native"),
            "alt": n["name_alt"], "birth": n["birth_year"], "death": n["death_year"],
            "trained": n["active_from"], "trainedEst": n.get("active_from_estimated", False),
            "locality": n["locality"], "styles": n["styles"], "primary": n["primary_style"],
            "styleLabel": n["style_label"], "family": n["family"],
            "students": n["n_students"], "desc": n["n_descendants"],
            "flags": n["flags"], "wiki": n["wikipedia_url"], "connected": n["connected"],
            "lw": round(label_width(n), 1), "kob": n["kobudo"],
            "famInherited": n["family_inherited"],
        }
        if n.get("honours"):
            row["hon"] = n["honours"]
        if nid in placed:
            row["x"] = round(placed[nid]["x"], 1)
            row["y"] = placed[nid]["y"]
            row["gen"] = placed[nid]["gen"]
            if not n["birth_year"] and placed[nid].get("eb"):
                row["eb"] = placed[nid]["eb"]   # estimated birth, relaxed from neighbours
        payload["nodes"].append(row)

    with open(OUT / "viz_data.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    template = (HERE / "template.html").read_text(encoding="utf-8")
    app = (HERE / "app.js").read_text(encoding="utf-8")
    css = (HERE / "style.css").read_text(encoding="utf-8")
    def render(pl):
        data_js = json.dumps(pl, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        return (template
                .replace("/*__STYLE__*/", css)
                .replace("__DATA_JSON__", data_js.replace("</", "<\\/"))
                .replace("/*__APP__*/", app))

    # The site pages live under docs/. Each copy of the chart sits at a
    # different depth relative to them, so the navigation prefix is per-copy:
    # the curator's file is beside docs/, the published page is inside it, and
    # the gated copy is one level further down. A single href cannot serve all
    # three, which is why the links worked from exactly one of them.
    html = render(payload).replace("__SITE__", "docs/")
    TARGET.write_text(html, encoding="utf-8")

    # The published copies are built WITHOUT the evidence layer. Hiding sources in
    # the interface is cosmetic: anyone can read a page's source. So the material
    # is removed from the payload itself, and only the curator's local file
    # (karate-cladogram.html, above) carries it.
    pub = json.loads(json.dumps(payload))
    pub["meta"] = {k: v for k, v in pub["meta"].items()
                   if k not in ("source_hash", "pipeline_version")}
    for e in pub["edges"]:
        e.pop("evidence", None)                       # research: / wikidata: tokens
    for n in pub["nodes"]:
        n.pop("wiki", None)                           # wikipedia_url
        n.pop("flags", None)                          # internal review state
        if n.get("hon"):                              # keep the honour, drop its citation
            n["hon"] = [re.sub(r"\s+—\s+.*$", "", h) for h in n["hon"]]
    for k in pub["kata"]:
        k.pop("sources", None)
        if k.get("note"):                             # internal verifier remarks
            k["note"] = k["note"].split("[Verifier:")[0].strip()
        # kata relations carry their own citations, and stripping only the
        # kata-level sources left those in the published payload
        for r in (k.get("relations") or []):
            r.pop("sources", None)
            r.pop("verifier", None)
    pub_html = render(pub).replace("__SITE__", "")
    for folder in ("website", "docs"):
        site = TARGET.parent / folder / "index.html"
        site.parent.mkdir(exist_ok=True)
        site.write_text(pub_html, encoding="utf-8")

    kb, pkb = len(html.encode()) // 1024, len(pub_html.encode()) // 1024
    ev = sum(len(e.get("evidence", [])) for e in payload["edges"])
    print(f"wrote {TARGET.name} ({kb} KB, curator: {ev} source citations): "
          f"{sum(1 for n in payload['nodes'] if 'x' in n)} placed nodes, "
          f"{len(edges)} edges, {len(blocks)} blocks")
    print(f"wrote docs/ and website/ index.html ({pkb} KB, public: evidence layer removed)")

    write_gated(payload, template, app, css)


def write_gated(payload, template, app, css):
    """The curator build again, at /hutan, with its payload encrypted.

    The public site and the curator's local file are the two ends of the
    original design. This is the third case the design did not have: one other
    person needs the full copy, over the web, from a public repository. A quiet
    path would not do it, because the file is in the repo and one inbound link
    puts it in a search index, so the payload itself is encrypted and the path
    is only where it lives. Same app, same data as karate-cladogram.html."""
    if not KEYFILE.exists():
        print("no pipeline/curator_key.txt: skipping the gated /hutan build")
        return
    passphrase = KEYFILE.read_text(encoding="utf-8").strip()
    if not passphrase:
        print("pipeline/curator_key.txt is empty: skipping the gated /hutan build")
        return

    data_js = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    blob, packed = gate.encrypt(data_js.encode("utf-8"), passphrase)
    # The build verifies its own output rather than trusting it: a page that
    # cannot be decrypted is indistinguishable, from the outside, from a page
    # whose passphrase the reader has typed wrongly.
    assert gate.decrypt(blob, passphrase).decode("utf-8") == data_js, \
        "gated payload failed to round-trip"

    page = (template
            .replace("/*__STYLE__*/", css + "\n" + (HERE / "gate.css").read_text(encoding="utf-8"))
            .replace("__DATA_JSON__", "")
            .replace("/*__APP__*/", "")
            .replace("<title>The Lineage of Karate &amp; Taekwondo</title>",
                     "<title>The Lineage of Karate &amp; Taekwondo — curator copy</title>")
            .replace('<meta name="viewport" content="width=device-width, initial-scale=1">',
                     '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
                     '<meta name="robots" content="noindex, nofollow">')
            .replace("<body>", '<body class="locked">')
            .replace("__SITE__", "../"))
    # app source travels as inert text and is executed by the gate after the
    # data exists, since app.js reads #data on its first line
    if "</script" in app:
        raise SystemExit("app.js contains '</script', which cannot be embedded as text")
    tail = ((HERE / "gate.html").read_text(encoding="utf-8")
            + '<script id="appsrc" type="text/plain">' + app + "</script>\n"
            + '<script id="blob" type="text/plain">' + blob + "</script>\n"
            + "<script>\n" + (HERE / "gate.js").read_text(encoding="utf-8") + "\n</script>\n")
    page = page.replace("</body>", tail + "</body>")

    for folder in ("website", "docs"):
        site = TARGET.parent / folder / "hutan" / "index.html"
        site.parent.mkdir(parents=True, exist_ok=True)
        site.write_text(page, encoding="utf-8")
    print(f"wrote docs/hutan/ and website/hutan/ index.html "
          f"({len(page.encode()) // 1024} KB, encrypted: {packed // 1024} KB of payload "
          f"behind {gate.ITERATIONS:,} PBKDF2 rounds)")


if __name__ == "__main__":
    main()
