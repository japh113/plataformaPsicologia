# Roadmap de producto y arquitectura

Corte documental: 19 de octubre de 2026, main `543442ea634e5977bc887ace1db5457eee2ebf8c` tras #12. A/B/C integrados; D no iniciado ni autorizado. [Contactos seguros](../contact-changes.md), [evidencia histórica final C](../contact-change-deadline-validation.md). 004/005 integradas sin despliegue habitual acreditado. Recuperación excepcional, nuevas vinculaciones y activación/permisos por episodio siguen pendientes; ADR-029/RN-59–61 intactas.

Requisitos de producto acordados y mecanismos pendientes se distinguen en [decisions.md](decisions.md). Integración, pruebas aisladas, CI y despliegue son estados distintos. [Plan de CI](../ci-plan.md): propuesta documental con aceptación verificable, sin workflows implementados ni protección administrativa aplicada por este encargo.

## Antecedentes y alcance documental actual

#5 fijó la base de producto; #7 restringió backoffice; #8 integró fundamentos 003 con pruebas/demo aisladas, sin activar permisos por episodio. #9 integró diseño propuesto de identidad/directorio/vinculación. Sus evidencias y autorizaciones históricas no autorizan operaciones nuevas.

Las decisiones ADR-023–028 y RN-41–58 se entregan A→B→C→D. A se integró en #10, B en #11 y C en #12. B incorporó registro adulto/identidad/verificación y barrera AB-23; C, contactos seguros. [Guía B](../patient-identity-verification.md) y [validación histórica B](../patient-identity-validation.md). D espera autorización independiente.

## Entregas A/B/C integradas — D no iniciado

El [plan canónico de entregas](../identity-directory-delivery-plan.md) contiene funcionalidades, dependencias, pruebas, demos y límites intermedios. Las letras no equivalen a etapas: PR B y PR C son partes de 2A, no las etapas 2B/2C.

| Entrega | Alcance | Estado |
| --- | --- | --- |
| A | Decisiones, documentación técnica, reorganización y auditoría de mutaciones legacy | Integrado en #10, 0f2ebba |
| B | Registro adulto/DOB global, básicos, verificación email/SMS y simuladores | Integrado en #11, 5e549f5; 004 y demo validadas aisladamente |
| C | Reautenticación, cambios de contacto y revocación total de sesiones | Integrado en #12, 543442e; 005 y regresiones finales validadas aisladamente |
| D | Perfil, revisión/versiones de credenciales y directorio anónimo, suspensión/rehabilitación | No iniciado ni autorizado; después de C según orden acordado; depende técnicamente del protocolo de B |

004/005 creadas e integradas, validadas aisladamente; 006 estimada. La barrera legacy rige para cuentas nuevas y existentes; [matriz y pérdidas temporales aprobadas AB-23](../stage2a-legacy-mutations.md) implementadas en B. D no incorpora solicitudes públicas funcionales. El registro de menores, invitaciones/solicitudes nuevas, episodios/permisos, derivaciones y recuperación excepcional no se habilitan en B/C/D.

## Estado de partida y evidencia

| Etapa | Estado al corte | Evidencia y límite |
| --- | --- | --- |
| 0. Docker de desarrollo | Completada para su alcance | PR [#1](https://github.com/japh113/plataformaPsicologia/pull/1), merge `9dbc305`; [README.md](../../README.md), [compose.yaml](../../compose.yaml) y [docker/postgres/init.sh](../../docker/postgres/init.sh). No es despliegue de producción. |
| 1. Integridad, autenticación y dependencias de producción | Completada para su alcance | PR [#2](https://github.com/japh113/plataformaPsicologia/pull/2), merge `6a23ac8`; [#3](https://github.com/japh113/plataformaPsicologia/pull/3), merge `0e8b13f`; [#4](https://github.com/japh113/plataformaPsicologia/pull/4), merge `3a1f0d7`. No certifica el estado de una base desplegada ni elimina deuda de desarrollo/hardening. |
| Documentación de producto | #5 y #9 integrados; PR A documenta decisiones posteriores y reorganiza | PR [#5](https://github.com/japh113/plataformaPsicologia/pull/5), merge `7380e80`; no implementó etapas 2. |
| 2A–2E | 2A parcial con A/B/C integrados; D y 2B–2E pendientes | #7 integra backoffice y #8 fundamentos 003 con evidencia aislada, sin despliegue ni permisos por episodio. B añade identidad/verificación simulada; C, contactos seguros. Directorio, nuevas vinculaciones y segmentación siguen pendientes. |
| 3. Pruebas y confiabilidad | Pendiente como ampliación; CI técnica en revisión | Ya hay unitarias e integración; cada etapa 2 trae sus pruebas. [CI propuesta y aceptación](../ci-plan.md) permite automatizar regresiones antes de completar 2A, sin iniciar D ni certificar producción. |
| 4. Experiencia y refactor gradual | Pendiente | La UI funcional mínima de 2B y 2C se entrega en esas etapas. |
| 5. Preparación para producción | Pendiente | Incluye revisión legal, privacidad, restauración, monitoreo y despliegue. |
| 6. Red estatal/nacional | Visión futura | Reseñas, reputación, filtros avanzados, descubrimiento y funciones de red; directorio básico de vinculación pasa a 2A. |

La corrección de dependencias de producción es el estado de alcance acordado tras #4, no una auditoría nueva ejecutada por esta tarea. `npm audit` de desarrollo sigue con riesgos por investigar; no fijar conteos como si fueran permanentes. Los conteos de vulnerabilidades al final de [authentication-security.md](../authentication-security.md) pertenecen a la evidencia anterior a #4. Tampoco se repiten aquí sus resultados de pruebas como si se hubieran ejecutado hoy.

## Brechas confirmadas contra el repositorio

| Hallazgo y ruta existente | Implicación para el plan |
| --- | --- |
| [schema.sql](../../backend/sql/schema.sql): unicidad legacy por par; [003](../../backend/sql/migrations/003_clinical_episode_foundation.sql): índice por paciente active/paused | 003 garantiza exclusividad de episodios donde esté instalada; la aplicación aún usa vínculos legacy. No deducir que ya controla su autorización ni eliminar duplicados. |
| [auth.permissions.js](../../backend/src/modules/auth/auth.permissions.js): `buildPatientAccessScope` admite relación activa **o** `psychologist_patient_access` | El vínculo heredado puede seguir concediendo acceso sin responsable activo. 2A debe cubrir todas las rutas, no solo el expediente. |
| [patients.service.js](../../backend/src/modules/patients/patients.service.js): `createPatient` deniega ahora el alta unilateral; [auth.service.js](../../backend/src/modules/auth/auth.service.js) deniega request/invite/respond/accept-code antes de DB | AB-23 implementado sin sincronizar, revocar o convertir relaciones anteriores. El flujo bilateral sigue pendiente. |
| #8 añade `episode_id` opcional a citas, notas, tareas/objetivos y espera; escritores actuales siguen usando NULL | Falta activación coordinada de atribución y permisos. Una relación nueva puede exponer operación previa si solo se filtra por paciente. |
| `patient_clinical_notes.created_by_user_id` es nullable; [patients.service.js](../../backend/src/modules/patients/patients.service.js) lee/edita notas por paciente y nota | Autor informado al crear no equivale a autorización por autor. Se necesita segmentación y tratamiento de autoría legacy desconocida. |
| `patientSelectColumns` reúne entrevista, riesgo, contexto, tareas y objetivos; notas se agregan por paciente | El aislamiento debe incluir datos globales, metadatos y derivados, no solo la colección de notas. |
| [appointments.service.js](../../backend/src/modules/appointments/appointments.service.js), [availability.service.js](../../backend/src/modules/availability/availability.service.js) y [reminders.service.js](../../backend/src/modules/reminders/reminders.service.js) consultan acceso heredado | Una corrección limitada a `patients` deja rutas laterales de acceso o comportamiento inconsistente. |
| Zona fija en servicios de pacientes/citas y en [001_clinical_data_integrity.sql](../../backend/sql/migrations/001_clinical_data_integrity.sql) | 2E debe coordinar validaciones de aplicación y base sin reescribir la migración histórica 001. |
| El PR #7 eliminó el permiso global de `superadmin` en [auth.permissions.js](../../backend/src/modules/auth/auth.permissions.js) y protege respuestas operativas/auditoría; la edición clínica previa aún permite actualizar notas | RN-27 cubierto para roles administrativos sin habilitar emergencia. RN-23 (inmutabilidad/adendas) y permisos por episodio siguen pendientes. |

**Demo y datos reales:** el usuario confirmó que los datos presentes de la demo local son de prueba y desechables (RN-28/ADR-018). No construir conciliación manual exclusivamente para salvarlos. No se consultó ninguna base en esta tarea ni se preservan conteos de demo como requisitos. Esta condición no permite borrar bases reales ni reinicializar demo sin autorización separada; no tocar volúmenes existentes. La futura estrategia para datos reales sí necesita diagnóstico autorizado de solo lectura, preservación, tratamiento de legacy, ensayo y rollout seguro (ADR-009, AB-06/17).

## Requisito transversal aprobado — Escenarios demo en 2A–2E

**Estado: APROBADO por el usuario; ADR-019 en [decisions.md](decisions.md).** Cada subetapa 2A–2E debe entregar datos demo **ficticios y reproducibles** conforme implemente sus funcionalidades. Es un criterio de aceptación de cada subetapa, sin esperar a la etapa 3 ni exigir que una demo anticipe funcionalidades todavía no implementadas.

Los escenarios deben permitir iniciar sesión como distintos psicólogos y pacientes, con cuentas demo y pasos de acceso documentados, para comprobar visualmente permisos, denegaciones y flujos desde cada perspectiva. Cada entrega debe indicar el estado inicial reproducible, los pasos y el resultado esperado para las funcionalidades que incorpora.

| Subetapa | Cobertura demo conforme se implemente su alcance |
| --- | --- |
| 2A (objetivo completo; PR B/C/D solo su porción) | Registro independiente, verificación, perfil privado/público y admisión independiente, consulta anónima, solicitud con confirmación final, invitación previa a cuenta, cancelación/caducidad y denegaciones sin acceso prematuro; separación de datos globales/clínicos, episodios y permisos entre distintos psicólogos y pacientes, incluido archivo propio y límites de acceso disponibles. |
| 2B | Derivación con resumen revisable, cambio directo, citas y avisos del cambio, pausa/reanudación/cierre y suspensión según los flujos entregados. |
| 2C | Antecedentes adicionales opcionales, autorización limitada, negativa, revocación y nueva autorización de adendas posteriores, sin herencia de permisos. |
| 2D | Agenda, conflictos de reserva y su resolución visible desde cuentas distintas; las garantías de concurrencia también se prueban automáticamente. |
| 2E | Visualización coherente de citas, fechas y día local entre cuentas con las zonas definidas por el diseño aprobado. |

Los datos y cuentas demo son **exclusivamente de desarrollo**, en un entorno aislado de datos reales; nunca se habilitan ni cargan automáticamente en producción. Cada implementación debe acompañarse de un procedimiento explícito y seguro para generar o restablecer esos escenarios: identificar y verificar entorno de desarrollo y destino aislado; generar en un destino nuevo; para restablecer, reproducir la demo en otro destino aislado nuevo, sin sobrescribir bases ni volúmenes existentes; detenerse ante un destino existente o un entorno que no sea de desarrollo; y documentar cómo acceder a las cuentas y verificar el estado inicial. El mecanismo y los comandos concretos se especificarán con la implementación, sin darlos por existentes o aprobados aquí.

**Las pruebas automatizadas de cada subetapa siguen siendo obligatorias.** Los escenarios demo complementan la comprobación visual y no sustituyen pruebas de permisos, integridad, concurrencia ni las demás verificaciones aplicables. Este requisito futuro no autoriza generar datos, restablecer la demo actual ni ejecutar código, SQL, schema, seeds o migraciones en este PR documental; se conserva el límite de RN-28/ADR-018.

## Etapa 0 — Infraestructura Docker

**Estado:** completada para desarrollo. **Dependencias:** ninguna etapa posterior. **Entregables existentes:** Compose, imágenes de desarrollo, inicialización de base nueva y guía en README.

**Criterios de cierre del alcance:** arranque local reproducible, salud de API/base, persistencia al reiniciar y separación de inicialización nueva frente a volúmenes existentes. Son capacidades documentadas por #1; no se levantaron contenedores para este PR documental. Los respaldos restaurables y despliegue de producción quedan pendientes en 5.

## Etapa 1 — Integridad clínica, autenticación y dependencias

**Estado:** completada para el alcance integrado de #2–#4. **Dependencia:** 0. **Entregables existentes:** [clinical-data-integrity.md](../clinical-data-integrity.md), [authentication-security.md](../authentication-security.md), migraciones [001](../../backend/sql/migrations/001_clinical_data_integrity.sql) y [002](../../backend/sql/migrations/002_auth_session_version.sql), pruebas en [backend/test](../../backend/test), manifests y lockfiles actualizados por #4.

**Criterios que deben preservarse:** bloqueo de borrado destructivo, conservación de versiones y citas, restricciones nota/cita, verificación de estado vigente del usuario y revocación persistente de JWT tras cambios de cuenta o contraseña. La migración 001 protege histórico; 002 versiona/revoca sesiones. No alterarlas ni usar schema/seed para actualizar expedientes existentes.

**Pendientes explícitos:** riesgos del audit de desarrollo, hardening (entre otros, intentos de login, almacenamiento de JWT, CORS, TLS y recuperación remota segura), mínimo privilegio y copias/restauración. No declarar preparación para producción por haber cerrado esta etapa.

## Etapa 2A — Identidad, directorio básico, vinculación inicial, episodios y permisos

**Estado:** parcial: #7 backoffice, #8 fundamentos 003 y A/B/C integrados, sin despliegue habitual acreditado ni autorización por episodio. B entrega identidad/registro/verificación simulada; C, contactos seguros. D no iniciado ni autorizado. **Dependencia:** 1 y cierre de propuestas aplicables ADR-006–ADR-009/AB-02/06/08/13–AB-27, según entrega. **Requisitos aprobados:** RN-01–RN-03/10/15–RN-17/21–RN-61; ADR-002/005/012–ADR-029 según alcance. **Entregables pendientes:** perfil público/directorio, solicitud e invitación inicial separadas de activación, validación profesional de entrevista antes de activar (precondición backend/DB), permisos por episodio/archivo, segmentación de datos clínicos y rollout seguro. No reinterpretar relaciones legacy activas como episodios.

**Criterios de aceptación:**

- Un paciente no puede acabar con dos responsables vigentes: activos y pausados cuentan. Reanudar pausa conserva episodio; retorno tras finalización/A→B→A crea otro sin sobrescribir identidad/autoría.
- Identidad global única sin exposición por búsqueda entre consultorios ni unión automática de coincidencias. Cuentas obligatorias, verificación progresiva y primer vínculo bilateral; paciente administra básicos, psicólogo solo pide corrección. AB-13 tiene decisión de producto aprobada; especificar sus métodos técnicos excepcionales pendientes antes de implementar duplicados/recuperación.
- Lectura/escritura segmentadas por episodio, autor y autorización. Archivo clínico completo de episodios propios, sin gestión actual ni episodios ajenos; adendas solo a notas propias aun cerradas. Borradores editables, finalizadas inmutables y nuevas adendas sin acceso heredado del receptor.
- Entrevista/riesgo/tareas/objetivos por episodio; riesgo inicial NO EVALUADO, evaluación/entrevista propias aun con antecedente. Paciente ve sus actividades históricas; notas sin visibilidad automática y ARCO separado.
- `superadmin`, `admin` y `support` sin acceso clínico global ordinario ni exportación/alteración clínica; sin excepción de emergencia implícita.
- Se cubren alta de paciente, vínculos administrativos e invitaciones, expediente, entrevista, tareas, objetivos, riesgo, agenda, recurrencias, disponibilidad, espera y recordatorios. Ninguna ruta antigua debe saltarse las reglas ordinarias.
- Nuevos registros clínicos/operativos tienen atribución inequívoca según diseño aprobado. Legacy real ambiguo sin asignación inventada, con procedimiento mínimo autorizado/auditado compatible con RN-27 por definir; no construir conciliación manual solo para demo.
- 003 integrada es aditiva e idempotente: inconsistencias de claves bloquean instalación; vínculos múltiples/autoría ausente se diagnostican sin borrar ni elegir responsable. No modifica 001 ni 002 ni ejecuta schema/seed.
- El ensayo posterior usa una copia aislada y autorizada, comprueba conservación de datos y reaplicación, y define coordinación de todas las versiones/escritores durante el despliegue y recuperación sin perder historia.

**Aceptación adicional de directorio/vinculación (ADR-020–ADR-022):** registro sin episodio; perfiles privados por defecto, públicos solo por elección del aprobado; publicar y recibir solicitudes independientes; consulta anónima mínima sin datos de pacientes; solicitudes autenticadas/verificadas con mensaje opcional privado y confirmación final; una pendiente iniciada por paciente en ambas esperas; cancelación/caducidad y protección de abuso; invitación profesional incluso sin cuenta previa, sin política de simultaneidad inventada. Ningún pendiente habilita expediente ni rutas legacy. PostgreSQL arbitra confirmaciones concurrentes, sin exponer otro consultorio ni sustituir cambio 2B. Plazos, estados y límites técnicos necesitan aprobación.

**Secuencia A/B/C/D aprobada; A/B/C integrados y D no iniciado:** [plan de entregas](../identity-directory-delivery-plan.md). B verifica identidad; C protege cambios de contacto; D publicará perfiles con revisión de credenciales, con autorización propia. Solicitudes/invitaciones y activación por episodio requieren entregas posteriores. AB-23 aprobó expresamente la indisponibilidad temporal legacy; no autoriza otras pérdidas funcionales.

ADR-006/009 sustituyen la propuesta de `care_relationships` como episodios: fundamentos en tabla independiente `clinical_episodes`, índice active/paused por paciente y referencias `episode_id` aprobados para 003. La activación de autorización y retirada del fallback heredado siguen pendientes.

**Reparto transversal:** 2A planifica estructura/permisos para notas/adendas, resumen versionado, cambios, pausa/cierre, suspensión y cancelación de citas. 2B entrega sus flujos mínimos; 2C consentimiento de antecedentes adicionales/adendas y revocación; 2D profundiza concurrencia de agenda. Dividir implementación en PR acotados con dependencias explícitas; no concentrar todo en 2A ni posponer sus fundamentos hasta 2C. Un índice limitado solo a activos no cumpliría exclusividad con pausados.

**Primer PR de 2A, integrado como #7 — RN-27 / ADR-017:** denegación clínica de `superadmin`, `admin` y `support` en rutas y servicios; proyecciones operativas de vínculos/cuentas; auditoría administrativa limitada a eventos de cuentas y metadatos permitidos, sin exponer eventos clínicos por filtros o límites. Se conservan registros históricos, consulta operativa, gestión de cuentas y aprobación/suspensión de psicólogos. La creación y cualquier cambio de estado de vínculos administrativos quedan temporalmente bloqueados hasta un mecanismo seguro de autorización bilateral; no pueden sincronizar acceso heredado ni alterar responsabilidad clínica. Las pruebas cubren denegaciones, proyecciones, pacientes/psicólogos y regresión JWT en PostgreSQL aislado. #7 no cerró 2A ni implementó AB-02/13.

**Dependencias pendientes tras los fundamentos:** segmentar por episodio, quitar el fallback heredado de psicólogos y resolver atribución histórica necesita el diseño y la autorización posteriores de ADR-006/009/AB-14/17. 003 ya se creó y ensayó en destinos desechables en #8; no se despliega en la base habitual, no se cambian 001/002 ni se usa schema/seed sobre bases pobladas. La revisión de identidad excepcional y el nuevo flujo de entrevista siguen sin implementarse. ADR-029/RN-59–61 exigen entrevista completada y validada expresamente por el profesional responsable antes de activar todo episodio nuevo, con garantía futura en backend y DB. Vinculación y activación son distintas; una relación legacy activa no prueba episodio. La identidad personal no depende de entrevista. B solo retira el bloqueo global de UI; no implementa la precondición ni añade migraciones.

## Etapa 2B — Derivación con resumen, cambio directo y pausas/cierre

**Estado:** pendiente. **Dependencia:** 2A y contratos aplicables de AB-08/09/13/15/16. **Referencias:** RN-04–RN-06/18–RN-22/26, ADR-002/003/014/015. **Entregables previstos:** dos vías de cambio con UI mínima, resumen revisable/aprobado por versión exacta, solicitud única/cancelable, cancelación confirmada de futuras citas, notificaciones y pausa/reanudación/finalización; flujo de suspensión y resolución de citas según diseño aprobado. Cada entrega trae pruebas de permisos/concurrencia; no depende de 2C para poder negar antecedentes adicionales.

**Criterios de aceptación:**

- Profesional: A inicia, paciente acepta cambio y versión exacta del resumen obligatorio, B acepta. Paciente puede rechazar contenido con motivos y pedir revisiones; preservar versiones, sin forzar falsedad clínica. Solo resumen aprobado se comunica a B y sin él no completar esta vía. B ve remitente/datos mínimos, no notas antes de permiso pertinente.
- Directo: paciente verificado solicita y B acepta; A no consiente ni bloquea ni aporta resumen obligatorio. B solo recibe básicos proporcionados por paciente, sin historial automático ni divulgación innecesaria de identidad de A. Al completar se avisa a A sin nuevo contenido clínico.
- Solo una solicitud pendiente por paciente, cancelable; antes del cambio atómico A sigue responsable. Error/concurrencia no deja dos vigentes ni cambio parcial. La mecánica transaccional sigue propuesta ADR-008.
- Negar antecedentes adicionales no impide derivación con resumen aprobado; ese resumen no habilita notas/entrevista/riesgo/contexto/tareas/objetivos del origen.
- Mostrar futuras citas con A y exigir confirmación del paciente para cancelarlas consistentemente con el cambio, preservando histórico y sin reprogramar con B. Resolver espera/recurrencias según contrato; no reatribuir inciertas.
- Cualquiera inicia pausa/finaliza con confirmación/motivo apropiado y aviso al otro, resolviendo antes futuras citas sin borrado. Pausa sin citas nuevas y reanudación con ambos. Cierre conserva pendientes como no completados por cierre y puede dejar sin responsable.
- Suspensión: JWT inválido y sin nuevas citas; futuras pendientes de resolución, avisar sin motivo privado y sin cancelación automática. Sin cierre automático; cambio directo disponible. Rehabilitar sin restaurar vínculos cambiados/citas canceladas.
- Rutas de vinculación antiguas respetan flujo o se restringen; cerrar estados API, rechazo/cancelación/vencimiento y errores sin reabrir lo ya aprobado.

El bloqueo por paciente y la revalidación dentro de la misma transacción, coordinados con todas las escrituras clínicas, son el mecanismo propuesto; deben especificarse antes de codificar. No relegar la UI mínima de esta etapa a 4.

## Etapa 2C — Antecedentes adicionales opcionales, consentimiento y revocación

**Estado:** pendiente. **Dependencia:** 2A/2B, cierre de alcance compartible y método presencial (AB-01/02/04/05/10/12). **Referencias:** RN-07–RN-09/11/13/23, ADR-004/007/011/013. **Entregables previstos:** antecedentes adicionales propuestos por origen y autorizados aparte por paciente, consulta limitada, nueva autorización de adendas posteriores, revocación, evidencia/auditoría y UI mínima digital/presencial verificable. No desplazar aquí el resumen obligatorio/revisable de 2B.

**Criterios de aceptación:**

- Aceptar cambio o resumen no autoriza antecedentes adicionales; negarlos no bloquea 2B con sus condiciones respectivas (resumen aprobado obligatorio solo en profesional).
- Digital exige cuenta autenticada del paciente. Presencial sigue permitido aunque todos tengan cuenta obligatoria: documento firmado y verificación registrada de identidad/evidencia; cargarlo no habilita acceso automáticamente.
- Lo que se comparte coincide con lo autorizado y conserva autoría. Se prueba rechazo de elementos excluidos, metadatos y derivados no autorizados, y la cadena A→B→C sin herencia de consentimiento.
- La propuesta de alcance fijo identifica registros/versiones y destinatario; no incluye notas futuras implícitas. Una adenda posterior no llega al receptor sin NUEVA autorización expresa. Categorías/registros, representación, revisiones y duración siguen por resolver.
- Revocar restringe futuras consultas, incluidas sesiones/solicitudes concurrentes según contrato aprobado, y mantiene trazabilidad; no borra contenido clínico ni pretende retirar lo ya conocido.
- Se evalúa manifiesto de referencias/versiones frente a snapshots para evitar duplicación clínica innecesaria y acceso accidental a versiones posteriores. Los derechos ARCO siguen un procedimiento distinto.

No implementar esta etapa antes de decidir las verificaciones presenciales y el alcance exacto. Su UI funcional pertenece a 2C, no queda pendiente hasta 4.

## Etapa 2D — Concurrencia de reservas y citas

**Estado:** pendiente. **Dependencia:** atribución y permisos de 2A, estabilidad de 2B/2C. Puede estudiarse en paralelo a la planificación de 2C, sin adelantar implementación dependiente. **Entregables previstos:** contrato de conflictos y solución de concurrencia para citas, series, disponibilidad y espera.

**Criterios de aceptación:** reservas simultáneas no producen solapamientos ni varias citas activas del mismo paciente el mismo día; se preservan sesiones de 60 minutos y hora exacta. Se prueban cambio con cancelación confirmada, pausa/cierre, suspensión con citas pendientes de resolución, cruces entre profesionales, reprogramaciones/series, cancelación, nota y disponibilidad. Un fallo conserva atomicidad e histórico y devuelve conflicto comprensible. No diferir hasta 2D la atomicidad mínima necesaria para entregar 2B. Espera manual y prioridad 1, sin reserva automática.

## Etapa 2E — Zonas horarias

**Estado:** pendiente. **Dependencia:** modelo de agenda de 2A/2D y decisión de representación temporal. **Entregables previstos:** política de zona por operación/consultorio según diseño aprobado, contrato API/UI y plan de compatibilidad de fechas legacy.

**Criterios de aceptación:** retirar la dependencia de `America/Los_Angeles` fija sin sustituirla por otra zona global arbitraria; coinciden UI, API y validaciones SQL para citas/notas futuras, día local y conflictos. Cubrir límites de día y cambios estacionales donde apliquen; no reinterpretar silenciosamente citas históricas. Si cambia una protección temporal en base, hacerlo mediante evolución posterior revisada, conservando intactos los archivos históricos 001/002 y sus garantías.

## Etapa 3 — Pruebas y confiabilidad

**Estado:** pendiente como ampliación; existen pruebas backend/frontend y entorno [aislado](../../compose.episodes-test.yaml). [CI propuesta y aceptación CI-01–07](../ci-plan.md), con [implementación técnica en revisión](../ci-implementation.md). **Dependencia:** 2A–2E para su cierre integral; automatizar regresiones actuales puede hacerse antes en PR técnico autorizado. **Entregables previstos:** regresión transversal, matriz de permisos, carreras/fallos, trazabilidad y ensayos de actualización con fixtures legacy aislados; checks requeridos, artifacts saneados y protección solo tras aprobación administrativa.

**Criterios de aceptación:** escenarios RN y A→B→C/A→B→A reproducibles conforme se implementen; identidad/alta sin exposición entre consultorios; dos vías de cambio y resumen aprobado; pausa/cierre/suspensión; archivo completo propio/adendas con nueva autorización; denegaciones por actor/episodio/alcance; consentimiento digital/presencial y revocación concurrente; sin filtraciones por rutas secundarias; conservación de 001/002 y migración segura de datos reales. Verificar unitarias backend/frontend, integración, lint/build y navegador para implementación, con resultados/límites. Este PR Markdown no ejecuta suites funcionales ni bases. La CI inicial automatiza B/C y regresiones vigentes; no certifica los flujos aún pendientes. La etapa 3 amplía cobertura, no pospone pruebas esenciales de cada etapa 2.

## Etapa 4 — Frontend, experiencia y refactor gradual

**Estado:** pendiente. **Dependencia:** flujos 2B/2C ya funcionales y contratos verificados en 3 para el cierre integral. **Entregables previstos:** claridad de estados/permisos, accesibilidad, errores comprensibles, mejoras graduales del expediente y agenda y separación progresiva de lógica concentrada en [App.jsx](../../frontend/src/App.jsx) y pantallas grandes.

**Criterios de aceptación:** usuario distingue cambio de responsable de permiso de antecedentes; ve quién actúa y qué falta sin ruido visual; agenda conserva diseño y operación manual asistida; backoffice sigue separado. No hay regresión de aislamiento ni de versiones. Contratos y lógica quedan reutilizables para móvil sin ejecutar una migración completa a Expo/TypeScript en esta etapa por implicación automática.

## Etapa 5 — Preparación para producción

**Estado:** pendiente; sus investigaciones legales y operativas pueden iniciarse antes. **Dependencia de salida:** 3/4 y cierre de asuntos jurídicos/operativos bloqueantes. **Entregables previstos:** revisión legal mexicana, avisos y contratos según operaciones reales, atención ARCO separada, política de conservación y excepciones, hardening y resolución/aceptación fundada de riesgos de desarrollo, respaldo/restauración, monitoreo, gestión de incidentes y procedimiento de despliegue.

**Criterios de aceptación:** restauración ensayada con evidencia, mínimo privilegio de aplicación/migraciones, secretos y TLS adecuados, recuperación de cuenta por canal privado, controles de intentos/sesiones y exposición de datos revisados. Despliegue coordina réplicas y migraciones, cuenta con monitoreo y recuperación sin reintroducir permisos inseguros ni borrar histórico. No declarar cumplimiento legal sin revisión competente ni usar Docker de desarrollo como despliegue de producción.

## Etapa 6 — Red estatal y nacional

**Estado:** visión futura, sin implementación inmediata. **Dependencia:** aislamiento y derivación confiables, operación de producción validada y alcance de red aprobado. **Entregables futuros:** reseñas, reputación, filtros avanzados, descubrimiento, funciones y operación de red estatal/nacional y evolución de derivaciones entre consultorios. El directorio público básico, perfil optativo y admisión inicial pertenecen a 2A por ADR-020; no duplicarlos como pendientes exclusivos de 6.

**Criterios de aceptación futuros:** red sin acceso implícito ni búsqueda que revele pacientes de otro consultorio; identidad global, máximo un responsable vigente (activo/pausado), episodios distintos y permiso separado/no heredable. Validar límites de datos públicos, escalabilidad y operación por estado antes de expandir a nivel nacional; no convertir red en clínica con pacientes compartidos.

## Herramienta sugerida por tipo de trabajo

| Trabajo | Sugerencia |
| --- | --- |
| Cerrar decisiones de producto, revisar escenarios y delimitar encargos | ChatGPT para planificación con el usuario y referencia explícita a estos documentos |
| Contrastar código, implementar etapas autorizadas y verificar localmente | Codex local sobre una rama acotada y datos de prueba aislados |
| Segunda revisión de permisos, arquitectura o evidencia | Work solo cuando aporte valor independiente al alcance; no es un paso obligatorio |

No existe obligación de usar las tres herramientas ni de delegar agentes. La herramienta se elige según la tarea. Antes del siguiente prompt de implementación deben resolverse los asuntos abiertos que afecten a 2A; el resto conserva estado abierto y su etapa bloqueante en [decisions.md](decisions.md).
