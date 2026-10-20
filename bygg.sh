#!/bin/sh
# Bygger den publicerade katalogen _site/ och stämplar in version och commit.
#
# Render kör den här raden (static site, buildCommand = "sh bygg.sh") och
# lämnar RENDER_GIT_COMMIT i miljön. Stämpeln hamnar både i helsa.json och i
# själva sidan (bygginfo), så en deploy går att bevisa utifrån på två sätt:
# versionen i /helsa.json OCH commit-strängen i den serverade HTML:en.
set -e

version=$(cat VERSION)
commit="${RENDER_GIT_COMMIT:-okand}"
kort=$(printf '%s' "$commit" | cut -c1-7)
tid=$(date -u +%Y-%m-%dT%H:%M:%SZ)

rm -rf _site
mkdir -p _site
cp index.html geom.js _site/

cat > _site/helsa.json <<SLUT
{"status":"ok","tjanst":"rita-jarnvag","version":"$version","commit":"$commit","commit_kort":"$kort","byggd":"$tid"}
SLUT

# byggstämpeln in i sidan, så att den serverade HTML:en bär samma commit
cat > _site/bygginfo.js <<SLUT
window.__bygginfo = {"version":"$version","commit":"$commit","commit_kort":"$kort","byggd":"$tid"};
SLUT
sed -i 's#<script src="geom.js"></script>#<script src="bygginfo.js"></script>\n<script src="geom.js"></script>#' _site/index.html

echo "byggde _site: rita-jarnvag $version ($kort) $tid"
