"use strict";
/* Karate lineage cladogram — vanilla JS, no dependencies, CSP-safe.
   Everything below runs against the JSON baked in by build_viz.py. */

/* ============ data & indexes ============ */
const DATA = JSON.parse(document.getElementById("data").textContent);
const byId = new Map(DATA.nodes.map(n => [n.id, n]));
const placed = DATA.nodes.filter(n => n.x !== undefined);
const orphans = DATA.nodes.filter(n => n.x === undefined);
const parentsOf = new Map(), childrenOf = new Map();
for (const e of DATA.edges) {
  if (!parentsOf.has(e.target)) parentsOf.set(e.target, []);
  if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
  parentsOf.get(e.target).push(e);
  childrenOf.get(e.source).push(e);
}
const famById = new Map(DATA.families.map(f => [f.id, f]));
const maxDesc = Math.max(...placed.map(n => n.desc), 1);
const R = n => 4.5 + 11 * Math.sqrt(n.desc / maxDesc);
const CONF_ORD = { high: 3, medium: 2, low: 1 };
/* cartographic name hierarchy — must match font_size() in build_viz.py */
const fontSize = n => n.desc >= 60 ? 16 : n.desc >= 20 ? 13.5 : n.desc >= 5 ? 12 : 11;
function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const c = v => Math.round(v).toString(16).padStart(2, "0");
  return "#" + c(r1 + (r2 - r1) * t) + c(g1 + (g2 - g1) * t) + c(b1 + (b2 - b1) * t);
}

/* expert corrections, persisted locally, survive rebuilds (keyed by node id):
   names AND dates are editable; wrong links can be flagged; links can be added */
const EDITS_KEY = "karate-name-edits";
const FLAGS_KEY = "karate-edge-flags";
const EADDS_KEY = "karate-edge-adds";
const RM_KEY = "karate-person-removals";
let edits = {}, edgeFlags = {}, edgeAdds = [], removals = {};
try { edits = JSON.parse(localStorage.getItem(EDITS_KEY) || "{}"); } catch (_) {}
try { edgeFlags = JSON.parse(localStorage.getItem(FLAGS_KEY) || "{}"); } catch (_) {}
try { edgeAdds = JSON.parse(localStorage.getItem(EADDS_KEY) || "[]"); } catch (_) {}
try { removals = JSON.parse(localStorage.getItem(RM_KEY) || "{}"); } catch (_) {}
// Some browsers refuse storage to a page opened as a local file, and private
// windows can refuse it too. Corrections must never be lost silently: keep them
// in memory regardless, and say once that they will not survive a reload.
let storageWarned = false;
function saveCorrections() {
  try {
    localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
    localStorage.setItem(FLAGS_KEY, JSON.stringify(edgeFlags));
    localStorage.setItem(EADDS_KEY, JSON.stringify(edgeAdds));
    localStorage.setItem(RM_KEY, JSON.stringify(removals));
  } catch (_) {
    if (!storageWarned) {
      storageWarned = true;
      toast("This browser will not store corrections for a local file, so they "
          + "will be lost if you reload. Use Export → “Expert corrections” before closing.");
    }
  }
  updateEditBadge();
}
function eff(n) {           // node fields with local edits applied
  const e = edits[n.id] || {};
  return {
    name: e.display_name || n.name,
    romaji: e.name_romaji || n.romaji,
    native: e.name_native || n.native,
    birth: e.birth_year !== undefined ? e.birth_year : n.birth,
    death: e.death_year !== undefined ? e.death_year : n.death,
    edited: !!(e.display_name || e.name_romaji || e.name_native
               || e.birth_year !== undefined || e.death_year !== undefined),
  };
}

/* ============ theme ============ */
function themeDark() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}
function styleColour(sid) {
  const c = DATA.styleColours[sid];
  if (!c) return themeDark() ? "#898781" : "#898781";
  return themeDark() ? c.dark : c.light;
}
function famColour(fid) {
  const f = famById.get(fid);
  return f ? (themeDark() ? f.dark : f.light) : "#898781";
}
/* people with no recorded style are coloured by their lineage's family */
function nodeFill(n) {
  return (n.famInherited || !n.primary) ? famColour(n.family) : styleColour(n.primary);
}

/* ============ svg scaffold ============ */
const SVGNS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("canvas");
const el = (tag, attrs, parent) => {
  const x = document.createElementNS(SVGNS, tag);
  for (const k in attrs || {}) x.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(x);
  return x;
};
const world = el("g", { id: "world" }, svg);
const gBands = el("g", null, world);
const gEdges = el("g", null, world);
const gNodes = el("g", null, world);
const gLabels = el("g", null, world);

/* positions: live coordinates (isolate mode animates these) */
const pos = new Map();
for (const n of placed) pos.set(n.id, { x: n.x, y: n.y });

/* ---- generation columns + island captions ---- */
function renderBands() {
  gBands.textContent = "";
  const main = DATA.blocks[0];
  const y0 = -84, bandH = main.h + 168;
  let lastEpoch = "";
  DATA.bands.forEach((b, i) => {
    if (i % 2 === 0)
      el("rect", { class: "band-rect", x: b.x0, y: y0, width: b.x1 - b.x0, height: bandH }, gBands);
    if (!b.caption) return;                       // merged empty decades stay quiet
    const t = el("text", { class: "band-cap", x: b.x0 + 4, y: y0 + 22 }, gBands);
    const g1 = el("tspan", { class: "gen" }, t); g1.textContent = b.caption;
    if (b.epoch && b.epoch !== lastEpoch) {       // epoch named once, where it changes
      const g2 = el("tspan", { dx: 8 }, t); g2.textContent = b.epoch;
    }
    if (b.epoch) lastEpoch = b.epoch;
  });
  DATA.blocks.slice(1).forEach(b => {
    const t = el("text", { class: "island-cap", x: b.x, y: b.y - 26 }, gBands);
    t.textContent = "⌇ " + b.label + " — not yet linked to the main tree";
  });
  if (main.strayCount) {
    const t = el("text", { class: "island-cap", x: 8, y: main.strayY }, gBands);
    t.textContent = "⌇ unlinked groups — placed by era, not yet joined to the main tree";
  }
}

/* ---- edges: horizontal S-curves, leaving after the teacher's label ---- */
const edgeEls = new Map();   // key s->t : {vis, hit, e}
function edgePath(e) {
  const s = pos.get(e.source), t = pos.get(e.target);
  if (!s || !t) return "";
  const sn = byId.get(e.source), tn = byId.get(e.target);
  const x0 = s.x + sn.lw - 16, x1 = t.x - R(tn) - 4;
  const mx = x0 + Math.max(24, (x1 - x0) / 2);
  const mx2 = x1 - Math.max(24, (x1 - x0) / 2);
  return `M${x0},${s.y} C${mx},${s.y} ${mx2},${t.y} ${x1},${t.y}`;
}
/* each branch is tinted by the teacher's style family, so lineages read
   as coloured streams flowing left to right */
function edgeStroke(e) {
  const neutral = themeDark() ? "#4d4c48" : "#b9b7ae";
  const fam = byId.get(e.source).family;
  const f = famById.get(fam);
  if (!f || fam === "other") return neutral;
  return mixHex(themeDark() ? f.dark : f.light, neutral, 0.42);
}
function renderEdges() {
  gEdges.textContent = "";
  edgeEls.clear();
  for (const e of DATA.edges) {
    if (!pos.has(e.source) || !pos.has(e.target)) continue;
    const cls = "edge" + (e.primary ? "" : " secondary") + (e.confidence === "low" ? " conf-low" : "");
    const vis = el("path", { class: cls, d: edgePath(e), stroke: edgeStroke(e),
                             "stroke-opacity": e.primary ? 0.22 : 0.12,
                             "stroke-width": e.primary ? 1.4 : 1 }, gEdges);
    const hit = el("path", { d: edgePath(e), fill: "none", stroke: "rgba(0,0,0,0)",
                             "stroke-width": 9, style: "pointer-events:stroke" }, gEdges);
    hit.addEventListener("pointerdown", ev => { if (ev.button === 0) pendingEdge = e; });
    hit.addEventListener("pointerenter", ev => showEdgeTip(e, ev));
    hit.addEventListener("pointermove", ev => moveTip(ev));
    hit.addEventListener("pointerleave", hideTip);
    edgeEls.set(e.source + ">" + e.target, { vis, hit, e });
  }
}
function updateEdgePaths() {
  for (const { vis, hit, e } of edgeEls.values()) {
    const d = edgePath(e);
    vis.setAttribute("d", d);
    hit.setAttribute("d", d);
  }
}

/* ---- nodes & labels ---- */
const nodeEls = new Map(), labelEls = new Map();
function labelText(n) {
  const f = eff(n);
  const bits = [];
  if (f.birth || f.death) bits.push((f.birth || "?") + "–" + (f.death || ""));
  else if (n.eb) bits.push("c. " + n.eb + " (est.)");
  if (n.trained) bits.push("tr. c." + n.trained + (n.trainedEst ? "*" : ""));
  if (n.styleLabel) bits.push(n.styleLabel);
  return { l1: f.name, native: f.native, l2: bits.join(" · "), edited: f.edited };
}
function renderNodes() {
  gNodes.textContent = ""; gLabels.textContent = "";
  nodeEls.clear(); labelEls.clear();
  for (const n of placed) {
    const p = pos.get(n.id), r = R(n);
    const flags = n.flags || {};
    const cls = "node" + ((flags.needs_review || flags.wrong_entity) ? " review" : "")
                       + (flags.legendary ? " legendary" : "");
    const g = el("g", { class: cls, transform: `translate(${p.x},${p.y})` }, gNodes);
    el("circle", { r: Math.max(r + 9, 13), fill: "rgba(0,0,0,0)" }, g);   // generous hit area
    el("circle", { class: "halo", r: r + 3.5 }, g);
    if (flags.legendary) el("circle", { class: "ring-leg", r: r + 6 }, g);
    if (n.kob) el("circle", { class: "ring-kob", r: r + 3 }, g);          // kobudo practitioner
    el("circle", { class: "core", r, fill: nodeFill(n) }, g);
    const enter = ev => { showNodeTip(n, ev); hoverAdjacent(n.id, true); };
    const leave = () => { hideTip(); hoverAdjacent(n.id, false); };
    /* selection arms on pointerdown: the pan handler captures the pointer,
       so click events retarget to the svg and never reach this element */
    g.addEventListener("pointerdown", ev => { if (ev.button === 0) pendingSel = n.id; });
    g.addEventListener("pointerenter", enter);
    g.addEventListener("pointermove", ev => moveTip(ev));
    g.addEventListener("pointerleave", leave);
    nodeEls.set(n.id, g);

    const fs = fontSize(n);
    const lg = el("g", { class: "lbl" }, gLabels);
    const t1 = el("text", { class: "l1", x: 0, y: 4, "font-size": fs }, lg);
    const t2 = el("text", { class: "l2", x: 0, y: fs >= 13.5 ? 19 : 17,
                            "font-size": fs >= 13.5 ? 11 : 10.5 }, lg);
    lg.addEventListener("pointerdown", ev => { if (ev.button === 0) pendingSel = n.id; });
    lg.addEventListener("pointerenter", enter);
    lg.addEventListener("pointermove", ev => moveTip(ev));
    lg.addEventListener("pointerleave", leave);
    labelEls.set(n.id, { g: lg, t1, t2, n });
    refreshLabel(n.id);
  }
  layoutLabels();
}
function refreshLabel(id) {
  const L = labelEls.get(id); if (!L) return;
  const { l1, native, l2, edited } = labelText(L.n);
  L.t1.textContent = "";
  const s1 = el("tspan", edited ? { class: "edited" } : {}, L.t1);
  s1.textContent = l1;
  if (native) { const s2 = el("tspan", { class: "native", dx: 6 }, L.t1); s2.textContent = native; }
  L.t2.textContent = l2;
}

/* labels live in world space (they scale with the diagram); the layout
   reserves room for every label, so they can never collide. Zoom tiers
   only reduce clutter when zoomed far out. */
function layoutLabels() {
  for (const [id, L] of labelEls) {
    const p = pos.get(id);
    L.g.setAttribute("transform", `translate(${p.x + R(L.n) + 7},${p.y})`);
  }
}

const prio = new Map(placed.map(n => [n.id, n.desc * 10 + n.students]));
const prioSorted = [...prio.values()].sort((a, b) => b - a);
const HUB_CUT = prioSorted[Math.min(prioSorted.length - 1, Math.floor(placed.length * 0.14))] || 0;
function suppressLabels() {
  const k = view.k;
  const tier = k < 0.32 ? 0 : k < 0.62 ? 1 : 2;
  const near = new Set();          // labels forced visible for the selection
  const direct = new Set();        // the selected person's direct teachers/students
  if (state.focus) {
    direct.add(state.focus);
    for (const e of (parentsOf.get(state.focus) || [])) direct.add(e.source);
    for (const e of (childrenOf.get(state.focus) || [])) direct.add(e.target);
    const fs = lineageSet(state.focus, state.dir);
    for (const id of (fs.size <= 400 ? fs : direct)) near.add(id);
  }
  for (const n of placed) {
    const L = labelEls.get(n.id), nd = nodeEls.get(n.id);
    if (!L) continue;
    if (nd.classList.contains("hidden")) { L.g.classList.add("hidden"); continue; }
    const keep = tier > 0 || prio.get(n.id) >= HUB_CUT || near.has(n.id);
    L.g.classList.toggle("hidden", !keep);
    L.t2.style.display = tier === 2 || direct.has(n.id) ? "" : "none";
    L.g.classList.toggle("focus", state.focus === n.id);
  }
}

/* ============ zoom / pan ============ */
const stage = document.getElementById("stage");
const view = { x: 60, y: 80, k: 1 };
/* the camera never leaves the cladogram: content edges stop at the padding,
   and content smaller than the window sits centred */
function clampView() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const b = graphBBox(state.isolated ? new Set(state.isolated) : null);
  const P = 40;
  const xMax = P - b.x0 * view.k, xMin = r.width - P - b.x1 * view.k;
  view.x = xMin > xMax ? (xMin + xMax) / 2 : Math.min(xMax, Math.max(xMin, view.x));
  const yMax = P - b.y0 * view.k, yMin = r.height - P - b.y1 * view.k;
  view.y = yMin > yMax ? (yMin + yMax) / 2 : Math.min(yMax, Math.max(yMin, view.y));
}
function applyView() {
  clampView();
  world.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
  updateRuler();
  updateMiniViewport();
  scheduleSuppress();
}
/* smooth camera flight */
let camAnim = null;
function prefersReducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function animateView(tx, ty, tk, dur) {
  cancelAnimationFrame(camAnim);
  const f = { x: view.x, y: view.y, k: view.k }, t0 = performance.now();
  const D = dur || 700;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const step = now => {
    const t = Math.min(1, (now - t0) / D), z = ease(t);
    view.x = f.x + (tx - f.x) * z;
    view.y = f.y + (ty - f.y) * z;
    view.k = f.k + (tk - f.k) * z;
    applyView();
    if (t < 1) camAnim = requestAnimationFrame(step);
  };
  camAnim = requestAnimationFrame(step);
}
function stopCamera() { cancelAnimationFrame(camAnim); }
let supTimer = null;
function scheduleSuppress() {
  clearTimeout(supTimer);
  supTimer = setTimeout(suppressLabels, 130);
}
function zoomAt(cx, cy, factor) {
  const k2 = Math.min(4, Math.max(0.06, view.k * factor));
  view.x = cx - (cx - view.x) * (k2 / view.k);
  view.y = cy - (cy - view.y) * (k2 / view.k);
  view.k = k2;
  applyView();
}
function graphBBox(ids) {
  let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
  for (const n of placed) {
    if (ids && !ids.has(n.id)) continue;
    const p = pos.get(n.id);
    x0 = Math.min(x0, p.x - 30); y0 = Math.min(y0, p.y - 90);
    x1 = Math.max(x1, p.x + n.lw + 30); y1 = Math.max(y1, p.y + 50);
  }
  return { x0, y0, x1, y1 };
}
function fit(ids, opts) {
  const b = graphBBox(ids), r = stage.getBoundingClientRect();
  const k = Math.min(4, Math.max(0.06, Math.min(r.width / (b.x1 - b.x0), r.height / (b.y1 - b.y0)) * 0.94));
  const tx = (r.width - (b.x0 + b.x1) * k) / 2;
  const ty = (r.height - (b.y0 + b.y1) * k) / 2;
  if (opts && opts.instant) { view.x = tx; view.y = ty; view.k = k; applyView(); }
  else animateView(tx, ty, k, 600);
}
function centreOn(id, k, dur) {
  const p = pos.get(id); if (!p) return;
  const n = byId.get(id);
  const r = stage.getBoundingClientRect();
  const tk = k || Math.max(view.k, 1);
  animateView(r.width / 2 - (p.x + n.lw / 2) * tk,
              r.height * 0.44 - p.y * tk, tk, dur || 700);
}
svg.addEventListener("wheel", ev => {
  ev.preventDefault();
  stopCamera(); userMoved();
  const r = svg.getBoundingClientRect();
  if (ev.ctrlKey || ev.metaKey) {
    // a trackpad pinch arrives as ctrlKey with large deltas; a mouse wheel with
    // small ones. Damp both, and clamp so one flick cannot jump three zoom levels.
    const raw = ev.deltaY * (ev.deltaMode === 1 ? 18 : 1);
    const f = Math.exp(-Math.max(-90, Math.min(90, raw)) * 0.0065);
    zoomAt(ev.clientX - r.left, ev.clientY - r.top, f);
  } else if (ev.shiftKey) {
    // shift + scroll wheel moves along the timeline (left–right)
    view.x -= (ev.deltaY || ev.deltaX); applyView();
  } else {
    view.x -= ev.deltaX; view.y -= ev.deltaY; applyView();
  }
}, { passive: false });
/* Curator mode needs no switch: the build itself decides. The curator's copy
   (karate-cladogram.html) carries the evidence layer; the published copies are
   built without it, so there is nothing there to reveal. Open your file and you
   see sources; open the website and you do not. #public previews the public view
   on the curator's copy. */
const hasEvidence = (DATA.edges || []).some(e => (e.evidence || []).length)
                 || (DATA.nodes || []).some(n => n.wiki);
let previewPublic = location.hash.indexOf("public") >= 0;
function curator() { return hasEvidence && !previewPublic; }
addEventListener("hashchange", () => {
  const want = location.hash.indexOf("public") >= 0;
  if (want !== previewPublic) { previewPublic = want; location.reload(); }
});

let pan = null, pendingSel = null, pendingEdge = null;
svg.addEventListener("pointerdown", ev => {
  if (ev.button !== 0) return;
  stopCamera(); userMoved();
  pan = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, moved: false };
  svg.classList.add("panning");
  svg.setPointerCapture(ev.pointerId);
});
svg.addEventListener("pointermove", ev => {
  if (!pan) return;
  const dx = ev.clientX - pan.x, dy = ev.clientY - pan.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
  const nx = pan.vx + dx, ny = pan.vy + dy;
  const now = performance.now(), dt = now - (pan.t || now);
  if (dt > 0) {                      // track velocity for the glide on release
    pan.vxx = (nx - view.x) / dt; pan.vyy = (ny - view.y) / dt;
  }
  pan.t = now;
  view.x = nx; view.y = ny;
  applyView();   // keeps the date ruler and minimap tracking the drag
});
// a flick keeps moving and eases to a stop, which makes a large map feel navigable
function glide(vx, vy) {
  cancelAnimationFrame(camAnim);
  let last = performance.now();
  const step = now => {
    const dt = Math.min(40, now - last); last = now;
    vx *= Math.pow(0.94, dt / 16); vy *= Math.pow(0.94, dt / 16);
    if (Math.abs(vx) < 0.02 && Math.abs(vy) < 0.02) return;
    view.x += vx * dt; view.y += vy * dt;
    applyView();
    camAnim = requestAnimationFrame(step);
  };
  camAnim = requestAnimationFrame(step);
}
svg.addEventListener("pointerup", () => {
  if (pan && !pan.moved) {
    if (pendingSel) clickSelect(pendingSel);
    else if (pendingEdge) openEdgeDetail(pendingEdge);
    else clearSelection();
  }
  if (pan && pan.moved && !prefersReducedMotion() &&
      (Math.abs(pan.vxx || 0) > 0.15 || Math.abs(pan.vyy || 0) > 0.15))
    glide(pan.vxx, pan.vyy);
  pendingSel = null;
  pendingEdge = null;
  pan = null;
  svg.classList.remove("panning");
  scheduleSuppress();
});
svg.addEventListener("dblclick", ev => {
  const r = svg.getBoundingClientRect();
  zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.shiftKey ? 1 / 1.6 : 1.6);
});
document.getElementById("zoomin").onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.35); };
document.getElementById("zoomout").onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.35); };
document.getElementById("zoomfit").onclick = () => fit(state.isolated ? new Set(state.isolated) : null);
addEventListener("resize", () => scheduleSuppress());

/* ============ tooltip ============ */
const tip = document.getElementById("tooltip");
let tipHideTimer = null;
function showNodeTip(n, ev) {
  clearTimeout(tipHideTimer);
  const f = eff(n), t = labelText(n);
  tip.innerHTML = "";
  const d1 = document.createElement("div"); d1.className = "tname";
  d1.textContent = f.name + (f.native ? " · " + f.native : "");
  const d2 = document.createElement("div"); d2.className = "tsub";
  d2.textContent = t.l2 || "no dates recorded";
  const d3 = document.createElement("div"); d3.className = "tsub";
  const tc = (parentsOf.get(n.id) || []).length, sc = (childrenOf.get(n.id) || []).length;
  d3.textContent = `${tc} teacher${tc === 1 ? "" : "s"} · ${sc} student${sc === 1 ? "" : "s"} · ${n.desc} in lineage`;
  tip.append(d1, d2, d3);
  tip.hidden = false;
  moveTip(ev);
}
function showEdgeTip(e, ev) {
  clearTimeout(tipHideTimer);
  const s = eff(byId.get(e.source)), t = eff(byId.get(e.target));
  tip.innerHTML = "";
  const d1 = document.createElement("div"); d1.className = "tname";
  d1.textContent = `${s.name} taught ${t.name}`;
  const d2 = document.createElement("div"); d2.className = "tsub";
  d2.textContent = `${e.confidence} confidence${e.primary ? "" : " · secondary lineage"}`;
  tip.append(d1, d2);
  // raw source URLs are curator-only, and belong in the panel (click), not a hover
  if (curator() && (e.evidence || []).length) {
    const d3 = document.createElement("div"); d3.className = "tsub tsrc";
    d3.textContent = e.evidence.length + " source"
      + (e.evidence.length === 1 ? "" : "s") + " — click the line to read them";
    tip.appendChild(d3);
  }
  tip.hidden = false;
  moveTip(ev);
}
function moveTip(ev) {
  const r = stage.getBoundingClientRect();
  let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
  x = Math.max(8, Math.min(x, r.width - tip.offsetWidth - 10));
  y = Math.max(8, Math.min(y, r.height - tip.offsetHeight - 10));
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function hideTip() {
  clearTimeout(tipHideTimer);
  tipHideTimer = setTimeout(() => { tip.hidden = true; }, 200);
}
function hoverAdjacent(id, on) {
  for (const key of edgeEls.keys()) {
    const [s, t] = key.split(">");
    if (s === id || t === id) {
      const keep = !!state.focus && (s === state.focus || t === state.focus);
      edgeEls.get(key).vis.classList.toggle("hl", on || keep);
    }
  }
}

/* ============ filtering & focus ============ */
const state = { familiesOff: new Set(), style: "", styleSet: null, focus: null, dir: "both",
                hideLow: false, isolated: null };

/* the style taxonomy is a tree: filtering by a style includes its sub-styles */
const styleKids = new Map();
for (const s of DATA.styles) {
  if (!s.parent) continue;
  if (!styleKids.has(s.parent)) styleKids.set(s.parent, []);
  styleKids.get(s.parent).push(s.id);
}
function styleWithDesc(id) {
  const out = new Set([id]), st = [id];
  while (st.length) {
    const u = st.pop();
    for (const k of styleKids.get(u) || []) if (!out.has(k)) { out.add(k); st.push(k); }
  }
  return out;
}
function setStyleFilter(id) {
  state.style = id || "";
  state.styleSet = id ? styleWithDesc(id) : null;
  const sel = document.getElementById("stylefilter");
  if (sel) sel.value = state.style;
  applyFilters();
}
function styleMembers(id) {
  const set = styleWithDesc(id);
  return placed.filter(n => n.styles.some(s => set.has(s))).map(n => n.id);
}

// depth === Infinity walks the whole lineage; depth === 1 gives only the people
// this person taught directly, 2 adds their students, and so on
function lineageSet(id, dir, depth) {
  depth = depth === undefined ? Infinity : depth;
  const out = new Set([id]);
  const walk = (start, rel) => {
    const q = [[start, 0]];
    while (q.length) {
      const [u, d] = q.shift();
      if (d >= depth) continue;
      for (const e of (rel.get(u) || [])) {
        const v = rel === parentsOf ? e.source : e.target;
        if (!out.has(v)) { out.add(v); q.push([v, d + 1]); }
      }
    }
  };
  if (dir !== "down") walk(id, parentsOf);
  if (dir !== "up") walk(id, childrenOf);
  return out;
}
// how many teaching generations a lineage actually runs to, so the generation
// picker can stop offering depths that add nobody
function lineageDepth(id, dir) {
  let d = 0, prev = 1;
  for (let k = 1; k <= 40; k++) {
    const n = lineageSet(id, dir, k).size;
    if (n === prev) break;
    prev = n; d = k;
  }
  return d;
}

function applyFilters() {
  const focusSet = state.focus ? lineageSet(state.focus, state.dir) : null;
  for (const n of placed) {
    const g = nodeEls.get(n.id), L = labelEls.get(n.id);
    const inIso = !state.isolated || state.isolated.includes(n.id);
    const famOK = !state.familiesOff.has(n.family);
    const styleOK = !state.styleSet || n.styles.some(s => state.styleSet.has(s));
    g.classList.toggle("hidden", !inIso);
    L.g.classList.toggle("hidden", !inIso);
    // a selected person GHOSTS everyone off their lineage; filters merely dim
    const gh = inIso && !!focusSet && !focusSet.has(n.id);
    const dim = inIso && !gh && !(famOK && styleOK);
    g.classList.toggle("ghost", gh);
    L.g.classList.toggle("ghost", gh);
    g.classList.toggle("dim", dim);
    L.g.classList.toggle("dim", dim);
    g.classList.toggle("removed", !!removals[n.id]);
    L.g.classList.toggle("removed", !!removals[n.id]);
    g.classList.toggle("focus", state.focus === n.id);
  }
  for (const { vis, hit, e } of edgeEls.values()) {
    const inIso = !state.isolated || (state.isolated.includes(e.source) && state.isolated.includes(e.target));
    const lowHidden = state.hideLow && e.confidence === "low";
    vis.classList.toggle("hidden", !inIso || lowHidden);
    // the hit-path carries no `edge` class, so the stylesheet's .hidden rule never
    // applied to it: hide and disarm it explicitly, or filtered-out lines keep
    // answering the pointer over apparently blank canvas
    const gone = !inIso || lowHidden;
    hit.classList.toggle("hidden", gone);
    hit.style.display = gone ? "none" : "";
    const sC = nodeEls.get(e.source).classList, tC = nodeEls.get(e.target).classList;
    const gh = sC.contains("ghost") || tC.contains("ghost");
    const dim = !gh && (sC.contains("dim") || tC.contains("dim"));
    vis.classList.toggle("ghost", gh);
    vis.classList.toggle("dim", dim);
    hit.style.pointerEvents = gh ? "none" : "stroke";
    const direct = !!state.focus && (e.source === state.focus || e.target === state.focus);
    // the whole selected lineage reads at full strength; direct edges in accent
    vis.classList.toggle("onpath", !!focusSet && !gh && !dim && !direct);
    vis.classList.toggle("hl", direct);
    vis.classList.toggle("flagged", !!edgeFlags[e.source + ">" + e.target]);
  }
  gBands.style.display = state.isolated ? "none" : "";
  scheduleSuppress();
  renderLegend();
}

function selectNode(id) {
  state.focus = id;
  document.getElementById("focusmode").hidden = false;
  document.getElementById("focusname").textContent = eff(byId.get(id)).name;
  applyFilters();
  openDetail(id);
}
/* clicking a person behaves exactly like picking them in search:
   the lineage stands out, the camera moves in, the panel opens */
function clickSelect(id) {
  selectNode(id);
  if (!state.isolated) centreOn(id, Math.max(view.k, 0.9));
}
function clearSelection() {
  if (state.isolated) return;   // in isolate mode Esc/✕ exits explicitly
  state.focus = null;
  document.getElementById("focusmode").hidden = true;
  closePanel("detail");
  applyFilters();
}
document.getElementById("clearfocus").onclick = () => {
  exitIsolate(false);
  state.focus = null;
  document.getElementById("focusmode").hidden = true;
  closePanel("detail");
  applyFilters();
};
document.getElementById("focusdir").onchange = ev => { state.dir = ev.target.value; applyFilters(); };
// however far you have wandered, come straight back to the person you selected
document.getElementById("recentre").onclick = () => {
  if (state.focus) { stopCamera(); centreOn(state.focus, Math.max(view.k, 0.9)); }
};
document.getElementById("hidelow").onchange = ev => { state.hideLow = ev.target.checked; applyFilters(); };
addEventListener("keydown", ev => {
  if (ev.key === "Escape") {
    hideMenus();
    if (state.isolated) document.getElementById("clearfocus").click();
    else clearSelection();
    return;
  }
  // keyboard navigation: arrows pan, +/− zoom, F fits, Home returns to the left edge
  const tag = (ev.target && ev.target.tagName) || "";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (typeof tourIdx !== "undefined" && tourIdx !== null) return;   // tour owns the arrows
  const step = ev.shiftKey ? 400 : 140;
  const r = stage.getBoundingClientRect();
  const acts = {
    ArrowLeft: () => { view.x += step; applyView(); },
    ArrowRight: () => { view.x -= step; applyView(); },
    ArrowUp: () => { view.y += step; applyView(); },
    ArrowDown: () => { view.y -= step; applyView(); },
    "+": () => zoomAt(r.width / 2, r.height / 2, 1.35),
    "=": () => zoomAt(r.width / 2, r.height / 2, 1.35),
    "-": () => zoomAt(r.width / 2, r.height / 2, 1 / 1.35),
    f: () => fit(state.isolated ? new Set(state.isolated) : null),
    "0": () => fit(state.isolated ? new Set(state.isolated) : null),
    Home: () => openLeft(400),
    r: () => { if (state.focus) centreOn(state.focus, Math.max(view.k, 0.9)); },
    R: () => { if (state.focus) centreOn(state.focus, Math.max(view.k, 0.9)); },
  };
  const act = acts[ev.key];
  if (act) { ev.preventDefault(); stopCamera(); userMoved(); act(); }
});

/* ============ isolate mode (client-side re-layout) ============ */
const savedPos = new Map();
function isolateLayout(ids, compact) {
  const set = new Set(ids);
  // a printed figure wants density: on screen the rows breathe, on paper that
  // breathing room becomes acres of white space around unreadably small names
  const PITCH = compact ? Math.round(DATA.meta.row_h * 0.62) : DATA.meta.row_h;
  const COL_GAP = compact ? 46 : 90;
  const gmin = Math.min(...ids.map(i => byId.get(i).gen));
  const layers = [];
  for (const id of ids) {
    const g = byId.get(id).gen - gmin;
    (layers[g] = layers[g] || []).push(id);
  }
  for (let i = 0; i < layers.length; i++) layers[i] = layers[i] || [];
  const pIdx = new Map();
  const reindex = () => layers.forEach(l => l.forEach((v, i) => pIdx.set(v, i)));
  reindex();
  const neigh = (v, up) => {
    const es = (up ? parentsOf.get(v) : childrenOf.get(v)) || [];
    return es.map(e => up ? e.source : e.target).filter(u => set.has(u));
  };
  for (let it = 0; it < 10; it++) {
    const up = it % 2 === 0;
    const idxs = up ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).slice(0, -1).reverse();
    for (const li of idxs) {
      layers[li].sort((a, b) => {
        const ba = neigh(a, up).map(u => pIdx.get(u));
        const bb = neigh(b, up).map(u => pIdx.get(u));
        const ma = ba.length ? ba.reduce((s, v) => s + v, 0) / ba.length : pIdx.get(a);
        const mb = bb.length ? bb.reduce((s, v) => s + v, 0) / bb.length : pIdx.get(b);
        return ma - mb || pIdx.get(a) - pIdx.get(b);
      });
      reindex();
    }
  }
  // column x offsets from the widest label per column
  const colX = [];
  let cx = 0;
  for (const l of layers) {
    colX.push(cx);
    cx += Math.max(...l.map(v => byId.get(v).lw), 80) + COL_GAP;
  }
  // vertical positions: barycentric relaxation on uniform slots
  const y = new Map();
  layers.forEach(l => l.forEach((v, i) => y.set(v, i * PITCH)));
  for (let rnd = 0; rnd < 8; rnd++) {
    const up = rnd % 2 === 0;
    const idxs = up ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).slice(0, -1).reverse();
    for (const li of idxs) {
      const l = layers[li];
      l.forEach(v => {
        const ns = neigh(v, up).map(u => y.get(u));
        if (ns.length) y.set(v, ns.reduce((s, q) => s + q, 0) / ns.length);
      });
      for (let i = 1; i < l.length; i++) {
        const lo = y.get(l[i - 1]) + PITCH;
        if (y.get(l[i]) < lo) y.set(l[i], lo);
      }
    }
  }
  // The relaxation above pushes rows apart to keep edges straight, which leaves an
  // isolated clade two to three times taller than it needs to be: on a poster that
  // reads as bands of empty paper. Squeeze out the unused rows, keeping the vertical
  // ORDER (so no new edge crossings), then restore a full row's clearance within
  // each column so no two names in the same generation collide.
  for (let pass = 0; pass < 5; pass++) {
    const row = new Map();
    for (const [v, yy] of y) row.set(v, Math.round(yy / PITCH));
    const used = [...new Set(row.values())].sort((a, b) => a - b);
    if (used.length === used[used.length - 1] - used[0] + 1) break;   // already gapless
    const rank = new Map(used.map((s, i) => [s, i]));
    for (const [v, s] of row) y.set(v, rank.get(s) * PITCH);
    for (const l of layers) {                       // no two names in one generation collide
      const col = [...l].sort((a, b) => y.get(a) - y.get(b));
      for (let i = 1; i < col.length; i++) {
        const lo = y.get(col[i - 1]) + PITCH;
        if (y.get(col[i]) < lo) y.set(col[i], lo);
      }
    }
  }
  const ymin = Math.min(...y.values());
  const out = new Map();
  for (const id of ids) {
    const g = byId.get(id).gen - gmin;
    out.set(id, { x: colX[g], y: y.get(id) - ymin + g * DATA.meta.shear_y });
  }
  return out;
}
let animId = null;
function animatePositions(target, done) {
  cancelAnimationFrame(animId);
  const t0 = performance.now(), D = 520;
  const from = new Map([...target.keys()].map(id => [id, { ...pos.get(id) }]));
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const step = now => {
    const t = Math.min(1, (now - t0) / D), z = ease(t);
    for (const [id, tp] of target) {
      const fp = from.get(id);
      pos.set(id, { x: fp.x + (tp.x - fp.x) * z, y: fp.y + (tp.y - fp.y) * z });
      const n = byId.get(id);
      nodeEls.get(id).setAttribute("transform", `translate(${pos.get(id).x},${pos.get(id).y})`);
    }
    updateEdgePaths();
    layoutLabels();
    if (t < 1) animId = requestAnimationFrame(step);
    else { scheduleSuppress(); if (done) done(); }
  };
  animId = requestAnimationFrame(step);
}
function exitIsolate(refit) {
  if (!state.isolated) return;
  state.isolated = null;
  const target = new Map([...savedPos].map(([id, p]) => [id, { ...p }]));
  applyFilters();
  animatePositions(target, () => { if (refit) fit(null); });
  document.getElementById("isolate").textContent = "Isolate";
  bindIsolate();
}
function bindIsolate() {
  const b = document.getElementById("isolate");
  b.onclick = () => {
    if (!state.focus) return;
    const ids = [...lineageSet(state.focus, state.dir)].filter(id => pos.has(id));
    if (ids.length < 2) return;
    if (!state.isolated) for (const [id, p] of pos) savedPos.set(id, { ...p });
    state.isolated = ids;
    applyFilters();
    animatePositions(isolateLayout(ids), () => fit(new Set(ids)));
    b.textContent = "Master view";
    b.onclick = () => exitIsolate(true);
  };
}

/* ============ legend (families, expandable to every style) ============ */
const styleCounts = (() => {
  const m = {};
  for (const n of placed) for (const s of n.styles) m[s] = (m[s] || 0) + 1;
  return m;
})();
const legendOpen = new Set();
function renderLegend() {
  const box = document.getElementById("legend");
  if (!box) return;   // legend removed from the page; the style dropdown filters instead
  box.innerHTML = "<h3>Style families</h3>";
  const counts = {};
  for (const n of placed) counts[n.family] = (counts[n.family] || 0) + 1;
  for (const f of DATA.families) {
    if (!counts[f.id]) continue;
    const row = document.createElement("div");
    row.className = "leg-row" + (state.familiesOff.has(f.id) ? " off" : "");
    const sw = document.createElement("span");
    sw.className = "leg-swatch";
    sw.style.background = themeDark() ? f.dark : f.light;
    const lb = document.createElement("span"); lb.textContent = f.label;
    const ct = document.createElement("span"); ct.className = "leg-count"; ct.textContent = counts[f.id];
    const styles = DATA.styles
      .filter(s => s.family === f.id && styleCounts[s.id])
      .sort((a, b) => styleCounts[b.id] - styleCounts[a.id]);
    const chev = document.createElement("span");
    chev.className = "leg-chev";
    chev.textContent = legendOpen.has(f.id) ? "▾" : "▸";
    if (!styles.length) chev.style.visibility = "hidden";
    chev.onclick = ev => {
      ev.stopPropagation();
      legendOpen.has(f.id) ? legendOpen.delete(f.id) : legendOpen.add(f.id);
      renderLegend();
    };
    row.append(chev, sw, lb, ct);
    row.onclick = () => {
      if (state.familiesOff.has(f.id)) state.familiesOff.delete(f.id);
      else state.familiesOff.add(f.id);
      applyFilters();
    };
    box.appendChild(row);
    if (legendOpen.has(f.id)) {
      for (const s of styles) {
        const srow = document.createElement("div");
        srow.className = "leg-style" + (state.style === s.id ? " on" : "");
        const dot = document.createElement("span");
        dot.className = "leg-dot";
        dot.style.background = styleColour(s.id);
        const sl = document.createElement("span"); sl.textContent = s.label;
        const sc = document.createElement("span"); sc.className = "leg-count"; sc.textContent = styleCounts[s.id];
        srow.append(dot, sl, sc);
        srow.onclick = () => {
          state.style = state.style === s.id ? "" : s.id;
          document.getElementById("stylefilter").value = state.style;
          applyFilters();
        };
        box.appendChild(srow);
      }
    }
  }
  const kob = document.createElement("div");
  kob.className = "leg-row"; kob.style.cursor = "default";
  const ring = document.createElement("span");
  ring.className = "leg-swatch";
  ring.style.cssText = "background:none;border:1.5px solid #64748b;border-radius:50%";
  const kl = document.createElement("span"); kl.textContent = "also practises kobudo";
  kob.append(ring, kl);
  box.appendChild(kob);
  if (state.familiesOff.size) {
    const r = document.createElement("button");
    r.className = "linklike"; r.style.marginTop = "5px"; r.textContent = "show all";
    r.onclick = () => { state.familiesOff.clear(); applyFilters(); };
    box.appendChild(r);
  }
}

/* ============ search ============ */
function searchHay(n) {   // built per query so name edits are searchable
  const f = eff(n);
  return [f.name, n.name, n.ascii, f.romaji, f.native, ...(n.alt || [])]
    .filter(Boolean).join(" ").toLowerCase();
}
const sInput = document.getElementById("search");
const sBox = document.getElementById("searchresults");
let sSel = -1, sHits = [];
function runSearch() {
  const q = sInput.value.trim().toLowerCase();
  sBox.innerHTML = ""; sSel = -1; sHits = [];
  if (q.length < 2) { sBox.hidden = true; return; }
  sHits = DATA.nodes.filter(n => searchHay(n).includes(q)).slice(0, 12)
    .map(n => ({ id: n.id, n }));
  for (const [i, r] of sHits.entries()) {
    const d = document.createElement("div");
    d.setAttribute("role", "option");
    const f = eff(r.n);
    const t = labelText(r.n);
    d.innerHTML = "";
    const top = document.createElement("div");
    top.textContent = f.name + (f.native ? " · " + f.native : "") + (r.n.connected ? "" : "  (unlinked)");
    const sub = document.createElement("div"); sub.className = "srsub"; sub.textContent = t.l2;
    d.append(top, sub);
    d.onclick = () => pickSearch(i);
    sBox.appendChild(d);
  }
  sBox.hidden = !sHits.length;
}
function pickSearch(i) {
  const r = sHits[i]; if (!r) return;
  sBox.hidden = true; sInput.value = "";
  if (pos.has(r.id)) { exitIsolate(false); selectNode(r.id); centreOn(r.id, Math.max(view.k, 0.9)); }
  else openDetail(r.id);
}
sInput.addEventListener("input", runSearch);
sInput.addEventListener("keydown", ev => {
  if (sBox.hidden) return;
  if (ev.key === "ArrowDown") { sSel = Math.min(sSel + 1, sHits.length - 1); ev.preventDefault(); }
  else if (ev.key === "ArrowUp") { sSel = Math.max(sSel - 1, 0); ev.preventDefault(); }
  else if (ev.key === "Enter") { pickSearch(Math.max(sSel, 0)); return; }
  else if (ev.key === "Escape") { sBox.hidden = true; return; }
  [...sBox.children].forEach((c, i) => c.classList.toggle("sel", i === sSel));
});
document.addEventListener("click", ev => { if (!ev.target.closest("#searchwrap")) sBox.hidden = true; });

/* ============ style filter dropdown: originating group → style → sub-style → … ============ */
// Canonical order of originating groups, kobudō distinct as requested.
const FAM_ORDER = [
  ["shuri-te", "Shuri-te"], ["naha-te", "Naha-te"], ["tomari-te", "Tomari-te"],
  ["uechi-ryu", "Uechi-Ryū"], ["kobudo", "Kobudō"],
  ["japanese", "Japanese karate"], ["kyokushin", "Kyokushin & offshoots"],
  ["korean", "Korean arts (Taekwondo & Tang Soo Do)"], ["kenpo", "Kenpō lines"],
  ["te", "Te (antecedents)"], ["chinese", "Chinese antecedents"], ["other", "Other"],
];
const styleByIdEarly = new Map(DATA.styles.map(s => [s.id, s]));
// depth-first walk of one originating group's styles, alphabetical among siblings
function familyStyleTree(fid) {
  const kids = new Map();
  for (const s of DATA.styles) {
    const p = s.parent && styleByIdEarly.has(s.parent) ? s.parent : "";
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(s);
  }
  for (const l of kids.values()) l.sort((a, b) => a.label.localeCompare(b.label));
  const out = [];
  const walk = (s, depth) => {
    out.push([s, depth]);
    for (const k of kids.get(s.id) || []) walk(k, depth + 1);
  };
  for (const s of kids.get("") || []) if (s.famRaw === fid) walk(s, 0);
  return out;
}
(function () {
  const sel = document.getElementById("stylefilter");
  for (const [fid, flabel] of FAM_ORDER) {
    const rows = familyStyleTree(fid);
    if (!rows.length) continue;
    const og = document.createElement("optgroup"); og.label = flabel;
    for (const [s, depth] of rows) {
      const o = document.createElement("option"); o.value = s.id;
      o.textContent = " ".repeat(depth) + (depth ? "· " : "") + s.label;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.onchange = () => setStyleFilter(sel.value);
})();

/* ============ kata & forms browser ============ */
const kataPanel = document.getElementById("katapanel");
const kataBtn = document.getElementById("katabtn");
const KATA = DATA.kata || [];
if (KATA.length) kataBtn.hidden = false;
// which kata a PERSON is credited with, and which a STYLE practises. The client
// wants these visible from the person and style boxes, not only in the kata tab.
const kataByPerson = new Map(), kataByStyle = new Map();
for (const k of KATA) {
  const credit = new Map();
  if (k.origin_person) credit.set(k.origin_person, "originated");
  for (const p of (k.introduced_by || [])) if (p.name) credit.set(p.name, p.role);
  if (k.modifier) credit.set(k.modifier, "modified");
  for (const [nm, role] of credit) {
    if (!kataByPerson.has(nm)) kataByPerson.set(nm, []);
    kataByPerson.get(nm).push({ kata: k, role });
  }
  for (const sid of (k.style_ids || [])) {
    if (!kataByStyle.has(sid)) kataByStyle.set(sid, []);
    kataByStyle.get(sid).push(k);
  }
}
function kataFor(name) { return kataByPerson.get(name) || []; }
// a style shows its own kata plus those of its parent styles, since a sub-style
// inherits the parent syllabus
function kataForStyle(sid) {
  const out = new Map();
  let cur = sid, hops = 0;
  while (cur && hops++ < 10) {
    for (const k of (kataByStyle.get(cur) || []))
      if (!out.has(k.name)) out.set(k.name, { kata: k, from: cur === sid ? "" : cur });
    const st = styleByIdMap.get(cur);
    cur = st && st.parent;
  }
  return [...out.values()];
}
let kataOpen = new Set(), kataQuery = "";
let styleQuery = "";
kataBtn.onclick = () => {
  if (!kataPanel.hidden) { kataPanel.hidden = true; return; }
  renderKataPanel();
};
function kataPersonBtn(nm) {
  const hit = placed.find(n => n.name === nm) || DATA.nodes.find(n => n.name === nm);
  const b = document.createElement("button"); b.className = "linklike";
  b.textContent = nm;
  if (hit) b.onclick = () => { kataPanel.hidden = true; if (pos.has(hit.id)) clickSelect(hit.id); else openDetail(hit.id); };
  else b.disabled = true;
  return b;
}
function renderKataPanel() {
  kataPanel.innerHTML = ""; kataPanel.hidden = false;
  kataPanel.appendChild(panelCloseBtn(kataPanel));
  const h = document.createElement("h3");
  h.textContent = "Kata & forms (" + KATA.length + ")"; kataPanel.appendChild(h);
  const note = document.createElement("div"); note.className = "edit-note";
  note.textContent = "Every kata with its meaning, origin and era, and who created, brought or "
    + "standardised it. Click a name to open that person on the canvas.";
  kataPanel.appendChild(note);
  const inp = document.createElement("input"); inp.type = "search";
  inp.placeholder = "Find a kata…"; inp.value = kataQuery; inp.className = "kata-search";
  inp.oninput = () => { kataQuery = inp.value; renderList(); };
  kataPanel.appendChild(inp);
  const list = document.createElement("div"); kataPanel.appendChild(list);
  const famLabel = Object.fromEntries(FAM_ORDER);
  function renderList() {
    list.textContent = "";
    const q = kataQuery.trim().toLowerCase();
    const match = k => !q || k.name.toLowerCase().includes(q)
      || (k.native || "").includes(kataQuery.trim())
      || (k.variants || []).some(v => v.toLowerCase().includes(q));
    for (const [fid] of FAM_ORDER) {
      const rows = KATA.filter(k => k.family === fid && match(k))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!rows.length) continue;
      const fh = document.createElement("div"); fh.className = "st-fam";
      const dot = document.createElement("span"); dot.className = "dot";
      dot.style.background = famColour(fid);
      fh.append(dot, document.createTextNode(" " + (famLabel[fid] || fid) + " · " + rows.length));
      list.appendChild(fh);
      for (const k of rows) {
        const row = document.createElement("div"); row.className = "kata-row";
        const head = document.createElement("button"); head.className = "linklike kata-name";
        head.textContent = (kataOpen.has(k.name) ? "▾ " : "▸ ") + k.name
          + (k.native ? "  " + k.native : "");
        head.onclick = () => {
          kataOpen.has(k.name) ? kataOpen.delete(k.name) : kataOpen.add(k.name);
          renderList();
        };
        row.appendChild(head);
        if (kataOpen.has(k.name)) {
          const d = document.createElement("div"); d.className = "kata-detail";
          const add = (lbl, txt) => {
            if (!txt) return;
            const e = document.createElement("div");
            const b = document.createElement("b"); b.textContent = lbl + " ";
            e.append(b, document.createTextNode(txt)); d.appendChild(e);
          };
          add("Meaning:", k.meaning);
          add("Era:", k.era);
          add("Origin:", [k.origin_person, k.origin_place].filter(Boolean).join(" · "));
          if ((k.variants || []).length) add("Also known as:", k.variants.join(", "));
          if ((k.introduced_by || []).length) {
            const e = document.createElement("div");
            const b = document.createElement("b"); b.textContent = "Lineage: "; e.appendChild(b);
            k.introduced_by.forEach((p, i) => {
              if (i) e.appendChild(document.createTextNode(" · "));
              e.appendChild(kataPersonBtn(p.name));
              e.appendChild(document.createTextNode(" (" + p.role + ")"));
            });
            d.appendChild(e);
          }
          const [kNote, kVer] = String(k.note || "").split(/\s*\[Verifier:/);
          add("", kNote);
          if (curator() && kVer) add("Verifier", kVer.replace(/\]\s*$/, ""));
          if (curator() && (k.sources || []).length) {
            const e = document.createElement("div"); e.className = "evrow";
            for (const u of k.sources) {
              const a = document.createElement("a"); a.href = u; a.target = "_blank";
              a.rel = "noopener"; a.textContent = "source ↗"; a.style.marginRight = "8px";
              e.appendChild(a);
            }
            d.appendChild(e);
          }
          row.appendChild(d);
        }
        list.appendChild(row);
      }
    }
    if (!list.children.length) {
      const d = document.createElement("div"); d.className = "edit-note";
      d.textContent = "No kata match “" + kataQuery + "”.";
      list.appendChild(d);
    }
  }
  renderList();
}

/* ============ style-tree browser: family → style → sub-style → … ============ */
const stylePanel = document.getElementById("stylepanel");
const styleOpen = new Set();
const styleByIdMap = new Map(DATA.styles.map(s => [s.id, s]));
document.getElementById("stylesbtn").onclick = () => {
  if (!stylePanel.hidden) { stylePanel.hidden = true; return; }
  renderStylePanel();
};
// A style's own page: where it sits in the family tree, who made it and when,
// who practises it, and which kata belong to it.
function openStyleDetail(sid) {
  const st = styleByIdMap.get(sid);
  if (!st) return;
  const panel = document.getElementById("detail");
  panel.innerHTML = ""; panel.hidden = false;
  panel.appendChild(panelCloseBtn(panel));
  const h = document.createElement("h2"); h.textContent = st.label;
  panel.appendChild(h);

  // the chain back to the originating group, so the hierarchy is explicit
  const chain = [];
  let cur = sid, hops = 0;
  while (cur && hops++ < 12) { chain.unshift(styleByIdMap.get(cur)); cur = styleByIdMap.get(cur).parent; }
  const famLabel = (FAM_ORDER.find(f => f[0] === st.famRaw) || [, st.famRaw])[1];
  // the originating groups (te, naha-te, shuri-te...) exist as nodes in the chain
  // too, so strip them before counting levels or the group gets counted twice
  const GROUP_IDS = new Set(FAM_ORDER.map(f => f[0]));
  const groupPart = chain.filter(c => GROUP_IDS.has(c.id));
  const stylePart = chain.filter(c => !GROUP_IDS.has(c.id));
  // the chain is already root-first and contains the originating groups, so show
  // it as it stands rather than prefixing the group and repeating it
  const sub = document.createElement("div"); sub.className = "romaji";
  sub.textContent = chain.map(c => c.label).join("  →  ");
  panel.appendChild(sub);

  const dl = document.createElement("dl");
  const add = (k, v) => {
    if (!v) return;
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    dl.append(dt, dd);
  };
  add("Originating group", famLabel);
  const lvl = stylePart.length;
  add("Level", lvl <= 0 ? "Originating group" : lvl === 1 ? "Style" : lvl === 2 ? "Sub-style"
      : lvl === 3 ? "Sub-sub-style" : "Sub-style, level " + lvl);
  add("Founder", st.founder);
  add("Founded", st.founded);
  if (st.parent && styleByIdMap.get(st.parent))
    add(GROUP_IDS.has(st.parent) ? "Sits directly under" : "Branch of",
        styleByIdMap.get(st.parent).label);
  const kids = (styleKids.get(sid) || []).map(k => styleByIdMap.get(k).label);
  add("Branches", kids.length ? kids.join(", ") : "");
  const mem = styleMembers(sid);
  add("People", mem.length + (mem.length === 1 ? " recorded" : " recorded, including sub-styles"));
  panel.appendChild(dl);

  // kata of this style, marking those inherited from a parent style
  const ks = kataForStyle(sid);
  if (ks.length) {
    const h4 = document.createElement("h4");
    h4.textContent = "Kata (" + ks.length + ")"; panel.appendChild(h4);
    ks.sort((a, b) => (a.from ? 1 : 0) - (b.from ? 1 : 0) || a.kata.name.localeCompare(b.kata.name));
    for (const { kata, from } of ks.slice(0, 60)) {
      const row = document.createElement("div"); row.className = "rel";
      const b = document.createElement("button"); b.className = "linklike";
      b.textContent = kata.name;
      b.onclick = () => { kataQuery = kata.name; kataOpen = new Set([kata.name]); renderKataPanel(); };
      const meta = document.createElement("span"); meta.className = "conf";
      const who = kata.origin_person || (kata.introduced_by || [])[0]?.name || "";
      meta.textContent = [who, kata.era, from ? "via " + (styleByIdMap.get(from) || {}).label : ""]
        .filter(Boolean).join(" · ");
      if (kata.disputed) meta.classList.add("disputed");
      row.append(b, meta);
      panel.appendChild(row);
    }
    if (ks.length > 60) {
      const more = document.createElement("div"); more.className = "edit-note";
      more.textContent = "…and " + (ks.length - 60) + " more; open the Kata tab to see them all.";
      panel.appendChild(more);
    }
  }

  // senior people in this style, most connected first
  if (mem.length) {
    const h4p = document.createElement("h4"); h4p.textContent = "Principal figures";
    panel.appendChild(h4p);
    const people = mem.map(i => byId.get(i)).filter(Boolean)
      .sort((a, b) => (b.desc || 0) - (a.desc || 0) || (a.birth || 9999) - (b.birth || 9999));
    for (const pn of people.slice(0, 15)) {
      const row = document.createElement("div"); row.className = "rel";
      const b = document.createElement("button"); b.className = "linklike";
      b.textContent = eff(pn).name;
      b.onclick = () => { if (pos.has(pn.id)) { selectNode(pn.id); centreOn(pn.id); } else openDetail(pn.id); };
      const meta = document.createElement("span"); meta.className = "conf";
      meta.textContent = [pn.birth ? pn.birth + (pn.death ? "–" + pn.death : "–") : "",
                          pn.students ? pn.students + " students" : ""].filter(Boolean).join(" · ");
      row.append(b, meta);
      panel.appendChild(row);
    }
  }

  const h4e = document.createElement("h4"); h4e.textContent = "Publish"; panel.appendChild(h4e);
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
  for (const [lbl, fmt] of [["⬇ SVG", "svg"], ["PDF", "pdf"], ["PNG", "png"],
                            ["CSV", "csv"], ["JSON", "json"]]) {
    const b = document.createElement("button"); b.className = "btn"; b.textContent = lbl;
    b.onclick = () => {
      const ids = styleMembers(sid);
      if (fmt === "csv" || fmt === "json") return exportSubset(ids, st.label, fmt);
      exportClade(ids, "The " + st.label + " clade", fmt, styleProvenance(sid));
    };
    wrap.appendChild(b);
  }
  panel.appendChild(wrap);
  const note = document.createElement("div"); note.className = "edit-note";
  note.textContent = "Charts and data for this style and every sub-style beneath it.";
  panel.appendChild(note);
}

function renderStylePanel() {
  stylePanel.innerHTML = ""; stylePanel.hidden = false;
  stylePanel.appendChild(panelCloseBtn(stylePanel));
  const h = document.createElement("h3"); h.textContent = "Style tree"; stylePanel.appendChild(h);
  const note = document.createElement("div"); note.className = "edit-note";
  note.textContent = "Originating group → style → sub-style → sub-sub-style. Click a name to "
    + "filter the canvas (its sub-styles come too), ⓘ for the style's own page, ⬇ for a poster.";
  stylePanel.appendChild(note);
  const find = document.createElement("input");
  find.className = "kata-search"; find.type = "search";
  find.placeholder = "Find a style… (name, founder or Japanese)";
  find.value = styleQuery;
  find.oninput = () => { styleQuery = find.value; renderStylePanel(); setTimeout(() => {
    const el = document.getElementById("stylepanel").querySelectorAll("input")[0];
    if (el) el.focus();
  }, 0); };
  stylePanel.appendChild(find);
  const counts = new Map();
  const count = id => {
    if (!counts.has(id)) counts.set(id, styleMembers(id).length);
    return counts.get(id);
  };
  const label = sid => { const s = styleByIdMap.get(sid); return s ? s.label : sid; };
  const q = styleQuery.trim().toLowerCase();
  const hit = sid => {
    if (!q) return true;
    const s = styleByIdMap.get(sid); if (!s) return false;
    return (s.label + " " + s.id + " " + (s.founder || "")).toLowerCase().includes(q);
  };
  // a style stays visible if it matches, or if anything beneath it matches
  const subtreeHit = sid => hit(sid) || [...styleWithDesc(sid)].some(k => hit(k));
  const addRow = (sid, depth) => {
    if (q && !subtreeHit(sid)) return;
    const c = count(sid);
    const row = document.createElement("div");
    row.className = "st-row" + (state.style === sid ? " on" : "") + (c ? "" : " st-empty");
    row.style.paddingLeft = (depth * 14) + "px";
    // every documented style is listed, practised or not; siblings alphabetical
    const kids = (styleKids.get(sid) || []).slice()
      .sort((a, b) => label(a).localeCompare(label(b)));
    const chev = document.createElement("button"); chev.className = "linklike st-chev";
    chev.textContent = kids.length ? (styleOpen.has(sid) ? "▾" : "▸") : "·";
    if (kids.length) chev.onclick = () => {
      styleOpen.has(sid) ? styleOpen.delete(sid) : styleOpen.add(sid);
      renderStylePanel();
    };
    const nameB = document.createElement("button"); nameB.className = "linklike st-name";
    nameB.textContent = label(sid);
    nameB.title = styleProvenance(sid)
      || (c ? "Filter the canvas to this style and its sub-styles"
            : "Documented style; no practitioners linked in the dataset yet");
    if (c) nameB.onclick = () => { setStyleFilter(state.style === sid ? "" : sid); renderStylePanel(); };
    const meta = document.createElement("span"); meta.className = "st-meta";
    meta.textContent = styleProvenance(sid);
    const cnt = document.createElement("span"); cnt.className = "st-count";
    cnt.textContent = c || "–";
    const info = document.createElement("button");
    info.className = "linklike st-i"; info.textContent = "ⓘ";
    info.title = "Style details: founder, date, kata, principal figures";
    info.onclick = () => openStyleDetail(sid);
    row.append(chev, nameB, meta, cnt, info);
    if (c > 1) {
      const dl = document.createElement("button"); dl.className = "linklike st-dl"; dl.textContent = "⬇";
      dl.title = "Export a publishable poster of this style and its sub-styles (vector SVG)";
      dl.onclick = () => exportClade(styleMembers(sid), "The " + label(sid) + " clade", "svg",
                                    styleProvenance(sid));
      row.appendChild(dl);
    }
    stylePanel.appendChild(row);
    if (styleOpen.has(sid) || (q && kids.some(subtreeHit))) for (const k of kids) addRow(k, depth + 1);
  };
  for (const [fid, flabel] of FAM_ORDER) {
    const tops = DATA.styles
      .filter(s => s.famRaw === fid && (!s.parent || !styleByIdMap.has(s.parent)))
      .map(s => s.id)
      .sort((a, b) => label(a).localeCompare(label(b)));
    if (!tops.length) continue;
    const fh = document.createElement("div"); fh.className = "st-fam";
    const dot = document.createElement("span"); dot.className = "dot";
    dot.style.background = famColour(fid);
    fh.append(dot, document.createTextNode(" " + flabel));
    stylePanel.appendChild(fh);
    for (const t of tops) addRow(t, 1);
  }
}

/* ============ detail panel ============ */
function closePanel(id) { document.getElementById(id).hidden = true; }
function panelCloseBtn(panel) {
  const b = document.createElement("button");
  b.className = "btn d-close"; b.textContent = "✕";
  b.onclick = () => { panel.hidden = true; };
  return b;
}
function openDetail(id) {
  const n = byId.get(id), f = eff(n), panel = document.getElementById("detail");
  panel.innerHTML = ""; panel.hidden = false;
  panel.appendChild(panelCloseBtn(panel));
  const h = document.createElement("h2"); h.textContent = f.name; panel.appendChild(h);
  if (f.native) { const d = document.createElement("div"); d.className = "native-big"; d.textContent = f.native; panel.appendChild(d); }
  if (f.romaji && f.romaji !== f.name) { const d = document.createElement("div"); d.className = "romaji"; d.textContent = f.romaji; panel.appendChild(d); }

  const dl = document.createElement("dl");
  const add = (k, v, html) => {
    if (v === null || v === undefined || v === "") return;
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd");
    if (html) dd.appendChild(v); else dd.textContent = v;
    dl.append(dt, dd);
  };
  add("Transliteration", n.ascii !== f.name ? n.ascii : null);
  if (n.alt && n.alt.length) add("Also recorded as", n.alt.join("; "));
  const editedDate = k => (edits[id] || {})[k] !== undefined ? " (edited)" : "";
  add("Born", f.birth ? f.birth + editedDate("birth_year")
                      : (n.eb ? "c. " + n.eb + " (estimated from lineage)" : null));
  add("Died", f.death ? f.death + editedDate("death_year") : null);
  if (n.trained) {
    const sp = document.createElement("span");
    sp.textContent = "c. " + n.trained + (n.trainedEst ? "*" : "");
    if (n.trainedEst) {
      const e = document.createElement("span"); e.className = "est";
      e.textContent = "  (* estimated: birth + 25)";
      sp.appendChild(e);
    }
    add("Trained from", sp, true);
  }
  add("Locality", n.locality);
  if (pos.has(id)) {
    const band = DATA.bands.find(b => b.gen === n.gen);
    if (band) add("Era column", band.caption.replace("b. ", "born c. ") + (band.epoch ? " · " + band.epoch : ""));
  }
  if (n.famInherited) {
    const fam = famById.get(n.family);
    add("Style family", (fam ? fam.label : n.family) + " (inferred from teacher)");
  }
  panel.appendChild(dl);

  if (n.styles.length) {
    const h4 = document.createElement("h4"); h4.textContent = "Styles"; panel.appendChild(h4);
    const wrap = document.createElement("div");
    for (const sid of n.styles) {
      const s = DATA.styles.find(x => x.id === sid);
      const chip = document.createElement("span"); chip.className = "chip";
      const dot = document.createElement("span"); dot.className = "dot";
      dot.style.background = styleColour(sid);
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(s ? s.label : sid));
      wrap.appendChild(chip);
    }
    panel.appendChild(wrap);
  }

  // kata this person originated, brought, modified, renamed or transmitted
  const mine = kataFor(eff(n).name);
  if (mine.length) {
    const h4k = document.createElement("h4");
    h4k.textContent = "Kata (" + mine.length + ")";
    panel.appendChild(h4k);
    const ROLE_ORDER = { created: 0, originated: 0, brought: 1, modified: 2,
                         standardised: 3, renamed: 4, transmitted: 5 };
    mine.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
                     || a.kata.name.localeCompare(b.kata.name));
    for (const { kata, role } of mine) {
      const row = document.createElement("div"); row.className = "rel";
      const b = document.createElement("button"); b.className = "linklike";
      b.textContent = kata.name + (kata.native ? "  " + kata.native : "");
      b.onclick = () => { kataQuery = kata.name; kataOpen = new Set([kata.name]); renderKataPanel(); };
      const r = document.createElement("span"); r.className = "conf";
      r.textContent = role + (kata.era ? " · " + kata.era : "")
        + (kata.disputed ? " · disputed" : "");
      if (kata.disputed) r.classList.add("disputed");
      row.append(b, r);
      panel.appendChild(row);
    }
  }

  const rels = [["Teachers", parentsOf.get(id) || [], e => e.source],
                ["Students", childrenOf.get(id) || [], e => e.target]];
  for (const [title, es, pick] of rels) {
    const pending = edgeAdds.filter(a => (title === "Teachers" ? a.target : a.source) === id);
    const h4 = document.createElement("h4"); h4.textContent = title + ` (${es.length})`; panel.appendChild(h4);
    const chrono = (a, b) => {   // chronological cohorts: earliest-born first, unknown last
      const ba = byId.get(pick(a)).birth || 9999, bb = byId.get(pick(b)).birth || 9999;
      return ba - bb || CONF_ORD[b.confidence] - CONF_ORD[a.confidence];
    };
    for (const e of es.slice().sort(chrono)) {
      const other = byId.get(pick(e));
      const key = e.source + ">" + e.target;
      const row = document.createElement("div"); row.className = "rel";
      const btn = document.createElement("button");
      btn.textContent = eff(other).name;
      btn.onclick = () => {
        if (pos.has(other.id) && !state.isolated) { selectNode(other.id); centreOn(other.id); }
        else openDetail(other.id);
      };
      const conf = document.createElement("span"); conf.className = "conf";
      const of2 = eff(other);
      const yrs = of2.birth ? ` (${of2.birth}–${of2.death || ""})` : "";
      conf.textContent = yrs + "  · " + e.confidence;
      const flag = document.createElement("button"); flag.className = "linklike relflag";
      const paint = () => {
        row.classList.toggle("flagged", !!edgeFlags[key]);
        flag.textContent = edgeFlags[key] ? "restore" : "✕";
        flag.title = edgeFlags[key] ? "Un-flag this link" : "Flag this link as wrong (exported for correction)";
      };
      flag.onclick = () => {
        if (edgeFlags[key]) delete edgeFlags[key];
        else {
          const note = prompt("Why is this link wrong? (optional note for the record)");
          if (note === null) return;
          edgeFlags[key] = { note: note || "" };
        }
        saveCorrections(); paint(); applyFilters();
      };
      paint();
      row.append(btn, conf, flag);
      panel.appendChild(row);
    }
    for (const a of pending) {
      const row = document.createElement("div"); row.className = "rel pending";
      const sp = document.createElement("span");
      sp.textContent = (title === "Teachers" ? a.source_name : a.target_name) + "  (proposed — appears after rebuild)";
      const rm = document.createElement("button"); rm.className = "linklike relflag"; rm.textContent = "remove";
      rm.onclick = () => { edgeAdds.splice(edgeAdds.indexOf(a), 1); saveCorrections(); openDetail(id); };
      row.append(sp, rm);
      panel.appendChild(row);
    }
    const addRow = document.createElement("div"); addRow.className = "rel-add";
    const inp = document.createElement("input");
    inp.placeholder = "add " + (title === "Teachers" ? "a teacher" : "a student") + "…";
    inp.setAttribute("list", "allnames");
    const ok = document.createElement("button"); ok.className = "btn"; ok.textContent = "＋";
    ok.onclick = () => {
      const nm = inp.value.trim(); if (!nm) return;
      const oid = idByName.get(nm.toLowerCase());
      if (!oid) { alert("“" + nm + "” is not in the dataset. Use the ＋ Add button in the header to add a new person first."); return; }
      const src = title === "Teachers" ? oid : id, tgt = title === "Teachers" ? id : oid;
      if (src === tgt || edgeAdds.some(x => x.source === src && x.target === tgt)) { inp.value = ""; return; }
      edgeAdds.push({ source: src, target: tgt,
                      source_name: eff(byId.get(src)).name, target_name: eff(byId.get(tgt)).name });
      saveCorrections(); openDetail(id);
    };
    addRow.append(inp, ok);
    panel.appendChild(addRow);
  }

  if (n.wiki && curator()) {
    const h4 = document.createElement("h4"); h4.textContent = "Source (curator)"; panel.appendChild(h4);
    const a = document.createElement("a"); a.href = n.wiki; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "Wikipedia article ↗"; panel.appendChild(a);
  }
  if (n.hon && n.hon.length) {
    const d = document.createElement("div"); d.className = "d-flag";
    // "Hanshi 10th dan — Okinawa Karate News register (2018)": the rank is public,
    // the register that attests it is a source
    d.textContent = n.hon.map(h => curator() ? h : h.replace(/\s+—\s+.*$/, "")).join(" · ");
    panel.appendChild(d);
  }
  const fl = n.flags || {};
  if (fl.legendary || fl.needs_review || fl.wrong_entity) {
    const d = document.createElement("div"); d.className = "d-flag";
    d.textContent = [fl.legendary ? "semi-legendary figure" : "",
                     fl.needs_review ? "needs review" : "",
                     fl.wrong_entity ? (curator() ? "possible wrong Wikidata match" : "identity uncertain") : ""].filter(Boolean).join(" · ");
    panel.appendChild(d);
  }

  /* --- expert editing: names and dates --- */
  const h4 = document.createElement("h4"); h4.textContent = "Edit this record"; panel.appendChild(h4);
  const grid = document.createElement("div"); grid.className = "edit-grid";
  const mk = (label, key, val, placeholder) => {
    const w = document.createElement("div");
    const l = document.createElement("label"); l.textContent = label;
    const i = document.createElement("input");
    i.value = val === null || val === undefined ? "" : String(val);
    i.placeholder = placeholder || "";
    i.dataset.key = key;
    w.append(l, i); grid.appendChild(w);
    return i;
  };
  const cur = edits[id] || {};
  const iD = mk("Display name (anglicised)", "display_name", cur.display_name || n.name);
  const iR = mk("Romanisation (macrons)", "name_romaji", cur.name_romaji || n.romaji, "e.g. Motobu Chōki");
  const iN = mk("Original script", "name_native", cur.name_native || n.native, "e.g. 本部朝基");
  const iB = mk("Born (year)", "birth_year",
                cur.birth_year !== undefined ? cur.birth_year : n.birth, "e.g. 1885 — blank if unknown");
  const iDd = mk("Died (year)", "death_year",
                 cur.death_year !== undefined ? cur.death_year : n.death, "");
  panel.appendChild(grid);
  const save = document.createElement("button");
  save.className = "btn"; save.style.marginTop = "8px"; save.textContent = "Save edit";
  save.onclick = () => {
    const e = {};
    if (iD.value.trim() && iD.value.trim() !== n.name) e.display_name = iD.value.trim();
    if (iR.value.trim() && iR.value.trim() !== (n.romaji || "")) e.name_romaji = iR.value.trim();
    if (iN.value.trim() && iN.value.trim() !== (n.native || "")) e.name_native = iN.value.trim();
    for (const [inp, key, orig] of [[iB, "birth_year", n.birth], [iDd, "death_year", n.death]]) {
      const v = inp.value.trim();
      if (v && !/^\d{3,4}$/.test(v)) { alert("Years must be plain numbers, e.g. 1885."); return; }
      const num = v ? parseInt(v, 10) : null;
      if (num !== (orig || null)) e[key] = num;
    }
    if (Object.keys(e).length) edits[id] = e; else delete edits[id];
    saveCorrections();
    refreshLabel(id); openDetail(id);
    if (state.focus === id) document.getElementById("focusname").textContent = eff(n).name;
  };
  panel.appendChild(save);
  if (edits[id]) {
    const undo = document.createElement("button");
    undo.className = "btn"; undo.style.margin = "8px 0 0 6px"; undo.textContent = "Revert";
    undo.onclick = () => { delete edits[id]; saveCorrections(); refreshLabel(id); openDetail(id); };
    panel.appendChild(undo);
  }
  const rmBtn = document.createElement("button");
  rmBtn.className = "btn"; rmBtn.style.margin = "8px 0 0 6px";
  rmBtn.textContent = removals[id] ? "Un-flag removal" : "Flag person for removal";
  rmBtn.onclick = () => {
    if (removals[id]) delete removals[id];
    else {
      const note = prompt("Why should this person be removed from the dataset? (optional note)");
      if (note === null) return;
      removals[id] = { note: note || "" };
    }
    saveCorrections(); applyFilters(); openDetail(id);
  };
  panel.appendChild(rmBtn);
  if (removals[id]) {
    const w = document.createElement("div"); w.className = "edit-note";
    w.textContent = "⚑ Flagged for removal — exported as a node_verdicts.csv row.";
    panel.appendChild(w);
  }
  if (pos.has(id) && n.connected) {
    const h4p = document.createElement("h4"); h4p.textContent = "Publish"; panel.appendChild(h4p);

    // How many teaching generations to include. A whole clade is usually far too
    // big to read on a page; one or two generations is the figure people want.
    const maxD = lineageDepth(id, state.dir);
    const gsel = document.createElement("div"); gsel.className = "gen-pick";
    const gLab = document.createElement("label"); gLab.textContent = "Generations";
    gsel.appendChild(gLab);
    const opts = [];
    for (let k = 1; k <= Math.min(maxD, 5); k++) opts.push([String(k), k]);
    if (maxD > 5) opts.push(["n…", "n"]);
    opts.push(["all", Infinity]);
    let chosen = Math.min(2, maxD);                  // a readable default
    const counts = document.createElement("span"); counts.className = "gen-count";
    const btns = [];
    const paint = () => {
      btns.forEach(b => b.classList.toggle("on", b._v === chosen));
      const nn = lineageSet(id, state.dir, chosen).size;
      counts.textContent = nn + (nn === 1 ? " person" : " people")
        + (chosen === Infinity ? " (whole lineage)" : "");
    };
    for (const [lbl, v] of opts) {
      const b = document.createElement("button");
      b.className = "linklike gen-b"; b.textContent = lbl; b._v = v;
      b.onclick = () => {
        if (v === "n") {
          const t = prompt("How many teaching generations? (1–" + maxD + ")", String(maxD));
          if (t === null) return;
          const k = Math.max(1, Math.min(maxD, parseInt(t, 10) || 1));
          chosen = k; b.textContent = "n=" + k; b._v = k;
        } else chosen = v;
        paint();
      };
      btns.push(b); gsel.appendChild(b);
    }
    gsel.appendChild(counts);
    panel.appendChild(gsel);
    paint();

    const wrap = document.createElement("div"); wrap.style.display = "flex";
    wrap.style.gap = "6px"; wrap.style.flexWrap = "wrap"; wrap.style.marginTop = "6px";
    for (const [lbl, fmt] of [["⬇ SVG", "svg"], ["PDF", "pdf"], ["PNG", "png"],
                              ["JPG", "jpg"], ["TIFF", "tiff"], ["CSV", "csv"], ["JSON", "json"]]) {
      const b = document.createElement("button"); b.className = "btn"; b.textContent = lbl;
      b.onclick = () => {
        const ids = [...lineageSet(id, state.dir, chosen)];
        const gtag = chosen === Infinity ? "" : " · " + chosen + " generation"
                     + (chosen === 1 ? "" : "s");
        if (fmt === "csv" || fmt === "json") return exportSubset(ids, eff(n).name, fmt);
        exportClade(ids, "The lineage of " + eff(n).name, fmt, gtag.replace(/^ · /, ""));
      };
      wrap.appendChild(b);
    }
    panel.appendChild(wrap);
    const pn = document.createElement("div"); pn.className = "edit-note";
    pn.textContent = "The chart is re-laid out compactly for print, so it carries no empty space "
      + "from the main map. SVG and PDF are the publication formats; CSV and JSON give you the "
      + "underlying data for your own analysis. Teachers, students or both is set by the "
      + "direction selector in the focus chip.";
    panel.appendChild(pn);
  }
  const note = document.createElement("div"); note.className = "edit-note";
  note.textContent = "Corrections live in this browser and colour the label blue. Use ✕ beside a "
    + "teacher or student to flag a wrong link, and the add boxes to propose new ones. Export → "
    + "“Expert corrections” downloads ready-made CSVs for pipeline/overrides/.";
  panel.appendChild(note);
}
function updateEditBadge() {
  const c = Object.keys(edits).length + Object.keys(edgeFlags).length + edgeAdds.length
          + Object.keys(removals).length;
  const b = document.getElementById("editcount");
  b.hidden = !c; b.textContent = c;
}
document.getElementById("editmode").onclick = () => {
  if (state.focus) openDetail(state.focus);
  else alert("Click a person first, then edit their record in the panel.\n"
    + Object.keys(edits).length + " edit(s) currently stored.");
};

/* ============ edge detail: every teacher→student line is clickable ============ */
function evidenceLink(tok, e) {
  tok = String(tok).trim();
  if (tok.startsWith("research:")) {
    const url = tok.slice(9).trim();
    let label = url;
    try { const u = new URL(url); label = decodeURIComponent(u.hostname + u.pathname); } catch (_) {}
    return { url, label: label.length > 72 ? label.slice(0, 70) + "…" : label };
  }
  if (tok.startsWith("wikidata:")) {
    const q = /^Q\d+$/.test(e.source) ? e.source : (/^Q\d+$/.test(e.target) ? e.target : null);
    return { url: q ? "https://www.wikidata.org/wiki/" + q : null,
             label: "Wikidata claim (" + tok.slice(9) + ")" };
  }
  return { url: null, label: tok };
}
function openEdgeDetail(e) {
  const s = byId.get(e.source), t = byId.get(e.target);
  const panel = document.getElementById("detail");
  panel.innerHTML = ""; panel.hidden = false;
  panel.appendChild(panelCloseBtn(panel));
  const h = document.createElement("h2");
  h.textContent = eff(s).name + " → " + eff(t).name;
  panel.appendChild(h);
  const sub = document.createElement("div"); sub.className = "romaji";
  sub.textContent = "teacher → student · " + e.confidence + " confidence"
    + (e.primary ? "" : " · secondary line");
  panel.appendChild(sub);

  const nav = document.createElement("div"); nav.style.margin = "10px 0";
  for (const [p, lbl] of [[s, "teacher"], [t, "student"]]) {
    const b = document.createElement("button"); b.className = "btn"; b.style.marginRight = "6px";
    b.textContent = "Open " + lbl;
    b.onclick = () => { if (pos.has(p.id) && !state.isolated) { selectNode(p.id); centreOn(p.id); } else openDetail(p.id); };
    nav.appendChild(b);
  }
  panel.appendChild(nav);

  if (curator()) {
    const h4 = document.createElement("h4"); h4.textContent = "Evidence (curator)"; panel.appendChild(h4);
    const evs = e.evidence || [];
    if (!evs.length) {
      const d = document.createElement("div"); d.className = "edit-note";
      d.textContent = "No source recorded for this link.";
      panel.appendChild(d);
    }
    for (const tok of evs) {
      const { url, label } = evidenceLink(tok, e);
      const row = document.createElement("div"); row.className = "evrow";
      if (url) {
        const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener";
        a.textContent = label + " ↗"; row.appendChild(a);
      } else row.textContent = label;
      panel.appendChild(row);
    }
    for (const [p, lbl] of [[s, "teacher"], [t, "student"]]) {
      if (!p.wiki) continue;
      const row = document.createElement("div"); row.className = "evrow";
      const a = document.createElement("a"); a.href = p.wiki; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Wikipedia: " + eff(p).name + " (" + lbl + ") ↗"; row.appendChild(a);
      panel.appendChild(row);
    }
  }

  const key = e.source + ">" + e.target;
  const flag = document.createElement("button");
  flag.className = "btn"; flag.style.marginTop = "12px";
  const paint = () => { flag.textContent = edgeFlags[key] ? "Restore this link" : "✕ Flag this link as wrong"; };
  flag.onclick = () => {
    if (edgeFlags[key]) delete edgeFlags[key];
    else {
      const note = prompt("Why is this link wrong? (optional note for the record)");
      if (note === null) return;
      edgeFlags[key] = { note: note || "" };
    }
    saveCorrections(); paint(); applyFilters();
  };
  paint();
  panel.appendChild(flag);
  const note = document.createElement("div"); note.className = "edit-note";
  note.textContent = "Flagged links turn red on the canvas and export as an edge_fixes.csv row "
    + "(Export → “Expert corrections”).";
  panel.appendChild(note);
}

/* ============ orphans & table ============ */
const orphanBtn = document.getElementById("orphanbtn");
orphanBtn.textContent = orphans.length + " people not yet linked";
orphanBtn.onclick = () => {
  const p = document.getElementById("orphanpanel");
  if (!p.hidden) { p.hidden = true; return; }
  renderListPanel(p, orphans, "Not yet linked to the tree (no teacher or student edges in the data)");
};
function renderListPanel(p, people, blurb) {
  p.innerHTML = ""; p.hidden = false;
  p.appendChild(panelCloseBtn(p));
  const h = document.createElement("h2"); h.style.fontSize = "15px"; h.textContent = blurb;
  p.appendChild(h);
  const inp = document.createElement("input"); inp.placeholder = "Filter…"; p.appendChild(inp);
  const list = document.createElement("div"); p.appendChild(list);
  const draw = q => {
    list.innerHTML = "";
    for (const n of people) {
      const f = eff(n);
      if (q && !(f.name + " " + (f.native || "")).toLowerCase().includes(q)) continue;
      const row = document.createElement("div"); row.className = "orow";
      row.textContent = f.name + (f.native ? " · " + f.native : "");
      const sub = document.createElement("div"); sub.className = "osub";
      sub.textContent = labelText(n).l2;
      row.appendChild(sub);
      row.onclick = () => openDetail(n.id);
      list.appendChild(row);
    }
  };
  inp.oninput = () => draw(inp.value.trim().toLowerCase());
  draw("");
}
document.getElementById("listview").onclick = () => {
  const p = document.getElementById("tablepanel");
  if (!p.hidden) { p.hidden = true; return; }
  p.innerHTML = ""; p.hidden = false;
  p.appendChild(panelCloseBtn(p));
  const h = document.createElement("h2"); h.style.fontSize = "15px";
  h.textContent = "Visible people"; p.appendChild(h);
  const rows = visiblePeople();
  const tbl = document.createElement("table");
  const cols = [["Name", n => eff(n).name], ["Born", n => n.birth || ""], ["Died", n => n.death || ""],
                ["Trained*", n => n.trained ? "c." + n.trained + (n.trainedEst ? "*" : "") : ""],
                ["Style", n => n.styleLabel], ["Students", n => n.students], ["Lineage", n => n.desc]];
  const thead = document.createElement("thead"); const trh = document.createElement("tr");
  let sortI = 6, sortAsc = false;
  const draw = () => {
    tb.innerHTML = "";
    const sorted = rows.slice().sort((a, b) => {
      const va = cols[sortI][1](a), vb = cols[sortI][1](b);
      const c = (typeof va === "number" && typeof vb === "number") ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? c : -c;
    });
    for (const n of sorted) {
      const tr = document.createElement("tr");
      for (const [, get] of cols) {
        const td = document.createElement("td"); td.textContent = get(n); tr.appendChild(td);
      }
      tr.style.cursor = "pointer";
      tr.onclick = () => {
      p.hidden = true;                       // the panels share one slot
      if (pos.has(n.id)) { selectNode(n.id); centreOn(n.id); } else openDetail(n.id);
    };
      tb.appendChild(tr);
    }
  };
  cols.forEach(([label], i) => {
    const th = document.createElement("th"); th.textContent = label;
    th.onclick = () => { if (sortI === i) sortAsc = !sortAsc; else { sortI = i; sortAsc = i === 0; } draw(); };
    trh.appendChild(th);
  });
  thead.appendChild(trh); tbl.appendChild(thead);
  const tb = document.createElement("tbody"); tbl.appendChild(tb);
  p.appendChild(tbl); draw();
};
function visiblePeople() {
  return placed.filter(n => {
    const g = nodeEls.get(n.id);
    return !g.classList.contains("hidden") && !g.classList.contains("dim")
        && !g.classList.contains("ghost");
  });
}

/* ============ export ============ */
const expBtn = document.getElementById("exportbtn"), expMenu = document.getElementById("exportmenu");
expBtn.onclick = ev => { ev.stopPropagation(); expMenu.hidden = !expMenu.hidden; };
document.addEventListener("click", () => { expMenu.hidden = true; });
function hideMenus() { expMenu.hidden = true; sBox.hidden = true; }
expMenu.addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b) return;
  ({ png2: () => exportPNG(2), png4: () => exportPNG(4), svg: exportSVG,
     jpg4: () => exportJPG(4), tiff: () => exportTIFF(), pdf: () => exportPDF(),
     csv: exportCSV, json: exportJSON, edits: exportEdits, adds: exportAdds })[b.dataset.x]();
});
function download(name, blob) {
  if (!blob) { toast("The file could not be generated. Try the SVG format."); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
let toastT = 0;
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div"); t.id = "toast";
    document.getElementById("stage").appendChild(t);
  }
  t.textContent = msg;
  hintDone = true;                            // the toast replaces the first-run hint
  const hintEl = document.getElementById("hint");
  if (hintEl) hintEl.hidden = true;
  stage.classList.toggle("touring", typeof tourIdx !== "undefined" && tourIdx !== null);
  t.hidden = false; t.classList.remove("fade");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add("fade"), 5200);
}
function cssVar(name) { return getComputedStyle(document.getElementById("app")).getPropertyValue(name).trim(); }

function buildExportSVG(opts) {
  opts = opts || {};
  const ids = opts.ids || (state.isolated ? new Set(state.isolated) : null);
  const b = graphBBox(ids);
  const PAD = 70, TITLE_H = 96;
  const W = (b.x1 - b.x0) + PAD * 2, H = (b.y1 - b.y0) + PAD * 2 + TITLE_H + 46;
  const out = el("svg", { xmlns: SVGNS, viewBox: `0 0 ${W} ${H}`, width: W, height: H,
                          "font-family": 'system-ui, -apple-system, "Segoe UI", sans-serif' });
  el("rect", { x: 0, y: 0, width: W, height: H, fill: cssVar("--surface") }, out);
  const title = el("text", { x: PAD, y: 46, "font-size": 26, "font-weight": 700,
                             fill: cssVar("--ink") }, out);
  title.textContent = opts.title || "The Lineage of Karate & Taekwondo";
  const sub = el("text", { x: PAD, y: 68, "font-size": 13, fill: cssVar("--ink-2") }, out);
  sub.textContent = opts.subtitle
    || ("Instructor-to-student cladogram"
        + (state.focus && !opts.title ? " · focussed on " + eff(byId.get(state.focus)).name : ""));
  const clone = world.cloneNode(true);
  clone.setAttribute("transform", `translate(${PAD - b.x0},${TITLE_H + PAD - b.y0})`);
  inlineStyles(world, clone);
  // strip hidden elements and hit paths
  clone.querySelectorAll(".hidden").forEach(x => x.remove());
  clone.querySelectorAll('[style*="pointer-events:stroke"]').forEach(x => x.remove());
  haloUnderneath(clone);
  out.appendChild(clone);
  // legend
  let lx = PAD, ly = H - 30;
  const counts = {};
  for (const n of placed) if (!ids || ids.has(n.id)) counts[n.family] = 1;
  for (const f of DATA.families) {
    if (!counts[f.id] || state.familiesOff.has(f.id)) continue;
    el("circle", { cx: lx + 5, cy: ly - 4, r: 5, fill: themeDark() ? f.dark : f.light }, out);
    const t = el("text", { x: lx + 15, y: ly, "font-size": 11.5, fill: cssVar("--ink-2") }, out);
    t.textContent = f.label;
    lx += 15 + f.label.length * 6.4 + 22;
  }
  const foot = el("text", { x: W - PAD, y: H - 30, "font-size": 10.5, "text-anchor": "end",
                            fill: cssVar("--muted") }, out);
  foot.textContent = "* trained-from dates estimated (birth + 25)"
    + (curator() && DATA.meta.source_hash ? " · data " + DATA.meta.source_hash.slice(0, 8) : "")
    + " · " + new Date().toISOString().slice(0, 10);
  return { out, W, H };
}
// The names carry a halo so they stay readable where an edge passes beneath them.
// On screen that is `paint-order: stroke`, but Illustrator and macOS Preview ignore
// paint-order and would stroke straight over the glyphs. So for the exported file,
// draw the halo as its own copy underneath and leave the real text unstroked: that
// renders identically in every viewer.
function haloUnderneath(root) {
  for (const t of root.querySelectorAll("text")) {
    const stroke = t.getAttribute("stroke");
    if (!stroke || stroke === "none") continue;
    const halo = t.cloneNode(true);
    halo.setAttribute("fill", stroke);          // halo body matches the halo colour
    halo.removeAttribute("paint-order");
    for (const kid of halo.querySelectorAll("tspan")) kid.setAttribute("fill", stroke);
    t.parentNode.insertBefore(halo, t);
    t.setAttribute("stroke", "none");
    t.removeAttribute("paint-order");
  }
}
function inlineStyles(src, dst) {
  // Every property the stylesheet relies on must be carried across: the exported
  // file has no stylesheet and no classes, so anything omitted here silently
  // reverts to the SVG default (a missing stroke-opacity paints an edge solid;
  // a missing paint-order paints the label's halo OVER the glyphs).
  const PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray",
                 "stroke-opacity", "stroke-linejoin", "stroke-linecap", "paint-order",
                 "opacity", "font-size", "font-weight", "font-style", "font-family",
                 "letter-spacing", "text-anchor", "dominant-baseline", "display",
                 "visibility", "font-variant-numeric"];
  const walk = (a, b) => {
    if (a.nodeType === 1) {
      const cs = getComputedStyle(a);
      for (const p of PROPS) {
        const v = cs.getPropertyValue(p);
        if (v && v !== "normal") b.setAttribute(p, v);
      }
      b.removeAttribute("class");
      const ac = a.children, bc = b.children;
      for (let i = 0; i < ac.length; i++) walk(ac[i], bc[i]);
    }
  };
  walk(src, dst);
}
function exportSVG(opts) {
  const { out, W, H } = buildExportSVG(opts);
  const s = new XMLSerializer().serializeToString(out);
  download(((opts && opts.fname) || "karate-cladogram") + ".svg",
    new Blob([s], { type: "image/svg+xml" }));
  toast("Exported vector SVG, " + Math.round(W) + " × " + Math.round(H)
        + " px at 1:1 — scales to any print size. Opens in Illustrator, Inkscape or a browser.");
}
// Browsers cap a canvas at 16384px per side, and a canvas costs W*H*4 bytes of
// memory, so a big clade at 4x asks for a gigapixel image and the canvas fails
// silently. Fit the scale to what the browser can actually render, and when even
// 1:1 will not fit, export vector instead of quietly doing nothing.
const MAX_DIM = 16000, MAX_AREA = 40e6;
function fitScale(W, H, want) {
  return Math.min(want, MAX_DIM / W, MAX_DIM / H, Math.sqrt(MAX_AREA / (W * H)));
}
const pxStr = (w, h) => Math.round(w) + " × " + Math.round(h) + " px";
// Render the export SVG to a canvas at the largest scale the browser can hold
// (raster formats only; the vector SVG has no such limit).
function rasterise(opts, scale, maxArea, cb) {
  const { out, W, H } = buildExportSVG(opts);
  const fit = fitScale(W, H, Math.min(scale, Math.sqrt(maxArea / (W * H)) + 1));
  const s = Math.max(0.5, Math.min(scale, Math.floor(Math.min(fit, Math.sqrt(maxArea / (W * H))) * 2) / 2));
  const str = new XMLSerializer().serializeToString(out);
  const img = new Image();
  img.onerror = () => toast("The image could not be rendered. Use the SVG export instead.");
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = Math.round(W * s); c.height = Math.round(H * s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = cssVar("--surface") || "#ffffff";   // JPEG/TIFF have no transparency
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(s, s);
    ctx.drawImage(img, 0, 0);
    cb(c, s, W, H);
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
}
function exportPNG(scale, opts) {
  const { W, H } = buildExportSVG(opts);
  if (fitScale(W, H, scale) < 1) {
    toast("This chart is " + pxStr(W, H) + " — larger than any PNG a browser can make. "
          + "Exported as SVG instead: vector, so it prints at any size.");
    return exportSVG(opts);
  }
  rasterise(opts, scale, MAX_AREA, (c, s) => {
    c.toBlob(bl => {
      download(((opts && opts.fname) || "karate-cladogram") + `@${s}x.png`, bl);
      toast("Exported PNG " + pxStr(c.width, c.height) + " at " + s + "×"
        + (s < scale ? " (browser canvas cap; SVG has no limit)." : "."));
    }, "image/png");
  });
}
function exportJPG(scale, opts) {
  rasterise(opts, scale, MAX_AREA, (c, s) => {
    c.toBlob(bl => {
      download(((opts && opts.fname) || "karate-cladogram") + `@${s}x.jpg`, bl);
      toast("Exported high-resolution JPG, " + pxStr(c.width, c.height) + " at " + s + "×.");
    }, "image/jpeg", 0.92);
  });
}
// Uncompressed baseline TIFF (RGB, 300 dpi) written directly from canvas pixels —
// no library, so it works offline in the single-file app.
function tiffEncode(imgData, dpi) {
  const w = imgData.width, h = imgData.height, n = w * h;
  const strip = new Uint8Array(n * 3), d = imgData.data;
  for (let i = 0, j = 0; j < strip.length; i += 4, j += 3) {
    strip[j] = d[i]; strip[j + 1] = d[i + 1]; strip[j + 2] = d[i + 2];
  }
  const N_TAGS = 12, ifdOff = 8;
  const bitsOff = ifdOff + 2 + N_TAGS * 12 + 4, xresOff = bitsOff + 6, yresOff = xresOff + 8;
  const stripOff = yresOff + 8;
  const buf = new ArrayBuffer(stripOff + strip.length);
  const v = new DataView(buf);
  v.setUint16(0, 0x4949);                       // 'II' little-endian
  v.setUint16(2, 42, true); v.setUint32(4, ifdOff, true);
  let o = ifdOff;
  v.setUint16(o, N_TAGS, true); o += 2;
  const tag = (id, type, count, val) => {
    v.setUint16(o, id, true); v.setUint16(o + 2, type, true);
    v.setUint32(o + 4, count, true); v.setUint32(o + 8, val, true); o += 12;
  };
  tag(256, 4, 1, w); tag(257, 4, 1, h);         // width, height
  tag(258, 3, 3, bitsOff);                      // 8,8,8 bits per sample
  tag(259, 3, 1, 1); tag(262, 3, 1, 2);         // uncompressed, RGB
  tag(273, 4, 1, stripOff);                     // strip offset
  tag(277, 3, 1, 3); tag(278, 4, 1, h);         // samples/px, rows per strip
  tag(279, 4, 1, strip.length);                 // strip byte count
  tag(282, 5, 1, xresOff); tag(283, 5, 1, yresOff); tag(296, 3, 1, 2);   // 300 dpi
  v.setUint32(o, 0, true);                      // no next IFD
  v.setUint16(bitsOff, 8, true); v.setUint16(bitsOff + 2, 8, true); v.setUint16(bitsOff + 4, 8, true);
  v.setUint32(xresOff, dpi, true); v.setUint32(xresOff + 4, 1, true);
  v.setUint32(yresOff, dpi, true); v.setUint32(yresOff + 4, 1, true);
  new Uint8Array(buf).set(strip, stripOff);
  return new Blob([buf], { type: "image/tiff" });
}
function exportTIFF(opts) {
  rasterise(opts, 4, 28e6, (c, s) => {          // uncompressed: keep the buffer sane
    const ctx = c.getContext("2d");
    const bl = tiffEncode(ctx.getImageData(0, 0, c.width, c.height), 300);
    download(((opts && opts.fname) || "karate-cladogram") + ".tif", bl);
    toast("Exported TIFF, " + pxStr(c.width, c.height) + " at 300 dpi ("
          + Math.round(bl.size / 1048576) + " MB, uncompressed).");
  });
}
// Print PDF: the chart as a full-page 300 dpi image, sized in real print units.
function pdfFromJPEG(jpeg, wPx, hPx, dpi) {
  const wPt = wPx * 72 / dpi, hPt = hPx * 72 / dpi;
  const enc = s => new TextEncoder().encode(s);
  const parts = [], offsets = [];
  let pos = 0;
  const push = b => { parts.push(b); pos += b.length; };
  push(enc("%PDF-1.4\n"));
  const obj = (n, body, stream) => {
    offsets[n] = pos;
    push(enc(n + " 0 obj\n" + body + "\n"));
    if (stream) { push(enc("stream\n")); push(stream); push(enc("\nendstream\n")); }
    push(enc("endobj\n"));
  };
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + wPt.toFixed(2) + " " + hPt.toFixed(2)
       + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
  obj(4, "<< /Type /XObject /Subtype /Image /Width " + wPx + " /Height " + hPx
       + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "
       + jpeg.length + " >>", jpeg);
  const content = enc("q " + wPt.toFixed(2) + " 0 0 " + hPt.toFixed(2) + " 0 0 cm /Im0 Do Q");
  obj(5, "<< /Length " + content.length + " >>", content);
  const xrefPos = pos;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  push(enc(xref + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF"));
  return new Blob(parts, { type: "application/pdf" });
}
function exportPDF(opts) {
  rasterise(opts, 4, MAX_AREA, (c, s) => {
    c.toBlob(bl => {
      bl.arrayBuffer().then(ab => {
        const pdf = pdfFromJPEG(new Uint8Array(ab), c.width, c.height, 300);
        download(((opts && opts.fname) || "karate-cladogram") + ".pdf", pdf);
        toast("Exported print PDF: " + pxStr(c.width, c.height) + " at 300 dpi = "
              + (c.width / 300 * 2.54).toFixed(0) + " × " + (c.height / 300 * 2.54).toFixed(0)
              + " cm on the page. Drops straight into a PDF book.");
      });
    }, "image/jpeg", 0.92);
  });
}

/* ============ data exports for a chosen subset (a person's clade, a style) ====
   The client analyses this material in other tools, so every image export has a
   data twin: the same people and links as CSV (two files) or as JSON.          */
function exportSubset(idArr, label, fmt) {
  const ids = new Set(idArr.filter(i => byId.has(i)));
  if (!ids.size) { toast("Nothing to export."); return; }
  const people = [...ids].map(i => byId.get(i));
  const links = DATA.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  const cur = curator();
  const slug = slugify(label);
  const kataFor = nm => (DATA.kata || [])
    .filter(k => (k.introduced_by || []).some(p => p.name === nm) || k.origin_person === nm)
    .map(k => k.name).join("; ");
  if (fmt === "json") {
    const pubNode = ({ wiki, flags, ...r }) => r;
    const pubEdge = ({ evidence, ...r }) => r;
    download("lineage-" + slug + ".json", new Blob([JSON.stringify({
      subject: label, exported: new Date().toISOString().slice(0, 10),
      counts: { people: people.length, links: links.length },
      people: people.map(n => cur ? n : pubNode(n)),
      links: links.map(e => cur ? e : pubEdge(e)),
    }, null, 1)], { type: "application/json" }));
    toast("Exported " + people.length + " people and " + links.length + " links as JSON.");
    return;
  }
  // two CSVs, because a node table and an edge table is what network tools expect
  const nrows = [[...(cur ? ["id"] : []), "name", "native", "born", "died", "trained_from",
                  "style", "family", "locality", "generation", "students", "descendants",
                  "honours", "kata"]];
  for (const n of people) {
    const f = eff(n);
    nrows.push([...(cur ? [n.id] : []),
      f.name, f.native || "", n.birth || "", n.death || "", n.trained || "",
      n.styleLabel || "", n.family || "", n.locality || "",
      n.gen === undefined ? "" : n.gen, n.students || 0, n.desc || 0,
      (n.hon || []).join("; "), kataFor(f.name)]);
  }
  const erows = [["teacher", "student", "confidence", "primary",
                  ...(cur ? ["evidence"] : [])]];
  for (const e of links) {
    erows.push([eff(byId.get(e.source)).name, eff(byId.get(e.target)).name,
                e.confidence, e.primary ? "yes" : "",
                ...(cur ? [(e.evidence || []).join(" | ")] : [])]);
  }
  const csv = r => "\ufeff" + r.map(x => x.map(csvEsc).join(",")).join("\n");
  download("lineage-" + slug + "-people.csv", new Blob([csv(nrows)], { type: "text/csv" }));
  setTimeout(() => download("lineage-" + slug + "-links.csv",
    new Blob([csv(erows)], { type: "text/csv" })), 350);
  toast("Exported two CSVs: " + people.length + " people and " + links.length
      + " teacher-to-student links, ready for Gephi, Cytoscape, R or Excel.");
}

/* ============ clade posters: one click → publishable lineage chart ============ */
function slugify(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
// "Chōjirō Tani · founded 1948" — whatever the taxonomy records for a style
function styleProvenance(sid) {
  const s = styleByIdMap.get(sid);
  if (!s) return "";
  const bits = [];
  if (s.founder) bits.push(s.founder);
  if (s.founded) bits.push("founded " + s.founded);
  return bits.join(" · ");
}
function exportClade(idArr, title, format, credit) {
  const ids = idArr.filter(i => pos.has(i));
  if (ids.length < 2) { alert("Not enough placed people to draw this clade."); return; }
  const savedPos2 = new Map([...pos].map(([k, p]) => [k, { ...p }]));
  const savedIso = state.isolated, savedFocus = state.focus, savedStyle = state.styleSet;
  const layout = isolateLayout(ids, true);   // posters use the compact layout
  for (const [k, p] of layout) pos.set(k, p);
  state.isolated = ids;
  // a poster shows its whole clade at full strength: the on-screen selection would
  // otherwise ghost everyone off the selected person's lineage down to a whisper,
  // and a style filter would dim everyone outside it
  state.focus = null;
  state.styleSet = null;
  world.classList.add("poster");    // print styling: stronger lines, bolder names
  applyFilters();
  updateEdgePaths();
  layoutLabels();
  for (const i of ids) {           // a poster shows every name and every date
    const L = labelEls.get(i);
    if (L) { L.g.classList.remove("hidden"); L.t2.style.display = ""; }
  }
  try {
    const opts = { title, subtitle: (credit ? credit + " · " : "") + ids.length
                   + " people · instructor-to-student clade",
                   fname: "lineage-" + slugify(title) };
    ({ svg: () => exportSVG(opts), png: () => exportPNG(4, opts),
       jpg: () => exportJPG(4, opts), tiff: () => exportTIFF(opts),
       pdf: () => exportPDF(opts) }[format] || (() => exportSVG(opts)))();
  } finally {
    world.classList.remove("poster");
    state.isolated = savedIso;
    state.focus = savedFocus;
    state.styleSet = savedStyle;
    for (const [k, p] of savedPos2) pos.set(k, p);
    applyFilters(); updateEdgePaths(); layoutLabels(); scheduleSuppress();
  }
}
function csvEsc(v) {
  v = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function exportCSV() {
  // the source column and the raw record ids are curator-only, so header and row
  // are built together to keep them in step
  const cur = curator();
  const rows = [[...(cur ? ["id"] : []), "name", "native", "romaji", "born", "died",
                 "trained_from", "trained_estimated", "primary_style", "family", "locality",
                 "teachers", "students", ...(cur ? ["wikipedia"] : [])]];
  for (const n of visiblePeople()) {
    const f = eff(n);
    rows.push([...(cur ? [n.id] : []),
               f.name, f.native || "", f.romaji || "", n.birth || "", n.death || "",
               n.trained || "", n.trainedEst ? "yes" : "", n.styleLabel, n.family, n.locality || "",
               (parentsOf.get(n.id) || []).map(e => eff(byId.get(e.source)).name).join("; "),
               (childrenOf.get(n.id) || []).map(e => eff(byId.get(e.target)).name).join("; "),
               ...(cur ? [n.wiki || ""] : [])]);
  }
  download("karate-lineage-visible.csv",
    new Blob(["﻿" + rows.map(r => r.map(csvEsc).join(",")).join("\n")], { type: "text/csv" }));
}
function exportJSON() {
  const vis = new Set(visiblePeople().map(n => n.id));
  const cur = curator();
  // a handed-on file must not carry what the interface hides
  const pubNode = ({ wiki, flags, ...rest }) => rest;
  const pubEdge = ({ evidence, ...rest }) => rest;
  const sub = {
    meta: cur ? DATA.meta : { counts: DATA.meta.counts },
    nodes: DATA.nodes.filter(n => vis.has(n.id)).map(n => cur ? n : pubNode(n)),
    edges: DATA.edges.filter(e => vis.has(e.source) && vis.has(e.target))
                     .map(e => cur ? e : pubEdge(e)),
  };
  download("karate-lineage-subgraph.json", new Blob([JSON.stringify(sub, null, 1)], { type: "application/json" }));
}
function exportEdits() {
  const stamp = "expert edit in cladogram " + new Date().toISOString().slice(0, 10);
  const files = [];
  const csv = rows => new Blob(["﻿" + rows.map(r => r.map(csvEsc).join(",")).join("\n")], { type: "text/csv" });

  const nrows = [["node_id", "display_name", "name_romaji", "name_native", "note", "status"]];
  const yrows = [["node_id", "field", "old", "new", "reason", "status"]];
  for (const [id, e] of Object.entries(edits)) {
    if (e.display_name || e.name_romaji || e.name_native)
      nrows.push([id, e.display_name || "", e.name_romaji || "", e.name_native || "", stamp, "proposed"]);
    const n = byId.get(id) || {};
    for (const [key, orig] of [["birth_year", n.birth], ["death_year", n.death]]) {
      if (e[key] !== undefined)
        yrows.push([id, key, orig == null ? "" : orig, e[key] == null ? "" : e[key], stamp, "proposed"]);
    }
  }
  if (nrows.length > 1) files.push({ name: "name_fixes.csv", blob: csv(nrows) });
  if (yrows.length > 1) files.push({ name: "year_fixes.csv", blob: csv(yrows) });

  const frows = [["source", "target", "source_name", "target_name", "action", "repoint_to",
                  "reason", "status", "new_confidence"]];
  for (const [key, f] of Object.entries(edgeFlags)) {
    const [src, tgt] = key.split(">");
    const s = byId.get(src), t = byId.get(tgt);
    frows.push([src, tgt, s ? s.name : "", t ? t.name : "", "drop", "",
                stamp + (f.note ? ": " + f.note : ""), "proposed", ""]);
  }
  if (frows.length > 1) files.push({ name: "edge_fixes.csv", blob: csv(frows) });

  const erows = [["source", "target", "source_name", "target_name", "confidence",
                  "evidence", "reason", "status"]];
  for (const a of edgeAdds)
    erows.push([a.source, a.target, a.source_name, a.target_name, "medium", "", stamp, "proposed"]);
  if (erows.length > 1) files.push({ name: "edge_additions.csv", blob: csv(erows) });

  const vrows = [["node_id", "name", "verdict", "category", "reason", "status"]];
  for (const [id2, r] of Object.entries(removals)) {
    const p = byId.get(id2);
    vrows.push([id2, p ? p.name : "", "non_person", "expert_removal",
                stamp + (r.note ? ": " + r.note : ""), "proposed"]);
  }
  if (vrows.length > 1) files.push({ name: "node_verdicts.csv", blob: csv(vrows) });

  if (!files.length) { alert("No corrections stored yet. Click a person or a line to make some."); return; }
  files.forEach((f, i) => setTimeout(() => download(f.name, f.blob), i * 500));
}

/* ============ add a person (the tree grows as time goes on) ============ */
const ADDS_KEY = "karate-added-people";
let adds = [];
try { adds = JSON.parse(localStorage.getItem(ADDS_KEY) || "[]"); } catch (_) {}
function saveAdds() { localStorage.setItem(ADDS_KEY, JSON.stringify(adds)); updateAddBadge(); }
function updateAddBadge() {
  const b = document.getElementById("addcount");
  b.hidden = !adds.length; b.textContent = adds.length;
}
const idByName = new Map();
for (const n of DATA.nodes) {
  idByName.set(n.name.toLowerCase(), n.id);
  for (const a of (n.alt || [])) idByName.set(String(a).toLowerCase(), n.id);
}
(function () {   // autocomplete for teacher/student fields
  const dl = document.createElement("datalist"); dl.id = "allnames";
  for (const n of DATA.nodes) {
    const o = document.createElement("option"); o.value = n.name; dl.appendChild(o);
  }
  document.body.appendChild(dl);
})();
const addPanel = document.getElementById("addpanel");
document.getElementById("addperson").onclick = () => {
  if (!addPanel.hidden) { addPanel.hidden = true; return; }
  renderAddPanel();
};
function renderAddPanel() {
  addPanel.innerHTML = ""; addPanel.hidden = false;
  addPanel.appendChild(panelCloseBtn(addPanel));
  const h = document.createElement("h3"); h.textContent = "Add a person"; addPanel.appendChild(h);
  const grid = document.createElement("div"); grid.className = "edit-grid";
  const mk = (label, ph, listId) => {
    const w = document.createElement("div");
    const l = document.createElement("label"); l.textContent = label;
    const i = document.createElement("input"); i.placeholder = ph || "";
    if (listId) i.setAttribute("list", listId);
    w.append(l, i); grid.appendChild(w);
    return i;
  };
  const iName = mk("Name (anglicised) — required", "e.g. Tetsuji Nakamura");
  const iNat = mk("Original script", "e.g. 中村哲二");
  const iB = mk("Birth year", "e.g. 1962");
  const iD = mk("Death year", "");
  const iSt = mk("Style(s), comma-separated", "e.g. goju-ryu");
  const iT = mk("Teacher(s), comma-separated", "names as shown in the tree", "allnames");
  const iS = mk("Student(s), comma-separated", "", "allnames");
  const iU = mk("Source URL", "an official / reliable page");
  const iNo = mk("Note", "who this is and why they belong");
  addPanel.appendChild(grid);
  const save = document.createElement("button");
  save.className = "btn"; save.style.marginTop = "8px"; save.textContent = "Save person";
  save.onclick = () => {
    const name = iName.value.trim();
    if (!name) { alert("A name is required."); return; }
    const split = v => v.split(",").map(s => s.trim()).filter(Boolean);
    const teachers = split(iT.value), students = split(iS.value);
    const unknown = [...teachers, ...students].filter(x => !idByName.has(x.toLowerCase()));
    if (unknown.length && !confirm("Not found in the tree: " + unknown.join(", ")
        + "\nSave anyway? (These names will need resolving when the data is rebuilt.)")) return;
    adds.push({ name, native: iNat.value.trim(), birth: iB.value.trim(), death: iD.value.trim(),
                styles: iSt.value.trim(), teachers, students,
                source: iU.value.trim(), note: iNo.value.trim() });
    saveAdds(); renderAddPanel();
  };
  addPanel.appendChild(save);
  if (adds.length) {
    const h4 = document.createElement("h4"); h4.textContent = "Stored locally (" + adds.length + ")";
    addPanel.appendChild(h4);
    for (const [i, a] of adds.entries()) {
      const row = document.createElement("div"); row.className = "add-row";
      const s = document.createElement("span");
      s.textContent = a.name + (a.birth ? " (b." + a.birth + ")" : "")
        + (a.teachers.length ? " ← " + a.teachers.join(", ") : "");
      const del = document.createElement("button"); del.className = "linklike"; del.textContent = "remove";
      del.onclick = () => { adds.splice(i, 1); saveAdds(); renderAddPanel(); };
      row.append(s, del); addPanel.appendChild(row);
    }
  }
  const note = document.createElement("div"); note.className = "edit-note";
  note.textContent = "Additions live in this browser and appear in the tree after the next data "
    + "rebuild. Export → “Added people” downloads node_additions.csv and edge_additions.csv "
    + "rows for pipeline/overrides/.";
  addPanel.appendChild(note);
}
function exportAdds() {
  if (!adds.length) { alert("No added people stored yet. Use the ＋ Add button first."); return; }
  const nrows = [["node_id", "name", "name_native", "birth_year", "death_year", "styles",
                  "locality", "wikipedia_url", "reason", "status"]];
  const erows = [["source", "target", "source_name", "target_name", "confidence",
                  "evidence", "reason", "status"]];
  const stamp = "added in cladogram " + new Date().toISOString().slice(0, 10);
  adds.forEach((a, i) => {
    const uid = "U" + String(i + 1).padStart(4, "0");
    nrows.push([uid, a.name, a.native || "", a.birth || "", a.death || "", a.styles || "",
                "", a.source || "", stamp + (a.note ? ": " + a.note : ""), "proposed"]);
    const conf = a.source ? "medium" : "low";
    const ev = a.source ? "research:" + a.source : "";
    for (const t of a.teachers) {
      erows.push([idByName.get(t.toLowerCase()) || "", uid, t, a.name, conf, ev, stamp, "proposed"]);
    }
    for (const s of a.students) {
      erows.push([uid, idByName.get(s.toLowerCase()) || "", a.name, s, conf, ev, stamp, "proposed"]);
    }
  });
  download("node_additions.csv",
    new Blob(["﻿" + nrows.map(r => r.map(csvEsc).join(",")).join("\n")], { type: "text/csv" }));
  setTimeout(() => download("edge_additions.csv",
    new Blob(["﻿" + erows.map(r => r.map(csvEsc).join(",")).join("\n")], { type: "text/csv" })), 500);
}

/* ============ generation ruler (screen space) ============ */
const ruler = document.getElementById("genruler");
function updateRuler() {
  if (state.isolated) { ruler.innerHTML = ""; return; }
  const r = stage.getBoundingClientRect();
  ruler.innerHTML = "";
  for (const b of DATA.bands) {
    if (!b.caption) continue;
    const x0 = b.x0 * view.k + view.x, x1 = b.x1 * view.k + view.x;
    if (x1 < 0 || x0 > r.width) continue;
    const s = document.createElement("span");
    s.style.left = Math.max(x0, 0) + "px";
    const w = x1 - Math.max(x0, 0);
    if (w > 240) s.innerHTML = "<b>" + b.caption + "</b>" +
      (b.epoch ? " · <i>" + b.epoch + "</i>" : "");
    else if (w > 110) s.innerHTML = "<b>" + b.caption + "</b>";
    else if (w > 40) s.innerHTML = "<b>" + b.caption.replace("born ", "").slice(0, 4) + "</b>";
    else continue;
    ruler.appendChild(s);
  }
}

/* ============ minimap ============ */
const mini = document.getElementById("minimap");
const miniSvg = document.getElementById("minisvg");
let miniScale = 1, miniB = null, miniVP = null;
function buildMinimap() {
  const b = graphBBox(null);
  miniB = b;
  const W = 158, H = Math.min(150, W * (b.y1 - b.y0) / (b.x1 - b.x0));
  miniScale = Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0));
  miniSvg.setAttribute("width", (b.x1 - b.x0) * miniScale);
  miniSvg.setAttribute("height", (b.y1 - b.y0) * miniScale);
  miniSvg.textContent = "";
  for (const n of placed) {
    const p = pos.get(n.id);
    el("circle", { cx: (p.x - b.x0) * miniScale, cy: (p.y - b.y0) * miniScale,
                   r: Math.max(0.7, R(n) * miniScale * 2.4), fill: nodeFill(n) }, miniSvg);
  }
  miniVP = el("rect", { class: "vp" }, miniSvg);
}
function updateMiniViewport() {
  if (!miniVP || !miniB) return;
  const r = stage.getBoundingClientRect();
  const x0 = (-view.x / view.k - miniB.x0) * miniScale;
  const y0 = (-view.y / view.k - miniB.y0) * miniScale;
  miniVP.setAttribute("x", x0);
  miniVP.setAttribute("y", y0);
  miniVP.setAttribute("width", r.width / view.k * miniScale);
  miniVP.setAttribute("height", r.height / view.k * miniScale);
}
mini.addEventListener("pointerdown", ev => {
  const mr = miniSvg.getBoundingClientRect();
  const wx = (ev.clientX - mr.left) / miniScale + miniB.x0;
  const wy = (ev.clientY - mr.top) / miniScale + miniB.y0;
  const r = stage.getBoundingClientRect();
  animateView(r.width / 2 - wx * view.k, r.height / 2 - wy * view.k, view.k, 420);
});

/* ============ first-run hint ============ */
const hint = document.getElementById("hint");
let hintDone = false;
function userMoved() {
  if (!hintDone) { hintDone = true; hint.classList.add("fade"); setTimeout(() => { hint.hidden = true; }, 700); }
}

/* ============ story tour ============ */
const TOUR = [
  { name: "Chatan Yara", blurb: "The story begins in the Ryukyu Kingdom. Chatan Yara, said to have studied Chinese boxing in Fuzhou, is among the earliest named masters of the Okinawan fighting art then called ti." },
  { name: "Peichin Takahara", blurb: "Takahara, a Shuri official, taught the art the Okinawans came to call tode, 'China hand'. His student Sakugawa would carry it forward." },
  { name: "Kanga Sakukawa", blurb: "'Tode' Sakugawa blended Chinese quanfa with native ti and began the teaching line that runs through most of modern karate." },
  { name: "Sokon Matsumura", blurb: "Bodyguard to three Ryukyuan kings, Matsumura systematised Shuri-te. Nearly every Shorin lineage on this chart descends through him." },
  { name: "Kosaku Matsumora", blurb: "In the port village of Tomari, Matsumora kept the smallest of the three old streams alive, Tomari-te." },
  { name: "Kanryo Higaonna", blurb: "Higaonna returned from years in Fuzhou to found Naha-te, the deeply Chinese-flavoured stream of the port capital." },
  { name: "Anko Itosu", blurb: "The great moderniser. Itosu simplified the kata, created the Pinan series, and took karate into Okinawan schools. An entire generation of founders sat at his feet." },
  { name: "Gichin Funakoshi", blurb: "Itosu's student Funakoshi introduced karate to mainland Japan in 1922. His Shotokan became the most widespread style on earth, and his Korean students carried the art home with them." },
  { name: "Chojun Miyagi", blurb: "Higaonna's successor Miyagi named his art Goju-Ryu, 'the hard-soft school', anchoring the Naha-te stream." },
  { name: "Kenwa Mabuni", blurb: "Mabuni studied under both Itosu and Higaonna and fused the Shuri and Naha streams into Shito-Ryu." },
  { name: "Kanbun Uechi", blurb: "Uechi spent thirteen years in Fujian learning pangai-noon boxing; the family art he brought back became Uechi-Ryu." },
  { name: "Mas Oyama", blurb: "The Korean-born Oyama forged full-contact karate. His Kyokushin, 'the ultimate truth', spawned a whole family of knockdown styles." },
  { name: "Won Kuk Lee", blurb: "Funakoshi's Korean student Won Kuk Lee founded the Chung Do Kwan in Seoul. From the kwans came tang soo do and, in 1955, taekwondo." },
  { name: null, blurb: "Three centuries, one web of teachers and students. Click any name to explore, filter with the style dropdown, or isolate a single lineage." },
];
let tourIdx = null;
const tourCard = document.getElementById("tourcard");
function tourStopId(stop) {
  if (!stop.name) return null;
  const q = stop.name.toLowerCase();
  const n = placed.find(x => x.name.toLowerCase() === q || x.ascii.toLowerCase() === q);
  return n ? n.id : null;
}
let tourMarked = [];
function markTour(id) {
  tourMarked.forEach(elm => elm.classList.remove("focus"));
  tourMarked = [];
  if (!id) return;
  const g = nodeEls.get(id), L = labelEls.get(id);
  if (g) { g.classList.add("focus"); tourMarked.push(g); }
  if (L) { L.g.classList.remove("hidden"); L.g.classList.add("focus"); tourMarked.push(L.g); }
}
function goTour(i) {
  const stops = TOUR.filter(s => !s.name || tourStopId(s));
  if (i < 0 || i >= stops.length) { endTour(); return; }
  tourIdx = i;
  userMoved();
  const stop = stops[i];
  const id = tourStopId(stop);
  tourCard.hidden = false;
  const prog = document.getElementById("tourprogress");
  prog.innerHTML = "";
  stops.forEach((_, j) => {
    const dot = document.createElement("i");
    if (j === i) dot.className = "on";
    prog.appendChild(dot);
  });
  const nm = id ? eff(byId.get(id)) : null;
  const nd = id ? byId.get(id) : null;
  document.getElementById("tourtitle").textContent = nm
    ? nm.name + (nm.native ? " · " + nm.native : "") +
      (nd.birth || nd.death ? `  (${nd.birth || "?"}–${nd.death || ""})` : "")
    : "The whole lineage";
  document.getElementById("tourblurb").textContent = stop.blurb;
  document.getElementById("tourprev").disabled = i === 0;
  document.getElementById("tournext").textContent = i === stops.length - 1 ? "Finish" : "Next →";
  markTour(id);
  if (id) centreOn(id, 0.9, 850);
  else fit(null);
}
function endTour() {
  tourIdx = null;
  tourCard.hidden = true;
  markTour(null);
}
document.getElementById("storybtn").onclick = () => { exitIsolate(false); clearSelection(); goTour(0); };
document.getElementById("tourprev").onclick = () => goTour(tourIdx - 1);
document.getElementById("tournext").onclick = () => {
  const stops = TOUR.filter(s => !s.name || tourStopId(s));
  if (tourIdx >= stops.length - 1) endTour(); else goTour(tourIdx + 1);
};
document.getElementById("tourend").onclick = endTour;
addEventListener("keydown", ev => {
  if (tourIdx === null) return;
  if (ev.key === "ArrowRight") document.getElementById("tournext").click();
  else if (ev.key === "ArrowLeft" && tourIdx > 0) goTour(tourIdx - 1);
  else if (ev.key === "Escape") endTour();
});

/* ============ init ============ */
function repaint() {   // theme change: refresh fills and edge tints
  for (const n of placed) {
    nodeEls.get(n.id).querySelector(".core").setAttribute("fill", nodeFill(n));
  }
  for (const { vis, e } of edgeEls.values()) vis.setAttribute("stroke", edgeStroke(e));
  renderLegend();
  buildMinimap();
  updateMiniViewport();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", repaint);
new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// the build hash is for the curator reconciling a published file against a build;
// a reader just wants to know how big the tree is
document.getElementById("stamp").textContent =
  `${placed.length.toLocaleString()} people · ${DATA.edges.length.toLocaleString()} teacher–student links`
  + (curator() && DATA.meta.source_hash ? ` · build ${DATA.meta.source_hash.slice(0, 8)}` : "");

renderBands();
renderEdges();
renderNodes();
renderLegend();
bindIsolate();
updateEditBadge();
updateAddBadge();
applyFilters();
buildMinimap();

/* opening: an establishing glance at the whole main tree, then a slow
   glide down into the 17th-century founders where the story starts */
const mainBlock = DATA.blocks[0];
fit(new Set(placed.filter(n =>
  n.x >= -1 && n.x <= mainBlock.w + 1 && n.y >= -1 && n.y <= mainBlock.h + 1).map(n => n.id)),
  { instant: true });
hint.hidden = false;
const OPEN_ZOOM = 0.6;   // opening scale: founders readable, with context around them
/* glide to the very left edge of the tree, where the story begins */
function openLeft(dur) {
  const r = stage.getBoundingClientRect();
  const b = graphBBox(null);
  const yCap = mainBlock.strayCount ? mainBlock.strayY : Infinity;
  const early = placed.filter(n => pos.get(n.id).x <= b.x0 + 950 && pos.get(n.id).y < yCap);
  const my = early.reduce((s, n) => s + pos.get(n.id).y, 0) / (early.length || 1);
  animateView(40 - b.x0 * OPEN_ZOOM, r.height / 2 - my * OPEN_ZOOM, OPEN_ZOOM, dur);
}
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  setTimeout(() => { if (!hintDone) openLeft(1600); }, 900);
} else {
  openLeft(1);
}
setTimeout(userMoved, 9000);   // hint fades on its own eventually

// make the current mode visible, so curator view is never mistaken for the public site
if (curator()) {
  setTimeout(() => toast("Curator copy: sources are visible here and are not in the published "
    + "site. Edits export via Export → “Expert corrections”."), 1400);
}
