#!/usr/bin/env bash
# RESTAURACIÓN: sube todas las imágenes de imagenes/ al bucket de un proyecto
# de Supabase (el bucket tiene que existir y ser público).
# Uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... bash scripts/subir-imagenes.sh
set -euo pipefail

BUCKET="${SUPABASE_BUCKET:-insumos}"
BASE="${SUPABASE_URL%/}/storage/v1"
for archivo in imagenes/*; do
  nombre=$(basename "$archivo")
  tipo=$(file --brief --mime-type "$archivo")
  curl -sf -X POST \
    -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
    -H "Content-Type: $tipo" -H "x-upsert: true" \
    --data-binary "@$archivo" "$BASE/object/$BUCKET/$nombre" > /dev/null
  echo "subida: $nombre"
done
