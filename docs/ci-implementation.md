# GitHub Actions — implementación y evidencia

19 de octubre de 2026. Base técnica `58c7b095be237b526d489152a0eab387da3d8d5d`. Implementación en rama `ci/github-actions`, con primera matriz completa verde en GitHub y revisión independiente pendiente. [Plan y criterios CI-01–07](ci-plan.md). No acredita despliegue ni completa las capacidades clínicas pendientes.

## Componentes

[Workflow](../.github/workflows/ci.yml): `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence`, `ci/required`. Todos se ejecutan también ante cambios documentales, sin filtros de paths. La matriz no cancela componentes al fallar otro. Una nueva sincronización cancela la ejecución obsoleta; una ejecución cancelada nunca acredita el nuevo HEAD. `edited` permite revalidar cambios de base, aunque también puede repetir al editar el PR. `push` se limita a main, sin duplicar los PR por push a su rama. Dispatch permite repetición explícita cuando el workflow esté en main.

Ubuntu 24.04 alojado por GitHub, Node 24.22.0 para aplicación y suites, PostgreSQL 17 y navegador oficial por digest amd64 en [versions.json](../scripts/ci/versions.json). Acciones fijadas a commits upstream verificados por API. Chromium corresponde al navegador fijado por Playwright 1.64.0 y [lockfile](../scripts/ci/browser/package-lock.json); sus versiones reales se registran (Node del contenedor navegador 24.21.0, distinto del Node de aplicación). Las imágenes de aplicación CI usan el digest Node sin cambiar los Dockerfiles habituales. Cada build CI usa su propio tag e imagen, sin reutilizar imágenes de otro run ni caches de dependencias. Las revisiones de versiones se hacen por PR.

[run.py](../scripts/ci/run.py) ejecuta los scripts existentes y exige casos TAP ejecutados, sin fallos, omisiones ni cancelaciones. Se conserva inventario de nombres/resultados, sin diagnósticos privados. Frontend ejecuta pruebas, lint y build por separado. PostgreSQL ejecuta guardas Python, episodios y todas las integraciones existentes. B y C tienen recorridos Chromium desktop/móvil separados, cada uno con DB nueva. Se exigen todos los IDs declarados por cada driver, resultado PASS, capturas enmascaradas y cero errores inesperados. La prueba B de fecha segmentada verifica rechazo nativo o normalización válida de Chromium; no acredita un rechazo backend desde una fecha que el control no permite introducir.

## Aislamiento y límites

[sandbox.py](../scripts/ci/sandbox.py) reutiliza las guardas de imágenes existentes y Compose de pruebas; nunca levanta Compose habitual. Nombres CI con run/intento/UUID nuevo por destino, inventario real previo y preflight de ausencia de recursos, PostgreSQL tmpfs, red DB internal, cero puertos DB, sin volumen persistente. Rechaza host/base externa, flags desactivados y recursos sin propiedad. B/C usan también red de aplicación internal. Solo fixtures ficticios `.invalid`, entrega simulated y secretos desechables de prueba.

Timeout de componente 35 minutos, cada comando 90–900 segundos según alcance, recolectores cinco minutos. SIGTERM/interrupción termina el grupo del comando y entra en limpieza de recursos propios. La salida normal o por excepción verifica limpieza de contenedores, redes e imágenes propias y conserva los tags preexistentes. Un corte abrupto puede impedir limpieza y artifacts; los runners alojados usan una [VM nueva por job estándar](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners). Sin reporte o limpieza confirmada no hay aceptación. No se promete recuperar evidencia después de destrucción del runner.

## Evidencias

Artifacts por componente `ci-COMPONENT-RUN-ATTEMPT-SHA`; índice `ci-results-RUN-ATTEMPT-SHA`, todos retenidos **14 días**, según autorización de este encargo. SHA es el commit efectivamente probado (merge sintético en PR); cada reporte registra además HEAD, base, URL e intento. No atribuir las pruebas del merge a otro HEAD.

[common.py](../scripts/ci/common.py) y [evidence.py](../scripts/ci/evidence.py) exportan únicamente JSON estructurado, TAP reconstruido sin diagnósticos y PNG declarados por el driver con inputs y textos de contacto enmascarados, más SHA256SUMS. No suben logs brutos, buzones, cuerpos HTTP, tokens/OTP, candidatos/destinos, `.env`, dumps, storage state, HAR, traces o vídeo. Los logs privados solo existen temporalmente en el runner para diagnóstico; no son artifacts. Los checks de saneamiento incluyen fixtures sensibles rechazados. El índice exige artifacts de los cinco componentes para el mismo run/intento/SHA, hashes correctos y limpieza confirmada en jobs aprobados.

`ci/required` usa `always()`, depende de la matriz completa y de evidencia. Solo acepta success, índice íntegro y reportes aprobados de todos los componentes; cualquier fallo, cancelación, omisión, neutral/desconocido o archivo ausente impide aprobar. La conclusión conjunta de la matriz se contrasta además con los cinco reportes individuales. Los artifacts de una suite fallida se intentan conservar, pero nunca convierten esa suite en éxito.

## Verificación y estado

Resultados observados en la [validación](ci-validation.md). CI-02 permanece parcial por decisión expresa del usuario: no se admite sustituir el PR exclusivamente documental por una revisión Markdown del PR técnico y no se autoriza abrir otro PR. No se declara aceptación completa de CI-01–06. Las nueve pruebas de contratos incluyen resultados fallidos, lint/build por código de salida, flags, artifact ausente/alterado, dependencia skipped/cancelled, enlace/fragmento roto y fixtures sensibles. Deben distinguirse ensayos unitarios de estas guardas de fallos inyectados observados en Actions.

CI-07 administrativo queda pendiente de autorización separada. Lectura API inicial: main coincide con la base; Ruleset `Protect main`, ID 25440100, activo, PR obligatorio, cero aprobaciones, resolución de conversaciones, método merge, bloqueo de borrado y force push; sin checks requeridos. No se cambian Rulesets, permisos, Actions settings, secrets ni auto-merge. No se hace merge ni prueba de rechazo de push administrativo.

ADR-029, RN-59–61 y AB-25, SQL 001–005/manifiesto, clínica y barrera AB-23 permanecen intactos. D, vínculos nuevos, proveedores y despliegue siguen fuera de alcance.
