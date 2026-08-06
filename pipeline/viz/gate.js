"use strict";
/* Unlock for the passphrase-gated curator build (/hutan).

   The page ships with the payload encrypted and no data at all in the clear.
   This script derives the key from the typed passphrase, authenticates the
   blob, decrypts it, inflates it, hands it to the app and then starts the app.
   Nothing here is decorative: until it succeeds there is nothing to display.

   The construction is documented in pipeline/viz/gate.py, which produced the
   blob. SHA-256 is implemented below rather than taken from crypto.subtle
   because the keystream needs eleven thousand independent digests and
   subtle.digest is asynchronous per call; the one place subtle IS used is
   PBKDF2, where a single native call replaces 620,000 JavaScript rounds. */

(function () {
  /* ---------- SHA-256 ---------- */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const W = new Uint32Array(64);

  function compress(H, m, off, blocks) {
    for (let b = 0; b < blocks; b++) {
      const p = off + b * 64;
      for (let i = 0; i < 16; i++)
        W[i] = (m[p + i * 4] << 24) | (m[p + i * 4 + 1] << 16) |
               (m[p + i * 4 + 2] << 8) | m[p + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], c = W[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let h0 = H[0], h1 = H[1], h2 = H[2], h3 = H[3],
          h4 = H[4], h5 = H[5], h6 = H[6], h7 = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = ((h4 >>> 6) | (h4 << 26)) ^ ((h4 >>> 11) | (h4 << 21)) ^ ((h4 >>> 25) | (h4 << 7));
        const ch = (h4 & h5) ^ (~h4 & h6);
        const t1 = (h7 + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = ((h0 >>> 2) | (h0 << 30)) ^ ((h0 >>> 13) | (h0 << 19)) ^ ((h0 >>> 22) | (h0 << 10));
        const maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2);
        const t2 = (S0 + maj) >>> 0;
        h7 = h6; h6 = h5; h5 = h4; h4 = (h3 + t1) >>> 0;
        h3 = h2; h2 = h1; h1 = h0; h0 = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + h0) >>> 0; H[1] = (H[1] + h1) >>> 0;
      H[2] = (H[2] + h2) >>> 0; H[3] = (H[3] + h3) >>> 0;
      H[4] = (H[4] + h4) >>> 0; H[5] = (H[5] + h5) >>> 0;
      H[6] = (H[6] + h6) >>> 0; H[7] = (H[7] + h7) >>> 0;
    }
  }

  function sha256(msg) {
    const len = msg.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(total);
    m.set(msg);
    m[len] = 0x80;
    const hi = Math.floor(len / 536870912), lo = (len * 8) >>> 0;
    m[total - 8] = (hi >>> 24) & 255; m[total - 7] = (hi >>> 16) & 255;
    m[total - 6] = (hi >>> 8) & 255;  m[total - 5] = hi & 255;
    m[total - 4] = (lo >>> 24) & 255; m[total - 3] = (lo >>> 16) & 255;
    m[total - 2] = (lo >>> 8) & 255;  m[total - 1] = lo & 255;
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                               0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    compress(H, m, 0, total >> 6);
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = (H[i] >>> 16) & 255;
      out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255;
    }
    return out;
  }

  function hmac(key, msg) {
    let k = key.length > 64 ? sha256(key) : key;
    const ip = new Uint8Array(64 + msg.length), op = new Uint8Array(96);
    for (let i = 0; i < 64; i++) {
      const kb = i < k.length ? k[i] : 0;
      ip[i] = kb ^ 0x36;
      op[i] = kb ^ 0x5c;
    }
    ip.set(msg, 64);
    op.set(sha256(ip), 64);
    return sha256(op);
  }

  const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  const utf8 = s => new TextEncoder().encode(s);

  /* ---------- key derivation ---------- */
  const DOMAIN = "karate-lineage/hutan/v1";
  const ITERATIONS = 310000;

  // PBKDF2-HMAC-SHA256, one 32-byte block. Portable and synchronous, so the
  // headless harness can check it against Python at a low iteration count.
  function pbkdf2Sync(pw, salt, iterations) {
    const u1 = hmac(pw, cat(salt, new Uint8Array([0, 0, 0, 1])));
    let u = u1;
    const acc = u1.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmac(pw, u);
      for (let j = 0; j < 32; j++) acc[j] ^= u[j];
    }
    return acc;
  }

  async function pbkdf2(pw, salt) {
    const subtle = typeof self !== "undefined" && self.crypto && self.crypto.subtle;
    if (subtle) {
      try {
        const base = await subtle.importKey("raw", pw, "PBKDF2", false, ["deriveBits"]);
        const bits = await subtle.deriveBits(
          { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" }, base, 256);
        return new Uint8Array(bits);
      } catch (_) { /* fall through to the portable path */ }
    }
    return pbkdf2Sync(pw, salt, ITERATIONS);   // no WebCrypto: a file:// origin, typically
  }

  function saltFor(pw) {
    return sha256(cat(utf8(DOMAIN + "|salt|"), pw)).slice(0, 16);
  }

  function splitMaster(master) {
    return { enc: hmac(master, utf8("enc")), mac: hmac(master, utf8("mac")) };
  }

  async function keysFrom(passphrase) {
    const pw = utf8(passphrase);
    return splitMaster(await pbkdf2(pw, saltFor(pw)));
  }

  /* ---------- the blob ---------- */
  function b64(text) {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function equal(a, b) {   // constant time, out of habit rather than need
    let d = a.length ^ b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a[i] ^ b[i];
    return d === 0;
  }

  function xorKeystream(ct, enc, nonce) {
    const out = new Uint8Array(ct.length);
    const input = new Uint8Array(enc.length + nonce.length + 4);
    input.set(enc); input.set(nonce, enc.length);
    const c = input.length - 4;
    for (let i = 0, n = 0; i < ct.length; i += 32, n++) {
      input[c] = (n >>> 24) & 255; input[c + 1] = (n >>> 16) & 255;
      input[c + 2] = (n >>> 8) & 255; input[c + 3] = n & 255;
      const ks = sha256(input);
      const end = Math.min(32, ct.length - i);
      for (let j = 0; j < end; j++) out[i + j] = ct[i + j] ^ ks[j];
    }
    return out;
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream !== "function")
      throw new Error("This browser cannot decompress the data. Any version of "
                      + "Safari, Chrome, Edge or Firefox from 2023 onwards can.");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unlock(passphrase) {
    const raw = b64(document.getElementById("blob").textContent.trim());
    const nonce = raw.slice(0, 16), tag = raw.slice(16, 48), ct = raw.slice(48);
    const { enc, mac } = await keysFrom(passphrase);
    if (!equal(tag, hmac(mac, cat(nonce, ct)))) return null;   // wrong passphrase
    return new TextDecoder().decode(await inflate(xorKeystream(ct, enc, nonce)));
  }

  /* ---------- start the app once the data exists ---------- */
  function boot(json) {
    document.getElementById("data").textContent = json;
    const src = document.getElementById("appsrc").textContent;
    const s = document.createElement("script");
    s.textContent = src;             // global scope, exactly as the normal build
    document.body.appendChild(s);
    const gate = document.getElementById("gate");
    if (gate) gate.remove();
    document.body.classList.remove("locked");
  }

  /* ---------- the form ---------- */
  const STORE = "karate-hutan-key";
  let busy = false;

  function ready() {
    const gate = document.getElementById("gate");
    const form = document.getElementById("gateform");
    const input = document.getElementById("gatepw");
    const err = document.getElementById("gateerr");
    const remember = document.getElementById("gateremember");
    const btn = document.getElementById("gatego");

    async function attempt(phrase, silent) {
      if (busy) return false;
      busy = true;
      err.textContent = "";
      btn.disabled = true;
      btn.textContent = "Unlocking…";
      // let the browser paint the button before the derivation blocks it
      await new Promise(r => setTimeout(r, 16));
      let json = null, failure = "";
      try {
        json = await unlock(phrase);
      } catch (e) {
        failure = e.message || String(e);
      }
      busy = false;
      btn.disabled = false;
      btn.textContent = "Unlock";
      if (json) {
        try {
          if (remember.checked) localStorage.setItem(STORE, phrase);
          else localStorage.removeItem(STORE);
        } catch (_) { /* private browsing: unlock still works, it just won't persist */ }
        boot(json);
        return true;
      }
      try { localStorage.removeItem(STORE); } catch (_) {}
      if (!silent) {
        err.textContent = failure || "That passphrase is not right.";
        input.select();
      }
      return false;
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const v = input.value.trim();
      if (v) attempt(v, false);
    });

    let saved = null;
    try { saved = localStorage.getItem(STORE); } catch (_) {}
    if (saved) {
      gate.classList.add("checking");
      attempt(saved, true).then(function (ok) {
        gate.classList.remove("checking");
        if (!ok) input.focus();
      });
    } else {
      input.focus();
    }
  }

  /* The algorithm, exposed so pipeline/test/check_gate.py can run it against
     vectors computed by gate.py. Hand-written SHA-256 that is never tested is
     a page nobody can open. Nothing secret lives here: it is the same public
     construction the docstring in gate.py sets out. */
  globalThis.KarateGate = {
    sha256: sha256, hmac: hmac, pbkdf2Sync: pbkdf2Sync, saltFor: saltFor,
    splitMaster: splitMaster, xorKeystream: xorKeystream, equal: equal,
    unlock: unlock, ITERATIONS: ITERATIONS,
  };

  if (typeof document === "undefined") return;   // harness: crypto only, no DOM
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", ready);
  else
    ready();
})();
