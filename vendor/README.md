# vendor/

`polygon-clipping.js` — polygon-clipping 0.15.7, MIT, orörd kopia från
`https://unpkg.com/polygon-clipping@0.15.7/dist/polygon-clipping.umd.js`.

Behövs för snitt, union och differens mellan korridoren och grunddatan (LU,
naturvärden, redan ritade korridorer). Filen innehåller sina egna
licenshuvuden, bland annat splaytree (MIT, Microsoft Corporation).

Prövas mot shapely i `prov/test_grund.py`: samma kontroll räknas om med ett
oberoende bibliotek, så att inte bara vårt eget antagande bekräftas.