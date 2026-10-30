# Privacidad de respuestas clínicas del paciente — Issue #23

Este documento conserva la evidencia histórica de #23/#25 y, en la [consolidación 2A](#consolidación-2a--inventario-y-permisos-objetivo), mantiene el inventario actual y el contrato objetivo de [#39](https://github.com/japh113/plataformaPsicologia/issues/39). El alcance nuevo es documental: no cambia DTO ni permisos del runtime.

## Alcance y causa

Implementación acotada de [Issue #23](https://github.com/japh113/plataformaPsicologia/issues/23), autorizada expresamente por el propietario. Base remota verificada: `main` `edc1bb00db97fd500b5ddc1ae479bce2e5c3fcf4`, merge de [#24](https://github.com/japh113/plataformaPsicologia/pull/24). Código funcional y fixtures: `eb0c2e7e47e275848c7d19ff0dc566c1bc4b2ac0`. Rama `fix/patient-api-clinical-projection`, entrega mediante Draft PR sin merge ni auto-merge.

Los lectores compartían un mapeo que incluía `patients.notes` y `patients.risk_level` para paciente y psicólogo. El mapeo de tareas añadía el objetivo interno de la nota asociada, incluso después de actualizar `completed`. Ocultar estos datos en React no protegía el JSON. La reproducción de abajo utilizó exclusivamente fixtures ficticios; no acredita un incidente con datos reales.

La corrección aplica proyecciones explícitas en el servidor: solo el psicólogo recibe `notes`, `riskLevel` y `clinicalNoteObjective`. Se omiten también cuando falta el actor. Las propiedades se seleccionan explícitamente, sin copiar filas completas. `clinicalNotes` permanece vacío para el paciente aunque una consulta suministrase notas por error. La autorización previa y el aislamiento siguen en servicios/middleware; una proyección limitada no concede acceso administrativo.

Reglas aplicables: [RN-13, RN-24, RN-25, RN-27 y RN-67](product/business-rules.md). Acceso legal/ARCO y clasificación más amplia de entrevistas, citas y texto libre permanecen separados de esta corrección.

## Contrato revisado

| Respuesta | Paciente | Psicólogo autorizado |
| --- | --- | --- |
| `GET /api/patients` y `GET /api/patients/:id` | Sin `notes`, `riskLevel` ni objetivo profesional en objetos anidados | Conserva contexto, riesgo, notas clínicas y contexto de tareas |
| `PATCH /api/patients/:id/tasks/:taskId` | Puede actualizar únicamente `completed`; respuesta sin objetivo profesional | Conserva edición de texto/estado y objetivo profesional |
| `PUT /api/patients/:id/interview` | Primera entrevista permitida; devuelve expediente proyectado y respuestas propias | Conserva edición autorizada y respuesta profesional |
| Otras escrituras de expediente/notas/tareas | Conservan denegaciones existentes | Conservan operaciones autorizadas; expedientes devueltos usan el mismo lector por actor |
| `/objectives` | Permisos actuales sin cambios; desaparece el campo profesional vacío del mapeo compartido | Operaciones actuales sin cambios |

`clinicalNoteId` y `clinicalNoteDate` se conservan en las tareas propias para identificar y ordenar su asociación actual con un seguimiento. No incluyen texto profesional ni habilitan lectura de notas; tampoco constituyen publicación o consentimiento. Las pruebas verifican que cambiar IDs no permite leer o modificar el expediente/tarea ajeno y que el paciente sigue sin acceso directo a notas. No se amplían metadatos ni se implementa la UX de [#21](https://github.com/japh113/plataformaPsicologia/issues/21).

Se conservan los datos ordinarios existentes (identidad/contactos, estado, motivo, fechas y entrevista propia), las tareas y los objetivos compartidos. No se reclasifica la entrevista ni se retiran indiscriminadamente respuestas aportadas por el paciente. La política de cumplimiento de objetivos corresponde a [#22](https://github.com/japh113/plataformaPsicologia/issues/22), fuera de este PR.

Ejemplo ficticio, fragmento del expediente anterior:

```json
{
  "id": "a",
  "notes": "FICTIONAL_PRIVATE_CONTEXT_a",
  "riskLevel": "high",
  "tasks": [{
    "id": "7", "text": "FICTIONAL_PATIENT_TASK_a", "completed": false,
    "clinicalNoteId": "10", "clinicalNoteDate": "2026-10-23",
    "clinicalNoteObjective": "FICTIONAL_NOTE_OBJECTIVE_a"
  }]
}
```

Mismo fragmento destinado al paciente después:

```json
{
  "id": "a",
  "tasks": [{
    "id": "7", "text": "FICTIONAL_PATIENT_TASK_a", "completed": false,
    "clinicalNoteId": "10", "clinicalNoteDate": "2026-10-23"
  }]
}
```

El PATCH devuelve `data` con esa misma forma de tarea y el nuevo `completed`. Los campos restringidos están ausentes, no vacíos. El psicólogo conserva la primera forma. La insignia de riesgo de la lista frontend se limita al psicólogo para que el valor ausente no se presente al paciente como «sin riesgo».

## Evidencia local del 28 de octubre de 2026

Ubuntu WSL/Docker Desktop, Node `v24.22.1`, PostgreSQL `17.11`. Sin instalar npm en host ni operar el Compose habitual. El wrapper verifica UUID nuevo, PostgreSQL tmpfs, red de DB interna, cero puertos de DB y propiedad de imágenes. Logs/capturas temporales quedan ignorados en `tmp/issue23/`; no se incorporan JWT, datos reales, dumps o secretos a Git.

| Ejecución | Destino UUID | Resultado |
| --- | --- | --- |
| Reproducción nueva, antes del arreglo, misma suite HTTP | `db90d4a8-de98-4dac-ac05-55db2d20b0c6` | 17 pruebas de episodios y 99 unitarias aprobadas. Integración: 112 aprobadas, 7 fallidas de 119, sin omitidas: seis casos negativos de privacidad y su padre fallaron como se esperaba |
| `bash scripts/clinical-episodes.sh test`, servicio corregido | `9e9d0a6e-e55b-4ba4-896d-61f186f4b203` | 17/17 episodios, 101/101 unitarias backend, 119/119 integración; cero fallidas/canceladas/omitidas; frontend lint/build aprobados |
| `npm test` frontend en imagen de demo propia | `fce818af-ef0d-41b7-96ea-8f87d4cbc216` | 3/3 aprobadas, sin omitidas |
| Demo final `patient-projection-demo` y Chromium | `6fd0f5f9-d7b9-4ab2-96ab-c487a9089513` | Tres recorridos aprobados; cero errores de página o respuestas API HTTP >=400 en el recorrido final |

La reproducción falló en listado, detalle, PATCH de tarea, expediente devuelto por entrevista, lectura propia del segundo paciente y proyección de objetivos. La suite revisa recursivamente claves de todo el JSON y busca marcadores ficticios inequívocos. Los mismos casos pasan con la corrección. También comprueba conservación de valores en PostgreSQL, operaciones de tareas del profesional, denegaciones administrativas, aislamiento al manipular IDs y permisos de objetivos sin cambios.

Las unitarias conservan el positivo de `mapTaskRow` para el psicólogo y añaden negativos para paciente, roles administrativos, actor ausente, alias legacy y notas inesperadas en la fila. La suite nueva se declara en `backend/package.json`; la CI existente comprueba que ninguna integración descubierta quede omitida.

Chromium `156.0.8078.4`, Playwright `1.64.0`, Node del arnés `v24.21.0`, escritorio 1440×1000: login paciente, JSON depurado, tarea completada tras seleccionar expediente, lista sin insignia de riesgo; login profesional, campos conservados, riesgo alto y nota clínica accesibles. Capturas con entradas/credenciales demo ocultas e inspeccionadas visualmente. El arnés local temporal no añade checks ni sustituye la regresión B/C/D2 de Actions.

Incidencias registradas:

- El primer arnés interceptaba también módulos JavaScript; se acotó a rutas `/api/`. Otros intentos fallaron al comprobar/esperar la actualización desde el tablero sin expediente seleccionado. Es comportamiento previo confirmado en `App.jsx`, idéntico a la base. El recorrido válido abre «Ver detalle», vuelve a «Tablero» y completa la tarea. No se declara arreglado ese límite de UX.
- La primera demo instalaba hasta 004 y mostró un error del panel de contactos C. El fixture final instala hasta 005, como la demo de identidad existente, exclusivamente en otra base nueva. El recorrido final exige ausencia de errores API, además de privacidad.
- Solapar ensayo corregido y primera demo hizo que la limpieza de imágenes de demo detectase las dos etiquetas del otro ensayo propio ya eliminado. Contenedores/redes propios se retiraron; antes de retirar manualmente las imágenes de demo se verificó propiedad y que las únicas diferencias del baseline eran exactamente aquella limpieza propia, acreditada por su log. Sin restaurar imágenes ni modificar recursos ajenos. La demo final se ejecutó en secuencia y su limpieza verificada terminó correctamente.

SQL 001–007, manifiesto/hashes y ambos lockfiles se contrastaron byte por byte con la base y permanecen idénticos. Sin cambios de autenticación, episodios, vínculos, participantes, estados clínicos, CI, retención de artifacts, proveedores o configuración habitual. `git diff --check` y el verificador documental offline forman parte de la revisión final.

## Demo reproducible — ADR-019

Desde la raíz, con Docker/WSL y autorización de pruebas aisladas:

```bash
bash scripts/clinical-episodes.sh patient-projection-demo
```

Genera UUID y destino nuevos y muestra URLs loopback dinámicas. El creador rechaza entorno distinto de desarrollo, cluster reutilizado o base existente; no usa seed ni activa episodios. Instala baseline/sucesoras hasta 005 solo en esa base nueva. Para restablecer, limpiar únicamente ese UUID y crear otro destino, sin reutilizar bases ni borrar volúmenes existentes.

Cuentas ficticias: `p@episodes.invalid` (paciente P), `q@episodes.invalid` (paciente Q), `a@episodes.invalid` (psicólogo de P), `b@episodes.invalid` (psicólogo de Q). Contraseña de prueba: `Episode-Demo-Only-284!`. Introducirlas manualmente; las tarjetas de otras demos no corresponden a este fixture.

1. Como P, comprobar «Synthetic legacy task» en el tablero y ausencia de `FICTIONAL_PRIVATE_CONTEXT_p`, `FICTIONAL_NOTE_OBJECTIVE_p` y `FICTIONAL_NOTE_CONTENT_p` en el JSON de `/api/patients` y `/api/patients/p`.
2. Abrir «Ver detalle», volver a «Tablero» y completar la tarea. El PATCH conserva texto, estado, ID/fecha de asociación; omite objetivo profesional. «Mi Seguimiento» no muestra riesgo.
3. `/api/patients/q` con sesión P devuelve 404. Q consulta solo su expediente. No usar cuentas reales ni copiar tokens a evidencia.
4. Como A, abrir «Mis Pacientes» y el expediente de P: riesgo alto, nota general y nota clínica conservan marcadores ficticios. B sigue sin acceso a P. No editar objetivos para comprobar este arreglo.
5. Guardar por primera vez la entrevista de P con respuestas ficticias: la respuesta conserva esas respuestas y devuelve expediente depurado. No valida ni activa un episodio.
6. Limpiar únicamente con `bash scripts/clinical-episodes.sh cleanup UUID`, usando el UUID impreso por esa ejecución. No solapar ensayos que se incluyan mutuamente en sus inventarios de imágenes.

La API permite completar tareas; la navegación/agrupación mantiene límites previos: el tablero requiere expediente seleccionado y el detalle depende del historial de notas que ya era vacío para el paciente. Se conservan como temas de #21, sin divulgar notas para suplirlos. Publicación clínica, política de entrevista, ARCO, permisos por episodio, #22, D3 y despliegue quedan fuera de alcance. Esta corrección no certifica preparación para producción.

## Entrega y CI

La evidencia anterior es local de este encargo. GitHub Actions ejecutará su matriz completa al abrir el Draft PR, conservando siete checks y artifacts técnicos de 14 días. Sus resultados se consultan por HEAD del PR, sin sustituirlos por evidencia histórica. El PR permanece Draft sin merge/auto-merge; revisión e integración requieren decisión posterior.

## Consolidación 2A — Inventario y permisos objetivo

Corte inspeccionado: `main` `e15610289614c4e8eee03ac4fca875810d1439a3`, incluido #43. **Verificado aquí significa inspección estática de rutas, controladores, servicios, validadores y mappers; no prueba HTTP nueva, consulta de base ni acreditación de despliegue.** [ADR-031 y catálogo clínico](product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades) fijan acuerdos/precedencia. [Admisión](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo) define sus dos modalidades. Esta sección es la fuente canónica de la matriz de campos/alcances futura; no duplicar sus reglas en un nuevo contrato independiente.

Se revisaron [app/middleware](../backend/src/app.js), [rutas](../backend/src/modules/patients/patients.routes.js), [controladores](../backend/src/modules/patients/patients.controller.js), [servicio patients](../backend/src/modules/patients/patients.service.js), [permisos](../backend/src/modules/auth/auth.permissions.js), [seguimiento](../backend/src/modules/patients/patients.follow-up.js), [citas](../backend/src/modules/appointments/appointments.service.js), [disponibilidad](../backend/src/modules/availability/availability.service.js), [recordatorios](../backend/src/modules/reminders/reminders.service.js), [mappers UI](../frontend/src/mappers/patients.js), [identidad](../backend/src/modules/auth/identity.service.js) y [auth](../backend/src/modules/auth/auth.service.js). El inventario SQL describe archivos versionados, sin ejecutar ninguno.

**Lectura de las tablas:** PAC = paciente titular; PSI = psicólogo actualmente autorizado por paciente; BO = support/admin/superadmin. Autor indica registrador comprobable, no propiedad jurídica del dato ni identidad inferida del lector. Los campos agrupados comparten origen, autoría, destinatarios y operaciones; los nombres enumerados forman la lista revisada. «Pendiente 2A» es diferencia con producto aprobado, no vulnerabilidad actual demostrada. Los valores legacy mixtos no se reclasifican en lote.

### Rutas y respuestas de escritura inspeccionadas

Todas las rutas clínicas están bajo `/api`, autenticadas y restringidas a PAC/PSI por middleware. Los servicios de expediente/citas conservan alcance por paciente; disponibilidad restringe al profesional propio y recordatorios a sus fuentes autorizadas. Las mutaciones profesionales además exigen PSI. Las respuestas de escritura también forman parte del contrato de privacidad.

| Ruta actual | Lectura/escritura y salida real | Frontera objetivo y estado |
| --- | --- | --- |
| `GET /patients`, `GET /patients/:id` | PAC propio/PSI; ficha por `mapPatientRow`, entrevista, tareas, objetivos; notas solo PSI. | Pendiente: episodio, participante, audiencia y autoría. #25 integrado: omisiones profesionales, también sin actor. |
| `POST /patients` | Alta unilateral denegada por AB-23 antes de DB. | Conservar bloqueo; no usar para crear nuevos tratamientos. |
| `PUT /patients/:id` | Solo PSI: `riskLevel,status,notes,reasonForConsultation`; devuelve ficha releída por actor. Identidad rechazada. | Datos clínicos del episodio, sin escritura global que afecte otros. |
| `DELETE /patients/:id` | Registro accesible se conserva con error 409; ajeno/inexistente sin éxito. | No convertir en purga de demo ni cierre de cuenta D18. |
| `PUT /patients/:id/interview` | PAC primera escritura, PSI primera/edición; devuelve ficha por actor. No hay envío, borrador ni validación de activación diferenciados. | Nuevo contrato de admisión separado; no reinterpretar guardar legacy como validar. |
| `POST /patients/:id/tasks`, `PATCH /patients/:id/tasks/:taskId` | PSI crea/edita; PAC solo `completed`. Devuelven `mapTaskRow` por actor. | Tarea y realización por destinatario/episodio; #25 protege objetivo de nota en PATCH. |
| `POST /patients/:id/objectives`, `PATCH /patients/:id/objectives/:objectiveId` | Solo PSI tanto controlador como servicio; devuelve objeto checklist. PAC lee objetivos/progreso. | #26 integrado; mantener `kind` y estados actuales, sin autoevaluación PAC. |
| `DELETE /patients/:id/tasks/:taskId`, `DELETE /patients/:id/objectives/:objectiveId` | Solo PSI, retiro lógico; salida sin objeto clínico; filas conservadas. | Retiro por episodio sin borrar historia ni avances ajenos. |
| `POST /patients/:id/clinical-notes`, `PATCH /patients/:id/clinical-notes/:clinicalNoteId` | Solo PSI; devuelve nota. `tasks` en payload sincroniza checklist; no sale dentro de nota. | Autoría/estado final pendientes #35; sincronización es escritor que también debe aislarse. |
| `DELETE /patients/:id/clinical-notes/:clinicalNoteId` | Solo PSI; conservación con 409 para registro accesible. | No usar para D13 ni para adendas. |
| `GET /patients/:id/follow-up` | Consultas completadas y tareas propias, histórico sin asociación aparte; sin nota profesional. | #27 integrado; futuro filtrar episodio/participante antes de agrupar. |
| `GET /appointments`, `GET /appointments/:id` | PAC propio/PSI; mismo mapper de cita. | Pendiente: episodio, sesión individual/conjunta y destinatarios. |
| `POST /appointments`, `PATCH /appointments/:id` | Solo PSI; cita o serie actualizada. Edición recurrente produce varias citas. | Cubrir cada resultado, ancla y serie; no ampliar por `patientId` común. |
| `DELETE /appointments/:id`, `DELETE /appointments/:id/recurrence` | Solo PSI; preservación 409; cancelación se hace por PATCH. | Conservar integridad, cancelación no transfiere ni borra historia. |
| `GET /appointments/waitlist` | PAC propio/PSI; filas activas, incluido texto de espera. | Audiencia operativa explícita, no reutilizar observación profesional como texto público. |
| `POST /appointments/waitlist`, `PATCH /appointments/waitlist/reorder`, `DELETE /appointments/waitlist/:id` | Solo PSI; creación/reorden devuelven filas; retiro conserva registro. | Revisar ranking y efectos laterales por agenda/episodio autorizado. |
| `GET/PUT /availability/me`; `GET /availability/me/exceptions`; `PUT/DELETE /availability/me/exceptions/:date`; `POST/PUT/DELETE /availability/me/exceptions/range` | Solo PSI propio; bloques, excepciones/rangos; errores de cobertura pueden incluir fechas/horas de citas. | Agenda profesional propia; no ampliar a pacientes ajenos por JOIN legacy o mensajes de error. |
| `GET /reminders/me` | PAC/PSI; listas calculadas desde tareas/citas autorizadas; sin escritura HTTP. | Aplicar audiencia antes de contar, priorizar o generar títulos. |

Lectores indirectos: [rutas auth](../backend/src/modules/auth/auth.routes.js), `GET /auth/me`, `/auth/identity`, `/auth/care-relationships`, `/auth/users`, `/auth/audit-logs`. Identidad: PATCH propio de nombres; contactos solo flujo C (`GET/POST /auth/contact-changes`, `POST /auth/contact-changes/:requestId/:operation`); verificación POST por canal. Los DTO de cuenta/identidad no conceden expediente. Las cinco mutaciones AB-23 siguen bloqueadas según el [inventario canónico](stage2a-legacy-mutations.md); las administrativas también conservan sus denegaciones.

### Ficha, entrevista y derivados clínicos

Salvo excepción explícita, la ficha se lee por los dos GET de patients y se devuelve tras PUT de ficha/entrevista. El servicio usa `patientSelectColumns`/`mapPatientRow`/`mapInterviewRow`. Alcance **actual por paciente**, objetivo **por episodio y participante** para todo contenido clínico. Los campos de identidad permanecen globales, con proyección mínima para cada finalidad.

| Campos | Origen, registrador y recurso | Visibilidad actual y escritura | Objetivo, regla y riesgo acotado |
| --- | --- | --- | --- |
| `id,firstName,lastName,fullName` | `patients`: ID generado; nombre propio PAC en B; legacy sin autor por campo. | PAC propio y PSI; nombres por identidad propia, no PUT clínico. | Identidad global RN-15/17/43; coincidencia de ID no autoriza otros episodios. |
| `email,phone` | `patients`, espejos de contacto actual administrados por PAC/C. | PAC/PSI leen en ficha; cambio solo C. | Mínimo necesario según propósito RN-17; archivo propio no concede automáticamente contactos actuales. Detalle pendiente D06. |
| `age` | `patients.age`, nullable legacy; no DOB calculada. | PAC/PSI; no escritura por PUT clínico. | No inferir DOB, edad actual ni atribución histórica RN-43. |
| `status` | `patients.status`, PSI puede editar. | PAC/PSI; PUT PSI. | Contexto por episodio RN-21/25; estados del paciente legacy no equivalen a ciclo de episodio. |
| `reasonForConsultation` | `patients.reason_for_consultation`, edición PSI; procedencia histórica mixta. | PAC/PSI; PUT PSI. | Separar declaración propia y formulación PSI por registro/finalidad D01–D03/RN-25; sin retirada masiva ni fuga confirmada. |
| `notes,riskLevel` | `patients.notes,risk_level`, contexto/valoración PSI o default legacy. | Solo PSI; PUT PSI. Omitidos para PAC, no `null`. | #25 integrado. RN-25 exige riesgo nuevo NO EVALUADO por episodio; `none` legacy no prueba evaluación. |
| `lastClinicalNoteDate` | `patients.last_clinical_note_date`, MAX de fecha de notas del paciente. | PAC/PSI; actualizado internamente al guardar nota. | D04/RN-67: derivar solo de sesiones autorizadas, sin revelar actividad privada del otro. |
| `interviewCompleted` | EXISTS `patient_intakes` por paciente. | PAC/PSI; no escritura directa. | No validación clínica, envío explícito ni activación RN-59. Futuro estado solo del propio formulario. |
| `interview.birthDate` | `patient_intakes.birth_date`; registrador PAC o PSI. | PAC/PSI; PUT entrevista con reglas de primera escritura. | Dato clínico de entrevista propia, separado de DOB global de B/RN-43. |
| `birthPlace,occupation,hobbies,maritalStatus,familyMembers,livesWith,physicalIllnesses` dentro de `interview` | Columnas homónimas snake_case de `patient_intakes`; texto PAC/PSI registrador. Familia/convivencia pueden referirse a terceros. | PAC/PSI; PUT entrevista. | Respuesta propia por participante/episodio RN-25/67; aportación y valoración separadas. Terceros sin publicación automática. |
| `insomnia,nightmares,fearsOrPhobias,accidents,alcoholUse,tobaccoUse,drugUse,psychologicalAbuse,physicalAbuse,deathWish,suicideAttempts` | Columnas booleanas homónimas snake_case de `patient_intakes`; PAC/PSI registra; mapper convierte a Boolean. | PAC/PSI; PUT entrevista. | Privados del participante y profesional bajo permiso; no diagnóstico, scoring o aviso externo automático. Ausencia normalizada a false hoy no define respuesta negativa en plantilla futura. |
| `interview.completedAt,createdAt,updatedAt` | `completed_at` preserva primera fecha; DB crea/actualiza timestamps. | PAC/PSI; derivados de guardar. | D02/D04: solo audiencia del documento; no `validatedAt`, versión ni evidencia de suficiencia. |
| Autoría de entrevista no expuesta | `completed_by_user_id` inicial con COALESCE, `updated_by_user_id` último registrador. | Persistidas por servicio; no salen en `mapInterviewRow`. | Conservar procedencia; no atribuir todas las respuestas al PAC ni inventar autor histórico. Plantilla/modalidad/versionado nuevos pendientes. |

### Tareas, objetivos, notas y conservación

| Campos | Origen, autor y recurso | Visibilidad/operaciones actuales | Objetivo y estado |
| --- | --- | --- | --- |
| Checklist `id,text,completed` | `patient_tasks`, `kind=task/objective`; PSI redacta, PAC/PSI marca tareas, solo PSI objetivos. No hay autor/destinatario explícito por fila. | GET ficha y POST/PATCH checklist; PAC no edita texto, objetivos solo PSI. | RN-26/67/72: por episodio/audiencia, sin cruces. #26 implementado; tarea conjunta necesita realización independiente D05. |
| `clinicalNoteId,clinicalNoteDate` | `clinical_note_id` y JOIN fecha de nota; referencia/derivado, no texto PSI. | En tareas PAC/PSI; POST/PATCH según mapper. | Mismo episodio y destinatario, no lectura de nota por poseer ID; D04. |
| `clinicalNoteObjective` | JOIN `patient_clinical_notes.clinical_note_objective`. | Solo PSI; omitido PAC también en PATCH, #25. | Mantener omisión recursiva; nunca usarlo como título público de tarea. |
| Forma de objetivos | SQL agregado `id,text,completed`, pero pasa por `mapTaskRow`. | También incluye referencias `null` y objetivo PSI vacío; UI de objetivos retiene solo tres campos. | No afirmar que UI representa todo el JSON; contrato nuevo usa allowlist por recurso/actor. |
| Retiro y atribución checklist | `retired_at,created_at,updated_at`; 003 añade `episode_id,episode_scope_id` opcional/generado. | No salen en DTO; retiradas excluidas. Escritores actuales no atribuyen episodio. | No inferir creador desde timestamps; retiro conserva historia. Interacción autor/nota/tareas en #35. |
| Nota `id,appointmentId,clinicalNoteDate,noteFormat` | `patient_clinical_notes`: ID, cita fija, fecha de cita, formato PSI simple/soap. | GET ficha PSI, POST/PATCH nota PSI. PAC `clinicalNotes:[]`. | RN-12/23: cita completada no futura, sin reasignación; futuro episodio y autor propios. |
| Nota `clinicalNoteObjective,clinicalObservations,nextSteps,content` | Columnas homónimas snake_case/texto profesional. | Solo PSI; POST/PATCH por alcance paciente; todavía edita original sin exigir autor en predicado. | RN-23/24/67: privado, borrador propio editable, final inmutable y adenda propia. Brecha funcional contra objetivo, no nueva exposición demostrada. |
| Nota `createdAt,updatedAt`; autor no expuesto | DB timestamps; `created_by_user_id=actor.id` al crear, nullable histórico. | Timestamps salen; autor no en mapper. No hay `state,finalizedAt,addenda` en DTO actual. | Fecha de actualización/historia no finalización. Autoría no se infiere de lector ni se corrige automáticamente. |
| `clinical_record_history` | 001: `id,table_name,record_id,patient_id,previous_record,recorded_at`; copia de fila previa. | Append-only donde 001 esté instalada; sin endpoint clínico de historia ni lector BO por auditoría. | Conserva evidencia, no inmutabilidad del original final ni autoría completa de cada corrección. No copiar nuevos secretos a historia genérica por comodidad. |
| `clinical_episodes` y referencias 003 | ID/paciente/PSI/rol/estado/fechas; índice un active/paused por paciente; FK opcionales de cita/nota/tarea/espera. | Sin autorización/API clínica por episodio; entrevista no segmentada por 003. | RN-62–73 requiere sucesora/participantes, nunca editar 001–007/hashes ni quitar solo índice. Demo regenerable RN-28. |

### Agenda, seguimiento, recordatorios y lectores laterales

| Campos | Origen/autor y recurso | Exposición actual | Objetivo/regla y riesgo de expansión |
| --- | --- | --- | --- |
| Cita `id,patientId,scheduledDate,scheduledTime,recurrenceGroupId,status,notes` | `appointments`, PSI escribe agenda/texto, sin autor de fila explícito; fechas normalizadas. | PAC propio/PSI; GET/POST/PATCH cita/serie. | Sesión individual/conjunta y destinatarios D04/RN-67/70. `notes` es texto visible actualmente, distinto de `patients.notes`; separar logística destinada y observación privada en registros diferentes. |
| `hasLinkedClinicalNote,status` | EXISTS nota por cita; mapper fuerza completed si hay nota. | PAC/PSI; salida de cita también al escribir. | Metadatos solo de sesión autorizada, sin publicar existencia de nota privada ajena. Conservar integridad cita↔nota. |
| `waitlistCount` | COUNT de espera activa mismo horario y JOIN acceso PSI legacy. | PSI conteo acotado; PAC recibe 0 constante. | Contar después de autorización de agenda/episodio; no es conteo global visible al PAC. |
| Espera `id,patientId,patientName,scheduledDate,scheduledTime,priorityPosition,notes,status,createdAt` | `appointment_waitlist_entries`, JOIN nombre `patients`, PSI registra/reordena; timestamp DB. | PAC propio/PSI en GET; POST/reorder PSI devuelven filas. | Texto destinado y metadatos de agenda autorizada; ranking/normalización actual por horario sin profesional, fulfillment por paciente/horario. Revisar efectos y contadores antes de ampliar; no se reprodujo filtración. |
| Seguimiento `consultations[].id,scheduledDate,scheduledTime,status,tasks`; `unassignedTasks` | `patients.follow-up.js`: citas completed; tarea por nota+cita del mismo paciente, sin inferir por fecha. Tareas con `id,text,completed`. | PAC/PSI en GET follow-up; independiente del DTO de nota. | #27 integrado. Futuro filtros episodio/participante antes de JOIN/agrupación; no exponer notas para completar cronología. |
| Recordatorio `id,type,priority,title,description,date,time,patientId,action` | Mappers de reminders: ID cita o resumen por paciente, distancia de fecha/nombre/cantidad de tareas. | GET propio PAC/PSI; sin mutación ni texto de nota. PSI usa riesgo high o ≥3 tareas para prioridad; PAC solo cantidad. | D04/D16: no inferencia por conteo/título/prioridad del otro. PSI JOIN legacy, PAC por patientId hoy; futuro derivar solo de fuentes autorizadas. |
| Disponibilidad `weekday,blocks[].id/startTime/endTime`; excepciones `date,isUnavailable,blocks`; rangos `startDate,endDate,deletedDates` | Tablas de disponibilidad/excepciones, PSI propio registra. | Solo PSI propio en rutas me; no pacientes en DTO ordinario. | Agenda profesional no es expediente global. Guardas de cobertura JOIN legacy y error con fechas/horas deben limitarse a citas propias autorizadas. |
| Alias y UI: `sessionId,sessionDate,sessionObjective`, `ultimaSesion,riesgo,objetivoSesion`, porcentajes, próxima cita | Mappers admiten alias; UI deriva datos ya recibidos. Fallback de riesgo ausente a «sin riesgo». | No crean datos nuevos en API ni validación profesional. | No confundir omisión con «sin riesgo», vacío con autorización ni porcentaje con evaluación. Probar alias/ausencia/null, sin habilitar acceso desde UI. |
| Vínculo operativo y `notes,inviteExpiresAt` | `care_relationships` + cuenta/paciente/PSI; origen de texto legacy mixto. | Partes leen propios; BO tiene básicos/estado, omite notes/expiración. Mutaciones nuevas bloqueadas. | RN-27/36/57: consulta operativa no clínica. Mensaje nuevo separado de motivo, nota y auditoría; vínculo global nunca permiso de otros episodios. |
| Cuenta/identidad propia y auditoría BO | `users,patients,contact_verification_state,audit_logs`; actor autenticado/DB. | `/me`, identidad y verificación propias; BO allowlist de eventos administrativos sin clínicos; no versiones/secretos de sesión en listado operativo. | #7/B/C integrados. Conservar proyecciones operativas, sin crear rol conciliador o ARCO con clínica global. |

### Matriz objetivo por episodio, participante y documento

Esta matriz describe producto aprobado **pendiente de implementación**. La autenticación/estado vigente se comprueba además del rol. La relación global PAC–PSI, el mismo profesional en un nuevo episodio, el parentesco o la publicación en directorio no amplían alcance. Audiencia por **registro/documento entero**; texto privado no se mezcla con material publicado. La selección de campos del DTO sigue siendo obligatoria dentro del recurso autorizado.

| Actor/contexto | Información individual del participante | Documentación profesional | Contenido destinado/compartido | Escritura objetivo |
| --- | --- | --- | --- | --- |
| PAC de episodio individual | Borrador autoadministrado propio y respuestas propias enviadas/históricas; documentos propios. | Sin publicación automática de valoración, riesgo o notas; ARCO separado. | Sus citas/actividades/materiales autorizados. | Borrador y envío propios; marca su tarea, no texto profesional ni objetivos. Correcciones enviadas con trazabilidad, flujo específico pendiente. |
| Integrante A de pareja | Entrevista/aportación privada propia; no entrevista, tarea privada ni metadatos de sesión individual B. | Sin notas/revelaciones profesionales automáticas, aunque se refieran a A. | Documentos destinados a A; conjunto destinado a ambos. | Solo su respuesta y realización; no marcar B ni determinar objetivos. |
| Integrante B de pareja | Simétrico a A; participación conjunta no cambia privacidad individual. | Igual a A. | Individual B y conjunto para ambos. | Simétrico; compartir tarea no implica conocer marca individual A. |
| PSI responsable activo, dentro del episodio | Entrevistas **enviadas** y documentación dirigida bajo permiso aplicable; jamás borrador privado PAC. | Lee expediente profesional propio; registra valoraciones y notas propias. | Prepara material con audiencia explícita y confirma confidencialidad; autorizaciones de publicación según origen/propósito. | Edita borrador propio, finaliza, adenda propia; evalúa objetivos. No suplanta PAC ni edita otro episodio por identidad compartida. |
| PSI de admisión limitada, todavía sin tratamiento activo | Solo envío/participante asignado y documentación de su consulta dirigida con consentimientos aplicables. | Su documentación de admisión, no archivo clínico global ni episodios anteriores. | Información mínima destinada para esa admisión. | Documentar/revisar/validar entrevista asignada; no activar por guardar ni generar tareas/citas ordinarias por ese permiso. |
| PSI histórico de episodio finalizado | Archivo clínico completo de sus episodios: entrevista enviada/documentada y contexto, no borrador privado nunca recibido. | Lee originales/versiones de su expediente sin gestión actual. | Consulta material de su episodio; no lo republica por nueva vinculación. | Solo adenda propia con autor/fecha/motivo RN-23; sin edición ordinaria, nueva cita ni acceso a contactos actuales por inferencia. |
| PSI responsable de episodio pausado | Conserva alcance de su episodio; nunca otros tratamientos. | Pausa no reasigna autoría; archivo y obligaciones se conservan. | Mismos destinatarios, sin publicación automática. | No citas nuevas RN-21. Detalle de documentación durante pausa queda en contrato 2B; no asumir modo de escritura ilimitado. |
| Profesional ajeno o mismo PSI en episodio nuevo | Nada del episodio anterior automáticamente. | Ningún expediente/notas por coincidencia. | Solo contenido específico autorizado y vigente con propósito/versiones, en flujo 2C/controlado aplicable. | Nunca edición de registro ajeno ni consentimiento heredado. |
| support | Sin clínica global ordinaria, entrevistas ni exportaciones. | Sin lectura/escritura clínica. | Solo operativa limitada ya autorizada. | Lector operativo; no publica, admite ni valida clínica. |
| admin/superadmin | Sin clínica global ordinaria ni acceso maestro. | Sin lectura/escritura clínica. | Gestión administrativa autorizada, DTO operativo mínimo. | No vinculación unilateral ni clínica por baja/suspensión/ARCO. Procedimientos asistidos no anulan RN-27. |

**Notas propias y archivo (#35):** autoría original no cambia al editar una identidad o abrir otro episodio. Borrador propio se edita con trazabilidad; finalización es acto explícito, original final inmutable, corrección solo por adenda vinculada de su autor con fecha/motivo. Compartir nota no comparte adenda posterior: requiere nueva autorización RN-23/2C. Conservar cita completada/no futura, asociación fija, historial y bloqueo de borrado. La implementación actual edita original y no comprueba autor de nota: no afirmar que #35 está entregado. Cierre con borradores sigue pendiente, sin auto-finalizar ni conceder edición general al histórico.

**Contenido conjunto:** entrevistas individuales y revelaciones permanecen privadas del otro integrante. Instrucciones de tarea conjunta pueden destinarse a ambos; realizaciones son independientes y no autorizan vista recíproca hasta concretar esa audiencia. Objetivos los determina exclusivamente PSI. Sesiones conjuntas se ven solo por destinatarios; una sesión individual no genera título, fecha, contador o aviso para el otro. Publicar un documento con datos inicialmente privados requiere la autorización y revisión clínica/jurídica aplicables; no se presume doble clic de ambos para cualquier tarea ni autorización universal por aceptar tratamiento. No automatizar excepciones o revelaciones; ARCO no se resuelve mediante la visibilidad del portal.

### Barrera de activación y pruebas del siguiente PR de código

No habilitar nuevos tratamientos mientras cualquier lector/escritor pueda usar `buildPatientAccessScope` por paciente o JOIN a `psychologist_patient_access` para saltarse alcance de episodio/participante/audiencia. Abarca patients, sincronización nota→tareas, citas/series, espera/ranking, disponibilidad/cobertura/errores, seguimiento, recordatorios, agregados y respuestas de escritura. Mantener AB-23 hasta corte coordinado; no retirar fallback parcialmente. [Orden y bloqueos reales](product/roadmap.md#consolidación-2a--dependencias-y-entregas-acotadas).

Plan mínimo de DTO **propuesto**, no nombres/endpoints aprobados: proyección de identidad propia; entrevista propia/borrador; envío recibido por PSI; documentación profesional; actividad destinada por participante; agenda/seguimiento autorizado; operativa BO. Cada salida usa allowlist y cada escritura autoriza recurso, episodio, participante, audiencia y autor/estado pertinentes antes de operar; releer resultado con la misma proyección. Un DTO restringido no sustituye autorización. No devolver campos prohibidos como null/vacíos ni por alias; `clinicalNotes:[]` actual se conserva como garantía histórica, no como permiso para futuros campos profesionales.

Pruebas exigibles a la **implementación posterior autorizada**, con fixtures ficticios en destino nuevo aislado ADR-019:

| Escenario | Resultado exigible |
| --- | --- |
| Dos individuales y una pareja del mismo PAC; también mismo PSI en episodios distintos | GET lista/detalle y POST/PUT/PATCH no cruzan datos, referencias, metadatos ni efectos. Identidad global no abre historia. |
| Matriz completa por rol, participante, episodio, audiencia y estado | IDs/body/rol inyectados no amplían permiso; ausente/ajeno sin revelar tratamientos. Revalidar sesión/aprobación y denegaciones BO. |
| JSON completo y anidado en lecturas y respuestas de escritura | Comparación recursiva de omisiones profesionales, nulos/ausencia/alias, arrays/agregados; regresión #25/#26/#27, sin usar UI como prueba de no exposición. |
| Pareja: sesión individual, conjunta y tarea compartida | Ningún título/fecha/conteo/error revela sesión privada B a A; marcas independientes y objetivos solo PSI, sin afectar avance del otro. |
| Autoadministrada y dirigida | Borrador nunca PSI; envío no activa; dirigida solo admisión consentida; ambos necesitan validación atribuida a versión/episodio y backend/DB; pareja necesita ambas. |
| Plantilla modificada y corrección posterior | Preguntas/opciones/versión enviada intactas; no validación de versión obsoleta ni sustitución de autor. |
| Finalización/adendas e historia propia | Original final no cambia por API/DB; solo autor adenda incluso cerrado; otro episodio/PSI no edita ni hereda publicaciones. |
| Rutas laterales y corte legacy | Todos los lectores/escritores/derivados anteriores sin bypass; las cinco mutaciones AB-23 no reabren acceso; sucesora mantiene SQL/hashes históricos. |

No se han ejecutado esas pruebas funcionales en este encargo documental. No hay nueva filtración confirmada: se han identificado diferencias de diseño y riesgos de ampliar el runtime sin aislamiento, conservando las protecciones existentes.
