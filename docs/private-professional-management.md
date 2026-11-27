# D2 — Gestión profesional exclusivamente privada

Base: main `2fe0799ee683273df2dbed872840bbfd2ef03f6d`, merge de [D1 #17](https://github.com/japh113/plataformaPsicologia/pull/17). D1 está integrado en Git; no se acredita instalación habitual de 006. D2 se implementa en rama nueva con PR Draft, sin merge ni despliegue. [Validación propia](private-professional-validation.md). D3 y nuevas vinculaciones siguen deshabilitados.

## Acreditación manual e incorporación restringida

La sucesora [023](../backend/sql/migrations/023_manual_professional_accreditation.sql) incorpora el alcance de [#28](https://github.com/japh113/plataformaPsicologia/issues/28) para nuevas altas ficticias. El backend requiere desarrollo local explícito, `D2_ENABLED=true` y `MANUAL_ACCREDITATION_ENABLED=true`. Las reglas y la evidencia de D2/007 descritas debajo corresponden al flujo previo.

- El registro marca las altas de incorporación. La sesión restringida vigente puede consultar su solicitud y presentar versiones exactas en `/api/professional-status/me/accreditation` solo mientras la cuenta sigue pendiente de primera activación. Cuenta inactiva, suspendida o rechazada conserva su restricción. Las cuentas activas del incremento usan el perfil privado ordinario para consultar y presentar cambios.
- Se comprueban nombre profesional, cédula, título e institución. El revisor coteja estos datos con la cuenta, el registro y la identidad por fuera de la aplicación. En el sandbox la fuente y el método se almacenan explícitamente como simulaciones. La ficha enlaza a la [consulta institucional de cédulas](https://apiaccess.gob.mx/informacion/consultar-cedula-profesional), sin incorporar ningún dato de la solicitud a la URL. El catálogo de enfoques operativos espera validación profesional.
- La revisión exige admin/superadmin, cuenta y sesión vigentes, titular distinto y versión actual. Resultados, fecha, método y referencia permanecen reservados. El DTO del titular solo expone sus credenciales, vigencia y mensajes dirigidos a él. Auditoría registra actor, objetivo, versión y resultado con proyección mínima. Los intentos inconclusos, devoluciones y resoluciones conservan el historial por versión.
- Una transacción serializa perfil y revisores, registra la evidencia y arbitra la cédula mediante una clave única normalizada. La vigencia interna utiliza fecha UTC y 12 meses calendario desde la comprobación. La revalidación agrega evidencia sin reemplazar la versión aprobada. La reserva de cédula conserva el reclamo durante revalidación o vencimiento y cambia al aprobar otra cédula del mismo titular.
- La aprobación de cuenta sigue siendo una decisión explícita de backoffice. PostgreSQL exige, antes de la primera transición a activo, una decisión sustentada y vigente para la versión aprobada exacta. El cambio invalida la sesión restringida y el profesional inicia sesión de nuevo. La autorización clínica conserva sus restricciones por episodio, consentimiento, AB-23 y los controles ordinarios. La revalidación y el vencimiento no alteran el ciclo clínico.

### Demostración ficticia

Ejecutar `bash scripts/clinical-episodes.sh accreditation-demo`. El wrapper crea y verifica un entorno nuevo y aislado y muestra las URL de la aplicación y la API, la cuenta ficticia de revisión y el comando de limpieza del UUID propio. Registrar un profesional de prueba con dominio `accreditation.invalid`, elegir un nombre ficticio, una cédula numérica inventada y datos de una licenciatura e institución de prueba. En **Credenciales**, el revisor `reviewer@accreditation.invalid` con contraseña ficticia `Episode-Demo-Only-284!` completa el cotejo simulado. Confirmar el resultado, aprobar por separado la cuenta en el backoffice y volver a iniciar sesión como profesional.

Antes de operación real se requieren validación jurídica y profesional de criterios, procedimiento de identidad, privacidad, conservación, eliminación y autorización operativa. D3 y las solicitudes públicas requieren sus propios incrementos.

## Sesiones y configuración

D2 requiere `D2_ENABLED=true` y `RESTRICTED_JWT_SECRET` explícito, independiente de `JWT_SECRET`, sin fallback. Fuera de desarrollo local aplica también la validación de secretos fuertes. No se genera una clave al arrancar. La misma configuración debe suministrarse a cada proceso. Rotar la clave restringida invalida todas sus sesiones, sin rotar la ordinaria. No hay refresh, intercambio de tokens ni revocación individual al cerrar navegador: logout borra la credencial; expiración/versión invalidan tokens sustraídos.

Login comprueba contraseña y revalida cuenta/perfil bajo locks antes de emitir. Activo recibe JWT ordinario; pending_review/rejected/suspended reciben solamente `sessionKind=restricted` y `restrictedToken`, sin DTO de usuario clínico. Inactivo, perfil ausente/desconocido y demos fuera de desarrollo local siguen denegados. Se conserva la barrera `ensureAccountCanAuthenticate` ordinaria. Los JWT ordinarios históricos permanecen válidos si su firma/versión/estado son válidos y carecen de contexto contradictorio.

La credencial restringida usa HS256, issuer psicopanel, audience/purpose professional-status, typ professional-status+jwt, sub/sv/jti/iat/exp y 600 segundos. `GET /api/professional-status/me` es su única operación. Firma, algoritmo, contexto, expiración, cuenta vigente y session_version se comprueban en servidor; se revalidan bajo lock al leer. Solo devuelve estado estructurado y mensajes expresamente destinados al titular. No acepta JWT ordinario. El middleware ordinario no acepta la clave restringida.

Frontend mantiene esa credencial en memoria. SessionRoot monta una pantalla independiente, sin App, sidebar, pacientes, agenda, relaciones o backoffice. Recargar requiere login. Los datos clínicos anteriores se desmontan al entrar a ese contexto. La sesión restringida no se escribe en localStorage ni se entrega al cliente ordinario. Compartir origen conserva el riesgo XSS: esto no certifica hardening productivo.

## Sucesora 007 y locks

[007](../backend/sql/migrations/007_private_professional_management.sql) conserva 001–006 y sus entradas/hashes. Complementa revocación para cambios de aprobación cuyo origen no es active; 002 conserva la salida de active, contraseña e inactivación. Cambiar entre estados restringidos o entrar a active revoca la restringida. Repetir el mismo estado no incrementa por transición. La nueva sesión ordinaria siempre exige contraseña.

Cambiar actividad global/aprobación retira publicación y admisión transaccionalmente, también al recuperar estado. Revalorar vigencia retira preferencias del aprobado afectado. No se modifica clínica ni se restauran preferencias, relaciones o citas. El paso del tiempo no ejecuta triggers: D3 deberá evaluar vigencia y elegibilidad en cada lectura. No se aprueban reglas clínicas de caducidad por implicación.

Orden del servicio: users involucrados ordenados por ID, psychologist_profiles, professional_publication_profiles, dependencias, decisión/auditoría. Revisión legacy de cuenta adquiere users antes de modificar el perfil y ejecutar 002. Revisor y titular se revalidan bajo locks. Escritores SQL extraordinarios deben respetar el protocolo; no se garantiza ausencia de deadlocks frente a operadores que lo ignoren.

Runner exige destino explícito, ledger, prefijos, hashes, lock, catálogo y transacción. No hay instalación automática. Verifica el contrato complementario de la vista D1 también sobre 007. Conserva requisito TEMP para crear la referencia privada de la vista; no concede privilegios automáticamente. Actualización habitual requiere autorización posterior, nunca schema/seed como upgrade.

## Perfil y credenciales

Rutas `/api/professional-profile/me`: GET consulta sin crear; POST crea bajo demanda; PATCH modifica allowlist; GET /credentials consulta snapshots/decisiones propias; POST /credential-proposals presenta versión completa. Solo psicólogo activo y globalmente activo con sesión ordinaria. Propietario proviene de sesión; UUID público lo genera PostgreSQL. No se convierten campos legacy en nueva evidencia.

Descripción privada de texto plano hasta 2000 caracteres, ciudad/estado hasta 100 y modalidad controlada. React escapa la salida. Catálogo general inicialmente vacío; no hay etiquetas del cliente ni exención de acreditaciones. Publicación/admisión y campos desconocidos se rechazan. Una descripción privada no queda autorizada para exposición futura: tratamiento de afirmaciones acreditativas pendiente antes de D3.

rowVersion y números BIGINT cruzan JSON como cadenas decimales. Cada mutación compara versión y bloquea agregado. Campos protegidos se presentan como snapshot inmutable; una pendiente vigente por perfil. Segunda presentación se rechaza hasta resolverla. No hay supersesión, edición, retiro de snapshot ni borrado de propuestas. La última aprobada se conserva al rechazar.

## Revisión y comunicaciones

`/api/professional-reviews/pending`, `/:owner/:version` y `/:owner/:version/decision` requieren sesión ordinaria de admin/superadmin activo. Support no accede. Lista usa puntero actual; decisión revalida propietario/revisor, versión exacta y rowVersion, sin autorrevisión. Decisión, observación, promoción/validez si procede, limpieza pendiente y auditoría mínima son atómicos. Conflicto exige recargar; no hay decisión automática tras reintentar.

**Aprobación operativa bloqueada sin excepción configurable.** No hay criterios definitivos por acreditación. El endpoint rechaza approved aunque el cliente envíe una referencia o afirme evidencia sustentada. La operación interna admite inyección de una política únicamente para pruebas sintéticas; el controlador HTTP siempre usa la política cerrada. El rechazo sí está disponible y exige razón comunicable. No se anuncian verificaciones oficiales o garantía de calidad terapéutica.

Observaciones internas residen separadas de owner_message. DTO del titular excluye notas y evidencia reservada. Mensajes de cuenta nuevos se guardan en professional_account_messages desde revisión administrativa con ownerMessage explícito. Nunca se copian review_notes históricas. Consultas son privadas, acotadas y sin proveedores de comunicación. Sesión de login/me omite notas históricas del DTO profesional.

El modal de cuenta parte del estado seleccionado y distingue mantenerlo de rehabilitar explícitamente; editar mensajes o notas de una cuenta suspendida/rechazada no la activa. Resolver una solicitud pendiente sigue exigiendo una decisión explícita admitida por el endpoint existente. Cada apertura reinicia los campos; durante el guardado se bloquean edición y cierre. En credenciales, el formulario se aísla por propietario y versión, se desmonta al cambiar de selección y descarta respuestas de cargas anteriores. Una decisión en curso bloquea selección/recarga/envío duplicado. Un conflicto retira el formulario y exige cargar de nuevo la propuesta; nunca se reintenta automáticamente.

## Fotografías y capacidad

Raíz preexistente `PROFESSIONAL_MEDIA_ROOT`, absoluta, privada, sin symlinks, fuera de public/src, propiedad del usuario API y sin permisos de grupo/otros. El adaptador no crea rutas desde input del cliente. JPEG/PNG/WebP estáticos, entrada 5 MiB, 4096 por lado y 16 millones de píxeles; salida WebP hasta 1024 por lado y 1 MiB. Sharp 0.35.5, licencia Apache-2.0 y binarios/dependencias registrados en lockfile; verificar dentro de la imagen Linux, no instalar en host. La [política del proyecto](https://sharp.pixelplumbing.com/security/) mantiene actualizaciones de seguridad para la versión npm más reciente; se descartó 0.34.5 antes del cierre. Los loaders quedan bloqueados salvo JPEG/PNG/WebP; caché desactivada y concurrencia nativa uno.

Un proceso hijo separado decodifica y reescribe, corrige orientación y elimina metadatos. Se limita a una operación de procesamiento simultánea por proceso API, ocho segundos de ejecución y heap JS de 64 MiB. El sandbox API tiene límite total de memoria 512 MiB y dos CPU; el heap JS no limita memoria nativa por sí solo. El montaje de medios de CI/demo es tmpfs nuevo de 80 MiB. Producción necesita aislamiento, capacidad y adaptador aprobados; no se contrata proveedor.

POST /me/photo recibe archivo binario con MIME e If-Match decimal. Autoriza antes de leer, comprueba bytes reales y formato decodificado, rechaza animación/SVG/truncado y no confía en filename. Reserva staged tras procesar, con versión por propietario. Un lock PostgreSQL serializa cuotas globales: 8 MiB por titular, 64 MiB totales y 256 metadatos, contando ready/staged/retired. Son límites técnicos conservadores, sin TTL o purga.

Archivo final se crea exclusivamente con UUID y no-follow, modo 0600; se sincroniza antes de marcar ready. Nueva transacción revalida sesión/estado/versión, cambia puntero y retira anterior. Fallo o carrera conserva la actual. GET /me/photo solo entrega actual ready del titular, con no-store privado y nosniff; rechaza archivos no regulares/symlinks. DELETE /me/photo retira lógicamente sin purga.

No existe transacción distribuida DB/filesystem. Archivo final huérfano se conserva privado; fila staged interrumpida no se sirve y consume cuota. POST /me/photo/recover retira explícitamente cargas incompletas propias e incrementa versión, invalidando un finalizador anterior; no elimina archivos. El botón es una recuperación lógica, no una política de eliminación. Errores no exportan rutas, SQL o diagnósticos del decodificador.

## Límites y demostración

Sin directorio, lector/foto anónimos, opt-in, solicitudes, invitaciones o episodios nuevos. AB-23, fallback lector y ADR-029/RN-59–61 se conservan. Aprobación de cuenta, credenciales y autorización clínica son conceptos separados.

Demo autorizada solo mediante [Sandbox](../scripts/ci/sandbox.py), kind D2: fixture nuevo de [create-professional-demo.js](../backend/scripts/create-professional-demo.js), API/frontend D2 y medios tmpfs propios. Chromium demuestra tres estados restringidos sin peticiones clínicas; perfil privado/propuesta; rechazo y conflicto de revisores; motivo al titular; foto privada; support excluido; suspensión/rehabilitación sin publicación; edición sin reactivación, aislamiento de textos y cargas fuera de orden. Los [quince IDs obligatorios](../scripts/ci/browser-cases.json) forman parte de B+C+D2, cada suite en sandbox nuevo. No hay escena pública D3.

Pendientes: criterios por acreditación, catálogo concreto, control de texto libre antes de D3, política de retención/backups/eliminación y preparación productiva. La evidencia local/remota se registra por SHA, nunca se hereda de D1.
