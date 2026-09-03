#!/usr/bin/env python3
"""Hamta TimeEdit-floden, arkivera dem och bygg om appen.

TimeEdit levererar bara pass fran och med idag, sa en vanlig prenumeration i
Google Calendar tappar allt som redan varit. Darfor haller vi ett eget arkiv i
calendar.ics: passerade pass sparas for alltid, medan framtida pass alltid
speglar det som ligger i floden just nu (sa avhopp/avbokningar forsvinner).

Kor:  ./sync.py            hamta om allt, uppdatera arkiv + index.html
      ./sync.py --no-fetch anvand redan nedladdade schemaN.ics
"""
import hashlib
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))

FEEDS = [
    ("Kursschema", "https://cloud.timeedit.net/uu/web/studschema/s.ics?i=6Y6X94Q4wZQ1Qf5X090375y8Y8bZ69XeXuY8ZQ467648951490644873998827894Q23Z0540XX1880624nX4887"),
    ("Industriell ekonomi", "https://cloud.timeedit.net/uu/web/studschema/s.ics?i=6Y7X91Q4wZQ3Qf7Z040655y8YQbZ0n6e0uY7ZQ36"),
]

# Vad som publiceras. Layouten pa hostingen styrs harifran:
#   MERGED = ("Namn", "fil.ics")  -> alla floden i en enda kalender (None = hoppa over)
#   SPLIT  = True                 -> dessutom en kalender per flode i FEEDS
MERGED = ("Mitt schema", "schema.ics")
SPLIT = True
PUBDIR = os.path.join(HERE, "cal")

UID_DOMAIN = "timeedit-arkiv"
# Ett pass raknas som "passerat" nagra timmar efter sin sluttid, sa smaskillnader
# i klockor aldrig kan radera nagot ur arkivet.
GRACE = timedelta(hours=6)


# ---------------------------------------------------------------- ICS-parsning
def unfold(text):
    """Slå ihop ICS-radbrytningar till logiska rader."""
    lines = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def fold(line):
    """Bryt en logisk rad pa 74 oktetter, aldrig midt i ett UTF-8-tecken."""
    data = line.encode("utf-8")
    if len(data) <= 74:
        return [line]
    out, first = [], True
    while data:
        limit = 74 if first else 73
        cut = min(limit, len(data))
        while cut > 0 and cut < len(data) and (data[cut] & 0xC0) == 0x80:
            cut -= 1
        chunk = data[:cut].decode("utf-8")
        out.append(chunk if first else " " + chunk)
        data = data[cut:]
        first = False
    return out


def prop(line):
    """Dela 'NAMN;PARAM=x:varde' i (NAMN, params, varde)."""
    i = 0
    quoted = False
    while i < len(line):
        c = line[i]
        if c == '"':
            quoted = not quoted
        elif c == ":" and not quoted:
            break
        i += 1
    head, value = line[:i], line[i + 1:]
    name, _, params = head.partition(";")
    return name.upper(), params.upper(), value


def parse_dt(params, value):
    """Returnera (normaliserad strang, datetime i UTC, heldag?)."""
    v = value.strip()
    if "VALUE=DATE" in params or re.fullmatch(r"\d{8}", v):
        d = datetime.strptime(v[:8], "%Y%m%d").replace(tzinfo=timezone.utc)
        return v[:8], d, True
    m = re.fullmatch(r"(\d{8})T(\d{6})(Z?)", v)
    if not m:
        return v, None, False
    d = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
    # Utan Z ar tiden lokal (TimeEdit skickar alltid Z) - anta Europe/Stockholm-ish
    # genom att behandla den som UTC; det paverkar bara grace-fonstret.
    return v, d.replace(tzinfo=timezone.utc), False


def events(text):
    """Plocka ut VEVENT-block som (uid, logiska rader)."""
    out, cur = [], None
    for line in unfold(text):
        if line == "BEGIN:VEVENT":
            cur = []
            continue
        if line == "END:VEVENT":
            if cur:
                out.append(cur)
            cur = None
            continue
        if cur is not None and line.strip():
            cur.append(line)
    return out


def describe(lines):
    """(nyckel, start-datetime, rader-med-kanoniskt-uid) for ett VEVENT."""
    uid = start_raw = ""
    start_dt = None
    all_day = False
    for line in lines:
        name, params, value = prop(line)
        if name == "UID":
            uid = value.strip()
        elif name == "DTSTART":
            start_raw, start_dt, all_day = parse_dt(params, value)
        elif name == "DTEND":
            _, end_dt, _ = parse_dt(params, value)
            if end_dt:
                all_day = all_day or False
    if not uid or not start_raw:
        return None
    if uid.endswith("@" + UID_DOMAIN):
        key = uid                      # kommer redan ur vart eget arkiv
    else:
        digest = hashlib.sha1(f"{uid}|{start_raw}".encode()).hexdigest()[:24]
        key = f"{digest}@{UID_DOMAIN}"
    if all_day and start_dt:
        start_dt = start_dt + timedelta(days=1)   # heldag "slutar" dagen efter
    fixed = [f"UID:{key}" if prop(l)[0] == "UID" else l for l in lines]
    return key, start_dt, fixed


def unchanged(a, b):
    """Samma pass sa nar som pa tidsstamplar som TimeEdit satter vid hamtning?"""
    strip = lambda ls: [l for l in ls if prop(l)[0] not in ("DTSTAMP", "LAST-MODIFIED")]
    return strip(a) == strip(b)


def end_of(lines, start_dt):
    for line in lines:
        name, params, value = prop(line)
        if name == "DTEND":
            _, dt, _ = parse_dt(params, value)
            if dt:
                return dt
    return start_dt


# ---------------------------------------------------------------- hamta/skriv
def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "schema-app/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def write_calendar(path, calname, records):
    out = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//schema-app//TimeEdit-arkiv//SV",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{calname}",
        "X-WR-TIMEZONE:Europe/Stockholm",
        "X-PUBLISHED-TTL:PT2H",
        "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    ]
    for _, start, lines in records:
        out.append("BEGIN:VEVENT")
        for line in lines:
            out.extend(fold(line))
        out.append("END:VEVENT")
    out.append("END:VCALENDAR")
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write("\r\n".join(out) + "\r\n")


# ---------------------------------------------------------------- huvudflode
def slug(name):
    s = name.lower()
    for a, b in (("å", "a"), ("ä", "a"), ("ö", "o"), ("é", "e")):
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "kalender"


def build(path, calname, feeds, now):
    """Sla ihop floden med det som redan ligger i path och skriv om filen."""
    archived = {}
    if os.path.exists(path):
        for lines in events(open(path, encoding="utf-8").read()):
            got = describe(lines)
            if got:
                archived[got[0]] = got

    live = {}
    for feed in feeds:
        for lines in events(feed["ics"]):
            got = describe(lines)
            if got:
                live.setdefault(got[0], got)

    merged = dict(live)
    kept = dropped = 0
    for key, rec in archived.items():
        if key in live:
            if unchanged(rec[2], live[key][2]):
                merged[key] = rec
            continue
        if end_of(rec[2], rec[1]) < now - GRACE:
            merged[key] = rec        # passerat: spara for alltid
            kept += 1
        else:
            dropped += 1             # framtida men borta ur floden: avbokat

    records = sorted(merged.values(), key=lambda r: (r[1] or now, r[0]))
    write_calendar(path, calname, records)
    print(f"  {os.path.relpath(path, HERE)}: {len(records)} pass "
          f"({len(live)} ur floden, {kept} arkiverade, {dropped} avbokade togs bort)")


def main():
    fetching = "--no-fetch" not in sys.argv
    now = datetime.now(timezone.utc)

    feeds = []
    for i, (name, url) in enumerate(FEEDS, 1):
        path = os.path.join(HERE, f"schema{i}.ics")
        if fetching:
            text = fetch(url)
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(text)
        else:
            text = open(path, encoding="utf-8").read()
        print(f"  {name}: {text.count('BEGIN:VEVENT')} pass -> {os.path.basename(path)}")
        feeds.append({"name": name, "ics": text})

    os.makedirs(PUBDIR, exist_ok=True)
    if MERGED:
        build(os.path.join(PUBDIR, MERGED[1]), MERGED[0], feeds, now)
    if SPLIT:
        for feed in feeds:
            build(os.path.join(PUBDIR, slug(feed["name"]) + ".ics"), feed["name"], [feed], now)

    # Bygg om appen med samma data som tidigare
    tpl = open(os.path.join(HERE, "index.template.html"), encoding="utf-8").read()
    with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as f:
        f.write(tpl.replace("__FEEDS__", json.dumps(feeds, ensure_ascii=False)))
    print("Klart.")


if __name__ == "__main__":
    main()
