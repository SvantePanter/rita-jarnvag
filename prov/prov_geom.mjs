/* prov/prov_geom.mjs — kör geom.js i node och skriver resultatet som JSON.
 *
 * Läser inget, skriver inget: Pythonprovet (prov/test_rita_jarnvag.py) jämför
 * siffrorna mot pyproj och mot en oberoende kurvberäkning.
 *
 *   node prov/prov_geom.mjs
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const har = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Geom = require(path.join(har, "..", "geom.js"));

const ut = {};

/* 1. Projektionen: lat/lon -> SWEREF 99 TM och tillbaka. */
const punkter = [
  [57.705327, 11.958144],   // Stenpiren, Göteborg
  [57.679737, 12.001810],   // Krokslätt
  [59.329323, 18.068581],   // Stockholm
  [55.605000, 13.000000],   // Skåne
  [65.584800, 22.154700],   // Luleå
  [67.855800, 20.225300],   // Kiruna
  [60.128200, 15.000000]    // 15°E (centralmeridianen)
];
ut.projektion = punkter.map(([lat, lon]) => {
  const sw = Geom.tillSweref(lat, lon);
  const tillbaka = Geom.tillWgs84(sw.e, sw.n);
  return {
    lat, lon, e: sw.e, n: sw.n,
    lat_tillbaka: tillbaka.lat, lon_tillbaka: tillbaka.lon,
    fel_lat_grad: Math.abs(tillbaka.lat - lat),
    fel_lon_grad: Math.abs(tillbaka.lon - lon)
  };
});

/* 2. Ett hörn: pc, pt, medelpunkt, bågens punkter. */
const p0 = { x: 321000, y: 6399500 };
const p1 = { x: 325500, y: 6399800 };
const p2 = { x: 329900, y: 6397900 };
const R = 4950;
const h = Geom.horn(p0, p1, p2, R);
ut.horn = {
  delta_grad: h.deltaGrad, R: h.R, T: h.T, pc: h.pc, pt: h.pt, medelpunkt: h.medelpunkt,
  antal_punkter: h.punkter.length,
  forsta: h.punkter[0], sista: h.punkter[h.punkter.length - 1], mitt: h.mitt,
  baglangd: h.baglangd,
  avstand_medelpunkt_till_pc: Geom.avstand(h.medelpunkt, h.pc),
  avstand_medelpunkt_till_pt: Geom.avstand(h.medelpunkt, h.pt),
  avstand_medelpunkt_till_linje_in: Geom.avstandTillLinje(h.medelpunkt, p0, p1),
  avstand_medelpunkt_till_linje_ut: Geom.avstandTillLinje(h.medelpunkt, p1, p2),
  avstand_pc_till_p1: Geom.avstand(h.pc, p1),
  avstand_pt_till_p1: Geom.avstand(h.pt, p1),
  avstand_medelpunkt_till_mitt: Geom.avstand(h.medelpunkt, h.mitt),
  alla_punkter_pa_radien: h.punkter.every(q => Math.abs(Geom.avstand(h.medelpunkt, q) - R) < 1e-6),
  max_avvikelse_fran_radien: Math.max(...h.punkter.map(q => Math.abs(Geom.avstand(h.medelpunkt, q) - R))),
  kordlangd: (() => {                       // den inskrivna polygonens längd
    let s = 0;
    for (let i = 1; i < h.punkter.length; i++) s += Geom.avstand(h.punkter[i - 1], h.punkter[i]);
    return s;
  })(),
  kordlangd_analytisk: h.punkter.length > 1
    ? (h.punkter.length - 1) * 2 * R * Math.sin(Math.abs(h.delta) / (2 * (h.punkter.length - 1)))
    : 0,
  svept_vinkel: (() => {                    // summan av svängarna i polygonen = |delta|
    let sum = 0;
    for (let i = 1; i < h.punkter.length - 1; i++) {
      const a = { x: h.punkter[i].x - h.punkter[i - 1].x, y: h.punkter[i].y - h.punkter[i - 1].y };
      const b = { x: h.punkter[i + 1].x - h.punkter[i].x, y: h.punkter[i + 1].y - h.punkter[i].y };
      sum += Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
    }
    return sum;
  })()
};

/* 3. Radiefördelningen. */
const fall = {};

// A: exemplet ur appen — läses ur index.html så att provet följer appens egen linje
const exempel = (() => {
  const html = require("fs").readFileSync(path.join(har, "..", "index.html"), "utf8");
  const m = html.match(/var EXEMPEL = \[([\s\S]*?)\];/);
  if (!m) throw new Error("hittar inte EXEMPEL i index.html");
  const par = [...m[1].matchAll(/\[([-\d.]+),\s*([-\d.]+)\]/g)]
    .map(p => ({ x: Number(p[1]), y: Number(p[2]) }));
  if (par.length < 3) throw new Error("EXEMPEL har färre än tre noder");
  return par;
})();
fall.exempel = (() => {
  const aktiva = exempel.map((_, i) => i > 0 && i < exempel.length - 1);
  const f = Geom.losRadier(exempel, 4950, aktiva, 25);
  const linje = Geom.byggLinje(exempel, f, aktiva);
  return {
    L: f.L, delta_grad: f.delta.map(d => (d === null ? null : d * 180 / Math.PI)),
    R: f.R, T: f.T, vag: f.vag, aktiva,
    langd_hornlinje: Geom.linjelangd(exempel),
    langd_med_radier: Geom.linjelangd(linje.punkter),
    antal_bagar: linje.bagar.length,
    baglangder: linje.bagar.map(b => b.baglangd),
    tangentkoll: f.L.map((L, i) => {
      const fore = aktiva[i] && f.T[i] != null ? f.T[i] : 0;
      const efter = aktiva[i + 1] && f.T[i + 1] != null ? f.T[i + 1] : 0;
      return { segment: i + 1, L, beslag: fore + efter, kvar: L - (fore + efter) };
    })
  };
})();

// B: gott om plats — radien ska bli exakt den efterfrågade
fall.gott_om_plats = (() => {
  const rad = 30 * Math.PI / 180;
  const p = [
    { x: 320000, y: 6400000 },
    { x: 325000, y: 6400000 },
    { x: 325000 + 5000 * Math.cos(-rad), y: 6400000 + 5000 * Math.sin(-rad) }
  ];
  const aktiva = [false, true, false];
  const f = Geom.losRadier(p, 4950, aktiva, 25);
  const linje = Geom.byggLinje(p, f, aktiva);
  return { R: f.R, T: f.T, delta_grad: f.delta.map(d => d * 180 / Math.PI),
    langd: Geom.linjelangd(p), langd_med_radier: Geom.linjelangd(linje.punkter),
    bagar: linje.bagar.length,
    punkter_i_bagen: linje.bagar.map(b => b.punkter.length) };
})();

// C: ett hörn som vänder nästan 180 grader — ingen ändlig radie ryms
fall.vandning = (() => {
  const p = [
    { x: 320000, y: 6400000 },
    { x: 325000, y: 6400000 },
    { x: 320000, y: 6400000.001 }
  ];
  const aktiva = [false, true, false];
  const f = Geom.losRadier(p, 4950, aktiva, 25);
  const linje = Geom.byggLinje(p, f, aktiva);
  const h = Geom.horn(p[0], p[1], p[2], f.R[1]);
  return { R: f.R, T: f.T, delta_grad: f.delta.map(d => (d === null ? null : d * 180 / Math.PI)),
    vag: f.vag, omojligt: f.omojligt, antal_bagar: linje.bagar.length,
    horn_fel: h.fel || null,
    alla_tal_ar_andliga: f.R.every(r => r === null || Number.isFinite(r))
      && f.T.every(t => Number.isFinite(t)) };
})();

// D: ett kort segment där grannen har radie — jämför med samma linje där
//    grannen inte har någon kurva
fall.utan_radie = (() => {
  const p = [
    { x: 320000, y: 6399800 }, { x: 320900, y: 6400000 },
    { x: 322900, y: 6400000 }, { x: 325400, y: 6402500 }
  ];
  const bara = Geom.losRadier(p, 4950, [false, true, false, false], 25);
  const bada = Geom.losRadier(p, 4950, [false, true, true, false], 25);
  return {
    L: bara.L,
    delta_grad: bara.delta.map(d => (d === null ? null : d * 180 / Math.PI)),
    bara_ett: { R: bara.R, T: bara.T },
    bada_aktiva: { R: bada.R, T: bada.T, vag: bada.vag },
    beslag_bada: bada.T[1] + bada.T[2]
  };
})();

// E: två hörn med stora riktningsändringar på ett kort ben (uppmätt i appen
//    2026-10-20: 1 116 m, 792 m, 909 m och Δ 82,5° / −91,6°). Det var här den
//    cacheade tangentlängden skalade ned fel hörn.
fall.tva_korta_ben = (() => {
  const p = [
    [318248.437, 6399401.541], [319171.856, 6400028.964],
    [318815.720, 6400736.149], [319638.510, 6401122.913]
  ].map(([e, n]) => ({ x: e, y: n }));
  const aktiva = [false, true, true, false];
  const f = Geom.losRadier(p, 4950, aktiva, 25);
  return { L: f.L, R: f.R, T: f.T, vag: f.vag, delta_grad: f.delta.map(d => d * 180 / Math.PI),
    beslag: f.L.map((L, i) => (f.T[i] || 0) + (f.T[i + 1] || 0)) };
})();

ut.fall = fall;

/* 4. Punktens namnvanor och en längd mätt i det planet: geometrin räknar i
 *    x/y, men svensk namnvana (och appen) säger e/n. Båda måste finnas. */
{
  const a = Geom.tillSweref(57.705327, 11.958144);
  const b = Geom.tillSweref(57.679737, 12.001810);
  ut.punkt = { x: a.x, y: a.y, e: a.e, n: a.n,
    x_ar_e: a.x === a.e, y_ar_n: a.y === a.n };
  ut.langd = { a: { lat: 57.705327, lon: 11.958144 }, b: { lat: 57.679737, lon: 12.001810 },
    langd_js: Geom.avstand(a, b) };
}

/* 5. Slumpprov: 300 linjer med 3–8 noder och slumpvis valda hörn. Det är
 *    lösarens löfte (T(i)+T(i+1) ≤ L(i)) som prövas, inte ett exempel. */
ut.slump = (() => {
  let s = 20261020;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const GOLV = 25;
  let antal = 0, brott = 0, oandliga = 0, overKrav = 0;
  let omojligaBen = 0, oforklarade = 0, storstaOverskridande = 0, storstaOverskridandeOmogligt = 0;
  let toppadeKon = 0, toppadeUtanBesk = 0;
  const exempel = [];
  for (let k = 0; k < 300; k++) {
    const n = 3 + Math.floor(rnd() * 6);
    const p = [{ x: 320000, y: 6400000 }];
    for (let i = 1; i < n; i++) {
      const v = rnd() * 2 * Math.PI, l = 100 + rnd() * 6000;
      p.push({ x: p[i - 1].x + l * Math.cos(v), y: p[i - 1].y + l * Math.sin(v) });
    }
    const aktiva = p.map((_, i) => i > 0 && i < p.length - 1 && rnd() > 0.2);
    const f = Geom.losRadier(p, 4950, aktiva, GOLV);
    antal++;
    // minsta möjliga beslag: golvradiens tangent (0 för hörn utan kurva)
    const tmin = i => (aktiva[i] && i > 0 && i < n - 1 && f.delta[i] !== null && !f.omojligt[i])
      ? GOLV * Math.abs(Math.tan(f.delta[i] / 2)) : 0;
    for (let i = 0; i < f.L.length; i++) {
      const beslag = (f.T[i] || 0) + (f.T[i + 1] || 0);
      const overskridande = beslag - f.L[i];
      const mojligt = tmin(i) + tmin(i + 1) <= f.L[i] + 1e-6;
      if (mojligt) {
        if (overskridande > 1e-6) { brott++; storstaOverskridande = Math.max(storstaOverskridande, overskridande); }
      } else {
        // ingen lösning finns: golvkurvan ryms inte ensam. Då ska hörnet säga det.
        omojligaBen++;
        storstaOverskridandeOmogligt = Math.max(storstaOverskridandeOmogligt, overskridande);
        const sagt = [i, i + 1].some(j => aktiva[j] && f.vag[j] && f.vag[j].length > 0);
        if (!sagt) {
          oforklarade++;
          if (exempel.length < 3) exempel.push({ L: f.L[i], delta: [f.delta[i], f.delta[i + 1]],
            R: [f.R[i], f.R[i + 1]], T: [f.T[i], f.T[i + 1]] });
        }
      }
    }
    f.R.forEach(r => { if (r !== null && !Number.isFinite(r)) oandliga++; });
    f.T.forEach(t => { if (!Number.isFinite(t)) oandliga++; });
    f.R.forEach(r => { if (r !== null && r > 4950 + 1e-6) overKrav++; });
    for (let i = 1; i < n - 1; i++) {
      if (!aktiva[i] || !f.omojligt[i]) continue;
      toppadeKon++;
      if (!f.vag[i] || f.vag[i].indexOf("ingen radie ritas") < 0) toppadeUtanBesk++;
    }
  }
  return { antal, brott, oandliga, overKrav, omojligaBen, oforklarade,
    toppadeKon, toppadeUtanBesk, storstaOverskridande, storstaOverskridandeOmogligt, exempel };
})();

/* 6. Den bakåtriktade vägen: SWEREF 99 TM -> grader, för jämförelse mot pyproj. */
ut.invers = [
  { e: 318760.170, n: 6399972.407 },
  { e: 719583.123, n: 7536069.971 },   // Luleå, 7,2° från centralmeridianen
  { e: 500000, n: 6665688.672 },       // på 15°E
  { e: 261000.000, n: 6150000.000 }    // 24° väster om centralmeridianen
].map(p => {
  const g = Geom.tillWgs84(p.e, p.n);
  const fram = Geom.tillSweref(g.lat, g.lon);
  return { e: p.e, n: p.n, lat: g.lat, lon: g.lon,
    dE: fram.e - p.e, dN: fram.n - p.n };
});

process.stdout.write(JSON.stringify(ut));
