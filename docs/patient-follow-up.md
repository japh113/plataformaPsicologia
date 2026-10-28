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

## Evidencia de esta entrega

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

## Límites de entrega

Sin cambios a SQL 001–007, baseline/seed, manifiesto/hashes, autenticación/JWT, autorización legacy, proyecciones reservadas de #25, permisos de objetivos de #26, decisiones de producto, configuración CI/producción o administración de GitHub. Sin D3, nuevas vinculaciones, episodios paralelos, reconciliación histórica, proveedores ni despliegue.

La matriz de Actions conserva siete checks y artifacts técnicos de 14 días. Se inicia al abrir el Draft PR; sus resultados corresponden a esa ejecución, separados de la evidencia local anterior. Issue #21 permanece abierto mediante referencia, sin cláusula de cierre. La revisión independiente y la autorización de merge son posteriores.
