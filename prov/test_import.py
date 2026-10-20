"""Prov av importen i geom.js — mot filens egna siffror och mot shapely.

Två oberoende räkningar:

* **Filens egna tal.** `prov_import.mjs` läser en GeoJSON som appen själv
  skrivit ut och räknar korridoren på nytt ur de lästa sidorna. Arean och
  längderna i filen är skrivna av en *tidigare* körning av appen. Stämmer de
  betyder det att importen återställde samma geometri — inte att samma kod
  räknade likadant två gånger i rad.
* **shapely.** Ringen som byggdes om prövas som polygon.

Exempelfilen ligger utanför repot (den är projektmaterial); saknas den hoppas
proven över.
"""
import json
import os
import pathlib
import subprocess

import pytest
from shapely.geometry import Polygon

HAR = pathlib.Path(__file__).resolve().parent
EXEMPEL = os.environ.get("EXEMPEL_GEOJSON", "/opt/data/exempel-korridor.geojson")

TOL = 1e-6


def kor_prov(fil=None):
    argv = ["node", str(HAR / "prov_import.mjs")]
    if fil:
        argv.append(str(fil))
    ut = subprocess.run(argv, capture_output=True, text=True, timeout=300)
    assert ut.returncode == 0, ut.stderr
    return json.loads(ut.stdout)["fall"]


@pytest.fixture(scope="session")
def fall():
    return kor_prov(EXEMPEL if pathlib.Path(EXEMPEL).exists() else None)


@pytest.fixture(scope="session")
def har_fil():
    return pathlib.Path(EXEMPEL).exists()


def nara(tal, vantat, vad):
    assert tal == pytest.approx(vantat, rel=TOL, abs=1e-6), \
        "%s: %r mot %r" % (vad, tal, vantat)


# ------------------------------------------------------------ handskrivna fall

def test_tva_linjer_med_sida_raknas_som_sidor(fall):
    f = fall["enkel"]
    assert len(f["sidor"]["vanster"]) == 3
    assert len(f["sidor"]["hoger"]) == 3
    # ändarna är inga hörn, mitten är det
    assert f["aktiva"]["vanster"] == [False, True, False]
    assert f["koordinat"] == "wgs84"
    assert f["varningar"] == []
    assert fall["enkel_raknad"]["slinga"] is True


def test_samma_geometri_i_sweref_ger_samma_noder(fall):
    """Talens storlek avgör koordinatsystemet — båda vägarna ska ge samma noder."""
    a, b = fall["enkel"], fall["sweref"]
    assert b["koordinat"] == "sweref"
    for sida in ("vanster", "hoger"):
        assert len(a["sidor"][sida]) == len(b["sidor"][sida])
        for pa, pb in zip(a["sidor"][sida], b["sidor"][sida]):
            assert pa["lat"] == pytest.approx(pb["lat"], abs=1e-9)
            assert pa["lng"] == pytest.approx(pb["lng"], abs=1e-9)


def test_linje_utan_sida_lases_inte_men_sager_till(fall):
    f = fall["utan_sida"]
    assert f["sidor"]["vanster"] == [] and f["sidor"]["hoger"] == []
    assert any("sida" in t for t in f["varningar"]), f["varningar"]


def test_bara_en_sida_ger_besked_om_den_andra(fall):
    f = fall["bara_vanster"]
    assert len(f["sidor"]["vanster"]) == 3
    assert f["sidor"]["hoger"] == []
    assert any("högersida" in t for t in f["varningar"]), f["varningar"]


def test_fel_zon_varnar_i_stallet_for_tyst_karta(fall):
    f = fall["fel_zon"]
    assert any("utanför Sverige" in t for t in f["varningar"]), f["varningar"]


def test_skrap_kastar_tydligt_fel(fall):
    assert "GeoJSON" in fall["skrap"]


# ------------------------------------------------------- appens egen utfil

def test_importen_kanner_igen_appens_egen_fil(fall, har_fil):
    if not har_fil:
        pytest.skip("ingen exempelfil (%s saknas)" % EXEMPEL)
    f = fall["fil"]
    # hörnlinjen ska ha valts, inte den rundade linjen
    for sida in ("vanster", "hoger"):
        assert len(f["sidor"][sida]) == 10, sida
        assert f["aktiva"][sida][0] is False and f["aktiva"][sida][-1] is False
    assert any("hörnlinjen" in r for r in f["rader"]), f["rader"]
    assert f["R"] == 4950
    assert f["sluten"] is True, "filen har en korridoryta, alltså ska korridoren slutas"
    assert f["koordinat"] == "wgs84"
    assert f["varningar"] == [], f["varningar"]


def test_noderna_hamnar_dar_filen_sager(fall, har_fil):
    """Den exakta kontrollen: filen skriver varje nods E/N i SWEREF 99 TM.

    Importen läser WGS84 och räknar om till SWEREF. Avvikelsen ska vara några
    tiondels millimeter — samma noggrannhet som projektionen prövas med mot
    pyproj. Här går jämförelsen förbi korridorgeometrin helt.
    """
    if not har_fil:
        pytest.skip("ingen exempelfil (%s saknas)" % EXEMPEL)
    fil, last = fall["fil_noder"], fall["fil_last_sweref"]
    for sida in ("vanster", "hoger"):
        assert len(fil[sida]) == len(last[sida]) == 10, sida
        for i, (a, b) in enumerate(zip(fil[sida], last[sida])):
            assert abs(a["e"] - b[0]) < 0.01, "%s nod %d: E %r mot %r" % (sida, i + 1, a["e"], b[0])
            assert abs(a["n"] - b[1]) < 0.01, "%s nod %d: N %r mot %r" % (sida, i + 1, a["n"], b[1])


def test_importen_ger_tillbaka_hornlinjens_langd(fall, har_fil):
    """Av de råa noderna blir korridoren den ritade hörnlinjen — arean i filen är
    räknad *med* radier och hör till appens körning, inte till den här sonden."""
    if not har_fil:
        pytest.skip("ingen exempelfil (%s saknas)" % EXEMPEL)
    egna, raknad = fall["fil_egna"], fall["fil_raknad"]
    # filen skriver längder med en decimal, alltså är 5 cm rätt tolerans
    for sida in ("vanster", "hoger"):
        assert abs(raknad["langd_%s_m" % sida] - egna["hornlinje_langder"][sida]) < 0.05, \
            "%s: %r mot %r" % (sida, raknad["langd_%s_m" % sida], egna["hornlinje_langder"][sida])
    assert raknad["slinga"] is True
    assert raknad["parning"] == "start-start/slut-slut"


def test_ringen_ar_en_giltig_polygon(fall, har_fil):
    """Ringen som importen byggde om, prövad med shapely."""
    if not har_fil:
        pytest.skip("ingen exempelfil (%s saknas)" % EXEMPEL)
    ring = fall["fil_raknad"]["ring"]
    assert ring and len(ring) > 3
    p = Polygon(ring)
    assert p.is_valid, "ringen ska vara en giltig polygon"
    assert p.exterior.is_ccw, "yttre ringen ska vara moturs"
    # shapelys skolax mot vår egen area för samma ring
    nara(p.area, fall["fil_raknad"]["area_m2"], "shapelyarean mot vår area")


def test_importen_tar_med_radierna_per_horn(fall, har_fil):
    """R_m = null på ett hörn betyder att hörnet inte hade någon radie."""
    if not har_fil:
        pytest.skip("ingen exempelfil (%s saknas)" % EXEMPEL)
    f = fall["fil"]
    for sida in ("vanster", "hoger"):
        aktiva = f["aktiva"][sida]
        assert sum(aktiva) == 8, "%s: %r" % (sida, aktiva)
