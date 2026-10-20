# CI — resultados observados y pendientes

19 de octubre de 2026. Único [PR técnico #14](https://github.com/japh113/plataformaPsicologia/pull/14), rama `ci/github-actions`, base `58c7b095be237b526d489152a0eab387da3d8d5d`. [Implementación](ci-implementation.md), [aceptación CI-01–07](ci-plan.md). Sin merge ni cambios administrativos.

## Resultados de GitHub

### Última validación del HEAD auditado

La [ejecución definitiva 39345674640](https://github.com/japh113/plataformaPsicologia/actions/runs/39345674640), intento 1, es la última validación del HEAD auditado `1882badac5adf1693cc4b0ccf94a6146216ec0c5`. Probó realmente el merge sintético `1c3b75cea2e08d648234688745580ec7a6b1c776` contra la base `58c7b095be237b526d489152a0eab387da3d8d5d`; el índice de evidencias distingue HEAD y commit probado.

Los siete checks concluyeron **success**: `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence` y `ci/required`. Backend: 94 casos; frontend: 3 más lint/build; PostgreSQL: 17 episodios y 78 casos de integración; Chromium: 51 B y 13 C. No hubo casos omitidos ni cancelados. Se descargaron los seis artifacts y se comprobaron sus hashes y procedencia, incluido el [índice definitivo](https://github.com/japh113/plataformaPsicologia/actions/runs/39345674640/artifacts/12230612804) `ci-results-39345674640-1-1c3b75cea2e08d648234688745580ec7a6b1c776`, con expiración el 3 de noviembre de 2026 y retención de 14 días.

Tiempos observados del proceso: docs 0,192 s; backend 2,883 s; frontend 8,388 s; PostgreSQL 56,666 s; navegador 119,286 s. El 20 de octubre de 2026 UTC, la ejecución transcurrió de 00:06:44 a 00:09:42 (2 min 58 s, incluida cola); sus jobs, de 00:07:11 a 00:09:41 (2 min 30 s).

La revisión independiente de PR #14 concluyó favorablemente, sin nuevos bloqueantes técnicos. El usuario aprobó la estrategia de integración controlada (*bootstrap*) con CI-02 y CI-07 pendientes en los términos de aceptación siguientes. Este cierre solo modifica documentación; su nuevo HEAD requiere su propia matriz en GitHub y no hereda la aprobación del HEAD auditado ni acredita el PR exclusivamente documental de CI-02.

### Ejecuciones históricas

Se conservan las ejecuciones anteriores, incluidos los fallos y cancelaciones; ninguna sustituye la validación definitiva anterior ni la del nuevo HEAD documental.

| Ejecución | Revisión y resultado observado |
| --- | --- |
| [Primera matriz](https://github.com/japh113/plataformaPsicologia/actions/runs/39341052626) | HEAD `37df2985d4cca1db6d661364cfe2d89ec6b2ee97`, merge probado `b5f97068b03e68c9fe8337e82683aa81fc3918bb`. Docs/backend/frontend/PostgreSQL pasan; Chromium falla al arrancar con usuario no privilegiado; evidence conserva reporte y required falla. Primer fallo conservado, sin reintento silencioso. |
| [Matriz corregida](https://github.com/japh113/plataformaPsicologia/actions/runs/39341855943) | HEAD `03d4e30c90a3119501a67436b6c55995c337634e`, merge probado `8d22b781182b298c1058a6eca7295a1233afd356`. Los siete checks pasan. Artifacts descargados y hashes verificados. |
| [Matriz anterior: siete checks verdes](https://github.com/japh113/plataformaPsicologia/actions/runs/39343737051) | HEAD `cde886440078dd933174d335b57a155c2e6f17e8`, merge probado `2fe0196ccab54456969a674222d12772008cf5ea`. Incluye inventario de fuentes, TAP completo, A05 determinista/advertencia nativa y consola C estricta. Se descargaron los seis artifacts y se verificaron todos los hashes. |
| [Cualificación, intento 1](https://github.com/japh113/plataformaPsicologia/actions/runs/39341855934/attempts/1) | Siete fallos reales inyectados: prueba Node, lint, build, flag opt-in, artifact ausente, enlace roto y fixture sensible. Jobs fallan como se espera; dependencia omitida es skipped; gate falla; verify-rejections pasa. El workflow global es failure deliberadamente, no una matriz aprobada. |
| [Cancelación, intento 2](https://github.com/japh113/plataformaPsicologia/actions/runs/39341855934/attempts/2) | Cancelación explícita mientras los dos jobs de aislamiento estaban activos. Ambos concluyen cancelled; gate falla; verificador de evidencia incompleta falla. No se presenta como limpieza verificada ni ejecución aprobada. |

En la matriz histórica `39343737051`: 94 casos backend; 3 frontend, más lint/build; 17 episodios y 78 integración PostgreSQL; 51 casos B y 13 C en Chromium real. Cero omisiones/cancelaciones inesperadas. Chromium 156.0.8078.4, Playwright 1.64.0, PostgreSQL 17.11. Los conteos reflejan esa ejecución; no son un techo fijo para futuros PR.

Tiempos históricos del proceso por componente en `39343737051`, sin checkout/upload/cola: docs 0,224 s; backend 2,516 s; frontend 13,468 s; PostgreSQL 56,181 s; navegador 126,504 s. Los jobs de esa matriz transcurrieron entre 23:48:22 y 23:50:58 UTC: 2 minutos 36 segundos. La matriz corregida anterior también quedó registrada, sin reutilizar su aprobación para este HEAD. Se registran tiempos reales por comando y componente. Ningún timeout fue ampliado para ocultar un fallo.

## Aislamiento y evidencia

La primera pareja de jobs concurrentes de cualificación usó UUID `d64e00fa-ff97-4616-8a81-03d177834785` y `f76dbad9-8510-4800-a052-36674981ce71`, runners nuevos y DB diferentes. Rechazaron destino existente y externo antes de escribir; comprobaron timeout y SIGTERM del proceso; ambos confirmaron cleanup. En la matriz corregida PostgreSQL usó `848439a0-308e-49c2-86a1-a8d004f8d1ad`; B/C usaron destinos propios diferentes, registrados en sus artifacts. Todos verificaron tmpfs, red internal, ausencia de puertos DB/volúmenes persistentes y propiedad de imágenes.

Cancelación/corte abrupto: la conclusión cancelled está observada por API; no se puede inspeccionar el disco de la VM una vez retirada ni garantizar upload después del corte. El runner alojado estándar es nuevo por job; no se reutiliza como entorno habitual. Una falta de reporte o cleanup confirmado impide aprobar. La cancelación real y la prueba unitaria de conclusión cancelled se distinguen de la terminación SIGTERM controlada con limpieza verificada.

Artifacts históricos de `39343737051`: cinco componentes y un [índice descargable](https://github.com/japh113/plataformaPsicologia/actions/runs/39343737051/artifacts/12230231101) `ci-results-39343737051-1-2fe0196ccab54456969a674222d12772008cf5ea`, con JSON, TAP reconstruido sin diagnósticos, PNG enmascaradas y SHA256SUMS. Se descargaron todos y se verificaron hashes. API muestra expiración el 2 de noviembre de 2026, 14 días después; no es política clínica. Revisión visual local de capturas de login y candidato confirmó máscaras sobre inputs, secretos y contactos; la comprobación automatizada exige que cada captura esté declarada/enmascarada. No se exportan buzón, candidatos/destinos JSON, logs brutos, tokens, dumps, storage state, traces, HAR ni vídeo.

Los ensayos negativos de la [cualificación reforzada](https://github.com/japh113/plataformaPsicologia/actions/runs/39342629362/attempts/1) pasaron su verificador con nombres de recursos run/intento/UUID, inventario real previo y rechazo de fallos/omisiones. Su segundo intento prueba cancelación con aislamiento incluido directamente entre las dependencias del gate.

La [revisión del control date nativo](https://github.com/japh113/plataformaPsicologia/actions/runs/39342996978) ejecutó sus 51 casos B en PASS, pero rechazó correctamente una advertencia de consola no clasificada: el propio fixture de 30 de febrero produce el aviso nativo de formato. Se comprobó ese aviso en un contenedor Chromium nuevo, sin red ni DB; solo se clasifica como esperado durante A05 con ese valor/formato concretos. No se relajan otros errores de consola. Evidencia y required fallaron en esa revisión, sin atribuirle aprobación.

La [cancelación temprana reforzada, intento 3](https://github.com/japh113/plataformaPsicologia/actions/runs/39342629362/attempts/3) dejó todas las suites y aislamiento cancelled; el gate con esas dependencias falló y el verificador de evidencia incompleta también. La [cancelación automática del flujo principal](https://github.com/japh113/plataformaPsicologia/actions/runs/39342909323) dejó PostgreSQL/Chromium cancelled y required failure. Los reportes de esos jobs no confirman limpieza; no se aceptan ni se confunden con los ensayos controlados que sí la verificaron.

La imagen inicial instalaba Chromium bajo el home de root, inaccesible al usuario del contenedor. Se corrigió con imagen oficial Playwright fijada por digest, lockfile y HOME temporal. El runner CI final también añade inventario de casos declarados y resumen TAP completo; las revisiones posteriores requieren nueva matriz para su propio HEAD, no heredan la aprobación anterior.

## Terminación abrupta y archivos entregados

El [ensayo de pérdida abrupta del worker](https://github.com/japh113/plataformaPsicologia/actions/runs/39343737104) probó HEAD `cde886440078dd933174d335b57a155c2e6f17e8`, merge `2fe0196ccab54456969a674222d12772008cf5ea`. Preparó un sandbox nuevo `psicopanel-episodes-ci-39343737104-1-26aae339-d4bf-4c69-9421-9282fb70617e`, comprobó tmpfs/red/puertos/propiedad y verificó un único proceso Runner.Worker propio en GitHub-hosted. Guardó el artifact previo, aplicó SIGKILL solo a ese worker y el job terminó failure (27 segundos, sin pasos posteriores). El auditor en otra VM pasó (5 segundos): misma procedencia, rechazo del resultado failure y ausencia explícita de reporte/cleanup posterior. Ambos artifacts se descargaron y verificaron por SHA256SUMS. La disposición final de la VM es responsabilidad del ciclo GitHub-hosted; no se inspecciona después del corte ni se presenta como limpieza confirmada.

Los dos workflows de cualificación quedan únicamente bajo workflow_dispatch después del ensayo; su trigger temporal de PR se retira. Esto evita fallos intencionales y builds redundantes en futuros PR. La matriz ordinaria conserva los siete checks siempre. La revisión documental final exige una ejecución propia en los Checks de #14; no se acredita CI-02 documental con ella ni hereda resultados anteriores.

| Archivos | Función |
| --- | --- |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | Matriz ordinaria, artifacts/evidence y ci/required |
| [ci-qualification.yml](../.github/workflows/ci-qualification.yml), [ci-runner-stop.yml](../.github/workflows/ci-runner-stop.yml) | Cualificación negativa y corte abrupto explícitos |
| [run.py](../scripts/ci/run.py), [common.py](../scripts/ci/common.py), [evidence.py](../scripts/ci/evidence.py) | Comandos, TAP/inventario, saneamiento, hashes, procedencia y aceptación |
| [docs.py](../scripts/ci/docs.py), [test_contracts.py](../scripts/ci/test_contracts.py) | Enlaces/IDs/decisiones/migraciones y nueve contratos negativos |
| [sandbox.py](../scripts/ci/sandbox.py), [cleanup.py](../scripts/ci/cleanup.py), [episode_images.py](../scripts/episode_images.py) | Destinos nuevos, run/intento/UUID, propiedad y limpieza |
| [negative.py](../scripts/ci/negative.py), [runner_stop.py](../scripts/ci/runner_stop.py) | Fixtures de fallos y terminación del worker propio |
| [versions.json](../scripts/ci/versions.json), [package browser](../scripts/ci/browser/package.json), [lockfile browser](../scripts/ci/browser/package-lock.json) | Digests y dependencias fijados |
| [test-unit.js](../backend/scripts/test-unit.js), [package backend](../backend/package.json), [package frontend](../frontend/package.json) | Reporters TAP explícitos sin duplicar selección de suites |
| [driver B](../scripts/identity-ui-review.cjs), [runner B](../scripts/run-identity-ui-review.py), [driver C](../scripts/contact-ui-review.cjs), [runner C](../scripts/run-contact-ui-review.py) | Chromium privado, casos completos, máscaras y errores inesperados |
| [AGENTS](../AGENTS.md), [CONTRIBUTING](../CONTRIBUTING.md), [README](../README.md), [índice](README.md), [arquitectura](architecture.md), [desarrollo](development.md), [roadmap](product/roadmap.md), [plan](ci-plan.md), [implementación](ci-implementation.md) | Estado, operación y límites actuales; caches Python ignorados en .gitignore |

## Verificación local, distinta de Actions

Guardas Python existentes: seis pruebas. Contratos CI finales: nueve pruebas, incluidos hashes sin mutación, decisiones protegidas, TAP incompleto, casos declarados ausentes y nombres run/intento/UUID. PostgreSQL exploratorio pasó en 66,925 s; B/C exploratorios pasaron 51/13 casos en 440,178 s con limpieza. Se ejecutaron mientras evolucionaba la rama y no se atribuyen al HEAD final ni sustituyen sus checks de GitHub. No se instalaron herramientas en host ni se operó Compose habitual.

La [primera revisión de cierre](https://github.com/japh113/plataformaPsicologia/actions/runs/39344393210), HEAD `b619026550895f3abab586a7cda51de9db64f3a1`, detectó F06 FAIL en B; no hubo errores JS/HTTP inesperados y la limpieza quedó confirmada. Evidence preservó el fallo y required lo rechazó. F06 leía inmediatamente la cantidad de chips Verificado tras la respuesta HTTP; se añade espera explícita a que ambos chips sean visibles, manteniendo la aserción exacta, sin repetir solicitudes, reintentar suites ni ampliar timeouts globales. Se clasifica como corrección de sincronización del harness; la causa concreta del fallo histórico no se infiere de un nuevo pase. Los fallos Chromium posteriores conservan además capturas enmascaradas de los casos afectados y una categoría de error sin mensajes/valores privados. Toda revisión requiere su propia matriz verde.

La [revisión con F06 sincronizado](https://github.com/japh113/plataformaPsicologia/actions/runs/39344908979), HEAD `1f64850b252b141a07b1f57a3fa59164ceeee6bb`, pasó F06 y detectó E05 timeout. Las capturas exportadas muestran que PATCH había guardado y cerrado el modal; el harness esperaba texto de la nota en la pantalla de lista, que no lo muestra. Se corrige la condición: esperar cierre, reabrir la misma nota, comprobar su valor completo original más la modificación ficticia y cerrar sin otra escritura. Se conserva el fallo, sin reintento de suite ni cambios de aplicación. Cleanup confirmado; ningún error JS/HTTP inesperado; required rechazó la ejecución.

## Estado de aceptación

| Criterio | Estado y límite |
| --- | --- |
| CI-01 | Workflows/reportes y PR separado publicados, con ejecuciones reales enlazadas. Revisión independiente favorable, sin nuevos bloqueantes técnicos. |
| CI-02 | **PARCIAL/PENDIENTE**: matriz funcional completa observada. El usuario rechazó expresamente acreditar el caso solo documental con una revisión Markdown del mismo PR. La estrategia bootstrap aprobada deja pendiente comprobar un PR exclusivamente documental después de integrar los workflows en `main`; no se abre otro PR en este cierre. Cada HEAD posterior requiere su matriz vigente. |
| CI-03 | Fallos de test/lint/build/flags/artifact/enlace/saneamiento rechazados en Actions; skipped real y cancelación real sin aprobación. Unitarias adicionales cubren neutral/desconocido y evidencia obsoleta. |
| CI-04 | Dos destinos concurrentes independientes, rechazo previo de existente/externo, timeout y señal con limpieza; cancelación real y SIGKILL del worker propio observados, con evidencia previa y límite de observabilidad posterior del runner efímero. |
| CI-05 | B/C, JWT, clínica, backoffice, frontend y Chromium ejecutados con fixtures ficticios y comunicaciones simuladas. No certifica D ni permisos por episodio pendientes. |
| CI-06 | Artifacts descargables, hashes comprobados, fixtures sensibles rechazados, capturas enmascaradas y retención real 14 días. |
| CI-07 | **PENDIENTE administrativo**: reglas leídas, sin modificarlas. Cero checks obligatorios; cero aprobaciones. Relectura final del Ruleset confirmó además cero bypass actors y configuración intacta. La activación y verificación de checks obligatorios mediante el Ruleset requieren autorización administrativa separada; permanecen pendientes. |

**La aceptación de CI será completa solo después de ambas validaciones: el PR exclusivamente documental de CI-02 y la activación y verificación administrativa de checks obligatorios de CI-07.** El dictamen favorable permite la estrategia bootstrap aprobada con esos dos pendientes; no equivale a aceptación completa. Este cierre no ejecuta merge ni modifica la protección de `main`. No se autoriza despliegue, D ni nuevas vinculaciones. ADR-029/RN-59–61/AB-25 y SQL histórico/manifiesto permanecen intactos.

## Commits técnicos y revisión

Commits anteriores a las correcciones posteriores del cierre documental (el HEAD definitivo y su ejecución se entregan también en el informe del PR):

| SHA | Cambio |
| --- | --- |
| `2e336b6633e82741fb65417e679bcdbadacec8fa` | ci: add documentation and fail-closed evidence contracts |
| `c521614e742a44075b92c3c91df2cdee5b236da6` | ci: orchestrate TAP suites and fresh PostgreSQL Chromium sandboxes |
| `61eb39ccdcc20f7c42410562e80175b8eda95c62` | ci: run complete Actions matrix with sanitized artifacts and required gate |
| `37df2985d4cca1db6d661364cfe2d89ec6b2ee97` | docs(ci): align contribution guidance and implementation status |
| `03d4e30c90a3119501a67436b6c55995c337634e` | ci: harden cleanup artifacts and pinned Chromium; qualify negative paths |
| `65df502965297b87bba05c7fcc68f67cceda17c4` | ci: require full test inventories and bind sandbox provenance to each attempt |
| `b9ed64e99edfadfbb9136a8ce27fad24bc9f14c5` | ci: finalize deterministic browser checks and explicit negative qualification |
| `6d57684424d4578ca4725fd09287ba95c44f8138` | ci: minimize browser build context to locked dependencies |
| `cdde158c9cf60f05aefffa2623f5c28602308634` | ci: classify the native warning from the invalid-date fixture |
| `cde886440078dd933174d335b57a155c2e6f17e8` | ci: qualify abrupt loss of an isolated hosted job worker |

El PR permanece en borrador y sin merge. La revisión independiente ya es favorable y la estrategia bootstrap está aprobada; CI-02 y CI-07 siguen pendientes y condicionan conjuntamente la aceptación completa. Este cierre documental no solicita otra auditoría completa, no activa checks obligatorios ni habilita auto-merge.
