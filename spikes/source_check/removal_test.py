"""Finds postings that really left an Arbeitsagentur search and looks at how the lookup answers.

  python3 spikes/source_check/removal_test.py snapshot   saves the refnrs of a broad search
  python3 spikes/source_check/removal_test.py check      a day or more later: looks up the ones that left the search

A 404 is a removal, a 200 is a posting that only fell out of the paging (the list shifts while paging).
The search is capped at 40 pages of 100 so the whole result set of ~3,500 is fetched.
"""
import json
import sys
import time
from collections import Counter

from check import FIXTURES, aa_all_pages, aa_details, say, save

PARAMS = {"was": "Entwickler"}
SNAPSHOT = "arbeitsagentur/snapshot_broad.json"


def fetch():
    postings, calls, total = aa_all_pages(PARAMS, size=100, cap=40)
    refs = {p["referenznummer"] for p in postings}
    say(f"fetched {len(postings)} rows, {len(refs)} unique (max {total}) in {calls} calls")
    return refs


if sys.argv[1:] == ["snapshot"]:
    save(SNAPSHOT, {"taken_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "params": PARAMS, "refnrs": sorted(fetch())})
elif sys.argv[1:] == ["check"]:
    snapshot = json.loads((FIXTURES / SNAPSHOT).read_text())
    say(f"snapshot from {snapshot['taken_at']}, {len(snapshot['refnrs'])} refnrs")
    missing = sorted(set(snapshot["refnrs"]) - fetch())
    say(f"{len(missing)} refnrs no longer in the search")
    outcomes = Counter()
    for ref in missing:
        status, _, body = aa_details(ref)
        outcomes[status] += 1
        if status != 200:
            say(f"  {ref}: HTTP {status} {json.dumps(body, ensure_ascii=False)[:200]}")
            save(f"arbeitsagentur/lookup_really_removed_{ref}.json", body)
        time.sleep(0.3)
    say("lookup status of the ones that left the search:", dict(outcomes))
else:
    sys.exit(__doc__)
