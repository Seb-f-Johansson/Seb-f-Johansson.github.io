#!/usr/bin/env python3
"""Refresh data/ai_jobs.json from Statistics Norway (SSB) table 11658 and the exposure scores.

Run by .github/workflows/update-ai-jobs.yml every week; it only commits when SSB has published
something new. Standard library only, so the workflow needs no installs.

SSB table 11658: employees (lonnstakere), jobs and monthly earnings by 4-digit STYRK-08
occupation, sex and age, quarterly from 2016Q1 (a-ordningen, full count). STYRK-08 equals
ISCO-08 at four digits, so occupations merge on the code.

Everything here is descriptive. Occupations are grouped as in the paper: high or low AI
exposure relative to the unweighted median of 2024 DAIOE across occupations, high or low task
complementarity relative to the unweighted median of the complementarity index, and the four
exposure-complementarity quadrants. Groups do not change when new quarters arrive.
"""
from __future__ import annotations

import json
import math
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCORES = ROOT / "data" / "exposure_scores.json"
PROFILES = ROOT / "data" / "skill_profiles.json"
API_DETAIL = "https://data.ssb.no/api/pxwebapi/v2/tables/14160"
AGES_DETAIL = ["999A", "-24", "25-29", "30-44", "45-54", "55-64", "65+"]
AGE_DETAIL_LABEL = {"999A": "All ages", "-24": "Under 25", "25-29": "25-29", "30-44": "30-44",
                    "45-54": "45-54", "55-64": "55-64", "65+": "65 and over"}
OUT = ROOT / "data" / "ai_jobs.json"
API = "https://data.ssb.no/api/pxwebapi/v2/tables/11658"
AGES = ["999D", "0-39", "40-54", "55+"]
AGE_LABEL = {"999D": "All ages", "0-39": "Under 40", "40-54": "40-54", "55+": "55 and over"}
BASE_Q = "2022K3"           # last full quarter before ChatGPT (released 30 November 2022)
WEIGHT_YEAR = "2022"        # employment weights for groups and averages


def get(url: str, body: dict | None = None, tries: int = 4) -> dict:
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "User-Agent": "ai-jobs-page"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))
            print("retry", e, file=sys.stderr)
    raise RuntimeError


def fetch() -> tuple[dict, list[str], str, dict]:
    meta = get(f"{API}/metadata?lang=en")
    dims = meta["dimension"]
    occ = [c for c in dims["Yrke"]["category"]["index"] if len(c) == 4 and c.isdigit() and c != "0000"]
    labels = dims["Yrke"]["category"]["label"]
    quarters = sorted(dims["Tid"]["category"]["index"], key=lambda k: dims["Tid"]["category"]["index"][k])
    values: dict = {}
    for content in ["Lonsstakere", "MedianMndLonn"]:
        for start in range(0, len(occ), 150):
            chunk = occ[start:start + 150] + (["0-9"] if start == 0 else [])
            body = {"selection": [
                {"variableCode": "Kjonn", "valueCodes": ["0"]},
                {"variableCode": "Alder", "valueCodes": AGES if content == "Lonsstakere" else ["999D"]},
                {"variableCode": "Yrke", "valueCodes": chunk},
                {"variableCode": "ContentsCode", "valueCodes": [content]},
                {"variableCode": "Tid", "valueCodes": quarters}]}
            d = get(f"{API}/data?lang=en&outputFormat=json-stat2", body)
            ids, size = d["id"], d["size"]
            cats = [sorted(d["dimension"][k]["category"]["index"], key=d["dimension"][k]["category"]["index"].get) for k in ids]
            vals = d["value"]
            for flat, v in enumerate(vals):
                rem, pos = flat, []
                for s in reversed(size):
                    pos.append(rem % s); rem //= s
                pos = pos[::-1]
                key = {k: cats[j][pos[j]] for j, k in enumerate(ids)}
                values[(content, key["Alder"], key["Yrke"], key["Tid"])] = v
            time.sleep(1)
    return values, quarters, meta.get("updated", ""), labels


def fetch_detail() -> tuple[dict, list[str], str, dict]:
    """SSB table 14160: employees by 2-digit occupation and seven age groups, quarterly from 2021Q1."""
    meta = get(f"{API_DETAIL}/metadata?lang=en")
    dims = meta["dimension"]
    occ2 = [c for c in dims["Yrke"]["category"]["index"] if len(c) == 2 and c.isdigit() and c != "00"]
    quarters = sorted(dims["Tid"]["category"]["index"], key=lambda k: dims["Tid"]["category"]["index"][k])
    body = {"selection": [
        {"variableCode": "Region", "valueCodes": ["Ialt"]}, {"variableCode": "Sektor", "valueCodes": ["ALLE"]},
        {"variableCode": "Kjonn", "valueCodes": ["0"]}, {"variableCode": "Alder", "valueCodes": AGES_DETAIL},
        {"variableCode": "Ansettelsesforhold", "valueCodes": ["0"]}, {"variableCode": "Yrke", "valueCodes": occ2 + ["0-9"]},
        {"variableCode": "HeltidDeltid", "valueCodes": ["H+D"]}, {"variableCode": "ContentsCode", "valueCodes": ["Lonsstakere"]},
        {"variableCode": "Tid", "valueCodes": quarters}]}
    d = get(f"{API_DETAIL}/data?lang=en&outputFormat=json-stat2", body)
    ids, size = d["id"], d["size"]
    cats = [sorted(d["dimension"][k]["category"]["index"], key=d["dimension"][k]["category"]["index"].get) for k in ids]
    values = {}
    for flat, v in enumerate(d["value"]):
        rem, pos = flat, []
        for sz in reversed(size):
            pos.append(rem % sz); rem //= sz
        pos = pos[::-1]
        key = {k: cats[j][pos[j]] for j, k in enumerate(ids)}
        values[(key["Alder"], key["Yrke"], key["Tid"])] = v
    return values, quarters, meta.get("updated", ""), dims["Yrke"]["category"]["label"]


QUAD_YEAR = 2024            # the paper classifies occupations with 2024 DAIOE
MEASURES = ["quad", "comp", "cdaioe"]
NGROUPS = {"quad": 4, "comp": 2, "cdaioe": 2}


def group_of(daioe, comp, cdaioe, md, mc, mcd):
    """quad: the paper's quadrants (2024 DAIOE x complementarity, 1-4 as in the paper);
    comp: 1 low, 2 high complementarity; cdaioe: 1 low, 2 high C-DAIOE (median split, 2024)."""
    if daioe is None or comp is None or cdaioe is None:
        return {"quad": None, "comp": None, "cdaioe": None}
    hx, hc = daioe >= md, comp >= mc
    return {"quad": 2 if hx and hc else 1 if hx else 3 if hc else 4, "comp": 2 if hc else 1, "cdaioe": 2 if cdaioe >= mcd else 1}


def wquantile_groups(items: list[tuple[str, float, float]], n: int = 5) -> dict[str, int]:
    """Assign occupations to n groups of (roughly) equal weighted employment by score."""
    items = sorted(items, key=lambda t: t[1])
    tot = sum(w for _, _, w in items)
    out, cum = {}, 0.0
    for code, _, w in items:
        mid = (cum + w / 2) / tot
        out[code] = min(n, int(mid * n) + 1)
        cum += w
    return out


def avg4(series: dict[str, float], quarters: list[str], end: str) -> float | None:
    i = quarters.index(end)
    xs = [series.get(q) for q in quarters[max(0, i - 3): i + 1]]
    return sum(xs) / 4 if len(xs) == 4 and all(x is not None for x in xs) else None


def growth(series: dict[str, float], quarters: list[str], q0: str, q1: str, nd: int = 2) -> float | None:
    a, b = avg4(series, quarters, q0), avg4(series, quarters, q1)
    yrs = (quarters.index(q1) - quarters.index(q0)) / 4
    if not a or not b or yrs <= 0:
        return None
    return round(100 * ((b / a) ** (1 / yrs) - 1), nd)


def main() -> None:
    sc = json.loads(SCORES.read_text(encoding="utf-8"))
    cols = sc["cols"]
    years = sc["years"]
    fy = years.index(sc["frontier_year"])
    occ = {}
    for r in sc["rows"]:
        d = dict(zip(cols, r))
        occ[d["isco"]] = d
    values, quarters, updated, labels = fetch()
    quarters = [q for q in quarters if any(values.get(("Lonsstakere", "999D", c, q)) for c in list(occ)[:50])]
    last_q = quarters[-1]

    def emp(code, age, q):
        return values.get(("Lonsstakere", age, code, q))

    # balanced panel: occupations with employee counts in every quarter and age group;
    # weights: mean employees in WEIGHT_YEAR
    wq = [q for q in quarters if q.startswith(WEIGHT_YEAR)]
    weight = {}
    for code in occ:
        complete = all(emp(code, a, q) is not None for a in AGES for q in quarters)
        xs = [emp(code, "999D", q) for q in wq]
        if complete and sum(xs) > 0:
            weight[code] = sum(xs) / len(xs)
    tot = [values.get(("Lonsstakere", "999D", "0-9", q)) for q in wq]
    total_w = sum(tot) / len(tot) if all(tot) else None
    matched = list(weight)
    # Groups as defined in the paper: high and low exposure relative to the unweighted median of
    # 2024 all-applications DAIOE across occupations, high and low complementarity relative to the
    # unweighted median of the task-complementarity index. Quadrants: 1 high exposure / low
    # complementarity, 2 high / high, 3 low exposure / high complementarity, 4 low / low.
    qy = years.index(QUAD_YEAR)
    def med(xs):
        s = sorted(xs); m = len(s) // 2
        return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2
    md = med([occ[c]["daioe"][qy] for c in occ if occ[c]["daioe"][qy] is not None])
    mc = med([occ[c]["comp"] for c in occ])
    mcd = med([occ[c]["cdaioe"][qy] for c in occ if occ[c]["cdaioe"][qy] is not None])
    def val(c, m):
        return occ[c]["comp"] if m == "comp" else occ[c][m][qy]
    groups = {m: {} for m in MEASURES}
    for c in matched:
        g = group_of(occ[c]["daioe"][qy], occ[c]["comp"], occ[c]["cdaioe"][qy], md, mc, mcd)
        for m in MEASURES:
            groups[m][c] = g[m]
    quad = groups["quad"]

    def series_for(codes, age):
        s = {}
        for q in quarters:
            xs = [emp(c, age, q) for c in codes]
            if all(x is not None for x in xs):
                s[q] = float(sum(xs))
        return s

    def wage_for(codes):
        s = {}
        for q in quarters:
            num = den = 0.0
            for c in codes:
                w, e = values.get(("MedianMndLonn", "999D", c, q)), emp(c, "999D", q)
                if w and e:
                    num += w * e; den += e
            if den:
                s[q] = num / den
        return s

    def pack(s):
        # four-quarter trailing average (removes the seasonal pattern), indexed to the four
        # quarters ending in BASE_Q = 100
        ma = [avg4(s, quarters, q) if i >= 3 else None for i, q in enumerate(quarters)]
        b = ma[quarters.index(BASE_Q)]
        return {"level": [None if q not in s else round(s[q]) for q in quarters],
                "ma4": [None if (m is None or not b) else round(100 * m / b, 2) for m in ma],
                "growth_pre": growth(s, quarters, "2018K3", BASE_Q),
                "growth_post": growth(s, quarters, BASE_Q, last_q)}

    out_groups = {}
    for measure in MEASURES:
        gl = []
        for g in range(1, NGROUPS[measure] + 1):
            codes = [c for c in matched if groups[measure].get(c) == g]
            gl.append({"group": g, "n_occ": len(codes),
                       "emp": {a: pack(series_for(codes, a)) for a in AGES},
                       "wage": pack(wage_for(codes))})
        out_groups[measure] = gl
    allc = {"emp": {a: pack(series_for(matched, a)) for a in AGES}, "wage": pack(wage_for(matched))}

    # exposure of Norwegian employment by O*NET release (AI frontier fixed), 2022 weights
    rel = [r["key"] for r in sc["releases"]]
    bal = [c for c in matched if all(x is not None for x in occ[c]["cdaioe_by_release"]) and
           all(x is not None for x in occ[c]["daioe_by_release"])]
    wt = sum(weight[c] for c in bal)
    by_release = {"releases": sc["releases"], "n_occ": len(bal),
                  "cdaioe": [round(sum(weight[c] * occ[c]["cdaioe_by_release"][i] for c in bal) / wt, 3) for i in range(len(rel))],
                  "daioe": [round(sum(weight[c] * occ[c]["daioe_by_release"][i] for c in bal) / wt, 3) for i in range(len(rel))]}
    # exposure of Norwegian employment over time (published-series DAIOE and C-DAIOE), 2022 weights
    by_year = {"years": years}
    for m in ["daioe", "cdaioe"]:
        cs = [c for c in matched if all(x is not None for x in occ[c][m])]
        w = sum(weight[c] for c in cs)
        by_year[m] = [round(sum(weight[c] * occ[c][m][i] for c in cs) / w, 3) for i in range(len(years))]

    # ---------- finer age groups: table 14160, 2-digit occupations
    dvals, dq, d_updated, d_labels = fetch_detail()
    dq = [q for q in dq if dvals.get(("999A", "0-9", q))]
    d_last = dq[-1]
    two = {}
    for c in matched:
        two.setdefault(c[:2], []).append(c)
    d_occ = [t for t in sorted(two) if all(dvals.get((a, t, q)) is not None for a in AGES_DETAIL for q in dq)]
    dw = {t: sum(dvals[("999A", t, q)] for q in dq if q.startswith(WEIGHT_YEAR)) / 4 for t in d_occ}
    def score2(t, m):
        cs = [c for c in two[t] if val(c, m) is not None]
        w = sum(weight[c] for c in cs)
        return sum(weight[c] * val(c, m) for c in cs) / w if w else None
    s2 = {m: {t: score2(t, m) for t in d_occ} for m in ["comp", "daioe", "cdaioe"]}
    g2 = {m: {} for m in MEASURES}
    for t in d_occ:
        g = group_of(s2["daioe"][t], s2["comp"][t], s2["cdaioe"][t], md, mc, mcd)
        for m in MEASURES:
            g2[m][t] = g[m]
    def dseries(codes, age):
        return {q: float(sum(dvals[(age, t, q)] for t in codes)) for q in dq}
    def dpack(s):
        ma = [avg4(s, dq, q) if i >= 3 else None for i, q in enumerate(dq)]
        b = ma[dq.index(BASE_Q)]
        e = ma[-1]
        return {"ma4": [None if (m is None or not b) else round(100 * m / b, 2) for m in ma],
                "change": None if not b or not e else round(100 * (e / b - 1), 2)}
    detail = {"source": "SSB table 14160, employees by 2-digit occupation (STYRK-08) and age, a-ordningen",
              "ssb_updated": d_updated, "quarters": dq, "last_quarter": d_last,
              "ages": [{"code": a, "label": AGE_DETAIL_LABEL[a]} for a in AGES_DETAIL],
              "all": {a: dpack(dseries(d_occ, a)) for a in AGES_DETAIL}, "groups": {}, "occ": {}}
    for m in MEASURES:
        detail["groups"][m] = [{"group": g, "n_occ": sum(1 for t in d_occ if g2[m].get(t) == g),
                                "emp": {a: dpack(dseries([t for t in d_occ if g2[m].get(t) == g], a)) for a in AGES_DETAIL}}
                               for g in range(1, NGROUPS[m] + 1)]
    for t in d_occ:
        detail["occ"][t] = {"t": d_labels.get(t, t).replace("\u00bf", "\u2019"),
                            "comp": None if s2["comp"][t] is None else round(s2["comp"][t], 4),
                            "daioe": None if s2["daioe"][t] is None else round(s2["daioe"][t], 2),
                            "cdaioe": None if s2["cdaioe"][t] is None else round(s2["cdaioe"][t], 2),
                            "g": g2["comp"].get(t), "gd": g2["cdaioe"].get(t), "q": g2["quad"].get(t),
                            "w": round(dw[t]),
                            "w25": round(sum(dvals[("-24", t, q)] for q in dq if q.startswith(WEIGHT_YEAR)) / 4),
                            "change": {a: dpack(dseries([t], a))["change"] for a in AGES_DETAIL}}

    # ---------- skill set: employment-weighted O*NET ability and skill importance (fixed profiles)
    skills_out = None
    if PROFILES.exists():
        pr = json.loads(PROFILES.read_text(encoding="utf-8"))
        idx = {c: i for i, c in enumerate(pr["isco"])}
        pc = [c for c in matched if c in idx]
        def wmean_series(mat, k, age):
            out = {}
            for q in quarters:
                num = den = 0.0
                for c in pc:
                    e = emp(c, age, q)
                    num += e * mat[idx[c]][k]; den += e
                out[q] = num / den
            return out
        res = {}
        for kind, mat, items in [("abilities", pr["ability_im"], pr["abilities"]), ("skills", pr["skill_im"], pr["skills"])]:
            rows = []
            for k, it in enumerate(items):
                r = {"name": it["name"]}
                if "ai" in it:
                    r["ai"] = it["ai"]; r["type"] = it["type"]
                for age in ["999D", "0-39"]:
                    sk = wmean_series(mat, k, age)
                    r[age] = {"pre": growth(sk, quarters, "2018K3", BASE_Q, 4), "post": growth(sk, quarters, BASE_Q, last_q, 4),
                              "level": round(avg4(sk, quarters, BASE_Q), 3)}
                rows.append(r)
            res[kind] = rows
        # summary series: the ten most and ten least AI-exposed abilities (equal-weighted mean of their indexes)
        order = sorted(range(len(pr["abilities"])), key=lambda k: pr["abilities"][k]["ai"])
        sets = {"top10": order[-10:], "bottom10": order[:10]}
        summ = {}
        for nm, ks in sets.items():
            summ[nm] = {"abilities": [pr["abilities"][k]["name"] for k in ks]}
            for age in ["999D", "0-39"]:
                ser = [wmean_series(pr["ability_im"], k, age) for k in ks]
                ma = [[avg4(sk, quarters, q) if i >= 3 else None for i, q in enumerate(quarters)] for sk in ser]
                bi = quarters.index(BASE_Q)
                summ[nm][age] = [None if any(m[i] is None for m in ma) else
                                 round(sum(100 * m[i] / m[bi] for m in ma) / len(ma), 3) for i in range(len(quarters))]
        skills_out = {"release": pr["release"], "frontier_year": pr["frontier_year"], "n_occ": len(pc),
                      "abilities": res["abilities"], "skills": res["skills"], "summary": summ}

    occ_out = {}
    for c in matched:
        occ_out[c] = {
            "t": (occ[c]["title"] or labels.get(c, "")).replace("\u00bf", "\u2019"),
            "g": groups["comp"][c], "gd": groups["cdaioe"][c], "q": quad[c],
            "e": [emp(c, "999D", q) for q in quarters],
            "y": [emp(c, "0-39", q) for q in quarters],
            "w": [values.get(("MedianMndLonn", "999D", c, q)) for q in quarters],
        }
    out = {
        "source": "Statistics Norway (SSB), table 11658, employees and median monthly earnings by occupation (STYRK-08), a-ordningen",
        "ssb_updated": updated,
        "built": time.strftime("%Y-%m-%d"),
        "quarters": quarters,
        "base_quarter": BASE_Q,
        "last_quarter": last_q,
        "frontier_year": sc["frontier_year"],
        "weight_year": WEIGHT_YEAR,
        "coverage": round(sum(weight.values()) / total_w, 4) if total_w else None,
        "n_matched": len(matched),
        "medians": {"daioe": round(md, 2), "comp": round(mc, 4), "cdaioe": round(mcd, 2), "daioe_year": QUAD_YEAR},
        "groups_def": "quadrants as in the paper (unweighted occupation medians of 2024 DAIOE and of the task-complementarity index); exposure-only split at the median of 2024 C-DAIOE",
        "ages": [{"code": a, "label": AGE_LABEL[a]} for a in AGES],
        "all": allc,
        "groups": out_groups,
        "by_release": by_release,
        "by_year": by_year,
        "occ": occ_out,
        "age_detail": detail,
        "skillset": skills_out,
    }
    new = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    old = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    def strip(s):
        try:
            d = json.loads(s); d.pop("built", None); return d
        except Exception:  # noqa: BLE001
            return None
    if strip(old) == strip(new):
        print("no change in SSB data; nothing written")
        return
    OUT.write_text(new, encoding="utf-8")
    print(f"wrote {OUT.name}: {len(quarters)} quarters to {last_q}, {len(matched)} occupations, coverage {out['coverage']}")


if __name__ == "__main__":
    main()
