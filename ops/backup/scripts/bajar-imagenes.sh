#!/usr/bin/env bash
# Copia todas las imágenes del bucket "insumos" de Supabase Storage a imagenes/.
# Sólo baja las que todavía no tiene (los nombres llevan timestamp y no cambian).
set -euo pipefail

BUCKET="${SUPABASE_BUCKET:-insumos}"
BASE="${SUPABASE_URL%/}/storage/v1"
AUTH=(-H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY")

mkdir -p imagenes
offset=0
total=0
while :; do
  pagina=$(curl -sf "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"prefix\":\"\",\"limit\":100,\"offset\":$offset,\"sortBy\":{\"column\":\"name\",\"order\":\"asc\"}}" \
    "$BASE/object/list/$BUCKET")
  cantidad=$(echo "$pagina" | jq 'length')
  [ "$cantidad" -eq 0 ] && break
  for nombre in $(echo "$pagina" | jq -r '.[] | select(.id != null) | .name'); do
    if [ ! -f "imagenes/$nombre" ]; then
      curl -sf "${AUTH[@]}" -o "imagenes/$nombre" "$BASE/object/$BUCKET/$nombre"
      total=$((total + 1))
    fi
  done
  offset=$((offset + cantidad))
done
echo "Imágenes nuevas copiadas: $total (total en backup: $(ls imagenes | wc -l))"
