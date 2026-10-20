"""Prov av korridorgeometrin i geom.js.

Två oberoende räkningar prövas mot JavaScriptet:
  * shapely (samma plan, eget skolax, egen giltighetsprövning, egna avstånd),
  * analytiska värden för handräknade fall (120 m rak korridor, kil, förskjutning).

Sonden lämnar både sidorna och resultatet, så att provet kan räkna om saken
själv i stället för att lita på appens egen sammanfattning.
"""
import json
import pathlib
import subprocess

import pytest
from pyproj import Transformer
import shapely
from shapely.geometry import LineString, Point, Polygon

HAR = pathlib.Path(__file__).resolve().parent


@pytest.fixture(scope="session")
def js():
    ut = subprocess.run(["node", str(HAR / "prov_korridor.mjs")],
                        capture_output=True, text=True, timeout=180)
    assert ut.returncode == 0, ut.stderr
    return json.loads(ut.stdout)


def punkt(p):
    """Sondens egna punkter bär x/y, geom.js punkter bär både x/y och e/n."""
    return (p.get("e", p["x"]), p.get("n", p["y"]))


def ring(punkter):
    return [punkt(p) for p in punkter]


def kalla(js, namn):
    return js["fall"][namn]["k"]


def polygon(js, namn):
    f = js["fall"][namn]
    return Polygon([punkt(p) for p in f["k"]["ring"]])


FLER_SIDOR = ["rak", "kil", "olika_nodantal", "avsmalning", "motsatt_riktning",
              "sned_andforlutning", "med_radier"]


def test_ringen_ligger_moturs_och_ar_giltig(js):
    """GeoJSON kräver yttre ringen moturs (RFC 7946), och en korridor som skär
    sig själv är ingen korridor. Shapely avgör båda."""
    for namn in FLER_SIDOR:
        p = polygon(js, namn)
        assert p.exterior.is_ccw, "%s: ringen ligger medurs" % namn
        if namn == "korsande":
            continue
        assert p.is_valid, "%s: %s" % (namn, shapely.is_valid_reason(p))


def test_arean_stammer_med_shapely(js):
    """Samma ring, två oberoende areaberäkningar."""
    for namn in FLER_SIDOR:
        p = polygon(js, namn)
        assert kalla(js, namn)["area_m2"] == pytest.approx(p.area, rel=1e-9), namn


def test_rak_korridor_ar_120_m_hela_vagen(js):
    k = kalla(js, "rak")
    assert k["bredd"]["min"]["bredd"] == pytest.approx(120, abs=1e-6)
    assert k["bredd"]["max"]["bredd"] == pytest.approx(120, abs=1e-6)
    assert k["area_m2"] == pytest.approx(120 * 2000, rel=1e-12)
    assert k["ringEnkel"]["ok"] is True
    assert k["varningar"] == []
    assert k["langd"]["vanster"] == pytest.approx(2000, abs=1e-6)
    assert k["langd"]["hoger"] == pytest.approx(2000, abs=1e-6)


def test_kil_ger_100_till_300_m_och_trapetsarea(js):
    """Sidorna går isär från 100 m till 300 m. Bredden vid ändpunkterna är
    hörn-till-hörn-avstånden (fotpunkten hamnar utanför), och arean är ett
    parallelltrapets: (100 + 300)/2 · 1 000 m²."""
    k = kalla(js, "kil")
    assert k["bredd"]["min"]["bredd"] == pytest.approx(100, abs=1e-6)
    assert k["bredd"]["max"]["bredd"] == pytest.approx(300, abs=1e-6)
    assert k["area_m2"] == pytest.approx(200000, rel=1e-12)
    assert k["varningar"] == []


def test_avsmalning_mellan_noderna_hittas(js):
    """Vänstersidan har bara två noder; avsmalningen ligger mitt på ett segment
    och kan bara hittas av provpunkterna längs sidan."""
    k = kalla(js, "avsmalning")
    assert k["bredd"]["min"]["bredd"] == pytest.approx(40, abs=1e-6)
    assert k["bredd"]["min"]["punkt"]["y"] == pytest.approx(6401000, abs=1e-6)
    assert k["bredd"]["max"]["bredd"] == pytest.approx(120, abs=1e-6)
    assert any("smalare" in v for v in k["varningar"]), k["varningar"]
    # med standardgränsen 30 m är 40 m ingen fara — gränsen används alltså
    utan = kalla(js, "avsmalning_utan_grans")
    assert utan["bredd"]["min"]["bredd"] == pytest.approx(40, abs=1e-6)
    assert not any("smalare" in v for v in utan["varningar"]), utan["varningar"]


def test_olika_nodantal_ger_samma_bredd(js):
    """Bredden får inte mätas nod mot nod: sidorna har 3 respektive 2 noder."""
    k = kalla(js, "olika_nodantal")
    assert k["bredd"]["min"]["bredd"] == pytest.approx(100, abs=1e-6)
    assert k["bredd"]["max"]["bredd"] == pytest.approx(100, abs=1e-6)
    assert k["area_m2"] == pytest.approx(200000, rel=1e-12)


def test_korsande_sidor_avslojas(js):
    """Korsar sidorna varandra blir ringen en åtta. Båda parningarna ska prövas,
    ingen av dem håller, och appen ska säga det i stället för att visa en area."""
    k = kalla(js, "korsande")
    assert k["ringEnkel"]["ok"] is False
    assert k["ok"] is False
    assert any("korsningar" in v for v in k["varningar"]), k["varningar"]
    p = polygon(js, "korsande")
    assert not p.is_valid
    assert "self-intersection" in shapely.is_valid_reason(p).lower()


def test_sida_ritad_at_motsatt_hall_paras_korsvis(js):
    """Ritas högersidan baklänges blir start-mot-start ett timglas. Appen ska
    upptäcka det, para ändarna korsvis och säga till."""
    f = js["fall"]["motsatt_riktning"]
    k = f["k"]
    assert k["parning"] == "korsvis"
    assert k["ringEnkel"]["ok"] is True
    assert k["area_m2"] == pytest.approx(120 * 1000, rel=1e-9)
    assert any("motsatt riktning" in v for v in k["varningar"]), k["varningar"]
    # och den korsvisa ringen är en riktig slinga
    assert polygon(js, "motsatt_riktning").is_valid


def test_sned_andforlutning_varnar_men_rak_gor_det_inte(js):
    k = kalla(js, "sned_andforlutning")
    assert k["andar"]["start"]["grad"] > 45
    assert k["andar"]["slut"]["grad"] > 45
    assert sum(1 for v in k["varningar"] if "vinkelrät" in v) == 2
    rak = kalla(js, "rak")
    assert rak["andar"]["start"]["grad"] == pytest.approx(0, abs=1e-9)
    assert not any("vinkelrät" in v for v in rak["varningar"])


def test_breddprofilen_stammer_punkt_for_punkt_med_shapely(js):
    """Varje provpunkt mätt mot motståndarsidan — den skarpaste prövningen av
    breddmätningen, och den fångar också om profilens ändpunkter tappas bort."""
    for namn in FLER_SIDOR:
        f = js["fall"][namn]
        vanster = [punkt(p) for p in f["v"]]
        hoger = [punkt(p) for p in f["h"]]
        linje = {"vanster": LineString(hoger), "hoger": LineString(vanster)}
        profil = f["k"]["bredd"]["profil"]
        assert len(profil) > 10, namn
        for prov in profil:
            vantad = linje[prov["sida"]].distance(Point(punkt(prov["punkt"])))
            assert prov["bredd"] == pytest.approx(vantad, abs=1e-6), (namn, prov["langs"])


def test_forsta_ringen_ar_moturs_aven_i_geografiska_koordinater(js):
    """Samma orientering i SWEREF-planet och i grader: avbildningen bevarar
    riktning, så en moturs ring blir moturs också i GeoJSON."""
    tf = Transformer.from_crs("EPSG:3006", "EPSG:4326", always_xy=True)
    for namn in FLER_SIDOR:
        k = kalla(js, namn)
        if not k["ringEnkel"]["ok"]:
            continue
        graf = [tf.transform(x, y) for x, y in ring(k["ring"])]
        assert Polygon(graf).exterior.is_ccw, namn


def test_forsta_ringen_vander_ratt(js):
    """Skolaxens tecken: medurs ring ger negativ area, moturs positiv."""
    r = js["fall"]["ring"]
    assert r["area_medurs"] == pytest.approx(-20000, rel=1e-12)
    assert r["area_moturs"] == pytest.approx(20000, rel=1e-12)
    assert r["enkel"]["ok"] is True


def test_forskjutningen_stammer_med_shapely(js):
    """Förskjutningen (som gör en korridorsida av den andra) jämförs med
    shapelys offset_curve med miterskarv."""
    f = js["fall"]["forskjut_krokig"]
    indata = [punkt(p) for p in f["indata"]]
    ut = [punkt(p) for p in f["punkter"]]
    # shapely mäter positivt åt vänster, forskjut åt höger
    vantad = list(LineString(indata).offset_curve(-120, join_style="mitre").coords)
    assert len(ut) == len(vantad)
    for a, b in zip(ut, vantad):
        assert a[0] == pytest.approx(b[0], abs=1e-6), a
        assert a[1] == pytest.approx(b[1], abs=1e-6), a


def test_forskjut_exakta_handraknade_fall(js):
    """Rak linje 120 m till höger, och ett rätvinkligt hörn (norrut, sedan
    österut) med d = 10 m: hörnet hamnar i (10, 100 − 10)."""
    rak = js["fall"]["forskjut_rak"]
    indata = [punkt(p) for p in rak["indata"]]
    ut = [punkt(p) for p in rak["punkter"]]
    assert rak["varningar"] == []
    for i, p in enumerate(ut):
        assert p[0] - indata[i][0] == pytest.approx(120, abs=1e-9)
        assert p[1] == pytest.approx(indata[i][1], abs=1e-9)
    horn = js["fall"]["forskjut_horn"]
    ut2 = [punkt(p) for p in horn["punkter"]]
    assert ut2[0] == pytest.approx((320010, 6400000), abs=1e-9)
    assert ut2[1] == pytest.approx((320010, 6400090), abs=1e-9)
    assert ut2[2] == pytest.approx((320100, 6400090), abs=1e-9)


def test_sondens_punkter_ligger_ratt_i_sweref(js):
    """Också korridorsonden räknar i SWEREF 99 TM — kontrollerat mot pyproj, och
    x/y ska vara samma tal som e/n (geometrin räknar i x/y)."""
    tf = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
    for p in js["fall"]["projektion"]:
        e, n = tf.transform(p["lon"], p["lat"])
        assert abs(e - p["e"]) < 0.005 and abs(n - p["n"]) < 0.005, p
        assert p["x"] == pytest.approx(p["e"], abs=1e-9)
        assert p["y"] == pytest.approx(p["n"], abs=1e-9)
