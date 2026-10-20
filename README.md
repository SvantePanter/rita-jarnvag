# rita-järnväg

Rita en **möjlig korridor** för en järnväg: rita en vänstersida och en
högersida, var och en som raka segment med **radier på 4 950 m** i hörnen.
Appen sluter korridoren till en polygon, mäter bredden vinkelrätt mellan
sidorna, och säger till när korridoren inte är en slinga eller är för smal för
att en järnväg ska rymmas i den.

Ryms inte radien blir den mindre, hörnet flaggas med **!**, och beskedet säger
vilket segment som är för kort.

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

## Korridoren

Korridoren är inte en ny geometri utan två av samma linje: **varje sida har
samma krav** (4 950 m radie i varje hörn, samma radielösare, samma
`!`-flaggor). När båda sidorna har minst två noder förbinds

- vänster startnod med höger startnod, och
- vänster slutnod med höger slutnod,

och ringen sluts: **vänster framlänges + höger baklänges**. Ritas högersidan
åt andra hållet upptäcks det och ändarna paras i stället **korsvis** — annars
blev korridoren ett timglas.

Ringen sluts **på kommando** (knappen *Slut korridoren av båda sidorna*).
Byggdes den så snart båda sidorna hade två noder blev polygonen "färdig" mitt i
ritandet av högersidan, och siffrorna och varningarna handlade om en halvfärdig
korridor. Så länge korridoren är öppen ritas och mäts ingenting; knappen
*Öppna korridoren igen* tar tillbaka den utan att röra noderna.

### Vad som kontrolleras, och varför

- **Bredd**, mätt **vinkelrätt** mot motståndarsidan var 25:e meter (att mäta
  bara i noderna missar en avsmalning mitt på ett segment). Smalare än gränsen
  (30 m) betyder att ingen järnväg ryms; bredare än gränsen (400 m) betyder onödigt
  markanspråk. Båda gränserna är redigerbara, och stället märks ut med **↔**.
- **Enkel slinga**: korsar sidorna varandra lämnas en ring som Leaflet fyller
  med even-odd utan att felet syns i kartan. Korsningarna räknas därför fram
  (geom.js `ringArEnkel`), konturen ritas tjock och röd, och stället märks med
  **✕**.
- **Ändarnas snittyta** ska stå vinkelrätt mot korridoren (högst 45° sned) —
  annars blir korridorens ändar inte byggbara.
- **Area** som skolax i SWEREF-planet, plus längden längs varje sida.

### Den ärliga gränsen

Att båda sidorna *har* 4 950 m-radier betyder **inte** att en järnväg ryms i
korridoren. Det är i strikt mening ett optimeringsproblem: finns det en linje
inuti polygonen som klarar 4 950 m hela vägen? Appen svarar på det med
proxykontrollerna ovan (smal midja, självkorsning, sneda ändar) — de fångar de
vanliga felen, men de är inte ett bevis. En riktig anpassning (medialinje eller
förskjuten mittlinje, prövad mot polygonen, med besked om var det tar stopp och
hur mycket som fattas) är nästa steg.

### Kontrollerna prövas mot shapely

`prov/prov_korridor.mjs` kör korridorgeometrin i node och skriver siffrorna som
JSON. `prov/test_korridor.py` räknar om samma sak med **shapely**: arean, att
ringen är en giltig och moturs polygon, och varje breddmätning som
`LineString.distance` mot andra sidan. JS och shapely är alltså två oberoende
räkningar av samma sak, på samma sätt som projektionen prövas mot pyproj.

## Att köra

```sh
python3 -m http.server 8899     # öppna http://127.0.0.1:8899/
```

### Prov

Proven jämför JavaScriptet mot en **oberoende räkning** — pyproj för
projektionen, analytisk kurvgeometri i Python för bågen:

```sh
node prov/prov_geom.mjs                                  # siffrorna som JSON
node prov/prov_korridor.mjs                              # korridorns siffror som JSON
env -u PYTHONPATH PYTHONPATH= /opt/data/gkw-venv/bin/python -m pytest -q prov/
python3 prov/visa_siffror.py                             # läsbara siffror
```

## Att använda

- **Vänster sida / Höger sida** väljer vilken sida du ritar och redigerar. Den
  andra sidan ligger kvar i kartan, dämpad.
- **Rita**: klicka i kartan, noder läggs i tur och ordning. Ett klick nära ett
  segment infogar noden där. `Esc` avslutar.
- **Redigera**: dra i en nod, klicka + `Delete` tar bort den, dubbelklick på ett
  segment infogar en nod.
- **Sätt radie på alla hörn** lägger R i varje hörn i den aktiva sidan (R går
  att ändra; 4 950 m är standard). Hörn för hörn går också, i hörntabellen.
  Knappen **Skapa högersidan av vänstersidan** förskjuter hela vänstersidan
  parallellt — snabbaste vägen till en färdig korridor.
- **GeoJSON** (korridoren som Polygon med area, längder, bredder och
  varningar som egenskaper, plus båda sidornas linjer, bågar och noder) och
  **Nodlista (CSV)** (en rad per nod i båda sidorna, korridorens siffror sist)
  exporterar. GeoJSON är WGS84 enligt RFC 7946 — SWEREF-koordinaterna ligger
  som egenskaper på noderna.

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
