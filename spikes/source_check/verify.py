"""Second pass: re-tests the findings that rested on thin evidence.

Run: python3 spikes/source_check/verify.py [window|aa_paging|berufsfeld|sr]...
"""
import json
import sys
import time
from collections import Counter

from check import FIXTURES, aa_all_pages, aa_search, arbeitnow_get, get, get_json, say, save, SR_BASE

IT_FIELDS = ("Softwareentwicklung und Programmierung", "Informatik",
             "IT-Netzwerktechnik, -Administration, -Organisation",
             "IT-Systemanalyse, -Anwendungsberatung und -Vertrieb")


def verify_window():
    """Arbeitnow: is the list a rolling window by created_at?"""
    say("\n=== Arbeitnow window ===")
    url = "https://www.arbeitnow.com/api/job-board-api"
    jobs, page = [], 1
    while page <= 60:
        s, _, d, _ = arbeitnow_get(url, {"page": page})
        if s != 200 or not d["data"]:
            break
        jobs.extend(d["data"])
        page += 1
        time.sleep(1.5)
    now = time.time()
    created = sorted(j["created_at"] for j in jobs)
    say(f"{len(jobs)} jobs, {page - 1} pages")
    say(f"oldest is {(now - created[0]) / 86400:.2f} days old, newest {(now - created[-1]) / 3600:.1f} hours old")
    per_day = Counter(time.strftime("%Y-%m-%d", time.gmtime(c)) for c in created)
    for day in sorted(per_day):
        say(f"  {day}: {per_day[day]}")
    # Page order: is page N newer than page N+1 on average?
    per_page = [jobs[i:i + 300] for i in range(0, len(jobs), 300)]
    say("median age in days per page:", [round((now - sorted(j['created_at'] for j in p)[len(p) // 2]) / 86400, 1) for p in per_page])
    save("arbeitnow/created_at_snapshot.json", {"taken_at": now, "slugs_by_created": {j["slug"]: j["created_at"] for j in jobs}})


def verify_aa_paging():
    """Arbeitsagentur: are big result sets complete and without duplicates, and what is the depth limit?"""
    say("\n=== Arbeitsagentur paging on a broad search ===")
    params = {"was": "Entwickler"}
    _, _, first = aa_search({**params, "size": 1})
    total = first["maxErgebnisse"]
    say(f"'Entwickler' all of Germany: maxErgebnisse {total}")
    postings, calls, _ = aa_all_pages(params, size=100, cap=200)
    refs = [p["referenznummer"] for p in postings]
    say(f"fetched {len(postings)} postings in {calls} calls, unique {len(set(refs))}, missing vs total: {total - len(set(refs))}")
    _, _, everything = aa_search({"size": 1})
    say(f"no search term at all: maxErgebnisse {everything['maxErgebnisse']}")
    # Depth limit: ask beyond the 10,000th result
    for page in (100, 101, 150):
        s, _, d = aa_search({"size": 100, "page": page})
        say(f"  no term, page {page} (results {page * 100 - 99}..{page * 100}): HTTP {s}, {len(d.get('ergebnisliste', [])) if isinstance(d, dict) else str(d)[:100]}")
    second, _, _ = aa_all_pages(params, size=100, cap=200)
    drift = set(p["referenznummer"] for p in second) ^ set(refs)
    say(f"second full fetch right after: {len(second)} postings, differing refnrs between the two fetches: {len(drift)}")


def verify_berufsfeld():
    """Arbeitsagentur: what does the Berufsfeld filter drop for other searches?"""
    say("\n=== Berufsfeld filter on more searches ===")
    searches = [("Frontend Entwickler", "Berlin", 25), ("Backend Developer", "Hamburg", 50),
                ("Data Engineer", "München", 50), ("Softwareentwickler", None, None)]
    for was, wo, umkreis in searches:
        base = {"was": was, **({"wo": wo, "umkreis": umkreis} if wo else {})}
        allp, _, total = aa_all_pages(base)
        facet = aa_search({**base, "size": 1})[2]["facetten"]["berufsfeld"]["counts"]
        say(f"\n{base}: {len(allp)} postings (max {total}), Berufsfeld facet: {facet}")
        if not wo:
            continue
        kept_single = set()
        top = max(facet, key=facet.get)
        for p in aa_all_pages({**base, "berufsfeld": top})[0]:
            kept_single.add(p["referenznummer"])
        kept_it = set()
        for field in IT_FIELDS:
            if field in facet:
                kept_it |= {p["referenznummer"] for p in aa_all_pages({**base, "berufsfeld": field})[0]}
        say(f"  single top field {top!r} would drop {len(allp) - len(kept_single)}, the IT fields {[f for f in IT_FIELDS if f in facet]} drop {len(allp) - len(kept_it)}")
        for p in allp:
            if p["referenznummer"] not in kept_it:
                say(f"    dropped by IT fields: {p['stellenangebotsTitel']!r} | {p.get('firma')} | {p.get('hauptberuf')}")


def verify_sr():
    """SmartRecruiters: language mix with country=de, slug case sensitivity, ordering."""
    say("\n=== SmartRecruiters ===")
    url = f"{SR_BASE}/BoschGroup/postings"
    langs, ids, offset = Counter(), [], 0
    while True:
        _, _, d = get_json(url, params={"limit": 100, "country": "de", "offset": offset})
        if not d["content"]:
            break
        langs.update(p["language"]["code"] for p in d["content"])
        ids.extend(p["id"] for p in d["content"])
        offset += 100
    say(f"country=de: {len(ids)} postings, unique {len(set(ids))}, languages {dict(langs)}")
    for slug in ("BoschGroup", "boschgroup", "BOSCHGROUP", "Bosch"):
        _, _, d = get_json(f"{SR_BASE}/{slug}/postings", params={"limit": 1})
        say(f"slug {slug!r}: totalFound {d.get('totalFound')}")
    _, _, d = get_json(url, params={"limit": 100, "country": "de"})
    dates = [p["releasedDate"] for p in d["content"]]
    say("first page ordered by releasedDate desc:", dates == sorted(dates, reverse=True))
    say("location.country values on the de page:", Counter(p["location"]["country"] for p in d["content"]))


def verify_window_recheck(wait_minutes=10):
    """Run after verify_window: do the oldest postings leave the list while their page is still online?"""
    snap = json.loads((FIXTURES / "arbeitnow/created_at_snapshot.json").read_text())
    say(f"\n=== Arbeitnow window recheck, waiting {wait_minutes} min ===")
    time.sleep(wait_minutes * 60)
    url = "https://www.arbeitnow.com/api/job-board-api"
    slugs, page = {}, 1
    while page <= 60:
        s, _, d, _ = arbeitnow_get(url, {"page": page})
        if s != 200 or not d["data"]:
            break
        slugs.update({j["slug"]: j for j in d["data"]})
        page += 1
        time.sleep(1.5)
    old = snap["slugs_by_created"]
    gone = {k: v for k, v in old.items() if k not in slugs}
    say(f"{len(old)} in snapshot, {len(slugs)} now, {len(gone)} left the list")
    ages = sorted(snap["taken_at"] - v for v in gone.values())
    if gone:
        say(f"age of the ones that left, at snapshot time: {ages[0] / 86400:.3f}..{ages[-1] / 86400:.3f} days")
    for slug in list(gone)[:8]:
        status, _, _ = get(f"https://www.arbeitnow.com/jobs/companies/x/{slug}")
        say(f"  {slug}: page {'online' if status == 200 else status}")


CHECKS = {"window_recheck": verify_window_recheck, "window": verify_window, "aa_paging": verify_aa_paging, "berufsfeld": verify_berufsfeld, "sr": verify_sr}

if __name__ == "__main__":
    for name in sys.argv[1:] or CHECKS:
        CHECKS[name]()
