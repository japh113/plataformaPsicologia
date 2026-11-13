# GitHub Actions — implementación y evidencia

CI integrada mediante #14, PR documental #15 y bloqueo negativo #16 cerrado sin merge. Protect main exige los siete checks con política estricta y sin bypass, consultado de solo lectura antes de D1. Base histórica de implementación `58c7b095be237b526d489152a0eab387da3d8d5d`; los informes de entonces conservan su corte. [Plan](ci-plan.md), [evidencia D1](professional-persistence-validation.md). Sin cambios administrativos por D1.

## Componentes

[Workflow](../.github/workflows/ci.yml): `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence`, `ci/required`. Los siete jobs se ejecutan también ante cambios documentales, sin filtros de paths; la [ruta documental verificada](#ruta-documental-y-eventos) conserva sus contextos y declara explícitamente las suites no aplicables. La matriz no cancela componentes al fallar otro. Una nueva sincronización cancela la validación ordinaria obsoleta; una ejecución cancelada nunca acredita el nuevo HEAD. La corrección propuesta tras #67 mantiene `edited` para revalidar cambios de base y payloads ambiguos; las ediciones exclusivamente textuales ejecutan reconocimientos ligeros `metadata/*`, sin suites ni constancias de validación. Todos los eventos `edited` tienen grupo de concurrencia propio y no cancelan otra validación. Su conservación efectiva de checks previos requiere la prueba remota descrita abajo; aún no se acredita. `ready_for_review` no dispara este workflow: el mismo contenido ya se valida desde Draft. `push` se limita a main, sin duplicar los PR por push a su rama. Dispatch permite repetición explícita cuando el workflow esté en main.

Ubuntu 24.04 alojado por GitHub, Node 24.22.0 para aplicación y suites, PostgreSQL 17 y navegador oficial por digest amd64 en [versions.json](../scripts/ci/versions.json). Acciones fijadas a commits upstream verificados por API. Chromium corresponde al navegador fijado por Playwright 1.64.0 y [lockfile](../scripts/ci/browser/package-lock.json); sus versiones reales se registran (Node del contenedor navegador 24.21.0, distinto del Node de aplicación). Las imágenes de aplicación CI usan el digest Node sin cambiar los Dockerfiles habituales. Cada build CI usa su propio tag e imagen, sin reutilizar imágenes de otro run ni caches de dependencias. Las revisiones de versiones se hacen por PR.

[run.py](../scripts/ci/run.py) ejecuta los scripts existentes y exige casos TAP ejecutados, sin fallos, omisiones ni cancelaciones. Se conserva inventario de nombres/resultados, sin diagnósticos privados. Frontend ejecuta pruebas, lint y build por separado. PostgreSQL ejecuta guardas Python, episodios y todas las integraciones existentes, incluida la nueva suite SQL/HTTP D1 por test:integration. D1 mantiene B/C y no inventa un recorrido D de navegador. B y C tienen recorridos Chromium desktop/móvil separados, cada uno con DB nueva. Se exigen todos los IDs declarados por cada driver, resultado PASS, capturas enmascaradas y cero errores inesperados. La prueba B de fecha inexistente asigna explícitamente 30 de febrero al control date real mediante fixture DOM y exige que Chromium lo sanee a vacío y bloquee el envío sin HTTP. Evita depender de cómo el teclado segmentado normaliza fechas según locale; el rechazo backend se cubre en integración.

## Aislamiento y límites

[sandbox.py](../scripts/ci/sandbox.py) reutiliza las guardas de imágenes existentes y Compose de pruebas; nunca levanta Compose habitual. Nombres CI con run/intento/UUID nuevo por destino, inventario real previo y preflight de ausencia de recursos, PostgreSQL tmpfs, red DB internal, cero puertos DB, sin volumen persistente. Rechaza host/base externa, flags desactivados y recursos sin propiedad. B/C usan también red de aplicación internal. Solo fixtures ficticios `.invalid`, entrega simulated y secretos desechables de prueba.

Timeout de componente 35 minutos, cada comando 90–900 segundos según alcance, recolectores cinco minutos. SIGTERM/interrupción termina el grupo del comando y entra en limpieza de recursos propios. La salida normal o por excepción verifica limpieza de contenedores, redes e imágenes propias y conserva los tags preexistentes. Un corte abrupto puede impedir limpieza y artifacts; los runners alojados usan una [VM nueva por job estándar](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners). Sin reporte o limpieza confirmada no hay aceptación. No se promete recuperar evidencia después de destrucción del runner.

## Evidencias

Artifacts por componente `ci-COMPONENT-RUN-ATTEMPT-SHA`; índice `ci-results-RUN-ATTEMPT-SHA`, todos retenidos **14 días**, según autorización de este encargo. SHA es el commit efectivamente probado (merge sintético en PR); cada reporte registra además HEAD, base, URL e intento. No atribuir las pruebas del merge a otro HEAD.

[common.py](../scripts/ci/common.py) y [evidence.py](../scripts/ci/evidence.py) exportan únicamente JSON estructurado, TAP reconstruido sin diagnósticos y PNG declarados por el driver con inputs y textos de contacto enmascarados, más SHA256SUMS. No suben logs brutos, buzones, cuerpos HTTP, tokens/OTP, candidatos/destinos, `.env`, dumps, storage state, HAR, traces o vídeo. Los logs privados solo existen temporalmente en el runner para diagnóstico; no son artifacts. Los checks de saneamiento incluyen fixtures sensibles rechazados. El índice exige artifacts de los cinco componentes para el mismo run/intento/SHA, hashes correctos y limpieza confirmada en jobs aprobados.

Encargo posterior a #60: [corrección acotada del extractor de nombres ante ReDoS](ci-inventory-security.md). Conserva el catálogo obligatorio, comparación con TAP y formatos de evidencia; no amplía el inventario a nombres dinámicos ni modifica los siete checks.

`ci/required` usa `always()`, depende del enrutamiento del evento, de la matriz completa y de evidencia. Exige jobs success, índice íntegro y reportes ejecutados/aprobados o no aplicables por la clasificación documental verificada; cualquier fallo, cancelación, omisión, neutral/desconocido o archivo ausente impide aprobar. La conclusión conjunta de la matriz se contrasta además con los cinco reportes individuales. Los artifacts de una suite fallida se intentan conservar, pero nunca convierten esa suite en éxito.

## Verificación y estado

Resultados observados en la [validación](ci-validation.md). Antecedente histórico al cerrar #14: CI-02 permanecía parcial por decisión expresa del usuario: no se admite sustituir el PR exclusivamente documental por una revisión Markdown del PR técnico y no se autoriza abrir otro PR. No se declara aceptación completa de CI-01–06. El [workflow de cualificación explícita](../.github/workflows/ci-qualification.yml) conserva las pruebas negativas y de aislamiento para repetición mediante dispatch una vez integrado, sin ejecutarlas en cada PR. Durante esta entrega tuvo temporalmente trigger de PR para poder validarlo antes de estar en main; se retira al cerrar la cualificación. El [ensayo de pérdida abrupta](../.github/workflows/ci-runner-stop.yml) también queda solo bajo dispatch explícito. Verifica una VM GitHub-hosted, guarda evidencia previa y termina exclusivamente su worker propio; su auditor exige rechazo y no presume limpieza posterior. Sus fallos deliberados no son los checks de aprobación técnica ni deben configurarse como checks requeridos.

Las nueve pruebas de contratos incluyen resultados fallidos, lint/build por código de salida, flags, artifact ausente/alterado, dependencia skipped/cancelled, enlace/fragmento roto y fixtures sensibles. Deben distinguirse ensayos unitarios de estas guardas de fallos inyectados observados en Actions.

Antecedente histórico antes de #15/#16: CI-07 quedaba pendiente. Lectura API inicial: main coincide con la base; Ruleset `Protect main`, ID 25440100, activo, PR obligatorio, cero aprobaciones, resolución de conversaciones, método merge, bloqueo de borrado y force push; sin checks requeridos. No se cambian Rulesets, permisos, Actions settings, secrets ni auto-merge. No se hace merge ni prueba de rechazo de push administrativo.

ADR-029, RN-59–61 y AB-25, SQL 001–005 y sus entradas históricas, clínica y barrera AB-23 permanecen intactos. D1 agrega solo persistencia privada/006 y pruebas PostgreSQL. D2/D3, vínculos nuevos, proveedores y despliegue siguen fuera de alcance.


## Ruta documental y eventos

Optimización propuesta el 11 de noviembre de 2026, base `cca39a5eba46956944bf1a9592c55c16cca1bfe5` (#64 y #65 integrados), sin PR abiertos al iniciar. Los nombres requeridos se contrastaron con Protect main activo: siete contextos de GitHub Actions, política estricta y ningún bypass. Sin cambios de Rulesets ni CodeQL. Esta entrega modifica CI y debe demostrar **modo completo** en Actions; resultados del Draft aún pendientes al publicar.

| Evento o tipo | Antes | Con esta propuesta |
| --- | --- | --- |
| PR abierto, incluso Draft | Matriz completa | Clasificación nueva; documental permitida o completa |
| `synchronize`, varios commits o actualización de rama | Matriz completa | Clasificación de todo el PR y del merge probado |
| PR reabierto | Matriz completa | Clasificación y evidencia nuevas |
| Draft → Ready, sin cambios | Repite matriz | No dispara CI; conserva la validación del contenido |
| `edited`, solo título/cuerpo acreditados | #66 omitía jobs con nombres dinámicos; regresión #192 | Jobs `metadata/*` ejecutados con pasos ligeros; ningún contexto `ci/*`, suite ni artifact de validación nuevo |
| `edited`, cambio de base, con/sin cambio de texto | Matriz completa | Revalida con base/HEAD/merge nuevos, sin reutilizar evidencia ni cancelar otra validación |
| `edited` ambiguo, sin cambios de texto acreditados o con campos desconocidos | Matriz completa | Revalida de forma conservadora; solo `changes` no vacío con claves título/cuerpo y forma reconocida permite metadata |
| PR exclusivamente documental permitido | Matriz completa | Documentación + contratos/negativos; cuatro constancias de no aplicabilidad |
| PR técnico, mixto o clasificación inválida | Matriz completa | Matriz completa |
| Push/merge a main o `workflow_dispatch` | Matriz completa | Matriz completa, incluso si solo cambia Markdown |

La [allowlist exacta](../scripts/ci/classification.py) contiene 16 rutas humanas de producto, índices e historia: README/NOTES raíz, índice docs, notas de archivo, evidencia clínica bibliográfica, inventario/auditoría documental, estado/checkpoint, visión/roadmap/decisiones/reglas y tres documentos de producto. La búsqueda de consumidores en scripts, workflows, backend y frontend solo encontró validadores que leen esos Markdown; no cargan código, configuración, SQL o fixtures desde ellos. No se permite automáticamente `docs/**/*.md`: los Markdown nuevos, AGENTS/CONTRIBUTING, arquitectura, desarrollo, CI y documentos de seguridad/autorización mantienen modo completo. Un cambio de allowlist modifica scripts CI y por tanto también exige modo completo. Las decisiones protegidas conservan sus validadores actuales.

Cada componente y ambos agregadores recomputan la clasificación desde Git con historial completo, sin API de listado de archivos paginada, título, etiquetas, modo proporcionado por el llamador ni artifacts de clasificación confiados ciegamente. Verifican checkout igual a `GITHUB_SHA` y padres del merge exactamente `[base, head]`; comparan ancestro común→HEAD (todo el PR, no solo el último commit) y base→merge (cambio efectivo). Ambas diferencias deben ser no vacías y contener únicamente rutas permitidas con modo regular no ejecutable. Se representan renombrados como eliminación y alta, comprobando ambos extremos. Eliminaciones/altas/ediciones se clasifican igual; errores de Git, historia ausente, ancestry ambigua, diff vacío, symlinks, modos ejecutables o rutas desconocidas fuerzan `full`. La clasificación no transforma errores en aprobación: las suites completas todavía deben aprobar y la documentación valida SQL/hashes/decisiones.

Los cinco componentes siempre ejecutan un job real para contenido. `ci/docs` ejecuta enlaces/fragmentos locales, referencias ADR/RN/AB, decisiones protegidas, manifiesto/hashes históricos, diff y todos los tests CI offline. En modo `docs`, los otros cuatro ejecutan el clasificador y exportan solamente `report.json` + `SHA256SUMS`: `status:not_applicable`, `suites:[]`, `isolation:[]`, motivo `verified-documentation-only`, inventario de archivos de ambas diferencias e identidad completa. **No** se crea TAP, screenshot, conteo de tests ni historial de ejecución para esas suites. Mantener estos jobs pequeños evita jobs requeridos omitidos condicionalmente y mantiene el contrato de artifacts sin simular pruebas. Node/setup/checkout/upload aún tienen coste; no se instala npm ni se inicia PostgreSQL/Chromium en estas cuatro constancias.

`ci/evidence` y `ci/required` exigen clasificación idéntica a la recomputada, integridad, run/intento/HEAD/base/merge actuales y todos los artifacts. En modo completo solo aceptan suites realmente ejecutadas con las garantías anteriores; en modo documental solo admiten `not_applicable` para esos cuatro componentes y un reporte documental ejecutado/completo. `ci/required` exige además éxito real de la matriz y del agregador en `needs`; una falla, cancelación o job omitido impide aprobar aunque exista un artifact. El índice registra clasificación, estados distintos y retención de 14 días; se conserva el escaneo de datos sensibles. Falta de artifacts, índice obsoleto, clasificación falsa o constancia incompleta falla cerrado.

Una edición textual usa nombres `metadata/*` y grupo de concurrencia propio por run. No puede sustituir un check requerido fallido por uno omitido verde ni cancelar una ejecución útil. Un cambio de base explícito usa los siete nombres normales y el grupo de validación. El avance independiente de main conserva la garantía estricta de rama actualizada: actualizar/rebasar/mergear la rama produce `synchronize` y un nuevo merge probado. No se promete ejecución automática de PR por cada push ajeno a main; no se reutiliza un índice anterior para otro merge. Las ejecuciones manuales son explícitamente completas y no sustituyen por sí mismas la evidencia PR exigida por GitHub.

Referencias de plataforma: [eventos y SHA de merge](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [checks omitidos y requisitos estrictos](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks). Los tests separan payloads del router, conexiones estáticas y expresiones de nombres/concurrencia; la evaluación final de eventos/check names pertenece a GitHub y debe comprobarse antes de integrar. La CI no protege contra una reescritura arbitraria del propio workflow por alguien con capacidad de proponer cambios técnicos: revisión independiente del diff y siete checks estrictos siguen siendo gates, sin permisos adicionales ni ejecución privilegiada.

### Verificación y coste observable

Los nuevos tests crean repositorios Git nuevos con varios commits/base/merge, archivos técnicos, renombrados, eliminaciones, modos y errores. Un fixture completo ejecuta el runner documental, cuatro constancias reales, sellado, agregador e índice y `ci/required`; después corrompe estados, suites, clasificación, identidad (incluido run/intento), artifacts y `needs` para exigir rechazo. Los negativos anteriores se conservan. No hay DB, navegador, instalación en host ni cambios a recursos habituales en estas pruebas del control de CI.

Como referencia histórica observable, el run [43083226484](https://github.com/japh113/plataformaPsicologia/actions/runs/43083226484) de main `11f5086` duró 8 min 4 s entre creación y actualización final; [42879109619](https://github.com/japh113/plataformaPsicologia/actions/runs/42879109619), 9 min 43 s. Es tiempo de pared (incluye esperas), no minutos facturados ni ahorro demostrado. La ruta documental elimina cuatro suites pesadas y las ediciones textuales/Ready eliminan una repetición de suites por evento; el ahorro exacto de minutos/créditos requiere runs comparables después de integrar. No se inventa un porcentaje ni se atribuye a la ruta rápida una medición que aún no existe.


## Regresión de metadatos tras #67 — propuesta pendiente de aceptación remota

Corte del 13 de noviembre de 2026: fetch de `origin/main` y API coinciden en
`c4270476af6c93678f093b2e8a20e098b80ba224` (#67 integrado), checkout original limpio,
cero PR abiertos y 13 Issues abiertos al iniciar. Protect main consultado de solo
lectura: activo, siete contextos de GitHub Actions, política estricta y cero bypass.
No se modifican Rulesets, CodeQL ni protección de main.

### Hechos, inferencias y alternativa elegida

La API confirma para el HEAD `9756fc09cebf557d567b03e15a0b8f721e095139`:

- [CI #191](https://github.com/japh113/plataformaPsicologia/actions/runs/43475690925)
  y [CI #193](https://github.com/japh113/plataformaPsicologia/actions/runs/43479757647):
  siete jobs `ci/*`, todos success, en suites distintas.
- [CI #192](https://github.com/japh113/plataformaPsicologia/actions/runs/43475733127):
  tres jobs skipped, nombres con expresiones literales, sin expansión de la matriz.
  Se creó a las 17:44:17 UTC, mientras #191 seguía ejecutándose; #191 terminó a
  las 17:45:17 UTC. No fue una validación fallida del contenido.
- El bloqueo `Expected` al pasar a Ready y la recuperación al reabrir son la
  observación aportada por el propietario en [#67](https://github.com/japh113/plataformaPsicologia/pull/67).
  Los endpoints de runs/jobs consultados no conservan el payload completo ni el
  estado histórico del merge box: no demuestran por sí solos la acción `edited`.

GitHub documenta que el [if del job precede a la expansión de la matriz](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif)
y que [un job omitido puede satisfacer una protección](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions).
Esto explica por qué omitir jobs con nombres estáticos `ci/*` sería inseguro.
La causa interna de selección de suites/contextos de #192 sigue siendo una
hipótesis; no se atribuye un bug interno demostrado al planificador de GitHub.

Alternativas evaluadas:

| Alternativa | Evaluación |
| --- | --- |
| Quitar `edited` | Pierde revalidación de cambio de base; descartada. Los [tipos del evento](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) y filtros de rama no separan título y base. |
| Conservar omisiones con nombres estáticos requeridos | Un skipped puede ocultar una validación fallida; descartada. |
| Repetir suites en cada edición | Conservadora, pero añade trabajo innecesario y no cumple la optimización solicitada. |
| Otro workflow, dispatch, `pull_request_target` o checks escritos por API | Más superficie, permisos y problemas de asociación al merge. No se necesitan para probar esta propuesta. |
| Ejecutar los jobs con namespace de metadatos y limitar los pasos | Seleccionada como propuesta mínima verificable; elimina el if falso previo a la matriz, conserva un solo workflow y permisos de lectura. Su efecto en la selección remota de checks aún debe demostrarse. |

[events.py](../scripts/ci/events.py) acepta solo `edited` con `changes` no vacío,
claves exclusivamente `title`/`body`, objetos con una única clave `from` y tipos
reconocidos. Base, campos desconocidos, formas incompletas, JSON ilegible o evento
desconocido eligen `ci`. El texto del PR nunca se interpreta como código.
El nuevo job `metadata/route` entrega solo el namespace, sin decidir docs/full;
[classification.py](../scripts/ci/classification.py) sigue recomputando ambas
diferencias y los padres del merge en cada consumidor.

Los otros jobs usan `always()` en ambos caminos. Primero exigen enrutamiento
correcto; las suites, checkout completo, limpieza y artifacts solo ejecutan en
`ci`. El fallback de nombres ante fallo del router es `ci`, con fallo explícito,
nunca aprobación. `ci/required` exige también éxito del router, además de matriz,
índice, identidad y hashes. En metadata solo hay reconocimientos explícitos:
no se ejecuta `run.py`, no se produce `not_applicable`, no se copia evidencia
previa ni se escribe éxito bajo nombres `ci/*`.

La concurrencia aísla **todos** los `edited` mediante run ID antes de interpretar
el payload; así una edición ambigua tampoco cancela trabajo útil. Open/sync/reopen
siguen compartiendo grupo por PR y cancelan validaciones ordinarias obsoletas.
Las validaciones por cambio de base pueden coexistir; la aceptación sigue ligada
a HEAD/base/merge/intento exactos y a la política estricta. Draft/Ready no genera
runs y no se usa para elegir una conclusión. No se infiere autorización de merge
de un reconocimiento metadata ni se garantiza orden de ejecución.

### Pruebas locales y límites

[test_workflow_events.py](../scripts/ci/test_workflow_events.py) prueba payloads,
entrypoint real del router, fallo cerrado y conexiones estáticas del workflow;
[test-events.cjs](../scripts/ci/test-events.cjs) comprueba únicamente expresiones
de nombres y grupos. La regresión estática prohíbe el if de job que permitió
#192 aunque JavaScript calcule el nombre pretendido. Las pruebas de clasificación
mantienen historiales Git reales y consumidores de evidencia; el negativo del
agregador incluye ahora fallo, omisión y cancelación del router.

`vm.runInNewContext()` no reproduce expansión, publicación, selección de suites
ni branch protection. Las transiciones de estado y resultados anteriores probadas
localmente son contratos del enrutamiento, no una prueba de que GitHub conserve
checks. Un parseo YAML local tampoco valida la semántica del servicio.

En esta máquina Docker no conecta con su daemon y no hay Node Linux en PATH.
El Node existente de Windows es 25.9.0; sirve para unidades de expresiones, pero
el inventario AST exige exactamente Node 24.22.0/Acorn 8.18.0. No se instala ni
suplanta ese runtime, ni se relajan sus guardas. La suite documental de extremo a
extremo, el inventario positivo y las suites funcionales quedan a Actions full.
No se ejecutan bases, demos ni recursos habituales.

Resultado local: **30 pruebas aprobadas** de clasificación, contratos negativos y
eventos (9 de eventos), parseo YAML con PyYAML 5.4.1 y validación de los 57 Markdown
y 1614 enlaces mediante `docs.run(origin/main)`, con decisiones/manifiesto/hashes
conservados. No se ejecutan las 24 pruebas de `test_inventory_source.py` ni las dos
pruebas que dependen del inventario positivo y del pipeline documental completo,
por ausencia del runtime fijado. Esto no es una suite completa aprobada.
`git diff --check` pasa; `actionlint` no está instalado.

### Procedimiento remoto en el único Draft y puerta de aceptación

**Estado: corrección propuesta; aceptación bloqueada hasta reunir evidencia
remota.** Un CI verde del PR técnico no demuestra resuelta la regresión.
Publicar este cambio exige `full`; no se solicita excepción documental. Consultar
una sola vez tras iniciar CI y terminar con `CI pendiente` si continúa. El
propietario debe solicitar la siguiente intervención cuando haya evidencia,
sin mantener agentes activos esperando ni hacer polling.

1. Registrar HEAD/base/merge, run/intento, siete checks success, análisis aplicables
   y artifacts íntegros de 14 días del Draft. El workflow y scripts nuevos deben
   estar en el merge probado. Conservar IDs de cada check y suite, no solo colores.
2. Sin commits, editar título, cuerpo y ambos en operaciones separadas. Para cada
   caso, registrar el run nuevo y sus jobs, HEAD/base/merge antes y después, y los
   checks de HEAD **y del merge**. Deben publicarse ocho reconocimientos metadata
   (router más siete jobs) ejecutados, nombres resueltos, cero suites/artifacts
   nuevos y ninguna cancelación del run de contenido. Los siete `ci/*` vigentes
   deben seguir visibles y exigibles, sin reemplazos skipped ni Expected.
3. Repetir una edición mientras existe validación útil en curso y comprobar su
   no cancelación. Repetir tras validación fallida real: metadata y Draft/Ready no
   pueden convertir el fallo en aceptación. No crear commits vacíos ni inyectar
   fallos funcionales fuera del alcance; si no hay un fallo disponible, registrar
   esta comprobación pendiente y solicitar un ensayo CI acotado por separado.
4. El propietario puede pasar Ready y regresar a Draft sin commits: comprobar
   que no nace CI y que los siete checks conservan sus conclusiones. Este encargo
   entrega Draft; no se hace merge ni transición Ready automática.
5. Para cambio de base, usar solo una base de ensayo autorizada y no alterar
   main: retargetear de vuelta a main, con y sin texto, debe crear validación con
   nueva identidad y clasificación recomputada. Un payload ambiguo no se puede
   fabricar mediante la edición ordinaria de GitHub; queda cubierto localmente
   por el router y requiere un evento real comparable si se observa.
6. Reopen y un commit real autorizado deben crear validaciones nuevas. Push a
   main y dispatch conservan full por contrato, sin hacer push a main ni integrar
   para ensayarlos. Se verifican cuando el propietario autorice esos eventos;
   no se reutiliza evidencia histórica como prueba nueva.

Si un metadata run ejecutado vuelve a ocultar los contextos anteriores, si cambia
el merge efectivo sin validación vigente, o si Ready permite ignorar un fallo,
esta propuesta **no queda aceptada**: conservar Draft, registrar el bloqueo y
revisar el diseño antes de integrar. También quedan como riesgos pendientes de
verificación remota la cancelación antes de publicar outputs del router y la
selección de suites concurrentes. La [documentación de checks requeridos](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
exige el commit vigente y distingue checks de HEAD y del merge; ningún ensayo
local sustituye esa comprobación. Work debe auditar el HEAD final y el propietario
decidir integración una vez satisfechas todas las puertas.
