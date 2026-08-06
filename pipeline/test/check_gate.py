#!/usr/bin/env python3
"""Run the gate's JavaScript crypto against vectors computed by gate.py.

The gated /hutan page hands a hand-written SHA-256, HMAC, PBKDF2 and stream
cipher the job of opening the only copy Hutan can reach. If any of them differs
from the Python that produced the blob by a single bit, the page is a locked
door with no key, and it fails identically to a mistyped passphrase, so the
failure would be invisible. Hence vectors.

Everything checked here is synchronous, so it runs under JavaScriptCore with no
event loop: the WebCrypto path, the base64 decode, the inflate and the DOM
wiring are browser-native and are not what this is guarding.

  python3 pipeline/test/check_gate.py     (from the repo root; needs macOS osascript)
"""
import hashlib
import hmac as hmaclib
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
K = HERE.parent.parent
sys.path.insert(0, str(K / "pipeline" / "viz"))
import gate                                                       # noqa: E402

PW = "vector-passphrase-for-the-test"
PBKDF2_ROUNDS = 2000          # a vector, not the real cost: 310,000 in the page


def sample():
    """A slice of the real payload. A synthetic string compresses to a few
    hundred bytes and would exercise about seven keystream blocks, which is
    not a test of a stream cipher."""
    p = K / "pipeline" / "out" / "viz_data.json"
    if p.exists():
        return p.read_bytes()[:400_000]
    return bytes(range(256)) * 1200          # fallback: incompressible, same size class


def hexs(b):
    return b.hex()


def main():
    if not (K / "docs/hutan/index.html").exists():
        print("no docs/hutan/index.html: the gated build was skipped "
              "(no pipeline/curator_key.txt), so there is nothing to check")
        return 0

    # ---- vectors from the Python side ----
    salt = hashlib.sha256(gate.DOMAIN + b"|salt|" + PW.encode()).digest()[:16]
    master = hashlib.pbkdf2_hmac("sha256", PW.encode(), salt, PBKDF2_ROUNDS, 32)
    enc = hmaclib.new(master, b"enc", hashlib.sha256).digest()
    mac = hmaclib.new(master, b"mac", hashlib.sha256).digest()

    import zlib
    packed = zlib.compress(sample(), 9)
    nonce = hashlib.sha256(packed).digest()[:16]
    ct = gate._keystream_xor(packed, enc, nonce)
    tag = hmaclib.new(mac, nonce + ct, hashlib.sha256).digest()

    want = {
        "sha_empty": hexs(hashlib.sha256(b"").digest()),
        "sha_abc": hexs(hashlib.sha256(b"abc").digest()),
        "sha_long": hexs(hashlib.sha256(bytes(range(256)) * 5).digest()),
        "hmac": hexs(hmaclib.new(b"k" * 40, b"the quick brown fox", hashlib.sha256).digest()),
        "pbkdf2": hexs(master),
        "salt": hexs(salt),
        "enc": hexs(enc),
        "mac": hexs(mac),
        "tag": hexs(tag),
        "plain": hexs(hashlib.sha256(packed).digest()),
    }

    # ---- the same computations in the browser's code ----
    js = (HERE / "gate_vectors.js").read_text(encoding="utf-8")
    src = (
        (K / "pipeline/viz/gate.js").read_text(encoding="utf-8")
        + "\nvar VECTORS = " + json.dumps({
            "pw": PW, "rounds": PBKDF2_ROUNDS,
            "master": hexs(master), "nonce": hexs(nonce),
            "ct": hexs(ct), "tag": hexs(tag),
        }) + ";\n" + js
    )
    run = HERE / "run_gate.js"
    run.write_text(src, encoding="utf-8")
    try:
        out = subprocess.run(["osascript", "-l", "JavaScript", str(run)],
                             capture_output=True, text=True, timeout=600)
    finally:
        run.unlink(missing_ok=True)

    text = (out.stdout + out.stderr).strip()
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        print("FAIL: the gate script produced no result\n" + text)
        return 1
    got = json.loads(m.group(0))

    fails = [f"  {k}: python {v[:24]}… javascript {str(got.get(k))[:24]}…"
             for k, v in want.items() if got.get(k) != v]
    if got.get("tagok") is not True:
        fails.append("  tag: the JavaScript rejected a blob its own Python authored")
    if got.get("tagbad") is not False:
        fails.append("  tag: the JavaScript accepted a blob with a flipped bit")

    if fails:
        print("FAIL: the page's crypto does not match the build's\n" + "\n".join(fails))
        return 1
    print(f"gate crypto matches: {len(want)} vectors "
          f"(SHA-256, HMAC, PBKDF2, key split, keystream over {len(ct) // 1024} KB, "
          f"and the tag rejects a flipped bit)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
