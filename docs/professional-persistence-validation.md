# D1 — Registro de validación

Base: `3148c9124fb631ff57e2aedd46649182f087bde6` (main remoto consultado y fetch explícito). Rama nueva: feat/d1-professional-persistence. [Contrato y procedimientos](professional-persistence.md). Implementación en rama, sin merge/despliegue; D2/D3 pendientes.

## Ensayo local realmente ejecutado

Commit funcional probado: `26f9a450061f8a76cb57a4763c4f17888b488df6`. En ese momento solo había documentación D1 en edición; código, SQL y tests correspondían a ese commit. Se usó la clase Sandbox de scripts/ci/sandbox.py desde un orquestador temporal ignorado, sin instalar Node/npm en host. Node e imágenes PostgreSQL fijados por scripts/ci/versions.json; PostgreSQL observado: 17.11.

Proyecto propio: psicopanel-episodes-b299e3f0-fe06-45cd-a08e-e0040f144c96. Comprobados ausencia previa, UUID, propiedad de imágenes, DB tmpfs, red privada, ausencia de puertos DB y volúmenes persistentes. Al terminar: cleanupConfirmed=true y preexistingContainersPreserved=true; imágenes de esta ejecución retiradas con comprobación de propiedad, etiquetas preexistentes conservadas.

Comandos realmente ejecutados mediante docker compose -p PROYECTO_NUEVO -f compose.episodes-test.yaml -f OVERRIDE_PROPIO, después del preflight y verificación del sandbox:

| Servicio/comando | Resultado observado |
| --- | --- |
| backend npm run test:episodes | 17 aprobados; 0 fallos/omisiones/cancelaciones |
| backend npm run test:integration | 93 aprobados; 0 fallos/omisiones/cancelaciones; incluye 14 subcasos D1 y su caso contenedor |
| backend npm test | 94 aprobados; 0 fallos/omisiones/cancelaciones |
| frontend npm run test | 3 aprobados; 0 fallos/omisiones/cancelaciones |
| frontend npm run lint | Exit 0 |
| frontend npm run build | Exit 0 |

Frontend se ejecutó con --profile demo run --rm --no-deps en el mismo proyecto nuevo; no se levantó Compose habitual. Los procesos HTTP de pruebas escucharon solo dentro del contenedor de pruebas. No se ejecutaron envíos reales o un navegador D artificial.

## Cobertura D1

Instalación vacía/CLI y rechazo de destino incorrecto; upgrades 003/004/005→006; preservación de filas y ledger previo; migración concurrente/replay sin regenerar UUID; downgrade y versión desconocida; checksum de archivo/ledger y prefijo incompleto; deriva; objetos D1 sin registro; fallo DDL tardío con rollback de tablas y ledger. La prueba de fallo tardío modifica deliberadamente una huella exclusivamente dentro de un fixture nuevo para alcanzar el error DDL; no es opción del runner ni procedimiento de adopción.

Defaults privados, UUID generado por DB/no reutilizable, propietarios/FK compuestas, snapshot/decisión inmutables, revisor autorizado/sin autorrevisión, decisión concurrente única, pendiente consistente al commit con espera PostgreSQL observada, ediciones optimistas, flags independientes, catálogo, validez sin expiración inventada, fotos solo metadatos y privilegios PUBLIC revocados. Prueba HTTP de aplicación anterior sobre 006: lectura legacy, cinco bloqueos AB-23 sin cambios de datos, rutas D ausentes, suspensión y rehabilitación sin revivir JWT.

## Fallo anterior y corrección

Primer ensayo local, commit `5d21a5fd15d1ea098bf64c316c2675ca65856499`, proyecto propio 302850e9-a8c2-437f-855c-a39fc8aa2538: integración con 91 aprobados y 2 fallos TAP (subcaso D1 y contenedor). Causa: aserción esperaba número 3 para BIGINT que pg devuelve como texto. Commit 26f9a45 corrigió la comparación sin relajar SQL o permisos. El subcaso de concurrencia se ejecutó completo en la repetición aprobada. Ambos sandboxes propios quedaron limpiados; no se reutilizaron recursos.

La escritura documental inicial desde PowerShell perdió acentos; se reparó UTF-8 antes del commit documental. No se presentó ese borrador como validación final.

## Preservación y cierre CI

001–005 y sus cinco entradas/hashes se compararon byte a byte con la base y permanecen idénticos. 006 SHA-256: `5d22fb10ce1770bc2b66afa278feedac264aa3873dd6a1d0609e55fc078d1530`. No hay cambios de código runtime backend/frontend, autenticación, permisos, schema/seed, inicializadores o workflow/Ruleset. La suite D1 está realmente incluida en test:integration que ci/postgres ejecuta e inventaría.

El contrato documental valida enlaces/IDs, UTF-8 y bloques protegidos ADR-029/AB-25/RN-59–61. La aceptación del HEAD final depende de sus siete checks Actions y artifacts íntegros; la evidencia local anterior no se atribuye a un SHA documental posterior. PR/ejecución/merge sintético y hashes descargados se registrarán en el informe final y cuerpo del PR al verificar la ejecución correspondiente. Chromium B/C se conserva y se comprobará en esa matriz, sin adelantar D3.

## Ejecuciones Actions conservadas

Primera ejecución [39372360953](https://github.com/japh113/plataformaPsicologia/actions/runs/39372360953), intento 1, HEAD `337d35ecaf493a2479e45764e68212d168c8f804`, merge sintético `0dffe6cddecc3c8ce8cf9301cf3f6536f83af9e7`: cancelada. Docs, backend-unit, frontend y postgres aprobaron; browser quedó cancelado y required falló. Un cambio externo de Draft a ready_for_review generó una ejecución sucesora sobre el mismo HEAD/base; no se presenta la ejecución cancelada como aceptación. La siguiente corrección documental exige otra matriz vigente del HEAD final; el informe de cierre registra su URL y evidencia exactas.

## Riesgos y pendientes

## Corrección focalizada tras auditoría independiente de PR 17

HEAD auditado y punto de partida: `90b392f1c18465a58bb5e8908a8648165922afea`; base remota comprobada: `3148c9124fb631ff57e2aedd46649182f087bde6`. Se preservaron cambios ajenos del workspace mediante un checkout aislado de la misma rama del PR, sin reutilizar CI-07.

Hallazgo P2 confirmado: `catalogChecksum()` registra forma y privilegios de las vistas, pero no su SELECT ni `reloptions`. Cambiar `security_invoker` o la expresión de `review_status` conservaba la huella histórica. El runner ahora exige un contrato complementario de 006: definición de vista de referencia temporal construida desde el SQL verificado de 006 y deparseada en el mismo servidor, opciones exactamente `security_invoker=true`, una sola regla habilitada. Se verifica antes de aceptar 006 ya instalada y después del DDL nuevo, antes del ledger/commit. No repara objetos ni cambia/adopta huellas.

Pruebas nuevas reales: security_invoker=false, opción eliminada, security_barrier adicional y COALESCE alterado manteniendo columnas/tipos; en cada fixture se comprueba instalación/replay inicial, huella histórica idéntica tras la alteración, rechazo explícito, vista alterada preservada y ledger intacto. Otro fixture bloquea el perfil con SELECT FOR UPDATE, inserta approved, promueve la versión, retira pendiente e incrementa row_version dentro de una transacción; verifica referencias, estado y terminalidad. El commit sin retirar pendiente falla y no persiste ni decisión ni cambios del perfil.

Ensayo focalizado: proyecto nuevo `psicopanel-episodes-c3bfc727-0bf1-479d-9687-225221137bdb`, PostgreSQL 17.11, 17 casos D1 aprobados (16 subcasos y contenedor), sin fallos/omisiones/cancelaciones. Al intentar después test:episodes en ese cluster, su protección rechazó correctamente la reutilización con Refusing reused cluster; no se debilitó la protección. Limpieza confirmada, recursos preexistentes preservados. Este fallo de orquestación se conserva como evidencia y no se presenta como regresión aprobada.

Repetición completa en otro proyecto nuevo `psicopanel-episodes-85877a06-3922-409f-bfcb-c84ab39e70d8`, PostgreSQL 17.11: test:episodes 17 aprobados; test:integration 95 aprobados, incluidos los 17 casos D1; cero fallos/omisiones/cancelaciones. Backend npm test, frontend npm run lint y npm run build terminaron con exit 0. Nueve contratos Python CI y contratos documentales (32 Markdown/439 enlaces, decisiones protegidas) aprobaron. Ambos sandboxes con DB tmpfs, red interna, sin puertos DB/volúmenes persistentes; imágenes propias eliminadas y recursos anteriores preservados. No se usaron bases habituales/reales.

Comparación byte a byte contra la base: SQL 001–005 y sus entradas de manifiesto idénticos. Cuerpo histórico de catalogChecksum sin cambios. SQL 006 y su hash permanecen `5d22fb10ce1770bc2b66afa278feedac264aa3873dd6a1d0609e55fc078d1530`. La suite D1 permanece en test:integration, ejecutada e inventariada por Sandbox.postgres en ci/postgres. No hay cambios de workflows, protecciones, frontend, runtime clínico ni D2/D3.

La aceptación remota de esta corrección requiere una nueva matriz completa del nuevo HEAD; los resultados de 90b392f1 no se heredan. El informe final identificará ejecución/intento/HEAD/base/merge sintético y comprobará los siete checks e integridad de artifacts. Como requisito operativo adicional, el rol del runner necesita privilegio TEMP para construir la referencia temporal; no se conceden privilegios automáticamente.

## Riesgos y pendientes vigentes

Sin exposición D1, sesiones nuevas o acceso clínico nuevo. P1 para D2/D3: no interpretar flags ni supported como autorización pública completa; implementar elegibilidad vigente, revisión, retiro y reconfirmación antes de montar lectores. P2: criterios operativos de evidencia, catálogo, tratamiento de declaraciones en texto libre, comunicaciones autorizadas y retención concreta siguen pendientes. No hay TTL/borrado automático ni garantía de calidad terapéutica. Despliegue, producción y recursos habituales fuera de alcance.
