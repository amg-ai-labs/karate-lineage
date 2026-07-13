# Method

How the dataset was built and, more importantly, how it was checked.

## The problem with lineage data

Scraped martial-arts lineage fails in four characteristic ways, and all four had to be solved before anything else was worth doing.

**Wrong entities.** A name is matched to the wrong person. The dataset contained an actor, a baseball player, a manga artist and a judoka born in 1970, all standing in for real karateka. Twenty-four such matches were found and resolved.

**Duplicates.** The same master appears two or three times under different romanisations (Seiko Higa and Seko Higa; Kanei and Kanyei Uechi). Left alone, these split a lineage into fragments that then look like separate traditions.

**Cycles.** Enough bad edges and the "tree" stops being a tree: A teaches B teaches C teaches A. The pipeline detects cycles and breaks them at the lowest-confidence edge, reporting what it did rather than doing it silently.

**Impossible chronology.** A teacher who died before his student was born. These are the easiest errors to catch mechanically and the most damning if left in.

## Verification

Claims were researched in waves, each wave adversarially verified: one agent proposes a link with sources, an independent agent tries to *refute* it, and anything refuted is discarded rather than downgraded. The rule throughout was that a claim with no source is not a weak claim, it is not a claim.

- **Multilingual pass.** Japanese, Korean and Chinese sources, since much of this history is not recorded in English. Contributed 162 native-script names and corrected many dates.
- **Historian's audit.** Every edge and every person checked against primary or near-primary sources across 25 domains. 323 edges confirmed, 371 changes proposed, of which the verifiers confirmed 327, rated 30 merely plausible, and refuted 14. Notably, the verifiers also refuted 8 of the *proposed deletions*, saving links that were in fact correct.
- **Style taxonomy.** Family, style, sub-style and sub-sub-style, each with founder and founding year, every branch verified.
- **Mark Bishop, _Okinawan Karate_.** Read in full and cross-checked claim by claim against the existing data. Bishop interviewed the masters himself, so his first-hand statements outrank web tradition; his relayed traditions do not.

Where a source is a style's own promotional history, it is graded accordingly. Organisations are not neutral witnesses to their own descent.

## The chronology guard

Two checks run on every build and cannot be switched off.

A **teacher must precede their student.** Any edge that violates this is surfaced, and the one genuinely impossible link the book introduced (Kanei Uechi, born 1911, as teacher of a man born 1896) was rejected on this basis. Note that a teacher *may* be younger than their student, which happens legitimately, so the check reports rather than deletes.

A **style cannot predate its founding.** Kūsankū was tagged with Isshin-ryū, a style founded in 1956, roughly two centuries after his death, because Isshin-ryū's own lineage page claims descent from him. Descent is not membership. Tags that postdate a person's death are dropped, and where a person has no dates at all their period is inferred from the people around them so the check still applies.

## What is deliberately not done

No link is invented to tidy the picture. 69 people remain unattached because no reliable chain to them exists, and a plausible-looking guess would be worse than an honest gap. The Tsuken kobudō pair, the Azerbaijani chain and a handful of Western practitioners sit outside the main tree for exactly this reason.

Contested dates are not resolved by fiat. Where a primary source and the scholarly consensus disagree, both are recorded and the disagreement is put in front of a human.
