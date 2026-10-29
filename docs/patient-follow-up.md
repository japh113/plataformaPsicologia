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

## Concurrencia de lecturas, escrituras y sesiones — P2-A/B/C

Encargo focalizado sobre el HEAD auditado `69867d3d646f6c4e1c75504e70ded507c1c753b2`, verificado idéntico al remoto antes de editar. Las secciones anteriores conservan la evidencia de sus respectivos HEAD; los ensayos siguientes son nuevos. Sin cambios del lector, DTO, backend funcional, autorización ni decisiones de producto.

### Carreras y protección

| Hallazgo | Causa | Protección |
| --- | --- | --- |
| A1: GET retenido, PATCH 200, GET antiguo liberado | Solo se comparaban intentos GET; una escritura no invalidaba su snapshot | Revisión monotónica por paciente al iniciar y resolver PATCH; un GET con revisión anterior no aplica su DTO |
| A2: PATCH retenido, GET incorpora tarea y estado ready, PATCH liberado | El PATCH reconstruía todo el paciente desde la captura anterior al await | Actualización funcional de la tarea confirmada sobre ambos estados vigentes; conserva otras tareas, asociaciones y estado |
| B: carga principal retenida, seguimiento 403/404, carga liberada | El descarte no cambiaba una generación compartida con las otras operaciones | Generación de acceso clínico y estado denied, separados de la generación de sesión; todas las operaciones anteriores quedan invalidadas |
| C: PUT de P retenido, nueva sesión Q con modal abierto, PUT P confirmado | El consumidor interpretaba true como autorización para cerrar cualquier modal actual | El consumidor captura y comprueba la identidad vigente de la operación antes de cerrar su modal |

Las referencias de control viven solo durante la sesión de App: generación de sesión, generación/denegación de acceso, revisión por paciente y último intento de seguimiento. No se añade caché global, almacenamiento persistente, librerías ni campos de servidor.

En A, un GET iniciado mientras el PATCH está pendiente puede incorporar tareas nuevas antes de que este se confirme. La respuesta posterior del PATCH cambia únicamente su tarea y conserva el resto del estado ready. Si el GET termina después de la confirmación, su revisión ya no es aplicable. El fallo real del PATCH conserva las tareas y comunica error, sin éxito ficticio. Cuando se descarta la petición de seguimiento todavía activa, se conserva la proyección vigente y queda disponible el aviso/reintento existente, sin mantener un loading indefinido.

Los lectores de expediente/listado también capturan la revisión: un DTO anterior puede actualizar sus otros campos, pero conserva las actividades más recientes en lugar de borrar tareas nuevas o revertir su estado. Los guardados de campos no relacionados preservan la actividad vigente. Las modificaciones de tareas y objetivos usan actualizadores funcionales y no reconstruyen el expediente completo desde una captura anterior. Los permisos de objetivos permanecen intactos.

En B, `beginClinicalOperation` captura token y generaciones; los resultados, errores y limpiezas asíncronas comprueban su vigencia antes de aplicarse. La misma guarda cubre carga principal, detalle, seguimiento, refrescos de agenda/espera/recordatorios/relaciones y callbacks de escritura que puedan repoblar esos estados. El descarte central vacía las colecciones clínicas y formularios pertinentes y limpia sus flags; un finally antiguo no puede modificar los flags de una operación posterior. Una denegación de un GET todavía perteneciente al acceso vigente también invalida el acceso aunque exista otro GET más reciente.

403/404 no cierran la sesión global. La denegación permanece ante respuestas antiguas y ante errores de red/500 posteriores. El reintento ordinario de seguimiento y una carga automática no la levantan. El botón global «Reintentar» solicita una comprobación explícita: solo después de que las peticiones principales y, para el paciente, el seguimiento respondan correctamente, abre una generación nueva y vuelve al tablero autorizado. Si el probe falla, permanece bloqueado. Iniciar una sesión nueva vacía el estado y exige sus lecturas autenticadas propias. El tratamiento de 401 y revocación del cliente API existente se conserva.

En C, `saveInterview` sigue pudiendo devolver true cuando el servidor confirmó el PUT de P. Ese resultado no autoriza efectos en Q: el consumidor vuelve a comprobar la operación antes de cerrar el modal; formulario, avisos, estado de guardado y finally también quedan protegidos. Se prueban Q distinto y una nueva sesión del mismo paciente, incluso con la misma cadena de token. La entrevista confirmada de la sesión vigente conserva éxito/cierre aunque falle el refresco opcional; el rechazo del PUT mantiene el modal y su error real.

### Secuencias reproducibles

[Pruebas de concurrencia](../frontend/test/patient-follow-up-concurrency.test.js) y [arnés de App](../frontend/test/helpers/followUpAppHarness.js) ejecutan los callbacks reales extraídos del código vigente. El arnés conserva la captura de paciente de cada invocación, como un render de React; no sustituye las guardas ni reimplementa las operaciones. Las promesas se resuelven/rechazan explícitamente en el orden de cada prueba; las continuaciones asentadas se drenan mediante una barrera del bucle de eventos, sin umbrales temporales ni sleeps.

Trece pruebas nuevas cubren:

1. GET antiguo → PATCH 200 → GET antiguo: tarea confirmada conservada.
2. PATCH pendiente → GET con tarea nueva/ready → PATCH: tareas, asociación y estado conservados en colección y selección.
3. GET iniciado durante PATCH y entregado después de confirmarlo; dos GET fuera de orden.
4. PATCH realmente fallido después de GET con tarea nueva, sin pérdida ni éxito falso.
5. Lectura antigua de detalle/listado frente a tareas nuevas y PATCH confirmado.
6. Carga principal pendiente → 403/404 → carga tardía y seguimiento 500: todo permanece descartado.
7. Denegación → detalle, agenda, recordatorios o PATCH antiguos: no repueblan estado.
8. Denegación persistente hasta comprobación explícita correcta; principales 200 + seguimiento 500 siguen bloqueados.
9. Finally antiguo frente a un probe nuevo todavía pendiente: no apaga su loading.
10. GET/PATCH de sesión anterior, otro paciente o mismo paciente/token: sin efectos en la sesión nueva.
11. PUT de P pendiente → reset real de sesión → modal/formulario/guardado de Q → PUT P confirmado: Q permanece intacto, un solo PUT.
12. PUT vigente confirmado + seguimiento 500; PUT rechazado con modal abierto.
13. Denegación de un GET anterior mientras existe otro más reciente: la respuesta 500 posterior no restaura acceso.

El [recorrido Chromium](../scripts/follow-up-concurrency-ui-review.cjs), mediante el [arnés aislado](../scripts/run-follow-up-concurrency-ui-review.py), complementa las promesas unitarias con la app y API reales. Retiene respuestas HTTP después de confirmar el backend, libera cada compuerta explícitamente y comprueba A1/A2. Para A2 crea una tarea ficticia mediante el psicólogo autorizado en la misma demo nueva. Para C retiene los PUT confirmados de P y Q, entrega P primero y comprueba modal, respuesta y botón de guardado de Q intactos, con un PUT por paciente. Una señal de consumo del JSON y barrera de tarea confirma que las continuaciones de P ya se procesaron, sin esperar un número arbitrario de frames. Después entrega Q y verifica el cierre correcto pese al 500 opcional. También comprueba el bloqueo 403, probe 500 y recuperación explícita correcta.

Reproducción autorizada en recursos nuevos:

```bash
bash scripts/clinical-episodes.sh test
bash scripts/clinical-episodes.sh patient-follow-up-demo
python3 scripts/run-follow-up-concurrency-ui-review.py UUID_NUEVO_DE_LA_DEMO
bash scripts/clinical-episodes.sh cleanup UUID_NUEVO_DE_LA_DEMO
```

Para los once recorridos previos, crear otra demo nueva y ejecutar `scripts/run-follow-up-recovery-ui-review.py` con su UUID. No reutilizar sus pacientes ya entrevistados para repetir los PUT de otra ejecución.

Validación local nueva del 28 de octubre de 2026, separada de Actions:

- Código funcional `d0974462f579aac807b2019a7a0894649ffa8ad4`; pruebas/arnés `973359949e1027975f937adc0859106616472660`. Los contenidos se probaron antes de los commits.
- Matriz nueva `f9706ebb-f537-4bbd-9fcf-16e5cc251ed1`: **105/105 unitarias backend, 17/17 episodios, 133/133 integración HTTP/PostgreSQL, 30/30 frontend**, lint/build aprobados; cero fallidas/canceladas/omitidas. Incluye privacidad #25, permisos #26 e integridad.
- Demo final nueva `5b0a5a67-be17-42fa-a8d1-b6b28787e525`: **30/30 frontend**, lint/build y **4/4 escenarios Chromium de concurrencia** aprobados. Incluye GET/PATCH retenidos y dos PUT de entrevista confirmados pero retenidos, con consumo de respuesta de P observado antes de verificar Q. Cero errores de página; un solo PUT por paciente.
- Otra demo nueva `d0fa062c-fd7c-4047-94b4-2e639b78df7d`: **30/30 frontend**, lint/build y **11/11 recorridos previos** aprobados, cero errores inesperados de página/API; fallos de red/500/401/403/404 inyectados identificados como esperados. Se conservaron cronología, asociaciones, tareas, objetivos de solo consulta, vista profesional, navegación y sesión.
- Primer ensayo unitario: **25 aprobadas/5 fallidas de 30** por comparar arrays de contextos VM diferentes con deepStrictEqual; los valores coincidían. Se normalizó su contenedor con Array.from sin alterar las expectativas. Repetición: **30/30**, lint/build aprobados. La primera demo `38a05b47-51da-4dc5-8e21-872c1bf907b3` también aprobó los cuatro recorridos; la final sustituyó la barrera de frames del arnés por señal de consumo de JSON y tarea de evento.
- Node 24/PostgreSQL 17 en Docker Desktop/Ubuntu WSL; navegador Node 24.21.0, Playwright 1.64.0 y Chromium 156.0.8078.4. Capturas ficticias enmascaradas inspeccionadas, incluido el modal de Q con sus respuestas y guardado pendiente después de la confirmación de P.
- Todo el backend funcional, SQL/001–007/manifiesto/hashes, cliente API de sesión, lockfiles, decisiones y CI permanecen idénticos byte a byte al HEAD auditado: **80 archivos protegidos**. Verificador offline de Markdown/enlaces/IDs/UTF-8, diez pruebas del contrato de evidencia CI y diff aprobados.
- Los cuatro proyectos propios nuevos se limpiaron: tres demos y una matriz, junto con sus imágenes de navegador etiquetadas. Se comprobaron propiedad y conservación de etiquetas preexistentes. Evidencia local ignorada en `tmp/issue21-concurrency`; solo fixtures ficticios, sin logs crudos publicados.

Los siete checks de Actions se disparan al publicar los commits en la misma rama del Draft PR; su estado se informa aparte. Ningún resultado local anterior se presenta como resultado de Actions.

Persisten las observaciones no bloqueantes sobre estados legacy y recorridos específicos fuera de `ci/browser`; no se amplía CI. El aviso de tamaño de bundle se mantiene (aproximadamente 505 kB en esta revisión). No se modifica la historia clínica ni se presenta una respuesta confirmada antigua como permiso actual.

## Revisión final de callbacks — P2-01/P2-02

Base auditada `61b6cce9d958a2523d1c7dd4a609531c39ba8669`, verificada idéntica al HEAD real del Draft PR antes de editar. Esta sección sustituye, para el código actual, la estrategia anterior de conservar solo actividades al recibir un GET obsoleto: **ahora se descarta el DTO completo obsoleto**. Las evidencias anteriores permanecen históricas por SHA.

### Hallazgos corregidos

**P2-01, ficha profesional.** La comprobación anterior estaba dentro de la IIFE síncrona que construía el payload, antes de que finalizara el update. Se construye ahora un objeto normal y, al resolver `await updatePatient`, se comprueba inmediatamente token/generaciones antes de mapear, sincronizar o mostrar éxito. La respuesta profesional confirmada de una sesión anterior no se aplica a la sesión del paciente con el mismo ID. El callback devuelve false como autorización de efectos de UI obsoletos, sin revertir ni repetir el HTTP 200 ya confirmado; no comunica un fallo ficticio a la sesión nueva.

Una respuesta vigente aplica funcionalmente solo riesgo, estado y motivo confirmados, sin sustituir notas, entrevista, actividades ni notas clínicas actuales con otros campos de su snapshot. Catch/finally conservan las guardas y no modifican formularios o flags de la sesión nueva.

**P2-02, revisiones de actividad.** Todas las mutaciones de actividad de App avanzan la revisión al iniciar, confirmar o fallar en la sesión vigente: alta/cumplimiento/retiro de objetivos, cumplimiento/retiro de tareas y creación/edición de notas que sincronizan tareas. Las tareas no se crean por una vía App adicional: su alta/edición profesional se realiza mediante esas notas. No se cambia ningún permiso.

Un GET de detalle/listado iniciado antes de una mutación no sustituye el expediente actual cuando termina después. Un GET iniciado mientras la escritura está pendiente puede incorporar elementos antes de su confirmación; el callback posterior modifica únicamente su campo o elemento sobre el estado vigente. El cumplimiento cambia solo completed, conservando texto/metadatos más recientes. El alta de un objetivo no duplica ni sustituye un ID que el GET ya incorporó, incluso si ese objetivo ya tiene un estado posterior.

### Otros fallos reales encontrados en el alcance

- Los DTO completos de ficha, nota general y entrevista podían arrastrar campos no relacionados obsoletos. Las escrituras ahora aplican solo sus campos confirmados; un GET obsoleto se descarta completo y no incrementa la revisión como si se hubiera aceptado.
- La nota general conserva un borrador escrito mientras el guardado anterior esperaba respuesta.
- Una nota clínica confirmada podía notificarse como fallo por un GET secundario fallido. Se conserva el resultado de guardado y se indica expresamente que no se actualizó el expediente, sin repetir POST/PATCH ni inventar IDs de tareas.
- El consumidor de identidad en App podía recibir el callback de una instancia anterior de IdentityPanel y modificar el nombre de otra sesión. Se liga a la sesión del render, sin alterar identidad/JWT/backend ni bloquear los básicos propios por una denegación clínica.
- El consumidor agenda→nota podía abrir el paciente capturado antes de completar la cita. Obtiene y comprueba una ficha vigente antes de abrir; si ese GET ya es obsoleto o perdió acceso no navega con la captura anterior. Un fallo de lectura se comunica solo a la sesión vigente; una denegación o cierre previo no recibe feedback antiguo.
- El lector lateral de pacientes del callback legacy de relaciones usa la misma comprobación de revisiones. Su bloqueo backend continúa intacto; no se habilitan nuevas vinculaciones.

### Matriz sistemática por función

El [auditor AST](../scripts/audit-patient-callbacks.cjs) usa ESLint ya instalado en la imagen frontend, sin dependencias nuevas. Identifica la sentencia completa que contiene cada await y su guarda siguiente; por eso no confunde una comprobación dentro del payload con la guarda posterior a la petición. El informe anterior detecta exactamente el await desprotegido de actualizarPerfilPaciente. El actual revisa **43 callbacks y 55 await**, sin guardas posteriores ausentes; todos los finally inspeccionados con efectos tienen guarda vigente.

La inspección estructural complementa, no sustituye, la revisión semántica siguiente y las pruebas de promesas controladas. Las revisiones por paciente se exigen para datos de expediente/actividad; los callbacks de agenda, espera, disponibilidad y operativa se revisan por sesión/acceso y sus efectos propios, sin redefinir esos dominios.

| Callback | await | Revisión y resultado |
| --- | --- | --- |
| `resetSessionState` | 0 | Sin await; invalida generaciones y vacía estado/flags. Conservado. |
| `invalidateClinicalAccess` | 0 | Sin await; denegación central y limpieza. Conservado. |
| `commitPatientRows` | 0 | Cambio: rechaza DTO completo obsoleto, avanza solo lecturas aceptadas y sincroniza selección/lista. |
| `refreshBackofficeData` | 1 | Guarda posterior; datos operativos/relaciones, sin actividades de paciente. Conservado. |
| `refreshPatientFollowUp` | 1 | Guarda de sesión/acceso/intento y revisión; DTO mínimo aceptado avanza revisión. Conservado. |
| `cargarDatos` | 4 | Cambio: aplicación común por revisión, sin snapshots obsoletos completos; recheck explícito conservado. |
| `handleCreateCareRelationship` | 1 | Guarda posterior/catch/finally; no habilita alta/vínculo legacy bloqueado. Conservado. |
| `handleUpdateCareRelationship` | 1 | Guarda posterior/catch/finally; no cambia permisos ni estados autorizados. Conservado. |
| `handleRequestCareRelationship` | 1 | Guarda posterior/catch/finally; bloqueo legacy intacto. Conservado. |
| `handleInviteCareRelationship` | 1 | Guarda posterior/catch/finally; bloqueo legacy intacto. Conservado. |
| `handleRespondToCareRelationship` | 2 | Cambio: lector lateral captura revisiones y usa commit común; no activa la vía bloqueada. |
| `handleAcceptCareRelationshipByCode` | 1 | Guarda posterior/catch/finally; permisos intactos. Conservado. |
| `syncPatientState` | 0 | Cambio: solo (id, updater) funcional; ya no acepta un DTO completo de escritura. |
| `refreshSelectedPatient` | 1 | Cambio: descarta DTO completo si cambió revisión; avanza y aplica solo una lectura vigente. |
| `refreshAppointmentsAndWaitlist` | 1 | Guarda posterior/catch; denegación de lector invalida acceso. Sin actividad de expediente. Conservado. |
| `refreshReminders` | 1 | Guarda posterior/catch; denegación de lector invalida acceso. Conservado. |
| `guardarNuevoPaciente` | 1 | Guarda posterior/catch/finally; alta unilateral sigue bloqueada en backend. Conservado. |
| `guardarNotas` | 1 | Cambio: revisión inicio/confirmación/fallo; aplica solo notas confirmadas y conserva borrador posterior. |
| `actualizarPerfilPaciente` | 1 | Cambio: payload objeto normal; guarda inmediatamente después de await; revisión y parche de tres campos. |
| `handleIdentityUpdated` | 0 | Cambio: consumidor sin await ligado al token/generación de su render; básico propio disponible sin clínica. |
| `saveInterview` | 1 | Cambio: revisión inicio/confirmación/fallo y solo entrevista; true persistente no autoriza efectos en otra sesión. |
| `handleSaveRequiredInterview` | 1 | Guarda del consumidor antes de cerrar modal; no confía solo en true. Conservado. |
| `toggleTask` | 2 | Revisión inicio/confirmación/fallo; cambio adicional: solo completed, sin sustituir texto/metadatos más recientes. |
| `removeTask` | 2 | Cambio: revisión inicio/confirmación/fallo y filtro funcional; no restaura tareas retiradas. |
| `addObjective` | 1 | Cambio: revisión inicio/confirmación/fallo; alta funcional sin duplicar ni reemplazar un ID ya leído. |
| `toggleObjective` | 1 | Cambio: revisión inicio/confirmación/fallo; solo completed sobre estado vigente. |
| `removeObjective` | 1 | Cambio: revisión inicio/confirmación/fallo y filtro funcional. |
| `createSession` | 2 | Cambio: revisión cubre tareas escritas por la nota; distingue confirmación de fallo secundario de lectura. |
| `updateSession` | 2 | Cambio: revisión cubre edición/retiro de tareas de nota; distingue confirmación y refresco secundario. |
| `handleCreateAppointment` | 3 | Guardas después de API y refrescos, catch/finally; agenda, sin DTO de paciente. Conservado. |
| `handleUpdateAppointment` | 3 | Guardas después de API y refrescos, catch/finally; actualización funcional de agenda. Conservado. |
| `handleCancelFutureRecurringAppointments` | 3 | Guardas después de API/refrescos y catch/finally; reglas de agenda intactas. Conservado. |
| `handleUpdateAppointmentStatus` | 0 | Sin await propio; delega al callback de agenda protegido. Conservado. |
| `handleCreateAppointmentWaitlist` | 2 | Guardas después de API/refresco y catch/finally. Conservado. |
| `handleDeleteAppointmentWaitlist` | 2 | Guardas después de API/refresco y catch/finally. Conservado. |
| `handleReorderAppointmentWaitlist` | 2 | Guardas después de API/refresco y catch/finally. Conservado. |
| `handleOpenSessionFromAppointment` | 2 | Cambio: después de confirmar cita obtiene una ficha vigente y no abre la captura antigua; catch con guarda de sesión. |
| `handleUpdateAvailability` | 1 | Guarda posterior/catch/finally; dominio disponibilidad, sin actividad de expediente. Conservado. |
| `handleUpsertAvailabilityException` | 1 | Guarda posterior/catch/finally; merge funcional de excepciones. Conservado. |
| `handleDeleteAvailabilityException` | 1 | Guarda posterior/catch/finally; filtro funcional. Conservado. |
| `handleCreateAvailabilityExceptionRange` | 1 | Guarda posterior/catch/finally; merge funcional del rango. Conservado. |
| `handleUpdateAvailabilityExceptionRange` | 1 | Guarda posterior/catch/finally; merge funcional del rango. Conservado. |
| `handleDeleteAvailabilityExceptionRange` | 1 | Guarda posterior/catch/finally; filtro funcional del rango. Conservado. |

### Reproducciones y cobertura

[Pruebas nuevas](../frontend/test/patient-callback-audit.test.js), dentro de frontend npm test/CI, usan el [arnés de callbacks reales](../frontend/test/helpers/followUpAppHarness.js). Conservan las capturas por render, controlan las promesas y no reimplementan las guardas:

1. PUT profesional retenido → reset → paciente con mismo ID → DTO antiguo: cero mapas del DTO, referencias/colecciones/formulario/flags intactos, sin datos profesionales ni feedback anterior; payload objeto y un solo update.
2. PUT profesional vigente y otro estado incorporado durante la espera: solo tres campos confirmados cambian.
3. GET de detalle o listado antiguo → cada alta/PATCH/retiro de objetivo o retiro de tarea confirmado → GET: actividad conservada.
4. Cada mutación pendiente → GET con tareas/objetivos nuevos y texto reciente → mutación: elementos preservados, sin duplicar el objetivo ya visible ni revertir su estado posterior.
5. GET iniciado durante PATCH y liberado después de confirmarlo; fallo real y refresco posterior correcto.
6. Notas que crean/modifican tareas frente a GET anterior; confirmación con GET secundario 500 y rechazo real, sin confundir escritura y refresco.
7. Nota general con borrador posterior; entrevista confirmada y snapshots profesionales nuevos frente a GET antiguo.
8. Todas las escrituras afectadas retenidas → 403/404 o logout/nueva sesión → respuesta: no repueblan datos ni modifican feedback/flags nuevos.
9. Consumidor antiguo de identidad frente a sesión Q, y básicos propios vigentes durante denegación clínica.
10. Consumidor agenda→nota frente a ficha capturada anterior al await; error 500 vigente y respuestas fallidas después de denegación/logout, sin modificar estado/feedback nuevo.

Se conservan las trece pruebas anteriores de concurrencia y sus secuencias GET/PATCH y P/Q, además de recuperación, 401 y permisos de objetivos. Esta actualización añade **13 pruebas**, con múltiples intercalaciones parametrizadas; la suite normal contiene **43**.

El [recorrido nuevo Chromium](../scripts/patient-callback-ui-review.cjs) retiene un GET profesional real generado tras editar una nota, confirma el PATCH de objetivo y libera/consume el GET antiguo: el checkbox continúa completado. También retiene un PUT profesional confirmado, cambia a paciente del mismo expediente y consume el DTO anterior: no aparece el éxito antiguo ni contenido privado visible. La ausencia de contaminación del estado React se prueba directamente con los callbacks unitarios; la comprobación DOM no se presenta como inspección del estado interno de React.

El [arnés](../scripts/run-patient-callback-ui-review.py) ejecuta esos dos casos y los once recorridos previos. La prueba P/Q con dos PUT pendientes sigue en el arnés separado de concurrencia y requiere otra demo nueva. Las respuestas se liberan mediante compuertas; señales de consumo JSON y barreras de evento observan la aplicación, sin sleeps ni retrasos arbitrarios.

### Validación nueva de esta corrección

Código funcional: [a9b7a0e](https://github.com/japh113/plataformaPsicologia/commit/a9b7a0e921a3afa5e15a39228c2b945b692ab4b7). Pruebas/herramientas: [8080760](https://github.com/japh113/plataformaPsicologia/commit/8080760f8bf3af57d6fbac3335f959dca6e5dcee). La documentación se entrega en un commit posterior, sin modificar el contenido funcional comprobado.

- Frontend final: **43/43**, cero fallos/omitidas, lint y build aprobados. Auditor AST final: **43 callbacks/55 await, cero guardas posteriores ausentes**; el informe sobre 61b6cce detectó el await incorrecto de P2-01. Build: 506,60 kB, gzip 127,61 kB; aviso de tamaño no bloqueante.
- Backend sobre el mismo contenido funcional final: **105/105 unitarias, 17/17 episodios y 133/133 integración**, cero omitidas. PostgreSQL nuevo de prueba b1c5db8b-8413-4a4c-b913-56ba4ff38b4b. Esa ejecución encontró una expectativa de test incorrecta para el estado inicial de error del arnés; se corrigió a un mensaje de sesión nuevo que debe permanecer intacto. La corrida frontend posterior aprobó 43/43, lint/build y AST en una imagen propia nueva sin red.
- Chromium en demo nueva 3fc647a5-c16b-4d44-ad75-5e8f98f04ec4: **13/13** (los dos casos nuevos de objetivo/PUT profesional, seis originales y cinco de recuperación), sin pageerrors. Se revisaron visualmente las capturas del objetivo completado y del paciente después del PUT antiguo.
- Chromium en otra demo nueva 4d7498c9-4321-466e-9e8c-dab6a721871e: **4/4** carreras anteriores A1/A2/C/B; cero errores de página, un PUT P y un PUT Q. Se conservan cumplimiento/grupo nuevo, modal Q durante respuesta P y recuperación solo mediante probe explícito correcto. Total: **17 recorridos**. Estos recorridos preceden al último catch de fallo de lectura de agenda→nota; su camino normal se conserva y el nuevo fallo/denegación/logout se cubre en la suite frontend final.
- Las corridas preparatorias sobre ef4c11b6-a302-43da-bb52-8bc32f40ee4e y d0e77d75-e1c9-46d4-bf19-e8a5c4f511b5 conservan sus logs locales; no se sustituyen por evidencia histórica. Durante la preparación se corrigieron una omisión del refresco real en el arnés y una expresión rechazada por lint, antes de las corridas aprobadas.
- Verificados retirados los **cinco proyectos nuevos** usados en esta revisión, sus contenedores/redes/imágenes y cualquier volumen propio. Los runners retiraron sus imágenes Chromium y la imagen frontend final; los tags preexistentes se comprobaron sin cambios. No se operó sobre recursos habituales.
- **80 archivos protegidos idénticos byte a byte a 61b6cce**: backend funcional/SQL/manifiesto/hashes, cliente API de sesión, lockfiles, decisiones/reglas y CI. Verificador offline aprobado: 40 Markdown, 571 enlaces locales/fragmentos y diez pruebas del contrato de evidencia CI; UTF-8 y diff comprobados.
- Evidencia local reproducible en tmp/issue21-final-audit (ignorado por Git): matrix-final.log, frontend-final.log, ui-final.log, race-ui.log, informes callbacks-before/current.json y capturas. Los scripts/pruebas sí se versionan. Esta sección informa pruebas locales; el estado de Actions del nuevo HEAD se consulta después del push y no se atribuye el 7/7 histórico al commit nuevo.


### Límites y resultado persistente

Las revisiones son locales a este cliente y no serializan escrituras de otras pestañas, dispositivos o profesionales, ni añaden versiones/transacciones backend. Esta corrección no cambia las reglas de edición clínica ni implementa adendas RN-23.

Si una nota se confirmó pero su refresco secundario falló, la UI confirma el guardado e indica recargar la página para recuperar el expediente completo; no fabrica IDs ni declara fallo del POST/PATCH. Las respuestas de una sesión anterior no autorizan efectos en la nueva aunque su escritura sí se haya confirmado.

Se mantienen las observaciones legacy, los recorridos específicos fuera de ci/browser y el aviso no bloqueante de tamaño del bundle. Sin cambios del backend funcional, DTO privado, SQL/hashes, JWT/autenticación, permisos, producto, dependencias ni configuración CI.



## Recuperación de nota confirmada — P2 y arnés P3

Encargo focalizado sobre el HEAD auditado 2d8453b59e92a9388b4e4366f45285b925c643a5, verificado idéntico al Draft PR #27 antes de editar. Las evidencias anteriores conservan su SHA. Esta sección corrige la omisión del resultado descartado del refresco posterior a una nota confirmada; no rehace el aislamiento entre sesiones ni la política de descartar snapshots obsoletos.

### Resultado pequeño y recuperación acotada

El contrato interno de refreshSelectedPatient distingue estos resultados; no cambia contratos HTTP ni DTO profesionales:

| Resultado | Significado | Consumidor de nota confirmada |
| --- | --- | --- |
| applied, con patient | Lectura autorizada aplicada a lista y selección | Éxito normal; nota y tareas vienen del DTO leído. |
| conflict | Cambió la revisión mientras esperaba el GET; no se aplica ningún campo | Inicia un único GET nuevo después del conflicto, si sesión/acceso siguen vigentes. |
| invalidated | Sesión o generación clínica ya no vigentes | Sin reintento, datos ni feedback para la sesión actual. |
| Excepción de red/servidor | Fallo real de lectura; 401/403/404 invalidan acceso | Sin reintento; solo si continúa autorizado se conserva confirmación de guardado y se avisa del refresco pendiente. |

createSession y updateSession comprueban cada resultado, además de sus guardas posteriores a await. El presupuesto es **dos GET como máximo por nota confirmada**: lectura secundaria y una recuperación exclusivamente por conflict. Un segundo conflicto termina en advertencia; no hay bucle ni reintentos tras 401/403/404 o logout. Los errores no se convierten en conflict. El consumidor agenda→nota se adapta al mismo resultado y abre solo applied, sin iniciar recuperación automática.

El primer DTO descartado permanece descartado completo. La lectura nueva captura la revisión actual y vuelve a comprobarla al terminar. Si durante ella cambia un objetivo, se retira una tarea, se añade actividad o se acepta otra lectura más reciente, tampoco sustituye ese estado vigente.

Tras recuperación aplicada se muestra éxito normal. Tras otro conflicto o fallo de lectura, el resultado persistente continúa confirmado y la UI muestra una **advertencia ámbar persistente**, hasta cerrarla o cambiar feedback/sesión, con **Recargar expediente**. El botón recarga la página y obtiene de nuevo los datos autorizados. El mensaje nunca declara fallida la escritura confirmada. La recuperación no repite POST/PATCH, no deriva IDs/tareas/vínculos del payload y no añade sincronización entre pestañas o dispositivos.

### Reproducciones deterministas y arreglo P3

Las [pruebas de callbacks](../frontend/test/patient-callback-audit.test.js) forman parte de npm test. Para creación y edición: escritura confirmada con tarea nueva → primer GET retenido → PATCH objetivo completado → primer DTO descartado → segundo GET válido. Se comprueban contenido definitivo, ID de tarea y asociación de nota procedentes del servidor, objetivo completado, actividades recientes, coherencia lista/selección y exactamente una escritura de nota y una de objetivo.

Otras secuencias comprueban segundo PATCH durante recuperación, GET obsoleto después de removeTask/addObjective/toggleObjective, límite de dos lecturas, HTTP 500 de recuperación, 401/403/404 o logout antes/durante la segunda lectura, y guardados encadenados con una lectura independiente antigua. Si la lectura no se aplica, se preservan los elementos actuales y se exige aviso de actualización pendiente; si se invalida acceso, las colecciones protegidas siguen vacías y no se modifican formulario/flags/avisos nuevos.

El [arnés](../frontend/test/helpers/followUpAppHarness.js) incorpora **mapBackendWaitlistToUiWaitlistEntry real**. La carga profesional de prueba usa espera no vacía y comprueba errorCarga vacío, datos aplicados y fin de carga. Otro caso inyecta una excepción inesperada en el mapper y demuestra que el oráculo de carga exitosa falla; no se oculta con un mapper ficticio ni con un catch en el test. Las cargas denegadas 403/404 siguen descartando el expediente. No cambia código profesional de producción para reparar P3.

Antes del cambio de producción, la reproducción de recuperación terminaba en finished en vez de iniciar el segundo GET y la prueba profesional mostraba mapBackendWaitlistToUiWaitlistEntry is not defined en errorCarga. Las compuertas se esperan mediante Promise.race con la finalización del callback: la falta de recuperación causa una aserción fallida, no un test colgado ni un retraso arbitrario.

### Chromium reforzado y evidencia

El [recorrido de callbacks](../scripts/patient-callback-ui-review.cjs) ya no comprueba solo que el objetivo conserve su checkbox:

1. Edita contenido ficticio y añade una tarea por la nota; confirma PATCH y retiene su GET secundario.
2. Confirma un único PATCH del objetivo a completed true y libera el GET antiguo.
3. Espera la recuperación; comprueba en el DOM actual el contenido de la nota, la tarea en su tarjeta y en el editor de esa nota, y el objetivo completado. Exige dos GET, una escritura de nota y una de objetivo.
4. Repite con HTTP 500 en el GET de recuperación: comprueba confirmación/advertencia y botón de recarga; al pulsarlo verifica de nuevo contenido/tarea/objetivo desde datos autorizados actuales, sin otra escritura.
5. Conserva la respuesta profesional retenida frente a logout/paciente del mismo expediente, sin éxito antiguo ni contenido privado visible.

La preparación independiente del segundo caso cambia explícitamente el objetivo a false fuera de sus contadores; no se confunde esa preparación con una escritura duplicada. Los contadores finales de los dos casos son dos PATCH de nota, dos PATCH de objetivo más uno de preparación, y cuatro GET secundarios/de recuperación. La comprobación de estado React permanece en las unitarias; el navegador verifica DOM actual, no una captura anterior.

El [runner](../scripts/run-patient-callback-ui-review.py) ejecuta primero los once recorridos originales/de recuperación y después estos tres; así las nuevas tareas no alteran los conteos iniciales de la cronología original. El arnés de recuperación registra específicamente el GET de contacto sin Authorization iniciado durante el 401 de seguimiento intencional como consecuencia esperada de sesión invalidada. No acepta otros 401 inesperados ni modifica autenticación; mantiene los oráculos de token eliminado y UI protegida ausente.

### Validación nueva por contenido comprobado

Código funcional: [7f43fda](https://github.com/japh113/plataformaPsicologia/commit/7f43fda8467b050f3e3bd9850617382ce6e9fe12). Pruebas y recorridos: [63484aa](https://github.com/japh113/plataformaPsicologia/commit/63484aaba8851c2da37d9d0aca5e8c65823edb83). La documentación se guarda después, sin modificar el contenido funcional validado.

- **50/50 frontend**, cero fallos/canceladas/omitidas, lint/build aprobados, incluida la carga profesional real y su oráculo negativo. Se añaden siete pruebas con intercalaciones parametrizadas y se mantienen las regresiones anteriores. Auditor estructural: **43 callbacks/57 await, cero guardas posteriores ausentes**; no sustituye las pruebas semánticas.
- Matriz nueva 3c2b0749-73f3-4b8c-b109-9dcbd872641d: **105/105 unitarias backend, 17/17 episodios y 133/133 integración**, además de 50/50 frontend y lint/build. Incluye privacidad #25, permisos #26 y seguimiento. PostgreSQL nuevo tmpfs, red privada, sin puertos DB; cero omitidas.
- Demo final nueva 4be74652-aa5c-46aa-9e12-7230a08593bc: **14/14 Chromium** (seis originales, cinco de recuperación y tres de callbacks), más 50/50 frontend/lint/build. Sin pageerrors; el recorrido de recuperación conserva unexpectedApi vacío y registra aparte los fallos intencionales. Los casos de nota exigen los contadores indicados arriba y verifican botón de recarga, contenido/tarea/objetivo actuales. Capturas ficticias de advertencia y recarga inspeccionadas.
- Demo preparatoria 8debde0d-ec7e-49c7-8a35-f57c99b40583: seis recorridos originales aprobados; el arnés de recuperación detectó dos 401 de contacto posteriores a su invalidación intencional. Se añadió la clasificación estricta por petición sin token, no una excepción global a los 401. Los tres casos nuevos también pasaron de forma independiente antes de la repetición completa final.
- La primera preparación del test previo se interrumpió por una promesa pendiente; se sustituyó por el oráculo determinista Promise.race y se reprodujeron los dos defectos antes de corregir producción. Un guard de imágenes detectó la retirada concurrente de otra imagen propia de ese ensayo; la repetición secuencial aprobó el control. No se repararon ni alteraron recursos habituales para resolverlo.
- Verificados retirados los **tres proyectos nuevos**, sus contenedores/redes/imágenes y volúmenes propios, las imágenes/frontend de test y los navegadores etiquetados de esta revisión. Los wrappers y la repetición secuencial verificaron tags preexistentes sin cambios.
- **80 archivos protegidos idénticos byte a byte a 2d8453b**: backend funcional/SQL001–007/manifiesto/hashes, cliente API de sesión, lockfiles, decisiones/reglas y CI. Verificador offline aprobado: 40 Markdown, 577 enlaces locales/fragmentos, UTF-8 y diez pruebas del contrato de evidencia CI; diff sin errores.
- Logs locales ignorados: tmp/issue21-note-recovery/red-final.log, matrix.log, ui-final.log, callback-browser-result.json y capturas. Los casos/arneses versionados permiten repetirlos en otro UUID nuevo. Build: 507,54 kB, gzip 127,86 kB; aviso de tamaño no bloqueante conservado.

Actions mantiene siete checks y artifacts de 14 días, sin cambios. Esta evidencia es local; el estado del nuevo HEAD se consulta después del push y no se reutiliza ningún 7/7 anterior como resultado nuevo.


### Límites conservados

Un conflicto adicional deja el expediente pendiente de actualización con acción explícita; no se garantiza actualización automática durante una sucesión continua de escrituras. Las revisiones siguen siendo locales a este cliente. La lectura autorizada y sus revisiones protegen los datos actuales; no se añade serialización distribuida ni se cambia la historia clínica.

Sin cambios a backend funcional, SQL/manifiesto/hashes, JWT, permisos #25/#26, DTO seguro, contratos profesionales HTTP, dependencias, configuración CI o recursos habituales. El Issue #21 sigue abierto; entrega en la misma rama/Draft PR, sin merge, auto-merge ni despliegue.

## Límites de entrega

Sin cambios a SQL 001–007, baseline/seed, manifiesto/hashes, autenticación/JWT, autorización legacy, proyecciones reservadas de #25, permisos de objetivos de #26, decisiones de producto, configuración CI/producción o administración de GitHub. Sin D3, nuevas vinculaciones, episodios paralelos, reconciliación histórica, proveedores ni despliegue.

La matriz de Actions conserva siete checks y artifacts técnicos de 14 días. Se inicia al abrir el Draft PR; sus resultados corresponden a esa ejecución, separados de la evidencia local anterior. Issue #21 permanece abierto mediante referencia, sin cláusula de cierre. La revisión independiente y la autorización de merge son posteriores.
