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
