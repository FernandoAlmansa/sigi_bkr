# Backups de SIGI-BKR

Repositorio **privado** con las copias de seguridad diarias de la base de
datos y de las imágenes. Todos los días a las 3 AM (hora argentina) un workflow
de GitHub Actions vuelca la base y copia las fotos nuevas, y lo guarda como un
commit. El historial de commits es el historial de backups: se puede volver a
cualquier día.

- `base/sigi_bkr.sql`: volcado completo del esquema `public` (tablas + datos).
- `base/resumen.txt`: cuántos insumos, movimientos y categorías tenía, y la fecha del último movimiento.
- `imagenes/`: fotos de los insumos.

## Hacer un backup ahora

Actions → *Backup diario* → **Run workflow**. Conviene hacerlo antes de cada
deploy con cambios de base de datos.

## Backup manual desde la Mac

Requiere el cliente de PostgreSQL 17 (`brew install postgresql@17`, una sola vez):

```bash
cd ~/Downloads/sigi-bkr-backups
git pull                                   # trae los backups automáticos
DATABASE_URL="CADENA_SESSION_POOLER" bash scripts/volcar-base.sh
SUPABASE_URL=https://zkovmggkfoagxienksmy.supabase.co SUPABASE_SECRET_KEY=sb_secret_... bash scripts/bajar-imagenes.sh
git add -A && git commit -m "Backup manual" && git push
```

## Traer producción a tu Postgres local (para desarrollar)

```bash
bash scripts/restaurar-en-local.sh base/sigi_bkr.sql
```
Renombra tu base local actual a `sigi_bkr_viejo_<fecha>` (no la borra), crea
`sigi_bkr` de nuevo con los datos del backup y muestra un resumen. Antes cortá
`npm run dev`.

## Restaurar

1. Elegir la versión: la última está en `main`; para una anterior, en
   *Commits* buscar la fecha y descargar `base/sigi_bkr.sql` de ese commit.
2. Crear una base **vacía**: lo más seguro es un proyecto nuevo de Supabase
   (región East US). El proyecto viejo queda intacto por si hay que comparar.
   El volcado no borra nada: si las tablas ya existen, falla en vez de pisarlas.
3. Cargarla:
   ```bash
   psql -v ON_ERROR_STOP=1 "CADENA_SESSION_POOLER_NUEVA" -f base/sigi_bkr.sql
   ```
4. Subir las imágenes (crear antes el bucket público `insumos`):
   ```bash
   SUPABASE_URL=https://NUEVO.supabase.co SUPABASE_SECRET_KEY=sb_secret_... bash scripts/subir-imagenes.sh
   ```
   Si el proyecto es nuevo, las URLs de las imágenes en la tabla `insumos`
   apuntan al proyecto viejo: actualizarlas con
   ```sql
   UPDATE insumos SET imagen_url = replace(imagen_url, 'https://VIEJO.supabase.co', 'https://NUEVO.supabase.co');
   ```
5. Actualizar `DATABASE_URL`, `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en Render.

## Probar que el backup sirve (una vez por mes)

```bash
createdb sigi_prueba_restore
psql -v ON_ERROR_STOP=1 sigi_prueba_restore -f base/sigi_bkr.sql
psql sigi_prueba_restore -c "SELECT COUNT(*) FROM insumos;"
dropdb sigi_prueba_restore
```
Un backup que nunca se probó restaurar no es un backup.
