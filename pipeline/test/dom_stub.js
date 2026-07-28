/* Minimal DOM stub so app.js runs under JavaScriptCore (osascript -l JavaScript). */
function El(tag, id) {
  this.tagName = String(tag || "div").toUpperCase();
  this.nodeType = 1;          // inlineStyles walks only nodeType===1: without this it no-ops
  this.id = id || "";
  this.children = [];
  this.attrs = {};
  this.style = {};
  this.dataset = {};
  this.textContent = "";
  this.value = "";
  this.hidden = false;
  this._cls = new Set();
  var self = this;
  this.classList = {
    add: function () { for (var i = 0; i < arguments.length; i++) self._cls.add(arguments[i]); },
    remove: function () { for (var i = 0; i < arguments.length; i++) self._cls.delete(arguments[i]); },
    toggle: function (c, on) {
      if (on === undefined) on = !self._cls.has(c);
      if (on) self._cls.add(c); else self._cls.delete(c);
      return on;
    },
    contains: function (c) { return self._cls.has(c); },
  };
}
El.prototype.setAttribute = function (k, v) {
  this.attrs[k] = String(v);
  if (k === "class") { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  if (k === "id") this.id = String(v);
};
El.prototype.getAttribute = function (k) {
  if (k === "class") return [...this._cls].join(" ");
  return k in this.attrs ? this.attrs[k] : null;
};
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { this.children.push(c); c.parentNode = this; return c; };
El.prototype.append = function () {
  for (var i = 0; i < arguments.length; i++) {
    var a = arguments[i];
    if (typeof a === "string") this.textContent += a; else this.appendChild(a);
  }
};
El.prototype.remove = function () {
  var p = this.parentNode;
  if (p) p.children = p.children.filter(c => c !== this);
};
El.prototype.insertBefore = function (n, ref) {
  var i = this.children.indexOf(ref);
  if (i < 0) i = this.children.length;
  this.children.splice(i, 0, n);
  n.parentNode = this;
  return n;
};
El.prototype.cloneNode = function (deep) {
  var c = new El(this.tagName, this.id);
  c.attrs = Object.assign({}, this.attrs);
  c._cls = new Set(this._cls);
  c.textContent = this.textContent;
  c.style = Object.assign({}, this.style);
  if (deep) for (var k of this.children) c.appendChild(k.cloneNode(true));
  return c;
};
El.prototype.querySelectorAll = function (sel) {
  var out = [];
  var test;
  if (sel[0] === ".") { var cls = sel.slice(1); test = e => e._cls.has(cls); }
  else if (sel[0] === "[") {
    var m = sel.match(/^\[(\w+)\*="(.*)"\]$/);
    test = m ? (e => String(e.attrs[m[1]] || "").indexOf(m[2]) >= 0) : (() => false);
  } else { var tg = sel.toUpperCase(); test = e => e.tagName === tg; }
  (function walk(e) {
    for (var c of e.children) { if (test(c)) out.push(c); walk(c); }
  })(this);
  return out;
};
El.prototype.addEventListener = function (t, f) {
  (this._ev = this._ev || {})[t] = (this._ev[t] || []).concat(f);
};
El.prototype.fire = function (t, ev) {
  ev = ev || { button: 0, clientX: 0, clientY: 0, stopPropagation: function () {}, target: this };
  for (var f of (this._ev && this._ev[t]) || []) f(ev);
  if (typeof this["on" + t] === "function") this["on" + t](ev);   // onclick= handlers too
};
El.prototype.setPointerCapture = function () {};
El.prototype.releasePointerCapture = function () {};
El.prototype.getBoundingClientRect = function () { return { width: 1400, height: 900, left: 0, top: 0, right: 1400, bottom: 900 }; };
El.prototype.click = function () { this.fire("click"); };
El.prototype.closest = function () { return null; };
Object.defineProperty(El.prototype, "className", {
  get: function () { return [...this._cls].join(" "); },
  set: function (v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
});
Object.defineProperty(El.prototype, "innerHTML", {
  get: function () { return this._innerHTML || ""; },
  set: function (v) { this._innerHTML = v; this.children.length = 0; },
});
Object.defineProperty(El.prototype, "offsetWidth", { get: function () { return 100; } });
Object.defineProperty(El.prototype, "offsetHeight", { get: function () { return 40; } });
Object.defineProperty(El.prototype, "firstChild", { get: function () { return this.children[0] || null; } });

/* canvas + Image: a real browser caps a canvas at 16384px/side and returns a
   null blob past that, which is exactly how the 4x poster once failed silently. */
var CANVAS_MAX = 16384;
El.prototype.getContext = function () {
  return {
    scale: function () {}, drawImage: function () {}, fillRect: function () {},
    set fillStyle(v) {}, get fillStyle() { return "#fff"; },
    getImageData: function (x, y, w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
  };
};
El.prototype.toBlob = function (cb) {
  var over = this.width > CANVAS_MAX || this.height > CANVAS_MAX;
  cb(over ? null : new Blob(["png"], { type: "image/png" }));
};
function Image() {
  var self = this;
  Object.defineProperty(this, "src", {
    set: function () { if (self.onload) self.onload(); },
  });
}

var __ids = {};
var document = {
  documentElement: new El("html"),
  body: new El("body"),
  getElementById: function (id) {
    if (!__ids[id]) __ids[id] = new El("div", id);
    return __ids[id];
  },
  createElement: function (t) { return new El(t); },
  createElementNS: function (ns, t) { return new El(t); },
  createTextNode: function (s) { var e = new El("#text"); e.textContent = s; return e; },
  addEventListener: function () {},
};
document.documentElement.dataset = {};
__ids["data"] = new El("script", "data");
__ids["data"].textContent = __VIZ_DATA__;

function matchMedia() { return { matches: false, addEventListener: function () {} }; }
function MutationObserver() { this.observe = function () {}; }
var localStorage = { _s: {}, getItem: function (k) { return this._s[k] || null; },
  setItem: function (k, v) { this._s[k] = String(v); }, removeItem: function (k) { delete this._s[k]; } };
function addEventListener() {}
var location = { hash: "", reload: function () {} };
var performance = { now: function () { return Date.now(); } };
function setTimeout(f) { f(); return 0; }
function clearTimeout() {}
var __rafDepth = 0;
function requestAnimationFrame(f) { if (__rafDepth++ < 40) f(performance.now() + 1000); return 1; }
function cancelAnimationFrame() {}

/* Approximate the real cascade: an element's own presentation attribute wins,
   otherwise fall back to what style.css would give it, so a serialised export
   renders faithfully. */
var THEME = { "--surface": "#fcfcfb", "--plane": "#f9f9f7", "--ink": "#0b0b0b",
              "--ink-2": "#52514e", "--muted": "#898781", "--line": "#e2e1dc",
              "--accent": "#2a78d6", "--panel": "#ffffff", "--grid": "#eeeeec",
              "--band": "rgba(11,11,11,0.022)", "--edge": "#b9b8b2", "--edge-dim": "#dedddA" };
var CLASS_FILL = { "band-rect": "--band", "band-cap": "--muted" };
function getComputedStyle(el) {
  var tag = (el && el.tagName) || "", A = (el && el.attrs) || {},
      cls = (el && el._cls) || new Set(), S = (el && el.style) || {};
  return {
    getPropertyValue: function (p) {
      if (p in THEME) return THEME[p];
      var camel = p.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
      if (S[camel]) return String(S[camel]);                 // inline style wins
      if (p in A) return String(A[p]);                       // presentation attribute
      if (p === "fill") {
        for (var c in CLASS_FILL) if (cls.has(c)) return THEME[CLASS_FILL[c]];
      }
      if (tag === "TEXT" || tag === "TSPAN") {
        if (p === "paint-order") return "stroke";
        if (p === "stroke") return THEME["--surface"];
        if (p === "stroke-width") return "3px";
        if (p === "stroke-linejoin") return "round";
        if (p === "fill") return cls.has("l2") || cls.has("native")
          ? THEME["--ink-2"] : THEME["--ink"];
        if (p === "font-size") return "12px";
        if (p === "font-weight") return cls.has("l1") ? "600" : "400";
      }
      if (tag === "PATH" && p === "fill") return "none";
      if (tag === "CIRCLE" && p === "stroke") return "none";
      if (p === "opacity") return cls.has("ghost") ? "0.06" : (cls.has("dim") ? "0.16" : "1");
      return "";
    },
  };
}
function XMLSerializer() { this.serializeToString = function () { return "<svg/>"; }; }
function Blob(parts, opts) {
  var n = 0;
  for (var i = 0; i < (parts || []).length; i++) {
    var p = parts[i];
    n += p && p.byteLength !== undefined ? p.byteLength : String(p || "").length;
  }
  this.size = n; this.type = (opts || {}).type || "";
}
Blob.prototype.arrayBuffer = function () { return Promise.resolve(new ArrayBuffer(8)); };
var URL = { createObjectURL: function () { return "blob:x"; }, revokeObjectURL: function () {} };
function TextEncoder() { this.encode = function (s) {
  var a = new Uint8Array(String(s).length);
  for (var i = 0; i < a.length; i++) a[i] = String(s).charCodeAt(i) & 0xff;
  return a; }; }
function prompt() { return ""; }
function confirm() { return true; }
function alert() {}
var navigator = { userAgent: "jsc" };
var console = console || { log: function (s) { print(s); } };
