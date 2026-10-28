# Mi seguimiento: consultas y tareas del paciente — Issue #21

Implementación autorizada por el propietario para [Issue #21](https://github.com/japh113/plataformaPsicologia/issues/21), desde main `af72a381f4b3a5a0e81df104baecb60226025a11` (#26 integrado). Rama `feat/patient-followup-timeline`; entrega mediante Draft PR, sin merge, auto-merge, despliegue ni migraciones sobre entornos habituales. El encargo sustituye la advertencia histórica «no iniciar» del issue para este alcance concreto.

Se conservan los contratos de [privacidad #25](patient-response-privacy.md) y [objetivos #26](objective-completion-authorization.md), RN-24/RN-27/RN-72 y la autorización legacy. No se implementan episodios ni publicación clínica.

## Contrato de lectura

`GET /api/patients/:id/follow-up`, con Bearer JWT y los middleware existentes `authenticate` / `authorizeClinical`. El [lector independiente](../backend/src/modules/patients/patients.follow-up.js) aplica `buildPatientAccessScope` también en servicio: paciente solo por su `patientId`; psicólogo por relación activa O acceso heredado, sin ampliar ese alcance.

| Actor / recurso | Resultado |
| --- | --- |
| Paciente, expediente propio | 200, proyección mínima |
| Paciente, expediente ajeno o inexistente | 404 |
| Psicólogo autorizado | 200, misma proyección mínima |
| Psicólogo ajeno | 404 |
| Admin, superadmin, support | 403 |
| Sin autenticación | 401 |

Listas explícitas de propiedades permitidas:

- `data`: `consultations`, `unassignedTasks`.
- Consulta: `id`, `scheduledDate`, `scheduledTime`, `status`, `tasks`.
- Tarea, en cualquiera de ambas colecciones: `id`, `text`, `completed`.
- Envoltura estándar: `success`, `message`, `data`.

No se seleccionan textos de notas profesionales, contexto, riesgo, objetivos internos, observaciones, próximos pasos, notas libres de citas, autoría ni timestamps administrativos. Tampoco se devuelven IDs/fechas de notas. No se reutiliza el DTO profesional ni se envía contenido reservado para ocultarlo en React. El lector de agenda existente y sus campos no se reclasifican en este issue.

Ejemplo completo ficticio del escenario inicial:

```json
{
  "success": true,
  "message": "Patient follow-up fetched successfully",
  "data": {
    "consultations": [
      {
        "id": "3",
        "scheduledDate": "2026-04-08",
        "scheduledTime": "11:00:00",
        "status": "completed",
        "tasks": [{ "id": "3", "text": "Fictional April 8 task", "completed": false }]
      },
      {
        "id": "2",
        "scheduledDate": "2026-04-05",
        "scheduledTime": "10:00:00",
        "status": "completed",
        "tasks": []
      },
      {
        "id": "1",
        "scheduledDate": "2026-04-01",
        "scheduledTime": "09:00:00",
        "status": "completed",
        "tasks": [
          { "id": "1", "text": "Fictional April 1 task A", "completed": false },
          { "id": "2", "text": "Fictional April 1 task B", "completed": true }
        ]
      }
    ],
    "unassignedTasks": [{ "id": "4", "text": "Fictional historical task", "completed": false }]
  }
}
```

## Asociación, orden y fechas

Una consulta es una fila real de `appointments` con estado `completed`, exista o no una nota o tarea. Pendientes, canceladas e inasistencias quedan fuera. Orden: fecha descendente, hora descendente e ID descendente como desempate; dos citas del mismo día conservan entradas distintas.

Una tarea solo se agrupa cuando `patient_tasks.clinical_note_id` identifica una nota del mismo paciente y su `appointment_id` identifica una cita completada del mismo paciente. La cadena se verifica mediante JOIN con igualdad de paciente en ambos pasos. No se comparan fechas para crear vínculos. En ausencia de nota/cita verificable, la tarea se conserva en `unassignedTasks`. Solo se incluyen tareas vigentes de tipo `task`; se excluyen objetivos y retiros lógicos. Cada tarea aparece una vez. Su orden es `created_at ASC, id ASC`, incluso cuando coinciden timestamps.

La fecha y hora proceden de la cita, nunca de la nota, tarea ni fecha administrativa. PostgreSQL convierte `DATE` a texto civil `YYYY-MM-DD`; la interfaz construye la fecha por componentes locales, sin parsear ese texto como UTC. No cambia la zona general ni reinterpreta el histórico.

## Interfaz y actualizaciones

La pestaña del paciente es «Mi seguimiento». El [componente específico](../frontend/src/components/PatientFollowUp.jsx) presenta «Consulta realizada», «Sin tareas asignadas», «Todavía no tienes consultas realizadas» y «Tareas sin consulta identificada». Esta última sección sigue visible aunque no haya consultas completadas.

El [mapper](../frontend/src/mappers/patients.js) mantiene referencias de tareas por consulta separadas de las notas profesionales. El [helper compartido](../frontend/src/utils/patientFollowUp.js) resuelve esas referencias contra el estado actual de las tareas: completar/desmarcar actualiza tanto cronología como tablero sin duplicar estado de cumplimiento. La carga y recarga del expediente del paciente obtienen el lector mínimo; guardar la entrevista conserva esa proyección.

El tablero usa las mismas consultas y agrupaciones, muestra consultas sin tareas y deja de titular grupos por objetivos profesionales. Se conserva el requisito previo de seleccionar expediente para completar tareas desde el tablero. La cronología ya tiene ese expediente seleccionado. No se introduce otro flujo de selección.

La vista profesional conserva sus notas, contenido, vinculación a cita, creación, edición y tareas. El paciente sigue consultando objetivos/progreso sin controles ni permiso de escritura; las tareas continúan interactivas. No se añaden escalas, porcentajes ni estados clínicos.

## Pruebas y reproducción

Solo datos ficticios, Docker Desktop/Ubuntu WSL, PostgreSQL 17 tmpfs nuevo, sin puertos DB, con red privada, proyectos UUID verificados y limpieza restringida a recursos propios. Sin instalar herramientas en host, operar Compose habitual ni ejecutar upgrades sobre datos existentes.

Desde la raíz, exclusivamente en el contexto de pruebas aisladas autorizado:

```bash
bash scripts/clinical-episodes.sh test
bash scripts/clinical-episodes.sh patient-follow-up-demo
python3 scripts/run-follow-up-ui-review.py UUID_NUEVO_DE_LA_DEMO
bash scripts/clinical-episodes.sh cleanup UUID_NUEVO_DE_LA_DEMO
```

El modo test ejecuta episodios, unitarias backend, integración, unitarias frontend, lint y build. El recorrido Chromium usa su propia imagen etiquetada, sin reutilizar un navegador habitual. El fixture de demo pasa las guardas de cluster nuevo y base vacía antes de instalar baseline/sucesoras únicamente allí; no despliega migraciones.

[Integración HTTP/PostgreSQL](../backend/test/patient-follow-up.integration.test.js), [unitarias backend](../backend/test/patient-follow-up.test.js), [frontend](../frontend/test/patient-follow-up.test.js) y [Chromium](../scripts/follow-up-ui-review.cjs) cubren:

| Caso | Evidencia |
| --- | --- |
| 8/5/1 abril, 1/0/2 tareas | JSON completo esperado y tres entradas visibles en Chromium |
| Consulta sin nota; nota sin tareas | 5 abril de P sin nota; Q con nota sin tareas |
| Vínculo cierto y tareas antiguas | Cadena comprobada; tarea histórica separada y editable |
| Vínculos faltantes, ajenos o a cita no completada | SQL real sobre copias TEMP locales; se agrupan aparte, sin tocar filas persistentes |
| Coincidencia de fecha sin pertenencia | Tarea de 8 abril apuntando a nota ajena de 8 abril queda sin consulta |
| Dos consultas del mismo día | Q, 8 abril a 15:00 y 08:00, entradas distintas sin tareas |
| Pendiente/cancelada/inasistencia | No aparecen entre las tres consultas realizadas de P |
| Vacío e histórico sin consultas | R vacío; S con tarea histórica; mensajes y sección correctos |
| Completar/desmarcar | HTTP, persistencia y UI; callback real conserva grupos; móvil también interactivo |
| Aislamiento y roles | A/B, IDs ajenos/inexistentes, psicólogos ajenos, administrativos y falta de JWT |
| Privacidad completa | Igualdad del envelope/DTO esperado; inspección recursiva y marcadores ficticios privados ausentes |
| Regresión profesional | Lectura privada preservada, edición de tarea; Chromium crea/edita nota en cita elegible |
| Objetivos | Paciente 403 sin escritura; profesional autorizado conserva escritura; UI paciente sin controles |
| Fechas estables | Formato frontend en cuatro zonas; SQL real en tres zonas, sin desplazamiento |

Los vínculos legacy deliberadamente inválidos se fabrican solo en copias temporales sin restricciones, dentro de una transacción que se revierte. Las tablas persistentes y sus restricciones permanecen intactas; 003 sigue rechazando enlaces cruzados nuevos. Esta prueba valida el lector defensivo, no autoriza reparar ni reclasificar datos antiguos. Las validaciones existentes de escritura de tareas se conservan.

## Evidencia inicial — HEAD auditado ec5482c

Resultados locales de 28 de octubre de 2026; no son resultados de GitHub Actions.

Código funcional: `26103f9d89a01c9c7a85078102be3d5201915d63`; pruebas/arnés: `5a2c7e51aa12e71313c7dc3ceece9fb87c7465b0`. Las ejecuciones probaron esos contenidos antes de los commits; la documentación posterior no altera código funcional.

| Ejecución local nueva | Resultado |
| --- | --- |
| Matriz final `d73c12bd-e426-4b00-afa4-46f89d4f6272` | 17/17 episodios, 105/105 unitarias backend, 133/133 integración HTTP/PostgreSQL, 8/8 frontend; lint/build aprobados; cero fallidas/canceladas/omitidas |
| Demo final `b0c07376-aeb4-44a4-b67d-e46755930723` | 8/8 unitarias frontend, lint/build y seis recorridos Chromium aprobados, incluidos completar/desmarcar histórico en móvil; cero errores de página o API HTTP >=400 |
| Demo anterior `6da3a873-e18a-4e41-afa2-a08ee74be3af` | Seis recorridos aprobados antes de reforzar la interacción móvil |
| Entorno | Docker Desktop 29.8.2, Ubuntu WSL, Node 24 y PostgreSQL 17; navegador Node 24.21.0, Playwright 1.64.0, Chromium 156.0.8078.4 |
| Regresiones #25/#26 | Suite HTTP de proyección/entrevista/tareas/objetivos incluida; JSON completo, denegaciones y persistencia conservados |
| Protección y documentación | SQL completo y 001–007/manifiesto/hashes, CI, lockfiles, auth, servicio profesional de pacientes y decisiones: 39 archivos idénticos byte a byte a la base; verificador offline de enlaces/IDs/UTF-8 y diff aprobado |

Todos los proyectos propios de matrices y demos fueron limpiados con comprobación de propiedad; no quedan contenedores/redes/imágenes de esas cinco ejecuciones. El wrapper comprobó etiquetas de imágenes preexistentes sin cambios. La imagen de cada navegador también fue eliminada solo tras verificar su etiqueta propia.

Incidencias registradas: el primer ensayo aprobó 17 episodios, 105 unitarias backend y 132 integración, pero falló lint por faltar el import explícito de `node:process` en la prueba de fechas; se corrigió. El primer recorrido Chromium pasó los escenarios de paciente pero comprobó el número de notas inmediatamente después del POST 201, antes del refresco React; se ajustó el arnés para esperar el cierre del modal y la tercera nota visible. Se repitió en otra demo nueva. La inspección visual de escritorio y móvil confirmó fechas, consulta sin tareas, histórico y presentación profesional; se reforzó además la interacción de la última tarea móvil.

Capturas y reportes locales quedan en `tmp/issue21` ignorado por Git; solo contienen fixtures ficticios, con credenciales enmascaradas. La reproducción queda versionada. No se publican logs crudos ni capturas como artifacts de Actions desde este arnés local.

## Recuperación ante fallos parciales — P2 del Draft PR #27

Corrección autorizada sobre el HEAD auditado `ec5482c430b70a9a368a0a1a35821ab06bcc46e7`, verificado contra el HEAD real del PR antes de editar. Se conserva el lector seguro, su DTO y su definición de consulta realizada. No se cambian backend funcional, JWT, permisos ni la matriz de CI.

### P2-01: resultado principal independiente

`cargarDatos` aplica los pacientes, agenda, recordatorios y relaciones obtenidos correctamente sin esperar el lector opcional. Cada expediente del paciente tiene estado local de seguimiento `loading`, `ready` o `error`, separado de su proyección. Un GET primario de detalle correcto también se aplica antes del refresco opcional. Los helpers API con `includeFollowUp` conservan el resultado principal ante fallo transitorio y propagan 401/403/404.

| Situación | Presentación y recuperación |
| --- | --- |
| Lectura correcta, sin consultas | «Todavía no tienes consultas realizadas» |
| Lectura correcta, con consultas | Cronología y grupos verificados existentes |
| Sin proyección, carga pendiente | «Actualizando seguimiento…», sin inventar lista vacía |
| Sin proyección, red/500 | «Seguimiento temporalmente no disponible», tareas propias en lista sin asociación inferida |
| Proyección anterior válida, actualización pendiente/fallida | Se conserva y se indica que está actualizando o que no se pudo actualizar |
| Reintento | Solo GET de seguimiento; conserva las demás secciones y no repite PUT ni carga general |

Un reintento correcto actualiza también las tareas del DTO mínimo, incluidas nuevas tareas y sus estados actuales. El botón «Reintentar seguimiento» está en tablero, resumen y cronología. Durante la petición queda deshabilitado. Sin proyección válida, el contador de consultas muestra «—»; las tareas propias siguen interactivas en una lista «Tus tareas», sin atribuirlas a consultas ni clasificarlas artificialmente como históricas. Con proyección anterior se conserva su agrupación, señalada como última información cargada.

### P2-02: entrevista confirmada y refresco independiente

Cuando el PUT confirma el guardado, `saveInterview` aplica inmediatamente el expediente y formulario de su respuesta, conserva el seguimiento del mismo paciente, muestra «Entrevista guardada correctamente» y devuelve `true` para cerrar el modal. El refresco opcional ocurre aparte. Un fallo de red/500 solo cambia el aviso de seguimiento, no la confirmación del guardado; no sugiere ni ejecuta un segundo PUT. Un rechazo real del PUT conserva el resultado `false` y el mensaje de error.

La proyección previa no se sustituye por una colección vacía inventada. Un reintento correcto elimina el aviso y actualiza la cronología sin perder la entrevista confirmada.

### Sesión y autorización

El cliente API existente mantiene su tratamiento de 401: elimina el token vigente y emite `psicopanel-session-ended`. No se cambió ese cliente ni el contrato JWT. Las respuestas opcionales se aplican solo si siguen vigentes el token, la generación de sesión y el intento más reciente para ese paciente. Cerrar sesión o iniciar otra invalida respuestas pendientes, incluso para el mismo ID.

403/404 del lector o de la lectura primaria de detalle no se tratan como fallos transitorios: se descartan expediente seleccionado, colección clínica, agenda, recordatorios y relaciones de ese acceso; se muestra denegación y no se usa la proyección anterior como acceso autorizado. Por seguridad, un 404 del lector se trata como pérdida de acceso/recurso; no se infiere que sea un problema temporal del servidor.

Si la entrevista fue confirmada y un refresco posterior obtiene 401, el resultado persistente del PUT sigue siendo éxito, mientras la sesión se invalida y la interfaz protegida desaparece. Un PUT rechazado por 401 no obtiene confirmación de guardado. No se reutilizan datos de una sesión/paciente anterior tras iniciar otra sesión.

### Pruebas específicas y límites conocidos

[Pruebas de recuperación](../frontend/test/patient-follow-up-recovery.test.js) ejecutan el código real de los helpers API, cliente HTTP, carga principal, refresco de detalle, reintento y callbacks de guardado/modal de App. Se simulan únicamente las respuestas y setters del entorno, no una reimplementación del flujo.

Nueve pruebas nuevas cubren red/500 y petición pendiente sin bloquear los datos principales; vacío correcto y reintento solo del lector; detalle con proyección previa; 403/404 con datos descartados; logout/cambio de sesión y respuestas fuera de orden; PUT confirmado con refresco correcto o fallido; modal cerrado, formulario actualizado, `true`, aviso separado y un solo PUT; PUT fallido con `false`; 401 y evento real de invalidación; actualización posterior consistente.

El [recorrido Chromium P2](../scripts/follow-up-recovery-ui-review.cjs) usa la app y backend ficticio reales, interceptando solo fallos específicos de red/HTTP. Comprueba navegación/agenda/tareas durante fallo, contadores de peticiones para demostrar el reintento aislado, PUT real confirmado y rechazado, cierre de modal y confirmación conservada, ausencia de segundo PUT, acceso denegado y sesión invalidada. El [arnés aislado](../scripts/run-follow-up-recovery-ui-review.py) ejecuta también los seis recorridos previos de paciente/profesional, sin incorporar ninguno a `ci/browser`.

La diferencia legacy observada se documenta mediante regresión mínima de [integración](../backend/test/patient-follow-up.integration.test.js): en copias TEMP, una cita con nota y estado almacenado `pending` aparece como `completed` en el lector de agenda existente, pero no entra en las consultas del seguimiento, que exige estado almacenado `completed`. Sus tareas quedan separadas en este último. La transacción se revierte y se comparan filas persistentes intactas. No se cambia la definición aprobada ni se reconcilian estados históricos; cualquier unificación requiere decisión posterior.

Cobertura CI: los recorridos de seguimiento inicial y P2 siguen siendo validación local reproducible; no forman parte de `ci/browser`. Es una observación no bloqueante, sin ampliar los siete checks ni sus artifacts de 14 días. El build emite un aviso no bloqueante por un chunk de aproximadamente 502 kB; no se amplía esta corrección a una reorganización del bundle.

Validación local nueva del 28 de octubre de 2026, separada de la evidencia inicial y de Actions:

- Código funcional: `987d3ac5f1590222d9176ded8d98f84c94a24ec3`; pruebas/arnés: `152d964a24fc12aeaf363b2c98926bd34fe09c1b`. Los contenidos se probaron antes de esos commits.
- Matriz nueva `aefdc82e-3f2e-463b-9e97-5ef645f2ff6e`: **105/105 unitarias backend, 17/17 episodios, 133/133 integración HTTP/PostgreSQL, 17/17 frontend**, lint/build aprobados; cero fallidas/canceladas/omitidas. Incluye privacidad #25, permisos #26, integridad y la observación legacy.
- Tras reforzar el refresco de las tareas actuales, demo final nueva `090211c0-b0a2-4403-9f8c-0250aceb661d`: **17/17 frontend**, lint/build y **11/11 escenarios Chromium** aprobados, seis previos y cinco P2. Cero errores de página o API inesperados; los fallos de red/500/401/403/404 inyectados están clasificados como esperados.
- La prueba de reintento incorpora tareas nuevas y estados actuales del DTO mínimo sin otra lectura del expediente; las demás secciones conservan sus referencias y contenido.
- Demos previas nuevas `1ac337cb-cafd-4e9a-b656-5a22e446ce63` y `799e9c21-817b-4ad9-b388-0e8ef3006850`: cinco P2 y once escenarios, respectivamente, aprobados. No hubo fallos de pruebas en esta corrección; se repitió frontend/Chromium tras el ajuste final del reintento. La matriz backend ya aprobada no se repitió después de ese ajuste exclusivamente frontend.
- Node 24/PostgreSQL 17 en Docker Desktop/Ubuntu WSL; navegador Node 24.21.0, Playwright 1.64.0 y Chromium 156.0.8078.4. Capturas ficticias enmascaradas inspeccionadas visualmente: indisponibilidad con tareas, guardado confirmado con aviso separado y proyección anterior preservada.
- **80 archivos protegidos idénticos byte a byte al HEAD auditado**: todo backend funcional, SQL/manifiesto/hashes, cliente API de sesión, lockfiles, decisiones y configuración CI. Verificación offline de Markdown/enlaces/IDs/UTF-8, diez pruebas del contrato de evidencia CI y `git diff --check` aprobados.
- Los cuatro proyectos propios nuevos de esta corrección fueron limpiados: tres demos y una matriz. También se limpiaron sus imágenes de navegador etiquetadas y se verificó que las etiquetas preexistentes no cambiaron. Evidencia local ignorada en `tmp/issue21-p2`; sin datos reales ni logs crudos publicados.

La matriz de siete checks de GitHub Actions se ejecuta al publicar los commits en el mismo Draft PR; su estado se informa aparte. No se atribuyen los resultados locales anteriores a Actions.

## Límites de entrega

Sin cambios a SQL 001–007, baseline/seed, manifiesto/hashes, autenticación/JWT, autorización legacy, proyecciones reservadas de #25, permisos de objetivos de #26, decisiones de producto, configuración CI/producción o administración de GitHub. Sin D3, nuevas vinculaciones, episodios paralelos, reconciliación histórica, proveedores ni despliegue.

La matriz de Actions conserva siete checks y artifacts técnicos de 14 días. Se inicia al abrir el Draft PR; sus resultados corresponden a esa ejecución, separados de la evidencia local anterior. Issue #21 permanece abierto mediante referencia, sin cláusula de cierre. La revisión independiente y la autorización de merge son posteriores.
