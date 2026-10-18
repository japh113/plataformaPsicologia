# Validación de fundamentos de episodios — 18 de octubre de 2026

Base: `main` limpio, actualizado en `93aa035` (merge PR #7). Rama: `feat/clinical-episode-foundation`. Entrega por PR hacia main, sin merge ni despliegue.

## Archivos

| Archivos | Cambio |
| --- | --- |
| `backend/sql/migrations/003_clinical_episode_foundation.sql` | Episodios independientes, estados/identidad/terminalidad, protección e integridad de atribución. |
| `backend/sql/migrations/manifest.json` | SHA-256 fijos de 001/002/003. |
| `backend/scripts/episode-migration.js`, `migrate.js` | Ejecutor explícito, comprobación del destino/prerrequisitos, lock, transacción, versiones y huella. |
| `backend/scripts/diagnose-episodes.js` | Diagnóstico agregado de solo lectura. |
| `backend/scripts/episode-sandbox.js`, `create-episode-demo.js` | Destinos nuevos verificados y datos/cuentas ficticios. |
| `backend/test/clinical-episodes.integration.test.js` | Instalación, conservación, integridad, concurrencia, deriva y rollback. |
| `backend/test/auth.security.integration.test.js`, `backoffice-access.integration.test.js`, `clinical-integrity.integration.test.js` | Opt-in para ejecutar HTTP con 003 instalada. Se elimina el replay de schema/seed sobre datos ya poblados de la suite clínica. |
| `backend/package.json` | Comandos explícitos de migración/diagnóstico y suite 003, sin nuevas dependencias. |
| `compose.episodes-test.yaml`, `scripts/clinical-episodes.sh` | Proyecto UUID nuevo, PostgreSQL tmpfs, imágenes propias por ejecución, verificación de aislamiento y demo opcional. |
| `scripts/episode_images.py`, `scripts/test_episode_images.py` | Verificación de etiquetas/configuración/IDs preexistentes y limpieza exacta de imágenes con comprobación de propiedad; seis pruebas de regresión. |
| `docs/product/decisions.md`, `roadmap.md` | ADR-006/009 aprobados para fundamentos y estado parcial de 2A. |
| `docs/clinical-episodes-foundation.md`, este reporte, `README.md` | Procedimiento, límites, demo y evidencia. |

001/002, schema/seed, código de aplicación de backend y frontend y lockfiles conservan su contenido original. No se añaden ni actualizan dependencias; solo se agregan scripts npm.

## Restricciones comprobadas

- FK a identidad global de paciente y FK compuesta a usuario con rol psicólogo. Sustituir la cuenta del paciente no modifica episodios.
- Índice único parcial por paciente para active/paused, con exclusión concurrente verificada mediante espera real en PostgreSQL.
- Identidad inmutable; fecha de finalización válida; finalización terminal; retorno A→B→A con ID nuevo.
- DELETE/TRUNCATE bloqueados; cambios de episodio/espera conservados en el historial existente.
- Citas/notas/tareas/objetivos/espera con referencia paciente/episodio válida. Nota atribuida requiere autor conocido del episodio.
- Claves compuestas nota/cita y tarea/nota comparan también NULL. Se rechazan atribuciones parciales en ambos sentidos y cruces de pacientes/episodios.
- Una atribución no nula no se quita ni reasigna.
- No hay backfill, nuevas autorizaciones ni atribución al profesional actual. Una inconsistencia legacy bloquea, sin corrección.

## Ejecución y resultados

Comando reproducible: `bash scripts/clinical-episodes.sh test`. Construye las imágenes y crea un proyecto nuevo por UUID. PostgreSQL 17, Node 24, sin conexión a la base habitual.

| Validación final | Resultado |
| --- | --- |
| Unitarias backend | 80/80 aprobadas. |
| Nuevos escenarios PostgreSQL de 003 | 16/16 aprobados (Node informa 17 contando el contenedor del test). |
| Integración existente, con 003 antes de HTTP | 30/30 escenarios aprobados (Node informa 33 contando sus tres contenedores de test). |
| Frontend lint / build | Ambos aprobados. |
| Demo nueva | UI responde HTTP 200; login A, B, P y Q correcto; acceso propio permitido y expediente ajeno denegado; tres episodios y nota legacy con autor/episodio NULL comprobados por SELECT READ ONLY. |
| Diff y archivos protegidos | Revisión completa; `git diff --check` correcto; 001/002/schema/seed y código de aplicación sin cambios. |
| Dependencias backend | `npm audit --omit=dev --json`: cero vulnerabilidades. Auditoría completa: tres high en la cadena de desarrollo nodemon/chokidar/braces, sin cambios de dependencias en este PR. |

La suite nueva compara todas las filas originales de todas las tablas públicas preexistentes, incluyendo notas, autores e historial, antes/después de instalar y reaplicar; excluye únicamente columnas recién añadidas. Comprueba CLI real, ausencia de destino implícito, rechazo de destinos existentes/entornos no development, archivos y registros incompatibles, funciones/triggers/FK faltantes, deriva de índice/constraint/default/función, diagnóstico sin cambios, concurrencia de migradores y nota/cita en ambos órdenes.

Un event trigger de fallo DDL sintético hace fallar la creación de episodios dentro de la transacción. Se verifica que no quedan tabla, columnas, constraints, registro de versiones ni cambios de datos; el reintento posterior funciona. Las garantías de 001/002 y las operaciones existentes de agenda, espera, disponibilidad, notas, tareas y JWT pasan sus regresiones.

Durante una primera ejecución se detectó replay de schema/seed en la propia base sintética de la suite clínica heredada. Se retiró y se repitió la validación final sin ese replay. Nunca se ejecutó sobre la base habitual ni sobre datos reales. Los proyectos de prueba/demo creados por esta tarea se cerraron, sin eliminar ni reinicializar volúmenes existentes.

## Riesgos y límites

- DDL con bloqueos fuertes, validación de claves y posible reescritura por columnas generadas almacenadas: requiere ventana sin escritores, respaldo y ensayo de espacio/duración antes de un despliegue autorizado.
- La aplicación actual escribe episodio NULL. No atribuir citas mediante otro escritor hasta implementar propagación de episodio en todos los flujos; las notas/tareas parciales serían rechazadas. Los permisos legacy de psicólogos continúan vigentes.
- Se prueba PostgreSQL 17; un cambio de versión mayor registrado se rechaza. El checksum de catálogo es específico de la instalación; restauraciones/cambios legítimos requieren revisión y protocolo sucesor, sin borrar evidencias.
- 001/002 se adoptan tras comprobar estructura/funciones/triggers/FK, sin fingir prueba de sus ejecuciones históricas. Propietarios/superusuarios aún pueden alterar protecciones o evidencias; no se declara hardening de producción.
- No se resolvieron expedientes reales, autoría desconocida, permisos por episodio, estructura de adendas, flujos de pausa/cierre, derivaciones o consentimientos. La demo no presenta esos flujos como implementados.
- Las vulnerabilidades de desarrollo observadas requieren revisión aparte; no bloquean la ejecución del migrador, que no depende de nodemon.

## Corrección de aislamiento Docker del PR #8

Las etiquetas fijas de imágenes de aplicación podían sobrescribir las del entorno habitual. Ahora se derivan del proyecto Compose con UUID: `${COMPOSE_PROJECT_NAME}-backend:isolated` y `${COMPOSE_PROJECT_NAME}-frontend:isolated`. La API hereda la referencia backend de esa misma ejecución, evitando una tercera imagen por servicio. Cada imagen construida lleva un label de propiedad del proyecto.

Se valida la configuración resuelta frente a las referencias del Compose habitual y de integración antes de construir; se rechazan colisiones y destinos de imagen existentes. Se registran los IDs de todas las etiquetas preexistentes y se comprueba que permanezcan iguales tras build, pruebas/demo y limpieza. La limpieza automática de tests y el comando explícito de cierre de demo retiran únicamente sus dos etiquetas, comprobando proyecto/propietario, sin force, borrado por ID ni limpieza global. Se conservan imágenes base y caché de compilación compartidas.

Revalidación: seis comprobaciones nuevas de imágenes aprobadas, 80 unitarias backend, 16 escenarios PostgreSQL 003, 30 escenarios de integración existentes y lint/build correctos. Proyecto test: `psicopanel-episodes-c4c3ed30-1eb8-43b7-b023-aa10a258d461`.

Demo nueva: `psicopanel-episodes-f796c43c-b1fc-4aae-b068-563f4a8ede09`. UI HTTP 200; login de A/B/P/Q, acceso propio y denegación de acceso ajeno correctos. Se verificó que la API utiliza exactamente la imagen backend del proyecto y que intentar reutilizar esas etiquetas se rechaza. Tras el comando `cleanup`, no quedan contenedores, redes ni etiquetas de aplicación de esa demo; las etiquetas preexistentes conservan sus IDs.

No cambia SQL 003, manifiesto, otras migraciones, servicios clínicos ni Compose habitual. No se ejecutaron migraciones sobre la base habitual ni se alteraron sus contenedores o volúmenes.
