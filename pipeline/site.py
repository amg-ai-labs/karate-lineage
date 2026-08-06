#!/usr/bin/env python3
"""The pages around the cladogram: the site, rather than the application.

The chart is one page of four. This writes the other three from the same data,
so nothing here can drift from what the chart shows: every figure below is
computed at build time, not typed.

  docs/index.html          the cladogram          (pipeline/viz/build_viz.py)
  docs/history/index.html  the history and the style tree
  docs/about/index.html    Hutan Ashrafian
  docs/hutan/index.html    the curator copy       (deliberately unlinked)

The curator copy is never linked from a public page. It is reached by knowing
the address and the passphrase, and a link in a navigation bar would undo that.
"""

import json
import sys
from collections import Counter
from pathlib import Path

K = Path(__file__).resolve().parent.parent
OUT = K / "docs"
sys.path.insert(0, str(K / "pipeline"))
import kata as kata_module                                          # noqa: E402

NAV = [("../", "The cladogram"), ("../history/", "History and styles"),
       ("../about/", "About"), ("../contact/", "Contact")]

# The prose lives in a data file, not in this script, because it has to be
# editable from the page itself. pipeline/site_content.json is written on first
# run from the defaults below and is thereafter the source of truth: edit it
# here, or edit the page in a browser and export it back over this file.
CONTENT_FILE = K / "pipeline" / "site_content.json"

CSS = """
/* Typography and nothing else. The chart is the graphic on this site; these
   pages are for reading, so the only design decisions here are measure, scale
   and space. No gradients, no shadows, no accent panels, no icons. */
:root { color-scheme: light dark;
  --ink: #16150f; --ink-2: #55534a; --muted: #8a877c;
  --rule: #e3e1d8; --rule-2: #c9c6b8; --bg: #fdfdfb; --bg-2: #f7f6f1;
  --link: #1f5fa8; }
@media (prefers-color-scheme: dark) {
  :root { --ink: #f2f1ec; --ink-2: #c0bdb2; --muted: #8a877c;
    --rule: #2b2a26; --rule-2: #3d3b35; --bg: #100f0d; --bg-2: #191814;
    --link: #7fb3f0; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 17px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-feature-settings: "kern" 1; text-rendering: optimizeLegibility; }

header { border-bottom: 1px solid var(--rule); }
nav { max-width: 46rem; margin: 0 auto; padding: 18px 28px;
  display: flex; gap: 22px; align-items: baseline; flex-wrap: wrap; }
nav .brand { font-size: 14px; font-weight: 600; letter-spacing: .01em;
  color: var(--ink); margin-right: auto; text-decoration: none; }
nav a { font-size: 14px; color: var(--ink-2); text-decoration: none; }
nav a:hover { color: var(--link); }
nav a.here { color: var(--ink); box-shadow: inset 0 -1px 0 var(--ink); }

main { max-width: 46rem; margin: 0 auto; padding: 56px 28px 80px; }
h1 { font-size: clamp(30px, 5vw, 38px); line-height: 1.14; letter-spacing: -.021em;
  font-weight: 660; margin: 0 0 14px; }
.standfirst { font-size: 20px; line-height: 1.5; color: var(--ink-2);
  margin: 0 0 40px; max-width: 34em; }
h2 { font-size: 14px; font-weight: 660; letter-spacing: .07em; text-transform: uppercase;
  color: var(--muted); margin: 48px 0 14px; padding-bottom: 8px;
  border-bottom: 1px solid var(--rule); }
p { margin: 0 0 18px; max-width: 36em; }
a { color: var(--link); text-decoration-thickness: 1px; text-underline-offset: 2px; }

figure { margin: 0 0 40px; }
figure img { width: 100%; height: auto; display: block; }
figcaption { font-size: 14px; color: var(--muted); margin-top: 10px; }

table { border-collapse: collapse; width: 100%; margin: 4px 0 30px; font-size: 15px;
  font-variant-numeric: tabular-nums; }
th { text-align: left; font-size: 11.5px; font-weight: 620; letter-spacing: .06em;
  text-transform: uppercase; color: var(--muted);
  border-bottom: 1px solid var(--rule-2); padding: 0 16px 8px 0; }
td { padding: 9px 16px 9px 0; border-bottom: 1px solid var(--rule);
  vertical-align: baseline; color: var(--ink-2); }
td:first-child { color: var(--ink); font-weight: 560; }
td.num, th.num { text-align: right; padding-right: 0; }
tbody tr:last-child td { border-bottom: 0; }

.note { font-size: 15px; color: var(--muted); max-width: 36em;
  padding-left: 18px; border-left: 2px solid var(--rule); margin: 26px 0; }
.gap { border-left-color: #b4462f; }
.gap b { color: #b4462f; font-weight: 600; }

.cta { display: inline-block; margin: 14px 0 0; font-size: 16px; font-weight: 560;
  color: var(--ink); text-decoration: none;
  border: 1px solid var(--rule-2); border-radius: 3px; padding: 11px 20px; }
.cta:hover { border-color: var(--ink); }

footer { max-width: 46rem; margin: 72px auto 0; padding-top: 22px;
  border-top: 1px solid var(--rule); font-size: 14px; line-height: 1.6;
  color: var(--muted); }
footer a { color: var(--muted); }
footer a:hover { color: var(--link); }

[data-key].editing { outline: 1px dashed var(--rule-2); outline-offset: 6px;
  border-radius: 2px; }
[data-key].editing:focus { outline: 1px solid var(--link); }
#editbar { margin: 40px 0 0; padding: 22px 0 0; border-top: 1px solid var(--rule); }
.ed-tally { font-size: 14px; color: var(--muted); margin: 0 0 12px; }
.ed-row { display: flex; gap: 10px; flex-wrap: wrap; }
.ed-btn { font: inherit; font-size: 15px; color: var(--ink); background: none;
  border: 1px solid var(--rule-2); border-radius: 3px; padding: 9px 16px; cursor: pointer; }
.ed-btn:hover { border-color: var(--ink); }
.ed-btn.primary { border-color: var(--ink); font-weight: 560; }
.ed-help { font-size: 14px; color: var(--muted); margin: 14px 0 0; max-width: 36em; }
.ed-open { float: right; }

@media (max-width: 620px) {
  body { font-size: 16px; }
  main { padding: 40px 20px 64px; }
  nav { padding: 15px 20px; gap: 16px; }
  .standfirst { font-size: 18px; }
  table { font-size: 14px; } td, th { padding-right: 10px; }
}
"""


EDIT_JS = """<script>
/* Editing the prose from the page itself.

   Static site, no server, so nothing here writes to the web. What it does do is
   keep your edits in this browser while you work, so you can rewrite a passage,
   reload, come back tomorrow and still see it. When you are content, one button
   downloads site_content.json; dropping that into pipeline/ and rebuilding is
   what publishes it. Same route as every data correction in this project. */
(function () {
  var KEY = "karate-site-edits";
  var store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  var on = location.hash.indexOf("edit") >= 0;
  var bar = document.getElementById("editbar");
  var fields = [].slice.call(document.querySelectorAll("[data-key]"));

  // apply anything already edited in this browser, whether or not editing is on
  fields.forEach(function (el) {
    if (store[el.dataset.key] !== undefined) el.textContent = store[el.dataset.key];
  });

  function save() {
    fields.forEach(function (el) {
      var base = el.dataset.original;
      var now = el.innerText.trim();
      if (now === base) delete store[el.dataset.key];
      else store[el.dataset.key] = now;
    });
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
    count();
  }
  var tally;
  function count() {
    if (!tally) return;
    var n = Object.keys(store).length;
    tally.textContent = n
      ? n + (n === 1 ? " passage" : " passages") + " rewritten in this browser, not yet published."
      : "No changes yet. Click any passage and type.";
  }

  function build() {
    bar.textContent = "";
    bar.hidden = !on;
    fields.forEach(function (el) {
      if (el.dataset.original === undefined) el.dataset.original = el.innerText.trim();
      el.contentEditable = on ? "true" : "false";
      el.classList.toggle("editing", on);
      if (on && !el._wired) { el._wired = true; el.addEventListener("input", save); }
    });
    if (!on) return;
    tally = document.createElement("p"); tally.className = "ed-tally";
    var row = document.createElement("div"); row.className = "ed-row";
    function btn(label, fn, primary) {
      var b = document.createElement("button");
      b.className = "ed-btn" + (primary ? " primary" : "");
      b.textContent = label; b.onclick = fn; row.appendChild(b); return b;
    }
    btn("Download the edited text", function () {
      var out = JSON.parse(document.getElementById("content").textContent);
      fields.forEach(function (el) {
        var path = el.dataset.key.split(".");
        var node = out;
        for (var i = 0; i < path.length - 1; i++) node = node[path[i]];
        node[path[path.length - 1]] = el.innerText.trim();
      });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)],
        { type: "application/json" }));
      a.download = "site_content.json"; a.click();
    }, true);
    btn("Revert this page", function () {
      fields.forEach(function (el) {
        el.textContent = el.dataset.original;
        delete store[el.dataset.key];
      });
      try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
      count();
    });
    btn("Done", function () { location.hash = ""; });
    var help = document.createElement("p"); help.className = "ed-help";
    help.textContent = "Click any outlined passage and rewrite it. Your changes stay in "
      + "this browser as you work. To publish them, download the file and give it to me, "
      + "or drop it into pipeline/ and rebuild.";
    bar.append(tally, row, help);
    count();
  }

  addEventListener("hashchange", function () {
    on = location.hash.indexOf("edit") >= 0; build();
  });
  build();

  // a way in that does not require knowing about the hash
  var f = document.querySelector("footer");
  if (f) {
    var link = document.createElement("a");
    link.href = "#edit"; link.className = "ed-open"; link.textContent = "Edit this page";
    f.append(document.createTextNode(" "), link);
  }
})();
</script>"""


def esc(s):
    return (str(s if s is not None else "").replace("&", "&amp;")
            .replace("<", "&lt;").replace(">", "&gt;"))


def page(title, here, body, description, store=None):
    nav = "".join(
        f'<a href="{href}"{" class=\"here\"" if href == here else ""}>{esc(label)}</a>'
        for href, label in NAV)
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<style>{CSS}</style>
</head><body>
<header><nav><a class="brand" href="../">The Lineage of Karate &amp; Taekwondo</a>{nav}</nav></header>
<main>
{body}
<div id="editbar" hidden></div>
<footer>A source-checked instructor-to-student cladogram of karate, kobudō and taekwondo.
Built by Ahmad Guni and Hutan Ashrafian. The dataset is CC BY 4.0; the code is MIT.
<a href="https://github.com/amg-ai-labs/karate-lineage">Source and data on GitHub</a>.</footer>
</main>
<script id="content" type="application/json">{json.dumps(store or {}, ensure_ascii=False).replace("</", "<\\/")}</script>
{EDIT_JS}
</body></html>
"""


def table(headers, rows, numeric=()):
    th = "".join(f'<th{" class=\"num\"" if h in numeric else ""}>{esc(h)}</th>' for h in headers)
    body = ""
    for r in rows:
        tds = "".join(
            f'<td{" class=\"num\"" if headers[i] in numeric else ""}>{esc(c)}</td>'
            for i, c in enumerate(r))
        body += f"<tr>{tds}</tr>"
    return f"<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>"



# The custom domain. Set it here (or in pipeline/site_content.json) and every
# build writes docs/CNAME. With GitHub Actions publishing, the domain is
# otherwise held only in the repository settings, and a later deploy can drop it:
# carrying it in the artefact is what makes it survive.
DOMAIN = "karate.institute"

DEFAULT_CONTENT = {
    "history": {
        "standfirst": "Karate's history is usually told as a lineage chart on a dojo wall. "
                      "This project treats it as a dataset instead, and every figure on this "
                      "page is computed from it rather than typed.",
        "towns": "Before karate had that name it was ti, and it was practised in the Ryukyu "
                 "Kingdom in three places a few miles apart and quite distinct: Shuri, the "
                 "royal capital; Naha, the port; and Tomari, the smaller harbour between "
                 "them. The distinction is not geographical trivia. It is the deepest "
                 "division in the data, and almost every style alive today traces to one of "
                 "them, or to Kanbun Uechi's separate importation from Fujian.",
        "chinese": "Every Okinawan tradition names Chinese teachers, and almost none of them "
                   "can be identified with confidence. Ryu Ryu Ko, who taught Higaonna "
                   "Kanryo, has no securely established Chinese name. Kusanku is a title "
                   "rather than a name. The dataset records these figures because the "
                   "tradition does, marks them at low confidence, and does not pretend the "
                   "identification is settled.",
        "founding": "Almost nothing called a ryu is older than the twentieth century. The "
                    "names arrived when the art was formalised, taken to Japan and taught in "
                    "schools and universities, which is why a style's founding date is so "
                    "often decades after the death of the man it claims descent from.",
        "anachronism": "That ordering is also a warning about lineage charts. A style founded "
                       "in 1956 cannot have been practised by a man who died in 1915, however "
                       "genuinely he stands in its ancestry. The pipeline enforces this: a "
                       "style tag that postdates a person's lifetime is dropped, on the "
                       "principle that descent is not membership.",
        "kata": "Kata carry history that the lineage charts lose, because a form travels even "
                "when the teaching relationship is unrecorded. Each is held with its meaning, "
                "era, likely creator and modifier, the styles that practise it, and its "
                "relationship to similarly named forms: the same kata under another name, a "
                "close variant, a later derivative, a shared ancestor, or merely a shared "
                "name.",
        "reading": "People sit in the decade they were born, so the chart is a timeline as "
                   "well as a tree. Line weight and pattern carry meaning: a solid line is "
                   "the teacher whose style the student went on to carry, a dash-dot line is "
                   "study that did not carry the style, and dots mean the claim is thinly "
                   "evidenced. Colour is the originating tradition. The full key is in the "
                   "chart itself.",
    },
    "about": {
        "caption": "Hutan Ashrafian training in London.",
        "h_karate": "The martial artist",
        "h_origins": "Karate evolution through the appraisal of kata",
        "h_project": "Why this site exists",
        "h_role": "The clinician and the scientist",
        "standfirst": "Hutan Ashrafian is a surgeon and scientist at Imperial College "
                      "London, and a martial artist of forty years' standing. This project "
                      "is his vision and follows on from his book Warrior Origins.",
        "karate": "He has trained for four decades and across many styles of karate, "
                  "and holds a sixth dan in Okinawan Gōjū-ryū.",
        "origins": "He is the author of Warrior Origins, in which he applied network theory "
                   "to better understand the evolution of karate through the similarities and "
                   "differences in kata performance, taken as a measure of the differences "
                   "between styles, thereby creating a phylogenetic tree of styles through "
                   "kata phenotypes.",
        "project": "He created this lineage map of karate, kobudō and the Korean arts to "
                   "offer transparency and understanding of the journey of karate over time "
                   "through its luminaries, and created this website for all those interested "
                   "in the martial arts and in the evolution and practice of karate in all "
                   "its forms.",
        "role": "He is a clinician, a surgeon, and a scientist at Imperial College London, "
                "with more than seven hundred peer-reviewed publications, an h-index above "
                "eighty, and more than seventy PhD students supervised. He is lead for "
                "artificial intelligence at the Institute of Global Health Innovation, and "
                "has operations and clinical signs eponymously named after him.",
    },
    "site": {
        "domain": "karate.institute",
    },
    "contact": {
        "standfirst": "Corrections are welcome, and the more specific they are the better.",
        "corrections": "If something here is wrong and you know the material, the most useful "
                       "thing you can send is the claim, the correction, and where the "
                       "correction comes from. A claim with no source is not a weak claim, it "
                       "is not a claim: it will be recorded at low confidence or not at all. "
                       "Page references from books are ideal, and Japanese, Okinawan, Chinese "
                       "and Korean sources are especially welcome.",
        "how": "The surest route is the issue tracker on GitHub, because a correction filed "
               "there is recorded with its reasoning and can be traced afterwards by anyone "
               "who wonders why a claim reads as it does. Corrections sent privately are "
               "welcome too, and are treated the same way: they go into the override files "
               "with their source and their reason attached.",
        "issues": "Anything technical, or a correction you would rather file publicly, can go "
                  "to the issue tracker on GitHub, where it is recorded with its reasoning "
                  "and can be traced afterwards.",
        "citation": "If you use the dataset, please cite it. The citation is in CITATION.cff "
                    "in the repository, and the data is CC BY 4.0.",
    },
}


def content():
    """The prose, from the data file, falling back to the defaults for any key
    the file does not carry, so a hand-edited file can never blank a page."""
    data = json.loads(CONTENT_FILE.read_text(encoding="utf-8")) if CONTENT_FILE.exists() else {}
    merged = {}
    for section, fields in DEFAULT_CONTENT.items():
        merged[section] = dict(fields)
        merged[section].update({k: v for k, v in (data.get(section) or {}).items() if v})
    # Always written back, not only on first run: the file is what the page is
    # edited through, so it has to hold every passage. A new section added in
    # code would otherwise be invisible to anyone editing the file.
    CONTENT_FILE.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    return merged


def ed(section, key, text, tag="p", cls=""):
    """A passage the page can edit, keyed so the export knows where it belongs."""
    c = f' class="{cls}"' if cls else ""
    return f'<{tag}{c} data-key="{section}.{key}">{esc(text)}</{tag}>'


def build():
    lin = json.loads((K / "pipeline/out/lineage.json").read_text(encoding="utf-8"))
    styles = json.loads((K / "pipeline/out/styles.json").read_text(encoding="utf-8"))["styles"]
    kata, _ = kata_module.load()
    nodes, edges = lin["nodes"], lin["edges"]
    by_style = {s["id"]: s for s in styles}
    conf = Counter(e["confidence"] for e in edges)

    # people per originating group, counted through the whole style tree
    kids = {}
    for s in styles:
        kids.setdefault(s.get("parent") or "", []).append(s["id"])

    def descend(sid):
        out, stack = {sid}, [sid]
        while stack:
            for k in kids.get(stack.pop(), []):
                if k not in out:
                    out.add(k)
                    stack.append(k)
        return out

    fam_people = Counter()
    fam_styles = Counter()
    for s in styles:
        fam_styles[s.get("family") or "other"] += 1
    for n in nodes:
        fams = {by_style[s]["family"] for s in n.get("styles", []) if s in by_style}
        for f in fams:
            fam_people[f] += 1

    FAM = [("shuri-te", "Shuri-te", "The Shuri court tradition: Matsumura, Itosu, and the "
            "line that became Shōrin-ryū and, through Funakoshi, Shōtōkan."),
           ("naha-te", "Naha-te", "The Naha merchant-port tradition, Chinese-inflected through "
            "Higaonna Kanryō's years in Fuzhou: Gōjū-ryū and its relatives."),
           ("tomari-te", "Tomari-te", "The smallest of the three towns, and the least "
            "institutionalised; its forms survive inside other schools."),
           ("uechi-ryu", "Uechi-ryū", "Kanbun Uechi's Fujian training, brought back and taught "
            "separately from the Okinawan mainstream."),
           ("kobudo", "Kobudō", "The weapon traditions: bō, sai, tonfā, kama, ēku, tinbe."),
           ("japanese", "Japanese karate", "What the Okinawan arts became on the mainland after "
            "1922: Shōtōkan, Wadō-ryū, Shitō-ryū, Gōjū-kai."),
           ("kyokushin", "Kyokushin", "Ōyama's full-contact school and the many organisations "
            "that split from it."),
           ("korean", "Korean arts", "Taekwondo and tang soo do, whose founders trained in "
            "Japanese karate before and during the occupation."),
           ("kenpo", "Kenpō", "The Hawaiian and American kenpō lines."),
           ("te", "Antecedents", "Ti and tōde: what was practised before any of it had a name."),
           ("chinese", "Chinese antecedents", "The Fujian teachers named in Okinawan tradition.")]

    fam_rows = [(label, f"{fam_people.get(fid, 0):,}", f"{fam_styles.get(fid, 0):,}", blurb)
                for fid, label, blurb in FAM if fam_people.get(fid) or fam_styles.get(fid)]

    dated = [n for n in nodes if n["birth_year"]]
    earliest = min(dated, key=lambda n: n["birth_year"])
    founders = [s for s in styles if s.get("founder") and s.get("founded")]
    founders.sort(key=lambda s: str(s["founded"]))

    C = content()
    H, A, T = C["history"], C["about"], C["contact"]

    hist = f"""
<h1>The history, and how this dataset reads it</h1>
{ed("history", "standfirst", H["standfirst"], cls="standfirst")}

<p>What follows is the shape of that history as the data records it, not as any school
tells it: {len(nodes):,} people, {len(edges):,} teacher-to-student links, {len(styles):,}
styles and {len(kata):,} kata. Where the record is thin it is left thin. {conf['low']:,} of
the links are marked low confidence because they rest on oral tradition or on a single
interested source, and {len(nodes) - len([n for n in nodes if n['connected']]):,} people sit
outside the main tree entirely because no reliable chain to them exists.</p>

<h2>Three towns</h2>
{ed("history", "towns", H["towns"])}

{table(["Originating group", "People", "Styles", "What it is"],
       fam_rows, numeric=("People", "Styles"))}

<p class="note">A person is counted under every group whose styles they practised, so the
columns are not exclusive: a Shitō-ryū teacher who also holds kobudō appears twice. That is
the honest way to count a tradition in which people trained widely.</p>

<h2>The Chinese input</h2>
{ed("history", "chinese", H["chinese"])}

<h2>The founding of the styles</h2>
{ed("history", "founding", H["founding"])}
<p>{len(founders):,} styles here carry both a founder and a founding year.</p>

{table(["Style", "Founder", "Founded"],
       [(by_style[s["id"]]["label"], s["founder"], s["founded"])
        for s in founders if str(s["founded"])[:4].isdigit()][:28])}

{ed("history", "anachronism", H["anachronism"])}

<h2>The oldest people in the record</h2>
<p>The earliest person with a recorded birth year is {esc(earliest['name'])}
({earliest['birth_year']}{'–' + str(earliest['death_year']) if earliest['death_year'] else ''}).
Beyond roughly 1750 the record becomes tradition rather than documentation, and the chart
says so: undated people are placed by inference from their teachers and students, and shown
with an estimated cohort rather than a false precision.</p>

<h2>Kata as evidence</h2>
{ed("history", "kata", H["kata"])}
<p>{len(kata):,} kata are held here. Kata written with the same characters are treated as
one form read differently, which is how Heian Sandan and Pinan Sandan are shown as what
they are.</p>

<h2>How to read the chart</h2>
{ed("history", "reading", H["reading"])}

<p><a class="cta" href="../">Open the cladogram</a></p>
"""

    about = f"""
<h1>Hutan Ashrafian</h1>
{ed("about", "standfirst", A["standfirst"], cls="standfirst")}

<figure>
  <img src="../img/hutan-training.jpg" width="1100" height="939" loading="lazy"
       alt="Hutan Ashrafian in a white karategi and black belt, standing in a guard
            position on snow-covered ground, with a city skyline behind him.">
  <figcaption>{ed("about", "caption", A["caption"], tag="span")}</figcaption>
</figure>

{ed("about", "h_karate", A["h_karate"], tag="h2")}
{ed("about", "karate", A["karate"])}

{ed("about", "h_origins", A["h_origins"], tag="h2")}
{ed("about", "origins", A["origins"])}

{ed("about", "h_project", A["h_project"], tag="h2")}
{ed("about", "project", A["project"])}

{ed("about", "h_role", A["h_role"], tag="h2")}
{ed("about", "role", A["role"])}

<p>His Imperial College profile is
<a href="https://profiles.imperial.ac.uk/h.ashrafian">here</a>.</p>

<p><a class="cta" href="../">Open the cladogram</a></p>
"""

    contact = f"""
<h1>Contact</h1>
{ed("contact", "standfirst", T["standfirst"], cls="standfirst")}

<h2>Corrections</h2>
{ed("contact", "corrections", T["corrections"])}

<h2>How to reach us</h2>
{ed("contact", "how", T["how"])}

<h2>Filing it publicly</h2>
{ed("contact", "issues", T["issues"])}

<h2>Citing the dataset</h2>
{ed("contact", "citation", T["citation"])}

<p class="note">This site is static and has no server, so there is no form here that would
send anything. That is deliberate: a form implies a mailbox somebody is reading, and it is
better to name the route than to imply one.</p>
"""

    for sub in ("history", "about", "contact"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    (OUT / "history" / "index.html").write_text(
        page("History and styles — The Lineage of Karate & Taekwondo", "../history/", hist,
             "How karate's styles descend from the three Okinawan towns, read from a "
             "source-checked dataset of 1,459 people.", C), encoding="utf-8")
    (OUT / "about" / "index.html").write_text(
        page("Hutan Ashrafian — The Lineage of Karate & Taekwondo", "../about/", about,
             "Hutan Ashrafian, Institute of Global Health Innovation, Imperial College "
             "London, co-author of the karate lineage project.", C), encoding="utf-8")
    (OUT / "contact" / "index.html").write_text(
        page("Contact — The Lineage of Karate & Taekwondo", "../contact/", contact,
             "How to send a correction to the karate lineage dataset.", C), encoding="utf-8")

    # the same pages beside the Netlify copy, so both hosts carry the whole site
    for folder in ("website",):
        for sub in ("history", "about", "contact"):
            d = K / folder / sub
            d.mkdir(parents=True, exist_ok=True)
            (d / "index.html").write_text((OUT / sub / "index.html").read_text(encoding="utf-8"),
                                          encoding="utf-8")
    domain = (C.get("site") or {}).get("domain") or DOMAIN
    cname = OUT / "CNAME"
    if domain:
        cname.write_text(domain.strip() + "\n", encoding="utf-8")
        (K / "website" / "CNAME").write_text(domain.strip() + "\n", encoding="utf-8")
        print(f"wrote docs/CNAME for {domain.strip()}")
    elif cname.exists():
        cname.unlink()

    print(f"wrote docs/history/ and docs/about/ ({len(fam_rows)} originating groups, "
          f"{len(founders)} dated style foundings)")


if __name__ == "__main__":
    build()
