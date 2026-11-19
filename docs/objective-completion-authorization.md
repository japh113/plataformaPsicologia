# Cumplimiento de objetivos exclusivo del psicólogo — Issue #22

## Alcance y causa

Corrección autorizada de [Issue #22](https://github.com/japh113/plataformaPsicologia/issues/22), conforme a RN-72 y conservando RN-24/26/27 en las [reglas aprobadas](product/business-rules.md). Base remota verificada: `main` `611d69b26749885dd9da6dceb67574d2783a41ef`, merge del [PR #25](https://github.com/japh113/plataformaPsicologia/pull/25). Implementación y pruebas: `d741872d10a6c01ea261d8c01872233518989abc`. Rama independiente `fix/psychologist-only-objective-completion`; entrega mediante Draft PR, sin merge ni despliegue.

El controlador admitía que el paciente actualizara exclusivamente `completed` tanto en tareas como en objetivos. El servicio exportado de objetivos delegaba sin distinguir ese permiso en el actualizador compartido. La interfaz ofrecía un checkbox y textos que invitaban al paciente a evaluar el cumplimiento de sus objetivos.

Ahora el controlador de objetivos exige psicólogo antes de validar el payload o consultar recursos. El servicio `updatePatientObjective` exige el mismo rol antes de delegar: una llamada directa tampoco puede eludir la restricción. Se conservan el alcance clínico existente por paciente, la pertenencia del registro, el filtro `kind` y el retiro lógico. El actualizador de tareas y sus permisos permanecen independientes. No se activan permisos por episodio.

## Matriz y rutas

| Operación | Paciente propio | Psicólogo con acceso | Psicólogo sin acceso | Admin/superadmin/support |
| --- | --- | --- | --- | --- |
| `GET /api/patients` y `GET /api/patients/:id` | Consulta objetivos y `completed` | Consulta su alcance actual | Detalle ajeno 404; listado acotado | 403 |
| `PATCH /api/patients/:id/objectives/:objectiveId` | 403 ante cualquier payload, incluso igual al valor actual | 200 al completar/desmarcar o editar conforme a las reglas existentes | 404 | 403 |
| `PATCH /api/patients/:id/tasks/:taskId` | 200 al cambiar exclusivamente `completed` | Conserva edición autorizada | 404 | 403 |
| Crear/retirar objetivos o tareas | 403 | Conserva operaciones vigentes | Sin acceso | 403 |

El paciente ajeno recibe el mismo 403 genérico al intentar escribir objetivos; no se revela si existen. Su lectura de otro expediente permanece 404. La autorización HTTP exige sesión vigente; sin autenticación se conserva 401. En servicio, actores desconocidos o administrativos reciben 403 y actor ausente 401.

Un ID de objetivo enviado a `/tasks` no se convierte en tarea; el caso inverso tampoco. Para el profesional autorizado ambos cruces devuelven 404. El paciente mantiene 403 en `/objectives`, incluso con un ID de tarea.

No hay migración ni corrección masiva. Los objetivos completados bajo el comportamiento legacy conservan sus datos. La regla se aplica a operaciones futuras.

## Interfaz y compatibilidad con #25

En la vista paciente, las insignias actuales muestran el estado sin controles editables de objetivos. Se conserva el porcentaje calculado desde objetivos completados y el resumen lateral de solo lectura. Los textos explican que el psicólogo evalúa y actualiza el cumplimiento. No se añaden estados, escalas ni autopercepción.

El profesional conserva checkbox, creación y retiro. `App.toggleObjective` comprueba `isPsychologist` antes de intentar la llamada a la API. Las tareas del paciente siguen siendo interactivas y `toggleTask` permanece intacto.

Se conserva la [proyección integrada de #23/#25](patient-response-privacy.md): el JSON del paciente omite `notes`, `riskLevel` y `clinicalNoteObjective`, mantiene tareas permitidas y respuestas propias de entrevista, y no concede acceso a notas. La suite de privacidad existente se amplía; no se eliminan pruebas ni se cambia ese contrato.

## Evidencia local del 28 de octubre de 2026

Ubuntu WSL/Docker Desktop. Solo recursos nuevos UUID del [arnés existente](development.md#pruebas-aisladas-y-ausencia-de-npm-en-wsl): PostgreSQL 17 en tmpfs, DB sin puerto publicado y red privada; imágenes Node 24 y lockfiles existentes. Sin instalación de herramientas en host ni operación del Compose habitual. Logs y capturas ficticias quedan ignorados en `tmp/issue22/`.

| Ensayo | Destino UUID | Resultado |
| --- | --- | --- |
| Primera matriz | `dd644204-30af-4380-99e9-415d14e0f8fe` | 17/17 episodios y 103/103 unitarias backend; integración 121/123. Una expectativa legacy aún exigía 200 para escritura paciente de objetivos; falló ese caso y su padre |
| Matriz final | `5dfcdf56-397b-4cb2-a632-1a004ba93d27` | 17/17 episodios, 103/103 unitarias backend y 123/123 integración, cero fallidas/canceladas/omitidas; lint/build frontend aprobados |
| Primera demo | `cf03e38d-9d29-4905-ab82-94405f0d9ecd` | 5/5 unitarias frontend. Chromium se detuvo por selector de estado duplicado en el resumen lateral; selector acotado a la fila |
| Demo final | `3a5d3e5a-4401-4aa0-b635-177a410fa070` | 5/5 unitarias frontend; tres recorridos Chromium aprobados, cero errores de página o API HTTP >=400 |

La expectativa legacy de backoffice se actualizó a 403 y se amplió para comparar la fila completa y comprobar 200 profesional. El primer fallo no se oculta ni se atribuye a privacidad.

Chromium final `156.0.8078.4`, Playwright `1.64.0`, Node del arnés `v24.21.0`, escritorio 1440×1000. Capturas ficticias de ambas vistas inspeccionadas visualmente: paciente sin controles de escritura, profesional con controles operativos y ambos con avance 50%. El navegador registra cero PATCH de objetivos durante las acciones del paciente. Las demos y las imágenes de navegador propias se limpiaron con verificación de propiedad y conservación de etiquetas preexistentes.

Evidencia HTTP/PostgreSQL en [patient-projection.integration.test.js](../backend/test/patient-projection.integration.test.js):

- Paciente A intenta completar, desmarcar, enviar el valor ya guardado, texto, payload vacío y valor inválido: 403. Los mismos intentos contra B devuelven idéntico error genérico.
- Psicólogos A/B completan y desmarcan únicamente objetivos de su paciente: 200; objetivos/expedientes ajenos y cruces de IDs: 404. Los tres roles administrativos: 403.
- Cada intento rechazado compara todas las columnas de `patient_tasks` y `patients`, más todas las filas de `audit_logs`: no cambian filas, `updated_at`, atribuciones ni retiro.
- Invocaciones directas del servicio con paciente, roles administrativos, desconocido o actor ausente tampoco cambian esos snapshots. Las unitarias además verifican cero consultas DB antes del rechazo.
- Listado/detalle del paciente conservan objetivo y estado después de cada transición profesional; tareas propias completan y desmarcan con 200. Continúan las denegaciones de texto/creación/eliminación y recursos ajenos, y todas las regresiones de privacidad e entrevista de #25.

Las [unitarias frontend](../frontend/test/objective-authorization.test.js) ejecutan el callback real de App en un contexto controlado sin cargar JSX: paciente no llama a API ni sincroniza estado; profesional completa/desmarca y conserva las tareas. El [recorrido Chromium](../scripts/objective-ui-review.cjs) comprueba ambas vistas, estados pendientes/completados, avance 50%, creación y controles profesionales, tareas interactivas del paciente y ausencia de PATCH de objetivos desde sus acciones.

## Reproducción y límites

Con autorización para recursos nuevos aislados, desde raíz:

```bash
bash scripts/clinical-episodes.sh test
bash scripts/clinical-episodes.sh patient-projection-demo
python3 scripts/run-objective-ui-review.py UUID_NUEVO_IMPRESO_POR_LA_DEMO
bash scripts/clinical-episodes.sh cleanup UUID_NUEVO_IMPRESO_POR_LA_DEMO
```

El [runner de navegador](../scripts/run-objective-ui-review.py) valida propiedad de la demo, ejecuta `frontend npm test` en su imagen propia y crea/elimina una imagen Chromium UUID etiquetada con la versión fijada por CI. Requiere una demo nueva sin modificaciones previas. No solapar ensayos; limpiar solo el UUID propio verificado. El [fixture ADR-019 existente](patient-response-privacy.md#demo-reproducible--adr-019) conserva cuentas ficticias y reproduce el entorno sin seed ni activación de episodios.

El tablero sigue requiriendo expediente seleccionado antes de completar tareas: el recorrido abre “Ver detalle” y vuelve a “Tablero”. No se implementa la cronología del Issue #21 ni se cambia ese límite previo de navegación.

Verificación final: 58 archivos protegidos contrastados byte a byte con la base (SQL completo, manifiesto, configuración, lockfiles, autenticación y decisiones de producto), todos idénticos; hashes de 001–007 válidos. `git diff --check` y verificador documental offline aprobados: 39 Markdown/543 enlaces, decisiones protegidas y migraciones intactas. No se modifican datos habituales/históricos, D3, vínculos, proveedores ni configuración administrativa. La evidencia local no constituye resultados de Actions ni acredita despliegue.

La CI existente conserva siete checks y artifacts técnicos de 14 días. El Draft PR permite su ejecución automática; su estado se informa por el HEAD publicado. La revisión independiente y autorización del propietario son posteriores.

## Aislamiento negativo de objetivos atribuidos a episodio — 19 de noviembre de 2026

**APROBADO por el propietario:** excluir objetivos `patient_tasks.kind='objective'` con `episode_id IS NOT NULL` de todos los consumidores legacy operativos. Base `main` `c39aa542c27e5e3245a9144fe4369d999956e25e`, #77 integrado y SQL 001–017. **IMPLEMENTADO en rama** `fix/legacy-objective-episode-isolation`, pendiente de CI y auditoría independiente; un único Draft, sin merge/despliegue. La evidencia de octubre anterior sigue siendo histórica.

No hay bloqueante que requiera modificar otros dominios: el lector compartido de expediente y los mutadores compartidos de checklist contienen los cuatro puntos SQL afectados. La selección previa de edición y los UPDATE de modificación/retiro filtran NULL cuando `kind` es objetivo; el predicado se evalúa en la propia escritura aunque la atribución cambie tras la lectura previa. El tipo procede de los wrappers internos existentes, nunca del payload. No se crea una abstracción ni API nueva.

### Inventario de consumidores revalidado

Búsqueda de `patient_tasks`, `objective`, `objectives` y `objetivos` en backend, frontend, scripts y SQL, seguida de lectura de llamadores/rutas y respuestas completas:

| Consumidor | Comportamiento y cobertura |
| --- | --- |
| `patientSelectColumns` → `getAllPatients` / `getPatientById` en [patients.service.js](../backend/src/modules/patients/patients.service.js) | Único agregado operativo de objetivos, `json_agg` ordenado y `COALESCE []`; ahora `pt.episode_id IS NULL` antes de agregar. GET listado/detalle PAC/PSI no contienen ID, texto, estado ni señales derivadas de objetivos atribuidos. |
| `updatePatient` / `upsertPatientInterview` | Devuelven el mismo `getPatientById`: PUT de ficha/entrevista conserva la exclusión. Los prechecks de cita/nota/checklist usan también este lector. No hay otro DTO de objetivos. |
| `createPatientChecklistItem` / wrappers de objetivos | INSERT existente omite episodio; sigue creando NULL con autorización PSI legacy, sin copiar atribuciones del payload. Respuesta solo de la fila creada. |
| `updatePatientChecklistItem` / `updatePatientObjective` | SELECT por paciente/ID/tipo y UPDATE tienen ambos `episode_id IS NULL` condicionado a objetivo. Conserva la exigencia PSI de #26 y el 404 sin revelar atribución. |
| `deletePatientChecklistItem` / `deletePatientObjective` | UPDATE de retiro lógico exige NULL condicionado a objetivo. Sin fila modificada no registra auditoría ni historia; misma respuesta 404 que ID inexistente. |
| Rutas/controladores `/patients/:id/objectives` y `/:objectiveId` | Únicas entradas de escritura de objetivos: POST/PATCH/DELETE; permisos y validaciones previos conservados. Un ID objetivo en `/tasks` falla por `kind`; cambiar paciente tampoco lo convierte en recurso permitido. |
| `syncClinicalNoteTasks`, agregado `tasks`, [seguimiento](../backend/src/modules/patients/patients.follow-up.js), [recordatorios](../backend/src/modules/reminders/reminders.service.js) | Todos seleccionan/mutan exclusivamente `kind='task'`; no consumen objetivos ni necesitan filtro nuevo. Conteos/ranking de recordatorios y JSON de seguimiento no varían al introducir E1/E2. |
| Agenda/disponibilidad, auth/backoffice y auditoría operativa | Sin consultas de objetivos; no hay exportación clínica/histórica HTTP de `patient_tasks`. Backoffice mantiene la denegación clínica de sus tres roles y no publica eventos clínicos como auditoría operativa. |
| [API frontend](../frontend/src/api/patients.js), [mapper](../frontend/src/mappers/patients.js), [App](../frontend/src/App.jsx) y [NotesScreen](../frontend/src/screens/NotesScreen.jsx) | Solo consumen DTO de listado/detalle/creación/edición. Listas, primer objetivo pendiente, resumen lateral, conteos y avance se derivan de `patient.objetivos`; no existe consulta alternativa. Excluir antes del JSON evita filtrar existencia/estado a esos derivados. Tablero usa tareas, no objetivos. |
| [Resolutor existente de recursos](../backend/src/modules/episodes/episode.resource.js) y [política](../backend/src/modules/episodes/episode.policy.js) | Lectura estructural interna por episodio/ID/tipo, sin contenido ni rutas clínicas. Reutilizados sin cambios: identificación verificable, audiencia no verificada y todas las operaciones denegadas; no fuente de permisos legacy. |
| Baseline/seed, runner/migraciones, diagnóstico y fixtures | Herramientas de instalación/estructura explícitas, fuera de rutas operativas. Seed inserta objetivos ficticios y comprueba duplicados solo en instalación nueva; normalización enlaza exclusivamente tareas. Diagnóstico/runner validan integridad/huella, no proyectan objetivos a usuarios. SQL, manifiesto/hashes y herramientas existentes quedan intactos salvo el fixture de demo autorizado. Ninguna ejecución sobre bases existentes. |

### Pruebas y demo de este corte

[Suite HTTP/PostgreSQL ampliada](../backend/test/patient-projection.integration.test.js), en DB nueva con 008 antes de fixtures: dos episodios prepared E1/E2 del mismo paciente, responsables distintos y objetivos pendiente/completado. Compara el JSON HTTP completo antes/después de insertarlos para PAC, PSI con acceso y ajeno y los tres roles administrativos: listado/detalle/seguimiento/recordatorios/agenda/espera, más disponibilidad PSI. Comprueba por separado las respuestas PUT de ficha/entrevista.

Los intentos por ID, cruces de tipo y servicios directos comparan filas completas de tareas/pacientes, auditoría e historia tras cada denegación. Conserva CRUD de objetivos NULL y las regresiones #26 de completado PSI, lectura PAC y tareas interactivas. Una tarea atribuida conserva expresamente lectura, completado PAC, edición y retiro PSI legacy: este dominio no recibe aislamiento en el incremento. Dos intercalaciones deterministas atribuyen un objetivo inicialmente NULL mediante otra conexión SQL, con commit entre el precheck y el UPDATE real: edición y retiro devuelven 404 sin cambiar la fila atribuida, su historia ni auditoría. Es una inyección de prueba, sin vía de atribución productiva.

Reproducción autorizada, únicamente con Docker Linux disponible y recursos nuevos:

```bash
bash scripts/clinical-episodes.sh test
bash scripts/clinical-episodes.sh patient-projection-demo
python3 scripts/run-objective-ui-review.py UUID_NUEVO_IMPRESO_POR_LA_DEMO
bash scripts/clinical-episodes.sh cleanup UUID_NUEVO_IMPRESO_POR_LA_DEMO
```

La demo existente instala 008 en vacío y después crea objetivos ficticios E1/E2 del paciente P con profesionales A/B, ambos prepared. Cuentas ficticias: `a@episodes.invalid` (PSI con acceso legacy P), `b@episodes.invalid` (PSI ajeno), `p@episodes.invalid` (PAC propio), `q@episodes.invalid` (PAC ajeno); contraseña de desarrollo `Episode-Demo-Only-284!`. No tiene notas/citas atribuidas ni datos reales. No conectar esta base a otra aplicación ni a recursos habituales.

Recorrido esperado: PSI A abre expediente P → Objetivos: solo «Synthetic legacy objective», puede completar/desmarcar y crear otro objetivo NULL. PAC P consulta estados sin checkbox de objetivos y completa/desmarca su tarea. El driver comprueba el JSON autenticado y ausencia del marcador `FICTIONAL_EPISODE_OBJECTIVE_` en ambas vistas; los conteos y el avance 50% usan exclusivamente objetivos NULL. PSI B y PAC Q no acceden al expediente P, comprobado también por HTTP. Restablecer significa otra demo nueva; limpiar solo el UUID propio verificado.

**VERIFICADO localmente en este corte:**

| Comprobación | Resultado real |
| --- | --- |
| Guardas de imágenes/propiedad | 6/6 |
| Fundamentos SQL / unitarias backend | 116/116 y 181/181 |
| Integración HTTP/PostgreSQL completa | 360/360, incluidos seis casos nuevos; 17 fuentes declaradas |
| Frontend | 85/85, lint y build aprobados |
| Inventarios TAP/AST | Cuatro suites contrastadas con Node 24.22.0 fijado |
| Contratos CI offline | 53/53 aprobados en la repetición final; primer ensayo 52/53 por montaje local de cwd temporal, corregido fuera del repositorio |
| Chromium | 3/3 recorridos; tres capturas enmascaradas, cero errores registrados; PSI/PAC inspeccionados visualmente |
| Repositorio | 57 Markdown/1687 enlaces; 124 archivos protegidos idénticos y 17 hashes válidos; diff sin errores |

Proyecto test `b737e5d3-45a5-4eb8-9cf2-d2371029b578`; demo nueva `4ff235a9-6fa3-4b94-b4b0-d38278a3e71a`; revisión de navegador `c56c7e07-ec8f-49e4-b8d2-9d16b8d4874c`. PostgreSQL 17 tmpfs, red privada, sin puerto DB ni volúmenes persistentes; ambos proyectos y sus imágenes propios limpiados, once contenedores preexistentes conservados. Chromium 156.0.8078.4, Playwright 1.64.0, Node navegador v24.21.0. Sin herramientas instaladas en host ni operación de bases habituales.

Evidencia local: `/tmp/psicopanel-objective-isolation-tests.log`, `/tmp/psicopanel-objective-isolation-demo.log`, `/tmp/psicopanel-objective-isolation-browser.log`, `/tmp/psicopanel-objective-ci-offline-final.log` y `tmp/issue22/browser-result.json`/capturas. El primer log offline `/tmp/psicopanel-objective-ci-offline.log` conserva el fallo del montaje: el adaptador temporal de Node no montaba el cwd del repositorio ficticio anidado. Se corrigió el wrapper externo, sin modificar pruebas/CI ni omitir casos. Esta evidencia local no son artifacts de GitHub ni auditoría independiente.

**CI del HEAD final pendiente.** La matriz conserva `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence`, `ci/required`, CodeQL aplicable y artifacts 14 días sin modificar workflows ni catálogos obligatorios.

**Límites:** barrera negativa del dominio objetivo en servicios legacy, no política positiva ni aislamiento completo de 2A. Tareas y otros dominios conservan comportamiento previo y requieren su propio encargo; el acceso directo de un operador SQL no es una ruta legacy protegida por este servicio. La aplicación requiere la columna `episode_id` ya definida en 003 y conservada por 008; este PR no instala ni acredita ese esquema en entornos habituales y no añade un fallback ante su ausencia. SQL 001–017, AB-23, fallback, identidad y backoffice permanecen intactos. #30 abierto, sin habilitar tratamientos; activación y clínica general continúan denegadas (`prepared`, `allowed:false`, `audienceVerified:false`).
