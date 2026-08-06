# The Lineage of Karate and Taekwondo

An interactive cladogram of who taught whom in karate, kobudō and taekwondo: **1,459 people, 1,881 instructor-to-student links, 388 styles and 493 kata**, spanning nineteen generations from the Okinawan *te* of the 1600s to practitioners born in the 1990s.

Every link carries its sources. Every disputed claim is marked as disputed.

**[▶ Open the interactive cladogram](https://amg-ai-labs.github.io/karate-lineage/)**

![The lineage of Chōjun Miyagi](docs/img/miyagi-clade.png)

*The Gōjū-ryū clade: Chōjun Miyagi and the 405 people who descend from him. Exported directly from the tool as vector art.*

---

## What this is

Martial-arts lineage is usually recorded as folklore: a chart on a dojo wall, a paragraph in a style's own history, a claim of descent nobody has checked. This project treats it as a dataset. Each person is a node, each teacher-to-student relationship is an edge, and each edge is graded by the strength of the evidence behind it and linked to its source.

The result is a single connected tree rather than a set of competing family myths. 1,297 of the 1,459 people sit in one lineage; the remaining 162 are honestly marked as unlinked rather than joined by guesswork.

## The evidence

| Confidence | Links | What it means |
|---|---:|---|
| High | 1,012 | First-hand testimony, an interview, or a primary record |
| Medium | 670 | Documented in published histories or a style's own records |
| Low | 199 | Oral tradition, contested, or inferred from indirect evidence |

**287 links cite Mark Bishop's *Okinawan Karate: Teachers, Styles and Secret Techniques*.** Bishop interviewed the Okinawan masters directly in the 1970s and 80s, so his first-hand statements are treated as primary evidence and his relayed traditions are graded lower. The book itself is not redistributed here; it is cited by page.

The dataset began as a Wikipedia and Wikidata scrape, but little of it now rests there. It has been through a multilingual research pass (Japanese, Korean and Chinese sources), a historian's audit of every edge and every person, a four-level style taxonomy, eight books (Mark Bishop's *Okinawan Karate*; Shoshin Nagamine's *Tales of Okinawa's Great Masters* and *Essence of Okinawan Karate-Do*; Mark Cramer's *The History of Karate*; Andrea Guarelli's *Okinawan Kobudo*; Patrick McCarthy's *Koryu Uchinadi* volumes 1 and 2, the first of which is Taira Shinken's *Ryukyu Kobudo Taikan* in translation; and Seikichi Toguchi's *Okinawan Goju-Ryu*), the online scholarship of Andreas Quast and Motobu Naoki, and the Okinawa Karate News hanshi 10th-dan register (2018), whose 146 masters are all reconciled into the dataset. Corrections that survived that process live in [`pipeline/overrides/`](pipeline/overrides/), 5,953 rows deep, each carrying a reason and its sources.

Some of what the audit threw out: Richard Kim's claimed teacher was a namesake; the Funakoshi to Plée link is false; the Motobu to Mitose link was inferred from a photograph; and a "Yoshio Nakamura" turned out to be a judoka born in 1970. Wrong-entity matches like these are the most common failure of scraped lineage data, and there were 24 of them.

## What it does

- **Click any name** to isolate that person's lineage and read their record.
- **Click any line** to see the evidence for that specific teacher-to-student claim, with live source links.
- **Browse the style tree**: originating group → style → sub-style → sub-sub-style, seven levels deep, each with its founder and founding year. Filtering a style includes everything beneath it.
- **Browse the kata**: 493 kata and forms across karate, kobudō, taekwondo and tang soo do, each with its meaning, date of introduction, likely creator, likely modifier and modification date, provenance, and the styles that practise it. Every kata has a person attached wherever one is recorded, and contested attributions are marked as disputed rather than smoothed over.
- **Follow a kata between styles.** Forms are related explicitly rather than lumped together: the same kata under another name, a close variant, a later derivative, a shared ancestor, or merely a shared name. Kata written with the same characters are shown as one form read differently, even where the relationship has not yet been researched, and the gaps are listed rather than hidden.
- **Read the analytics**: eight separate measures of connectivity (reach, prominent students, students taught, teachers studied under, diversity of those teachers, stylistic spread, depth of line) plus the lineages that ended with their holder. The measures are reported separately, never combined into one score, and each states its method.
- **Export a publication-grade chart** of any person's clade or any style's clade, at a chosen number of generations, as vector SVG, print PDF (300 dpi), TIFF, JPG or PNG. The chart is re-laid out compactly for print, so it carries no empty space. The image above was produced this way.
- **Export the data** for any person, style or sub-style as CSV (a node table and an edge table), JSON, or GraphML that opens directly in Gephi, Cytoscape or yEd.
- **Correct the data in the browser**, on the curator's copy. Names, dates, teachers, students and kata relationships can be edited, added or flagged, and the corrections export as CSVs that feed straight back into the pipeline. The published site is read-only: it searches, browses and reads, and offers no export and no edit.

## How it is built

```
nodes.csv, edges.csv        the compiled source data, never modified
    │
    ├── pipeline/overrides/ every human and researched correction, with reasons and sources
    │
    ▼
pipeline/clean.py           merges, de-duplicates, resolves wrong entities, breaks cycles,
                            checks chronology, normalises styles → a guaranteed-acyclic graph
    │
    ▼
pipeline/analysis/          eight connectivity measures + the lineages that ended
    │
    ├── pipeline/kata.py    merges kata held twice under two romanisations, mirrors every
    │                       relationship onto both kata, groups forms by their characters
    ▼
pipeline/viz/build_viz.py   time-based layout (people sit in their decade of birth)
    │
    ├──▶ karate-cladogram.html   one self-contained file, no dependencies, no network calls
    │
    ▼
pipeline/master.py          master/*.csv — the whole dataset as plain CSVs, rewritten
                            every build, so the tables and the site never drift apart
```

Rebuild everything with:

```bash
python3 pipeline/build.py
```

Pure standard-library Python 3.9 and vanilla JavaScript. No frameworks, no build step, no `node_modules`. The build is deterministic: the same inputs produce a byte-identical output every time, the encrypted copy included. Six headless test suites run against the built page: `run_smoke.py` exercises every interactive feature, `check_public.py` asserts the published copy carries no evidence layer and the gated copy carries nothing legible, `check_both_builds.py` renders five different payload shapes to catch a build that only works on the curator's machine, `check_gate.py` checks the gated page's cipher against the Python that wrote it, `check_docs.py` asserts that the figures quoted in this file still match the data, and `check_links.py` asserts that every internal link on every page resolves and that no public page advertises the curator copy.

Four things come out of every build:

| File | Sources | Export | Editing | Who opens it |
|---|---|---|---|---|
| `karate-cladogram.html` | Full evidence layer | All formats | Yes | The curator, locally |
| `docs/index.html`, `website/index.html` | **Removed at build time** | **None** | **No** | Everyone, on the web |
| `docs/hutan/index.html` | Full, **encrypted** | All formats | Yes | One reader, with the passphrase |
| `master/*.csv` | Full, in `evidence` columns | n/a | n/a | Anyone wanting the raw tables |

The evidence layer is stripped from the payload itself rather than merely hidden in the interface, because hiding is cosmetic when anyone can read a page's source. The page needs no switch: it shows sources when the build it came from carries them. `pipeline/test/check_public.py` asserts that separation on every build.

The third row is the same curator build reached over the web. A quiet path would not protect it, since the file sits in a public repository and one inbound link puts it in a search index, so the payload is encrypted rather than merely hidden: PBKDF2-HMAC-SHA256 at 310,000 rounds, a SHA-256 keystream and an HMAC tag, all set out in [`pipeline/viz/gate.py`](pipeline/viz/gate.py). The passphrase lives in `pipeline/curator_key.txt`, which git ignores; without that file the build simply omits the gated copy. `pipeline/test/check_gate.py` runs the page's JavaScript against vectors from the Python that encrypted it, because a hand-written cipher that is wrong by one bit fails exactly like a mistyped passphrase.

The source CSVs are never edited. Every change is a row in an override file with a `status` column (`proposed`, `confirmed`, `rejected`, `needs_decision`), so any decision can be reversed and every claim can be traced back to whoever made it and why. `pipeline/review/` is regenerated on each build and is where the pipeline reports what it changed and what it wants a human to rule on.

## Known limitations

Stated plainly, because a lineage dataset that claims certainty is lying:

- **162 people are not linked** to the main tree. Where no reliable chain exists, none is invented.
- **Eight dates were contested** between primary sources (Bishop; Quast's documentary work) and the Wikidata consensus. Each carries a recorded ruling with its rationale in `pipeline/overrides/year_fixes.csv` (two adopted, six kept), reversible like every other decision.
- **722 people have no recorded birth year.** Where they can be placed from their teachers and students, the chart shows an estimated cohort, marked "c. 1890 (est.)".
- **The early lineages are oral tradition.** Kūsankū, Chatan Yara and their contemporaries are recorded as they are transmitted, at low confidence, not as established fact.
- "Trained from" dates are birth + 25 estimates and are marked with an asterisk throughout.

## Contributing a correction

If you know this material and something here is wrong, the fastest route is to open the [interactive chart](https://amg-ai-labs.github.io/karate-lineage/), fix it in the panel, then use **Export → Expert corrections** to download the CSVs and attach them to an issue. Please include a source. Claims without one will be recorded at low confidence or not at all.

## Licence and citation

Code is MIT. The dataset (`nodes.csv`, `edges.csv`, `pipeline/overrides/`, `pipeline/out/`) is CC BY 4.0: use it, but cite it. The books cited (Bishop, Nagamine ×2, Cramer, Guarelli, McCarthy ×2, Toguchi) are copyright their authors and publishers and are not included in this repository; they are cited by page only.

```
Guni, A. (2026). The Lineage of Karate and Taekwondo: a source-checked instructor-to-student
cladogram. https://github.com/amg-ai-labs/karate-lineage
```

Built by Ahmad Guni and Hutan Ashrafian
