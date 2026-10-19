# Arquitectura vigente de PsicoPanel

Corte: 18 de octubre de 2026, código `0077f46` (merge #9). PR A modifica documentación, no comportamiento. [Producto](product/vision.md), [reglas](product/business-rules.md) y [decisiones](product/decisions.md) definen objetivos; esta página describe la implementación y sus límites.

## Aplicación implementada

| Capa | Implementación y responsabilidades |
| --- | --- |
| Web | React 19 + Vite 8, JavaScript/JSX y Tailwind. [App.jsx](../frontend/src/App.jsx) concentra sesión, carga de dominios y callbacks. [api/client.js](../frontend/src/api/client.js) usa fetch, Bearer JWT en localStorage y VITE_API_URL. Pantallas de login, dashboard, pacientes, expediente/notas, agenda y backoffice; no hay router público de directorio implementado. |
| API | Node/Express 4 en JavaScript ES modules. [app.js](../backend/src/app.js) monta /api/auth y /api/health, más patients/appointments/availability/reminders protegidos por authenticate y authorizeClinical. Cada módulo separa rutas/controlador/servicio y validación donde aplica. |
| Persistencia | PostgreSQL 17 en Docker de desarrollo, consultas parametrizadas con pg y transacciones explícitas en servicios. [db.js](../backend/src/config/db.js) resuelve configuración; no asumir que una base tiene todas las migraciones por arrancar API. |
| Operación local | [compose.yaml](../compose.yaml): frontend/API en loopback 5173/5000; DB sin puerto público en red internal, volumen persistente. Imágenes Node 24 con npm ci; montajes fuente de solo lectura y polling. No es arquitectura de producción. |

Las APIs por dominio están en [frontend/src/api](../frontend/src/api), y los mappers en [frontend/src/mappers](../frontend/src/mappers). La mayoría de notas, tareas y objetivos vive en patients; no existen módulos activos separados notes/tasks. La concentración de estado en App y pantallas grandes es deuda conocida, no encargo de refactor o migración.

## Autenticación y permisos actuales

[authMiddleware](../backend/src/middlewares/authMiddleware.js) verifica firma HS256, carga usuario vigente y comprueba estado y `session_version`. El rol efectivo viene de DB. Paciente con cuenta usa su `patientId`; profesional requiere cuenta activa y perfil aprobado. Pendiente/rechazado/suspendido no puede iniciar sesión clínica. 002 revoca JWT por cambio de contraseña/inactivación o salida de aprobación activa; rehabilitar no revive JWT anteriores.

[auth.permissions.js](../backend/src/modules/auth/auth.permissions.js) distingue patient/psychologist y backoffice support/admin/superadmin. #7 deniega clínica ordinaria a los tres roles administrativos y restringe DTO/auditoría operativos. Admin/superadmin gestionan revisión autorizada; support lee operativa, no aprueba. No hay acceso maestro clínico ni emergencia implementada.

La autorización clínica **todavía es por paciente**: `buildPatientAccessScope` admite `care_relationships.status=active` O `psychologist_patient_access`. Existen JOIN directos a acceso heredado en citas, disponibilidad y recordatorios. El backend no usa clinical_episodes como fuente de permisos. Ese OR no debe retirarse parcialmente ni reutilizarse para habilitar nuevos episodios.

El [servicio auth](../backend/src/modules/auth/auth.service.js) contiene registro, recuperación de contraseña, vínculos y revisión inicial. Registro independiente ya inserta cuenta/paciente sin vínculo, pero admite edad/motivo y fija riesgo none/estado active globales; no implementa DOB adulta ni verificaciones. Contactos/nombres se duplican en users/patients; DOB actual está en patient_intakes. Actualización profesional de pacientes todavía mezcla identidad y clínica. El [inventario legacy](stage2a-legacy-mutations.md) identifica escritores y riesgos para cuentas nuevas y existentes; sus bloqueos son propuestas, no cambios actuales.

## Dominios y datos

| Dominio | Tablas/servicios existentes y límites |
| --- | --- |
| Identidad y cuentas | patients, users (patient_id único opcional), password_reset_tokens. Paciente conserva ID global. No hay evidencia de email/SMS ni cambio seguro de contacto implementados. |
| Profesional y vínculos | psychologist_profiles con título/cédula, aprobación y notas de revisión; care_relationships y psychologist_patient_access legacy. Sin versiones de credenciales, opt-in público o admisión independiente. Directorio autenticado existente expone email: no hacerlo público. |
| Expediente | patient_intakes, patient_tasks (tareas/objetivos), patient_clinical_notes. Entrevista/riesgo/contexto se agregan por paciente; no están segmentados funcionalmente por episodio. Paciente tiene acciones limitadas de entrevista/actividades; no asumir toda la visión RN-24 implementada. |
| Agenda | appointments, appointment_waitlist_entries; citas/recurrencias, cancelación conservadora, espera manual priorizada y retiro sin borrar. Reglas de 60 min/hora exacta y nota/cita en servicios y 001; no confundirlas con toda la concurrencia objetivo de etapa 2D. |
| Disponibilidad | psychologist_availability y bloques, excepciones y bloques por fecha, controles de cobertura de citas futuras. Lecturas operativas dependen de accesos legacy. |
| Auditoría | audit_logs y clinical_record_history (001). Proyección operativa limitada por #7; historia de filas no es mecanismo seguro para copiar secretos o mensajes nuevos. Recordatorios se calculan en reminders, sin proveedor externo implementado. |

Servicios: [patients](../backend/src/modules/patients/patients.service.js), [appointments](../backend/src/modules/appointments/appointments.service.js), [availability](../backend/src/modules/availability/availability.service.js), [reminders](../backend/src/modules/reminders/reminders.service.js). Cancelar citas conserva filas; notas requieren cita completada y no futura; no se permite borrar expediente/nota. Edición actual de notas conserva versiones; **adendas e inmutabilidad finalizada de RN-23 aún no están implementadas**.

La política de día clínico aún usa America/Los_Angeles en partes de aplicación/001; etapa 2E sigue pendiente. No cambiar zona ni interpretar histórico por efecto de esta documentación.

## SQL integrado y fundamentos no activados

[Schema](../backend/sql/schema.sql) es baseline legacy con transformaciones; [seed](../backend/sql/seed.sql) contiene demo y cambios de filas. No son upgrades seguros de bases existentes. Inicialización local Docker nueva ejecuta schema+seed y luego 001/002; db:schema agrega 001/002. [initialize-production.js](../backend/scripts/initialize-production.js) exige base vacía, sin seed, e instala schema/001/002. **Ninguno instala 003 automáticamente.**

| Migración integrada | Garantía implementada en SQL | Límite |
| --- | --- | --- |
| [001](../backend/sql/migrations/001_clinical_data_integrity.sql) | Conservación de registros, historial, integridad de nota/cita y restricciones históricas | No implementar adendas o consentimientos por implicación; no modificar el archivo. |
| [002](../backend/sql/migrations/002_auth_session_version.sql) | Revocación persistente JWT por session_version y estados | Cambios de contacto todavía no incorporados; no modificar el archivo. |
| [003](../backend/sql/migrations/003_clinical_episode_foundation.sql) | clinical_episodes independiente, active/paused/finalized, uno active/paused por paciente, identidad/terminalidad y referencias compuestas opcionales episode_id en citas/notas/tareas/espera | Backend actual escribe sin atribución; sin backfill histórico, nuevas rutas ni autorización por episodio. Tenerla integrada no acredita ejecución en entorno habitual. |

[Runner](../backend/scripts/episode-migration.js) y [CLI](../backend/scripts/migrate.js) aceptan solo 001–003/target 003, con destino explícito, checksums, ledger y huella de catálogo. Nuevas sucesoras requieren evolución revisada, no DDL manual que borre la evidencia de deriva. Procedimiento en [fundamentos 003](clinical-episodes-foundation.md); evidencia histórica en [validación #8](clinical-episodes-validation.md).

## Diseño aprobado como producto, no implementado

[Plan A/B/C/D](identity-directory-delivery-plan.md): B registro adulto/básicos/verificación; C cambio seguro de contactos; D perfiles/revisión/directorio y retiro público. Solo A está autorizado hoy. ADR-023–028 fija requisitos, no aprueba todos los mecanismos del [diseño 2A](stage2a-identity-directory-intake.md). 004–006 son estimaciones, no migraciones creadas.

Solicitudes/invitaciones nuevas, permisos/activación por episodio, derivaciones, adendas, consentimientos de antecedentes, recuperación excepcional y menores siguen pendientes. No tratar una cuenta verificada o un perfil público como vínculo asistencial. No afirmar que los límites actuales por paciente ya aíslan episodios.

## Pruebas, documentación y dirección futura

Existen unitarias Node y suites HTTP/PostgreSQL en [backend/test](../backend/test); frontend dispone de lint/build, sin script propio de tests. [Desarrollo](development.md) centraliza herramientas, Docker/WSL, pruebas y destinos aislados; los ensayos requieren alcance autorizado. PR A no ejecuta bases/demos o pruebas funcionales.

Dirección futura: React Native/Expo, Node/TypeScript/Express, PostgreSQL, alojamiento Railway/Render, auth propia y Expo Notifications; R2 para archivos y Resend para emails son referencias futuras, **no proveedores contratados o autorizados para B/C/D**. Google Calendar/WhatsApp también son futuros. Mantener lógica en servicios y contratos reutilizables; no migrar stack ni incorporar estos servicios en PR A.
