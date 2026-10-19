# CI — resultados observados y pendientes

19 de octubre de 2026. Único [PR técnico #14](https://github.com/japh113/plataformaPsicologia/pull/14), rama `ci/github-actions`, base `58c7b095be237b526d489152a0eab387da3d8d5d`. [Implementación](ci-implementation.md), [aceptación CI-01–07](ci-plan.md). Sin merge ni cambios administrativos.

## Resultados de GitHub

| Ejecución | Revisión y resultado observado |
| --- | --- |
| [Primera matriz](https://github.com/japh113/plataformaPsicologia/actions/runs/39341052626) | HEAD `37df2985d4cca1db6d661364cfe2d89ec6b2ee97`, merge probado `b5f97068b03e68c9fe8337e82683aa81fc3918bb`. Docs/backend/frontend/PostgreSQL pasan; Chromium falla al arrancar con usuario no privilegiado; evidence conserva reporte y required falla. Primer fallo conservado, sin reintento silencioso. |
| [Matriz corregida](https://github.com/japh113/plataformaPsicologia/actions/runs/39341855943) | HEAD `03d4e30c90a3119501a67436b6c55995c337634e`, merge probado `8d22b781182b298c1058a6eca7295a1233afd356`. Los siete checks pasan. Artifacts descargados y hashes verificados. |
| [Cualificación, intento 1](https://github.com/japh113/plataformaPsicologia/actions/runs/39341855934/attempts/1) | Siete fallos reales inyectados: prueba Node, lint, build, flag opt-in, artifact ausente, enlace roto y fixture sensible. Jobs fallan como se espera; dependencia omitida es skipped; gate falla; verify-rejections pasa. El workflow global es failure deliberadamente, no una matriz aprobada. |
| [Cancelación, intento 2](https://github.com/japh113/plataformaPsicologia/actions/runs/39341855934/attempts/2) | Cancelación explícita mientras los dos jobs de aislamiento estaban activos. Ambos concluyen cancelled; gate falla; verificador de evidencia incompleta falla. No se presenta como limpieza verificada ni ejecución aprobada. |

En la matriz corregida: 94 casos backend; 3 frontend, más lint/build; 17 episodios y 78 integración PostgreSQL; 51 casos B y 13 C en Chromium real. Cero omisiones/cancelaciones inesperadas. Chromium 156.0.8078.4, Playwright 1.64.0, PostgreSQL 17.11. Los conteos reflejan esa ejecución; no son un techo fijo para futuros PR.

Tiempos del proceso por componente, sin checkout/upload/cola: docs 0,295 s; backend 3,237 s; frontend 9,701 s; PostgreSQL 58,942 s; navegador 127,324 s. Los jobs de esa matriz transcurrieron entre 23:29:36 y 23:32:27 UTC. Se registran tiempos reales por comando y componente. Ningún timeout fue ampliado para ocultar un fallo.

## Aislamiento y evidencia

Los dos jobs concurrentes de cualificación usaron UUID `d64e00fa-ff97-4616-8a81-03d177834785` y `f76dbad9-8510-4800-a052-36674981ce71`, runners nuevos y DB diferentes. Rechazaron destino existente y externo antes de escribir; comprobaron timeout y SIGTERM del proceso; ambos confirmaron cleanup. En la matriz corregida PostgreSQL usó `848439a0-308e-49c2-86a1-a8d004f8d1ad`; B/C usaron destinos propios diferentes, registrados en sus artifacts. Todos verificaron tmpfs, red internal, ausencia de puertos DB/volúmenes persistentes y propiedad de imágenes.

Cancelación/corte abrupto: la conclusión cancelled está observada por API; no se puede inspeccionar el disco de la VM una vez retirada ni garantizar upload después del corte. El runner alojado estándar es nuevo por job; no se reutiliza como entorno habitual. Una falta de reporte o cleanup confirmado impide aprobar. La cancelación real y la prueba unitaria de conclusión cancelled se distinguen de la terminación SIGTERM controlada con limpieza verificada.

Artifacts de la matriz corregida: cinco componentes y un índice `ci-results-39341855943-1-8d22b781182b298c1058a6eca7295a1233afd356`, con JSON, TAP reconstruido sin diagnósticos, PNG enmascaradas y SHA256SUMS. Se descargaron todos y se verificaron hashes. API muestra expiración a 14 días; no es política clínica. Revisión visual local de capturas de login y candidato confirmó máscaras sobre inputs, secretos y contactos; la comprobación automatizada exige que cada captura esté declarada/enmascarada. No se exportan buzón, candidatos/destinos JSON, logs brutos, tokens, dumps, storage state, traces, HAR ni vídeo.

La imagen inicial instalaba Chromium bajo el home de root, inaccesible al usuario del contenedor. Se corrigió con imagen oficial Playwright fijada por digest, lockfile y HOME temporal. El runner CI final también añade inventario de casos declarados y resumen TAP completo; las revisiones posteriores requieren nueva matriz para su propio HEAD, no heredan la aprobación anterior.

## Verificación local, distinta de Actions

Guardas Python existentes: seis pruebas. Contratos CI finales: nueve pruebas, incluidos hashes sin mutación, decisiones protegidas, TAP incompleto, casos declarados ausentes y nombres run/intento/UUID. PostgreSQL exploratorio pasó en 66,925 s; B/C exploratorios pasaron 51/13 casos en 440,178 s con limpieza. Se ejecutaron mientras evolucionaba la rama y no se atribuyen al HEAD final ni sustituyen sus checks de GitHub. No se instalaron herramientas en host ni se operó Compose habitual.

## Estado de aceptación

| Criterio | Estado y límite |
| --- | --- |
| CI-01 | Workflows/reportes y PR separado publicados, con ejecuciones reales enlazadas. Revisión independiente pendiente. |
| CI-02 | **PARCIAL/PENDIENTE**: matriz funcional completa observada. El usuario rechazó expresamente acreditar el caso solo documental con una revisión Markdown del mismo PR. Falta un PR exclusivamente documental; este encargo autoriza un único PR y no se abre otro. Cada HEAD posterior requiere su matriz vigente. |
| CI-03 | Fallos de test/lint/build/flags/artifact/enlace/saneamiento rechazados en Actions; skipped real y cancelación real sin aprobación. Unitarias adicionales cubren neutral/desconocido y evidencia obsoleta. |
| CI-04 | Dos destinos concurrentes independientes, rechazo previo de existente/externo, timeout y señal con limpieza; cancelación real con límite de observabilidad del runner efímero. |
| CI-05 | B/C, JWT, clínica, backoffice, frontend y Chromium ejecutados con fixtures ficticios y comunicaciones simuladas. No certifica D ni permisos por episodio pendientes. |
| CI-06 | Artifacts descargables, hashes comprobados, fixtures sensibles rechazados, capturas enmascaradas y retención real 14 días. |
| CI-07 | **PENDIENTE administrativo**: reglas leídas, sin modificarlas. Cero checks obligatorios; cero aprobaciones. Revisor independiente y eventual configuración/rechazo administrativo requieren autorización separada. |

No se declara terminada la aceptación obligatoria de CI mientras CI-02 permanezca pendiente. No se autoriza integración, despliegue, D ni nuevas vinculaciones. ADR-029/RN-59–61/AB-25 y SQL histórico/manifiesto permanecen intactos.
