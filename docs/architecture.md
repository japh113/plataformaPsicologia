# Arquitectura vigente de PsicoPanel

Estado operativo al 29 de octubre de 2026: base `main` `a1720245083008399a3543ca4b794ec4d1289d5a` (merge #27). A/B/C/D1/D2 y #25–#27 integrados; Issues #21–#23 cerrados. [Resumen vigente, backlog y cortes históricos](operational-status.md). D3, nuevas vinculaciones y activación/permisos por episodio pendientes. #19/#24 documentaron producto de pareja, sin implementar su motor. Integración en Git y pruebas aisladas no acreditan instalación ni despliegue habitual.

[Producto](product/vision.md), [reglas](product/business-rules.md) y [decisiones](product/decisions.md) definen objetivos; esta página describe la implementación y sus límites. [GitHub Actions/CI](ci-implementation.md) está integrado y sus siete checks son obligatorios; sus resultados no acreditan capacidades clínicas pendientes.

## Aplicación implementada

| Capa | Implementación y responsabilidades |
| --- | --- |
| Web | React 19 + Vite 8, JavaScript/JSX y Tailwind. [App.jsx](../frontend/src/App.jsx) concentra sesión, carga de dominios y callbacks. [api/client.js](../frontend/src/api/client.js) usa fetch, Bearer JWT en localStorage y VITE_API_URL. Pantallas de login, dashboard, pacientes, expediente/notas, agenda y backoffice; no hay router público de directorio implementado. |
| API | Node/Express 4 en JavaScript ES modules. [app.js](../backend/src/app.js) monta /api/auth y /api/health, más patients/appointments/availability/reminders protegidos por authenticate y authorizeClinical. Cada módulo separa rutas/controlador/servicio y validación donde aplica. |
| Persistencia | PostgreSQL 17 en Docker de desarrollo, consultas parametrizadas con pg y transacciones explícitas en servicios. [db.js](../backend/src/config/db.js) resuelve configuración; no asumir que una base tiene todas las migraciones por arrancar API. |
| Operación local | [compose.yaml](../compose.yaml): frontend/API en loopback 5173/5000; DB sin puerto público en red internal, volumen persistente. Imágenes Node 24 con npm ci; montajes fuente de solo lectura y polling. No es arquitectura de producción. |

Las APIs por dominio están en [frontend/src/api](../frontend/src/api), y los mappers en [frontend/src/mappers](../frontend/src/mappers). La mayoría de notas, tareas y objetivos vive en patients; no existen módulos activos separados notes/tasks. La concentración de estado en App y pantallas grandes es deuda conocida, no encargo de refactor o migración.

## Autenticación y permisos actuales

Contrato funcional posterior de 2A, base `main` `e15610289614c4e8eee03ac4fca875810d1439a3` (#43): [ADR-031](product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades), [inventario actual/matriz objetivo](patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo) y [admisión en dos modalidades](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo). Es contrato documental pendiente de motor; los servicios descritos debajo siguen autorizando por paciente. La capacidad limitada de admisión dirigida no existe aún y no debe obtenerse activando provisionalmente un episodio ordinario. RN-28/ADR-018 descartan migrar/conciliar filas demo, conservando historia técnica SQL y límites sobre bases existentes.

[authMiddleware](../backend/src/middlewares/authMiddleware.js) verifica firma HS256, carga usuario vigente y comprueba estado y `session_version`. El rol efectivo viene de DB. Paciente con cuenta usa su `patientId`; profesional requiere cuenta activa y perfil aprobado para sesión ordinaria. D2 permite estado propio restringido para pendiente/rechazado/suspendido mediante clave, middleware y frontend separados. 002 conserva su revocación; 007 cubre las otras transiciones profesionales. Rehabilitar no revive JWT anteriores ni convierte una restringida en ordinaria. [Contrato D2](private-professional-management.md).

[auth.permissions.js](../backend/src/modules/auth/auth.permissions.js) distingue patient/psychologist y backoffice support/admin/superadmin. #7 deniega clínica ordinaria a los tres roles administrativos y restringe DTO/auditoría operativos. Admin/superadmin gestionan revisión autorizada; support lee operativa, no aprueba. No hay acceso maestro clínico ni emergencia implementada.

La autorización clínica **todavía es por paciente**: `buildPatientAccessScope` admite `care_relationships.status=active` O `psychologist_patient_access`. Existen JOIN directos a acceso heredado en citas, disponibilidad y recordatorios. El backend no usa clinical_episodes como fuente de permisos. Ese OR no debe retirarse parcialmente ni reutilizarse para habilitar nuevos episodios.

El [servicio auth](../backend/src/modules/auth/auth.service.js) mantiene login, recuperación y revisión profesional. Ambos registros públicos devuelven 202 uniforme sin sesión/ID para evitar enumeración de la tabla compartida; login posterior conserva JWT 002. Paciente exige DOB adulta global y teléfono internacional, sin entrevista/vínculo/acceso. Nombre propio y verificaciones residen en [identity.service](../backend/src/modules/auth/identity.service.js); [guía de contratos y autoridad de datos](patient-identity-verification.md).

AB-23 bloquea las cinco mutaciones legacy en servicio antes de DB. No existe ya un llamador de syncLegacyRelationshipAccess en esos servicios; los lectores/fallback y la atención existente se conservan. Edición profesional limita campos a riesgo/estado/contexto/motivo clínicos. DOB de entrevista sigue como dato clínico separado, sin copiar a identidad. Corrección posterior de DOB pendiente; contactos se cambian exclusivamente mediante el flujo C, no por edición genérica.

## Dominios y datos

| Dominio | Tablas/servicios existentes y límites |
| --- | --- |
| Identidad y cuentas | patients, users (patient_id único opcional), password_reset_tokens. Paciente conserva ID global. 004 añade patients.global_birth_date, contact_verification_state y contact_verification_challenges. Evidencia independiente por contacto, HMAC y cuotas compartidas PostgreSQL. 005 y servicio C añaden solicitudes/avisos privados, confirmación atómica y revocación total de sesiones; solo entrega simulada. |
| Profesional y vínculos | psychologist_profiles conserva aprobación de cuenta y datos legacy; care_relationships y psychologist_patient_access siguen como lectores legacy. 006 añade versiones/decisiones y preferencias privadas independientes. D2 implementa gestión privada y 007; ninguna API habilita opt-in o admisión. Selector legacy sigue 403 sin consulta; directorio D3 pendiente. |
| Expediente | patient_intakes, patient_tasks (tareas/objetivos), patient_clinical_notes. Entrevista/riesgo/contexto se agregan por paciente; no están segmentados funcionalmente por episodio. Paciente tiene acciones limitadas de entrevista/actividades; no asumir toda la visión RN-24 implementada. |
| Agenda | appointments, appointment_waitlist_entries; citas/recurrencias, cancelación conservadora, espera manual priorizada y retiro sin borrar. Reglas de 60 min/hora exacta y nota/cita en servicios y 001; no confundirlas con toda la concurrencia objetivo de etapa 2D. |
| Disponibilidad | psychologist_availability y bloques, excepciones y bloques por fecha, controles de cobertura de citas futuras. Lecturas operativas dependen de accesos legacy. |
| Auditoría | audit_logs y clinical_record_history (001). Proyección operativa limitada por #7; historia de filas no es mecanismo seguro para copiar secretos o mensajes nuevos. Recordatorios se calculan en reminders, sin proveedor externo implementado. |

Servicios: [patients](../backend/src/modules/patients/patients.service.js), [appointments](../backend/src/modules/appointments/appointments.service.js), [availability](../backend/src/modules/availability/availability.service.js), [reminders](../backend/src/modules/reminders/reminders.service.js). Cancelar citas conserva filas; notas requieren cita completada y no futura; no se permite borrar expediente/nota. Edición actual de notas conserva versiones; **adendas e inmutabilidad finalizada de RN-23 aún no están implementadas**.

Proyecciones de respuesta de expediente y tareas por actor: solo el psicólogo autorizado recibe contexto general, riesgo y objetivo de nota profesional. El paciente conserva tareas, referencias de seguimiento y respuestas propias de entrevista; las respuestas de escritura usan la misma proyección. [Contrato y evidencia del Issue #23](patient-response-privacy.md). La autorización legacy por paciente permanece intacta.

Cronología del paciente: `GET /api/patients/:id/follow-up` devuelve consultas completadas y tareas vinculadas solo por nota/cita del mismo paciente, con histórico sin vínculo aparte. Lector mínimo independiente, autorización legacy conservada y fechas civiles de la cita; el tablero y «Mi seguimiento» comparten grupos sin publicar notas profesionales. [Contrato y evidencia Issue #21](patient-follow-up.md).

Cumplimiento de objetivos: controlador y servicio exigen psicólogo, conservando alcance por paciente y filtro de tipo. El paciente consulta estados/progreso y puede completar sus tareas; la interfaz y el callback de objetivos respetan esa distinción. [Contrato y evidencia del Issue #22](objective-completion-authorization.md).

La elegibilidad adulta del registro B usa exclusivamente la referencia civil America/Mexico_City aprobada en su segunda revisión, independiente de la zona del host/cliente. No es una configuración global de zonas.

La política de día clínico aún usa America/Los_Angeles en partes de aplicación/001; etapa 2E sigue pendiente. No cambiar zona ni interpretar histórico por efecto de esta documentación.

## SQL integrado y fundamentos no activados

[Schema](../backend/sql/schema.sql) es baseline legacy con transformaciones; [seed](../backend/sql/seed.sql) contiene demo y cambios de filas. No son upgrades seguros de bases existentes. Inicialización local Docker nueva ejecuta schema+seed y luego 001/002; db:schema agrega 001/002. [initialize-production.js](../backend/scripts/initialize-production.js) exige base vacía, sin seed, e instala schema/001/002. **Ninguno instala 003–008 automáticamente.**

| Migración integrada | Garantía implementada en SQL | Límite |
| --- | --- | --- |
| [001](../backend/sql/migrations/001_clinical_data_integrity.sql) | Conservación de registros, historial, integridad de nota/cita y restricciones históricas | No implementar adendas o consentimientos por implicación; no modificar el archivo. |
| [002](../backend/sql/migrations/002_auth_session_version.sql) | Revocación persistente JWT por session_version y estados | C reutiliza session_version para revocar todas las sesiones al confirmar contacto; no modifica 002. |
| [003](../backend/sql/migrations/003_clinical_episode_foundation.sql) | clinical_episodes independiente, active/paused/finalized, uno active/paused por paciente, identidad/terminalidad y referencias compuestas opcionales episode_id en citas/notas/tareas/espera | Backend actual escribe sin atribución; sin backfill histórico, nuevas rutas ni autorización por episodio. Tenerla integrada no acredita ejecución en entorno habitual. |
| [004](../backend/sql/migrations/004_patient_identity_verification.sql) | DOB global nullable, evidencia/desafíos privados, cuotas e invalidación por contacto | Solo B; sin backfill, acceso clínico nuevo o despliegue habitual. |
| [005](../backend/sql/migrations/005_secure_contact_changes.sql) | Solicitud privada cifrada, desafío por propósito, autorización por sesión, eventos mínimos y avisos durables; confirmación C revoca todas las sesiones | Integrada en #12; sin backfill ni despliegue habitual acreditado. |
| [006](../backend/sql/migrations/006_professional_directory_foundation.sql) | Persistencia profesional privada, snapshots, decisiones y preferencias | D1/#17 integrado; instalación habitual sin acreditar. |
| [007](../backend/sql/migrations/007_private_professional_management.sql) | Gestión privada D2, revocación restringida, preferencias y reservas fotográficas | D2/#18 integrado; no publica perfiles ni acredita instalación habitual. |
| [008](../backend/sql/migrations/008_episode_participants_foundation.sql) | En esta rama: cabecera individual/pareja, CEP con privilegio mínimo, creador independiente, FK/autoría individual, prepared sin fechas e historia por episodio | Sin activación, permisos nuevos ni despliegue; solo destino vacío aislado. [Evidencia](episode-participants-validation.md). |

[Runner](../backend/scripts/episode-migration.js) y [CLI](../backend/scripts/migrate.js) reconocen 001–008 y targets explícitos 003/004/005/006/007/008; conservan destino, checksums históricos, ledger, lock, transacción y huella de la última versión. No admiten downgrade ni adopción de estructuras no registradas. La vista D1 se verifica también sobre 007 con requisito TEMP. Procedimiento histórico en [fundamentos 003](clinical-episodes-foundation.md); [contrato D2](private-professional-management.md).

## Persistencia D1 integrada y gestión privada D2

[Contrato 006](professional-persistence.md): perfiles bajo demanda, reservas UUID inmutables, catálogo controlado, versiones/decisiones/validez separadas y fotografías solo metadatos. D1 se integró mediante #17. D2 agrega servicios privados, sesiones restringidas, revisión exacta y procesamiento real de fotografías, con 007 sucesora y sin reescribir 006. [Contrato D2](private-professional-management.md), [evidencia propia](private-professional-validation.md). Aprobación operativa de credenciales, catálogo concreto, publicación/admisión y lectores D3 permanecen deshabilitados.

## Límites de B/C y diseño pendiente

**Producto posterior a D2 — ADR-030, pendiente de implementación:** [episodios paralelos y pareja](parallel-couple-episodes.md) permiten varios tratamientos por paciente, con un responsable por episodio y participantes explícitos (uno individual, dos pareja). Vinculación independiente no deriva otro tratamiento; derivar uno cierra origen/abre destino sin reasignar historia y deja los demás intactos. Pareja exige confirmación expresa de ambos pacientes; confidencialidad detallada pendiente. El índice `clinical_episodes_one_current_patient_idx` y `patient_id` singular de 003 son incompatibles con ese dominio futuro; se conservan donde no esté instalada 008. Esta rama evoluciona la composición y FK en destinos vacíos aislados, con prepared como única posibilidad; concurrencia clínica y permisos por episodio/participante/alcance siguen pendientes. No basta quitar el índice: lectores por paciente/fallback no aíslan episodios. La representación mínima de 008 está implementada sin activar funciones clínicas ni inferir participantes legacy. 2A aporta fundamentos/privacidad/entrevista propia; 2B flujos delimitados conservando resumen y consentimiento vigentes. AB-23 y ADR-029/RN-59–61 no se debilitan.

[Plan A/B/C/D](identity-directory-delivery-plan.md): A/B/C/D1/D2 integrados; D3 pendiente. Ninguna integración acredita despliegue habitual. El resto del [diseño 2A](stage2a-identity-directory-intake.md) sigue propuesto. ADR-029/RN-59–61 exigen entrevista validada antes de activar todo episodio nuevo; la precondición backend/DB sigue pendiente, con relaciones legacy sin reinterpretación.

Solicitudes/invitaciones nuevas, permisos/activación por episodio, derivaciones, adendas, consentimientos de antecedentes, recuperación excepcional y menores siguen pendientes. No tratar una cuenta verificada o un perfil público como vínculo asistencial. No afirmar que los límites actuales por paciente ya aíslan episodios.

## Propuesta técnica posterior a #44

**Antecedente documental #45**, corte `main` `8cb08bb82116acec94f7b86fbed6f288cb2f35fb` del 30 de octubre de 2026: [fundamentos propuestos](clinical-episodes-foundation.md#propuesta-técnica-2a--participantes-pertenencia-y-autoría) concretan una sucesora futura de 007 con composición inmutable, tabla de pertenencia, autoría y FK de recursos individuales, historia de cabecera y contenedores internos sin activación. [Autor/sujeto/audiencia y corte legacy](patient-response-privacy.md#vinculación-técnica-propuesta-de-autor-sujeto-y-audiencia) precisan la frontera posterior; [roadmap](product/roadmap.md#incremento-propuesto-de-fundamentos-tras-44) delimita un primer PR pequeño y las dependencias. En aquel corte eran propuestas técnicas sin tablas/estado prepared implementados, sin resolver pausados AB-37 ni conceder clínica. La arquitectura vigente descrita arriba permanece por paciente. No inferir instalación, datos migrados o despliegue de esta especificación.

## Pruebas, documentación y dirección futura

Existen unitarias Node y suites HTTP/PostgreSQL en [backend/test](../backend/test); frontend tiene `npm test`, lint y build. [Desarrollo](development.md) centraliza herramientas y destinos aislados; los ensayos requieren alcance autorizado. B/C conservan evidencia histórica de pruebas/demo en recursos UUID nuevos. El wrapper actual no ejecuta `frontend npm test` ni automatiza por sí solo las revisiones Chromium; [CI integrada](ci-implementation.md) cubre por separado esas brechas.

Dirección futura: React Native/Expo, Node/TypeScript/Express, PostgreSQL, alojamiento Railway/Render, auth propia y Expo Notifications; R2 para archivos y Resend para emails son referencias futuras, **no proveedores contratados o autorizados para B/C/D**. Google Calendar/WhatsApp también son futuros. Mantener lógica en servicios y contratos reutilizables; migrar stack o incorporar estos servicios requiere alcance y autorización propios.

El [incremento 008 de esta rama](clinical-episodes-foundation.md#implementación-del-incremento-008--sin-activación) sucede a ese antecedente: modelo estructural probado, sin activar clínica ni cambiar la autorización legacy descrita arriba; instalación habitual/despliegue pendientes.
