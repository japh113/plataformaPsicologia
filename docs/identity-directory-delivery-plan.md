# Identidad y directorio — plan de entregas A/B/C/D

Estado al 29 de octubre de 2026: `main` `a1720245083008399a3543ca4b794ec4d1289d5a` (merge #27). A/B/C/D1/D2 y #25–#27 integrados. D2 se integró por [#18](https://github.com/japh113/plataformaPsicologia/pull/18), merge `fcabf5245d889f700804ec6d1b9f48043fd30fc0`, corte histórico distinto de la base de esta revisión. [Estado operativo y backlog](operational-status.md). Integración y CI no acreditan instalación de 007 ni despliegue habitual. [Contrato D2](private-professional-management.md) y [evidencia D2](private-professional-validation.md) conservan su contexto histórico. D3, nuevas vinculaciones y autorización/activación por episodio siguen pendientes.

| Entrega | Integración comprobada | Estado |
| --- | --- | --- |
| A | #10, `0f2ebba3891c29683d8e63ba86f3a2ae6619b805` | Documentación integrada |
| B | #11, `5e549f51bc7fa3e2535db023b4f9bca3d383a7c5` | Identidad/verificación y 004 integradas; [guía](patient-identity-verification.md), [evidencia histórica](patient-identity-validation.md) |
| C | #12, `543442ea634e5977bc887ace1db5457eee2ebf8c` | Contactos y 005 integrados; HEAD revisado `c7f622608af4b7bc27a7c4e9dde49be23221b0ae` |
| D1 | #17, `2fe0799ee683273df2dbed872840bbfd2ef03f6d` | Persistencia privada y 006 integradas; [contrato](professional-persistence.md), [evidencia histórica](professional-persistence-validation.md) |
| D2 | #18, `fcabf5245d889f700804ec6d1b9f48043fd30fc0` | Gestión profesional privada y 007 integradas en Git; sin instalación, activación ni despliegue habitual acreditados |
| D3 | Sin integración | Directorio público, preferencias optativas y lectores anónimos pendientes; su implementación requiere alcance y autorización propios |

GitHub Actions ya está [implementado](ci-implementation.md): el [workflow vigente](../.github/workflows/ci.yml) ejecuta también para PR documentales los siete checks `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence` y `ci/required`, con artifacts técnicos de 14 días. La [protección Protect main](https://github.com/japh113/plataformaPsicologia/rules/25440100) está activa, exige los siete checks con política estricta y no tiene bypass. El [plan CI](ci-plan.md) y las [evidencias anteriores](ci-validation.md) conservan su trazabilidad y corte histórico; no sustituyen este estado actual ni la ejecución propia de cada nuevo HEAD. Esta corrección no modifica CI ni configuración GitHub.

La [ejecución posterior al merge de D2 39517506435](https://github.com/japh113/plataformaPsicologia/actions/runs/39517506435), intento 1, evento `push` sobre `main` y SHA `fcabf5245d889f700804ec6d1b9f48043fd30fc0`, terminó con los siete checks en `success`. Es evidencia del merge D2, no de este nuevo HEAD documental ni de un despliegue. Cada HEAD posterior requiere su propia ejecución.

Las letras de PR no son las subetapas del producto: **PR B no equivale a etapa 2B**. B/C/D entregan partes de 2A sin completarla. Fuente de requisitos: [ADR-023–028](product/decisions.md) y [RN-41–58](product/business-rules.md); [diseño técnico](stage2a-identity-directory-intake.md) y [matriz legacy](stage2a-legacy-mutations.md) conservan propuestas pendientes.

[ADR-030](product/decisions.md#adr-030--episodios-paralelos-pareja-y-derivación-por-tratamiento) y RN-62–68 formalizan tratamientos paralelos individuales y de pareja como **producto aprobado, todavía no implementado**. La [decisión y su trazabilidad](parallel-couple-episodes.md) distinguen vinculación independiente y derivación de un tratamiento; no amplían las capacidades entregadas por D1/D2. Fundamentos de participantes, permisos, entrevista previa y transición segura PostgreSQL/legacy corresponden a futuras entregas 2A; derivaciones delimitadas y flujos conjuntos, a 2B según el [roadmap](product/roadmap.md). D3 y nuevas vinculaciones no se habilitan por documentarlo; ADR-029/RN-59–61, AB-23 y los pendientes AB-28–37 permanecen intactos.

## Entregas y criterios de revisión

La tabla conserva el alcance y los criterios acordados de A/B/C y de D completo. La integración real de D se desglosa arriba y en D1/D2/D3; no implica que el directorio ni todos los recorridos públicos de D estén entregados. Las evidencias de cada implementación conservan su SHA y contexto histórico, sin atribuirse al nuevo HEAD documental.

| PR | Funcionalidad/documentos | Pruebas y demo | Dependencias |
| --- | --- | --- | --- |
| A | Decisiones recientes; README como entrada; AGENTS operativo; arquitectura en docs; notas históricas archivadas; auditoría legacy, inventario y plan. Solo Markdown. Commits separados de producto/diseño y limpieza documental. | Contraste con código/rutas/scripts, IDs estables, enlaces/fragmentos, diff sin código/SQL. No requiere demo nueva ni ejecutar integración. Evidencia en [auditoría documental](documentation-audit.md). | #9; sin despliegue. |
| B | Registro adulto con DOB global; básicos bajo control del paciente; email/SMS con valores aprobados; estados servidor, cuotas compartidas, adaptadores/simuladores; UI mínima. Actualizar diseño, guía de identidad/seguridad, roadmap y evidencia real. | Fechas/bordes de edad; alta sin episodio/vínculo/acceso; titularidad; desafíos válidos/caducados/reutilizados/sustituidos, intentos y ventanas; carreras PostgreSQL multiusuario/multicuenta; cada entrada legacy aprobada; regresiones JWT/backoffice/clínicas, unitarias, integración, lint/build. Demo de adulto sin responsable que verifica ambos canales sin envíos reales y sin acceso profesional. | A integrado y B autorizado. AB-23 cerrado; DOB posterior pendiente y email previo a SMS aprobados. Runner ampliado conservando #8; abuso de producción pendiente. |
| C | Reautenticación, cambio de email/teléfono, aviso anterior, verificación y confirmación consistente, revocación global de sesiones. UI propia; actualizar seguridad, contratos y evidencia. | Contraseña incorrecta/reautenticación vencida; destino ocupado; cambio reemplazado/caducado/ajeno; carreras entre inicio, reenvío y confirmación; fallos de entrega; sesiones múltiples revocadas incluida actual; regresión login/reset; ninguna alteración clínica. Unitarias/integración/lint/build. Demo con dos sesiones y cambios simulados. | B y autorización de C; AB-25. |
| D | Perfil profesional, versiones pendientes/aprobadas, revisión selectiva y razones de rechazo; directorio anónimo limitado; flags independientes; suspensión/rehabilitación sin republicación. UI perfil/directorio/backoffice; actualizar diseño, arquitectura, roadmap y evidencia. | Privado inicial y datos existentes sin opt-in; público sin admisión; pendientes invisibles a terceros/support; aprobación/rechazo; acceso ajeno/mass assignment; suspensión concurrente con lectura/publicación, rehabilitación con reconfirmación; DTO público exacto; regresión JWT/roles/clínica, unitarias/integración/lint/build. Demo con visitante, titular, revisor y perfiles público/privado/pendiente/suspendido. | Orden acordado A→B→C→D y autorización de D. D reutiliza protocolo de migración de B; no depende funcionalmente del cambio de contacto C. AB-18/24/27. |

Cada PR funcional actualiza su documentación de estado; A no obliga a mantener afirmaciones futuras como si ya se hubieran implementado. ADR-019 exige estado inicial, cuentas ficticias, pasos visuales y resultados esperados para lo realmente entregado, sin simular solicitudes o episodios todavía inexistentes.

## Límites intermedios que requieren atención

- C ya incorpora cambio seguro de contactos por flujo específico, con contraseña reciente, verificación, confirmación y revocación global de sesiones. Nombre editable; DOB global capturada solo al registro adulto. Alta/corrección posterior de DOB pendiente, incluidas cuentas históricas; sin inferencias. No escribir contactos por ruta genérica.
- El cierre de las cinco entradas legacy fue **aprobado expresamente e implementado en B** para TODAS las cuentas; pendientes antiguos se conservan sin respuesta. La [matriz](stage2a-legacy-mutations.md) explica rutas, alternativas e indisponibilidad temporal, incluidos pendientes emitidos antes del cambio.
- Verificar email/teléfono no activa vínculos; un paciente ya verificado tampoco puede eludir la barrera legacy. No retirar el fallback lector ni habilitar atribución/permisos por episodio parcialmente.
- D no expone solicitudes de atención: “acepta nuevos pacientes” es configuración e información pública para un flujo posterior. Invitaciones directas futuras no dependen de ese flag.
- Solicitudes/invitaciones nuevas, confirmación bilateral/activación de episodios, derivaciones, antecedentes/consentimientos, reseñas, pagos/agenda pública, menores y recuperación excepcional siguen fuera de estas implementaciones.

## División interna aprobada de D

La columna «Permanece deshabilitado» conserva el límite al concluir cada subentrega; no revierte capacidades integradas en subentregas posteriores.

| Subentrega | Alcance y aceptación | Permanece deshabilitado |
| --- | --- | --- |
| D1 | 006, persistencia privada, runner y pruebas de integridad/compatibilidad en PostgreSQL nuevo | API D, sesiones nuevas, archivos reales, publicación y clínica nueva |
| D2 | Estado restringido, gestión privada, revisión y fotos, con autorización propia | Directorio y entrega anónima |
| D3 | Directorio, preferencias optativas y retiro completo; Chromium B+C+D reales | Solicitudes/invitaciones y episodios |

D1 está integrado en #17 y D2 en #18, con 007 sucesora y evidencia de pruebas aisladas. El encargo histórico de D2 exigió rama nueva y PR Draft sin merge por el agente; su integración posterior en `main` no autoriza instalación, activación o despliegue habitual ni D3. El esquema conserva compatibilidad con la aplicación anterior; los SQL 001–007 y sus entradas/hashes históricos permanecen intactos en esta corrección.

## Migraciones y compatibilidad — 004–007 integradas en Git

| Migración integrada | Alcance y límite | Entrega |
| --- | --- | --- |
| 004_patient_identity_verification.sql | DOB global nullable, evidencia/desafíos, cuotas y revocación de evidencia ante cambio de contacto; probada solo aisladamente | B |
| 005_secure_contact_changes.sql | Solicitudes privadas, propósito C, autorización por sesión, eventos mínimos y avisos durables; implementada y ensayada solo aisladamente | C |
| 006 | Persistencia profesional privada, versiones y revisiones; integrada en #17 | D1 |
| [007_private_professional_management.sql](../backend/sql/migrations/007_private_professional_management.sql) | Revocación restringida, retiro de preferencias, comunicaciones de cuenta y reserva fotográfica; integrada en Git, sin instalación en PostgreSQL habitual acreditada | D2, #18 integrado |

004/005/006/007 están integradas en Git. El [runner vigente](../backend/scripts/episode-migration.js) y el [manifiesto](../backend/sql/migrations/manifest.json) reconocen 001–007 y targets explícitos 003/004/005/006/007, con verificación de huella previa/nueva, checksums, ledger y rollback transaccional. No instalan 007 automáticamente por arrancar la aplicación o integrar un PR. La instalación en PostgreSQL habitual no está acreditada ni autorizada por esta corrección. Ensayos D1/D2 y límites en sus contratos/evidencias; resultados anteriores de B/C y del merge D2 conservan su identidad histórica.

Validar cada sucesora en PostgreSQL nuevo y aislado: instalación vacía; actualización con fixtures sintéticos legacy (incluidos datos ausentes); ejecución repetida; fallo transaccional; checksum alterado, versión desconocida y deriva rechazados; compatibilidad del diagnóstico/runner y regresión 001–003. Mantener vacíos los datos desconocidos; no convertir DOB de entrevista, edad, coincidencias, aprobación previa o relaciones en nueva evidencia.

No ejecutar schema/seed o migraciones sobre bases existentes ni la habitual. No modificar contenedores, imágenes o volúmenes habituales. Ensayos futuros solo en recursos nuevos propios, sin instalar herramientas en host ni iniciar/reconstruir el Compose habitual. B reutiliza el sandbox de #8 con destinos UUID nuevos y guardas de imágenes/limpieza conservadas; A fue exclusivamente documental.

## Revisión y reversión

Documentación puede revertirse independientemente. Separar B de C limita el impacto de cambios de autenticación; email y SMS permanecen juntos por compartir desafíos/cuotas/abuso. La división D1/D2/D3 sustituye la recomendación anterior de un único PR D: D1/D2 no publican; D3 expone solo después de proteger credenciales.

La estrategia técnica recomendada es revertir aplicación/funcionalidad conservando estructuras y evidencia, mediante corrección aditiva cuando proceda; no borrar datos ni bajar `session_version`. Revertir C no debe hacer válidos JWT revocados, y volver a una aplicación antigua no debe restablecer bypass legacy. Compatibilidad entre versiones, fallos de entrega, bloqueos DDL y recuperación se ensayan antes de cada implementación/despliegue. Ningún ensayo autoriza despliegue en la base habitual.

Las futuras entregas se proponen mediante PR hacia `main`, sin merge ni auto-merge por el agente salvo autorización expresa posterior. El encargo histórico #19 se entregó como Draft sin merge por el agente y fue integrado después; #24 también fue documental. Antecedente de preparación del PR #42 para el Issue #40: su alcance fue exclusivamente documental y reservó la revisión y autorización de merge para una decisión posterior; esas restricciones no definen el alcance de otros encargos. Los asuntos abiertos se resuelven por alcance, no por integrar una propuesta documental.
