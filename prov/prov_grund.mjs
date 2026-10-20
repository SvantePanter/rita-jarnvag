/* prov_grund.mjs — kör grunddatakontrollen i node och skriver JSON till stdout.
 *
 * Sonden lämnar ut siffror och *indata* (korridorens ring och grunddatans
 * ringar), så att prov/test_grund.py kan räkna om precis samma sak med shapely.
 * Domen görs i Python — samma princip som projektionen mot pyproj.
 *
 * Utan argument körs påhittade fall. Med `--skarp <fil.json>` körs samma väg på
 * ett uttag av de riktiga AGOL-lagren (filen hämtas med token och ligger utanför
 * repot, eftersom grunddatan inte är publik).
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const har = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Geom = require(path.join(har, "..", "geom.js"));

/* ---------- påhittad grunddata, i SWEREF 99 TM ---------- */

/* En korridor: 1 200 m rak band 150 m brett, i E 320 000–321 200. */
function korridorRing(x0, x1, y, halvbredd) {
  return [
    { x: x0, y: y - halvbredd, e: x0, n: y - halvbredd },
    { x: x1, y: y - halvbredd, e: x1, n: y - halvbredd },
    { x: x1, y: y + halvbredd, e: x1, n: y + halvbredd },
    { x: x0, y: y + halvbredd, e: x0, n: y + halvbredd },
    { x: x0, y: y - halvbredd, e: x0, n: y - halvbredd }
  ];
}

/* Esri-ringar skrivs medurs för yttre ring (negativ skolax), som AGOL gör. */
function esriRing(par) {
  const moturs = par.map(p => [p[0], p[1]]);
  return moturs.slice().reverse();
}

const fall = {};

/* A. LU-korridoren täcker halva korridoren: hälften hamnar utanför. */
{
  const y = 6400000;
  const ring = korridorRing(320000, 321200, y, 75);
  const lu = [{ namn: "LU halva", ringar: [esriRing([[320000, y - 300], [320600, y - 300], [320600, y + 300], [320000, y + 300]])] }];
  fall.lu_delvis = { ring: ring, grund: { lu: lu }, k: Geom.grundkontroll(ring, { lu: lu }) };
}

/* B. LU-korridoren täcker allt: inget utanför. */
{
  const y = 6400000;
  const ring = korridorRing(320000, 321200, y, 75);
  const lu = [{ namn: "LU allt", ringar: [esriRing([[319000, y - 500], [322000, y - 500], [322000, y + 500], [319000, y + 500]])] }];
  fall.lu_helt = { ring: ring, grund: { lu: lu }, k: Geom.grundkontroll(ring, { lu: lu }) };
}

/* C. Inget av LU rör korridoren: allt hamnar utanför. */
{
  const y = 6400000;
  const ring = korridorRing(320000, 321200, y, 75);
  const lu = [{ namn: "LU långt bort", ringar: [esriRing([[400000, 6500000], [401000, 6500000], [401000, 6501000], [400000, 6501000]])] }];
  fall.lu_ingenstans = { ring: ring, grund: { lu: lu }, k: Geom.grundkontroll(ring, { lu: lu }) };
}

/* D. Naturvärden: ett objekt i klass 1 och två i klass 2, som skär korridoren
 *    olika mycket. Ett objekt ligger helt utanför och ska inte räknas. */
{
  const y = 6400000;
  const ring = korridorRing(320000, 321200, y, 75);
  const natur = [
    { id: "N1", namn: "Klass 1 inne", klass: "1", ringar: [esriRing([[320400, y - 50], [320600, y - 50], [320600, y + 50], [320400, y + 50]])] },
    { id: "N2a", namn: "Klass 2 halvt", klass: "2", ringar: [esriRing([[320600, y - 75], [320800, y - 75], [320800, y + 75], [320600, y + 75]])] },
    { id: "N2b", namn: "Klass 2 utanför", klass: "2", ringar: [esriRing([[322000, y - 50], [322100, y - 50], [322100, y + 50], [322000, y + 50]])] }
  ];
  fall.natur = { ring: ring, grund: { natur: natur }, k: Geom.grundkontroll(ring, { natur: natur }) };
}

/* E. Allt på en gång, plus en redan ritad korridor som ligger dubbelt över
 *    halva korridoren. */
{
  const y = 6400000;
  const ring = korridorRing(320000, 321200, y, 75);
  const grund = {
    lu: [{ namn: "LU", ringar: [esriRing([[319900, y - 100], [321000, y - 100], [321000, y + 100], [319900, y + 100]])] }],
    natur: [
      { id: "N1", namn: "Klass 1", klass: "1", ringar: [esriRing([[320300, y - 20], [320500, y - 20], [320500, y + 20], [320300, y + 20]])] },
      { id: "N3", namn: "Klass 3", klass: "3", ringar: [esriRing([[320900, y - 40], [321100, y - 40], [321100, y + 40], [320900, y + 40]])] }
    ],
    ritade: [{ id: "R1", namn: "Södra 1", ringar: [esriRing([[320000, y - 75], [320600, y - 75], [320600, y + 75], [320000, y + 75]])] }]
  };
  fall.allt = { ring: ring, grund: grund, k: Geom.grundkontroll(ring, grund) };
}

/* F. Två naturvärdesobjekt i samma klass som ligger ovanpå varandra inuti
 *    korridoren: ytan ska räknas en gång, inte två. */
{
  const y = 6400000;
  const ring = korridorRing(320000, 321200, y, 75);
  const natur = [
    { id: "O1", namn: "halva", klass: "2", ringar: [esriRing([[320400, y - 50], [320800, y - 50], [320800, y + 50], [320400, y + 50]])] },
    { id: "O2", namn: "andra halvan", klass: "2", ringar: [esriRing([[320600, y - 50], [320900, y - 50], [320900, y + 50], [320600, y + 50]])] }
  ];
  fall.natur_overlapp = { ring: ring, grund: { natur: natur }, k: Geom.grundkontroll(ring, { natur: natur }) };
}

/* G. Esri-ringarnas ordning: yttre ring medurs, hål moturs. Provet prövar att
 *    hålet dras av från arean. */
{
  const poly = Geom.esriTillPolygoner([
    esriRing([[0, 0], [100, 0], [100, 100], [0, 100]]),
    [[30, 30], [70, 30], [70, 70], [30, 70], [30, 30]]
  ]);
  fall.esri_hal = { polygoner: poly, area: Geom.polygonArea(poly) };
}

/* H. Ett uttag av de riktiga lagren, om filen finns (--skarp). */
const skarpIndex = process.argv.indexOf("--skarp");
if (skarpIndex > -1 && process.argv[skarpIndex + 1]) {
  const data = JSON.parse(fs.readFileSync(process.argv[skarpIndex + 1], "utf8"));
  fall.skarp = {
    ring: data.korridor,
    k: Geom.grundkontroll(data.korridor, { lu: data.lu, natur: data.natur, ritade: data.ritade }),
    antal: { lu: data.lu.length, natur: data.natur.length, ritade: data.ritade.length }
  };
}

process.stdout.write(JSON.stringify({ fall: fall }, null, 1) + "\n");
