# Registro de decisiones de producto y arquitectura

Fecha: 17 de octubre de 2026. Base técnica verificada: `origin/main` en `3a1f0d73960e72d1e92082817141a236f638464a`. Fuente de las decisiones de producto: acuerdos expresos reproducidos por el usuario para esta tarea. El examen de código contrasta viabilidad y brechas; no sustituye esos acuerdos.

## Estados y uso del registro

- **APROBADA:** decisión de producto o secuencia de trabajo expresamente acordada. No significa implementada.
- **PROPUESTA:** alternativa técnica para discutir y especificar; no autoriza código, SQL ni despliegue.
- **ABIERTA:** pregunta sin resolución aprobada, con etapa en la que debe cerrarse.
- **NO APROBADA:** acción o comportamiento sin autorización para este alcance; no debe incorporarse como requisito acordado.
- **LEGAL A VALIDAR:** consideración o hipótesis para revisión jurídica; no conclusión de cumplimiento.

Cada encargo futuro debe citar estos IDs y cerrar solo las decisiones necesarias para su etapa. Una propuesta pasa a aprobada únicamente con acuerdo explícito registrado en una modificación posterior, explicando consecuencias y criterios; no por aparecer en un PR documental.

## ADR-001 — Consultorios independientes y red sin acceso implícito

**Estado: APROBADA.**

**Contexto:** PsicoPanel sirve a psicólogos independientes con consultorios propios. La visión futura incluye directorio y derivación estatal/nacional.

**Decisión:** no modelar el producto como clínica con pacientes compartidos. La pertenencia a la red nunca concede acceso al expediente. Mantener separación entre backoffice y operación clínica.

**Consecuencia:** permisos ordinarios se justifican por relación asistencial, autoría o autorización expresa; no por membresía. La red es etapa 6, sin implementación inmediata. El alcance excepcional actual de `superadmin` es deuda a revisar, no política futura ya aprobada.

## ADR-002 — Un responsable activo y episodios históricos distintos

**Estado: APROBADA.**

**Decisión:** el paciente tiene un único responsable activo a la vez. Cada cambio abre un episodio distinto; A→B→A crea un episodio nuevo al regresar a A. No reactivar/sobrescribir el anterior ni reatribuir citas/notas históricas.

**Consecuencia:** ser responsable actual no habilita escritura sobre episodios cerrados ni antecedentes ajenos. El índice y las transacciones que hagan cumplir esta regla son propuestas en ADR-006/008. El alta inicial, cierre sin sucesor y excepciones no se resuelven por inferencia.

## ADR-003 — Derivación ordinaria con tres acuerdos y sin historial obligatorio

**Estado: APROBADA.**

**Decisión:** el origen inicia; el paciente acepta expresamente cambiar de profesional; el destinatario acepta recibirlo. Solo se completa con los tres acuerdos y hasta entonces sigue responsable el origen. Autorizar cambio y autorizar antecedentes son decisiones separadas. Puede completarse sin historial.

**Consecuencia:** una aceptación parcial no habilita al destinatario a consultar el expediente. El cambio no se realiza por el mero acto de asignación administrativa. Rechazo, cancelación, caducidad, orden detallado y competencia entre solicitudes están abiertos, sin alterar estas condiciones.

## ADR-004 — Alcance de antecedentes, evidencia y revocación

**Estado: APROBADA.**

**Decisión:** en transferencia ordinaria el origen propone qué compartir; el paciente autoriza expresamente su alcance y no se comunica más. El destinatario no adquiere autoría ni edición sobre notas recibidas. El consentimiento se admite digital por cuenta autenticada del paciente o presencial por documento firmado con identidad/evidencia verificadas y registradas. Cargar un documento o marcar una casilla del profesional no constituye por sí solo consentimiento verificado. Debe poder revocarse para restringir accesos futuros, conservando auditoría.

**Consecuencia:** diseñar la autorización separada de responsabilidad y de la mera recepción de evidencia. No prometer retirar conocimiento ya comunicado. Metodología, duración, categorías/registros y representación técnica siguen abiertas o propuestas en ADR-007.

## ADR-005 — Archivo del autor, no herencia e integridad

**Estado: APROBADA.**

**Decisión:** el psicólogo anterior conserva solo lectura archivada de notas propias; no escritura ni notas posteriores del nuevo. Antecedentes de otro profesional requieren autorización expresa. Los consentimientos no se heredan en A→B→C. No borrar ni reescribir expedientes, autoría o citas históricas; preservar la integridad clínica existente.

**Consecuencia:** no confundir permiso de archivo del autor con un vínculo activo global. En A→B→A, A conserva su archivo y abre otra atención; las notas de B no se habilitan automáticamente. La autorización A→B no permite a B entregar a C las notas de A bajo ese mismo permiso. Debe especificarse cómo solicitar una nueva autorización para esos antecedentes.

La migración [001_clinical_data_integrity.sql](../../backend/sql/migrations/001_clinical_data_integrity.sql) protege histórico y registros; [002_auth_session_version.sql](../../backend/sql/migrations/002_auth_session_version.sql) versiona y revoca JWT. No modificarlas en esta tarea ni debilitarlas en trabajos futuros. Las correcciones clínicas permitidas conservan versiones conforme a [clinical-data-integrity.md](../clinical-data-integrity.md).

## ADR-006 — Fuente única de responsabilidad y atribución por episodio

**Estado: PROPUESTA; no aprobada para código. Etapa: 2A.**

**Contexto confirmado:** [schema.sql](../../backend/sql/schema.sql) limita activos por par paciente/profesional, no por paciente. [auth.permissions.js](../../backend/src/modules/auth/auth.permissions.js) conserva el fallback `psychologist_patient_access`; el alta de pacientes lo inserta en [patients.service.js](../../backend/src/modules/patients/patients.service.js). [auth.service.js](../../backend/src/modules/auth/auth.service.js) reutiliza filas de relación y puede sobrescribir el episodio. Citas/espera carecen de propietario profesional/episodio; autor de nota nullable y autorización por paciente no segmentan autores.

**Propuesta:** usar `care_relationships` como episodios con identidad e historia inmutables, sin reutilizar episodios cerrados, y como fuente única de responsable activo. El ciclo de vida debe registrar cierre/activación sin borrar historia; no significa prohibir toda transición de estado. Crear índice único parcial por `patient_id` para `status = 'active'`. Retirar el fallback solo tras migración segura y revisión de todos los lectores/escritores.

Vincular nuevas citas, notas, tareas y espera con `care_relationship_id` según especificación; conservar nullable lo legacy ambiguo hasta revisión auditada. Segmentar entrevista, objetivos, riesgo y contexto global para que no se filtren al nuevo episodio.

**Pendiente de aprobación:** modelo exacto de episodios, identidad/atribución, tratamiento de datos globales, alcance de archivo, contratos de permisos y sustitución de rutas heredadas. No asignar dueño de cita a partir del profesional actual si la evidencia es insuficiente.

## ADR-007 — Estructuras de derivación y autorización de alcance fijo

**Estado: PROPUESTA; no aprobada para código. Etapas: 2B/2C.**

**Propuesta:** evaluar estructuras llamadas `patient_referrals`, `referral_events`, `clinical_disclosures`, `clinical_disclosure_items`, `patient_consent_events` y `clinical_history_grants`, además de evidencia digital/presencial. **Son nombres candidatos, no tablas ni rutas existentes.** Separar solicitud, acuerdos, propuesta de antecedentes, evidencia verificada, permiso de acceso y revocación.

Cada autorización identificaría destinatario y alcance fijo de registros/versiones; no abarcaría notas futuras implícitas. Evaluar manifiesto de referencias/versiones frente a snapshots, evitando duplicación innecesaria y sin hacer que una referencia mutable exponga contenido posterior no autorizado. Preservar la protección de integridad y limitar acceso a evidencia e historial de versiones.

**Pendiente de aprobación:** esquema, estados técnicos, contenido de historial, selección por categorías/registros, exposición de versiones, duración, momento de activación, revocación concurrente y metodología de evidencia. No codificar el esquema candidato como si estuviera decidido.

## ADR-008 — Finalización transaccional y coordinación con escrituras

**Estado: PROPUESTA; no aprobada para código. Etapas: 2A/2B, ampliación en 2C/2D.**

**Propuesta:** finalizar derivación mediante transacción con bloqueo por paciente y revalidación de los tres acuerdos, origen vigente y permisos dentro de esa misma transacción. Cerrar episodio anterior y abrir el nuevo de forma indivisible. Coordinar el protocolo con **todas** las escrituras clínicas y operativas relevantes; validar fuera y escribir después no basta.

**Consecuencia esperada:** una solicitud antigua, un cambio administrativo de vínculo o una nota/cita concurrente no deben reabrir permisos ni escribir en el episodio equivocado. También debe definirse cómo las lecturas y divulgaciones concurrentes respetan revocación.

**Pendiente de aprobación:** orden de bloqueos, idempotencia, reintentos/conflictos, política de múltiples derivaciones y cierre de agenda. No trasladar automáticamente citas futuras, espera, entrevista ni riesgo al destinatario; resolver agenda explícitamente y atribución incierta por revisión auditada autorizada.

## ADR-009 — Migración 003 y rollout conservador

**Estado: PROPUESTA; no aprobada para crear ni ejecutar SQL. Etapa: 2A.**

**Propuesta:** una migración 003 posterior, aditiva e idempotente, tras cerrar la especificación. Primero diagnosticar responsables duplicados y atribuciones inciertas; ante conflictos, bloquear e informar en vez de eliminar filas, escoger dueño o reconstruir autoría sin evidencia. No usar `schema.sql`, `seed.sql` ni normalizadores como migración sobre expedientes.

**Condiciones del diseño:** conservación de 001/002, diagnóstico y ensayo en copia aislada autorizada, evidencia de reaplicación/conservación, respaldo restaurable y coordinación de versiones del backend y otros escritores durante el rollout. Evitar convivencia de versiones que sigan concediendo acceso heredado o ignoren el protocolo transaccional. La recuperación debe conservar histórico, sin reintroducir permisos inseguros.

**Límite de esta entrega:** no existe archivo 003 nuevo, no se ejecuta migración alguna y no se toca ninguna base o volumen. La evidencia de conteos de una demo previa no representa datos de otros entornos; véase el alcance exacto en [roadmap.md](roadmap.md).

## ADR-010 — Secuencia de trabajo y UI mínima

**Estado: APROBADA para la secuencia; mecanismos de implementación sujetos a sus ADR.**

**Decisión:** 0 Docker y 1 integridad/autenticación/dependencias de producción completadas para su alcance; seguir con 2A modelo/episodios/permisos/legacy/003, 2B derivación sin historial, 2C antecedentes y consentimiento, 2D concurrencia de agenda, 2E zonas horarias, 3 pruebas/confiabilidad, 4 experiencia/refactor, 5 producción y 6 red futura. Riesgos del audit de desarrollo, hardening y respaldo siguen pendientes.

**Consecuencia:** cada etapa incluye sus pruebas; 3 no es el inicio de toda validación. La UI mínima de aceptación, autorización digital/presencial y revocación se entrega en 2B/2C, sin esperar a 4. Los entregables y criterios por etapa están en [roadmap.md](roadmap.md). La planificación puede usar ChatGPT, implementación autorizada Codex local y auditoría Work cuando aporte valor; no se impone usar las tres herramientas.

## ADR-011 — Derechos del paciente y marco jurídico inicial

**Estado: APROBADA como separación de producto; LEGAL A VALIDAR en alcance normativo y responsabilidades.**

**Decisión de producto:** solicitudes legales de acceso del paciente a sus datos y otros derechos ARCO se tramitan aparte del permiso para divulgar antecedentes en una derivación. No establecer veto absoluto del psicólogo de origen sobre el ejercicio de esos derechos.

**Consideraciones por validar:** México es referencia inicial. Como hipótesis de análisis, el independiente suele actuar como responsable respecto de su consulta y el proveedor como encargado según sus operaciones reales; deben revisarse sus tratamientos efectivos antes de concluir roles. No afirmar que todas las transferencias médicas exigen consentimiento en cualquier circunstancia: pueden existir excepciones. Revisar procedimientos, conservación, evidencia y emergencias con asesoría competente. Estos documentos no declaran cumplimiento ni crean una excepción operativa automática.

## Asuntos abiertos y momento de resolución

Los siguientes puntos están **ABIERTOS**; no tienen una respuesta implícita aprobada:

| ID | Pregunta a resolver | Antes de |
| --- | --- | --- |
| AB-01 | ¿Seleccionar antecedentes por categorías, por registros o una combinación? ¿Cómo confirmar y mostrar el alcance final al paciente? | Especificar 2C |
| AB-02 | ¿Qué incluye exactamente historial clínico: notas/versiones, entrevista, tareas, objetivos, riesgo, contexto, metadatos, adjuntos y resúmenes? ¿Cómo separar los datos hoy globales por episodio? | Modelo y permisos de 2A; alcance de 2C |
| AB-03 | ¿Cómo se visualizarán notas al paciente en la aplicación? ¿Qué procedimiento separado atenderá acceso/ARCO sin veto absoluto del origen? | UI de notas/2C y revisión de 5; no limitar derechos por la UI |
| AB-04 | ¿Quién verifica identidad y firma presencial, con qué evidencia, independencia, estados y controles? ¿Cómo tratar evidencia incompleta o impugnada? | Consentimiento presencial de 2C |
| AB-05 | ¿Qué duración tendrá el permiso, cuál será la metodología de autorización/verificación y qué ocurre al ampliar alcance, corregir versiones, caducar o revocar? | Contratos de 2C |
| AB-06 | ¿Qué evidencia atribuye cada cita/nota legacy a profesional/episodio? ¿Quién puede revisar, con qué permisos y auditoría y cómo dejar pendientes los casos inciertos? | Migración y permisos de 2A |
| AB-07 | ¿Cuál será la política para emergencias/excepciones y el acceso excepcional de `superadmin`? ¿Qué base, necesidad, revisión y auditoría se exigirán? | Cualquier flujo excepcional; revisión jurídica de 5 |
| AB-08 | ¿Cómo funciona el primer vínculo, cierre sin sucesor, rechazo/cancelación/vencimiento y competencia entre derivaciones? ¿Qué rutas administrativas o invitaciones deben restringirse? | Especificación de 2A/2B |
| AB-09 | ¿Cómo cerrar la agenda/espera del origen si hay citas futuras, recurrencias, tareas en curso o atribución incierta, sin traslado automático ni pérdida histórica? | Finalización de 2B |
| AB-10 | ¿Cuándo se activa el acceso de antecedentes respecto al cambio? ¿Cómo pedir permiso nuevo sobre notas de A en B→C? ¿Qué garantías tienen consultas en curso al revocar? | Especificación de 2C |
| AB-11 | ¿Qué almacenamiento temporal y zona gobiernan consultorio/paciente, API/UI y día clínico? ¿Cómo mantener interpretación de datos legacy? | Diseño de 2E |
| AB-12 | ¿Qué roles jurídicos reales, avisos, contratos, conservación, respaldos, restauración y controles operativos se requieren en México? | Diseño aplicable de 2C y salida de 5 |

Antes de encargar código de 2A deben aprobarse las propuestas que afecten ese alcance y resolverse las partes bloqueantes de AB-02/06/08. No es necesario inventar respuestas de 2C para terminar este PR documental.

## Acciones y supuestos no aprobados

**Estado: NO APROBADA para el alcance actual**, o incompatibles con las reglas firmes según se indica:

- Crear o ejecutar ahora la migración 003; modificar código, SQL, Docker, dependencias, bases o volúmenes; hacer merge del PR sin autorización. Esta tarea solo autoriza los cuatro documentos, su commit, push y apertura del PR.
- Tratar los nombres de tablas, índice, referencias, bloqueos, estados o snapshots propuestos como arquitectura ya aprobada para código.
- Implementar ahora la red estatal/nacional, migración móvil, emergencias o un flujo break-glass por aparecer en la visión futura.
- Conceder expediente por pertenencia a red, aceptar dos responsables activos, heredar consentimiento, compartir automáticamente todo el historial, reutilizar episodios cerrados o cambiar autoría: incompatibles con RN-01–RN-12.
- Convertir una casilla/carga del profesional en consentimiento verificado, bloquear derivación por falta de permiso de historial o establecer un veto absoluto del origen a ARCO: incompatibles con RN-06/08/13.
- Asignar automáticamente dueños legacy inciertos, borrar duplicados o trasladar agenda/espera para facilitar la migración: sin aprobación y contrarios al enfoque conservador propuesto.

## Referencias y discrepancias de contexto existentes

[README.md](../../README.md), [ARCHITECTURE.md](../../ARCHITECTURE.md), [AGENTS.md](../../AGENTS.md), [NOTES.md](../../NOTES.md), [clinical-data-integrity.md](../clinical-data-integrity.md) y [authentication-security.md](../authentication-security.md) se leyeron para contrastar el estado. `NOTES.md` tiene fecha de abril de 2026; `ARCHITECTURE.md` aún menciona falta de tests y módulos legacy, mientras hoy existen suites en [backend/test](../../backend/test). Las guías de seguridad conservan evidencia histórica previa a #4; no asumir que sus conteos npm describen el estado posterior.

Las referencias antiguas a trabajar/push en `main` no cambian la instrucción expresa de esta tarea: rama documental y PR, sin merge. Las indicaciones históricas sobre schema/seed no autorizan ejecutarlos sobre expedientes. No se corrigen esos archivos aquí porque el alcance está limitado a estos cuatro documentos. Futuras tareas deben consultar esta separación entre decisiones objetivo y comportamiento efectivamente implementado.
