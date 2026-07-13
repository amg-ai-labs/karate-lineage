# Karate lineage pipeline & cladogram

Turns `../nodes.csv` and `../edges.csv` (your compiled Wikipedia data, never
modified by this pipeline) into a clean, cycle-free lineage graph, and builds
the interactive cladogram from it.

## Run it

```
cd pipeline
python3 build.py        # clean the data AND rebuild karate-cladogram.html
```

No installation needed (plain Python, no packages). `python3 clean.py` runs
the data stage alone; `python3 viz/build_viz.py` rebuilds just the HTML.
Outputs land in `out/` (for the visualisation), `review/` (for you), and the
finished `karate-cladogram.html` lands next to `nodes.csv` — double-click it
to open; it works offline and can be shared as a single file.

## The folders

- `overrides/` — every cleaning decision, one CSV per decision type. These
  are the pipeline's memory: edit these, never the outputs.
- `review/` — regenerated on every run. Open in Excel or Numbers.
- `out/` — `lineage.json` (the clean graph) and `styles.json` (the style
  taxonomy). Consumed by the visualisation; do not edit by hand.

## How to review (the loop)

1. Run `python3 clean.py`.
2. Read `review/00_SUMMARY.txt`.
3. `review/02_needs_your_decision.csv` lists items waiting on you. Each row
   names the override file and row. Open that file in `overrides/`, find the
   row, and change its `status`:
   - `confirmed` — apply it, stop asking
   - `rejected` — do not apply
   - leave as `needs_decision` to keep it on the list
4. `review/01_applied_fixes.csv` lists fixes applied automatically (status
   `proposed`). Skim it; veto anything wrong by setting that row's status to
   `rejected` in the named override file.
5. Re-run. The review files shrink as decisions accumulate.

## Override files

| File | One row per | Applied when status is |
|---|---|---|
| `node_verdicts.csv` | scraped entity that is not a plain person (non-person to drop, legendary figure to flag, suspected wrong Wikidata match) | `proposed` / `confirmed` |
| `node_merges.csv` | duplicate person merged into a survivor id | `proposed` / `confirmed` |
| `edge_fixes.csv` | teacher–student edge to flip, drop, or repoint | `proposed` / `confirmed` |
| `style_map.csv` | raw style string mapped to a canonical style (id, label, parent, family) | anything except `rejected` |
| `year_fixes.csv` | manual year correction | `proposed` / `confirmed` |
| `name_fixes.csv` | name correction: `display_name` (anglicised form shown on the tree), `name_romaji` (macron form), `name_native` (original kanji/hangul/hanzi) | `proposed` / `confirmed` |

The cladogram's edit panel exports rows in `name_fixes.csv` format, so
corrections made while browsing the tree can be pasted straight into that
file and re-run.

Safety nets that run regardless of overrides: malformed and out-of-range
years are nulled (logged in `05_data_quality.csv`), self-loops are removed,
and any cycle that survives the edge fixes is broken at its lowest-confidence
edge and logged loudly. The output is always a valid DAG.

## Adding new people or edges

Just add rows to `../nodes.csv` / `../edges.csv` as before and re-run.
`review/04_orphan_suggestions.csv` lists people who have no edges yet, with
possible relatives already in the tree (same name tokens, shared style
family) — suggestions only, nothing is ever auto-linked.
