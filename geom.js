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
    return { punkter: ut, bagar: bagar };
  }

  function linjelangd(punkter) {
    var s = 0;
    for (var i = 1; i < punkter.length; i++) s += avstand(punkter[i - 1], punkter[i]);
    return s;
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
    GRS80: { a: A, f: F, e2: E2 },
    SWEREF99TM: { k0: K0, lon0: LON0, falseEasting: FE, falseNorthing: FN }
  };
});
