"""Source check: calls each job source once and saves the responses as fixtures.

Run: python3 spikes/source_check/check.py [arbeitnow|arbeitsagentur|feeds]...
Prints a findings summary per source. Fixtures go to spikes/source_check/fixtures/.
"""
import base64
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"
UA = "job-radar-source-check/0.1"

AA_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc"
AA_HEADERS = {"X-API-Key": "jobboerse-jobsuche"}


def get(url, headers=None, params=None):
    """Returns (status, headers, body bytes). HTTP errors are returned, not raised."""
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def get_json(url, headers=None, params=None):
    status, hdrs, body = get(url, headers, params)
    try:
        return status, hdrs, json.loads(body)
    except ValueError:
        return status, hdrs, body[:300].decode("utf-8", "replace")


def save(relpath, data):
    path = FIXTURES / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, bytes):
        path.write_bytes(data)
    else:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def say(*args):
    print(*args, flush=True)


# ---------- Arbeitnow ----------

def arbeitnow_get(url, params=None):
    """GET with backoff on 429. Returns (status, headers, json, retries)."""
    for retries in range(6):
        status, hdrs, data = get_json(url, params=params)
        if status != 429:
            return status, hdrs, data, retries
        say(f"  429 (rate limit), headers {({k: v for k, v in hdrs.items() if k.lower() in ('retry-after', 'x-ratelimit-remaining')})}, waiting 20s")
        time.sleep(20)
    return status, hdrs, data, retries


def check_arbeitnow():
    say("\n=== Arbeitnow ===")
    url = "https://www.arbeitnow.com/api/job-board-api"
    status, hdrs, first, _ = arbeitnow_get(url)
    save("arbeitnow/page_1.json", first)
    say(f"page 1: HTTP {status}, {len(first['data'])} jobs, per_page={first['meta']['per_page']}, last link={first['links']['last']}")
    say("rate limit headers:", {k: v for k, v in hdrs.items() if "ratelimit" in k.lower()})

    # Criteria are ignored if the slug set matches a second unfiltered call (the feed drifts a little per hour)
    time.sleep(1)
    _, _, again, _ = arbeitnow_get(url)
    base = {j["slug"] for j in first["data"]}
    say(f"unfiltered vs unfiltered overlap: {len(base & {j['slug'] for j in again['data']})}/300")
    for params in ({"search": "zzzqqq"}, {"search": "Software"}, {"q": "Software"}, {"location": "Berlin"}, {"remote": "true"}):
        time.sleep(1)
        s, _, d, _ = arbeitnow_get(url, params)
        slugs = {j["slug"] for j in d["data"]}
        say(f"params {params}: HTTP {s}, {len(slugs)} jobs, overlap with unfiltered page 1: {len(base & slugs)}/300")

    # Page through everything
    all_jobs = list(first["data"])
    page = 2
    while page <= 60:
        time.sleep(1.5)
        s, _, d, _ = arbeitnow_get(url, {"page": page})
        if s != 200 or not isinstance(d, dict) or not d["data"]:
            say(f"stopped at page {page}: HTTP {s}, {len(d['data']) if isinstance(d, dict) else 'n/a'} jobs")
            break
        if page == 2:
            save("arbeitnow/page_2.json", d)
        all_jobs.extend(d["data"])
        page += 1
    slugs = [j["slug"] for j in all_jobs]
    say(f"total pages with data: {page - 1}, jobs: {len(all_jobs)}, unique slugs: {len(set(slugs))}")
    created = [j["created_at"] for j in all_jobs]
    say("ordered by created_at desc:", created == sorted(created, reverse=True))
    say("oldest / newest posting:", time.strftime("%Y-%m-%d", time.gmtime(min(created))), "/", time.strftime("%Y-%m-%d", time.gmtime(max(created))))
    say("job fields:", sorted(all_jobs[0].keys()))
    lens = sorted(len(j["description"]) for j in all_jobs)
    say(f"description length chars: min {lens[0]}, median {lens[len(lens)//2]}, max {lens[-1]}")
    german = sum(1 for j in all_jobs if any(w in j["description"].lower() for w in (" und ", " wir ", " die ")))
    say(f"descriptions that look German: {german}/{len(all_jobs)}")


# ---------- Arbeitsagentur ----------

def aa_search(params):
    return get_json(f"{AA_BASE}/v6/jobs", AA_HEADERS, params)


def aa_details(refnr):
    enc = base64.b64encode(refnr.encode()).decode()
    return get_json(f"{AA_BASE}/v4/jobdetails/{enc}", AA_HEADERS)


def aa_all_pages(params, size=100, cap=30):
    """Pages through a search. Returns (postings, calls, maxErgebnisse)."""
    postings, calls, page, total = [], 0, 1, None
    while page <= cap:
        s, _, d = aa_search({**params, "size": size, "page": page})
        calls += 1
        if s != 200 or not isinstance(d, dict):
            say(f"  page {page}: HTTP {s} {str(d)[:150]}")
            break
        total = d.get("maxErgebnisse")
        batch = d.get("ergebnisliste", [])
        if not batch:
            break
        postings.extend(batch)
        if len(postings) >= (total or 0):
            break
        page += 1
        time.sleep(0.3)
    return postings, calls, total


def check_arbeitsagentur():
    say("\n=== Arbeitsagentur ===")
    base = {"was": "Software-Entwickler", "wo": "Köln", "umkreis": 50}

    for size in (100, 200):
        s, _, d = aa_search({**base, "size": size})
        say(f"size={size}: HTTP {s}, returned {len(d.get('ergebnisliste', [])) if isinstance(d, dict) else d}")
    s, _, d = aa_search({**base, "size": 100, "page": 1})
    save("arbeitsagentur/search_page_1.json", d)
    say("search result keys:", sorted(d["ergebnisliste"][0].keys()))
    say("has description in search result:", any("beschreibung" in k.lower() for k in d["ergebnisliste"][0]))

    all_p, calls, total = aa_all_pages(base)
    say(f"full result set: {len(all_p)} postings in {calls} calls (maxErgebnisse={total})")
    save("arbeitsagentur/search_all_koeln.json", all_p)
    refs = [p["referenznummer"] for p in all_p]
    say("unique referenznummer:", len(set(refs)))

    # veroeffentlichtseit: unit and effect
    say("\n-- veroeffentlichtseit")
    for days in (0, 1, 7, 14, 28):
        p, c, t = aa_all_pages({**base, "veroeffentlichtseit": days})
        dates = sorted(x.get("datumErsteVeroeffentlichung", "?") for x in p)
        mods = sorted(x.get("aenderungsdatum", "?")[:10] for x in p)
        say(f"  {days:>3} days: {len(p)} postings (max {t}); first publication {dates[0] if dates else '-'}..{dates[-1] if dates else '-'}; changed {mods[0] if mods else '-'}..{mods[-1] if mods else '-'}")
    s, _, d = aa_search({**base, "size": 5, "veroeffentlichtseit": 365})
    say(f"  365 days: HTTP {s} {'ok' if isinstance(d, dict) and 'ergebnisliste' in d else str(d)[:150]}")

    # Berufsfeld filter: what does it drop?
    say("\n-- berufsfeld filter")
    facet = all_p and aa_search({**base, "size": 1})[2]["facetten"]["berufsfeld"]["counts"]
    say("  berufsfeld facet counts:", facet)
    for field in ("Softwareentwicklung und Programmierung", "Informatik"):
        p, c, t = aa_all_pages({**base, "berufsfeld": field})
        kept = {x["referenznummer"] for x in p}
        say(f"  berufsfeld={field!r}: {len(p)} postings")
        save(f"arbeitsagentur/search_berufsfeld_{field.split()[0].lower()}.json", p)
    it_fields = ["Softwareentwicklung und Programmierung", "Informatik",
                 "IT-Netzwerktechnik, -Administration, -Organisation",
                 "IT-Systemanalyse, -Anwendungsberatung und -Vertrieb"]
    kept = set()
    for field in it_fields:
        p, _, _ = aa_all_pages({**base, "berufsfeld": field})
        kept |= {x["referenznummer"] for x in p}
    dropped = [p for p in all_p if p["referenznummer"] not in kept]
    say(f"  union of 4 IT fields keeps {len(kept)}, filter would drop {len(dropped)} of {len(all_p)}")
    for p in dropped:
        say(f"    dropped: {p['stellenangebotsTitel']!r} | {p.get('firma')} | {p.get('hauptberuf')}")
    save("arbeitsagentur/dropped_by_berufsfeld.json", dropped)

    # Details: do they carry the description?
    say("\n-- details")
    sample = all_p[:10]
    lens = []
    for i, p in enumerate(sample):
        s, _, d = aa_details(p["referenznummer"])
        if s != 200:
            say(f"  {p['referenznummer']}: HTTP {s} {str(d)[:100]}")
            continue
        desc = d.get("stellenangebotsBeschreibung") or ""
        lens.append(len(desc))
        if i < 5:
            save(f"arbeitsagentur/details_{i}.json", d)
        time.sleep(0.3)
    say(f"  description lengths (10 samples): {lens}")
    ext = [p for p in all_p if p.get("externeURL")]
    say(f"  postings with externeURL in search: {len(ext)} of {len(all_p)}")
    if ext:
        s, _, d = aa_details(ext[0]["referenznummer"])
        say(f"  details for an externeURL posting: HTTP {s}, description chars {len(d.get('stellenangebotsBeschreibung') or '') if isinstance(d, dict) else 'n/a'}")
    s, _, d = aa_details(all_p[0]["referenznummer"])
    say("  detail keys:", sorted(d.keys()))

    # Removed posting lookup
    say("\n-- lookup of an unknown / removed refnr")
    for ref in ("99999-0000000000-S", "10001-1002716922-S"):
        s, _, d = aa_details(ref)
        say(f"  {ref}: HTTP {s} {json.dumps(d, ensure_ascii=False)[:200] if not isinstance(d, str) else d}")
        save(f"arbeitsagentur/lookup_removed_{ref}.json", d)
    # Save refnrs for a later re-check of real removals
    snapshot = {"taken_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "refnrs": refs}
    save("arbeitsagentur/snapshot_refnrs.json", snapshot)
    say("  snapshot of refnrs saved, run recheck_removed.py in a few days for a real removal")


# ---------- Career feeds ----------

FEEDS = {
    "personio": [
        ("personio", "https://{slug}.jobs.personio.de/xml"),
        ("orderbird", "https://{slug}.jobs.personio.de/xml"),
        ("mobimeo", "https://{slug}.jobs.personio.de/xml"),
    ],
    "greenhouse": [
        ("stripe", "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"),
        ("airbnb", "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"),
    ],
    "lever": [
        ("spotify", "https://api.lever.co/v0/postings/{slug}?mode=json"),
    ],
    "ashby": [
        ("ashby", "https://api.ashbyhq.com/posting-api/job-board/{slug}"),
    ],
}


def check_feeds():
    say("\n=== Career feeds ===")
    for kind, entries in FEEDS.items():
        for slug, tmpl in entries:
            url = tmpl.format(slug=slug)
            status, hdrs, body = get(url)
            say(f"{kind}/{slug}: HTTP {status}, {len(body)} bytes, content-type {hdrs.get('Content-Type')}")
            if status != 200:
                continue
            if kind == "personio":
                save(f"feeds/{kind}_{slug}.xml", body)
                say("  positions:", body.count(b"<position>"), "| has next/paging element:", b"next" in body.lower()[:2000])
                continue
            data = json.loads(body)
            save(f"feeds/{kind}_{slug}.json", data)
            if kind == "greenhouse":
                say(f"  jobs: {len(data['jobs'])}, meta: {data.get('meta')}, has content: {'content' in data['jobs'][0]}")
                lim = get_json(url + "&per_page=5")[2]
                say(f"  ?per_page=5 -> {len(lim['jobs'])} jobs (so default is the full list)")
            elif kind == "lever":
                say(f"  postings: {len(data)}, keys: {sorted(data[0].keys())}")
                skip = get_json(url + f"&skip={len(data) - 1}")[2]
                say(f"  &skip={len(data) - 1} -> {len(skip)} posting(s)")
                lim = get_json(url + "&limit=5")[2]
                say(f"  &limit=5 -> {len(lim)} postings (so default is the full list)")
            elif kind == "ashby":
                say(f"  jobs: {len(data['jobs'])}, keys: {sorted(data['jobs'][0].keys())}")
            time.sleep(1)


# ---------- SmartRecruiters ----------

SR_BASE = "https://api.smartrecruiters.com/v1/companies"


def check_smartrecruiters():
    say("\n=== SmartRecruiters (BoschGroup) ===")
    url = f"{SR_BASE}/BoschGroup/postings"
    _, _, page = get_json(url, params={"limit": 100, "country": "de"})
    save("smartrecruiters/bosch_de_page_1.json", page)
    say(f"country=de: totalFound {page['totalFound']}, page size {len(page['content'])}, list keys: {sorted(page['content'][0].keys())}")
    say("description in list:", any("jobAd" in p for p in page["content"]))
    _, _, everywhere = get_json(url, params={"limit": 1})
    say("without country filter totalFound:", everywhere["totalFound"])
    for limit in (101, 200):
        _, _, d = get_json(url, params={"limit": limit})
        say(f"limit={limit}: returned {len(d['content'])} (limit field {d['limit']})")
    for params in ({"q": "Software"}, {"q": "zzzqqq"}, {"releasedAfter": "2026-10-18T00:00:00.000Z"}):
        _, _, d = get_json(url, params={"limit": 1, **params})
        say(f"{params}: totalFound {d['totalFound']}")
    _, _, last = get_json(url, params={"limit": 100, "country": "de", "offset": 700})
    say(f"offset=700: {len(last['content'])} postings, totalFound {last['totalFound']}")

    posting_id = page["content"][0]["id"]
    status, _, detail = get_json(f"{url}/{posting_id}")
    save("smartrecruiters/bosch_detail.json", detail)
    say(f"detail: HTTP {status}, sections: {[v.get('title') for v in detail['jobAd']['sections'].values()]}, posting url: {detail.get('postingUrl')}")
    status, _, gone = get_json(f"{url}/123456789")
    say(f"unknown posting id: HTTP {status} {gone.get('code') if isinstance(gone, dict) else gone}")
    for company in ("Continental", "Siemens", "SAP", "nonexistent-xyz"):
        _, _, d = get_json(f"{SR_BASE}/{company}/postings", params={"limit": 1})
        say(f"company {company}: HTTP-200 totalFound {d.get('totalFound')}")


# ---------- Interamt ----------

IA_HEADERS = {"User-Agent": "Mozilla/5.0 (job-radar-source-check)"}


def check_interamt():
    """No API: the site is a session-bound HTML app. Cookies are needed to get past the redirect."""
    import http.cookiejar
    import re
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = list(IA_HEADERS.items())

    def fetch(u):
        with opener.open(u, timeout=60) as r:
            return r.status, r.geturl(), r.read().decode("utf-8", "replace")

    say("\n=== Interamt ===")
    status, final, html_list = fetch("https://interamt.de/koop/app/trefferliste")
    save("interamt/trefferliste.html", html_list.encode())
    say(f"list: HTTP {status} -> {final}")
    say("total:", re.search(r"(\d[\d.]*) Angebote gefunden", html_list).group(0))
    ids = re.findall(r"<span>(\d{6,8})</span>\s*<span class=\"ia-sr-only\">Stellenausschreibung", html_list)
    say(f"rows on first page: {len(ids)}, ids {ids[:3]}...")
    say("RSS/export links:", re.findall(r'href="([^"]*(?:rss|export|feed)[^"]*)"', html_list, flags=re.I))
    status, final, html_detail = fetch(f"https://interamt.de/koop/app/stelle?id={ids[0]}")
    save("interamt/stelle.html", html_detail.encode())
    say(f"detail by id: HTTP {status} -> {final}, {len(html_detail)} bytes")
    status, final, html_gone = fetch("https://interamt.de/koop/app/stelle?id=999999999")
    say(f"unknown id: HTTP {status}, message: {'konnte kein Stellenangebot ermittelt werden' in html_gone}")


CHECKS = {"arbeitnow": check_arbeitnow, "arbeitsagentur": check_arbeitsagentur, "feeds": check_feeds,
          "smartrecruiters": check_smartrecruiters, "interamt": check_interamt}


if __name__ == "__main__":
    for name in sys.argv[1:] or CHECKS:
        CHECKS[name]()
