# GitHub Actions/CI — propuesta posterior a PR #12

19 de octubre de 2026. Base: `543442ea634e5977bc887ace1db5457eee2ebf8c`, merge #12, HEAD C revisado `c7f622608af4b7bc27a7c4e9dde49be23221b0ae`. **PROPUESTA técnica, no CI implementada ni autorización administrativa.** Este PR solo cambia Markdown; no crea `.github/workflows`, ejecuta Docker/PostgreSQL/migraciones, envía SMS/emails ni cambia protección, permisos, secrets o merge automático.

La implementación técnica posterior está autorizada por encargo específico y se registra en [implementación y evidencia](ci-implementation.md). Este plan conserva su corte histórico; no sustituye resultados observados ni autoriza cambios administrativos.

## Estado comprobado y alcance

- A (#10, `0f2ebba`), B (#11, `5e549f5`) y C (#12, `543442e`) integrados. D no iniciado ni autorizado; 2A sigue parcial. [Plan de entregas](identity-directory-delivery-plan.md).
- No hay workflows versionados en el árbol de esa base. La consulta del conector para runs de PR del HEAD C devuelve cero ejecuciones; su alcance es primera página y eventos de PR, no prueba ausencia universal de ejecuciones externas.
- El seguimiento previo al merge registró cero checks/estados y ningún check requerido visible; protección detallada devolvió 403. Es evidencia histórica limitada, no certificación administrativa actual. Una respuesta `pending` con cero estados no demuestra un proceso en curso. No se modifica ni se declara activada protección alguna en este PR.
- Las [evidencias B](patient-identity-validation.md) y [final C](contact-change-deadline-validation.md) documentan ensayos aislados, no checks Actions. Sus conteos son históricos; no deben reutilizarse como resultados nuevos ni como número fijo para aprobar futuras ejecuciones.

La CI automatizaría regresiones de lo ya entregado. No habilita D, vínculos nuevos, proveedores reales, despliegue, backfill o permisos por episodio. ADR-029/RN-59–61 siguen intactas: la exigencia aprobada de validación profesional previa a activación tiene precondición backend/DB pendiente. Una ejecución verde no certifica su implementación ni el aislamiento por episodio todavía inexistente.

## Ejecución y checks propuestos

Implementar en un PR técnico posterior autorizado. Proponer runners Linux efímeros alojados por GitHub, Node 24 y PostgreSQL 17, con versiones exactas/digests registrados y `npm ci` por lockfiles backend/frontend. No usar runners conectados al entorno habitual. Eventos: `pull_request` hacia `main` (apertura, sincronización, reapertura, listo para revisión y cambio de rama base) y `push` a `main` para observar el resultado integrado; `workflow_dispatch` solo para repetición explícita. Un push a main no equivale a reejecutar cada PR abierto: exigir actualizar su rama con la base vigente y volver a validar antes de merge. Nada despliega. Si se adopta merge queue después, añadir y validar `merge_group` antes de exigirla.

Los siguientes son **nombres candidatos de checks obligatorios**, no checks existentes. Ejecutar la matriz completa también en PR documentales para evitar una omisión accidental. No aplicar filtros de paths ni condiciones que omitan checks requeridos; una optimización futura necesita diseño y prueba propios.

| Check propuesto | Ejecución/cobertura exigida | Resultado y evidencia |
| --- | --- | --- |
| `ci/docs` | Diff, UTF-8, enlaces locales/fragmentos, IDs ADR/RN/AB, estados y separación plan/implementación. Verificar preservación de SQL histórico y manifiesto según alcance del PR. Validador reproducible por incorporar. | Informe de enlaces/IDs y cambios permitidos; falla con enlace roto o alcance inesperado. |
| `ci/backend-unit` | `npm ci` y `npm test` en backend; runner excluye `.integration.test.js`. Agenda, permisos, autenticación, identidad, contactos y deadline. Sin conexión DB. | Salida Node estructurada con pruebas/fallos/cancelaciones/omisiones y código de salida. |
| `ci/frontend` | `npm ci`, `npm test`, `npm run lint`, `npm run build` en frontend. | Pruebas, lint y build diferenciados; bundle no implica despliegue. |
| `ci/postgres` | En sandbox nuevo verificado: guardas Python, `npm run test:episodes`, `npm run test:integration`. SQL/runner 001–005, instalación/upgrade 003→004→005, replay, concurrencia, rollback DDL, checksums/deriva/downgrade; auth/JWT, backoffice, identidad, clínica y regresiones C. | Logs por suite, inventario de casos realmente ejecutados, manifest/checksums y comprobación de aislamiento/limpieza. |
| `ci/browser` | Sandbox propio diferente: recorrido B a automatizar de forma reproducible y revisión C basada en [runner](../scripts/run-contact-ui-review.py)/[driver](../scripts/contact-ui-review.cjs). Chromium real desktop/móvil; verificación explícita, dos sesiones, cambio/cancelación/recarga, revocación y continuidad clínica legacy; roles administrativos sin clínica ni secretos. | Reporte de pasos y denegaciones, errores JS/React/HTTP inesperados y PNG enmascaradas. Debe fallar si navegador/caso no se ejecuta. |
| `ci/evidence` | Con `needs` de los jobs de validación e `if: always()`, reunir y validar artifacts ligados al mismo intento/SHA, incluso cuando una suite falla. | Índice saneado con integridad, resultados y límites; artifact requerido ausente falla. |
| `ci/required` | Agregador final con `needs` de todos los anteriores e `if: always()`. Solo acepta `success` de cada dependencia y reporte completo; rechaza failed/cancelled/skipped/neutral/desconocido o evidencia incompleta. | Único resumen de aprobación técnica de esta matriz; no autoriza merge. |

El wrapper [clinical-episodes.sh](../scripts/clinical-episodes.sh) ya dispone de guardas, SQL/runner, unitarias backend, integración y lint/build. **No incluye frontend `npm test` ni revisión Chromium**; el PR técnico debe añadir su orquestación explícita y reportes, sin presentar el wrapper como CI completa. Las pruebas de integración están condicionadas por flags; un exit 0 con suites omitidas debe fallar la validación de resultados. Registrar casos esperados por nombre/suite, ejecutados, fallidos, cancelados y omitidos; cero omisiones/cancelaciones inesperadas, sin imponer los conteos históricos como techo.

GitHub puede aceptar checks omitidos o neutrales; por ello el agregador debe validar expresamente las conclusiones. [Referencia de checks requeridos](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

## Aislamiento de PostgreSQL y entregas

Reutilizar el protocolo de [desarrollo aislado](development.md) y [compose.episodes-test.yaml](../compose.episodes-test.yaml), sin ejecutar `compose.yaml` habitual. Cada job/intento genera UUID nuevo y comprueba ausencia de recursos previos antes de crear nada; nombres incluyen run/intento/UUID. DB PostgreSQL 17 en tmpfs, red privada `internal`, sin puertos DB publicados ni volumen persistente reutilizado; host de las suites `db`. No basta cambiar un nombre de base sobre un servidor existente.

Antes de conectar o instalar baseline, comprobar destino nuevo, etiquetas/propiedad, tmpfs/red/puertos y configuración opt-in: `NODE_ENV=test`, `PGHOST=db`, `PGDATABASE=psicopanel_integrity_test`, `RUN_EPISODE_INTEGRATION=true`, `RUN_AUTH_INTEGRATION=true`, `RUN_CLINICAL_INTEGRATION=true` y UUID válido. El job de navegador usa solo el modo demo local explícito y DB propia, con las guardas correspondientes. Rechazar URL/credenciales/configuración de destino externo o habitual; sin secretos del repositorio para acceder a DB. Claves efímeras exclusivamente para fixtures, entrega `simulated` y contactos `.invalid`; ningún proveedor real.

Baseline/fixtures y migraciones solo dentro del destino recién creado, con targets explícitos y sin cambiar 001–005/manifiesto por este plan. Las regresiones conservan desconocidos legacy, fallback lector, barrera AB-23 y ausencia de nuevos vínculos/episodios. Cubrir P2 de C: revocación indirecta/reset, transacciones breves, limpieza independiente/lease obsoleto, backoff desde hora DB, deadline tras COMMIT/arranque y antes del adaptador, presupuesto que solo se acorta, purga concurrente y cierre único sin worker residual. No prometer tiempo real, entrega exactamente una vez ni aceptación externa atómica.

Timeout por job/suite; capturar fallo original sin ocultarlo con upload/cleanup. Limpieza en salida normal/fallo y paso final incondicional, solo de UUID/recursos propios verificados, sin `prune`. Probar también cancelación y terminación del runner: el runner efímero se desecha; no prometer artifacts después de un corte abrupto. Falta de reporte/limpieza confirmada impide dar aceptación. No reutilizar DB, imágenes ni volúmenes de otra ejecución.

## Evidencias y seguridad propuestas

Por ejecución conservar SHA HEAD, base y commit realmente probado (el merge sintético de PR, si corresponde), URL del run, intento, fecha UTC, versiones Node/PostgreSQL/Chromium, comandos, UUID, checksums y resultados por suite. No atribuir ejecución al HEAD si se probó otro commit. Conservar primer fallo y reintentos separados; prohibir reintentos que conviertan silenciosamente fallos en aprobación.

Artifacts candidatos: `ci-results-RUN-ATTEMPT-SHA` (índice y reportes), `ci-db-RUN-ATTEMPT-SHA` (logs saneados de suites/guardas), `ci-ui-RUN-ATTEMPT-SHA` (reporte y capturas permitidas), más `SHA256SUMS`. Subir mediante allowlist y saneamiento antes de upload; nunca `.env`, tokens/OTP, buzón privado, candidatos/destinos, cabeceras/cuerpos completos, dumps DB, storage state, traces/HAR/vídeo o datos reales. Reportes exportables TAP/JUnit y validador de artifacts son trabajo futuro, no herramientas ya incorporadas. Proponer retención de 14 días para evidencias de CI, sujeta a política/costo y autorización; no define retención clínica ni de auditoría C. [Configuración de retención](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

Permiso inicial del token `contents: read`, checkout sin persistir credenciales, sin secrets productivos ni escrituras administrativas. Ejecutar código de PR con `pull_request`, nunca con contexto privilegiado `pull_request_target`. Fijar acciones a SHA completo verificado y dependencias por lockfile; revisar actualizaciones por PR. No interpolar títulos/mensajes no confiables como código de shell. [Seguridad de Actions](https://docs.github.com/en/actions/reference/security/secure-use), [riesgos de pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).

## Protección propuesta y aceptación antes de activarla

Después de un PR técnico revisado y ejecuciones observadas, solicitar autorización administrativa separada para proteger `main` mediante branch protection o ruleset equivalente. Propuesta: PR obligatorio, al menos una aprobación independiente, descartar aprobaciones obsoletas tras nuevos commits, resolver conversaciones, rama actualizada con base y todos los checks de la tabla requeridos con fuente GitHub Actions verificada. Bloquear push directo, force push y borrado; aplicar también a administradores y sin bypass ordinario. Confirmar disponibilidad de revisor independiente y compatibilidad del plan/permisos GitHub antes de activar. No habilitar auto-merge; aprobación humana del merge sigue separada. [Protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

| ID | Evidencia de aceptación futura |
| --- | --- |
| CI-01 | PR técnico separado implementa workflows/reportes revisables; README/roadmap cambian a “implementada” solo con archivos y URLs/SHA de ejecuciones reales. |
| CI-02 | PR funcional y PR solo documental emiten todos los checks y artifacts; todos pasan con suites realmente ejecutadas. Un nuevo HEAD/base exige resultado vigente. |
| CI-03 | Inyectar fallos controlados en prueba, lint/build, flag opt-in, artifact ausente y dependencia skipped/cancelled: agregador nunca aprueba. Enlace documental roto falla `ci/docs`. Ensayos en rama de prueba, sin merge ni datos reales. |
| CI-04 | Dos ejecuciones/intentos concurrentes no comparten recursos; destino existente/externo se rechaza antes de escribir. Fallo/timeout/cancelación dejan solo recursos propios eliminados o runner desechado, con evidencia y límites registrados. |
| CI-05 | Casos de B/C, clínica y backoffice cubiertos sin mensajes reales; unitarias frontend y Chromium efectivamente ejecutados; suite/reportes no exponen secretos ni conceden capacidades de D/episodios. |
| CI-06 | Artifacts descargables y hashes verificables para el SHA/intent correctos; saneamiento comprobado con fixtures sensibles; retención propuesta aprobada y registrada sin tocar políticas clínicas. |
| CI-07 | Autorización administrativa explícita, revisor disponible y checks reales identificados antes de configurar protección. Comprobar por lectura/API y prueba de rechazo autorizada que push/merge con checks fallidos, obsoletos o revisión ausente no pasan. No hacer un merge real para probar. Si falta permiso/403, declarar verificación pendiente. |

## Decisiones pendientes y secuencia

La siguiente tarea técnica requiere autorización para implementar/ensayar CI en recursos nuevos; después, autorización para protección/configuración. Deben acordarse disponibilidad de revisor, presupuesto/tiempo de jobs, retención/acceso de artifacts y versiones fijadas. Nada de ello aprueba automáticamente D.

Producto pendiente permanece en [ADR/abiertos](product/decisions.md): AB-18 (identificador/caché/retiro público), AB-24 (credenciales, nombre/foto) y AB-27 (estado propio sin sesión clínica) antes de su alcance D; alta/corrección posterior de DOB; retención definitiva de auditoría, rotación/limpieza de B, antiautomatización y proveedores antes de producción. Activación/entrevista y permisos por episodio requieren entrega propia respetando ADR-029/RN-59–61. No reabrir AB-23 o los ocho acuerdos de AB-25, ni usar CI para resolver decisiones de producto.
