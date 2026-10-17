# Roadmap de producto y arquitectura

Fecha: 17 de octubre de 2026. Base contrastada: `origin/main` en `3a1f0d73960e72d1e92082817141a236f638464a`. Las etapas y su orden general están acordados; los mecanismos técnicos pendientes de aprobación se identifican como propuestas en [decisions.md](decisions.md).

## Alcance de esta entrega documental

Versionar únicamente [vision.md](vision.md), [business-rules.md](business-rules.md), este roadmap y [decisions.md](decisions.md), en `docs/product-architecture-roadmap`, con PR hacia `main`. Esta entrega no crea ni ejecuta la migración 003; no modifica código, SQL, Docker, dependencias, volúmenes o datos. El merge del PR documental y los encargos de implementación requieren sus autorizaciones correspondientes.

Los documentos son contexto durable para nuevos chats. Cada encargo futuro debe citar la etapa, sus reglas RN y ADR, decisiones que debe cerrar, exclusiones, criterios de aceptación y evidencia esperada. El cierre de una etapa debe actualizar su estado en una tarea posterior autorizada, sin depender solo del historial de conversación.

## Estado de partida y evidencia

| Etapa | Estado al corte | Evidencia y límite |
| --- | --- | --- |
| 0. Docker de desarrollo | Completada para su alcance | PR [#1](https://github.com/japh113/plataformaPsicologia/pull/1), merge `9dbc305`; [README.md](../../README.md), [compose.yaml](../../compose.yaml) y [docker/postgres/init.sh](../../docker/postgres/init.sh). No es despliegue de producción. |
| 1. Integridad, autenticación y dependencias de producción | Completada para su alcance | PR [#2](https://github.com/japh113/plataformaPsicologia/pull/2), merge `6a23ac8`; [#3](https://github.com/japh113/plataformaPsicologia/pull/3), merge `0e8b13f`; [#4](https://github.com/japh113/plataformaPsicologia/pull/4), merge `3a1f0d7`. No certifica el estado de una base desplegada ni elimina deuda de desarrollo/hardening. |
| 2A–2E | Pendientes | Existe modelo de vínculos y operación clínica, pero no cumple todavía el aislamiento por episodio y consentimiento acordado. La migración 003 no existe en la base revisada. |
| 3. Pruebas y confiabilidad | Pendiente como etapa de ampliación | Ya hay tests unitarios e integración; no se parte de cero. Cada etapa 2 debe traer sus propias pruebas. |
| 4. Experiencia y refactor gradual | Pendiente | La UI funcional mínima de 2B y 2C se entrega en esas etapas. |
| 5. Preparación para producción | Pendiente | Incluye revisión legal, privacidad, restauración, monitoreo y despliegue. |
| 6. Red estatal/nacional | Visión futura | Directorio y derivación; no se implementa en el alcance inmediato. |

La corrección de dependencias de producción es el estado de alcance acordado tras #4, no una auditoría nueva ejecutada por esta tarea. `npm audit` de desarrollo sigue con riesgos por investigar; no fijar conteos como si fueran permanentes. Los conteos de vulnerabilidades al final de [authentication-security.md](../authentication-security.md) pertenecen a la evidencia anterior a #4. Tampoco se repiten aquí sus resultados de pruebas como si se hubieran ejecutado hoy.

## Brechas confirmadas contra el repositorio

| Hallazgo y ruta existente | Implicación para el plan |
| --- | --- |
| [backend/sql/schema.sql](../../backend/sql/schema.sql): índices activos de `care_relationships` por `(patient_id, psychologist_user_id)` | No impiden dos profesionales distintos activos sobre el mismo paciente. 2A debe resolverlo sin eliminar duplicados automáticamente. |
| [auth.permissions.js](../../backend/src/modules/auth/auth.permissions.js): `buildPatientAccessScope` admite relación activa **o** `psychologist_patient_access` | El vínculo heredado puede seguir concediendo acceso sin responsable activo. 2A debe cubrir todas las rutas, no solo el expediente. |
| [patients.service.js](../../backend/src/modules/patients/patients.service.js): `createPatient` inserta acceso heredado; [auth.service.js](../../backend/src/modules/auth/auth.service.js) sincroniza ese acceso y reutiliza relaciones | Crear pacientes y cambiar vínculos exige revisión conjunta. Reactivar/sobrescribir relaciones impide conservar episodios distintos. |
| [schema.sql](../../backend/sql/schema.sql): citas y espera solo referencian paciente; tareas no tienen episodio | Falta atribución segura a profesional/episodio. Una relación nueva puede exponer operación previa si solo se filtra por paciente. |
| `patient_clinical_notes.created_by_user_id` es nullable; [patients.service.js](../../backend/src/modules/patients/patients.service.js) lee/edita notas por paciente y nota | Autor informado al crear no equivale a autorización por autor. Se necesita segmentación y tratamiento de autoría legacy desconocida. |
| `patientSelectColumns` reúne entrevista, riesgo, contexto, tareas y objetivos; notas se agregan por paciente | El aislamiento debe incluir datos globales, metadatos y derivados, no solo la colección de notas. |
| [appointments.service.js](../../backend/src/modules/appointments/appointments.service.js), [availability.service.js](../../backend/src/modules/availability/availability.service.js) y [reminders.service.js](../../backend/src/modules/reminders/reminders.service.js) consultan acceso heredado | Una corrección limitada a `patients` deja rutas laterales de acceso o comportamiento inconsistente. |
| Zona fija en servicios de pacientes/citas y en [001_clinical_data_integrity.sql](../../backend/sql/migrations/001_clinical_data_integrity.sql) | 2E debe coordinar validaciones de aplicación y base sin reescribir la migración histórica 001. |

**Evidencia externa al examen de código de esta tarea:** el análisis previo reportó una demo local consultada solo en lectura: 5 pacientes, 3 notas con autor, 5 citas, 2 citas sin nota para atribución y ninguna futura. No se consultó nuevamente esa base. Esos números describen únicamente aquella demo; no prueban unicidad, atribución ni ausencia de agenda futura en otras bases. Cada entorno necesita su propio diagnóstico autorizado y de solo lectura antes de planificar una migración.

## Etapa 0 — Infraestructura Docker

**Estado:** completada para desarrollo. **Dependencias:** ninguna etapa posterior. **Entregables existentes:** Compose, imágenes de desarrollo, inicialización de base nueva y guía en README.

**Criterios de cierre del alcance:** arranque local reproducible, salud de API/base, persistencia al reiniciar y separación de inicialización nueva frente a volúmenes existentes. Son capacidades documentadas por #1; no se levantaron contenedores para este PR documental. Los respaldos restaurables y despliegue de producción quedan pendientes en 5.

## Etapa 1 — Integridad clínica, autenticación y dependencias

**Estado:** completada para el alcance integrado de #2–#4. **Dependencia:** 0. **Entregables existentes:** [clinical-data-integrity.md](../clinical-data-integrity.md), [authentication-security.md](../authentication-security.md), migraciones [001](../../backend/sql/migrations/001_clinical_data_integrity.sql) y [002](../../backend/sql/migrations/002_auth_session_version.sql), pruebas en [backend/test](../../backend/test), manifests y lockfiles actualizados por #4.

**Criterios que deben preservarse:** bloqueo de borrado destructivo, conservación de versiones y citas, restricciones nota/cita, verificación de estado vigente del usuario y revocación persistente de JWT tras cambios de cuenta o contraseña. La migración 001 protege histórico; 002 versiona/revoca sesiones. No alterarlas ni usar schema/seed para actualizar expedientes existentes.

**Pendientes explícitos:** riesgos del audit de desarrollo, hardening (entre otros, intentos de login, almacenamiento de JWT, CORS, TLS y recuperación remota segura), mínimo privilegio y copias/restauración. No declarar preparación para producción por haber cerrado esta etapa.

## Etapa 2A — Modelo clínico, episodios, permisos y datos legacy

**Estado:** pendiente; siguiente especificación a cerrar. **Dependencia:** 1 y aprobación de las propuestas aplicables de ADR-006–ADR-009. **Entregables previstos:** especificación de episodios y permisos, inventario de rutas/derivados, diagnóstico de atribución legacy, plan de revisión auditada, diseño de migración 003 y de rollout. El SQL solo se crea en una tarea de implementación posterior autorizada.

**Criterios de aceptación:**

- Un paciente no puede acabar con dos responsables activos; A→B→A conserva episodios separados y no sobrescribe identidad/autoría del anterior.
- Lectura y escritura se segmentan por episodio, autor y permisos de antecedentes conforme a RN-01–RN-12. La lectura archivada del autor funciona sin devolver acceso al expediente global.
- Se cubren alta de paciente, vínculos administrativos e invitaciones, expediente, entrevista, tareas, objetivos, riesgo, agenda, recurrencias, disponibilidad, espera y recordatorios. Ninguna ruta antigua debe saltarse las reglas ordinarias.
- Nuevos registros clínicos/operativos tienen atribución inequívoca según diseño aprobado; los legacy ambiguos permanecen sin asignación inventada y con revisión por operador autorizado y auditado.
- La propuesta 003 es aditiva e idempotente; detecta conflictos/duplicados y se detiene con diagnóstico en vez de borrar o elegir un responsable automáticamente. No modifica 001 ni 002 ni ejecuta schema/seed.
- El ensayo posterior usa una copia aislada y autorizada, comprueba conservación de datos y reaplicación, y define coordinación de todas las versiones/escritores durante el despliegue y recuperación sin perder historia.

La fuente única en `care_relationships`, el índice parcial por paciente, las referencias `care_relationship_id` y la retirada del fallback heredado son propuestas de arquitectura, no decisiones de código aprobadas por este documento.

## Etapa 2B — Derivación sin historial

**Estado:** pendiente. **Dependencia:** 2A. **Entregables previstos:** flujo de solicitud del origen, aceptación expresa del cambio por paciente, aceptación del destinatario, estado visible y UI mínima utilizable por los tres actores; pruebas de permisos y concurrencia de finalización.

**Criterios de aceptación:**

- Solo los tres acuerdos permiten completar el cambio; antes de ello el origen conserva responsabilidad y el destinatario no obtiene acceso clínico.
- Completar cambia responsable una sola vez y crea episodio nuevo; errores o solicitudes concurrentes no dejan dos activos ni un cambio parcial.
- La derivación funciona sin compartir historial. No filtra entrevista, riesgo, contexto, notas, tareas u objetivos anteriores mediante respuestas o resúmenes.
- El cierre de agenda/espera tiene un procedimiento aprobado: no se trasladan automáticamente citas futuras ni espera; no se reatribuyen citas inciertas ni se destruye el histórico.
- Todos los caminos existentes de vinculación respetan el flujo aprobado o quedan restringidos según especificación. Definir previamente rechazo, cancelación, vencimiento y solicitudes competidoras.

El bloqueo por paciente y la revalidación dentro de la misma transacción, coordinados con todas las escrituras clínicas, son el mecanismo propuesto; deben especificarse antes de codificar. No relegar la UI mínima de esta etapa a 4.

## Etapa 2C — Antecedentes opcionales, consentimiento y revocación

**Estado:** pendiente. **Dependencia:** 2A y 2B, cierre de alcance clínico y método de consentimiento presencial. **Entregables previstos:** selección propuesta por origen, autorización separada del paciente, consulta limitada del destinatario, revocación, evidencia y auditoría, con UI mínima digital y presencial verificable.

**Criterios de aceptación:**

- Aceptar el cambio no autoriza antecedentes; negar historial no bloquea el flujo de 2B.
- Digital exige cuenta autenticada del paciente. Presencial exige documento firmado y verificación registrada de identidad/evidencia; cargarlo no habilita acceso automáticamente.
- Lo que se comparte coincide con lo autorizado y conserva autoría. Se prueba rechazo de elementos excluidos, metadatos y derivados no autorizados, y la cadena A→B→C sin herencia de consentimiento.
- La propuesta de alcance fijo identifica registros/versiones y destinatario; no incluye notas futuras implícitas. Categorías frente a registros, revisiones y duración deben resolverse antes de implementar.
- Revocar restringe futuras consultas, incluidas sesiones/solicitudes concurrentes según contrato aprobado, y mantiene trazabilidad; no borra contenido clínico ni pretende retirar lo ya conocido.
- Se evalúa manifiesto de referencias/versiones frente a snapshots para evitar duplicación clínica innecesaria y acceso accidental a versiones posteriores. Los derechos ARCO siguen un procedimiento distinto.

No implementar esta etapa antes de decidir las verificaciones presenciales y el alcance exacto. Su UI funcional pertenece a 2C, no queda pendiente hasta 4.

## Etapa 2D — Concurrencia de reservas y citas

**Estado:** pendiente. **Dependencia:** atribución y permisos de 2A, estabilidad de 2B/2C. Puede estudiarse en paralelo a la planificación de 2C, sin adelantar implementación dependiente. **Entregables previstos:** contrato de conflictos y solución de concurrencia para citas, series, disponibilidad y espera.

**Criterios de aceptación:** reservas simultáneas no producen solapamientos ni varias citas activas del mismo paciente el mismo día; se preservan sesiones de 60 minutos y hora exacta. Se prueban cruces entre profesionales, cierres de episodio, reprogramaciones/series, cancelación, nota y cambios de disponibilidad. Un fallo conserva atomicidad e histórico y devuelve un conflicto comprensible. La espera mantiene asignación manual y prioridad 1; no se convierte en reserva automática.

## Etapa 2E — Zonas horarias

**Estado:** pendiente. **Dependencia:** modelo de agenda de 2A/2D y decisión de representación temporal. **Entregables previstos:** política de zona por operación/consultorio según diseño aprobado, contrato API/UI y plan de compatibilidad de fechas legacy.

**Criterios de aceptación:** retirar la dependencia de `America/Los_Angeles` fija sin sustituirla por otra zona global arbitraria; coinciden UI, API y validaciones SQL para citas/notas futuras, día local y conflictos. Cubrir límites de día y cambios estacionales donde apliquen; no reinterpretar silenciosamente citas históricas. Si cambia una protección temporal en base, hacerlo mediante evolución posterior revisada, conservando intactos los archivos históricos 001/002 y sus garantías.

## Etapa 3 — Pruebas y confiabilidad

**Estado:** pendiente como ampliación; existen pruebas en [backend/test](../../backend/test) y entorno [compose.integrity-test.yaml](../../compose.integrity-test.yaml). **Dependencia:** 2A–2E para su cierre. **Entregables previstos:** regresión transversal, matriz de permisos, pruebas de carreras/fallos, trazabilidad y ensayos de actualización sobre datos legacy aislados.

**Criterios de aceptación:** escenarios RN y A→B→C/A→B→A reproducibles; denegaciones por autor/episodio/alcance; consentimiento digital/presencial; revocación concurrente; ausencia de filtraciones por rutas secundarias; conservación de 001/002; reaplicación de migración y gestión de datos ambiguos sin borrados. Verificar lint/build y pruebas pertinentes, con resultados y límites documentados. La etapa 3 amplía la cobertura; no permite posponer las pruebas esenciales de cada etapa 2.

## Etapa 4 — Frontend, experiencia y refactor gradual

**Estado:** pendiente. **Dependencia:** flujos 2B/2C ya funcionales y contratos verificados en 3 para el cierre integral. **Entregables previstos:** claridad de estados/permisos, accesibilidad, errores comprensibles, mejoras graduales del expediente y agenda y separación progresiva de lógica concentrada en [App.jsx](../../frontend/src/App.jsx) y pantallas grandes.

**Criterios de aceptación:** usuario distingue cambio de responsable de permiso de antecedentes; ve quién actúa y qué falta sin ruido visual; agenda conserva diseño y operación manual asistida; backoffice sigue separado. No hay regresión de aislamiento ni de versiones. Contratos y lógica quedan reutilizables para móvil sin ejecutar una migración completa a Expo/TypeScript en esta etapa por implicación automática.

## Etapa 5 — Preparación para producción

**Estado:** pendiente; sus investigaciones legales y operativas pueden iniciarse antes. **Dependencia de salida:** 3/4 y cierre de asuntos jurídicos/operativos bloqueantes. **Entregables previstos:** revisión legal mexicana, avisos y contratos según operaciones reales, atención ARCO separada, política de conservación y excepciones, hardening y resolución/aceptación fundada de riesgos de desarrollo, respaldo/restauración, monitoreo, gestión de incidentes y procedimiento de despliegue.

**Criterios de aceptación:** restauración ensayada con evidencia, mínimo privilegio de aplicación/migraciones, secretos y TLS adecuados, recuperación de cuenta por canal privado, controles de intentos/sesiones y exposición de datos revisados. Despliegue coordina réplicas y migraciones, cuenta con monitoreo y recuperación sin reintroducir permisos inseguros ni borrar histórico. No declarar cumplimiento legal sin revisión competente ni usar Docker de desarrollo como despliegue de producción.

## Etapa 6 — Red estatal y nacional

**Estado:** visión futura, sin implementación inmediata. **Dependencia:** aislamiento y derivación confiables, operación de producción validada y alcance de red aprobado. **Entregables futuros:** especificación de directorio, admisión/identidad profesional, descubrimiento y derivaciones entre consultorios.

**Criterios de aceptación futuros:** pertenecer a red no habilita expediente; se mantiene un responsable activo, episodios distintos, permiso separado y no heredable. Se validan límites de datos públicos, escalabilidad y operación por estado antes de expandir a nivel nacional. No convertir la red en una clínica con pacientes compartidos.

## Herramienta sugerida por tipo de trabajo

| Trabajo | Sugerencia |
| --- | --- |
| Cerrar decisiones de producto, revisar escenarios y delimitar encargos | ChatGPT para planificación con el usuario y referencia explícita a estos documentos |
| Contrastar código, implementar etapas autorizadas y verificar localmente | Codex local sobre una rama acotada y datos de prueba aislados |
| Segunda revisión de permisos, arquitectura o evidencia | Work solo cuando aporte valor independiente al alcance; no es un paso obligatorio |

No existe obligación de usar las tres herramientas ni de delegar agentes. La herramienta se elige según la tarea. Antes del siguiente prompt de implementación deben resolverse los asuntos abiertos que afecten a 2A; el resto conserva estado abierto y su etapa bloqueante en [decisions.md](decisions.md).
