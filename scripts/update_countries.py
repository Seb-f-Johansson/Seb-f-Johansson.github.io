#!/usr/bin/env python3
"""Refresh data/countries.json: employment by AI-exposure group in Sweden, the EU and the US,
with the same group cut-offs as the Norwegian page.

Sources (all open, standard library only):
  Sweden  SCB occupational register, employees 16-64 by SSYK 2012 4-digit and age, annual
          (YREG51N 2019-2021 and YREG51BAS 2020-2024, chained at 2020).
  EU      Eurostat LFS lfsa_egai2d, employed persons 15-64 by ISCO-08 2-digit, annual,
          EU-27 and each country.
  US      Census Bureau CPS basic monthly public-use files, wage and salary employees 16+ by
          Census occupation code and age. Monthly cells are cached in data/us_cps_months.json,
          so a run only downloads months it has not seen.

Groups: a score is put in the group whose Norwegian range it falls in (cut-offs = the highest
score in each Norwegian fifth, by complementarity and by DAIOE 2025). EU two-digit occupations
take the group of the same two-digit occupation on the Norwegian page (table 14160 panel).
"""
from __future__ import annotations

import bisect
import gzip
import io
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "countries.json"
CPS_CACHE = DATA / "us_cps_months.json"
SCB = "https://api.scb.se/OV0104/v1/doris/en/ssd/AM/AM0208/AM0208E/"
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lfsa_egai2d"
CPS = "https://www2.census.gov/programs-surveys/cps/datasets/{y}/basic/{m}{yy}pub.dat{gz}"
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
AGES = ["all", "-24", "25-29", "30-44", "45-54", "55-64", "65+"]
AGE_LABEL = {"all": "All ages", "-24": "Under 25", "25-29": "25-29", "30-44": "30-44", "45-54": "45-54",
             "55-64": "55-64", "65+": "65 and over"}
MEASURES = ["comp", "daioe"]


def get(url, body=None, tries=4, raw=False):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "User-Agent": "ai-jobs-page"})
            with urllib.request.urlopen(req, timeout=300) as r:
                b = r.read()
                return b if raw else json.loads(b.decode("utf-8-sig"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if i == tries - 1:
                raise
        except Exception:  # noqa: BLE001
            if i == tries - 1:
                raise
        time.sleep(5 * (i + 1))


def jsonstat_cells(d):
    ids, size = d["id"], d["size"]
    cats = [sorted(d["dimension"][k]["category"]["index"], key=d["dimension"][k]["category"]["index"].get) for k in ids]
    vals = d["value"]
    items = vals.items() if isinstance(vals, dict) else enumerate(vals)
    for flat, v in items:
        flat = int(flat)
        rem, pos = flat, []
        for s in reversed(size):
            pos.append(rem % s); rem //= s
        pos = pos[::-1]
        yield {k: cats[j][pos[j]] for j, k in enumerate(ids)}, v


# ------------------------------------------------------------------ helpers shared by countries
def avg_window(s, periods, end, w):
    i = periods.index(end)
    xs = [s.get(p) for p in periods[max(0, i - w + 1): i + 1]]
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if len(xs) >= max(1, w - 1) else None   # tolerate one missing month


def pack(s, periods, base, pre_from, last, w, per_year):
    ma = [avg_window(s, periods, p, w) if i >= w - 1 else None for i, p in enumerate(periods)]
    b = ma[periods.index(base)]
    def gr(p0, p1):
        a, c = avg_window(s, periods, p0, w), avg_window(s, periods, p1, w)
        yrs = (periods.index(p1) - periods.index(p0)) / per_year
        return None if not a or not c or yrs <= 0 else round(100 * ((c / a) ** (1 / yrs) - 1), 2)
    e = ma[periods.index(last)]
    return {"index": [None if m is None or not b else round(100 * m / b, 2) for m in ma],
            "pre": gr(pre_from, base) if pre_from in periods else None, "post": gr(base, last),
            "change": None if not b or not e else round(100 * (e / b - 1), 2)}


def summarise(cells, group_of, periods, ages, base, pre_from, last, w, per_year):
    """cells: {(code, age, period): value}. Returns groups/all blocks."""
    codes = sorted({c for c, _, _ in cells})
    scored = {m: [c for c in codes if group_of[m].get(c)] for m in MEASURES}
    def ser(cs, age):
        out = {}
        for p in periods:
            vals = [cells.get((c, age, p)) for c in cs]
            vals = [v for v in vals if v is not None]
            if vals:
                out[p] = float(sum(vals))
        return out
    res = {"groups": {}, "all": {}}
    allc = sorted(set(scored["comp"]) | set(scored["daioe"]))
    res["all"] = {a: pack(ser(allc, a), periods, base, pre_from, last, w, per_year) for a in ages}
    for m in MEASURES:
        res["groups"][m] = []
        for g in range(1, 6):
            cs = [c for c in scored[m] if group_of[m][c] == g]
            res["groups"][m].append({"group": g, "n_occ": len(cs),
                                     "emp": {a: pack(ser(cs, a), periods, base, pre_from, last, w, per_year) for a in ages}})
    tot = sum(cells.get((c, "all", base), 0) or 0 for c in codes)
    cov = sum(cells.get((c, "all", base), 0) or 0 for c in allc)
    res["coverage"] = round(cov / tot, 4) if tot else None
    return res


# ------------------------------------------------------------------ Sweden
def sweden(scores, cut):
    meta = get(SCB + "YREG51BAS")
    occ = [v for v in meta["variables"] if v["code"] == "Yrke2012"][0]["values"]
    ages = ["16-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64"]
    amap = {"16-24": "-24", "25-29": "25-29", "30-34": "30-44", "35-39": "30-44", "40-44": "30-44",
            "45-49": "45-54", "50-54": "45-54", "55-59": "55-64", "60-64": "55-64"}
    raw = {}
    for t in ["YREG51N", "YREG51BAS"]:
        q = {"query": [{"code": "Yrke2012", "selection": {"filter": "item", "values": occ}},
                       {"code": "Alder", "selection": {"filter": "item", "values": ages}}],
             "response": {"format": "json-stat2"}}
        d = get(SCB + t, q)
        for k, v in jsonstat_cells(d):
            if v is None:
                continue
            key = (t, k["Yrke2012"], amap[k["Alder"]], k["Tid"])
            raw[key] = raw.get(key, 0) + v
    years = sorted({p for (_, _, _, p) in raw})
    # Occupation coding in the register improved over time (the 'occupations unidentifiable' code
    # 0002 shrinks by about 230,000 from 2020 to 2024), which would make every coded occupation
    # grow. Within each table, year and age group, coded counts are scaled up so that they sum to
    # all employees, i.e. the unidentified are spread in proportion to the coded occupations.
    for t in ["YREG51N", "YREG51BAS"]:
        for a in set(amap.values()):
            for y in years:
                unk = raw.pop((t, "0002", a, y), None)
                if unk is None:
                    continue
                coded = sum(v for (tt, c, aa, yy), v in raw.items() if tt == t and aa == a and yy == y)
                if coded:
                    f = (coded + unk) / coded
                    for k in [k for k in raw if k[0] == t and k[2] == a and k[3] == y]:
                        raw[k] *= f
    cells = {}
    codes = sorted({c for (_, c, _, _) in raw})
    for c in codes:
        for a in set(amap.values()):
            for y in years:
                if y >= "2020":
                    v = raw.get(("YREG51BAS", c, a, y))
                else:   # 2019 from YREG51N, scaled by the occupation-age ratio of the two series in 2020
                    n19, n20, b20 = raw.get(("YREG51N", c, a, y)), raw.get(("YREG51N", c, a, "2020")), raw.get(("YREG51BAS", c, a, "2020"))
                    v = None if n19 is None else (n19 * b20 / n20 if n20 and b20 else n19)
                if v is not None:
                    cells[(c, a, y)] = v
                    cells[(c, "all", y)] = cells.get((c, "all", y), 0) + v
    group_of = {m: {c: assign(scores.get(c), m, cut) for c in codes} for m in MEASURES}
    last = years[-1]
    res = summarise(cells, group_of, years, ["all", "-24", "25-29", "30-44", "45-54", "55-64"], "2022", "2019", last, 1, 1)
    res.update({"label": "Sweden", "freq": "annual", "periods": years, "base": "2022", "pre_from": "2019", "last": last,
                "unit": "employees 16-64", "detail": "4-digit SSYK 2012",
                "note": "Employees with an unidentified occupation are spread across occupations in proportion to the coded ones.",
                "source": "SCB occupational register (YREG51N, YREG51BAS), employees 16-64",
                "ages": [{"code": a, "label": AGE_LABEL[a]} for a in ["all", "-24", "25-29", "30-44", "45-54", "55-64"]]})
    return res


# ------------------------------------------------------------------ EU (Eurostat LFS)
def eu(group2):
    d = get(EUROSTAT + "?lang=EN&sex=T&age=Y15-64&unit=THS_PER")
    lab = d["dimension"]["geo"]["category"]["label"]
    by_geo = {}
    for k, v in jsonstat_cells(d):
        isco = k["isco08"]
        if v is None or not re.fullmatch(r"OC\d\d", isco):
            continue
        by_geo.setdefault(k["geo"], {})[(isco[2:], "all", k["time"])] = float(v)
    years = sorted({k[2] for g in by_geo.values() for k in g})
    last = years[-1]
    out = {"label": "European Union", "freq": "annual", "periods": years, "base": "2022", "pre_from": "2018", "last": last,
           "unit": "employed persons 15-64 (thousands)", "detail": "2-digit ISCO-08",
           "source": "Eurostat, EU Labour Force Survey (lfsa_egai2d), employed persons 15-64",
           "ages": [{"code": "all", "label": "15-64"}], "geos": {}}
    order = ["EU27_2020"] + sorted(g for g in by_geo if g != "EU27_2020" and not g.startswith("EA") and not g.startswith("EU"))
    for g in order:
        cells = by_geo.get(g)
        if not cells or not any(p == "2022" for (_, _, p) in cells):
            continue
        group_of = {m: {c: group2[m].get(c) for c in {c for c, _, _ in cells}} for m in MEASURES}
        r = summarise(cells, group_of, years, ["all"], "2022", "2018", last, 1, 1)
        r["label"] = lab.get(g, g).replace("European Union - 27 countries (from 2020)", "EU-27")
        out["geos"][g] = r
    return out


# ------------------------------------------------------------------ US (CPS)
def cps_parse(blob, gz):
    if blob[:2] == b"PK":   # some months are served as zip archives
        import zipfile
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            data = z.read(z.namelist()[0])
    elif blob[:2] == b"\x1f\x8b":
        data = gzip.decompress(blob)
    else:
        data = blob
    cells = {}
    for line in io.BytesIO(data):
        if len(line) < 863:
            continue
        try:
            age = int(line[121:123]); lfs = int(line[179:181]); cow = int(line[431:433])
            w = int(line[845:855]) / 10000.0; occ = line[859:863].decode().strip()
        except ValueError:
            continue
        if lfs not in (1, 2) or cow not in (1, 2, 3, 4, 5) or age < 16 or w <= 0 or not occ.isdigit():
            continue
        a = "-24" if age < 25 else "25-29" if age < 30 else "30-44" if age < 45 else "45-54" if age < 55 else "55-64" if age < 65 else "65+"
        c = cells.setdefault(occ, [0.0] * 7)
        c[0] += w; c[AGES.index(a)] += w
    return {k: [round(x, 1) for x in v] for k, v in cells.items()}


def us(scores10, scores18, walk, cut, first_year=2017):
    cache = json.loads(CPS_CACHE.read_text(encoding="utf-8")) if CPS_CACHE.exists() else {}
    now = time.gmtime()
    for y in range(first_year, now.tm_year + 1):
        for mi, m in enumerate(MONTHS):
            key = f"{y}-{mi + 1:02d}"
            if key in cache or (y == now.tm_year and mi + 1 > now.tm_mon):
                continue
            local = Path(os.environ.get("CPS_LOCAL", "/nonexistent"))
            f = local / f"{m}{str(y)[2:]}pub.dat.gz"
            if f.exists():
                blob, gz = f.read_bytes(), True
            else:
                blob, gz = get(CPS.format(y=y, m=m, yy=str(y)[2:], gz=".gz"), raw=True), True
            if blob is None:
                blob, gz = get(CPS.format(y=y, m=m, yy=str(y)[2:], gz=""), raw=True), False
            if blob is None:
                continue
            cache[key] = {"codes": "2010" if y <= 2019 else "2018", "cells": cps_parse(blob, gz)}
            print("CPS", key, len(cache[key]["cells"]), file=sys.stderr)
    CPS_CACHE.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")
    months = sorted(cache)
    # every month lists the gap months too (e.g. October 2025, not collected)
    allm, y, mth = [], int(months[0][:4]), int(months[0][5:])
    while f"{y}-{mth:02d}" <= months[-1]:
        allm.append(f"{y}-{mth:02d}"); mth += 1
        if mth == 13:
            y, mth = y + 1, 1
    # Harmonise to 2018 Census codes: months before 2020 use 2010 codes. A 2010 code that maps to
    # several 2018 codes is split in proportion to those codes' employment in 2020 (first year on
    # the new codes); merges are summed. Unmapped 2010 codes keep their own 2010-based score.
    w20 = {}
    for p in months:
        if p.startswith("2020-"):
            for occ, v in cache[p]["cells"].items():
                w20[occ.zfill(4)] = w20.get(occ.zfill(4), 0) + v[0]
    cells, group_of = {}, {m: {} for m in MEASURES}
    def add(code, p, v, share=1.0):
        for a, x in zip(AGES, v):
            cells[(code, a, p)] = cells.get((code, a, p), 0) + x * share
    for p in months:
        for occ, v in cache[p]["cells"].items():
            o = occ.zfill(4)
            if cache[p]["codes"] == "2018":
                add("2018:" + o, p, v)
                continue
            tg = walk.get(o)
            if not tg:
                add("2010:" + o, p, v)
                continue
            tot = sum(w20.get(t, 0) for t in tg)
            for t in tg:
                add("2018:" + t, p, v, (w20.get(t, 0) / tot) if tot else 1 / len(tg))
    for code in {c for c, _, _ in cells}:
        cs_, o = code.split(":")
        sc = scores18 if cs_ == "2018" else scores10
        for m in MEASURES:
            group_of[m][code] = assign(sc.get(o), m, cut)
    res = summarise(cells, group_of, allm, AGES, "2022-10", "2018-10", months[-1], 12, 12)
    res.update({"label": "United States", "freq": "monthly", "periods": allm, "base": "2022-10", "pre_from": "2018-10",
                "last": months[-1], "unit": "wage and salary employees 16+", "detail": "Census occupation codes (≈ SOC 6-digit), 2010 codes before 2020 mapped to 2018 codes",
                "source": "U.S. Census Bureau, Current Population Survey basic monthly public-use files, composite weights",
                "missing": [p for p in allm if p not in cache],
                "ages": [{"code": a, "label": AGE_LABEL[a]} for a in AGES]})
    return res


# ------------------------------------------------------------------ groups
def assign(score_pair, m, cut):
    if not score_pair:
        return None
    s = score_pair[0] if m == "comp" else score_pair[1]
    if s is None:
        return None
    return bisect.bisect_left(cut[m], s) + 1


def main():
    jobs = json.loads((DATA / "ai_jobs.json").read_text(encoding="utf-8"))
    exp = json.loads((DATA / "exposure_scores.json").read_text(encoding="utf-8"))
    cs = json.loads((DATA / "country_scores.json").read_text(encoding="utf-8"))
    fy = exp["years"].index(exp["frontier_year"])
    sc = {r[0]: (r[2], r[3][fy]) for r in exp["rows"]}
    # cut-offs: highest score in each of the first four Norwegian fifths
    cut = {}
    for m, gk in [("comp", "g"), ("daioe", "gd")]:
        mx = {}
        for c, o in jobs["occ"].items():
            if c in sc:
                v = sc[c][0] if m == "comp" else sc[c][1]
                mx[o[gk]] = max(mx.get(o[gk], -1e9), v)
        cut[m] = [mx[g] for g in range(1, 5)]
    group2 = {"comp": {t: o["g"] for t, o in jobs["age_detail"]["occ"].items()},
              "daioe": {t: o["gd"] for t, o in jobs["age_detail"]["occ"].items()}}
    out = {"built": time.strftime("%Y-%m-%d"), "cutoffs": {m: [round(x, 4) for x in v] for m, v in cut.items()},
           "countries": {}}
    for name, fn in [("SE", lambda: sweden(cs["ssyk2012"], cut)), ("EU", lambda: eu(group2)),
                     ("US", lambda: us(cs["census2010"], cs["census2018"], cs["census2010_to_2018"], cut))]:
        try:
            out["countries"][name] = fn()
        except Exception as e:  # noqa: BLE001  keep the previous data for a country whose source fails
            print(f"{name} failed: {e}", file=sys.stderr)
            if OUT.exists():
                prev = json.loads(OUT.read_text(encoding="utf-8")).get("countries", {}).get(name)
                if prev:
                    out["countries"][name] = prev
    new = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    old = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    strip = lambda s: (lambda d: (d.pop("built", None), d)[1])(json.loads(s)) if s else None  # noqa: E731
    if strip(old) == strip(new):
        print("countries: no change")
        return
    OUT.write_text(new, encoding="utf-8")
    print("wrote countries.json:", {k: v.get("last") for k, v in out["countries"].items()})


if __name__ == "__main__":
    main()
