#!/usr/bin/env python3
"""Mäter båda ändarna: JS framåt mot pyproj, JS bakåt mot pyproj, och JS rundtur."""
import json
import subprocess
from pyproj import Transformer

ROT = "/opt/data/rita-jarnvag-build"
kod = """
const G=require("./geom.js");
const in_=require("fs").readFileSync(0,"utf8");
const pts=JSON.parse(in_);
console.log(JSON.stringify(pts.map(([lat,lon])=>{
  const sw=G.tillSweref(lat,lon); const b=G.tillWgs84(sw.e,sw.n);
  const c=G.tillWgs84(pts.__e||0,0);
  return {lat,lon,e:sw.e,n:sw.n,lat_b:b.lat,lon_b:b.lon};
})));
"""
# enklare: skicka punkter via argv-fil
open(ROT + "/prov/_punkter.json", "w").write(json.dumps([
    [57.705327, 11.958144], [59.329323, 18.068581], [65.584800, 22.154700],
    [67.855800, 20.225300], [60.128200, 15.000000], [55.605000, 13.000000],
]))
r = subprocess.run(["node", "-e", """
const G=require("./geom.js");
const pts=JSON.parse(require("fs").readFileSync("prov/_punkter.json","utf8"));
console.log(JSON.stringify(pts.map(([lat,lon])=>{
  const sw=G.tillSweref(lat,lon); const b=G.tillWgs84(sw.e,sw.n);
  return {lat,lon,e:sw.e,n:sw.n,lat_b:b.lat,lon_b:b.lon};
})));
"""], capture_output=True, text=True, cwd=ROT)
d = json.loads(r.stdout)
fram = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
bak = Transformer.from_crs("EPSG:3006", "EPSG:4326", always_xy=True)
print("%-22s %9s %9s %11s %11s %11s %11s" % ("punkt", "dE(m)", "dN(m)", "bak_lat(m)", "bak_lon(m)", "rund_lat(m)", "rund_lon(m)"))
for p in d:
    e, n = fram.transform(p["lon"], p["lat"])
    lon_p, lat_p = bak.transform(p["e"], p["n"])      # pyproj: alltid_xy -> (lon, lat)
    mlat = 111320.0
    mlon = mlat * abs(__import__("math").cos(__import__("math").radians(p["lat"])))
    print("%-22s %9.4f %9.4f %11.4f %11.4f %11.4f %11.4f" % (
        "%.4f,%.4f" % (p["lat"], p["lon"]), p["e"] - e, p["n"] - n,
        (p["lat_b"] - lat_p) * mlat, (p["lon_b"] - lon_p) * mlon,
        (p["lat_b"] - p["lat"]) * mlat, (p["lon_b"] - p["lon"]) * mlon))
