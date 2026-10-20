/* prov_import.mjs — läser en GeoJSON med korridorens sidor och bygger korridoren.
 *
 * Skriver JSON: vad läsningen fick ut, korridorens siffror när båda sidorna
 * finns, och ett antal handskrivna fall. prov/test_import.py jämför mot filens
 * egna siffror (area_m2, längder) och mot shapely — filens tal är alltså inte
 * facit från samma kod som läser, utan från den körning som gjorde filen.
 *
 * Kör: node prov/prov_import.mjs [fil.geojson]
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const har = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Geom = require(path.join(har, "..", "geom.js"));

const ut = {};

function korridorUrSidor(sidor) {
  const v = sidor.vanster.map((p) => Geom.tillSweref(p.lat, p.lng));
  const h = sidor.hoger.map((p) => Geom.tillSweref(p.lat, p.lng));
  const k = Geom.korridor(v, h, { steg: 25, breddMin: 30, breddMax: 400 });
  return {
    area_m2: k.area_m2,
    area_ha: k.area_m2 / 1e4,
    langd_vanster_m: k.langd.vanster,
    langd_hoger_m: k.langd.hoger,
    parning: k.parning,
    slinga: k.ringEnkel.ok,
    ring: k.ring ? k.ring.map((p) => [p.e, p.n]) : null,
    varningar: k.varningar,
  };
}

/* A. Ett uttag från appen (eller en fil i samma form). */
const fil = process.argv[2];
if (fil) {
  const text = fs.readFileSync(fil, "utf8");
  const lasen = Geom.lasGeoJsonSidor(text);
  const d = JSON.parse(text);
  const ytan = (d.features || []).map((f) => f.properties || {}).filter((p) => p.namn === "korridor")[0] || {};
  const linjer = (d.features || []).map((f) => f.properties || {}).filter((p) => p.namn === "fardig_linje");
  ut.fil = lasen;
  // Filens egna noder (E/N i SWEREF 99 TM, skrivna av exporten) mot de lästa
  // nodernas koordinater: en exakt jämförelse som inte går via korridorgeometrin.
  const filNoder = { vanster: [], hoger: [] };
  (d.features || []).forEach((f) => {
    const p = f.properties || {};
    const sidaAv = Geom.sidaAvText(p.sida);
    if (sidaAv && p.namn === "nod" && typeof p.E_sweref99tm === "number") {
      filNoder[sidaAv].push({ nr: p.nr, e: p.E_sweref99tm, n: p.N_sweref99tm, R: p.R_m });
    }
  });
  ut.fil_noder = filNoder;
  ut.fil_last_sweref = {
    vanster: lasen.sidor.vanster.map((p) => { const w = Geom.tillSweref(p.lat, p.lng); return [w.e, w.n]; }),
    hoger: lasen.sidor.hoger.map((p) => { const w = Geom.tillSweref(p.lat, p.lng); return [w.e, w.n]; }),
  };
  ut.fil_egna = {
    area_m2: ytan.area_m2,
    langd_vanster_m: ytan.langd_vanster_m,
    langd_hoger_m: ytan.langd_hoger_m,
    R_krav_m: ytan.R_krav_m === undefined ? (linjer[0] || {}).R_krav_m : ytan.R_krav_m,
    kollektions_egenskaper: d.properties || {},
    hornlinje_langder: linjer.reduce((a, x) => {
      const sida = Geom.sidaAvText(x.sida);
      if (sida) a[sida] = (d.features || []).map((f) => f.properties || {})
        .filter((q) => q.namn === "hornlinje" && Geom.sidaAvText(q.sida) === sida)
        .map((q) => q.langd_m)[0];
      return a;
    }, {}),
  };
  if (lasen.sidor.vanster.length > 1 && lasen.sidor.hoger.length > 1) {
    ut.fil_raknad = korridorUrSidor(lasen.sidor);
  }
}

/* B. Handskrivet: två linjer med bara fältet "sida" (det användaren beskriver). */
const enkla = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { sida: "vänster" },
      geometry: { type: "LineString", coordinates: [[11.96, 57.70], [11.99, 57.705], [12.02, 57.71]] } },
    { type: "Feature", properties: { sida: "höger" },
      geometry: { type: "LineString", coordinates: [[11.96, 57.702], [11.99, 57.707], [12.02, 57.712]] } },
  ],
};
ut.enkel = Geom.lasGeoJsonSidor(enkla);
ut.enkel_raknad = ut.enkel.sidor.vanster.length && ut.enkel.sidor.hoger.length
  ? korridorUrSidor(ut.enkel.sidor) : null;

/* C. Samma geometri i SWEREF 99 TM: ska ge samma noder (och "sweref" som svar). */
const iSweref = JSON.parse(JSON.stringify(enkla));
["vänster", "höger"].forEach((sida, i) => {
  iSweref.features[i].geometry.coordinates = enkla.features[i].geometry.coordinates.map((c) => {
    const sw = Geom.tillSweref(c[1], c[0]);
    return [sw.e, sw.n];
  });
});
ut.sweref = Geom.lasGeoJsonSidor(iSweref);

/* D. Linjer utan "sida": ingen sida ska läsas, och ett besked ska komma. */
ut.utan_sida = Geom.lasGeoJsonSidor({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { namn: "något" },
    geometry: { type: "LineString", coordinates: [[11.96, 57.70], [11.99, 57.705]] } }],
});

/* E. Bara en sida. */
ut.bara_vanster = Geom.lasGeoJsonSidor({
  type: "FeatureCollection",
  features: [enkla.features[0]],
});

/* F. Koordinater i SWEREF 99 12 00 (EPSG:3007) men lästa som 99 TM: ska ge ett
 *    besked om att det hamnar utanför Sverige, inte en tyst tom karta.
 *    Talen är pyproj:s 3007-tal för Göteborg respektive korridoren — lästa som
 *    3006 hamnar de i Nordsjön (57,59 N 9,10 Ö). */
ut.fel_zon = Geom.lasGeoJsonSidor({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { sida: "vänster" },
    geometry: { type: "LineString", coordinates: [[147504.636, 6398464.223], [165519.976, 6393445.044]] } }],
});

/* G. Skräp: ska kasta ett tydligt fel. */
try {
  Geom.lasGeoJsonSidor("{\"hej\": 1}");
  ut.skrap = "kastade inget fel";
} catch (e) {
  ut.skrap = e.message;
}

process.stdout.write(JSON.stringify({ fall: ut }, null, 1) + "\n");
