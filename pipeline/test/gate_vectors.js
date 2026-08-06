/* Driver for check_gate.py: runs the page's own crypto under JavaScriptCore
   and prints what it computed, for Python to compare against its own vectors.
   Loaded after gate.js, which leaves its algorithm on globalThis.KarateGate. */

// JavaScriptCore under osascript has no TextEncoder. gate.js needs one for the
// domain string, the passphrase and the two key labels.
if (typeof TextEncoder === "undefined") {
  globalThis.TextEncoder = function () {
    this.encode = function (s) {
      const out = [];
      for (let i = 0; i < s.length; i++) {
        let c = s.codePointAt(i);
        if (c > 0xffff) i++;
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63),
                      0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return new Uint8Array(out);
    };
  };
}

const G = globalThis.KarateGate;
const bytes = h => {
  const o = new Uint8Array(h.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16);
  return o;
};
const hex = b => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
const enc8 = s => new TextEncoder().encode(s);
const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

const pw = enc8(VECTORS.pw);
const salt = G.saltFor(pw);
const master = G.pbkdf2Sync(pw, salt, VECTORS.rounds);
const keys = G.splitMaster(master);

const nonce = bytes(VECTORS.nonce);
const ct = bytes(VECTORS.ct);
const tag = bytes(VECTORS.tag);
const mine = G.hmac(keys.mac, cat(nonce, ct));

// a flipped bit must be caught: the tag is the only thing standing between a
// wrong passphrase and a page that renders nonsense
const bad = ct.slice();
bad[bad.length >> 1] ^= 1;
const badtag = G.hmac(keys.mac, cat(nonce, bad));

const long = new Uint8Array(256 * 5);
for (let i = 0; i < long.length; i++) long[i] = i % 256;

const result = {
  sha_empty: hex(G.sha256(new Uint8Array(0))),
  sha_abc: hex(G.sha256(enc8("abc"))),
  sha_long: hex(G.sha256(long)),
  hmac: hex(G.hmac(enc8("kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"), enc8("the quick brown fox"))),
  pbkdf2: hex(master),
  salt: hex(salt),
  enc: hex(keys.enc),
  mac: hex(keys.mac),
  tag: hex(mine),
  tagok: G.equal(mine, tag),
  tagbad: G.equal(badtag, tag),
  plain: hex(G.sha256(G.xorKeystream(ct, keys.enc, nonce))),
};
console.log(JSON.stringify(result));
