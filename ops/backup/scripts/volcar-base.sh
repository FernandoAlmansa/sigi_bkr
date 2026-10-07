#!/usr/bin/env bash
# Vuelca el esquema public (tablas + datos) a base/sigi_bkr.sql y verifica
# que el archivo no esté vacío ni truncado antes de darlo por bueno.
set -euo pipefail

# Cliente de PostgreSQL 17 (sirve para servidores 17 o anteriores).
# Busca: variable PG_BIN, Linux (GitHub Actions), Homebrew (Mac) o el del PATH.
PG_BIN="${PG_BIN:-}"
for d in "$PG_BIN" /usr/lib/postgresql/17/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin; do
  if [ -n "$d" ] && [ -x "$d/pg_dump" ]; then PG_BIN="$d"; break; fi
done
PG_DUMP="${PG_BIN:+$PG_BIN/}pg_dump"
PSQL="${PG_BIN:+$PG_BIN/}psql"
echo "Usando $("$PG_DUMP" --version)"

mkdir -p base
TMP=$(mktemp)

"$PG_DUMP" "$DATABASE_URL" \
  --schema=public \
  --no-owner --no-privileges \
  --file="$TMP"

# Controles: tiene que estar la tabla de insumos y el volcado tiene que haber terminado.
grep -q 'CREATE TABLE public.insumos' "$TMP" || { echo "ERROR: el volcado no tiene la tabla insumos"; exit 1; }
grep -q 'PostgreSQL database dump complete' "$TMP" || { echo "ERROR: el volcado quedó incompleto"; exit 1; }

# El esquema public ya existe en cualquier base nueva (y en Supabase):
# así el archivo se puede restaurar sin errores en una base vacía.
sed -i.orig 's/^CREATE SCHEMA public;$/CREATE SCHEMA IF NOT EXISTS public;/' "$TMP" && rm -f "$TMP.orig"

mv "$TMP" base/sigi_bkr.sql

# Resumen legible para ver de un vistazo qué se respaldó.
"$PSQL" "$DATABASE_URL" -At -F ' | ' -c "
  SELECT 'insumos activos', COUNT(*)::text FROM insumos WHERE activo
  UNION ALL SELECT 'movimientos', COUNT(*)::text FROM movimientos_stock
  UNION ALL SELECT 'categorías', COUNT(*)::text FROM tipos_insumo
  UNION ALL SELECT 'último movimiento', COALESCE(MAX(fecha)::text, '-') FROM movimientos_stock
" > base/resumen.txt
echo "Backup de la base OK:"; cat base/resumen.txt
