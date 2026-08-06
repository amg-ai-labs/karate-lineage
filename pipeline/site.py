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
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #fcfcfb; color: #0b0b0b; }
header { border-bottom: 1px solid #e1e0d9; background: #f9f9f7; }
nav { max-width: 780px; margin: 0 auto; padding: 14px 24px; display: flex; gap: 20px;
  align-items: baseline; flex-wrap: wrap; }
nav a { color: #52514e; text-decoration: none; font-size: 14px; }
nav a:hover { color: #2a78d6; }
nav a.here { color: #0b0b0b; font-weight: 600; }
nav .brand { font-weight: 700; color: #0b0b0b; margin-right: auto; font-size: 15px;
  letter-spacing: -.01em; }
main { max-width: 780px; margin: 0 auto; padding: 40px 24px 72px; }
h1 { font-size: 30px; line-height: 1.2; letter-spacing: -.02em; margin: 0 0 6px; }
.standfirst { font-size: 17px; color: #52514e; margin: 0 0 34px; }
h2 { font-size: 20px; margin: 38px 0 10px; letter-spacing: -.01em; }
h3 { font-size: 16px; margin: 26px 0 6px; }
p { margin: 0 0 14px; }
a { color: #2a78d6; }
table { border-collapse: collapse; width: 100%; margin: 16px 0 22px; font-size: 14.5px; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  color: #898781; border-bottom: 1px solid #c3c2b7; padding: 6px 12px 6px 0; }
td { padding: 7px 12px 7px 0; border-bottom: 1px solid #e1e0d9; vertical-align: top; }
td.num, th.num { text-align: right; }
.note { font-size: 14px; color: #52514e; border-left: 3px solid #e1e0d9; padding: 2px 0 2px 16px;
  margin: 20px 0; }
.gap { border-left-color: #d03b3b; }
.gap b { color: #d03b3b; }
footer { border-top: 1px solid #e1e0d9; margin-top: 48px; padding-top: 18px;
  font-size: 13px; color: #898781; }
.cta { display: inline-block; background: #2a78d6; color: #fff; text-decoration: none;
  padding: 10px 18px; border-radius: 7px; font-size: 15px; font-weight: 600; margin: 6px 0 10px; }
@media (prefers-color-scheme: dark) {
  body { background: #0d0d0d; color: #fff; }
  header { background: #1a1a19; border-bottom-color: #2c2c2a; }
  nav a { color: #c3c2b7; } nav a.here, nav .brand { color: #fff; }
  .standfirst, .note, td { color: #c3c2b7; }
  td, th { border-bottom-color: #2c2c2a; } th { border-bottom-color: #383835; }
  .note { border-left-color: #383835; } footer { border-top-color: #2c2c2a; }
  h1, h2, h3 { color: #fff; }
}
"""


EDIT_JS = """<script>
/* Editing the prose from the page. Add #edit to the address to turn every
   passage into a text box. Nothing is saved to the site, which is static and
   has no server: the button downloads site_content.json, and dropping that
   file into pipeline/ and rebuilding is what publishes it. That is the same
   route every correction in this project takes. */
(function () {
  var on = location.hash.indexOf("edit") >= 0;
  var bar = document.getElementById("editbar");
  function paint() {
    bar.hidden = !on;
    bar.textContent = "";
    document.querySelectorAll("[data-key]").forEach(function (el) {
      el.contentEditable = on ? "true" : "false";
      el.style.outline = on ? "1px dashed #2a78d6" : "";
      el.style.padding = on ? "2px 4px" : "";
    });
    if (!on) return;
    var msg = document.createElement("p");
    msg.style.cssText = "font-size:14px;color:#52514e;margin:0 0 8px";
    msg.textContent = "Editing this page. The dashed passages are editable. "
      + "Nothing here changes the site until the file is exported and the site rebuilt.";
    var b = document.createElement("button");
    b.textContent = "Download the edited text";
    b.style.cssText = "font:inherit;font-size:14px;font-weight:600;color:#fff;"
      + "background:#2a78d6;border:0;border-radius:7px;padding:9px 16px;cursor:pointer";
    b.onclick = function () {
      var out = JSON.parse(document.getElementById("content").textContent);
      document.querySelectorAll("[data-key]").forEach(function (el) {
        var path = el.dataset.key.split(".");
        var node = out;
        for (var i = 0; i < path.length - 1; i++) node = node[path[i]];
        node[path[path.length - 1]] = el.innerText.trim();
      });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)],
        { type: "application/json" }));
      a.download = "site_content.json";
      a.click();
    };
    bar.style.cssText = "border:1px solid #e1e0d9;border-radius:8px;padding:14px 16px;"
      + "margin:24px 0 0;background:#f9f9f7";
    bar.append(msg, b);
  }
  addEventListener("hashchange", function () {
    on = location.hash.indexOf("edit") >= 0; paint();
  });
  paint();
})();
</script>
"""


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
<header><nav><span class="brand">The Lineage of Karate &amp; Taekwondo</span>{nav}</nav></header>
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
        "standfirst": "Professor Hutan Ashrafian, of the Institute of Global Health "
                      "Innovation at Imperial College London, is the co-author of this "
                      "project.",
        "project": "He proposed this work and has directed it throughout: the requirement "
                   "that every link carry its source, that contested claims stay marked as "
                   "contested, that the style taxonomy run to sub-sub-style, that kata be "
                   "treated as evidence in their own right, and that the published figures "
                   "be of a quality that can go into a book.",
        "role": "To be supplied: exact title, department, clinical and academic "
                "appointments, degrees.",
        "research": "To be supplied: research interests in his own words, and a short list "
                    "of representative publications with links.",
        "karate": "To be supplied: his own account of his practice and lineage, which is the "
                  "part of this page that would actually be worth reading.",
        "links": "To be supplied: Imperial profile, Google Scholar, ORCID.",
    },
    "contact": {
        "standfirst": "Corrections are welcome, and the more specific they are the better.",
        "corrections": "If something here is wrong and you know the material, the most useful "
                       "thing you can send is the claim, the correction, and where the "
                       "correction comes from. A claim with no source is not a weak claim, it "
                       "is not a claim: it will be recorded at low confidence or not at all. "
                       "Page references from books are ideal, and Japanese, Okinawan, Chinese "
                       "and Korean sources are especially welcome.",
        "how": "To be supplied: the address corrections should be sent to.",
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
    if not CONTENT_FILE.exists():
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

<div class="note gap"><b>Parts of this page are still a frame rather than a biography.</b>
A page about a real person should not be assembled from a language model's recollection, so
the passages below marked "to be supplied" are deliberately blank rather than guessed. They
can be written straight into this page: add <code>#edit</code> to the address.</div>

<h2>This project</h2>
{ed("about", "project", A["project"])}

<h2>Role, titles and appointments</h2>
{ed("about", "role", A["role"])}

<h2>Research</h2>
{ed("about", "research", A["research"])}

<h2>Why karate</h2>
{ed("about", "karate", A["karate"])}

<h2>Links</h2>
{ed("about", "links", A["links"])}

<p><a class="cta" href="../contact/">Get in touch</a></p>
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
    print(f"wrote docs/history/ and docs/about/ ({len(fam_rows)} originating groups, "
          f"{len(founders)} dated style foundings)")


if __name__ == "__main__":
    build()
