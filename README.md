# rita-järnväg

Rita en järnvägslinje som raka segment och lägg in **radier på 4 950 m** i
hörnen. Ryms inte radien blir den mindre, hörnet flaggas med **!**, och
beskedet säger vilket segment som är för kort.

Kartan är Leaflet med OpenStreetMap. Ingen backend, ingen byggkedja: en
HTML-fil, en geometrimodul, och en statisk sajt på Render.

## Vad som är räknat och inte gissat

Allt arbete sker i **SWEREF 99 TM (EPSG:3006)** — längd i grader är inte längd
(en longitudgrad är 111 km vid ekvatorn och 59 km i Göteborg). `geom.js` bär
Transversal Mercator enligt Snyder (GRS80, k0 = 0,9996, centralmeridian 15°E),
och den bakåtriktade vägen rättas med framåtriktningen så att serieavkortningen
inte biter.

Mätt mot `pyproj` (`prov/`): framåt **≤ 2,3 mm**, bakåt **≤ 1,0 mm**,
rundtur **2,5·10⁻¹¹ grad**. Utan rättningssteget gav den bakåtriktade vägen
0,15 m fel i longitud i Luleå, 7,2° från centralmeridianen.

### Radien i ett hörn

En cirkel med radien R som tangerar två raka segment har tangentlängden

```
T = R · tan(Δ/2)          Δ = riktningsändringen i hörnet
```

PC ligger T meter bakåt på det inkommande segmentet, PT T meter framåt på det
utgående, och medelpunkten ligger R meter in på svängsidan. Bågen ritas som en
inskriven polygon (≈2° per stycke).

### När ett segment är för kort

Bågen ligger in mot hörnet från båda håll, så tangentlängden tas från segmentet
före **och** från segmentet efter:

```
T(i) + T(i+1) ≤ L(i)      för varje segment
```

Ryms inte 4 950 m överallt delas bristen **rättvist**: de två hörnen kring det
för korta segmentet skalas ned med samma faktor, och sedan växer varje hörn
tillbaka mot 4 950 m så långt dess segment tillåter. Det är avsiktligt att inte
låta det ena hörnet bli en knyck medan grannen behåller sin radie.

Golvet är 25 m. Blir svaret 25 m är segmentet för kort även för en minimal
kurva, och beskedet säger det. Ett hörn som vänder 180° har ingen ändlig
tangentlängd alls — där ritas ingen båge, och skälet står i beskedet.

## Att köra

```sh
python3 -m http.server 8899     # öppna http://127.0.0.1:8899/
```

### Prov

Proven jämför JavaScriptet mot en **oberoende räkning** — pyproj för
projektionen, analytisk kurvgeometri i Python för bågen:

```sh
node prov/prov_geom.mjs                                  # siffrorna som JSON
env -u PYTHONPATH PYTHONPATH= /opt/data/gkw-venv/bin/python -m pytest -q prov/
python3 prov/visa_siffror.py                             # läsbara siffror
```

## Att använda

- **Rita**: klicka i kartan, noder läggs i tur och ordning. Ett klick nära ett
  segment infogar noden där. `Esc` avslutar.
- **Redigera**: dra i en nod, klicka + `Delete` tar bort den, dubbelklick på ett
  segment infogar en nod.
- **Sätt radie på alla hörn** lägger R i varje hörn (R går att ändra; 4 950 m är
  standard). Hörn för hörn går också, i hörntabellen.
- **GeoJSON** och **Nodlista (CSV)** exporterar. GeoJSON är WGS84 enligt
  RFC 7946 — SWEREF-koordinaterna ligger som egenskaper på noderna.

## Drift

Statisk sajt på Render: **https://rita-jarnvag.onrender.com** (repo
`SvantePanter/rita-jarnvag`). Byggd av `bygg.sh`, som stämplar version ur
`VERSION` och commit ur `RENDER_GIT_COMMIT` in i både `helsa.json` och den
serverade HTML:en. Alltså två vittnen på samma deploy: stämpeln i sidfoten och
`/helsa.json` ska visa samma commit.

Tjänsten skapades via Render-API:t (`type` = `static_site`,
`serviceDetails.buildCommand` = `sh bygg.sh`, `publishPath` = `_site`,
`autoDeploy` = `yes` — alltså deployas varje push till `main`).
`render.yaml` finns för den som vill återskapa den som Blueprint. Sajten är
helt statisk och har inga hemligheter, så inga miljövariabler behövs.
