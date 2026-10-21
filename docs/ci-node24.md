# Mantenimiento de acciones CI a Node.js 24

Base del encargo: `b842b73e317033684b47084859d01cfda5275743`. Se actualizan las referencias de los tres [workflows](../.github/workflows) a publicaciones estables oficiales, sin cambios de aplicación, SQL, contratos clínicos ni administración del repositorio. El PR debe permanecer Draft para revisión independiente, sin merge ni auto-merge.

## Procedencia de los pins

Cada SHA nuevo se resolvió mediante la API oficial `git/ref/tags/VERSION`, contrastando la publicación estable (`draft=false`, `prerelease=false`) y leyendo `action.yml` y README en ese commit. Los cuatro `runs.using` son `node24`. Los pins anteriores también se contrastaron con sus etiquetas oficiales.

| Acción | Versión y SHA anteriores | Versión y SHA nuevos | Publicación oficial |
| --- | --- | --- | --- |
| checkout | v4.4.0 — `11d5960a326750d5838078e36cf38b85af677262` | v7.0.1 — `3d3c42e5aac5ba805825da76410c181273ba90b1` | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) |
| setup-node | v4.4.0 — `49933ea5288caeca8642d1e84afbd3f7d6820020` | v7.1.0 — `949feb2413d6458794dcd2491c4babbbce0c15c1` | [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) |
| upload-artifact | v4.6.2 — `ea165f8d65b6e75b540449e92b4886f43607fa02` | v7.0.2 — `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | [v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) |
| download-artifact | v4.3.0 — `d3f86a106a0bac45b974a628896c90dbdf5c8093` | v8.0.2 — `9000827ccba6bdab643e8b6fd33ac0654aef8333` | [v8.0.2](https://github.com/actions/download-artifact/releases/tag/v8.0.2) |

## Compatibilidad revisada

- Node 24 exige runner >= 2.327.1. Se conserva `ubuntu-24.04` GitHub-hosted; comprobar la versión real del runner en los logs del nuevo run. El Node de aplicación/suites sigue en `24.22.0`, independiente del runtime de las acciones.
- [Checkout](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1): v6 trasladó credenciales a RUNNER_TEMP y requiere >= 2.329.0 para Git autenticado desde container actions. Aquí se conserva `persist-credentials: false`. La protección v7 para forks bajo `pull_request_target`/`workflow_run` no afecta a los eventos existentes `pull_request`, `push` y dispatch. Se mantiene el checkout predeterminado del merge sintético y el historial completo donde se requería.
- [Setup-node](https://github.com/actions/setup-node/tree/949feb2413d6458794dcd2491c4babbbce0c15c1): v5/v6 introdujeron caché npm automática; `package-manager-cache: false` conserva la ausencia de cachés de dependencias. V7 migra a ESM y retira el token npm ficticio de respaldo; estos workflows no configuran registry-url ni publican paquetes. No requieren adaptación de autenticación.
- [Upload v6](https://github.com/actions/upload-artifact/releases/tag/v6.0.0) activa Node 24 por defecto; [v7](https://github.com/actions/upload-artifact/releases/tag/v7.0.0) añade ESM y carga directa opcional. `archive` sigue siendo true: se mantienen ZIP, nombres, rutas relativas y múltiples archivos por artifact. Se conservan exclusión de ocultos y `overwrite: false` por defecto, `if-no-files-found: error` y retención explícita de 14 días. No se usa carga directa, que ignoraría el nombre configurado.
- [Download v5](https://github.com/actions/download-artifact/releases/tag/v5.0.0) cambia la carpeta para una descarga por ID; aquí se usan nombres o patrones. [V7](https://github.com/actions/download-artifact/releases/tag/v7.0.0) activa Node 24; [v8](https://github.com/actions/download-artifact/releases/tag/v8.0.0) introduce ESM, detección de ZIP por Content-Type y `digest-mismatch: error` por defecto. Se conserva extracción, `merge-multiple: false`, carpeta por artifact al usar patrones y extracción directa al usar name. Upload 7 con ZIP y download 8 son compatibles. No se relaja la comprobación de digest.
- Los ZIP no preservan permisos Unix (directorios 755, archivos 644), igual que antes. La evidencia contiene JSON/TAP/PNG y SHA256SUMS; no requiere ejecutables ni permisos especiales. Las rutas actuales no dependen de archivos ocultos. [Documentación de upload](https://github.com/actions/upload-artifact/tree/cf430e030ddbb5b0abf93d22962f4752f3646cd9), [documentación de download](https://github.com/actions/download-artifact/tree/9000827ccba6bdab643e8b6fd33ac0654aef8333).

## Validación y límites

No hay allowlists ni validadores ligados a los SHA anteriores fuera de las referencias actualizadas. Los scripts de contratos y evidencia permanecen intactos. Se conservan los siete checks, condiciones, triggers, concurrencia, permisos `contents: read`, seis artifacts, identidad run/intento/HEAD/base/merge, SHA256SUMS, índice, inventarios y limpieza de recursos propios descritos en la [implementación CI](ci-implementation.md).

Validación local focalizada: diez pruebas existentes de contratos con `python -X utf8 -B -m unittest discover -s scripts/ci -p test_*.py`, contrato documental y `git diff --check`. UTF-8 explícito es necesario en este host Windows; la invocación inicial sin él falló al leer documentación con cp1252, sin cambiar scripts para suplirlo. No se instalaron herramientas ni se ejecutaron Docker, PostgreSQL, SQL o demos locales.

La validación nueva de Actions, logs, seis artifacts y hashes debe vincularse al HEAD final y a su merge sintético en la descripción del PR. La ejecución anterior 39523746060 es solo antecedente. El evento push a main se conserva por comparación del workflow; su ejecución con los pins nuevos queda pendiente de un eventual merge autorizado por separado. Los workflows de cualificación siguen bajo dispatch explícito y no se ejecutan como parte de este mantenimiento.
