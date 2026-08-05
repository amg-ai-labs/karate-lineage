# Karate lineage cladogram: changes since your last review

The dataset now holds **1,279 people, 1,555 teacher-to-student links, 317 styles and 473 kata**.
Taking your points in order.

**1. Books and Japanese-language sources.** Four books are now read in and cited by page: Bishop, Nagamine (*Tales of Okinawa's Great Masters*), Cramer (*The History of Karate*) and Guarelli (*Okinawan Kobudo*). A separate Japanese-language sweep added 139 people, 137 links and 42 styles. The books pass proposed 330 new people; 55 were admitted. The rest were rejected as malformed extractions or as people with neither a date nor a link to anyone already in the tree.

**2. Graphical output.** Charts are re-laid out compactly for print, which removed 45% of the area, and you can now choose the depth: one, two, three, a custom number of generations, or the whole line. Output is vector SVG, 300 dpi PDF, TIFF, JPG or PNG.

**3. Export.** Any person, style or sub-style exports as a chart or as data: CSV (a node table and an edge table), JSON, or GraphML, which opens directly in Gephi, Cytoscape and yEd without an import step. Originating groups are now explicit and separate: Shuri-te, Naha-te, Tomari-te, Uechi-ryū, kobudō, Japanese karate, Kyokushin, Korean arts, kenpō, te, Chinese antecedents.

**4. Kata and people.** This was the largest piece of work. The kata list went from 212 to 473, and **every kata now has a person attached where one is recorded**. There are no orphans left, which was the underlying problem behind Chintō. Kata appear in the person boxes and in the style boxes, not only in the kata tab. 328 entries are marked as disputed, with the specific objection recorded rather than smoothed over.

**5. Master file.** The whole dataset is written out as plain CSVs (`master/`) on every build: people, links, styles, kata, and kata-to-person credits. The website is generated from the same data, so the two cannot drift apart. Version history is in git, and every change is a row carrying its reason, so any figure traces back to the decision that made it.

**6. Analytics.** Eight measures of connectivity, reported separately and never combined into a single score, because they measure different things and disagree: total reach, reach excluding pass-through figures, prominent students, students taught personally, number of teachers, diversity of those teachers, stylistic spread, and depth of line. Each states its method on screen and exports its own table. There is also a list of the 213 instructors whose recorded line ended with them, restricted to those born before 1950 so that a living teacher is not counted as a dead end. Each person's own figures and ranking appear in their panel.

**7. Navigation.** Damped zoom, momentum panning, a recentre control and an R key that returns to your selection.

**8. Search.** You can now find a person by kanji or kana, under either name order, with or without macrons, by title or honour, or by the school they ran. Your worked example resolves: Tesshin Hamada 濱田鉄心 is held separately from Hiroyuki Hamada 濱田博之 (1925 to 2003), no death is asserted for him, and Tenshin-ryū is not attached to him because the claim is unsupported.

**9. Missed individuals and name order.** 24 people credited with a kata but absent from the roster are now included, among them Chokuho Agena, Choun Oyakata, Xie Zhongxiang, Kingai and Wai Shinzan. Name ordering has been normalised across 58 records, including the Motobu family. One correction to the brief: Sōkō Kishimoto and Kanken Toyama were already recorded as Seitoku Higa's teachers, at high confidence.

**10. Style and kata lists.** The style list is ordered family, then style, then sub-style, and is searchable, so Honshin-Ryū, Yamani-Ryū, Uchuchiku Kobudō and Ryūkyū Kobudō are all directly findable. Each style has its own page giving its position in the tree, its founder and founding year, its members and its kata. The kata tab gives date of introduction, likely creator, likely modifier, modification date and provenance.

---

Two points of housekeeping. The books are cited by page only and are not redistributed with the project. Three automated test suites run against every build, one of which exists specifically to confirm that the published copy carries no source-evidence layer.
