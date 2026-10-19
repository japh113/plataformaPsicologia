# GitHub Actions ? implementaci?n y evidencia

19 de octubre de 2026. Base t?cnica `58c7b095be237b526d489152a0eab387da3d8d5d`. Implementaci?n en rama `ci/github-actions`, pendiente de validaci?n completa en GitHub y revisi?n independiente. [Plan y criterios CI-01?07](ci-plan.md). No acredita despliegue ni completa las capacidades cl?nicas pendientes.

## Componentes

[Workflow](../.github/workflows/ci.yml): `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence`, `ci/required`. Todos se ejecutan tambi?n ante cambios documentales, sin filtros de paths. La matriz no cancela componentes al fallar otro. Una nueva sincronizaci?n cancela la ejecuci?n obsoleta; una ejecuci?n cancelada nunca acredita el nuevo HEAD. `edited` permite revalidar cambios de base, aunque tambi?n puede repetir al editar el PR. `push` se limita a main, sin duplicar los PR por push a su rama. Dispatch permite repetici?n expl?cita cuando el workflow est? en main.

Ubuntu 24.04 alojado por GitHub, Node 24.22.0 y PostgreSQL 17 por digest amd64 en [versions.json](../scripts/ci/versions.json). Acciones fijadas a commits upstream verificados por API. Chromium corresponde al navegador fijado por Playwright 1.64.0 y [lockfile](../scripts/ci/browser/package-lock.json); sus versiones reales se registran. Las im?genes de aplicaci?n CI usan el digest Node sin cambiar los Dockerfiles habituales. Cada build CI usa su propio tag e imagen, sin reutilizar im?genes de otro run ni caches de dependencias. Las revisiones de versiones se hacen por PR.

[run.py](../scripts/ci/run.py) ejecuta los scripts existentes y exige casos TAP ejecutados, sin fallos, omisiones ni cancelaciones. Se conserva inventario de nombres/resultados, sin diagn?sticos privados. Frontend ejecuta pruebas, lint y build por separado. PostgreSQL ejecuta guardas Python, episodios y todas las integraciones existentes. B y C tienen recorridos Chromium desktop/m?vil separados, cada uno con DB nueva. Se exigen todos los IDs declarados por cada driver, resultado PASS, capturas enmascaradas y cero errores inesperados. La prueba B de fecha segmentada verifica rechazo nativo o normalizaci?n v?lida de Chromium; no acredita un rechazo backend desde una fecha que el control no permite introducir.

## Aislamiento y l?mites

[sandbox.py](../scripts/ci/sandbox.py) reutiliza las guardas de im?genes existentes y Compose de pruebas; nunca levanta Compose habitual. UUID nuevo por destino, preflight de ausencia de recursos, PostgreSQL tmpfs, red DB internal, cero puertos DB, sin volumen persistente. Rechaza host/base externa, flags desactivados y recursos sin propiedad. B/C usan tambi?n red de aplicaci?n internal. Solo fixtures ficticios `.invalid`, entrega simulated y secretos desechables de prueba.

Timeout de componente 35 minutos, cada comando 90?900 segundos seg?n alcance, recolectores cinco minutos. SIGTERM/interrupci?n termina el grupo del comando y entra en limpieza de recursos propios. La salida normal o por excepci?n verifica limpieza de contenedores, redes e im?genes propias y conserva los tags preexistentes. Un corte abrupto puede impedir limpieza y artifacts; los runners alojados son ef?meros. Sin reporte o limpieza confirmada no hay aceptaci?n. No se promete recuperar evidencia despu?s de destrucci?n del runner.

## Evidencias

Artifacts por componente `ci-COMPONENT-RUN-ATTEMPT-SHA`; ?ndice `ci-results-RUN-ATTEMPT-SHA`, todos retenidos **14 d?as**, seg?n autorizaci?n de este encargo. SHA es el commit efectivamente probado (merge sint?tico en PR); cada reporte registra adem?s HEAD, base, URL e intento. No atribuir las pruebas del merge a otro HEAD.

[common.py](../scripts/ci/common.py) y [evidence.py](../scripts/ci/evidence.py) exportan ?nicamente JSON estructurado y PNG declarados por el driver con inputs enmascarados, m?s SHA256SUMS. No suben logs brutos, buzones, cuerpos HTTP, tokens/OTP, candidatos/destinos, `.env`, dumps, storage state, HAR, traces o v?deo. Los logs privados solo existen temporalmente en el runner para diagn?stico; no son artifacts. Los checks de saneamiento incluyen fixtures sensibles rechazados. El ?ndice exige artifacts de los cinco componentes para el mismo run/intento/SHA, hashes correctos y limpieza confirmada en jobs aprobados.

`ci/required` usa `always()`, depende de la matriz completa y de evidencia. Solo acepta success, ?ndice ?ntegro y reportes aprobados de todos los componentes; cualquier fallo, cancelaci?n, omisi?n, neutral/desconocido o archivo ausente impide aprobar. La conclusi?n conjunta de la matriz se contrasta adem?s con los cinco reportes individuales. Los artifacts de una suite fallida se intentan conservar, pero nunca convierten esa suite en ?xito.

## Verificaci?n y estado

Resultados reales y enlaces se incorporar?n tras observar las ejecuciones del PR; todav?a no se afirma CI-01?06 completo. Las pruebas de contratos incluyen resultados fallidos, lint/build por c?digo de salida, flags, artifact ausente/alterado, dependencia skipped/cancelled, enlace/fragmento roto y fixtures sensibles. Deben distinguirse ensayos unitarios de estas guardas de fallos inyectados observados en Actions.

CI-07 administrativo queda pendiente de autorizaci?n separada. Lectura API inicial: main coincide con la base; Ruleset `Protect main`, ID 25440100, activo, PR obligatorio, cero aprobaciones, resoluci?n de conversaciones, m?todo merge, bloqueo de borrado y force push; sin checks requeridos. No se cambian Rulesets, permisos, Actions settings, secrets ni auto-merge. No se hace merge ni prueba de rechazo de push administrativo.

ADR-029, RN-59?61 y AB-25, SQL 001?005/manifiesto, cl?nica y barrera AB-23 permanecen intactos. D, v?nculos nuevos, proveedores y despliegue siguen fuera de alcance.
