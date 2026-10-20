/* rita-jarnvag — geometri och projektion.
 *
 * Ren funktionsmodul: ingen DOM, ingen karta. Laddas av index.html som
 * <script src="geom.js"> (window.Geom) och av proven i node (module.exports).
 *
 * Två saker bor här, och båda är räknade — inte gissade:
 *  1. SWEREF 99 TM (EPSG:3006) som Transversal Mercator enligt Snyder.
 *     All längd, alla radier och alla vinklar räknas i meter i det planet.
 *     Att räkna i grader är inte att räkna (en longitudgrad är 111 km vid
 *     ekvatorn och 59 km i Göteborg).
 *  2. Hörngeometrin: en cirkelbåge med radien R som tangerar två raka
 *     segment. Tangentlängden är T = R·tan(Δ/2), där Δ är
 *     riktningsändringen i hörnet.
 */
(function (rot, fabrik) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = fabrik();
  else rot.Geom = fabrik();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var A = 6378137.0;            // GRS80
  var F = 1 / 298.257222101;
  var E2 = F * (2 - F);
  var EP2 = E2 / (1 - E2);      // e'^2
  var K0 = 0.9996;              // SWEREF 99 TM
  var LON0 = 15 * Math.PI / 180;
  var FE = 500000.0;
  var FN = 0.0;
  var GRAD = 180 / Math.PI;

  var LON_MIN = -2 * Math.PI, LON_MAX = 2 * Math.PI;

  /* En punkt i planet bär både x/y (matematiken) och e/n (svensk namnvana
   * för öst/nord i SWEREF 99 TM). Samma punkt duger då i båda sammanhangen —
   * och det var precis den här dubbla namnvanan som gav NaN längder när bara
   * den ena fanns. */
  function P(x, y) { return { x: x, y: y, e: x, n: y }; }

  function meridianboge(fi) {
    var e2 = E2, e4 = e2 * e2, e6 = e4 * e2;
    return A * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * fi
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * fi)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * fi)
      - (35 * e6 / 3072) * Math.sin(6 * fi));
  }

  /* Latitud/longitud i grader -> SWEREF 99 TM. {e, n} i meter. */
  function tillSweref(lat, lon) {
    var fi = lat / GRAD;
    var la = lon / GRAD;
    var sin = Math.sin(fi), cos = Math.cos(fi), tan = Math.tan(fi);
    var N = A / Math.sqrt(1 - E2 * sin * sin);
    var T = tan * tan;
    var C = EP2 * cos * cos;
    var a = Math.cos(fi) * (la - LON0);
    var M = meridianboge(fi);
    var e = FE + K0 * N * (a + (1 - T + C) * Math.pow(a, 3) / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Math.pow(a, 5) / 120);
    var n = FN + K0 * (M + N * tan * (a * a / 2
      + (5 - T + 9 * C + 4 * C * C) * Math.pow(a, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Math.pow(a, 6) / 720));
    return P(e, n);
  }

  /* SWEREF 99 TM -> latitud/longitud i grader. {lat, lon}.
   *
   * Seriesvaret ur Snyder (8-17…8-25) är startvärde, och sedan rättas det med
   * vår egen framåtriktning tills residualen är borta. Serieavkortningen ger
   * annars ~0,15 m i longitud 7° från centralmeridianen (uppmätt i Luleå) —
   * litet, men det är en förlust som inte behöver finnas. */
  function tillWgs84(e, n) {
    var x = e - FE;
    var y = n - FN;
    var M = y / K0;
    var mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * Math.pow(E2, 3) / 256));
    var e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    var fi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
      + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var sin = Math.sin(fi1), cos = Math.cos(fi1), tan = Math.tan(fi1);
    var C1 = EP2 * cos * cos;
    var T1 = tan * tan;
    var N1 = A / Math.sqrt(1 - E2 * sin * sin);
    var R1 = A * (1 - E2) / Math.pow(1 - E2 * sin * sin, 1.5);
    var D = x / (N1 * K0);
    var fi = fi1 - (N1 * tan / R1) * (D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * Math.pow(D, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var la = LON0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cos;

    for (var i = 0; i < 5; i++) {
      var fram = tillSweref(fi * GRAD, la * GRAD);
      var dE = e - fram.e, dN = n - fram.n;
      if (Math.abs(dE) < 1e-7 && Math.abs(dN) < 1e-7) break;
      var s2 = Math.sin(fi);
      var Nm = A / Math.sqrt(1 - E2 * s2 * s2);
      var Rm = A * (1 - E2) / Math.pow(1 - E2 * s2 * s2, 1.5);
      fi += dN / (K0 * Rm);
      la += dE / (K0 * Nm * Math.cos(fi));
    }
    while (la > LON_MAX) la -= 2 * Math.PI;
    while (la < LON_MIN) la += 2 * Math.PI;
    return { lat: fi * GRAD, lon: la * GRAD };
  }

  function avstand(p, q) {
    return Math.hypot(q.x - p.x, q.y - p.y);
  }

  function enhet(v) {
    var l = Math.hypot(v.x, v.y);
    if (!(l > 0)) return { x: 0, y: 0, noll: true };
    return { x: v.x / l, y: v.y / l, noll: false };
  }

  /* Ett tal som svensk text: decimalkomma, tunt mellanslag mellan tusentalen,
   * och minustecken (inte bindestreck). Enda stället där tal blir text. */
  function tusental(x, dec) {
    var d = dec === undefined ? 0 : dec;
    var s = Math.abs(x).toFixed(d).replace(".", ",");
    var delar = s.split(",");
    delar[0] = delar[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
    return (x < 0 ? "\u2212" : "") + delar.join(",");
  }

  /* Riktningsändringen i ett hörn: vinkeln mellan inkommande och utgående
   * segment, med tecken (> 0 = svänger vänster). 0 = rakt, ±π = backar. */
  function riktningsandring(p0, p1, p2) {
    var u1 = enhet({ x: p1.x - p0.x, y: p1.y - p0.y });
    var u2 = enhet({ x: p2.x - p1.x, y: p2.y - p1.y });
    if (u1.noll || u2.noll) return null;       // två noder på samma plats
    return Math.atan2(u1.x * u2.y - u1.y * u2.x, u1.x * u2.x + u1.y * u2.y);
  }

  /* Tangentlängden för en cirkel med radien R i ett hörn med riktnings-
   * ändringen delta: T = R·tan(|delta|/2). */
  function tangentlangd(R, delta) {
    var t = Math.tan(Math.abs(delta) / 2);
    return { T: R * t, tan: t };
  }

  /* En cirkelbåge med radien R som tangerar de två raka segmenten i hörnet
   * p1 (mellan p0 och p2). Returnerar PC, PT, medelpunkt, bågens punkter,
   * tangentlängden och riktningsändringen. Punkter i samma plan som indata. */
  function horn(p0, p1, p2, R, steg) {
    var u1 = enhet({ x: p1.x - p0.x, y: p1.y - p0.y });
    var u2 = enhet({ x: p2.x - p1.x, y: p2.y - p1.y });
    var delta = riktningsandring(p0, p1, p2);
    if (delta === null) {
      return { fel: "två noder ligger på samma plats", delta: 0, deltaGrad: 0, R: R, T: 0 };
    }
    var tl = tangentlangd(R, delta);
    if (!isFinite(tl.T) || tl.tan > 1e6) {
      return { fel: "ingen ändlig tangentlängd — hörnet vänder 180 grader",
        delta: delta, deltaGrad: delta * GRAD, R: R, T: Infinity };
    }
    var T = tl.T;
    var pc = P(p1.x - u1.x * T, p1.y - u1.y * T);
    var pt = P(p1.x + u2.x * T, p1.y + u2.y * T);
    var n1 = { x: -u1.y, y: u1.x };          // vänster normal till u1
    var tecken = delta >= 0 ? 1 : -1;        // medelpunkten ligger på svängsidan
    var c = P(pc.x + tecken * n1.x * R, pc.y + tecken * n1.y * R);
    var a0 = Math.atan2(pc.y - c.y, pc.x - c.x);
    var grader = Math.abs(delta) * GRAD;
    var antal = steg > 0 ? steg : Math.max(8, Math.ceil(grader / 2));
    var punkter = [];
    for (var i = 0; i <= antal; i++) {
      var a = a0 + delta * (i / antal);
      punkter.push(P(c.x + R * Math.cos(a), c.y + R * Math.sin(a)));
    }
    var am = a0 + delta / 2;
    var mitt = P(c.x + R * Math.cos(am), c.y + R * Math.sin(am));
    return {
      delta: delta, deltaGrad: delta * GRAD, R: R, T: T,
      pc: pc, pt: pt, medelpunkt: c, punkter: punkter, mitt: mitt,
      baglangd: R * Math.abs(delta), svangerVanster: delta > 0
    };
  }

  /* Punkt-till-linje-avstånd, för proven (och för att kontrollera att bågen
   * verkligen tangerar de två raka linjerna). */
  function avstandTillLinje(p, a, b) {
    var u = enhet({ x: b.x - a.x, y: b.y - a.y });
    if (u.noll) return avstand(p, a);
    var v = { x: p.x - a.x, y: p.y - a.y };
    return Math.abs(v.x * u.y - v.y * u.x);
  }

  /* --- Radiefördelningen -------------------------------------------------
   *
   * Varje aktivt hörn lägger beslag på tangentlängden T från segmentet före
   * och från segmentet efter (bågen ligger in mot hörnet från båda håll).
   * Kravet är alltså T(i) + T(i+1) <= L(i) för varje segment.
   *
   * Först prövas R_krav överallt. Ryms det inte delas bristen **rättvist**:
   * båda hörnen kring det för korta segmentet skalas ned med samma faktor,
   * så inte det ena hörnet blir en knyck medan grannen behåller sin radie.
   * Sedan växer varje hörn tillbaka mot R_krav så långt dess segment tillåter.
   * Blir radien golvet (R_MIN) är segmentet för kort även för en minimal
   * kurva — det sägs rakt ut i beskedet.
   */
  function losRadier(punkter, R_krav, aktiva, R_MIN) {
    var n = punkter.length;
    var golv = R_MIN > 0 ? R_MIN : 25;
    var tomt = { R: [], delta: [], L: [], T: [], vag: [], omojligt: [], R_krav: R_krav, golv: golv };
    if (n < 3) return tomt;

    var L = [], delta = [], R = [], T = [], vag = [], omojligt = [], skal = [];
    var i, k;
    for (i = 0; i < n - 1; i++) L.push(avstand(punkter[i], punkter[i + 1]));
    for (i = 0; i < n; i++) {
      delta.push(i > 0 && i < n - 1 ? riktningsandring(punkter[i - 1], punkter[i], punkter[i + 1]) : 0);
      R.push(aktiva[i] ? R_krav : null);
      T.push(0);
      vag.push("");
      omojligt.push(false);
      skal.push("");
    }
    for (i = 1; i < n - 1; i++) {
      if (!aktiva[i]) continue;
      if (delta[i] === null) { omojligt[i] = true; skal[i] = "två noder ligger på samma plats"; continue; }
      var tan = Math.tan(Math.abs(delta[i]) / 2);
      if (tan > 1e6) {
        omojligt[i] = true;
        skal[i] = "hörnet vänder 180 grader — ingen ändlig radie ryms";
        R[i] = golv;
      }
    }
    function aktiv(i) { return i > 0 && i < n - 1 && aktiva[i] && !omojligt[i] && delta[i] !== null; }
    /* Tangentlängden räknas på begäran ur hörnets *aktuella* radie. En cachad
     * tabell hann bli inaktuell mitt i ett varv, och då skalade ett hörn ned
     * sig efter sin grannes gamla värde — ett hörn som inte band något alls. */
    function Tfor(j) {
      return aktiv(j) ? tangentlangd(R[j], delta[j]).T : 0;
    }
    function raknaT() {
      for (var j = 1; j < n - 1; j++) T[j] = Tfor(j);
    }
    raknaT();

    // 1–2. Rättvis nedskärning och reparation, i en slinga: ett hörn vars
    //      kurva inte ryms ens på golvradien får ingen kurva alls (att rita en
    //      25-meterskurva i ett hörn som vänder 179° blir en flera kilometer
    //      lång sväng — det ser ut som ett fel, och är ett). Då frigörs
    //      utrymme åt grannen, som prövas på nytt.
    for (var varv2 = 0; varv2 < 20; varv2++) {
      for (k = 0; k < 500; k++) {
        var skalat = false;
        for (i = 1; i < n - 1; i++) {
          if (!aktiv(i)) continue;
          var summa = Tfor(i) + Tfor(i + 1);
          if (summa > L[i] + 1e-9) {
            var f = L[i] / summa;
            R[i] = Math.max(golv, R[i] * f);
            if (aktiv(i + 1)) R[i + 1] = Math.max(golv, R[i + 1] * f);
            skalat = true;
          }
        }
        if (!skalat) break;
      }
      raknaT();
      for (k = 0; k < 500; k++) {
        var fel = false;
        for (i = 1; i < n - 1; i++) {
          if (!aktiv(i)) continue;
          var behov = Tfor(i) + Tfor(i + 1);
          if (behov > L[i] + 1e-9) {
            if (R[i] <= golv + 1e-9 && aktiv(i + 1) && R[i + 1] > golv + 1e-9) {
              R[i + 1] = Math.max(golv, Math.max(0, L[i] - Tfor(i)) / Math.abs(Math.tan(delta[i + 1] / 2)));
            } else if (aktiv(i + 1) && R[i + 1] <= golv + 1e-9 && R[i] > golv + 1e-9) {
              R[i] = Math.max(golv, Math.max(0, L[i] - Tfor(i + 1)) / Math.abs(Math.tan(delta[i] / 2)));
            } else {
              R[i] = Math.max(golv, R[i] * 0.95);
            }
            fel = true;
          }
          if (Tfor(i) > L[i - 1] + 1e-9) {
            R[i] = Math.max(golv, L[i - 1] / Math.abs(Math.tan(delta[i] / 2)));
            fel = true;
          }
        }
        if (!fel) break;
      }
      raknaT();
      var markt = false;
      for (i = 1; i < n - 1; i++) {
        if (!aktiv(i)) continue;
        var forLangt = Tfor(i) > L[i - 1] + 1e-6;
        if (forLangt || Tfor(i) + Tfor(i + 1) > L[i] + 1e-6) {
          var ben = forLangt ? i : i + 1;               // 1-baserat segmentnummer
          omojligt[i] = true;
          skal[i] = "Segment " + ben + " (" + tusental(L[ben - 1]) + " m) är för kort för en kurva på " +
            tusental(golv) + " m i hörn " + (i + 1) + " — ingen radie ritas där.";
          R[i] = golv;
          markt = true;
        }
      }
      if (!markt) break;
    }
    raknaT();
    // 3. Väx tillbaka mot R_krav där utrymmet finns (varje steg kontrolleras
    //    mot grannarnas aktuella tangentlängder, så kravet håller hela vägen).
    for (k = 0; k < 80; k++) {
      var vaxte = false;
      for (i = 1; i < n - 1; i++) {
        if (!aktiv(i)) continue;
        var t = Math.abs(Math.tan(delta[i] / 2));
        if (t < 1e-12) { if (R[i] < R_krav) { R[i] = R_krav; vaxte = true; } continue; }
        var ledF = L[i - 1] - Tfor(i - 1);
        var ledE = L[i] - Tfor(i + 1);
        var rmaks = Math.max(golv, Math.min(R_krav, Math.min(ledF, ledE) / t));
        if (rmaks > R[i] + 1e-9) { R[i] = rmaks; vaxte = true; }
      }
      if (!vaxte) break;
    }
    raknaT();

    // Vad som begränsade varje hörn, för beskedet till användaren.
    for (i = 1; i < n - 1; i++) {
      if (!aktiva[i]) continue;
      if (omojligt[i]) {
        vag[i] = skal[i] || (delta[i] === null ? "två noder ligger på samma plats"
          : "hörnet vänder 180 grader — ingen ändlig radie ryms");
        continue;
      }
      if (R[i] >= R_krav - 1e-6) continue;
      var ledigtFore = L[i - 1] - Tfor(i - 1);
      var ledigtEfter = L[i] - Tfor(i + 1);
      var seg = ledigtFore <= ledigtEfter ? i - 1 : i;
      var delas = seg === i ? aktiv(i + 1) : aktiv(i - 1);
      var nbr = seg === i ? i + 2 : i;                 // 1-baserat hörnnummer
      var hornText = delas ? " i hörn " + Math.min(i + 1, nbr) + " och " + Math.max(i + 1, nbr) : "";
      var segText = "Segment " + (seg + 1) + " (" + tusental(L[seg]) + " m)";
      if (R[i] <= golv + 1e-6) {
        vag[i] = segText + " är för kort även för en minimal kurva på " + tusental(golv) + " m.";
      } else {
        vag[i] = segText + " räcker inte för R " + tusental(R_krav) + " m" + hornText +
          " — radien sänktes till " + tusental(R[i]) + " m" + (delas ? " i båda" : "") + ".";
      }
    }
    return { R: R, delta: delta, L: L, T: T, vag: vag, omojligt: omojligt, R_krav: R_krav, golv: golv };
  }

  /* Bygg den färdiga linjen: raka stycken avkortade i PC/PT, bågar emellan.
   * Returnerar punkter i samma plan som indata, plus per-segment längder. */
  function byggLinje(punkter, fordelning, aktiva) {
    var n = punkter.length;
    var ut = [];
    if (n === 0) return { punkter: ut, bagar: [] };
    ut.push(P(punkter[0].x, punkter[0].y));
    var bagar = [];
    for (var i = 1; i < n - 1; i++) {
      if (!aktiva[i] || fordelning.delta[i] === null || !(fordelning.R[i] > 0)) {
        ut.push({ x: punkter[i].x, y: punkter[i].y });
        continue;
      }
      var h = horn(punkter[i - 1], punkter[i], punkter[i + 1], fordelning.R[i]);
      if (h.fel) { ut.push({ x: punkter[i].x, y: punkter[i].y }); continue; }
      for (var j = 0; j < h.punkter.length; j++) ut.push(h.punkter[j]);
      bagar.push({ horn: i, R: h.R, T: h.T, deltaGrad: h.deltaGrad, mitt: h.mitt,
        pc: h.pc, pt: h.pt, medelpunkt: h.medelpunkt, punkter: h.punkter, baglangd: h.baglangd,
        svangerVanster: h.svangerVanster });
    }
    ut.push({ x: punkter[n - 1].x, y: punkter[n - 1].y });
    return { punkter: stada(ut), bagar: bagar };
  }

  function linjelangd(punkter) {
    var s = 0;
    for (var i = 1; i < punkter.length; i++) s += avstand(punkter[i - 1], punkter[i]);
    return s;
  }

  /* Ta bort punkter som ligger (nästan) på samma plats. Nödvändigt innan
   * riktningar räknas: när radielösaren delar bristen exakt möts två bågar i
   * samma punkt, och en sträcka på 1e-10 m har ingen meningsfull riktning —
   * mittpunktsberäkningen far iväg hundratals meter på en sådan. */
  function stada(punkter, min) {
    min = min === undefined ? 1e-6 : min;
    var ut = [];
    for (var i = 0; i < punkter.length; i++) {
      var p = punkter[i];
      if (ut.length && avstand(ut[ut.length - 1], p) < min) continue;
      ut.push(p);
    }
    if (ut.length > 1 && avstand(ut[0], ut[ut.length - 1]) < min) ut.pop();
    return ut;
  }

  /* ================= polygon och korridor ================= */

  /* Kortaste avståndet från en punkt till ett segment, med fotpunkten. */
  function avstandTillSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var skal = dx * dx + dy * dy;
    var t = skal > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / skal : 0;
    t = Math.max(0, Math.min(1, t));
    var fot = P(a.x + dx * t, a.y + dy * t);
    return { avst: Math.hypot(p.x - fot.x, p.y - fot.y), t: t, fot: fot, i: 0 };
  }

  /* Kortaste avståndet från en punkt till en polylinje. Bredden i en korridor
   * måste mätas så: de två sidorna ritas oberoende av varandra och har därför
   * sällan samma nodantal. */
  function avstandTillPolylinje(p, punkter) {
    var bast = null;
    for (var i = 0; i + 1 < punkter.length; i++) {
      var a = avstandTillSegment(p, punkter[i], punkter[i + 1]);
      a.i = i;
      if (!bast || a.avst < bast.avst) bast = a;
    }
    return bast;                     // null om polylinjen har färre än två punkter
  }

  /* Skär två segment varandra? Ändpunkter som rör vid varandra räknas som träff. */
  function segmentKorsar(a1, a2, b1, b2) {
    var d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    var d2x = b2.x - b1.x, d2y = b2.y - b1.y;
    var nam = d1x * d2y - d1y * d2x;
    if (Math.abs(nam) < 1e-12) return { korsar: false, parallella: true };
    var ex = b1.x - a1.x, ey = b1.y - a1.y;
    var s = (ex * d2y - ey * d2x) / nam;
    var t = (ex * d1y - ey * d1x) / nam;
    if (s < -1e-9 || s > 1 + 1e-9 || t < -1e-9 || t > 1 + 1e-9) return { korsar: false };
    return { korsar: true, s: s, t: t, punkt: P(a1.x + d1x * s, a1.y + d1y * s) };
  }

  /* Skolax i e/n-planet. Positiv area = moturs, vilket är den ordning
   * GeoJSON kräver för en yttre ring (RFC 7946). */
  function ringArea(ring) {
    var a = 0;
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i], q = ring[(i + 1) % ring.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }

  /* Är ringen en slinga utan korsningar? Angränsande segment delar ändpunkt
   * och räknas inte som korsning. */
  function ringArEnkel(ring) {
    var seg = [], m = ring.length, i;
    for (i = 0; i < m; i++) {
      var a = ring[i], b = ring[(i + 1) % m];
      if (avstand(a, b) > 1e-9) seg.push({ i: i, a: a, b: b });
    }
    var korsningar = [];
    for (var x = 0; x < seg.length; x++) {
      for (var y = x + 1; y < seg.length; y++) {
        if (y === x + 1) continue;                        // grannar
        if (x === 0 && y === seg.length - 1) continue;     // första och sista
        var k = segmentKorsar(seg[x].a, seg[x].b, seg[y].a, seg[y].b);
        if (k.korsar) {
          korsningar.push({ i: seg[x].i, j: seg[y].i, punkt: k.punkt });
          if (korsningar.length >= 5) {
            return { ok: false, korsningar: korsningar, antal: "fler än 5" };
          }
        }
      }
    }
    return { ok: korsningar.length === 0, korsningar: korsningar, antal: korsningar.length };
  }

  /* Breddprofil: provpunkter var steg:e meter längs vardera sidan, mätta mot
   * den andra sidan. Att mäta bara i noderna hade missat avsmalningar mitt på
   * ett segment. */
  function korridorbredd(vanster, hoger, steg) {
    steg = steg || 25;
    var profil = [];
    function langs(punkter, mot, sida) {
      var langt = 0, i, k;
      for (i = 0; i + 1 < punkter.length; i++) {
        var seg = avstand(punkter[i], punkter[i + 1]);
        var antal = Math.max(1, Math.ceil(seg / steg));
        for (k = 0; k < antal; k++) {
          var t = k / antal;
          var p = P(punkter[i].x + (punkter[i + 1].x - punkter[i].x) * t,
                    punkter[i].y + (punkter[i + 1].y - punkter[i].y) * t);
          var m = avstandTillPolylinje(p, mot);
          if (m) profil.push({ langs: langt + seg * t, bredd: m.avst, punkt: p, sida: sida });
        }
        langt += seg;
      }
      var sista = punkter[punkter.length - 1];
      var ms = avstandTillPolylinje(sista, mot);
      if (ms) profil.push({ langs: langt, bredd: ms.avst, punkt: P(sista.x, sista.y), sida: sida });
    }
    langs(vanster, hoger, "vanster");
    langs(hoger, vanster, "hoger");
    var min = null, max = null;
    for (var j = 0; j < profil.length; j++) {
      if (!min || profil[j].bredd < min.bredd) min = profil[j];
      if (!max || profil[j].bredd > max.bredd) max = profil[j];
    }
    return { profil: profil, min: min, max: max };
  }

  /* Hur långt från vinkelrät en förslutningslinje ligger, i grader. Riktningarna
   * är sidornas enhetsvektorer vid den änden (tecknet spelar ingen roll). */
  function slutningsvinkel(fran, till, riktningar) {
    var c = enhet({ x: till.x - fran.x, y: till.y - fran.y });
    if (c.noll) return { grad: null, noll: true };
    var varst = 0;
    for (var i = 0; i < riktningar.length; i++) {
      var u = riktningar[i];
      if (!u || u.noll) continue;
      var cos = Math.abs(u.x * c.x + u.y * c.y);
      cos = Math.max(-1, Math.min(1, cos));
      var avv = Math.abs(90 - Math.acos(cos) * 180 / Math.PI);
      if (avv > varst) varst = avv;
    }
    return { grad: varst, noll: false };
  }

  function riktningMellan(a, b) { return enhet({ x: b.x - a.x, y: b.y - a.y }); }

  /* Korridoren av två sidor: ring, area, bredd, förslutningar och de kontroller
   * som avgör om den är ritad som en möjlig korridor.
   *
   * Ringen är vänster framlänges + höger baklänges, alltså förslutning slut mot
   * slut och start mot start. Ritas den ena sidan i motsatt riktning blir den
   * ringen ett timglas — då prövas den korsvisa parningen i stället, och valet
   * rapporteras. */
  function korridor(vanster, hoger, alternativ) {
    alternativ = alternativ || {};
    var steg = alternativ.steg || 25;
    var breddMin = alternativ.breddMin === undefined ? 30 : alternativ.breddMin;
    var breddMax = alternativ.breddMax === undefined ? 400 : alternativ.breddMax;
    var varningar = [];
    var ut = { ok: false, ring: null, parning: null, area_m2: null, ringEnkel: null,
      bredd: null, andar: null, langd: null, medurs: null, varningar: varningar };

    if (!vanster || vanster.length < 2 || !hoger || hoger.length < 2) {
      varningar.push("Båda sidorna behöver minst två noder för att korridoren ska kunna slutas.");
      return ut;
    }
    // Dubbla punkter (två bågar som möts) får inte bli riktningar åt slumpen.
    vanster = stada(vanster);
    hoger = stada(hoger);
    if (vanster.length < 2 || hoger.length < 2) {
      varningar.push("En av sidorna har mindre än två punkter kvar sedan dubbelpunkter " +
        "rensats — kontrollera noderna.");
      return ut;
    }

    var ring1 = vanster.concat(hoger.slice().reverse());   // start mot start
    var ring2 = vanster.concat(hoger);                     // korsvis
    var e1 = ringArEnkel(ring1), e2 = ringArEnkel(ring2);
    var vald, parning, enkel;
    if (e1.ok) { vald = ring1; parning = "start-start/slut-slut"; enkel = e1; }
    else if (e2.ok) {
      vald = ring2; parning = "korsvis"; enkel = e2;
      varningar.push("Sidorna är ritade i motsatt riktning, så ändarna har parats ihop korsvis " +
        "(vänster start mot höger slut). Rita om den ena sidan åt samma håll, annars blir " +
        "korridoren ett timglas.");
    } else { vald = ring1; parning = "start-start/slut-slut"; enkel = e1; }

    var area = ringArea(vald);
    ut.medurs = area < 0;
    ut.ring = ut.medurs ? vald.slice().reverse() : vald.slice();
    ut.parning = parning;
    ut.area_m2 = Math.abs(area);
    ut.ringEnkel = enkel;
    ut.ok = enkel.ok;

    if (!enkel.ok) {
      var k0 = enkel.korsningar[0];
      varningar.push("Korridoren är inte en slinga utan korsningar — konturen skär sig själv vid E " +
        Math.round(k0.punkt.e) + " N " + Math.round(k0.punkt.n) + " (" + enkel.antal +
        " korsningar). Flytta noder tills konturen sluter tätt utan att skära sig.");
    }

    var b = korridorbredd(vanster, hoger, steg);
    ut.bredd = { min: b.min, max: b.max, profil: b.profil, steg: steg };
    function varText(p) {
      return "E " + Math.round(p.punkt.e) + " N " + Math.round(p.punkt.n) + " (" +
        tusental(p.langs) + " m in på " + (p.sida === "vanster" ? "vänstersidan" : "högersidan") + ")";
    }
    if (b.min && b.min.bredd < breddMin - 1e-6) {
      varningar.push("Korridoren är smalare än " + tusental(breddMin) + " m: " +
        tusental(b.min.bredd) + " m vid " + varText(b.min) + " — där ryms ingen järnväg.");
    }
    if (b.max && b.max.bredd > breddMax + 1e-6) {
      varningar.push("Korridoren är bredare än " + tusental(breddMax) + " m: " +
        tusental(b.max.bredd) + " m vid " + varText(b.max) + " — mer mark än korridoren behöver.");
    }

    // Ändförslutningarna. Vid korsvis parning byter ändarna partner.
    var vN = vanster.length, hN = hoger.length;
    var korsvis = parning === "korsvis";
    var aStart = korsvis
      ? slutningsvinkel(vanster[0], hoger[hN - 1], [riktningMellan(vanster[0], vanster[1]),
                                                    riktningMellan(hoger[hN - 1], hoger[hN - 2])])
      : slutningsvinkel(vanster[0], hoger[0], [riktningMellan(vanster[0], vanster[1]),
                                               riktningMellan(hoger[0], hoger[1])]);
    var aSlut = korsvis
      ? slutningsvinkel(vanster[vN - 1], hoger[0], [riktningMellan(vanster[vN - 1], vanster[vN - 2]),
                                                    riktningMellan(hoger[0], hoger[1])])
      : slutningsvinkel(vanster[vN - 1], hoger[hN - 1], [riktningMellan(vanster[vN - 1], vanster[vN - 2]),
                                                     riktningMellan(hoger[hN - 1], hoger[hN - 2])]);
    ut.andar = { start: aStart, slut: aSlut };
    if (aStart.noll) {
      varningar.push("Startnoderna i de två sidorna ligger på samma plats — förslutningen blir en spets.");
    } else if (aStart.grad > 45) {
      varningar.push("Ändförslutningen vid korridorens början ligger " + tusental(aStart.grad) +
        "° från vinkelrät (gräns 45°) — ändytan blir en kil i stället för en snittyta.");
    }
    if (aSlut.noll) {
      varningar.push("Slutnoderna i de två sidorna ligger på samma plats — förslutningen blir en spets.");
    } else if (aSlut.grad > 45) {
      varningar.push("Ändförslutningen vid korridorens slut ligger " + tusental(aSlut.grad) +
        "° från vinkelrät (gräns 45°) — ändytan blir en kil i stället för en snittyta.");
    }

    var lV = linjelangd(vanster), lH = linjelangd(hoger);
    ut.langd = { vanster: lV, hoger: lH, medel: (lV + lH) / 2 };
    return ut;
  }

  /* Förskjut en polylinje d meter åt höger sett i färdriktningen, med
   * miterskarv i hörnen. Gör en korridorsida av den andra. */
  function forskjut(punkter, d) {
    punkter = stada(punkter);
    var n = punkter.length;
    if (n < 2) return { fel: "minst två noder behövs", punkter: [], varningar: [] };
    function ratt(u) { return { x: u.y, y: -u.x }; }
    var ut = [], varningar = [];
    for (var i = 0; i < n; i++) {
      var fore = i > 0 ? riktningMellan(punkter[i - 1], punkter[i]) : null;
      var efter = i < n - 1 ? riktningMellan(punkter[i], punkter[i + 1]) : null;
      var p;
      if (fore && !fore.noll && efter && !efter.noll) {
        var n1 = ratt(fore), n2 = ratt(efter);
        var a = P(punkter[i].x + n1.x * d, punkter[i].y + n1.y * d);
        var bp = P(punkter[i].x + n2.x * d, punkter[i].y + n2.y * d);
        var nam = fore.x * efter.y - fore.y * efter.x;
        if (Math.abs(nam) < 1e-12) {
          p = a;                                    // rak linje: ingen skarv att lösa
        } else {
          var s = ((bp.x - a.x) * efter.y - (bp.y - a.y) * efter.x) / nam;
          p = P(a.x + fore.x * s, a.y + fore.y * s);
        }
      } else if (efter && !efter.noll) {
        var ne = ratt(efter);
        p = P(punkter[i].x + ne.x * d, punkter[i].y + ne.y * d);
      } else if (fore && !fore.noll) {
        var nf = ratt(fore);
        p = P(punkter[i].x + nf.x * d, punkter[i].y + nf.y * d);
      } else {
        p = P(punkter[i].x, punkter[i].y);
      }
      var hopp = Math.hypot(p.x - punkter[i].x, p.y - punkter[i].y);
      if (hopp > 3 * Math.abs(d)) {
        varningar.push("Nod " + (i + 1) + ": förskjutningen hamnar " + tusental(hopp) +
          " m från noden — hörnet är för skarpt för att en förskjutning ska bli en snygg korridorsida.");
      }
      ut.push(p);
    }
    return { punkter: ut, varningar: varningar, fel: null };
  }

  return {
    tillSweref: tillSweref,
    tillWgs84: tillWgs84,
    avstand: avstand,
    avstandTillLinje: avstandTillLinje,
    riktningsandring: riktningsandring,
    tangentlangd: tangentlangd,
    horn: horn,
    losRadier: losRadier,
    byggLinje: byggLinje,
    linjelangd: linjelangd,
    tusental: tusental,
    stada: stada,
    avstandTillSegment: avstandTillSegment,
    avstandTillPolylinje: avstandTillPolylinje,
    segmentKorsar: segmentKorsar,
    ringArea: ringArea,
    ringArEnkel: ringArEnkel,
    korridorbredd: korridorbredd,
    slutningsvinkel: slutningsvinkel,
    korridor: korridor,
    forskjut: forskjut,
    GRS80: { a: A, f: F, e2: E2 },
    SWEREF99TM: { k0: K0, lon0: LON0, falseEasting: FE, falseNorthing: FN }
  };
});
