# SIGI-BKR — Sistema de Gestión de Inventario (Bikinis Río)

API REST + cliente web para el control de stock de insumos del taller: catálogo,
movimientos (ingreso / egreso / ajuste), historial y alertas de stock crítico.

## Arquitectura

Estilo **en capas**; cada capa sólo conoce a la de abajo.

```
public/                     Presentación (cliente web)
src/api/                    Presentación (HTTP): rutas, controllers, middlewares
src/services/               Aplicación: InventarioFacade, AlertaService
src/domain/                 Dominio: entidades, builders, strategies, reglas y errores
src/data/                   Persistencia: pool PostgreSQL y repositorios
db/                         Modelo de datos y migraciones versionadas
test/                       Pruebas unitarias (sin base de datos)
```

Regla que sostiene el diseño: **el SQL vive sólo en `src/data`, las reglas de
negocio sólo en `src/domain`, y `src/api` no sabe que existe PostgreSQL.**

## Patrones de diseño implementados

| Patrón | Tipo | Dónde | Problema que resuelve |
|---|---|---|---|
| **Builder** | Creacional | `src/domain/builders/InsumoBuilder.js` | Un insumo tiene campos opcionales y atributos dinámicos. El builder valida paso a paso, acumula todos los errores y produce o el insumo completo (alta) o el conjunto parcial de cambios (modificación). |
| **Facade** | Estructural | `src/services/InventarioFacade.js` | Da un punto de entrada único al subsistema de inventario: los controllers no manejan transacciones, repositorios ni notificadores. |
| **Strategy** | Comportamiento | `src/domain/strategies/` | Ingreso, egreso y ajuste calculan el stock y validan distinto. Cada uno es una clase; sumar un tipo nuevo no toca el flujo transaccional. |
| **Strategy** (almacenamiento) | Comportamiento | `src/services/almacenamiento/` | Dónde guardar las imágenes depende del entorno: disco local en desarrollo, Supabase Storage en producción (el disco de Render es efímero). |
| **Builder** (categorías) | Creacional | `src/domain/builders/CategoriaBuilder.js` | La definición de una categoría (campos, unidad base, presentaciones sugeridas) se valida paso a paso acumulando errores, igual que el insumo. |
| *Singleton* | Creacional | `src/data/db.js` | Un único pool de conexiones en toda la aplicación. |
| *Observer* | Comportamiento | `src/services/AlertaService.js` | La alerta RD02 avisa a N notificadores suscriptos (log, e-mail, y lo que se agregue) sin que el flujo de negocio los conozca. |

## Categorías y presentaciones configurables

- **Categorías** (`tipos_insumo`): cada una define las *características* que se piden a sus insumos (`campos`: texto, lista de opciones o número; obligatorias u opcionales), una unidad base sugerida y presentaciones sugeridas. Se administran desde la pestaña *Categorías* (`/api/categorias`). El backend valida los atributos de cada insumo contra los campos de su categoría.
- **Presentaciones** (`presentaciones`): el stock se guarda siempre en la unidad base del insumo (`insumos.unidad_medida`); cada insumo puede tener presentaciones con su equivalencia (rollo = 20 m, paquete = 100 u). Los movimientos aceptan `{ cantidad, presentacion }` y la conversión la hace `Insumo.convertirABase`. El historial guarda la cantidad en unidad base y lo que se cargó (`presentacion`, `cantidad_presentacion`).

## Reglas de negocio

- **RD01 — Stock no negativo.** Un egreso mayor al disponible se rechaza con HTTP 422. Se valida en la estrategia, se refuerza con `CHECK (stock_actual >= 0)` en la base y se aísla con `SELECT ... FOR UPDATE` dentro de la transacción, de modo que dos egresos simultáneos no puedan leer el mismo stock.
- **RD02 — Alerta de stock crítico.** Cuando un movimiento deja el stock en su mínimo o por debajo, el insumo pasa a crítico y se notifica. La notificación se dispara *después* del commit y sólo en el flanco (cuando el insumo no estaba crítico antes), para no repetir el aviso en cada egreso.
- El campo `estado_critico` es **derivado**: se recalcula en cada actualización de stock o de mínimo, nunca se escribe a mano.

## Puesta en marcha (local)

```bash
cp .env.example .env          # completar DATABASE_URL
npm install
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql     # opcional: catálogo de tipos
npm run dev
```

Las migraciones de `db/migraciones.js` corren solas al arrancar y quedan
registradas en la tabla `_migraciones`, así que se aplican una única vez.

## Pruebas

```bash
npm test
```

15 pruebas sobre el dominio y la facade (con dobles de prueba), sin necesidad de
base de datos: validaciones del builder, cálculo de cada estrategia, RD01, RD02 y
rollback ante error.

## Despliegue (GitHub Pages + Render + Supabase)

| Pieza | Dónde | Costo |
|---|---|---|
| `public/` (HTML, CSS, JS) | GitHub Pages (`.github/workflows/deploy-pages.yml`) | gratis |
| `server.js` + `src/` (Express) | Render, Web Service free | gratis |
| PostgreSQL + imágenes | Supabase free (base + Storage) | gratis |

- El front detecta si lo sirve GitHub Pages y apunta a la API de Render
  (`public/js/config.js`, constante `BACKEND_PRODUCCION`).
- Variables en Render: `DATABASE_URL` (Session pooler de Supabase),
  `NODE_ENV=production`, `CORS_ORIGINS=https://<usuario>.github.io`,
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DB_POOL_MAX=5`. `PORT` no se define.
- Las imágenes se guardan con una **Strategy** (`src/services/almacenamiento/`):
  disco local en desarrollo, Supabase Storage en producción. Las existentes se
  migran una vez con `npm run migrar-imagenes`.
- La migración `006_rls_supabase` activa RLS en Supabase para que las tablas no
  queden expuestas por su API REST pública.
- Render free se duerme a los 15 min sin tráfico y Supabase free se pausa tras
  una semana sin actividad: un cron externo contra `/api/insumos/resumen` cada
  10 min evita las dos cosas.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Chequeo de vida |
| GET/POST | `/api/categorias` | Lista / alta de categorías (`nombre`, `unidad_base`, `presentaciones`, `campos`) |
| PATCH/DELETE | `/api/categorias/:id` | Modificación / baja (rechaza si tiene insumos activos) |
| GET | `/api/insumos` | Lista activos. Filtros: `id_tipo`, `estado=critico\|normal`, `q` |
| GET | `/api/insumos/:id` | Detalle |
| GET | `/api/insumos/tipos` | Catálogo de tipos |
| GET | `/api/insumos/resumen` | Totales y listado de críticos (reporte) |
| POST | `/api/insumos` | Alta |
| PATCH | `/api/insumos/:id` | Modificación parcial |
| DELETE | `/api/insumos/:id` | Baja lógica |
| POST | `/api/insumos/:id/imagen` | Carga de imagen (multipart, máx. 2 MB) |
| GET | `/api/movimientos` | Historial. Filtros: `id_insumo`, `tipo`, `desde`, `hasta`, `limit`, `offset` |
| POST | `/api/movimientos/ingreso` | Reposición |
| POST | `/api/movimientos/egreso` | Consumo (RD01) |
| POST | `/api/movimientos/ajuste` | Recuento físico: fija el stock y asienta la diferencia |

Los errores siempre responden `{ error, codigo, ...detalle }` con el status
correspondiente: 400 validación, 404 inexistente, 409 conflicto, 422 regla de negocio.
