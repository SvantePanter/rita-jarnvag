#!/usr/bin/env python3
"""Skriver ut provkörningens siffror läsbart (samma JSON som provet använder)."""
import json
import subprocess
import sys

ROT = "/opt/data/rita-jarnvag-build"
r = subprocess.run(["node", ROT + "/prov/prov_geom.mjs"], capture_output=True, text=True, cwd=ROT)
if r.returncode:
    sys.exit(r.stderr[-1500:])
d = json.loads(r.stdout)
print("projektion, största rundtursfel (grad): %.2e"
      % max(max(p["fel_lat_grad"], p["fel_lon_grad"]) for p in d["projektion"]))
h = d["horn"]
print("hörn: delta %.4f°  T %.3f m  båglängd %.3f m  radieavvikelse %.2e m  kordavvikelse %.2e m"
      % (h["delta_grad"], h["T"], h["baglangd"], h["max_avvikelse_fran_radien"],
         abs(h["kordlangd"] - h["kordlangd_analytisk"])))
for namn, f in d["fall"].items():
    print("--", namn)
    print("   L    :", [round(x, 1) for x in f.get("L", [])])
    print("   R    :", [None if x is None else round(x, 1) for x in f.get("R", [])])
    print("   T    :", [round(x, 1) for x in f.get("T", [])])
    print("   delta:", [None if x is None else round(x, 3) for x in f.get("delta_grad", [])])
    if f.get("vag"):
        for i, t in enumerate(f["vag"]):
            if t:
                print("   hörn %d: %s" % (i + 1, t))
    for nyckel in ("bara_ett", "bada_aktiva"):
        if nyckel in f:
            print("   %-12s R %s  T %s" % (nyckel,
                  [None if x is None else round(x, 1) for x in f[nyckel]["R"]],
                  [round(x, 1) for x in f[nyckel]["T"]]))
    for s in f.get("tangentkoll", []):
        print("   segment %d: L %.1f  beslag %.1f  kvar %.1f" % (s["segment"], s["L"], s["beslag"], s["kvar"]))
    if "langd_hornlinje" in f:
        print("   längd hörnlinje %.1f m → med radier %.1f m (%d bågar)"
              % (f["langd_hornlinje"], f["langd_med_radier"], f["antal_bagar"]))
