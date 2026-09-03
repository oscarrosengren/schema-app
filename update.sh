#!/bin/bash
# Hämta om alla TimeEdit-flöden, uppdatera kalenderarkivet i cal/ och bygg om index.html.
# Flöden och filupplägg konfigureras i sync.py (FEEDS, MERGED, SPLIT).
set -e
cd "$(dirname "$0")"
exec ./sync.py "$@"
