"""Prov av grunddatakontrollen i geom.js — mot shapely.

Sonden (prov_grund.mjs) lämnar ut grunddatans ringar och kontrollens siffror.
Här räknas exakt samma sak om med shapely, och talen jämförs. Två oberoende
räkningar av samma sak: shapely har eget skolax, egen giltighetsprövning och
egna booleska operationer.

Fallet `lu_ingenstans` är värt att känna igen: en korridor helt utanför LU ska
ge 100 % utanför, inte 0 %. Att svara 0 % där är att godkänna en korridor som
ligger i fel dalgång.

Med `--skarp` (miljövariabeln GRUND_UTTAG, eller /opt/data/grund_uttag.json) körs
också ett uttag av de riktiga AGOL-lagren. Uttaget ligger utanför repot eftersom
grunddatan inte är publik; saknas filen hoppas de proven över.
"""
import json
import os
import pathlib
import subprocess

import pytest
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

HAR = pathlib.Path(__file__).resolve().parent
UTTAG = os.environ.get("GRUND_UTTAG", "/opt/data/grund_uttag.json")

TOL = 1e-6          # relativ tolerans; båda räkningarna är exakta i sak


def kor_prov(*argv):
    ut = subprocess.run(["node", str(HAR / "prov_grund.mjs"), *argv],
                        capture_output=True, text=True, timeout=300)
    assert ut.returncode == 0, ut.stderr
    return json.loads(ut.stdout)["fall"]


@pytest.fixture(scope="session")
def fall():
    return kor_prov()


@pytest.fixture(scope="session")
def skarp():
    if not pathlib.Path(UTTAG).exists():
        pytest.skip("inget uttag av de riktiga lagren (%s saknas)" % UTTAG)
    return kor_prov("--skarp", UTTAG)["skarp"]


def ring_punkter(punkter):
    """Sondens korridorring: punkter med e/n (eller x/y)."""
    return [(p.get("e", p["x"]), p.get("n", p["y"])) for p in punkter]


def shapely_av_esri(ringar):
    """Esri-ringar till en shapely-geometri, utan att lita på orienteringen.

    Ringdjupet avgör: en ring som ligger inuti ett jämnt antal andra ringar är
    yttre, en som ligger inuti ett udda antal är ett hål. Att läsa tecknet i
    stället vore att göra samma antagande som koden under prov — och då prövas
    inte antagandet. Ringar av samma slag kan vara flera (multipolygon): de
    yttre ringarna blir var sin polygon, hålen hamnar i den som omsluter dem.
    """
    ringar = [r for r in ringar if len(r) >= 4]
    if not ringar:
        return None
    poly = [Polygon(r) for r in ringar]
    # Ring mot ring, inte mot en punkt: en yttre rings representativa punkt kan
    # hamna inuti ett hål (mitten av en fyrkant är samma punkt för båda), och
    # då blir djupet fel för båda två.
    djup = [sum(1 for j, q in enumerate(poly) if j != i and q.contains(p))
            for i, p in enumerate(poly)]
    yttre = [i for i, d in enumerate(djup) if d % 2 == 0]
    hal = {i: [] for i in yttre}
    for i, d in enumerate(djup):
        if d % 2 == 0:
            continue
        for y in yttre:
            if poly[y].contains(poly[i]):
                hal[y].append(list(poly[i].exterior.coords))
                break
    delar = [Polygon(poly[i].exterior.coords, hal[i]) for i in yttre]
    return delar[0] if len(delar) == 1 else MultiPolygon(delar)


def polygon_area_summa(objekt):
    """Summan av varje objekts egen area — JS:s lu_area.

    Den drar inte av överlapp; unionen är det andra talet (lu_area_union)."""
    return sum(shapely_av_esri(o["ringar"]).area for o in objekt)


def nara(tal, vantat, vad):
    if vantat is None:
        assert tal is None, vad + ": väntade inget tal"
        return
    assert tal is not None, vad + ": saknas"
    assert tal == pytest.approx(vantat, rel=TOL, abs=1e-6), \
        "%s: JS %r mot shapely %r" % (vad, tal, vantat)


# ---------------------------------------------------------------- påhittade fall

def test_lu_som_tacker_halva_ger_halva_utanfor(fall):
    f = fall["lu_delvis"]
    korridor = Polygon(ring_punkter(f["ring"]))
    lu = unary_union([shapely_av_esri(o["ringar"]) for o in f["grund"]["lu"]])
    vantat = korridor.difference(lu).area
    nara(f["k"]["lu"]["area_utanfor"], vantat, "utanför LU")
    nara(f["k"]["korridorens_area"], korridor.area, "korridorens area")
    assert f["k"]["lu"]["andel_utanfor"] == pytest.approx(vantat / korridor.area, rel=TOL)


def test_lu_som_tacker_allt_ger_noll_utanfor(fall):
    f = fall["lu_helt"]
    korridor = Polygon(ring_punkter(f["ring"]))
    lu = unary_union([shapely_av_esri(o["ringar"]) for o in f["grund"]["lu"]])
    nara(f["k"]["lu"]["area_utanfor"], korridor.difference(lu).area, "utanför LU")
    assert f["k"]["lu"]["area_utanfor"] == pytest.approx(0, abs=1e-6)


def test_korridor_helt_utanfor_lu_ar_helt_utanfor(fall):
    """Tom mängd är inte samma sak för differens och snitt."""
    f = fall["lu_ingenstans"]
    korridor = Polygon(ring_punkter(f["ring"]))
    assert f["k"]["lu"]["antal_nara"] == 0
    nara(f["k"]["lu"]["area_utanfor"], korridor.area, "utanför LU (inget LU nära)")
    nara(f["k"]["lu"]["area_inom"], 0, "inom LU (inget LU nära)")
    assert f["k"]["lu"]["andel_utanfor"] == pytest.approx(1.0, rel=TOL)
    assert f["k"]["lu"]["punkt_utanfor"] is not None, "ett utanför-stycke ska gå att peka ut"


def test_naturvarde_per_klass_och_objekt(fall):
    f = fall["natur"]
    korridor = Polygon(ring_punkter(f["ring"]))
    objekt = {o["id"]: shapely_av_esri(o["ringar"]) for o in f["grund"]["natur"]}
    klasser = {}
    for o in f["grund"]["natur"]:
        klasser.setdefault(o["klass"], []).append(objekt[o["id"]])
    js = {c["klass"]: c for c in f["k"]["natur"]["perKlass"]}
    for klass, delar in klasser.items():
        nara(js[klass]["area"], korridor.intersection(unary_union(delar)).area,
             "klass " + klass)
    # objektet utanför korridoren ska inte räknas
    assert js["2"]["antal_objekt"] == 1
    assert js["2"]["objekt"][0]["id"] == "N2a"
    nara(js["2"]["objekt"][0]["area"], korridor.intersection(objekt["N2a"]).area, "N2a")
    assert "N2b" not in [o["id"] for o in js["2"]["objekt"]]


def test_allt_pa_en_gang(fall):
    f = fall["allt"]
    korridor = Polygon(ring_punkter(f["ring"]))
    lu = unary_union([shapely_av_esri(o["ringar"]) for o in f["grund"]["lu"]])
    nara(f["k"]["lu"]["area_utanfor"], korridor.difference(lu).area, "utanför LU")
    for c in f["k"]["natur"]["perKlass"]:
        delar = [o for o in f["grund"]["natur"] if o["klass"] == c["klass"]]
        nara(c["area"], korridor.intersection(
            unary_union([shapely_av_esri(o["ringar"]) for o in delar])).area, "klass " + c["klass"])
    ritade = unary_union([shapely_av_esri(o["ringar"]) for o in f["grund"]["ritade"]])
    nara(f["k"]["ritade"]["area"], korridor.intersection(ritade).area, "redan ritade")


def test_objekt_som_overlappar_varandra_raknas_en_gang(fall):
    """Ytan räknas på objektens union, summan per objekt är något annat."""
    f = fall["natur_overlapp"]
    korridor = Polygon(ring_punkter(f["ring"]))
    delar = [shapely_av_esri(o["ringar"]) for o in f["grund"]["natur"]]
    k = f["k"]["natur"]
    nara(k["area"], korridor.intersection(unary_union(delar)).area, "klassen som union")
    nara(k["area_summa_objekt"],
         sum(korridor.intersection(d).area for d in delar), "summan per objekt")
    assert k["area_summa_objekt"] > k["area"], "testfallet ska ha en överlappning"
    assert k["perKlass"][0]["area_summa_objekt"] > k["perKlass"][0]["area"]


def test_esri_ringarnas_ordning_och_hal(fall):
    """Yttre ring medurs, hål moturs — hålet ska dras av, inte läggas till."""
    f = fall["esri_hal"]
    assert len(f["polygoner"]) == 1, "en polygon, inte två"
    assert len(f["polygoner"][0]) == 2, "en yttre ring och ett hål"
    nara(f["area"], shapely_av_esri([f["polygoner"][0][0], f["polygoner"][0][1]]).area,
         "area med hål")


# ------------------------------------------------------------- riktiga lagren

def test_riktiga_lagren_mot_shapely(skarp):
    """Samma kontroll på ett uttag av de riktiga AGOL-lagren."""
    data = json.load(open(UTTAG))
    korridor = Polygon(ring_punkter(skarp["ring"]))
    lu = unary_union([shapely_av_esri(o["ringar"]) for o in data["lu"]])
    k = skarp["k"]
    nara(k["korridorens_area"], korridor.area, "korridorens area")
    nara(k["lu"]["lu_area"], polygon_area_summa(data["lu"]), "LU:s area (summan av polygonerna)")
    nara(k["lu"]["lu_area_union"], unary_union([shapely_av_esri(o["ringar"]) for o in data["lu"]]).area,
         "LU:s area (unionen)")
    nara(k["lu"]["area_utanfor"], korridor.difference(lu).area, "utanför LU")
    nara(k["lu"]["area_inom"], korridor.intersection(lu).area, "inom LU")
    assert k["lu"]["andel_utanfor"] is not None
    # naturvärden klass för klass
    for c in k["natur"]["perKlass"]:
        delar = [o for o in data["natur"] if str(o["klass"]) == c["klass"]]
        nara(c["area"], korridor.intersection(
            unary_union([shapely_av_esri(o["ringar"]) for o in delar])).area, "klass " + c["klass"])
    ritade = unary_union([shapely_av_esri(o["ringar"]) for o in data["ritade"]])
    nara(k["ritade"]["area"], korridor.intersection(ritade).area, "redan ritade")
    # varje objekts eget snitt — här syns det direkt om en ring tolkats fel
    objekt = {str(o["id"]): shapely_av_esri(o["ringar"]) for o in data["natur"]}
    for c in k["natur"]["perKlass"]:
        for o in c["objekt"]:
            nara(o["area"], korridor.intersection(objekt[str(o["id"])]).area,
                 "objekt %s (klass %s)" % (o["id"], c["klass"]))
    for o in k["ritade"]["perObjekt"]:
        ritat = {str(x["id"]): shapely_av_esri(x["ringar"]) for x in data["ritade"]}
        nara(o["area"], korridor.intersection(ritat[str(o["id"])]).area, "ritad %s" % o["id"])
    assert k["fel"] is None
