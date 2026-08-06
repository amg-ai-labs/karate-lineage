/* Minimal DOM stub so app.js runs under JavaScriptCore (osascript -l JavaScript). */
function El(tag, id) {
  this.tagName = String(tag || "div").toUpperCase();
  this.nodeType = 1;          // inlineStyles walks only nodeType===1: without this it no-ops
  this.id = id || "";
  this.children = [];
  this.attrs = {};
  this.style = {};
  this.dataset = {};
  this._text = "";
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
// textContent has to behave like the real one: reading it returns this node's
// own text PLUS every descendant's, writing it replaces the whole subtree.
// A plain data property silently reports "" for any element built from children,
// which lets a panel that renders nothing pass a test that checks its text.
Object.defineProperty(El.prototype, "textContent", {
  get: function () {
    return this._text + this.children.map(c => c.textContent).join("");
  },
  set: function (v) { this._text = String(v); this.children = []; },
});
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
    if (typeof a === "string") { var t = new El("#text"); t._text = a; this.appendChild(t); }
    else this.appendChild(a);
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
  c._text = this._text;
  c.style = Object.assign({}, this.style);
  if (deep) for (var k of this.children) c.appendChild(k.cloneNode(true));
  return c;
};
/* Selectors: a tag, a class, an attribute, compounds of those, descendant
   chains ("a b c") and comma-separated alternatives. The earlier version
   understood one simple selector and returned nothing for anything else, so a
   test asking for ".gen-pick select" passed by finding no control to check. A
   stub that answers "no" to a question it did not understand is worse than one
   that throws, so unknown syntax now throws. */
function matcher(token) {
  var parts = token.match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)((?:\[[^\]]+\])*)$/);
  if (!parts) throw new Error("dom_stub: unsupported selector token " + JSON.stringify(token));
  var tag = parts[1] ? parts[1].toUpperCase() : null;
  var classes = [], ids = [];
  (parts[2] || "").replace(/([.#])([\w-]+)/g, function (_, k, v) {
    (k === "." ? classes : ids).push(v); return "";
  });
  var attrs = [];
  (parts[3] || "").replace(/\[([^\]]+)\]/g, function (_, body) {
    var m = body.match(/^([\w-]+)(?:(\*?=)"?([^"\]]*)"?)?$/);
    if (!m) throw new Error("dom_stub: unsupported attribute selector [" + body + "]");
    attrs.push(m); return "";
  });
  return function (e) {
    if (tag && e.tagName !== tag) return false;
    for (var c of classes) if (!e._cls.has(c)) return false;
    for (var i of ids) if (e.attrs.id !== i && e.id !== i) return false;
    for (var a of attrs) {
      var v = e.attrs[a[1]];
      if (a[2] === undefined) { if (v === undefined) return false; continue; }
      v = String(v === undefined ? "" : v);
      if (a[2] === "=" ? v !== a[3] : v.indexOf(a[3]) < 0) return false;
    }
    return true;
  };
}
El.prototype.querySelectorAll = function (sel) {
  var out = [];
  for (var alt of String(sel).split(",")) {
    var tokens = alt.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    var tests = tokens.map(matcher);
    var level = [this];
    for (var i = 0; i < tests.length; i++) {
      var next = [], test = tests[i];
      for (var root of level)
        (function walk(e) {
          for (var c of e.children) { if (test(c)) next.push(c); walk(c); }
        })(root);
      level = next;
    }
    for (var el of level) if (out.indexOf(el) < 0) out.push(el);
  }
  return out;
};
El.prototype.querySelector = function (sel) {
  return this.querySelectorAll(sel)[0] || null;
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
/* Window-level listeners were dropped on the floor, so every keyboard shortcut
   in the application was untestable and untested. They are recorded now, and
   fireKey() delivers a keydown the way a browser would. */
var _globalListeners = {};
function addEventListener(type, fn) {
  (_globalListeners[type] = _globalListeners[type] || []).push(fn);
}
function fireKey(key, opts) {
  var ev = {
    key: key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false,
    target: { tagName: "BODY" },
    preventDefault: function () { this.defaultPrevented = true; },
    stopPropagation: function () {},
  };
  for (var k in (opts || {})) ev[k] = opts[k];
  for (var f of (_globalListeners.keydown || [])) f(ev);
  return ev;
}
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
/* A real serialiser. It used to return the literal string "<svg/>" for any
   input, which meant every assertion about what an exported figure contains
   passed by finding nothing at all: the test that checked the key had been
   removed from a poster would have passed just as happily if the key were
   still there. Attributes, nesting and text, with the escaping a browser does. */
function XMLSerializer() {
  var esc = function (s, attr) {
    s = String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return attr ? s.replace(/"/g, "&quot;") : s;
  };
  var ser = function (n) {
    // text nodes are El("#text") here, carrying their content in _text
    if (n.tagName === "#TEXT") return esc(n._text);
    var tag = (n.tagName || "div").toLowerCase();
    var out = "<" + tag;
    for (var k in n.attrs) {
      if (n.attrs[k] === undefined || n.attrs[k] === null) continue;
      out += " " + k + '="' + esc(n.attrs[k], true) + '"';
    }
    if (n._cls && n._cls.size) out += ' class="' + esc([...n._cls].join(" "), true) + '"';
    var kids = (n.children || []).map(ser).join("");
    var own = n._text ? esc(n._text) : "";
    if (!kids && !own) return out + "/>";
    return out + ">" + own + kids + "</" + tag + ">";
  };
  this.serializeToString = function (node) { return node ? ser(node) : ""; };
}
function Blob(parts, opts) {
  var n = 0;
  for (var i = 0; i < (parts || []).length; i++) {
    var p = parts[i];
    n += p && p.byteLength !== undefined ? p.byteLength : String(p || "").length;
  }
  this.size = n; this.type = (opts || {}).type || "";
  // keep the text so a test can assert on what was actually written out
  this._text = (parts || []).map(function (p) {
    return p && p.byteLength !== undefined ? "" : String(p == null ? "" : p);
  }).join("");
}
Blob.prototype.text = function () { return Promise.resolve(this._text); };
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
