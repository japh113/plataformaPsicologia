# Estado operativo y backlog — corte documental #40

Corte de consulta: **29 de octubre de 2026**. Base remota `main`: [`a1720245083008399a3543ca4b794ec4d1289d5a`](https://github.com/japh113/plataformaPsicologia/commit/a1720245083008399a3543ca4b794ec4d1289d5a), merge de #27, comprobada por API de rama y checkout Git. Este documento atiende [Issue #40](https://github.com/japh113/plataformaPsicologia/issues/40). Es una referencia fechada: antes de otro encargo consultar HEAD y metadatos reales, sin convertir esta tarea en una auditoría general periódica.

**Integrado** significa código/documentación incorporados a Git. **Aprobado como producto** conserva la decisión, pero no acredita implementación. **Pendiente** identifica trabajo o decisiones por resolver; un Issue abierto no autoriza ejecutarlos. Ninguno de estos estados acredita migraciones instaladas, capacidades activadas o despliegue en una instancia habitual.

## Implementación y decisiones vigentes

| Área | Estado al corte y límite verificable |
| --- | --- |
| Aplicación | Web React/Vite + Express JavaScript + PostgreSQL. React Native/Expo y TypeScript son dirección futura. [Arquitectura](architecture.md). |
| Backoffice | #7 integrado; support/admin/superadmin sin acceso clínico global ordinario. Identidad, acreditación y publicación no conceden clínica. |
| Episodios SQL | #8 integró 003; no activó permisos clínicos por episodio. El índice global histórico y sus FK permanecen hasta una sucesora autorizada. [Fundamentos](clinical-episodes-foundation.md). |
| A/B/C | #10/#11/#12 integrados: documentación, registro adulto/identidad/verificación simulada con AB-23 y contactos seguros con revocación total. [Plan](identity-directory-delivery-plan.md). |
| D1/D2 | #17/#18 integrados: 006/007, persistencia y gestión privadas, sesiones restringidas, propuestas/rechazo y fotos privadas. Publicación y aprobación operativa de credenciales deshabilitadas; no se reimplementan por #40. [Contrato D2](private-professional-management.md). |
| Privacidad paciente | [#25](https://github.com/japh113/plataformaPsicologia/pull/25) integrado; [#23](https://github.com/japh113/plataformaPsicologia/issues/23) cerrado como completado. Proyección por actor omite campos profesionales de las respuestas al paciente, también al escribir. [Contrato y evidencia histórica](patient-response-privacy.md). |
| Objetivos | [#26](https://github.com/japh113/plataformaPsicologia/pull/26) integrado; [#22](https://github.com/japh113/plataformaPsicologia/issues/22) cerrado como completado. Solo psicólogo autorizado determina cumplimiento; paciente consulta progreso y conserva tareas interactivas. [Contrato y evidencia histórica](objective-completion-authorization.md). |
| Mi seguimiento | [#27](https://github.com/japh113/plataformaPsicologia/pull/27) integrado; [#21](https://github.com/japh113/plataformaPsicologia/issues/21) cerrado como completado. Consultas completadas/tareas y legado separado, sin notas profesionales; protecciones locales de respuestas obsoletas y recuperación confirmada. [Contrato y evidencia histórica](patient-follow-up.md). |
| Pareja y paralelos | #19/#24 fueron documentales: ADR-030/RN-62–73 aprobados como producto, con evidencia clínica preservada; motor, participantes y aislamiento por tratamiento no implementados. [Decisión](parallel-couple-episodes.md), [evidencia anonimizada](couple-clinical-evidence.md). |
| Etapa 2A | Parcial. D3, vinculación bilateral, activación, entrevista por episodio y permisos/archivo por episodio siguen pendientes. La aplicación autoriza por paciente con lectores legacy; no basta retirar un índice o parte del fallback. [Roadmap](product/roadmap.md). |
| CI | Implementada en #14, comprobada por #15 y ensayo negativo #16, este último cerrado **sin merge**. #20 actualizó Actions. Siete checks, artifacts técnicos de 14 días y matriz completa también para Markdown. La ampliación de navegador #33 sigue pendiente. |

AB-23 mantiene bloqueadas las cinco mutaciones legacy para cuentas nuevas y existentes, sin borrar pendientes. ADR-029/RN-59–61 siguen exigiendo entrevista completada y validación profesional explícita antes de todo episodio nuevo; la precondición backend/DB sigue pendiente. Cuenta, verificación, aceptación bilateral o publicación no equivalen a activación.

La entrevista legacy continúa con columnas fijas por paciente y permiso de primera escritura del paciente/posteriores ediciones profesionales. [#41](https://github.com/japh113/plataformaPsicologia/issues/41) conserva el discovery inicial. **Actualización documental posterior, base #43 `e15610289614c4e8eee03ac4fca875810d1439a3`:** [ADR-031](product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades) registra dos modalidades aprobadas (autoadministrada/dirigida en admisión clínica limitada) y plantillas predefinidas con personalización limitada/versiones conservadas. No existe ese motor implementado ni editor avanzado aprobado para MVP; mínimos clínicos/contratos técnicos pendientes. [Inventario y permisos objetivo](patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo), [admisión](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo) y [dependencias acotadas](product/roadmap.md#consolidación-2a--dependencias-y-entregas-acotadas) coordinan #30/#31/#35/#39/#41. No es bloqueo general de D3/registro/2A ni activación de funciones; ADR-029/RN-59–61 se conservan íntegros. El resto de cortes de este informe mantiene sus fechas y SHA históricos.

SQL 001–007 y manifiesto están integrados y conservan sus hashes. El runner exige destino explícito, ledger, huellas y transacciones; inicializar/arrancar la aplicación o integrar un PR no instala automáticamente 003–007. Pruebas aisladas históricas no acreditan instalación por entorno, aprobación operativa, envío real ni despliegue. La matriz de compatibilidad y recuperación por entorno se sigue en #36, sin ejecutar operaciones aquí.

## Trazabilidad de GitHub consultada

La historia de `main` y los metadatos de PR confirman integrados #1–#15, #17–#20 y #24–#27. #16 es evidencia negativa cerrada sin merge; #21–#23 son Issues cerrados, no PRs. Referencias de integración pertinentes:

| Entrega | PR | Merge en `main` |
| --- | --- | --- |
| A | [#10](https://github.com/japh113/plataformaPsicologia/pull/10) | `0f2ebba3891c29683d8e63ba86f3a2ae6619b805` |
| B | [#11](https://github.com/japh113/plataformaPsicologia/pull/11) | `5e549f51bc7fa3e2535db023b4f9bca3d383a7c5` |
| C | [#12](https://github.com/japh113/plataformaPsicologia/pull/12) | `543442ea634e5977bc887ace1db5457eee2ebf8c` |
| D1 | [#17](https://github.com/japh113/plataformaPsicologia/pull/17) | `2fe0799ee683273df2dbed872840bbfd2ef03f6d` |
| D2 | [#18](https://github.com/japh113/plataformaPsicologia/pull/18) | `fcabf5245d889f700804ec6d1b9f48043fd30fc0` |
| Producto paralelos/pareja | [#19](https://github.com/japh113/plataformaPsicologia/pull/19) | `b842b73e317033684b47084859d01cfda5275743` |
| Consolidación clínica documental | [#24](https://github.com/japh113/plataformaPsicologia/pull/24) | `edc1bb00db97fd500b5ddc1ae479bce2e5c3fcf4` |
| Privacidad paciente | [#25](https://github.com/japh113/plataformaPsicologia/pull/25) | `611d69b26749885dd9da6dceb67574d2783a41ef` |
| Cumplimiento de objetivos | [#26](https://github.com/japh113/plataformaPsicologia/pull/26) | `af72a381f4b3a5a0e81df104baecb60226025a11` |
| Mi seguimiento | [#27](https://github.com/japh113/plataformaPsicologia/pull/27) | `a1720245083008399a3543ca4b794ec4d1289d5a` |

La lectura de [Protect main](https://github.com/japh113/plataformaPsicologia/rules/25440100) confirmó enforcement activo, sin bypass y los siete checks requeridos con política estricta: `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence`, `ci/required`. Esta consulta no modifica Rulesets ni acredita resultados del PR de #40. [Implementación CI](ci-implementation.md), [plan histórico](ci-plan.md) y [evidencia histórica](ci-validation.md).

## Riesgos residuales y backlog de seguimiento

Los catorce Issues #28–#41 estaban **abiertos** al corte. Su prioridad, dependencias y criterios completos viven en GitHub; la tabla conserva su clasificación y momento de atención sin aprobar trabajo nuevo.

| Issue | Naturaleza y pendiente | Momento o dependencia pertinente |
| --- | --- | --- |
| [#28](https://github.com/japh113/plataformaPsicologia/issues/28) | Decisión de criterios verificables de acreditación/aprobación | Antes de habilitar aprobaciones y D3; D2 privado ya integrado. |
| [#29](https://github.com/japh113/plataformaPsicologia/issues/29) | D3 aprobado como producto, no implementado: opt-in, lector público y elegibilidad | Consume #28; publicación no activa clínica. |
| [#30](https://github.com/japh113/plataformaPsicologia/issues/30) | Épico 2A: episodios paralelos, participantes y aislamiento | Diseñar y dividir; requiere insumos #31/#35/#39, no sus implementaciones completas. |
| [#31](https://github.com/japh113/plataformaPsicologia/issues/31) | Decisión de contrato bilateral de solicitudes/invitaciones/activación | Puede definirse junto al diseño #30, sin ciclo; activar requiere fundamentos implementados. |
| [#32](https://github.com/japh113/plataformaPsicologia/issues/32) | Riesgo de sobrescrituras entre clientes; investigar y acordar concurrencia | #27 protege una sesión; no prueba coordinación entre dispositivos. Hipótesis de primera entrevista concurrente sin demostrar; puede investigarse antes de terminar #30/#35. |
| [#33](https://github.com/japh113/plataformaPsicologia/issues/33) | Deuda de cobertura navegador de seguimiento/objetivos | Mantener CI existente; frontend ya ejecuta suite React montada. No presupone ausencia de pruebas. |
| [#34](https://github.com/japh113/plataformaPsicologia/issues/34) | Riesgo de atomicidad agenda/disponibilidad/espera | Investigar antes de piloto concurrente/nuevas rutas; sin reproducción nueva de doble reserva. No esperar a todo 2D. |
| [#35](https://github.com/japh113/plataformaPsicologia/issues/35) | RN-23 aprobado pendiente: finalización inmutable y adendas atribuidas | Diseñar en 2A con #30/#39; coordinar implementación con #32/#36. Historial actual no equivale a adendas. |
| [#36](https://github.com/japh113/plataformaPsicologia/issues/36) | Deuda operativa de compatibilidad/recuperación por entorno | Antes de upgrade persistente; no rehacer runner ni ejecutar schema/seed como upgrade. |
| [#37](https://github.com/japh113/plataformaPsicologia/issues/37) | Épico de gates de seguridad, datos, operación y revisión jurídica | Antes de exposición no local/datos persistentes/proveedores; privacidad de pareja como insumo temprano. Sin certificación ni despliegue aprobados. |
| [#38](https://github.com/japh113/plataformaPsicologia/issues/38) | Decisión de recuperación excepcional, duplicados y DOB posterior | Solo donde afecte el flujo; B/C no resuelven estos casos ni permiten fusiones inferidas. |
| [#39](https://github.com/japh113/plataformaPsicologia/issues/39) | Investigación/clasificación clínica de campos y destinatarios | Insumo temprano de #30/#35; sin nueva filtración confirmada ni cambios de visibilidad aprobados por esta tabla. |
| [#40](https://github.com/japh113/plataformaPsicologia/issues/40) | Deuda documental de estado y cortes históricos | Este PR documental; cierre sujeto a revisión e integración posteriores. |
| [#41](https://github.com/japh113/plataformaPsicologia/issues/41) | Discovery de entrevistas configurables con respuesta desde portal | Contrato antes de cerrar diseño de entrevistas 2A; editor tras fundamentos solo si demanda y contrato se aprueban. |

## Cortes históricos y uso de la evidencia

Los contratos, ADR/RN/AB y resultados previos conservan su contenido, hashes, fechas y contexto. Las frases de Draft, HEAD, Issue abierto, «este encargo» o trabajo pendiente en los documentos siguientes describen **su corte histórico**, incluso cuando una integración posterior cambió el estado. No son autorización vigente ni ejecución del PR de #40. Esta clasificación externa evita reescribir retroactivamente la evidencia.

| Fuente conservada | Cómo interpretar su corte y el estado posterior |
| --- | --- |
| [Auditoría A](documentation-audit.md), [archivo de abril](archive/notes-2026-04-13.md) | Inventarios/ideas del momento; no nuevo backlog ni autorización. A se integró por #10. |
| [Plan CI](ci-plan.md), [implementación](ci-implementation.md), [validación](ci-validation.md), [Node 24](ci-node24.md) | La ausencia de CI del corte #12 y tareas D1/D2 son antecedentes; implementación #14, aceptación #15, ensayo #16 sin merge y actualización #20 ya ocurrieron. Conservar cada ejecución por SHA. |
| [Integridad](clinical-data-integrity.md), [autenticación](authentication-security.md), [fundamentos](clinical-episodes-foundation.md), [validación 003](clinical-episodes-validation.md) | Contratos/resultados de #2/#3/#8 y notas posteriores. No certifican base desplegada, adendas ni autorización por episodio. |
| [Validación B](patient-identity-validation.md), [contrato C](contact-changes.md), [validación inicial](contact-change-validation.md), [revisión P2](contact-change-review-validation.md), [deadline final](contact-change-deadline-validation.md) | Cortes de #11/#12; errores y ejecuciones sustituidas se preservan junto al resultado posterior. D/CI futuros en esas narraciones no deshacen integraciones posteriores. |
| [Contrato D1](professional-persistence.md), [validación D1](professional-persistence-validation.md), [contrato D2](private-professional-management.md), [validación D2](private-professional-validation.md) | D1/006 y D2/007 ya integrados en #17/#18. Rama, Draft, «sin merge» y D2 pendiente corresponden a la entrega histórica; no reinstalar ni activar por leerlos. |
| [Paralelos/pareja](parallel-couple-episodes.md), [evidencia clínica](couple-clinical-evidence.md), [visión](product/vision.md), [decisiones](product/decisions.md), [reglas](product/business-rules.md) | #19/#24 documentales integrados; conservar acuerdos/evidencia. «Issue #22 pendiente» o «no se implementa aquí» describen #24: #26 ya corrigió cumplimiento individual. No implica implementación de pareja ni cambio de RN-72. |
| [Privacidad](patient-response-privacy.md), [objetivos](objective-completion-authorization.md), [seguimiento](patient-follow-up.md) | Los Draft y Issues #23/#22/#21 abiertos en sus narraciones son históricos. #25/#26/#27 ya integrados e Issues cerrados; cada revisión local/Actions conserva su SHA y límites. |

Las entradas operativas [README](../README.md), [AGENTS](../AGENTS.md), [CONTRIBUTING](../CONTRIBUTING.md), [índice](README.md), [desarrollo](development.md), [arquitectura](architecture.md), [guía B](patient-identity-verification.md), [plan](identity-directory-delivery-plan.md), [diseño 2A](stage2a-identity-directory-intake.md), [matriz legacy](stage2a-legacy-mutations.md) y encabezado/estado del [roadmap](product/roadmap.md) se actualizan para este corte. Los requisitos, etapas y decisiones de producto permanecen vigentes en sus fuentes canónicas.

## Contraste documental de #40

Inconsistencias verificadas sobre la base indicada: AGENTS encargaba D2 ya integrado; CONTRIBUTING encargaba D1 y mantenía D2 pendiente; la guía B decía que no había workflows; desarrollo y algunos índices mantenían Draft/HEAD de entregas anteriores como estado operativo. Plan/arquitectura/diseño/roadmap mezclaban el corte #18/#19 con integraciones posteriores. Se corrigen esas entradas y se enlaza el backlog sin cambiar el runtime.

Fuentes de contraste: historia Git y metadatos de rama/PR/Issues/Ruleset; [workflow](../.github/workflows/ci.yml); capacidades y política cerrada de aprobación en [professional.service.js](../backend/src/modules/professional/professional.service.js); permisos legacy en [auth.permissions.js](../backend/src/modules/auth/auth.permissions.js); proyecciones, objetivos y seguimiento en [patients.service.js](../backend/src/modules/patients/patients.service.js) y [rutas](../backend/src/modules/patients/patients.routes.js); columnas y validación fija de entrevista en [schema.sql](../backend/sql/schema.sql) y [validators](../backend/src/modules/patients/patients.intake.validators.js).

Antecedente de preparación del [PR #42](https://github.com/japh113/plataformaPsicologia/pull/42) para el Issue #40: su alcance exclusivamente documental exigió el [validador existente](../scripts/ci/docs.py) para Markdown/UTF-8/enlaces/fragmentos/IDs y decisiones protegidas, comparación de evidencia histórica/ADR/RN/AB y SQL/manifiesto contra la base, y `git diff --check`/alcance Markdown. No autorizó ejecutar manualmente suites clínicas, demos, SQL o Docker; reservó la revisión independiente y la autorización de merge para una decisión posterior. Los resultados se registran por HEAD en el PR, separados de la evidencia anterior y de la matriz automática de CI. Este antecedente no fija el alcance de futuros trabajos: cada encargo requiere autorización propia y consulta del estado real de GitHub.
