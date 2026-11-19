# Cumplimiento de objetivos exclusivo del psicólogo — Issue #22

**Estado vigente de la rama #78:** [retirada de objetivos globales](#retirada-de-objetivos-globales--cambio-de-alcance-de-78), aprobada por el propietario. El contrato y los resultados de #26 que siguen son históricos; RN-72 se conserva como requisito del producto por episodio, todavía sin reemplazo implementado.

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

**SUPERADO por el cambio de alcance aprobado de #78.** El [HEAD anterior 27702ae](https://github.com/japh113/plataformaPsicologia/blob/27702ae292a870a193d579442159a048aa69fac7/docs/objective-completion-authorization.md#aislamiento-negativo-de-objetivos-atribuidos-a-episodio--19-de-noviembre-de-2026) conserva inventario, código y evidencia de ese corte. No son pruebas de la retirada actual. La consulta incondicional a `episode_id` dependía de 003, mientras los inicializadores ordinarios terminan en 002; la retirada elimina el agregado, sin workaround ni ampliación del inicializador.

## Retirada de objetivos globales — cambio de alcance de #78

**APROBADO por el propietario:** retirar completamente los objetivos terapéuticos globales por paciente del runtime HTTP/UI, dentro del mismo Draft #78, conservando su historial. Base revalidada `c39aa542c27e5e3245a9144fe4369d999956e25e`, HEAD de partida `27702ae292a870a193d579442159a048aa69fac7`, rama `fix/legacy-objective-episode-isolation`. Sin merge, despliegue, otros dominios retirados ni reemplazo por episodio. RN-72 y ADR-016 continúan aprobados: solo el psicólogo responsable evaluará cumplimiento por episodio, con consulta/progreso para el paciente; implementación futura pendiente.

### Inventario y retirada completa

Búsqueda y lectura de todos los usos de `patient_tasks`, `kind`, `objective`, `objectives`, `objetivos`, callbacks, imports/exports y llamadores dinámicos. No se necesita modificar funcionalmente otros dominios; se adaptan sus pruebas cuando utilizaban la capacidad retirada.

| Consumidor | Resultado en la rama |
| --- | --- |
| [Rutas](../backend/src/modules/patients/patients.routes.js) y [controladores](../backend/src/modules/patients/patients.controller.js) | Eliminados POST `/patients/:id/objectives`, PATCH/DELETE `/:objectiveId` y sus imports/handlers. No se sustituyen por endpoints vacíos. Actores clínicos autorizados obtienen 404 del middleware general; sin sesión 401 y backoffice 403 previos, conservados. |
| [Servicio de pacientes](../backend/src/modules/patients/patients.service.js) | Eliminados agregado `objectives` y proyección del mapper. Listado/detalle y respuestas PUT de ficha/entrevista no incluyen contenido, ID, estado, referencias vacías ni derivados de objetivos. Eliminados exports de objetivos; funciones de tareas fijan internamente `kind='task'`, con consultas y permisos anteriores. Sin filtros `episode_id` ni dependencia nueva de esquema. |
| [Validadores](../backend/src/modules/patients/patients.tasks.validators.js) | Eliminado validador exclusivo de creación de objetivos. Conservados validadores de tareas, referencia obligatoria a nota y payload de actualización. |
| [Cliente API](../frontend/src/api/patients.js), [mapper](../frontend/src/mappers/patients.js), [App](../frontend/src/App.jsx) | Eliminados cliente CRUD, mapper, propiedad UI, imports, callbacks, estados de carga y props de objetivos globales. Un DTO obsoleto tampoco conserva objetivos o derivados por copia de propiedades. |
| [NotesScreen](../frontend/src/screens/NotesScreen.jsx) | Eliminados tab, editor, lista, checkbox, retiro, contadores, porcentaje, primer pendiente y resumen lateral de objetivos. Sin estado vacío que prometa esta capacidad. Espacio lateral solo cuando existe el bloque profesional de riesgo ya conservado. |
| Notas/tareas, seguimiento, recordatorios, agenda, disponibilidad | Conservados; sus lectores/escritores de checklist seleccionan tareas. `clinical_note_objective` sigue siendo narrativa profesional de nota, no objetivo global. El cambio no amplía su aislamiento ni sus permisos. |
| Resolver/política de episodios y SQL | Conservados sin cambios: tabla/tipo estructural `objective`, pertenencia/autoría 003/008 y resolver privado verificable. Todas las operaciones clínicas generales siguen denegadas. SQL 001–017, manifiesto/hashes/ledger sin cambios; ningún borrado ni migración de filas. |
| Fixtures, seed y diagnóstico explícito | Modelo/fixtures de objetivos permanecen solo como estructura o controles negativos sintéticos, fuera del HTTP/UI. No son compatibilidad funcional con demo ni se usan para reatribuir datos. Ensayos solo en destinos nuevos propios. |
| Pruebas/recorridos que antes operaban objetivos | Adaptados a retirada, sin conservar CRUD/progreso desaparecidos. Las carreras de notas y tareas usan tareas/perfil como disparadores y mantienen sus aserciones de privacidad, persistencia y recuperación. Driver de identidad mantiene su caso E03 y comprueba ausencia; no cambia el catálogo CI. |

### Verificación y reproducción

[Integración HTTP/PostgreSQL](../backend/test/patient-projection.integration.test.js) en dos bases nuevas distintas del mismo clúster efímero: instalación ordinaria 001–002 y fundación 008 instalada en vacío. Se comprueba explícitamente ausencia/presencia de la columna `episode_id`. Lecturas de ficha, tareas y respuestas PUT funcionan en 002, sin exigir capacidades de migraciones posteriores. En 008 se incorporan E1/E2 prepared con profesionales distintos y objetivos pendiente/completado del mismo paciente.

Las rutas retiradas se prueban con paciente propio/ajeno, profesional autorizado/ajeno y los tres roles administrativos, con IDs legacy, inexistentes, de otra persona, de tarea y atribuidos. POST/PATCH/DELETE no cambian filas completas, historial ni auditoría. Cruces hacia rutas de tarea tampoco operan objetivos. JSON completo de lectores laterales no varía con E1/E2. Unitarias verifican ausencia de exports/validador y que el mapper descarte DTO antiguos, conservando tareas y narrativa de nota. Se mantienen los casos útiles de privacidad, AB-23, identidad y admisión 013–017.

Con alcance autorizado para recursos nuevos aislados:

```bash
bash scripts/clinical-episodes.sh test
bash scripts/clinical-episodes.sh patient-projection-demo
python3 scripts/run-objective-ui-review.py UUID_NUEVO_IMPRESO_POR_LA_DEMO
bash scripts/clinical-episodes.sh cleanup UUID_NUEVO_IMPRESO_POR_LA_DEMO
```

La demo instala 008 antes de fixtures y conserva objetivos NULL/E1/E2 exclusivamente para comprobar ausencia. Cuentas ficticias A/B/P/Q en `@episodes.invalid`, contraseña de desarrollo `Episode-Demo-Only-284!`. PSI A abre expediente P: no tab/lista/progreso de objetivos; tareas y narrativa de nota siguen disponibles. PAC P abre detalle: misma ausencia y tareas completables/desmarcables. El driver exige cero llamadas UI a objetivos y 404 en llamadas explícitas a rutas retiradas. No conectar esta DB a recursos habituales; restablecer significa otro UUID nuevo.

Seguimiento/concurrencia conservados: crear otro `patient-follow-up-demo` nuevo y ejecutar `python3 scripts/run-patient-callback-ui-review.py UUID_NUEVO`; sus cuatro drivers conservan selección, cronología, recuperación, privacidad y carreras usando capacidades todavía activas. Identidad E03 comprueba ausencia de objetivos sin cambiar los casos obligatorios de CI.

**VERIFICADO localmente:** 116/116 fundamentos SQL, 181/181 unitarias backend, 371/371 integración completa HTTP/PostgreSQL (incluidos los 33 casos dirigidos 002/008), 85/85 frontend, lint/build, 53/53 contratos CI offline y navegador: 3/3 retirada, 15/15 selección/seguimiento/recuperación/concurrencia y 51/51 identidad B (incluido E03). Cero errores inesperados en las ejecuciones finales de navegador; vistas PSI/PAC de retirada inspeccionadas. Matriz completa ejecutada en otro destino nuevo, sin fallos, omisiones ni cancelaciones; 17 fuentes de integración declaradas. Cuatro inventarios TAP/AST contrastados con el runtime fijado; 57 Markdown/1688 enlaces válidos, 97 archivos protegidos idénticos y 17 hashes SQL válidos.

Proyectos propios: demo/HTTP dirigido `d011c35b-9905-4d9f-83f7-dfd77ba7326f`; seguimiento final `bb8bd39b-0ae3-4bfd-8d61-853034947f9a`; identidad B final `4e2a2e90-c66e-4bfa-b2d1-2ef16f11cff4`; matriz completa `80be23b4-d9b5-4fbe-a191-dc4051ddaea1`. PostgreSQL nuevo tmpfs, red privada, sin puerto DB ni volúmenes persistentes. Demos, identidad y matriz completa limpias; imágenes propias retiradas y tags preexistentes conservados. Once contenedores preexistentes conservados y seis intentos propios completamente limpios. Sin instalaciones en host ni bases habituales.

Primeras pasadas: una unitaria conservaba una llamada dinámica a servicios de objetivos eliminados (180/181); el driver de concurrencia necesitó normalizar una tarea completada por un recorrido previo. Ambos se corrigieron sin reducir las garantías conservadas. Un intento B se detuvo antes de iniciar DB porque su preflight coincidió con la limpieza de otra demo propia: se conservaron las guardas y la evidencia, se eliminaron solo sus dos imágenes verificadas por etiqueta, preservando los demás tags, y se repitió secuencialmente en otro UUID. No se modificaron guardas de propiedad, workflows, catálogos ni contratos CI; los drivers se adaptaron a la capacidad retirada.

Evidencia local: `/tmp/psicopanel-objective-retirement-focused-final.log`, `/tmp/psicopanel-objective-retirement-full.log`, `/tmp/psicopanel-objective-retirement-ci-offline.log`, `/tmp/psicopanel-objective-retirement-browser.log`, `/tmp/psicopanel-objective-retirement-followup-browser-final.log`, `/tmp/psicopanel-objective-retirement-identity-browser-final.log`, `tmp/issue22/browser-result.json`, `tmp/issue21-null-selection` y `tmp/ci-private/4e2a2e90-c66e-4bfa-b2d1-2ef16f11cff4/browser/out`. Son ensayos del árbol de trabajo nuevo antes de publicar; los metadatos Git del ejecutor B conservan 27702ae, no representan artifacts del HEAD remoto futuro. Los hashes de las 25 fuentes/pruebas/demos cambiadas se registran y contrastan antes de publicar. Los resultados de 27702ae y #26 siguen siendo históricos.

**CI/CodeQL y auditoría independiente pendientes del nuevo HEAD.** Siete checks obligatorios y artifacts de 14 días conservados, sin cambios de infraestructura ni workflows.

**Límites:** retirada de una capacidad legacy completa, sin permisos positivos ni reemplazo por episodio. Tareas, notas, citas, entrevista, disponibilidad, espera, recordatorios, identidad, backoffice y consentimiento permanecen activos bajo sus contratos anteriores. AB-23 y barreras del fallback de esas capacidades se conservan. No se declara 2A completo, RN-72 por episodio implementada ni tratamientos habilitados: `prepared`, `allowed:false`, `audienceVerified:false`. #30 permanece abierto. Planificación detallada de la estrategia C tras cerrar #78 y con aprobación separada.
