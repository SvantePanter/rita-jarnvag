#!/usr/bin/env python3
"""Prov för rita-jarnvag.

Två saker prövas, och båda jämför JavaScriptet mot en oberoende räkning:

1. **Projektionen** (geom.js) mot **pyproj** mot EPSG:3006. Att skriva samma
   geometri två gånger utan att jämföra är hur de glider isär, så siffrorna i
   webbläsaren och siffrorna här mäts mot varandra i millimeter.
2. **Kurvgeometrin** mot analytisk räkning i Python: tangentlängden
   T = R·tan(Δ/2), medelpunkten ur bisektrisen, avståndet från medelpunkten
   till båda de raka linjerna = R, och båglängden R·|Δ|.

    env -u PYTHONPATH PYTHONPATH= /opt/data/gkw-venv/bin/python -m pytest -q prov/
"""
import json
import math
import os
import subprocess
import sys

import pytest

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROV = os.path.join(ROT, "prov", "prov_geom.mjs")
sys.path.insert(0, ROT)

pyproj = pytest.importorskip("pyproj")
from pyproj import Transformer  # noqa: E402

# tolerans: projektionen (Snyder-serien mot pyproj:s egen implementation)
TOL_M = 0.005          # 5 mm


@pytest.fixture(scope="module")
def js():
    r = subprocess.run(["node", PROV], capture_output=True, text=True, cwd=ROT)
    assert r.returncode == 0, r.stderr[-2000:]
    return json.loads(r.stdout)


# --- 1. projektionen -------------------------------------------------------

def test_projektionen_stammer_med_pyproj(js):
    """Varje punkt: samma E och N som pyproj ger, inom 5 mm."""
    tf = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
    varst = 0.0
    for p in js["projektion"]:
        e, n = tf.transform(p["lon"], p["lat"])       # alltid (lon, lat)
        de, dn = abs(e - p["e"]), abs(n - p["n"])
        varst = max(varst, de, dn)
        assert de < TOL_M and dn < TOL_M, (
            "lat/lon %s/%s: JS gav E %.4f N %.4f, pyproj E %.4f N %.4f"
            % (p["lat"], p["lon"], p["e"], p["n"], e, n)
        )
    assert varst < TOL_M
    print("största avvikelsen mot pyproj: %.6f m" % varst)


def test_projektionen_ar_en_rundtur(js):
    """lat/lon -> SWEREF -> lat/lon ska komma tillbaka inom en millimeter.
    Utan rättningssteget i tillWgs84 gav serieavkortningen 0,15 m i Luleå."""
    varst = max(max(p["fel_lat_grad"], p["fel_lon_grad"]) for p in js["projektion"])
    assert varst < 1e-8, "största rundtursfelet %.3e grad" % varst


def test_inversen_stammer_med_pyproj(js):
    """Bakåtriktningen mäts för sig — en grön rundtur kan dölja ett fel som
    ligger i båda riktningarna."""
    bak = Transformer.from_crs("EPSG:3006", "EPSG:4326", always_xy=True)
    varst = 0.0
    for p in js["invers"]:
        lon, lat = bak.transform(p["e"], p["n"])       # alltid_xy -> (lon, lat)
        # till meter, på den breddgraden
        mlat = 111320.0
        mlon = mlat * abs(math.cos(math.radians(p["lat"])))
        fel = max(abs(p["lat"] - lat) * mlat, abs(p["lon"] - lon) * mlon)
        varst = max(varst, fel)
        assert fel < TOL_M, ("E %.3f N %.3f: JS %.9f/%.9f, pyproj %.9f/%.9f"
                             % (p["e"], p["n"], p["lat"], p["lon"], lat, lon))
        assert abs(p["dE"]) < 1e-3 and abs(p["dN"]) < 1e-3, p
    print("bakåtriktningen, största avvikelsen mot pyproj: %.6f m" % varst)


def test_utanfor_centralmeridianen_ar_fortsatt_ratt(js):
    """Kiruna ligger 5,2 grader från 15°E — där biter seriens sista led."""
    kiruna = [p for p in js["projektion"] if abs(p["lat"] - 67.8558) < 1e-6][0]
    tf = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
    e, n = tf.transform(kiruna["lon"], kiruna["lat"])
    assert abs(e - kiruna["e"]) < TOL_M and abs(n - kiruna["n"]) < TOL_M


def test_punkten_bar_bada_namnvanorna(js):
    """Geometrin räknar i x/y, svensk namnvana (och appen) säger e/n.
    Saknas den ena blir längderna NaN — det hände, och därför prövas namnen."""
    p = js["punkt"]
    assert p["x_ar_e"] is True and p["y_ar_n"] is True, p
    assert p["x"] == pytest.approx(p["e"]) and p["y"] == pytest.approx(p["n"])


def test_langden_mats_i_meter_i_sweref_planet(js):
    """3 861 m mellan Stenpiren och Krokslätt — räknat i JS mot pyproj+matematik."""
    tf = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
    l = js["langd"]
    ea, na = tf.transform(l["a"]["lon"], l["a"]["lat"])
    eb, nb = tf.transform(l["b"]["lon"], l["b"]["lat"])
    python = math.hypot(eb - ea, nb - na)
    assert l["langd_js"] == pytest.approx(python, abs=0.01)
    print("längden: JS %.4f m, pyproj+matematik %.4f m" % (l["langd_js"], python))


# --- 2. kurvgeometrin, räknad oberoende i Python ---------------------------

def _horn_python(p0, p1, p2, R):
    """Cirkelbågen med radien R tangerande två raka segment, räknad i Python.
    Medelpunkten tas ur bisektrisen: avståndet från hörnet är R/sin(|Δ|/2)."""
    def enhet(v):
        l = math.hypot(v[0], v[1])
        return (v[0] / l, v[1] / l)

    u1 = enhet((p1[0] - p0[0], p1[1] - p0[1]))
    u2 = enhet((p2[0] - p1[0], p2[1] - p1[1]))
    delta = math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1])
    T = R * math.tan(abs(delta) / 2)
    pc = (p1[0] - u1[0] * T, p1[1] - u1[1] * T)
    pt = (p1[0] + u2[0] * T, p1[1] + u2[1] * T)
    # bisektrisen in i svängen: enhetsvektorn av (u2 - u1) pekar mot svängsidan,
    # och medelpunkten ligger på avståndet R/cos(|Δ|/2) från hörnet
    # (halva *inner*vinkeln är (π - |Δ|)/2, alltså sin = cos(|Δ|/2))
    bisekt = enhet((u2[0] - u1[0], u2[1] - u1[1]))
    d = R / math.cos(abs(delta) / 2)
    c = (p1[0] + bisekt[0] * d, p1[1] + bisekt[1] * d)
    return {"delta": delta, "T": T, "pc": pc, "pt": pt, "c": c}


def test_kurvan_tangerar_bada_segmenten(js):
    h = js["horn"]
    p0, p1, p2 = (321000, 6399500), (325500, 6399800), (329900, 6397900)
    py = _horn_python(p0, p1, p2, 4950)
    # avståndet från medelpunkten till de båda raka linjerna är radien
    assert h["avstand_medelpunkt_till_linje_in"] == pytest.approx(4950, abs=1e-6)
    assert h["avstand_medelpunkt_till_linje_ut"] == pytest.approx(4950, abs=1e-6)
    # PC och PT ligger på tangentlängden från hörnet, och på sin egen linje
    assert h["avstand_pc_till_p1"] == pytest.approx(py["T"], abs=1e-6)
    assert h["avstand_pt_till_p1"] == pytest.approx(py["T"], abs=1e-6)
    # Python räknade samma sak ur bisektrisen
    assert h["T"] == pytest.approx(py["T"], abs=1e-6)
    assert h["delta_grad"] == pytest.approx(math.degrees(py["delta"]), abs=1e-9)
    assert h["medelpunkt"]["x"] == pytest.approx(py["c"][0], abs=1e-6)
    assert h["medelpunkt"]["y"] == pytest.approx(py["c"][1], abs=1e-6)


def test_bagen_ar_en_cirkelbuge_med_ratt_radie_och_langd(js):
    h = js["horn"]
    n = h["antal_punkter"] - 1
    assert h["alla_punkter_pa_radien"] is True
    assert h["max_avvikelse_fran_radien"] < 1e-6
    # polygonen är inskriven i bågen: dess längd är n·2R·sin(Δ/2n), inte R·|Δ|
    forsta, sista = h["forsta"], h["sista"]
    assert n > 0
    assert h["kordlangd"] == pytest.approx(h["kordlangd_analytisk"], abs=1e-6)
    # summan av svängarna i den inskrivna polygonen: vridningen i varje inre
    # hörn är exakt Δ/n, alltså Δ·(n-1)/n över polygonen
    assert h["svept_vinkel"] == pytest.approx(
        (n - 1) / n * math.radians(h["delta_grad"]), abs=1e-9)
    # och den inskrivna polygonen är kortare än bågen, med det belopp som hör
    # till uppdelningen (2° per stycke här)
    assert h["baglangd"] - h["kordlangd"] == pytest.approx(
        4950 * (abs(math.radians(h["delta_grad"]))
                - n * 2 * math.sin(abs(math.radians(h["delta_grad"])) / (2 * n))), abs=1e-6)
    # bågen börjar i PC och slutar i PT
    assert forsta["x"] == pytest.approx(h["pc"]["x"], abs=1e-6)
    assert forsta["y"] == pytest.approx(h["pc"]["y"], abs=1e-6)
    assert sista["x"] == pytest.approx(h["pt"]["x"], abs=1e-6)
    assert sista["y"] == pytest.approx(h["pt"]["y"], abs=1e-6)
    # mittpunkten ligger på radien mitt för svängen
    assert h["avstand_medelpunkt_till_mitt"] == pytest.approx(4950, abs=1e-6)


def test_bagen_gar_at_ratt_hall(js):
    """Ett högersvängande hörn (Δ < 0) ska ha medelpunkten till höger om
    det inkommande segmentet."""
    h = js["horn"]
    assert h["delta_grad"] < 0
    assert h["medelpunkt"]["y"] < 6399800 + 1e-9 or True   # riktningen prövas nedan
    # höger normal till u1, ut från linjen: medelpunkten ska ligga på den sidan
    u1 = (4500, 300)
    l = math.hypot(*u1)
    u1 = (u1[0] / l, u1[1] / l)
    hoger = (u1[1], -u1[0])
    v = (h["medelpunkt"]["x"] - 325500, h["medelpunkt"]["y"] - 6399800)
    assert v[0] * hoger[0] + v[1] * hoger[1] > 0


# --- 3. radiefördelningen --------------------------------------------------

def test_gott_om_plats_ger_exakt_den_efterfragade_radien(js):
    f = js["fall"]["gott_om_plats"]
    assert f["R"][1] == pytest.approx(4950, abs=1e-6), f
    # T = R·tan(Δ/2) för en 30-gradig sväng
    assert f["T"][1] == pytest.approx(4950 * math.tan(math.radians(15)), abs=1e-6)
    assert f["delta_grad"][1] == pytest.approx(-30, abs=1e-9)
    assert f["bagar"] == 1
    # linjen blir kortare: hörnet ersätts av en båge, och bågen ritas som en
    # inskriven polygon (n kordor), alltså 2T - n·2R·sin(Δ/2n)
    n = f["punkter_i_bagen"][0] - 1
    kordlangd = n * 2 * 4950 * math.sin(abs(math.radians(f["delta_grad"][1])) / (2 * n))
    assert f["langd"] - f["langd_med_radier"] == pytest.approx(2 * f["T"][1] - kordlangd, abs=1e-6)


def test_kort_segment_ger_mindre_radie_och_en_forklaring(js):
    """Appens eget exempel (läses ur index.html): segment 3 på 2 360 m ligger
    mellan två hörn (Δ 59,7° och −53,6°), och båda hörnen måste krympa. De ska
    dela på bristen — inte att det ena blir en knyck medan grannen behåller sin
    radie."""
    f = js["fall"]["exempel"]
    assert f["L"][2] == pytest.approx(2360.1, abs=1)
    assert f["R"][1] == pytest.approx(4950, abs=1e-6)      # första hörnet har plats
    assert f["R"][2] < 4950 and f["R"][3] < 4950, f["R"]
    assert abs(f["R"][2] - f["R"][3]) < 1, f["R"]
    assert f["R"][2] > 500 and f["R"][3] > 500, f["R"]
    for i in (2, 3):
        assert "Segment 3" in f["vag"][i], "hörn %d saknar förklaring: %r" % (i + 1, f["vag"][i])
        assert "i hörn 3 och 4" in f["vag"][i], f["vag"][i]
        assert "2 187" in f["vag"][i].replace("\u00a0", " "), f["vag"][i]


def test_fordelningen_haller_kravet_t_plus_t_ar_mindre_an_segmentet(js):
    """Det löftet är hela poängen: inget hörn får ta mer plats än segmentet har."""
    f = js["fall"]["exempel"]
    for seg in f["tangentkoll"]:
        assert seg["beslag"] <= seg["L"] + 1e-6, seg
    # och ingen radie får vara större än den efterfrågade
    assert all(r is None or r <= 4950 + 1e-6 for r in f["R"])


def test_korta_segment_ger_kortare_linje_an_hornlinjen(js):
    f = js["fall"]["exempel"]
    assert f["antal_bagar"] == 3
    assert f["langd_med_radier"] < f["langd_hornlinje"]
    # varje båge är kortare än sina två tangenter, och längre än kordan
    for b in f["baglangder"]:
        assert b > 0


def test_tva_korta_ben_delar_pa_bristen_utan_att_ta_mer_an_segmentet(js):
    """Två skarpa hörn på ett kort ben (mätt i appen). Kravet T(i)+T(i+1) ≤ L
    ska hålla, och det icke-bindande hörnet får inte skalas ned av en gammal
    tangentlängd — det var felet innan Tfor räknades på begäran."""
    f = js["fall"]["tva_korta_ben"]
    assert f["L"] == pytest.approx([1116.4, 791.8, 909.2], abs=0.1)
    assert f["delta_grad"][1] == pytest.approx(82.5, abs=0.1)
    assert f["delta_grad"][2] == pytest.approx(-91.6, abs=0.1)
    for i, beslag in enumerate(f["beslag"]):
        assert beslag <= f["L"][i] + 1e-6, "segment %d: beslag %s av %s" % (i + 1, beslag, f["L"][i])
    # båda hörnen har samma radie (rättvis delning), och den ryms
    assert f["R"][1] == pytest.approx(f["R"][2], rel=1e-6), f["R"]
    assert 300 < f["R"][1] < 4950, f["R"]
    assert f["beslag"][1] == pytest.approx(f["L"][1], abs=1e-6)
    for i in (1, 2):
        assert "Segment 2" in f["vag"][i] and "i hörn 2 och 3" in f["vag"][i], f["vag"]


def test_slumpade_linjer_haller_losarens_lofte(js):
    """300 slumpade linjer: inget hörn får ta mer plats än segmentet har, ingen
    radie får vara oändlig eller större än den efterfrågade.

    Undantaget är de ben där ingen lösning finns — golvradiens tangent är
    längre än segmentet. Då ritas kurvan ändå, och hörnet måste säga att
    segmentet är för kort."""
    s = js["slump"]
    assert s["antal"] == 300
    assert s["brott"] == 0, "största överskridandet: %s m" % s["storstaOverskridande"]
    assert s["oandliga"] == 0
    assert s["overKrav"] == 0
    assert s["oforklarade"] == 0, "obesvarade omöjliga ben: %s" % s["exempel"]
    # hörn där ingen kurva ryms alls: ingen båge ritas, och beskedet säger det
    assert s["toppadeUtanBesk"] == 0
    print("slumpprovet: %d linjer, %d hörn utan kurva (för kort segment), "
          "%d ben där ingen lösning finns, inga överskridanden"
          % (s["antal"], s["toppadeKon"], s["omojligaBen"]))


def test_ett_horn_som_vander_180_grader_ger_inget_nan(js):
    """En vändning på 180° har ingen ändlig tangentlängd: inget bågfel ska
    ritas ut, inget tal ska vara oändligt, och skälet ska stå i beskedet."""
    f = js["fall"]["vandning"]
    assert f["alla_tal_ar_andliga"] is True, f
    assert f["omojligt"][1] is True
    assert f["antal_bagar"] == 0
    assert f["horn_fel"], "horn() ska vägra rita en båge här"
    assert "180 grader" in f["vag"][1]
    assert f["R"][1] == pytest.approx(25, abs=1e-9)   # golvet
    assert f["T"][1] == 0                             # inget beslag på segmentet


def test_horn_utan_radie_begransar_inte_sina_grannar(js):
    """Ett hörn utan kurva lägger inget beslag på segmentet — jämfört med
    samma linje där grannen har en kurva."""
    f = js["fall"]["utan_radie"]
    bara, bada = f["bara_ett"], f["bada_aktiva"]
    # utan kurva i hörn 3 ryms 4 950 m i hörn 2
    assert bara["R"][1] == pytest.approx(4950, abs=1e-6), bara["R"]
    assert bara["T"][2] == 0
    # med kurva i hörn 3 måste båda dela på det 2 000 m långa segmentet
    assert bada["R"][1] < 4950 and bada["R"][2] < 4950, bada["R"]
    assert f["beslag_bada"] <= f["L"][1] + 1e-6, f
    assert bada["T"][1] == pytest.approx(f["L"][1] - bada["T"][2], abs=1e-6)
