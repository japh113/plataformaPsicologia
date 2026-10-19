# Mutaciones legacy — inventario revalidado y barrera B

Fecha: 18 de octubre de 2026. Base 0f2ebba (#10), contrastada contra los servicios/rutas de B. **AB-23 aprobado expresamente e implementado en rama; revisión/integración pendientes, sin despliegue habitual.** A documentó la propuesta; este encargo autoriza su cierre funcional global.

Se recorrieron [auth.routes](../backend/src/modules/auth/auth.routes.js), [auth.controller](../backend/src/modules/auth/auth.controller.js), [auth.service](../backend/src/modules/auth/auth.service.js), [patients.routes](../backend/src/modules/patients/patients.routes.js), [patients.controller](../backend/src/modules/patients/patients.controller.js), [patients.service](../backend/src/modules/patients/patients.service.js), [permisos](../backend/src/modules/auth/auth.permissions.js), SQL, scripts y clientes. Se buscaron todos los escritores de care_relationships, psychologist_patient_access y users.patient_id. Ningún inventario/ensayo consultó la base habitual.

## Entradas HTTP y resultado B

Prefijo /api. Denegaciones en servicio antes de adquirir cliente/transacción; no dependen de cuenta nueva, DOB, verificaciones, estado de relación o botones.

| Ruta | Resultado y pérdida funcional |
| --- | --- |
| POST /patients | 403: alta unilateral del psicólogo deshabilitada; no paciente/acceso nuevo. Sin registro delegado de menores como sustituto. |
| POST /auth/care-relationships/request | 403: sin solicitud nueva ni reapertura de rechazada/terminada. |
| POST /auth/care-relationships/invite | 403: sin invitación nueva ni reemisión/código. No búsqueda de paciente por email. |
| PATCH /auth/care-relationships/:id/respond | 403: no aceptar ni rechazar pendientes antiguos. Filas, códigos y accesos conservados. |
| POST /auth/care-relationships/accept-code | 403: no canje de códigos anteriores; deep link no activa relación. |
| POST /auth/care-relationships | 403 administrativo de #7 preservado para todos los estados. |
| PATCH /auth/care-relationships/:id | 403 administrativo de #7 preservado, también pending/ended/rejected. |
| POST /auth/register/patient | Adaptado: DOB adulta obligatoria, teléfono internacional y mínimos; 202 uniforme sin JWT/ID. Sin vínculo/acceso/episodio/intake y sin inferir históricos. |
| PATCH /auth/identity | Nuevo, paciente titular: solo firstName/lastName. DOB posterior y contactos rechazados; no IDs/rol del body. |
| PUT /patients/:id | Psicólogo con acceso existente: allowlist riskLevel/status/notes/reasonForConsultation. Identidad/contactos/edad/DOB y campos desconocidos rechazados. |
| PUT /patients/:id/interview | Capacidad clínica previa conservada; DOB de entrevista separada, no identidad ni elegibilidad adulta. Sin cuenta/relación nueva ni backfill. |
| DELETE /patients/:id | Preserva 409 de conservación y 404 fuera del ámbito. No desvincula ni cierra episodio. |
| POST /auth/register/psychologist | Mantiene pending_review sin vínculo/publicación. 202 uniforme sin ID también aquí: evita enumerar la tabla users por esta segunda entrada pública. |
| PATCH /auth/psychologists/:id/review | Revisión de cuenta de admin/superadmin conservada; support no aprueba. 002 mantiene revocación JWT. No crea/reasigna relaciones. |
| POST /auth/login y /password-reset/request, /confirm | Autenticación/recuperación anteriores preservadas. B no reutiliza previews de reset para verificación ni amplía recuperación remota. |
| POST /auth/verification/:channel/request, /confirm | Solo titular; sin destinos/IDs del cliente. SMS exige correo vigente verificado. Verificar nunca concede clínica. |

La UI retira selector/solicitud/invitación/canje/respuesta; muestra indisponibilidad temporal y relaciones existentes. El botón de alta unilateral está deshabilitado. GET /auth/care-relationships conserva lectura autorizada, sin inviteCode/invitePreview; no se borran los códigos de DB. GET /auth/psychologists/available devuelve 403 para toda cuenta autenticada, antes de consultar DB; no existe cliente/carga frontend del selector. El DTO clínico de vínculos también omite email profesional; nombres/IDs/estados se conservan. El backoffice mantiene solo su proyección operativa autorizada, inaccesible a pacientes. No se implementa directorio D.

## Escritores fuera de HTTP

| Entrada | Tratamiento B |
| --- | --- |
| syncLegacyRelationshipAccess | Eliminado con sus cuatro cuerpos mutadores del servicio auth; no se llama al denegar. No se sustituyó por otra sincronización. |
| schema.sql | Baseline legacy con normalizaciones y escritores; intacto. Solo instalación nueva aislada verificada; nunca upgrade de base habitual/existente. |
| seed.sql e inicialización Docker habitual | Intactos, no ejecutados sobre bases existentes. No son reconciliación, migración ni verificación histórica. |
| run-sql-file.js, db:schema/db:seed/db:init:dev, initialize-production.js | Guardas previas conservadas. El inicializador productivo sigue rechazando base no vacía e instala baseline/001/002 sin demo; 003/004 requieren runner explícito. |
| 001/002/003 y runner | Archivos/checksums históricos intactos; runner ampliado a 004 con mismas garantías de destino/huella/ledger/lock/rollback. |
| 004 | Aditiva: DOB nullable/evidencia/desafíos/cuotas e invalidación por contacto. Sin triggers de concesión clínica, backfill o cambio de datos históricos. |
| syntheticFixture, create-episode-demo, create-identity-demo y tests | Escritores explícitos ficticios solo en DB nueva verificada por sandbox. Demo B no inserta episodios; demo histórica SQL sigue diferenciada. No son flujos de alta funcional. |
| Normalizadores/SQL manual | No ejecutados como reparación ni conciliación. No se autorizan nuevas vinculaciones fuera de API. |

No hay otra ruta activa de actualización genérica de users/roles, reasignación de users.patient_id o activación funcional de episodios. El privilegio SQL de un operador puede eludir servicios; B no declara convertir la API en una frontera contra operadores DB.

## Lectores y clínica existente

buildPatientAccessScope sigue admitiendo relación activa O psychologist_patient_access. Se conservan los lectores y JOIN laterales de pacientes, notas/tareas/objetivos, citas/series/espera, disponibilidad y recordatorios. B no añade filtros por verificación a la atención ya establecida, ni activa permisos por episodio o retira parcialmente fallback.

La [suite B](../backend/test/identity.integration.test.js) prueba cuentas nuevas/históricas, denegación concurrente sin cambios en pacientes/usuarios/vínculos/accesos/episodios/auditoría, identidad profesional rechazada y continuidad clínica. Las suites de backoffice y clínica cubren roles administrativos y lectores/escritores laterales. [Resultados nuevos](patient-identity-validation.md).

Resolución/retención de pendientes antiguos, mecanismo de solicitud de corrección, nuevas invitaciones/solicitudes y activación/aislamiento por episodio permanecen pendientes. No existe alternativa bilateral autorizada en B/C/D para reemplazar las funciones temporalmente retiradas.
