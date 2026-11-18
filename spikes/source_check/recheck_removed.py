"""Re-checks the refnrs saved by check.py to see how a really removed posting answers a lookup.

Run a few days after check.py: python3 spikes/source_check/recheck_removed.py
"""
import json
import time
from collections import Counter

from check import FIXTURES, aa_all_pages, aa_details, say

snapshot = json.loads((FIXTURES / "arbeitsagentur/snapshot_refnrs.json").read_text())
say(f"snapshot from {snapshot['taken_at']}, {len(snapshot['refnrs'])} refnrs")

current, _, _ = aa_all_pages({"was": "Software-Entwickler", "wo": "Köln", "umkreis": 50})
still_listed = {p["referenznummer"] for p in current}

outcomes = Counter()
for ref in snapshot["refnrs"]:
    if ref in still_listed:
        continue
    status, _, body = aa_details(ref)
    # A posting can also fall out of the search because of ranking, so look at the answer itself
    key = (status, json.dumps(body.get("messages"), ensure_ascii=False) if isinstance(body, dict) and status != 200 else "ok")
    outcomes[key] += 1
    if status == 200:
        say(f"  {ref}: left the search but still answers 200, aenderungsdatum {body.get('aenderungsdatum')}")
    time.sleep(0.3)

say("outcomes for refnrs no longer in the search:")
for (status, detail), n in outcomes.items():
    say(f"  HTTP {status} {detail}: {n}")
