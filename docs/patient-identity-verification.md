# PR B — identidad adulta y verificación de contactos

Implementado en rama sobre 0f2ebba (#10); revisión/integración pendientes. Sin despliegue habitual, proveedores reales, C/D o nueva vinculación clínica. Decisiones: ADR-012/019/023/024/028, RN-41–48/57–58 y AB-23. [Evidencia](patient-identity-validation.md), [matriz legacy](stage2a-legacy-mutations.md).

## Registro, titularidad y fuentes

POST /api/auth/register/patient admite únicamente firstName, lastName opcional, email, password, birthDate YYYY-MM-DD y phone internacional explícito. Nombre hasta 100 caracteres, contraseña de 8 caracteres hasta 72 bytes por bcrypt; DOB real/no futura y edad al menos 18. Por aprobación de la segunda revisión de B, el servidor obtiene la fecha civil de America/Mexico_City como referencia única de esta primera versión mexicana, sin depender de la zona del host, ubicación o reloj/edad del cliente. Cumplir 18 se permite desde las 00:00 de esa referencia, aunque UTC ya haya cambiado antes. Para DOB 29/02 se aprobó esperar hasta 01/03 en año no bisiesto. Es una política de elegibilidad de B, sin afirmar criterio jurídico ni extenderla a todas las zonas de México; otros ámbitos requieren decisión propia. No cambia la zona ni las reglas de agenda 2E. No inferir edad/DOB desde entrevista. Teléfono: quitar espacios/paréntesis/guiones, conservar + y 2–15 dígitos con primer dígito no cero; validación sintáctica, sin adivinar país ni afirmar que el número existe.

Se crean cuenta y paciente en una transacción, sin entrevista, relación, acceso profesional o episodio. Los defaults legacy risk_level=none/status=active de patients no son evaluación clínica ni responsabilidad asistencial. El registro rechaza campos clínicos/IDs/rol/verificaciones del cliente. No hay alta delegada alternativa de menores. No exige motivo, riesgo, CURP o documento.

Ambos registros públicos (paciente y profesional) devuelven 202 con accepted=true y acuse uniforme sin ID/JWT, también cuando el email pertenece a cualquier cuenta. Se inicia sesión después con el contrato JWT existente; el profesional nuevo permanece pending_review. Esto evita que el registro profesional enumere la misma tabla users. El resultado no fusiona ni actualiza cuentas anteriores. La contraseña y aprobación/JWT conservan sus reglas actuales.

| Dato | Autoridad implementada |
| --- | --- |
| DOB global | patients.global_birth_date, nullable para históricos. Sin backfill ni copia de patient_intakes. |
| Nombre del paciente | patients; users conserva el espejo de cuenta existente, actualizado atómicamente al editar nombre. |
| Email de cuenta vigente | users.email normalizado al registro. patients.email recibe el mismo valor al alta por compatibilidad legacy. No se reconcilian discrepancias históricas por inferencia. |
| Teléfono global | patients.phone, sin columna duplicada en users. |
| DOB de entrevista | patient_intakes.birth_date sigue como dato clínico de esa entrevista; etiqueta explícita y ninguna escritura de DOB global. |
| Evidencia | contact_verification_state por cuenta/canal/contacto vigente; nunca una marca enviada por cliente, cuenta previa o relación. |

GET /api/auth/identity devuelve solo firstName/lastName/birthDate/email/phone/emailVerifiedAt/phoneVerifiedAt de la cuenta paciente titular. PATCH admite exclusivamente nombre/apellido. El usuario confirmó dejar pendiente cualquier captura o corrección posterior de DOB, también para históricos desconocidos. Cambios de email/teléfono requieren PR C y se rechazan aquí. El profesional solo puede escribir riskLevel/status/notes/reasonForConsultation mediante PUT patients; se preservan sus capacidades clínicas autorizadas.

## Selector legacy y correos profesionales

GET /api/auth/psychologists/available está temporalmente deshabilitado: 401 sin sesión y 403 para cualquier cuenta autenticada antes de consultar DB. App no lo solicita ni conserva su estado/cliente. El DTO clínico de vínculos omite email profesional, conservando nombre/ID/estado para el panel y relaciones existentes; no altera permisos o filas. La proyección operativa del backoffice continúa bajo sus roles autorizados, sin acceso para pacientes. D sigue pendiente, sin DTO/directorio público nuevo.

## Verificación y contratos

Las cuatro rutas son autenticadas, solo paciente titular; canal email o sms. No admiten destinos, IDs de cuenta/paciente ni propósito genérico. Estado propio sin desafíos en /identity, nunca en listados de backoffice.

| Ruta | Entrada y resultado |
| --- | --- |
| POST /api/auth/verification/:channel/request | Body vacío. 200 sent/expiresAt/retryAfter=60; no código/token/preview. 409 contacto histórico no verificable o SMS sin email verificado; 429 cuota/cooldown con Retry-After; 503 adaptador no disponible. |
| POST /api/auth/verification/:channel/confirm | Solo secret: token email de 43 caracteres base64url o SMS de seis dígitos. 200 identidad propia; 400 genérico ante inválido/ajeno/vencido/usado/sustituido. 429 al agotar intentos SMS, sin suspender cuenta. |
| Enlace email | Fragmento #verifyEmail=TOKEN en la URL de la app, sin query enviada al servidor. No confirma al abrir: requiere sesión titular y envío explícito; UI limpia el fragmento al montar el panel. Sin token en pantallas normales (campo privado). |

Email: 32 bytes aleatorios, 24 h. SMS: randomInt criptográfico, seis dígitos, 10 min, máximo cinco intentos persistidos; no repite los últimos cinco códigos de la cuenta. Nuevo desafío invalida al anterior sin reiniciar cuotas. Un intento inválido confirma su contador mediante COMMIT. Al expirar se invalida condicionalmente. Secretos almacenados como HMAC-SHA256 contextual por ID de desafío; clave fuera de DB, comparación constante. Esto impide ataque offline trivial al SMS con solo una copia de DB.

Envíos: 60 s y máximo cinco por ventana móvil de 24 h, tanto por cuenta/canal como por destino/canal, incluyendo desafíos invalidados y entregas fallidas. Locks de cuenta/paciente y advisory lock de destino, lectura de clock_timestamp después de locks e inserción dentro de la misma transacción; efectivos entre sesiones, cuentas y procesos backend. No hay contadores en memoria ni ventana fijada por cliente. Estado del límite no revela qué otras cuentas usan el destino.

**Aprobación adicional B:** solicitar SMS exige email vigente verificado. Teléfonos compartidos están permitidos, sin unicidad/fusión ni política definitiva para reciclados. Otras cuentas con email verificado aún pueden agotar la cuota compartida de un número: reducción de abuso, sin promesa de eliminación completa. Controles adicionales por red/costo, antiautomatización de producción y resolución excepcional siguen pendientes antes de envíos reales.

Los triggers de 004 invalidan evidencia/desafíos al cambiar contacto, incluso al restaurar el valor anterior. Email y SMS son independientes: cambiar email conserva evidencia SMS; cambiar teléfono conserva email. Cambio de asociación/rol de cuenta invalida ambos. C deberá coordinar locks, reautenticación y sesiones; esos triggers no habilitan cambios de contacto ahora.

No se escriben tokens/códigos en auditoría, historial clínico, logs o respuestas HTTP. Identity usa no-store/no-referrer; CORS expone Retry-After a la UI. La entrega ocurre después del COMMIT; si falla se invalida el desafío y la cuota permanece consumida. No se reintenta silenciosamente ni se mantiene un outbox con secretos recuperables.

## Configuración y migración

VERIFICATION_DELIVERY=disabled por defecto. La única implementación disponible es simulated, aceptada exclusivamente en test local o development en el sandbox UUID con PGHOST=db y PGDATABASE=psicopanel_episode_demo. No hay proveedor comercial ni entrega de producción: devuelve 503 incluso si se copia la opción simulated fuera de ese entorno.

VERIFICATION_SECRET: clave separada de al menos 32 bytes, suministrada por entorno; no guardar en Git ni frontend. El sandbox usa un valor público desechable solo para sus datos ficticios. Únicamente local/test permite fallback al JWT_SECRET si tiene longitud adecuada. Cambiar la clave invalida evidencia/cuotas basadas en digest; no rotarla como operación casual: política/versionado de rotación y retención de desafíos pendientes antes de producción.

En test, el buzón privado está en memoria del proceso y solo es accesible mediante helper test. En demo, mensajes cifrados AES-256-GCM en /tmp/psicopanel-verification-mailbox, directorio 0700 y archivos 0600 dentro del contenedor. El CLI local descifra la entrega del destinatario ficticio seleccionado. No hay endpoint, backoffice, log del servidor o preview HTTP para leer códigos. El buzón se pierde al recrear contenedor; nunca es infraestructura de correo productiva.

004_patient_identity_verification.sql agrega DOB y tablas privadas de evidencia/desafíos e índices de cuotas; no cambia filas históricas ni crea accesos. 001–003 y sus checksums permanecen intactos. Runner reconoce manifest 001–004 y targets explícitos 003/004; verifica huella actual antes del upgrade, agrega ledger y huella 004, conserva ledger anterior y rechaza downgrade/deriva/versiones desconocidas/checksum incorrecto. Transacción y lock compartido con inicializador se conservan. Diagnóstico 003 sigue siendo lectura.

Solo para un destino de ensayo **nuevo y explícitamente autorizado** con baseline/001/002 ya instalados:

    MIGRATION_DATABASE_URL=postgres://.../DESTINO npm run db:migrate -- --target=004 --database=DESTINO

El runner instala 003 y 004 si no hay ledger, o actualiza 003 registrada y compatible. Baseline no es un upgrade; no ejecutar schema/seed en bases existentes. Inicializadores habituales siguen sin aplicar automáticamente 003/004. Desplegar requiere revisión/autorización propia y coordinación: una aplicación anterior reabriría rutas legacy; no sirve como rollback de seguridad.

## Demo reproducible ADR-019

Desde raíz en WSL/Docker, sin instalar herramientas ni reconstruir servicios habituales:

    bash scripts/clinical-episodes.sh identity-demo

Genera UUID y recursos propios verificados, DB PostgreSQL 17 tmpfs sin puerto público/red privada, imágenes propias y app/API en puertos loopback dinámicos. El wrapper imprime URLs y comando de limpieza. No reutiliza destino. Restablecer significa ejecutar otra vez para crear otro UUID.

| Cuenta ficticia | Estado inicial |
| --- | --- |
| r@episodes.invalid | Adulta explícita, email/teléfono sin verificar; sin psicólogo, acceso o episodio. |
| p@episodes.invalid / q@episodes.invalid | Históricos con DOB global desconocida; clínica legacy de A/B respectivamente. No inferencias. |
| a@episodes.invalid / b@episodes.invalid | Psicólogos ficticios aprobados con acceso a su fixture legacy. |
| admin@identity.invalid / support@identity.invalid | Backoffice separado de clínica y sin desafíos. |

Contraseña común exclusivamente ficticia: Episode-Demo-Only-284!

1. Abrir URL UI. Crear otra cuenta con email .invalid, DOB adulta y teléfono internacional. Una fecha menor/futura/inexistente es rechazada por backend. Tras el acuse, iniciar sesión. Ver “todavía no tienes psicólogo vinculado”, estados sin verificar y edición solo de nombre.
2. Solicitar SMS antes del email: mensaje de requisito previo, sin consumir SMS. Solicitar enlace email: muestra espera de 60 s. Para recibir la entrega simulada ejecutar el visor **en el contenedor API propio**, sustituyendo UUID/email:

       EPISODE_TEST_RUN_ID=UUID docker compose -p psicopanel-episodes-UUID -f compose.episodes-test.yaml exec -T api node scripts/read-verification-mailbox.js r@episodes.invalid

   Es una entrega privada intencional para demo, no logs. No adjuntar su salida a incidencias. Pegar token en el campo privado o añadir linkFragment a la URL UI. Abrir enlace no confirma; confirmar explícitamente con la cuenta destinataria.
3. Solicitar SMS y consultar el mismo buzón local. Confirmar seis dígitos; ambos estados cambian a verificados. Otra sesión de la misma cuenta ve el estado al recargar. Reutilizar un código falla. Cinco códigos erróneos agotan ese desafío; pedir otro respeta reenvío/cuota y no suspende login. Nuevo envío invalida el anterior; SMS caduca a los 10 min. Cuotas máximas y expiración email se ejercitan automáticamente sin esperar un día en UI.
4. Nombre editable; DOB solo lectura o desconocida. Contactos sin editor. Entrevista clínica no cambia identidad global. Las acciones de alta/vinculación están retiradas/deshabilitadas y los pendientes se muestran conservados.
5. Entrar como A: conservar lectura y trabajo clínico sobre P; sin acceso al nuevo registro. Backoffice sin clínica ni secretos. No hay solicitudes/episodios funcionales ni directorio público nuevo.

Comprobación HTTP reproducible del mismo destino (crea otra cuenta ficticia, sin imprimir tokens):

    python3 scripts/smoke-identity-demo.py UUID

Limpieza opcional exclusivamente del UUID propio, verificado antes de down/eliminar imágenes; sin prune ni volúmenes habituales:

    bash scripts/clinical-episodes.sh cleanup UUID

No se reconstruye ni borra la demo habitual. La condición ficticia de sus datos no se usó para conciliación o backfill.

## Pendientes y límites de entrega

Corrección/alta histórica de DOB, contacto seguro C, directorio D, solicitudes/invitaciones y permisos por episodio siguen pendientes. No hay recovery excepcional, fusión, menores alternativos, proveedores reales o despliegue. Nuevos vínculos futuros exigirán ambos contactos; B no los implementa. La clínica ya establecida conserva sus permisos actuales sin exigir verificaciones adicionales. Retención/limpieza/rotación y antiautomatización antes de producción siguen abiertas.

El recorrido HTTP y los checks se ejecutaron; la herramienta de navegador no ofreció ninguna sesión, por lo que la inspección visual interactiva queda para la revisión de la demo, sin atribuirla como prueba ejecutada.
