#!/bin/bash
# Copies every image the site used to hotlink (old Webflow CDN + 3 Sons' Google profile) into assets/img.
# Reads _build/image-sources.txt (made by _build/build.py). Run from the repo root. Stops on any failure.
set -euo pipefail
cd "$(dirname "$0")/.."
n=0
while read -r dest url; do
  [[ -z "${dest:-}" || "$dest" == \#* ]] && continue
  mkdir -p "$(dirname "$dest")"
  case "$dest" in *.jpg) acc='image/jpeg' ;; *.webp) acc='image/webp' ;; *) acc='image/svg+xml,*/*;q=0.5' ;; esac
  curl -fsSL --retry 2 -H "Accept: $acc" -o "$dest.tmp" "$url"
  kind=$(file -b --mime-type "$dest.tmp")
  case "$dest" in
    *.jpg)  [[ "$kind" == image/jpeg ]] ;;
    *.webp) [[ "$kind" == image/webp ]] ;;
    *.svg)  [[ "$kind" == image/svg+xml || "$kind" == text/xml || "$kind" == text/plain || "$kind" == text/html ]] ;;
  esac || { echo "WRONG FILE TYPE for $dest: $kind"; exit 1; }
  [[ $(wc -c < "$dest.tmp") -gt 500 ]] || { echo "TOO SMALL: $dest"; exit 1; }
  mv -f "$dest.tmp" "$dest"; n=$((n+1)); echo "ok  $dest ($kind, $(wc -c < "$dest" | tr -d ' ') bytes)"
done < _build/image-sources.txt
echo "IMAGES OK: $n files"
