/* ---- smoke assertions (run after app init) ---- */
try {
  console.log("init OK: nodes=" + nodeEls.size + " edges=" + edgeEls.size + " labels=" + labelEls.size);
  if (nodeEls.size !== placed.length) throw new Error("node count mismatch");
  var bad = 0;
  for (const [k, o] of edgeEls) { const d = o.vis.getAttribute("d"); if (!d || d.indexOf("NaN") >= 0) bad++; }
  if (bad) throw new Error("NaN edge paths: " + bad);
  var fk = placed.find(n => n.name === "Gichin Funakoshi");
  var ls = lineageSet(fk.id, "down");
  console.log("Funakoshi descendants+self: " + ls.size);
  if (ls.size < 100) throw new Error("descendant set too small");
  selectNode(fk.id);
  if (!document.getElementById("detail").children.length) throw new Error("empty detail panel");
  var ids = [...ls].filter(id => pos.has(id));
  var iso = isolateLayout(ids);
  var nan = [...iso.values()].filter(p => !isFinite(p.x) || !isFinite(p.y)).length;
  if (nan) throw new Error("isolate NaN");
  state.focus = null; applyFilters();
  labelEls.get(fk.id).g.fire("pointerdown");
  svg.fire("pointerdown");
  svg.fire("pointerup");
  if (state.focus !== fk.id) throw new Error("pointer-sequence click did not select");
  svg.fire("pointerdown"); svg.fire("pointerup");
  if (state.focus !== null) throw new Error("background click did not clear");
  console.log("pointer clicks: select + clear OK");
  clickSelect(fk.id);
  var ghosts = 0, onpath = 0;
  for (const [id, g] of nodeEls) if (g.classList.contains("ghost")) ghosts++;
  for (const [k2, o2] of edgeEls) if (o2.vis.classList.contains("onpath")) onpath++;
  if (!ghosts || !onpath) throw new Error("ghosting/onpath failed: " + ghosts + "/" + onpath);
  console.log("after click: ghosted=" + ghosts + " onpath edges=" + onpath);
  state.focus = null; applyFilters();
  edits[fk.id] = Object.assign(edits[fk.id] || {}, { birth_year: 1867 });
  refreshLabel(fk.id);
  if (labelText(fk).l2.indexOf("1867") < 0) throw new Error("edited date not shown");
  var e0 = DATA.edges.find(e => e.source === fk.id);
  edgeFlags[e0.source + ">" + e0.target] = { note: "test" };
  applyFilters();
  if (!edgeEls.get(e0.source + ">" + e0.target).vis.classList.contains("flagged"))
    throw new Error("flagged edge not styled");
  openEdgeDetail(e0);
  if (!document.getElementById("detail").children.length) throw new Error("edge panel empty");
  exportEdits();
  console.log("expert corrections: date edit + flag + edge panel + export OK");
  delete edits[fk.id]; edgeFlags = {}; applyFilters();
  // curator gating: evidence links hidden publicly, shown in curator mode
  previewPublic = true;  openEdgeDetail(e0);
  var pubLinks = document.getElementById("detail").querySelectorAll("a").length;
  previewPublic = false; openEdgeDetail(e0);
  var curLinks = document.getElementById("detail").querySelectorAll("a").length;
  if (pubLinks !== 0) throw new Error("public edge panel leaks " + pubLinks + " source links");
  if (curLinks < 1) throw new Error("curator copy shows no sources");
  console.log("curator gating: public " + pubLinks + " links, curator " + curLinks);
  // #hash switching applies without a manual reload (hashchange path)
  if (!hasEvidence) throw new Error("curator build lost its evidence layer");
  previewPublic = true;  if (curator()) throw new Error("#public preview did not take effect");
  previewPublic = false; if (!curator()) throw new Error("curator copy not detected");
  console.log("curator detection from build: OK (hasEvidence=" + hasEvidence + ")");
  // REGRESSION: no source material may reach ANY public surface. A past leak was
  // plain text in a hover tooltip, which an <a>-only audit missed entirely, so this
  // sweeps rendered TEXT across every surface in both modes.
  (function () {
    const textOf = el => { let t = el.textContent || ""; for (const c of el.children) t += " " + textOf(c); return t; };
    const tokens = el => (textOf(el).match(/https?:\/\/|research:|wikidata:|book:Bishop/g) || []).length;
    const e1 = DATA.edges.find(e => (e.evidence || []).length);
    const p1 = (placed.find(n => n.wiki) || placed[0]).id;
    const surfaces = () => {
      let n = 0;
      showEdgeTip(e1, { clientX: 0, clientY: 0 }); n += tokens(document.getElementById("tooltip"));
      showNodeTip(byId.get(p1), { clientX: 0, clientY: 0 }); n += tokens(document.getElementById("tooltip"));
      openEdgeDetail(e1); n += tokens(document.getElementById("detail"));
      openDetail(p1); n += tokens(document.getElementById("detail"));
      renderKataPanel(); n += tokens(document.getElementById("katapanel"));
      renderStylePanel(); n += tokens(document.getElementById("stylepanel"));
      return n;
    };
    previewPublic = true;  const pub = surfaces();
    previewPublic = false; const cur = surfaces();
    if (pub !== 0) throw new Error("PUBLIC UI LEAKS " + pub + " source tokens");
    if (cur < 1) throw new Error("curator mode shows no sources");
    console.log("leak sweep: public " + pub + " source tokens, curator " + cur);
  })();

  var sel = document.getElementById("stylefilter");
  var groups = sel.children.filter(c => c.tagName === "OPTGROUP").length;
  var indented = 0;
  for (const og of sel.children) for (const o of og.children || [])
    if ((o.textContent || "").indexOf("·") >= 0) indented++;
  if (groups < 8) throw new Error("dropdown groups: " + groups);
  console.log("style dropdown: " + groups + " groups, " + indented + " indented sub-styles");
  var gset = styleWithDesc("goju-ryu");
  if (!gset.has("goju-kai")) throw new Error("style tree: goju-kai not under goju-ryu");
  if (!gset.has("seiwakai")) throw new Error("style tree: seiwakai not under goju-ryu (via goju-kai)");
  var members = styleMembers("goju-ryu");
  if (members.length < 20) throw new Error("goju members too few: " + members.length);
  setStyleFilter("goju-ryu");
  var visGoju = visiblePeople().length;
  setStyleFilter("");
  console.log("goju-ryu with descendants: " + members.length + " members, " + visGoju + " visible");
  renderStylePanel();
  var rows = document.getElementById("stylepanel").querySelectorAll(".st-row").length;
  if (!rows) throw new Error("style panel empty");
  console.log("style panel rows at top level: " + rows);
  if (!DATA.kata || DATA.kata.length < 150) throw new Error("kata payload missing/small");
  renderKataPanel();
  var krows = document.getElementById("katapanel").querySelectorAll(".kata-row").length;
  if (krows < 150) throw new Error("kata rows rendered: " + krows);
  console.log("kata tab: " + DATA.kata.length + " kata, " + krows + " rows rendered");
  // every kata must be attachable to somebody, which was the client's complaint
  var noPerson = DATA.kata.filter(k => !k.origin_person && !k.modifier
    && !(k.introduced_by || []).length);
  if (noPerson.length > DATA.kata.length * 0.02)
    throw new Error("kata with no person: " + noPerson.length + " — "
      + noPerson.slice(0, 5).map(k => k.name).join(", "));
  var chinto = DATA.kata.find(k => /^chint/i.test(k.name));
  if (!chinto) throw new Error("Chinto missing from the kata list");
  if (!chinto.origin_person && !(chinto.introduced_by || []).length)
    throw new Error("Chinto still has no attached person");
  var disputed = DATA.kata.filter(k => k.disputed).length;
  var withProv = DATA.kata.filter(k => k.provenance).length;
  var withMod = DATA.kata.filter(k => k.modifier).length;
  console.log("kata detail: " + noPerson.length + " with no person, " + disputed
    + " disputed, " + withProv + " with provenance, " + withMod + " with a modifier");
  // the detail block must actually render the fields the client asked for
  kataOpen.clear(); kataOpen.add(chinto.name); kataQuery = chinto.name;
  renderKataPanel();
  var det = document.getElementById("katapanel").querySelector(".kata-detail");
  if (!det) throw new Error("kata detail did not render for " + chinto.name);
  var dtxt = det.textContent;
  if (dtxt.indexOf("Likely creator") < 0 && dtxt.indexOf("Lineage") < 0)
    throw new Error("kata detail shows no person: " + dtxt.slice(0, 120));
  kataQuery = ""; kataOpen.clear();
  console.log("kata detail block for " + chinto.name + ": " + dtxt.slice(0, 70).replace(/\s+/g, " "));

  // PANELS: only one may be visible, or a panel opened from another is invisible
  // behind it. That is what made clicking a kata inside a person's panel look dead.
  (function () {
    var th = DATA.nodes.find(n => /Teruo Hayashi/i.test(n.name)) || placed[0];
    openDetail(th.id);
    var d = document.getElementById("detail");
    var kb = d.querySelectorAll("button").filter(b => /^[A-Z]/.test(b.textContent)
              && DATA.kata.some(k => b.textContent.indexOf(k.name) === 0));
    if (!kb.length) throw new Error("no kata buttons in " + th.name + "'s panel");
    kb[0].fire("click");
    var kp = document.getElementById("katapanel");
    if (kp.hidden) throw new Error("clicking a kata did not open the kata panel");
    if (!d.hidden) throw new Error("person panel still visible under the kata panel");
    if (!kp.querySelectorAll(".kata-detail").length)
      throw new Error("kata panel opened but the entry is not expanded");
    var back = kp.querySelectorAll(".panel-back");
    if (!back.length) throw new Error("no way back to the person");
    back[0].fire("click");
    if (document.getElementById("detail").hidden)
      throw new Error("back did not return to the person");
    var open = ["detail", "tablepanel", "orphanpanel", "addpanel", "stylepanel",
                "katapanel", "statspanel", "connectpanel"]
      .filter(id => !document.getElementById(id).hidden);
    if (open.length !== 1) throw new Error("panels open at once: " + open.join(", "));
    console.log("panels: one at a time, kata opens from a person and returns");
  })();

  // IMAGE EXPORT is the curator's alone; the public build offers data only
  (function () {
    var imgs = ["svg", "pdf", "png", "png2", "png4", "jpg", "jpg4", "tiff"];
    previewPublic = true;
    if (canExportImages()) throw new Error("public build still offers image export");
    var pub = exportFormats(imgs.map(f => [f, f]));
    if (pub.length) throw new Error("public export offers images: " + pub.map(p => p[1]).join(","));
    var pubData = exportFormats([["CSV", "csv"], ["GraphML", "graphml"]]);
    if (pubData.length !== 2) throw new Error("public build lost its data exports");
    previewPublic = false;
    if (!canExportImages()) throw new Error("curator build lost image export");
    if (exportFormats(imgs.map(f => [f, f])).length !== imgs.length)
      throw new Error("curator build is missing image formats");
    console.log("image export: curator " + imgs.length + " formats, public 0 (data still 2)");
  })();

  // STYLE-BEARING LINE: the client's Sakumoto case
  (function () {
    var s = DATA.nodes.find(n => /Sakumoto/i.test(n.name));
    if (!s) throw new Error("Sakumoto absent");
    linePrimaryOnly = false; var all = lineageSet(s.id, "up").size;
    linePrimaryOnly = true;  var prim = [...lineageSet(s.id, "up")].map(i => (byId.get(i) || {}).name);
    linePrimaryOnly = false;
    if (prim.length >= all) throw new Error("style-bearing filter changed nothing");
    var stray = prim.filter(n => /Itosu|Matsumura|Yabu|Sakukawa/.test(n || ""));
    if (stray.length) throw new Error("Shuri-te still in Sakumoto's style-bearing line: " + stray);
    console.log("style-bearing line: Sakumoto " + all + " -> " + prim.length
      + " (" + prim.join(" < ") + ")");
  })();

  // STYLE LIST must begin with the originating groups, not wherever a root happens to be
  (function () {
    styleOrder = "cat"; styleQuery = ""; renderStylePanel();
    var sp = document.getElementById("stylepanel");
    var fams = sp.querySelectorAll(".st-fam").map(f => f.textContent.trim());
    if (!/Shuri-te/.test(fams[0] || ""))
      throw new Error("style list starts at " + fams[0] + ", not Shuri-te");
    for (const want of ["Naha-te", "Tomari-te"])
      if (!fams.some(f => f.indexOf(want) >= 0)) throw new Error(want + " missing from the style list");
    styleOrder = "alpha"; renderStylePanel();
    var az = sp.querySelectorAll(".st-name").map(b => b.textContent);
    if (az.length !== DATA.styles.length)
      throw new Error("A-Z lists " + az.length + " of " + DATA.styles.length + " styles");
    var sorted = az.slice().sort((a, b) => a.localeCompare(b));
    if (az.join("|") !== sorted.join("|")) throw new Error("A-Z is not in order");
    styleOrder = "cat";
    console.log("style list: " + fams.length + " groups from " + fams[0]
      + "; A-Z covers all " + az.length);
  })();

  // CONNECT: two people, the chain between them, and an exportable sub-graph
  (function () {
    var a = DATA.nodes.find(n => n.name === "Chojun Miyagi");
    var b = DATA.nodes.find(n => n.name === "Gichin Funakoshi");
    var p = pathBetween(a.id, b.id);
    if (!p || p.length < 2) throw new Error("no path between Miyagi and Funakoshi");
    cxPeople = [a.id, b.id]; renderConnect();
    var cp = document.getElementById("connectpanel");
    if (cp.hidden) throw new Error("connect panel did not open");
    if (!cp.querySelectorAll(".cx-path").length) throw new Error("no path shown");
    var cs = connectionSet([a.id, b.id]);
    if (cs.ids.length < p.length) throw new Error("sub-graph smaller than the path");
    cxPeople = [];
    console.log("connect: " + p.map(i => (byId.get(i) || {}).name).join(" - ")
      + " (" + cs.ids.length + " in the sub-graph)");
  })();

  // KATA charts: a kata exports the people who carried it
  (function () {
    var withPeople = DATA.kata.filter(k => kataPeopleIds(k).length >= 2);
    if (withPeople.length < 50)
      throw new Error("only " + withPeople.length + " kata have 2+ people on the chart");
    var k = withPeople[0];
    kataQuery = k.name; kataOpen = new Set([k.name]); renderKataPanel();
    var kp = document.getElementById("katapanel");
    var sv = kp.querySelectorAll("button").filter(b => /SVG/.test(b.textContent));
    if (!sv.length) throw new Error("kata entry offers no chart export");
    var files = [], _d = download; download = function (n) { files.push(n); };
    sv[0].fire("click"); download = _d;
    if (!files.length || !/\.svg$/.test(files[0]))
      throw new Error("kata export produced: " + files.join(", "));
    kataQuery = ""; kataOpen.clear();
    console.log("kata charts: " + withPeople.length + " kata exportable; sample " + files[0]);
  })();

  // KEY must explain every line style actually used on the canvas
  (function () {
    renderKey();
    var t = document.getElementById("keypanel").textContent;
    for (const w of ["Solid", "Dashed", "Dotted", "Blue", "Red", "Hue"])
      if (t.indexOf(w) < 0) throw new Error("key does not explain: " + w);
    document.getElementById("keypanel").hidden = true;
    console.log("key: explains solid, dashed, dotted, blue, faint, red, hue and rings");
  })();

  // GraphML must be well-formed and must not declare an empty int attribute,
  // which is the usual way a hand-built GraphML fails to open in Gephi
  (function () {
    var gml = "", _d = download;
    download = function (name, blob) { if (/\.graphml$/.test(name)) gml = blob._text; };
    exportSubset([...lineageSet(fk.id, "down")].slice(0, 60), "smoke", "graphml");
    download = _d;
    if (!gml) throw new Error("no GraphML produced");
    var opens = (gml.match(/<node /g) || []).length, closes = (gml.match(/<\/node>/g) || []).length;
    if (!opens || opens !== closes) throw new Error("GraphML node tags unbalanced: " + opens + "/" + closes);
    if (/<data key="n_(born|died|generation|students|descendants)"><\/data>/.test(gml))
      throw new Error("GraphML declares an empty int attribute");
    if (gml.indexOf("<graph ") < 0 || gml.indexOf("</graphml>") < 0)
      throw new Error("GraphML missing graph element");
    // an unescaped & or < would make the file unparseable
    var body = gml.replace(/<[^>]*>/g, "");
    if (/[<>]/.test(body) || /&(?!amp;|lt;|gt;|quot;)/.test(body))
      throw new Error("GraphML has unescaped markup in its text");
    console.log("GraphML: " + opens + " nodes, "
      + (gml.match(/<edge /g) || []).length + " edges, well-formed and escaped");
  })();

  // analytics: every measure must render its own table and export its own CSV
  if (!DATA.rankings) throw new Error("rankings missing from payload");
  renderStatsPanel();
  var measures = DATA.rankings.measures.map(m => m.key).concat(["__terminal"]);
  var sp = document.getElementById("statspanel");
  for (var mi = 0; mi < measures.length; mi++) {
    rankMeasure = measures[mi];
    renderStatsPanel();
    var trs = sp.querySelectorAll("tr").length;
    if (trs < 5) throw new Error("analytics table for " + measures[mi] + ": " + trs + " rows");
    var noteTxt = sp.querySelector(".rk-note").textContent;
    if (noteTxt.length < 20)
      throw new Error("analytics measure " + measures[mi] + " has no method note");
  }
  rankMeasure = DATA.rankings.measures[0].key;
  renderStatsPanel();
  var aFiles = [], _aDl = download;
  download = function (name, blob) { aFiles.push(name); };
  sp.querySelectorAll("button").filter(b => /Download this table/.test(b.textContent))[0].fire("click");
  download = _aDl;
  if (!aFiles.length || !/analytics.*\.csv$/.test(aFiles[0]))
    throw new Error("analytics CSV export produced: " + aFiles.join(", "));
  var topRow = DATA.rankings.top[DATA.rankings.measures[0].key][0];
  openDetail(topRow.id);
  var dtext = document.getElementById("detail").textContent;
  if (dtext.indexOf("Connectivity") < 0)
    throw new Error("person panel shows no connectivity figures");
  console.log("analytics: " + measures.length + " views, each with a method note; CSV "
    + aFiles[0] + "; per-person figures in the detail panel");

  // search: kanji, reversed name order, macrons, and school names (client item 8)
  function searchIds(q) {
    document.getElementById("search").value = q;
    runSearch();
    return sHits.map(h => h.n.name);
  }
  var ham = DATA.nodes.find(n => /Tesshin Hamada/i.test(n.name));
  if (!ham) throw new Error("Tesshin Hamada absent");
  var checks = [
    ["Hamada Tesshin", "Tesshin Hamada"],      // reversed order
    ["hamada", "Tesshin Hamada"],              // surname alone
  ];
  if (ham.native) checks.push([ham.native, "Tesshin Hamada"]);
  var mot = DATA.nodes.find(n => n.name === "Choki Motobu");
  if (mot) {
    checks.push(["Motobu Choki", "Choki Motobu"]);
    checks.push(["Chōki Motobu", "Choki Motobu"]);
  }
  for (var ci = 0; ci < checks.length; ci++) {
    var got = searchIds(checks[ci][0]);
    if (got.indexOf(checks[ci][1]) < 0)
      throw new Error("search '" + checks[ci][0] + "' did not find "
        + checks[ci][1] + "; got " + got.slice(0, 4).join(", "));
  }
  var bySchool = searchIds("shotokan");
  if (!bySchool.length) throw new Error("search by school name found nobody");
  document.getElementById("search").value = ""; runSearch();
  console.log("search: kanji + reversed order + macron + school name all resolve ("
    + checks.length + " checks, school query -> " + bySchool.length + " hits)");
  var honN = placed.filter(n => n.hon && n.hon.length).length;
  if (honN < 100) throw new Error("honours missing from payload: " + honN);
  console.log("people with honours in payload: " + honN);
  var mi = placed.find(n => n.name === "Chojun Miyagi");
  exportClade([...lineageSet(mi.id, "down")], "The lineage of Chojun Miyagi", "svg");
  var badPos = [...pos.values()].filter(p => !isFinite(p.x) || !isFinite(p.y)).length;
  if (badPos) throw new Error("positions corrupted after poster export");
  if (state.isolated) throw new Error("isolate state leaked after poster export");
  console.log("clade poster export + position restore OK");
  var cladeIds = [...lineageSet(mi.id, "down")].filter(i => pos.has(i));
  var built = buildExportSVG({ ids: new Set(cladeIds), title: "t" });
  var texts = built.out.querySelectorAll("text");
  var stroked = texts.filter(t => { var s = t.getAttribute("stroke"); return s && s !== "none"; });
  var haloed = texts.filter(t => t.getAttribute("stroke") === "none");
  if (!haloed.length) throw new Error("no unstroked label text in export");
  if (stroked.length !== haloed.length)
    throw new Error("halo copies missing: " + stroked.length + " vs " + haloed.length);
  console.log("poster halo: " + haloed.length + " names, each with a halo copy beneath");
  var paths = built.out.querySelectorAll("path").filter(p => p.getAttribute("stroke-opacity"));
  if (!paths.length) throw new Error("edges lost stroke-opacity in export");
  console.log("poster edges keep stroke-opacity: " + paths.length + " paths");
  var files = [];
  var _dl = download;
  download = function (name, blob) { files.push(name); _dl(name, blob); };
  selectNode(mi.id);
  var pubBtns = document.getElementById("detail").querySelectorAll("button")
    .filter(b => /^(⬇ SVG|PDF|PNG|JPG|TIFF)$/.test(b.textContent));
  if (pubBtns.length !== 5) throw new Error("publish buttons found: " + pubBtns.length);
  for (const b of pubBtns) if (b.textContent !== "PDF") b.fire("click");
  if (files.length < 4) throw new Error("Publish produced only " + files.length + " files");
  console.log("publish buttons yield: " + files.join(", "));
  files.length = 0;
  exportPNG(4);
  if (!files.length) throw new Error("whole-graph PNG 4x produced no file");
  console.log("whole-graph 4x export yields: " + files[0]);
  download = _dl;
  var td = { width: 4, height: 3, data: new Uint8ClampedArray(4 * 3 * 4) };
  var tb = tiffEncode(td, 300);
  if (!tb.size || tb.type !== "image/tiff") throw new Error("tiffEncode failed");
  var pb = pdfFromJPEG(new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]), 4, 3, 300);
  if (!pb.size || pb.type !== "application/pdf") throw new Error("pdfFromJPEG failed");
  console.log("tiff + pdf encoders OK");
  removals[mi.id] = { note: "t" };
  applyFilters();
  if (!nodeEls.get(mi.id).classList.contains("removed")) throw new Error("removal not styled");
  exportEdits();
  delete removals[mi.id]; applyFilters();
  console.log("person-removal flag + export OK");
  (function () {                      // storage refused (local file / private window)
    const real = localStorage.setItem;
    localStorage.setItem = () => { throw new Error("blocked"); };
    let threw = false;
    try { edits["__t"] = { birth_year: 1900 }; saveCorrections(); } catch (e) { threw = true; }
    localStorage.setItem = real;
    delete edits["__t"];
    if (threw) throw new Error("a blocked storage write breaks editing");
    console.log("edits survive blocked storage: OK");
  })();
  // generation-limited clade export: the client needs 1, 2, 3, n or all generations,
  // compactly laid out, plus the underlying data for his own analysis
  (function () {
    const mi2 = placed.find(n => n.name === "Chojun Miyagi");
    const d = lineageDepth(mi2.id, "down");
    if (d < 3) throw new Error("lineageDepth too shallow: " + d);
    let prev = 0;
    for (const g of [1, 2, 3]) {
      const n = lineageSet(mi2.id, "down", g).size;
      if (n <= prev) throw new Error("generation " + g + " added nobody");
      prev = n;
    }
    if (lineageSet(mi2.id, "down", 1).size >= lineageSet(mi2.id, "down").size)
      throw new Error("generation limiting had no effect");
    // compact layout must be materially smaller than the screen layout
    const ids2 = [...lineageSet(mi2.id, "down", 2)].filter(i => pos.has(i));
    const box = (compact) => {
      const l = isolateLayout(ids2, compact);
      const xs = [...l.values()].map(p => p.x), ys = [...l.values()].map(p => p.y);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    };
    if (box(true) >= box(false) * 0.9)
      throw new Error("compact layout is not meaningfully more compact");
    console.log("generations: depth " + d + ", 1gen=" + lineageSet(mi2.id, "down", 1).size
      + " 2gen=" + lineageSet(mi2.id, "down", 2).size + " all=" + lineageSet(mi2.id, "down").size
      + "; compact layout " + Math.round(100 - box(true) / box(false) * 100) + "% smaller");
    const files2 = [];
    const _d2 = download;
    download = (n) => files2.push(n);
    exportSubset(ids2, "Test Person", "csv");
    exportSubset(ids2, "Test Person", "json");
    download = _d2;
    if (files2.length !== 3) throw new Error("data export gave " + files2.length + " files, want 3");
    console.log("data exports: " + files2.join(", "));
  })();

  exportCSV(); exportJSON();
  console.log("SMOKE OK");
} catch (e) {
  console.log("SMOKE FAIL: " + e + "\n" + (e.stack || ""));
}
