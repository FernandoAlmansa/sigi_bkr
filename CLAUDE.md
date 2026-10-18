# SIGI-BKR — guía para Claude Code

Leé esto entero antes de tocar código. Trabajá editando los archivos del repo en el lugar (no me pases código para que yo lo pegue), corré los tests y explicame qué cambiaste.

## Qué es

SIGI-BKR (Sistema Integral de Gestión de Inventario para Insumos Textiles) controla el stock de insumos del taller **Bikinis Río** (Rosario). Registra ingresos, egresos y ajustes por recuento, guarda el historial y avisa cuando un insumo queda en stock crítico.

- Lo usan el dueño del taller y dos empleados de los locales. Pueden estar conectados a la vez desde la compu, el celular o una tablet.
- Ellos me piden cambios y yo los implemento. El producto terminado (las bikinis) NO se maneja en el sistema. Los insumos se dan de baja cuando se mandan a los locales.
- Inventario real: ~98 insumos activos en 10 categorías (telas, elásticos, empaque, herrajes, dijes, etiquetas, arcos, tazas, regalo, insumos de oficina).
- Es además mi proyecto de facultad (UAI, Ingeniería en Sistemas, 3er año). Ver "Contexto académico" al final.

## Reglas que no se negocian

1. **No agregar reglas de negocio ni cambiar la forma de trabajar del taller.** El sistema se adapta a cómo trabajan hoy. No propongas validaciones, flujos ni campos que nadie pidió. Hacé lo que te pido y nada más.
2. **Si no hay información sobre un dato, no lo inventes:** dejalo en 0 o como está.
3. **El historial arranca en la carga inicial** (7/10/2026). No se importa historial viejo.
4. **Sin login ni contraseñas.** Prioridad: que sea práctico. No agregues autenticación salvo que yo lo pida explícitamente.
5. **Nunca trabajes sobre `main`.** Creá una rama (`git checkout -b <nombre>`) antes de cambiar algo. Un push a `main` publica en producción.
6. **No toques `.env`** ni escribas claves, contraseñas o connection strings en ningún archivo versionado.
7. Antes de cambiar algo que el usuario ve, pensá cómo queda en celular. Lo usan mucho desde el teléfono.
8. Textos de la interfaz en español rioplatense, cortos y claros (vos, "cargá", "elegí").

## Stack y producción

| Pieza | Dónde | Notas |
|---|---|---|
| Front (`public/`) | GitHub Pages: https://fernandoalmansa.github.io/sigi_bkr/ | Se publica solo en cada push a `main` que toque `public/**` (`.github/workflows/deploy-pages.yml`) |
| Backend (`server.js` + `src/`) | Render free: https://sigi-bkr.onrender.com | Redeploya desde `main`. Se duerme a los 15 min, un cron de cron-job.org pega a `/api/insumos/resumen` cada 10 min |
| Base PostgreSQL + imágenes | Supabase free (us-east-1) | Session pooler puerto 5432. RLS activado sin políticas. Bucket público `insumos` |

- Repo: `FernandoAlmansa/sigi_bkr` (público). Node ≥ 22, CommonJS, Express 5, `pg`.
- `public/js/config.js`: si el front corre en `github.io` usa la API de Render, si no usa `/api` (mismo servidor local).
- Supabase free NO tiene backups propios: los hace el repo privado `sigi-bkr-backups` (ver "Backups").

## Comandos

```bash
npm install
npm run dev        # nodemon, http://localhost:3000 (sirve también el front)
npm test           # node --test, sin base de datos (dobles de prueba)
npm run migrate    # corre migraciones pendientes (también corren solas al arrancar)
```

- Local: PostgreSQL 15 por Homebrew, base `sigi_bkr`, usuario `sigi_user`. `DATABASE_URL` en `.env` (ver `.env.example`).
- Para tener los datos reales en local: `ops/backup/scripts/restaurar-en-local.sh` con el último dump de `~/Downloads/sigi-bkr-backups/base/sigi_bkr.sql`.
- Para probar en el celular: `npm run dev`, `ipconfig getifaddr en0` y abrir `http://<IP>:3000` desde el teléfono en el mismo wifi.

## Arquitectura (en capas)

```
public/            Front: index.html (SPA de una página), css/styles.css, js/config.js, js/app.js, js/egreso.js
src/api/           HTTP: routes, controllers, middlewares (asyncHandler, errorHandler, upload con multer en memoria)
src/services/      Aplicación: InventarioFacade, AlertaService, almacenamiento/, notificadores/
src/domain/        Dominio: Insumo, Categoria, Movimiento, Presentacion, Unidad, errores, builders/, strategies/
src/data/          Persistencia: db.js (pool) y repositorios
db/                schema.sql (esquema final), migraciones.js (versionadas), seed.sql
scripts/           importar-planilla.js, migrar-imagenes.js (one-shot, dry-run salvo --confirmar)
ops/backup/        Kit del repo privado de backups (workflow + scripts)
test/              dominio.test.js, inventario.test.js, configurables.test.js
```

Regla del diseño: **el SQL vive sólo en `src/data`, las reglas sólo en `src/domain`, y `src/api` no sabe que existe PostgreSQL.** Los controllers llaman a la facade y nada más.

### Patrones de diseño (importa para la materia)

| Patrón | Dónde | Para qué |
|---|---|---|
| **Facade** | `src/services/InventarioFacade.js` | Punto de entrada único: transacciones, repositorios, validación y alertas. Los controllers no ven nada de eso |
| **Builder** | `src/domain/builders/InsumoBuilder.js`, `CategoriaBuilder.js` | Construye y valida paso a paso, acumulando todos los errores. Sirve para alta (objeto completo) y modificación (solo campos cambiados) |
| **Strategy** | `src/domain/strategies/` (Ingreso, Egreso, Ajuste) | Cada tipo de movimiento calcula el stock nuevo y valida a su manera. Un tipo nuevo no toca el flujo transaccional |
| **Strategy** | `src/services/almacenamiento/` | Imágenes en disco local (desarrollo) o Supabase Storage (producción) |
| Observer | `src/services/AlertaService.js` + `notificadores/` | La alerta de stock crítico avisa a N notificadores (log, e-mail) |
| Singleton | `src/data/db.js` | Un único pool de conexiones |

Referencias de la cátedra: dofactory Builder, Facade y Strategy. Si agregás funcionalidad, respetá estos patrones en vez de saltearlos (por ejemplo, un movimiento nuevo es una Strategy nueva, no un `if` en la facade).

## Modelo de datos y dominio

Tablas: `unidades`, `tipos_insumo` (= categorías), `insumos`, `presentaciones`, `movimientos_stock`, `_migraciones`.

- **Categorías** (`tipos_insumo`): definen `campos` (características que se piden: `{clave, etiqueta, tipo: texto|opciones|numero, opciones, obligatorio}`), `unidad_base` sugerida y `presentaciones` sugeridas. Los `atributos` de cada insumo se validan contra los campos de su categoría.
- **Unidades** (`unidades`): lista controlada. `insumos.unidad_medida` y `tipos_insumo.unidad_base` tienen FK con `ON UPDATE CASCADE`. `Unidad.parecida` (Damerau + singular/plural) evita duplicados tipo "metor"/"metros". Renombrar a una existente las fusiona.
- **Presentaciones**: el stock se guarda **siempre en la unidad base**. Una presentación es una equivalencia (rollo = 20 metros, caja = 500 unidades). `Insumo.convertirABase` convierte. Los movimientos guardan además `presentacion` y `cantidad_presentacion`.
- **Movimientos**: INGRESO, EGRESO, AJUSTE (recuento físico: fija el stock y asienta la diferencia). El stock solo cambia por movimientos: el modal de edición NUNCA manda `stock_actual`, solo los campos cambiados.
- **RD01** stock no negativo: se valida en la Strategy, `CHECK (stock_actual >= 0)` en la base y `SELECT ... FOR UPDATE` dentro de la transacción (concurrencia).
- **RD02** stock crítico: `stock_actual <= stock_minimo`. `estado_critico` es derivado, nunca se escribe a mano. La notificación sale después del commit y solo cuando pasa de normal a crítico.
- Cambiar la unidad de una categoría pregunta si aplicarla también a sus insumos (`aplicar_unidad_a_insumos`). El número de stock NO se convierte.

### Migraciones

`db/migraciones.js` tiene migraciones idempotentes 001 a 009 que corren al arrancar el servidor (también en Render, contra la base de producción). Para cambiar el esquema:

1. Agregá una migración nueva al final (`010_...`). Nunca edites una que ya corrió.
2. Que sea idempotente (`IF NOT EXISTS`, chequeos previos).
3. Actualizá `db/schema.sql` para que refleje el esquema final.
4. Acordate de que al hacer merge a `main` se aplica sola en producción: hacé backup antes.

## API

Errores siempre `{ error, codigo, ...detalle }`: 400 validación, 404 inexistente, 409 conflicto, 422 regla de negocio.

- `GET /api/health`
- `GET|POST /api/categorias`, `PATCH|DELETE /api/categorias/:id`
- `GET|POST /api/unidades`, `GET /api/unidades/presentaciones`, `PATCH|DELETE /api/unidades/:id`
- `GET /api/insumos` (filtros `id_tipo`, `estado`, `q`), `GET /api/insumos/:id`, `GET /api/insumos/tipos`, `GET /api/insumos/resumen`
- `POST /api/insumos`, `PATCH /api/insumos/:id`, `DELETE /api/insumos/:id` (baja lógica), `POST /api/insumos/:id/imagen` (multipart, máx 2 MB)
- `GET /api/movimientos` (filtros `id_insumo`, `tipo`, `desde`, `hasta`, `limit`, `offset`)
- `POST /api/movimientos/ingreso|egreso|ajuste` (`{ id_insumo, cantidad, presentacion?, observacion?, usuario? }`)

## Front (public/)

- SPA sin framework: scripts clásicos (no módulos) cargados en orden `config.js` → `app.js` → `egreso.js`. Las páginas son `<section class="page">` y se cambian con `showPage(id)`.
- Páginas: Dashboard (Inicio), Egreso, Ingreso, Catálogo (alta de insumo), Categorías (+ unidades), Historial.
- La navegación existe en tres lugares con `.nav-link[data-page]`: barra de arriba (compu), barra inferior `.tabbar` (≤ 900 px) y la hoja "Más" (≤ 600 px, Catálogo y Categorías). Si agregás una página, agregala en los tres.
- **Diálogos**: nunca uses `alert`, `confirm` ni `prompt`. Usá `dialogo({...})` o `confirmar(titulo, mensaje, opciones)` de `app.js`, y `fuerte(texto)` para resaltar. Siempre escapá con `esc()` lo que venga de datos.
- Cantidades: usá `stockDisplay` / `cantidadDisplay` / `cantidadTexto`, que agregan la equivalencia en presentación ("40 metros (2 rollos)").
- Responsive: cortes en 900 px (tablet: barra inferior, tablas como tarjetas) y 600 px (celular). Las tablas `.tabla-tarjetas` se vuelven tarjetas con CSS: cada `<td>` lleva una clase `c-...` y `data-label`. Si agregás una columna, agregale su lugar en la tarjeta.
- Estética: paleta rosa/blanco de bikinisrio.com, variables CSS en `:root` de `styles.css`. Tipografías Poppins (texto) y Caveat (títulos).
- Historial: no consulta en cada cambio de filtro. Busca con el botón, por defecto el mes en curso, de a 50 con "Cargar más".

## Flujo para publicar un cambio

1. Rama nueva, cambios, `npm test` en verde, probar en local (compu y celular).
2. Commit y push de la rama. Yo reviso.
3. Antes del merge, backup manual: `gh workflow run backup.yml -R FernandoAlmansa/sigi-bkr-backups` y esperar que termine en verde.
4. Merge a `main` y push. Pages y Render se actualizan solos.

Vuelta atrás: el código tiene el tag `produccion-v1` (primera versión en la nube). Los datos se restauran desde un commit del repo de backups.

## Backups

- Repo privado `FernandoAlmansa/sigi-bkr-backups`: workflow diario 06:00 UTC (3 AM Argentina) que vuelca la base (`pg_dump` con cliente PG17) y baja las imágenes del bucket. Copia local en `~/Downloads/sigi-bkr-backups` (`git pull`).
- Scripts en `ops/backup/scripts/`: `volcar-base.sh`, `bajar-imagenes.sh`, `subir-imagenes.sh`, `restaurar-en-local.sh`.

## Archivos que no van al repo

`.env`, `datos.sql`, `insumos.csv`, `*.sql.local`, `public/uploads/*`, `.DS_Store`, `node_modules/`. Si aparece una carpeta "Claude outputs", tampoco va.

## Pendientes conocidos

- Eliminar la unidad "cantidad" (quedó sin uso).
- Confirmar con el taller: telas de sublimación en kg y Arcos en pares.
- Carga masiva de fotos desde una carpeta (comprimidas, por ID o nombre con revisión, dry-run primero).
- Limpiar nombres redundantes tipo "Tela ..." dentro de la categoría Tela (con vista previa).
- Las alertas por mail están apagadas a propósito (molestan mientras se prueba).

## Contexto académico

Materias: Ingeniería de Software y Patrones de Diseño (UAI, 3er año). El proyecto de Claude "Diploma 3er año" tiene la documentación de análisis: propuesta, requerimientos (RF, RNF, RD), casos de uso y sus especificaciones, modelo de dominio, robustez (ICONIX), secuencia, clases, persistencia y la entrega N2. Tiene que haber coherencia entre esos documentos y el código: RD01 y RD02 salen de ahí, igual que la Facade, el Builder y la Strategy.

El análisis también documenta un módulo de seguridad (usuarios, grupos, iniciar sesión, cambiar y recuperar clave). **No está implementado a propósito** (ver regla 4). No lo agregues salvo que te lo pida.
