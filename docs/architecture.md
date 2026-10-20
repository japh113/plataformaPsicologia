# Arquitectura vigente de PsicoPanel

Estado D2: D1 integrado en main `2fe0799ee683273df2dbed872840bbfd2ef03f6d` mediante #17; D2 se implementa en rama nueva con PR Draft y ensayos nuevos aislados. [Contrato D2](private-professional-management.md), [evidencia D2](private-professional-validation.md). Sin merge, despliegue habitual, D3 ni nuevas vinculaciones.

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

[authMiddleware](../backend/src/middlewares/authMiddleware.js) verifica firma HS256, carga usuario vigente y comprueba estado y `session_version`. El rol efectivo viene de DB. Paciente con cuenta usa su `patientId`; profesional requiere cuenta activa y perfil aprobado para sesión ordinaria. D2 permite estado propio restringido para pendiente/rechazado/suspendido mediante clave, middleware y frontend separados. 002 conserva su revocación; 007 cubre las otras transiciones profesionales. Rehabilitar no revive JWT anteriores ni convierte una restringida en ordinaria. [Contrato D2](private-professional-management.md).

[auth.permissions.js](../backend/src/modules/auth/auth.permissions.js) distingue patient/psychologist y backoffice support/admin/superadmin. #7 deniega clínica ordinaria a los tres roles administrativos y restringe DTO/auditoría operativos. Admin/superadmin gestionan revisión autorizada; support lee operativa, no aprueba. No hay acceso maestro clínico ni emergencia implementada.

La autorización clínica **todavía es por paciente**: `buildPatientAccessScope` admite `care_relationships.status=active` O `psychologist_patient_access`. Existen JOIN directos a acceso heredado en citas, disponibilidad y recordatorios. El backend no usa clinical_episodes como fuente de permisos. Ese OR no debe retirarse parcialmente ni reutilizarse para habilitar nuevos episodios.

El [servicio auth](../backend/src/modules/auth/auth.service.js) mantiene login, recuperación y revisión profesional. Ambos registros públicos devuelven 202 uniforme sin sesión/ID para evitar enumeración de la tabla compartida; login posterior conserva JWT 002. Paciente exige DOB adulta global y teléfono internacional, sin entrevista/vínculo/acceso. Nombre propio y verificaciones residen en [identity.service](../backend/src/modules/auth/identity.service.js); [guía de contratos y autoridad de datos](patient-identity-verification.md).

AB-23 bloquea las cinco mutaciones legacy en servicio antes de DB. No existe ya un llamador de syncLegacyRelationshipAccess en esos servicios; los lectores/fallback y la atención existente se conservan. Edición profesional limita campos a riesgo/estado/contexto/motivo clínicos. DOB de entrevista sigue como dato clínico separado, sin copiar a identidad. Corrección posterior de DOB pendiente; contactos se cambian exclusivamente mediante el flujo C, no por edición genérica.

## Dominios y datos

| Dominio | Tablas/servicios existentes y límites |
| --- | --- |
| Identidad y cuentas | patients, users (patient_id único opcional), password_reset_tokens. Paciente conserva ID global. 004 añade patients.global_birth_date, contact_verification_state y contact_verification_challenges. Evidencia independiente por contacto, HMAC y cuotas compartidas PostgreSQL. 005 y servicio C añaden solicitudes/avisos privados, confirmación atómica y revocación total de sesiones; solo entrega simulada. |
| Profesional y vínculos | psychologist_profiles con título/cédula, aprobación y notas de revisión; care_relationships y psychologist_patient_access legacy. Sin versiones de credenciales, opt-in público o admisión independiente. Selector legacy deshabilitado (403 sin consulta) y sin carga frontend; DTO clínico de vínculos sin email profesional. Backoffice conserva proyección operativa autorizada. Directorio D pendiente. |
| Expediente | patient_intakes, patient_tasks (tareas/objetivos), patient_clinical_notes. Entrevista/riesgo/contexto se agregan por paciente; no están segmentados funcionalmente por episodio. Paciente tiene acciones limitadas de entrevista/actividades; no asumir toda la visión RN-24 implementada. |
| Agenda | appointments, appointment_waitlist_entries; citas/recurrencias, cancelación conservadora, espera manual priorizada y retiro sin borrar. Reglas de 60 min/hora exacta y nota/cita en servicios y 001; no confundirlas con toda la concurrencia objetivo de etapa 2D. |
| Disponibilidad | psychologist_availability y bloques, excepciones y bloques por fecha, controles de cobertura de citas futuras. Lecturas operativas dependen de accesos legacy. |
| Auditoría | audit_logs y clinical_record_history (001). Proyección operativa limitada por #7; historia de filas no es mecanismo seguro para copiar secretos o mensajes nuevos. Recordatorios se calculan en reminders, sin proveedor externo implementado. |

Servicios: [patients](../backend/src/modules/patients/patients.service.js), [appointments](../backend/src/modules/appointments/appointments.service.js), [availability](../backend/src/modules/availability/availability.service.js), [reminders](../backend/src/modules/reminders/reminders.service.js). Cancelar citas conserva filas; notas requieren cita completada y no futura; no se permite borrar expediente/nota. Edición actual de notas conserva versiones; **adendas e inmutabilidad finalizada de RN-23 aún no están implementadas**.

La elegibilidad adulta del registro B usa exclusivamente la referencia civil America/Mexico_City aprobada en su segunda revisión, independiente de la zona del host/cliente. No es una configuración global de zonas.

La política de día clínico aún usa America/Los_Angeles en partes de aplicación/001; etapa 2E sigue pendiente. No cambiar zona ni interpretar histórico por efecto de esta documentación.

## SQL integrado y fundamentos no activados

[Schema](../backend/sql/schema.sql) es baseline legacy con transformaciones; [seed](../backend/sql/seed.sql) contiene demo y cambios de filas. No son upgrades seguros de bases existentes. Inicialización local Docker nueva ejecuta schema+seed y luego 001/002; db:schema agrega 001/002. [initialize-production.js](../backend/scripts/initialize-production.js) exige base vacía, sin seed, e instala schema/001/002. **Ninguno instala 003 automáticamente.**

| Migración integrada | Garantía implementada en SQL | Límite |
| --- | --- | --- |
| [001](../backend/sql/migrations/001_clinical_data_integrity.sql) | Conservación de registros, historial, integridad de nota/cita y restricciones históricas | No implementar adendas o consentimientos por implicación; no modificar el archivo. |
| [002](../backend/sql/migrations/002_auth_session_version.sql) | Revocación persistente JWT por session_version y estados | C reutiliza session_version para revocar todas las sesiones al confirmar contacto; no modifica 002. |
| [003](../backend/sql/migrations/003_clinical_episode_foundation.sql) | clinical_episodes independiente, active/paused/finalized, uno active/paused por paciente, identidad/terminalidad y referencias compuestas opcionales episode_id en citas/notas/tareas/espera | Backend actual escribe sin atribución; sin backfill histórico, nuevas rutas ni autorización por episodio. Tenerla integrada no acredita ejecución en entorno habitual. |
| [004](../backend/sql/migrations/004_patient_identity_verification.sql) | DOB global nullable, evidencia/desafíos privados, cuotas e invalidación por contacto | Solo B; sin backfill, acceso clínico nuevo o despliegue habitual. |
| [005](../backend/sql/migrations/005_secure_contact_changes.sql) | Solicitud privada cifrada, desafío por propósito, autorización por sesión, eventos mínimos y avisos durables; confirmación C revoca todas las sesiones | Integrada en #12; sin backfill ni despliegue habitual acreditado. |

[Runner](../backend/scripts/episode-migration.js) y [CLI](../backend/scripts/migrate.js) reconocen 001–006 y targets explícitos 003/004/005/006; conservan destino, checksums históricos, ledger, lock, transacción y huella de la última versión. No admiten downgrade ni adopción de estructuras no registradas. Procedimiento en [fundamentos 003](clinical-episodes-foundation.md); evidencia histórica en [validación #8](clinical-episodes-validation.md) y [validación final C](contact-change-deadline-validation.md).

## Persistencia D1 integrada y gestión privada D2

[Contrato 006](professional-persistence.md): perfiles bajo demanda, reservas UUID inmutables, catálogo controlado, versiones/decisiones/validez separadas y fotografías solo metadatos. D1 se integró mediante #17. D2 agrega servicios privados, sesiones restringidas, revisión exacta y procesamiento real de fotografías, con 007 sucesora y sin reescribir 006. [Contrato D2](private-professional-management.md), [evidencia propia](private-professional-validation.md). Aprobación operativa de credenciales, catálogo concreto, publicación/admisión y lectores D3 permanecen deshabilitados.

## Límites de B/C y diseño pendiente

[Plan A/B/C/D](identity-directory-delivery-plan.md): A/B/C integrados; D1 prepara 006 privada; gestión/revisión D2 y directorio/retiro D3 pendientes. 004/005 integradas y 006 en rama, sin despliegue habitual acreditado. El resto del [diseño 2A](stage2a-identity-directory-intake.md) sigue propuesto. ADR-029/RN-59–61 exigen entrevista validada antes de activar todo episodio nuevo; la precondición backend/DB sigue pendiente, con relaciones legacy sin reinterpretación.

Solicitudes/invitaciones nuevas, permisos/activación por episodio, derivaciones, adendas, consentimientos de antecedentes, recuperación excepcional y menores siguen pendientes. No tratar una cuenta verificada o un perfil público como vínculo asistencial. No afirmar que los límites actuales por paciente ya aíslan episodios.

## Pruebas, documentación y dirección futura

Existen unitarias Node y suites HTTP/PostgreSQL en [backend/test](../backend/test); frontend tiene `npm test`, lint y build. [Desarrollo](development.md) centraliza herramientas y destinos aislados; los ensayos requieren alcance autorizado. B/C conservan evidencia histórica de pruebas/demo en recursos UUID nuevos. El wrapper actual no ejecuta `frontend npm test` ni automatiza por sí solo las revisiones Chromium; [CI integrada](ci-implementation.md) cubre por separado esas brechas.

Dirección futura: React Native/Expo, Node/TypeScript/Express, PostgreSQL, alojamiento Railway/Render, auth propia y Expo Notifications; R2 para archivos y Resend para emails son referencias futuras, **no proveedores contratados o autorizados para B/C/D**. Google Calendar/WhatsApp también son futuros. Mantener lógica en servicios y contratos reutilizables; no migrar stack ni incorporar estos servicios en PR A.
