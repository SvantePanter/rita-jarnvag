/* prov_korridor.mjs — kör korridorgeometrin i node och skriver JSON till stdout.
 *
 * Sondens uppgift är att lämna ut *siffror och indata*, inte att döma: domen
 * görs i prov/test_korridor.py, och där mot shapely — en oberoende räkning i
 * samma plan. Varje fall lämnar därför både sidorna och resultatet, så att
 * provet kan räkna om saken själv.
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const har = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Geom = require(path.join(har, "..", "geom.js"));

const O = { x: 320000, y: 6400000 };
function P(x, y) { return { x: O.x + x, y: O.y + y }; }
function lista(par) { return par.map(p => P(p[0], p[1])); }
function prov(parV, parH, alt) {
  const v = lista(parV), h = lista(parH);
  return { v: v, h: h, k: Geom.korridor(v, h, alt) };
}

const fall = {};

/* A. rak korridor: två parallella sidor 120 m isär. Bredden ska vara 120 m
 *    överallt, arean 120 · 2 000 m², och förslutningarna vinkelräta. */
fall.rak = prov([[0, 0], [0, 2000]], [[120, 0], [120, 2000]]);

/* B. kil: sidorna går isär från 100 m till 300 m. Arean är ett parallelltrapets
 *    med höjden 1 000 m och parallellsidorna 100 m och 300 m. */
fall.kil = prov([[0, 0], [0, 1000]], [[100, 0], [300, 1000]]);

/* C. sidorna korsar varandra — ingen giltig korridor, hur man än parar ändarna */
fall.korsande = prov([[0, 0], [0, 1000]], [[200, 0], [-200, 1000]]);

/* D. högersidan ritad i motsatt riktning: bara den korsvisa parningen ger en
 *    slinga utan korsningar (annars ett timglas) */
fall.motsatt_riktning = prov([[0, 0], [0, 1000]], [[120, 1000], [120, 0]]);

/* E. avsmalning mitt på ett segment: vänstersidan har bara två noder, så bara
 *    provpunkterna längs sidan kan hitta den. Minsta bredd är 40 m — med
 *    gränsen 60 m ska den varna, med standardgränsen 30 m inte. */
fall.avsmalning = prov([[0, 0], [0, 2000]],
  [[120, 0], [120, 600], [40, 1000], [120, 1400], [120, 2000]], { breddMin: 60 });
fall.avsmalning_utan_grans = prov([[0, 0], [0, 2000]],
  [[120, 0], [120, 600], [40, 1000], [120, 1400], [120, 2000]]);

/* F. olika nodantal per sida: 3 mot 2 noder, arean 100 · 2 000 m² */
fall.olika_nodantal = prov([[0, 0], [0, 1000], [0, 2000]], [[100, 0], [100, 2000]]);

/* G. sned ändförslutning: högersidan är skjuten 300 m längs korridoren, så
 *    ändytan blir en kil (68° från vinkelrät) */
fall.sned_andforlutning = prov([[0, 0], [0, 1000]], [[120, 300], [120, 1300]]);

/* H. förskjutning: högersidan görs av vänstersidan. Mot shapely i Python.
 *    En rak linje ska hamna exakt d meter till höger, och ett rätvinkligt
 *    hörn (norrut, sedan österut) exakt i (d, L − d). */
fall.forskjut_rak = (() => {
  const p = lista([[0, 0], [0, 1000]]);
  const r = Geom.forskjut(p, 120);
  return { indata: p, punkter: r.punkter, varningar: r.varningar };
})();
fall.forskjut_horn = (() => {
  const p = lista([[0, 0], [0, 100], [100, 100]]);
  const r = Geom.forskjut(p, 10);
  return { indata: p, punkter: r.punkter, varningar: r.varningar };
})();
fall.forskjut_krokig = (() => {
  const p = lista([[0, 0], [400, 60], [900, 300], [1300, 900], [1500, 1600]]);
  const r = Geom.forskjut(p, 120);
  return { indata: p, punkter: r.punkter, varningar: r.varningar };
})();

/* I. korridor mellan två färdiga linjer med 4 950 m-radier — det appen faktiskt
 *    matar korridoren med: punkterna som blir kvar efter att bågarna satts in. */
function fardigLinje(par, R) {
  const sw = lista(par);
  const aktiva = sw.map((_, i) => i > 0 && i < sw.length - 1);
  const f = Geom.losRadier(sw, R, aktiva, 25);
  const b = Geom.byggLinje(sw, f, aktiva);
  return b.punkter;
}
fall.med_radier = (() => {
  const vanster = fardigLinje([[0, 0], [2000, 300], [3400, 2200], [5200, 3000], [7000, 2600]], 4950);
  const hoger = Geom.forskjut(vanster, 150).punkter;
  return { v: vanster, h: hoger, k: Geom.korridor(vanster, hoger) };
})();

/* J. ringen i sig: area och enkelhet för en handräknad fyrkant 100 × 200 m */
fall.ring = (() => {
  const medurs = lista([[0, 0], [0, 200], [100, 200], [100, 0]]);
  const moturs = lista([[0, 0], [100, 0], [100, 200], [0, 200]]);
  return { medurs: medurs, moturs: moturs, area_medurs: Geom.ringArea(medurs),
    area_moturs: Geom.ringArea(moturs), enkel: Geom.ringArEnkel(medurs) };
})();

/* K. en kontroll av att sondens egna SWEREF-punkter ligger där de ska
 *    (jämförs mot pyproj i Python, som i prov_geom.mjs). */
fall.projektion = [[57.705327, 11.958144], [59.329323, 18.068581], [67.855800, 20.225300]]
  .map(([lat, lon]) => {
    const s = Geom.tillSweref(lat, lon);
    return { lat: lat, lon: lon, e: s.e, n: s.n, x: s.x, y: s.y };
  });

process.stdout.write(JSON.stringify({ fall: fall, origo: O }, null, 1) + "\n");
