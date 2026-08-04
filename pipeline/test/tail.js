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
