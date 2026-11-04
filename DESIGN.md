# ReplayCheck live page — design decision (04.11.2026)

Directions considered:
1. **Receipt tape (chosen).** The product pays per call, so the run result is printed as a thermal receipt: run id, each task PASS/FAIL, every paid call with its settlement tx, total. Warm olive-ink night `#121410`, receipt paper `#ECE7D9`, sodium accent `#FFC93C`, semantic pass `#6FD08C` / fail `#FF6B57`. Red Hat Display 800/300 for headings, Azeret Mono for every number, hash and step.
2. Contact sheet: screenshots as a film strip with sprocket holes, grease-pencil marks for failures. Dropped: the screenshot is secondary to the paid-call proof judges look for.
3. Oscilloscope: run timeline as a trace. Dropped: ornamental for a tool page.

Ledger check: differs from every row on ≥3 axes (olive-ink bg is new; Red Hat Display/Azeret Mono unused; sodium yellow on dark unused with this pairing; receipt-tape signature unused; "paper feed" print motion unused).

Layout primitive: 5/7 asymmetric split (copy left, console right), ruled rows inside the receipt. Motion: hero lines rise from masks with an overlapping stagger; the receipt feeds out of a slot (translateY + clip) and prints line by line, 90 ms per line, expo-out. Reduced motion: everything static.
