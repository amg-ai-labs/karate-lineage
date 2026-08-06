#!/usr/bin/env python3
"""Encrypt the curator payload for the passphrase-gated /hutan build.

WHY THIS EXISTS. The published site is stripped of its evidence layer and its
image exports, because GitHub Pages serves a public repository and hiding
something in the interface is cosmetic. But the curator build has to reach one
other person. A secret path (/hutan) is not access control: the file sits in a
public repo, and one inbound link puts it in a search index. So the payload at
that path is encrypted, and the path is merely where it lives.

THE CONSTRUCTION, stated plainly so it can be audited.

    salt      = SHA-256("…|salt|" + passphrase)[:16]
    master    = PBKDF2-HMAC-SHA256(passphrase, salt, 310_000 iterations, 32 bytes)
    enc_key   = HMAC-SHA256(master, "enc")
    mac_key   = HMAC-SHA256(master, "mac")
    nonce     = SHA-256(plaintext)[:16]
    keystream = SHA-256(enc_key || nonce || uint32be(i)) for i = 0, 1, 2, …
    ciphertext= plaintext XOR keystream
    tag       = HMAC-SHA256(mac_key, nonce || ciphertext)
    blob      = base64(nonce || tag || ciphertext)

The keystream is MGF1 (RFC 8017 §B.2.1) used as a stream cipher, and the whole
is encrypt-then-MAC, so a wrong passphrase fails on the tag before a byte is
parsed. Security rests on SHA-256 being a pseudorandom function, which is the
same assumption HMAC already makes. AES would be the more conventional choice
and is deliberately not used: it is absent from the Python standard library,
and this pipeline's whole value is that it runs anywhere with no packages
installed. A hand-rolled AES would be the weaker option, not the stronger one.

Two properties worth noting. The salt is derived from the passphrase rather
than drawn at random, and the nonce from the plaintext rather than a counter,
so a rebuild of unchanged data produces byte-identical output; determinism is
a tested invariant here. Deriving the nonce from the plaintext (an SIV) is what
makes that safe: the key is fixed per passphrase, so a nonce may never repeat
under different data, and this construction repeats it only when the data is
identical, in which case the ciphertext would be identical anyway.

The passphrase lives in pipeline/curator_key.txt, which .gitignore excludes.
No passphrase, no gated build: the site is simply published without it.
"""

import base64
import hashlib
import hmac
import secrets
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEYFILE = HERE.parent / "curator_key.txt"

DOMAIN = b"karate-lineage/hutan/v1"
ITERATIONS = 310_000          # OWASP's floor for PBKDF2-HMAC-SHA256
BLOCK = 32                    # SHA-256 output, so one keystream block

# A short, pronounceable list: the passphrase is typed once by a human and sent
# in a message, so word count buys more real entropy than punctuation does.
WORDS = """anchor amber apple arrow autumn basin beacon birch bishop bottle
branch bridge bronze candle canvas carbon cedar cellar cinder circle citrus
clover cobalt copper coral cotton crater crimson crystal cypress damson delta
diamond dolphin ember falcon fennel ferry fjord forest fossil garnet glacier
granite gravel harbour harvest hazel heather hollow indigo island ivory jasmine
jetty juniper kernel kettle lagoon lantern lattice laurel lavender ledger lemon
lichen lilac linden lobster locket lupin magnet mallow marble marlin meadow
mercury minnow mistral morrow mulberry nectar nettle nickel nutmeg oakwood
obsidian olive onyx opal orchard osprey otter oyster paddock pallet papyrus
parsley pebble pelican pepper pewter pigeon pillar pilot pine plover plumage
pollen poplar poppy prairie quarry quartz quiver rafter ravine reef regent
ribbon rigging river rosemary rowan rudder saffron sage salmon sandal sapphire
scarlet sequoia shale shallow shingle sienna silver skerry slate sorrel spruce
starling sterling stipple summit sundial swallow sycamore tallow tamarisk
teasel tempest thistle thorn thrush tidal timber topaz torrent tundra turret
umber valley velvet verdant vessel walnut warbler willow windrow yarrow""".split()


def new_passphrase():
    """Four words and two digits: ~34 bits, which behind 310,000 PBKDF2
    iterations costs an attacker roughly 2^52 SHA-256 operations per guess-set.
    Ample against anyone who merely found the URL, and typable over a phone."""
    return "-".join(secrets.choice(WORDS) for _ in range(4)) + "-" + f"{secrets.randbelow(100):02d}"


def read_passphrase():
    """The passphrase, creating one on first run. Returns (phrase, is_new)."""
    if KEYFILE.exists():
        phrase = KEYFILE.read_text(encoding="utf-8").strip()
        if phrase:
            return phrase, False
    phrase = new_passphrase()
    KEYFILE.write_text(phrase + "\n", encoding="utf-8")
    return phrase, True


def _keys(passphrase):
    pw = passphrase.encode("utf-8")
    salt = hashlib.sha256(DOMAIN + b"|salt|" + pw).digest()[:16]
    master = hashlib.pbkdf2_hmac("sha256", pw, salt, ITERATIONS, 32)
    enc = hmac.new(master, b"enc", hashlib.sha256).digest()
    mac = hmac.new(master, b"mac", hashlib.sha256).digest()
    return enc, mac


def _keystream_xor(data, enc, nonce):
    out = bytearray(len(data))
    for counter, off in enumerate(range(0, len(data), BLOCK)):
        block = hashlib.sha256(enc + nonce + counter.to_bytes(4, "big")).digest()
        chunk = data[off:off + BLOCK]
        out[off:off + len(chunk)] = bytes(a ^ b for a, b in zip(chunk, block))
    return bytes(out)


def encrypt(plaintext, passphrase):
    """Compress, then encrypt, then authenticate. Returns (base64, packed size).

    Compression comes first because ciphertext is incompressible: without it
    the page would be 3.3 MB on the wire instead of about 450 KB, and every
    keystream block is a hash the browser has to compute."""
    packed = zlib.compress(plaintext, 9)
    enc, mac = _keys(passphrase)
    nonce = hashlib.sha256(packed).digest()[:16]
    ct = _keystream_xor(packed, enc, nonce)
    tag = hmac.new(mac, nonce + ct, hashlib.sha256).digest()
    return base64.b64encode(nonce + tag + ct).decode("ascii"), len(packed)


def decrypt(blob_b64, passphrase):
    """The inverse, so the build can verify its own output rather than trust it."""
    raw = base64.b64decode(blob_b64)
    nonce, tag, ct = raw[:16], raw[16:48], raw[48:]
    enc, mac = _keys(passphrase)
    if not hmac.compare_digest(tag, hmac.new(mac, nonce + ct, hashlib.sha256).digest()):
        raise ValueError("authentication failed: wrong passphrase or altered blob")
    return zlib.decompress(_keystream_xor(ct, enc, nonce))
