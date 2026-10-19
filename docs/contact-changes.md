# PR C — cambio seguro de contactos

Base: main `5e549f51bc7fa3e2535db023b4f9bca3d383a7c5`, PR #11/B integrado. Implementación C autorizada el 19 de octubre de 2026, en rama y pendiente de revisión/integración. 005 solo se ensaya en destinos nuevos aislados; no hay despliegue habitual. Fuentes: ADR-025, AB-25, RN-49–50 y [plan](identity-directory-delivery-plan.md). [Validación y evidencias](contact-change-validation.md).

## Acuerdos de producto aplicados

- Contraseña obligatoria al iniciar; autorización de 10 minutos ligada a cuenta, fingerprint de JWT y session_version. Nueva sesión requiere otra validación, conservando candidato y verificación mientras la solicitud viva.
- Candidato separado del vigente. Verificación específica C, seguida de confirmación explícita. Abrir enlaces no verifica ni sustituye. Al confirmar se revocan todas las sesiones, incluida la iniciadora; nuevo login normal, sin JWT automático.
- Una solicitud pendiente por cuenta entre ambos canales. Cancelar o sustituir es explícito, invalida desafíos y conserva cuotas. Solicitud de 24 horas, sin extensión por reenvíos. Email hasta 24 horas con límite de solicitud; SMS 10 minutos. Una verificación completada del candidato dura hasta vencer la solicitud, aunque caduque el desafío consumido.
- Avisos de inicio y finalización al contacto anterior, sin veto ni exigir acceso. Intención durable y reintentos hasta 72 horas; reenvíos de desafío no repiten aviso inicial. Fallos externos no revierten cambios completados. Contacto histórico no verificable: aviso marcado no disponible, sin evidencia inventada.
- Para cambiar teléfono se exige email vigente verificado. No se exige verificación del contacto anterior que se sustituye. Teléfonos compartidos siguen permitidos; sin fusión de identidades.
- Cinco contraseñas incorrectas/15 minutos, cinco inicios/24 horas y diez cancelaciones o sustituciones/24 horas por cuenta. Solo limitan este flujo; no suspenden login o clínica. B y C comparten cuotas de emisión por cuenta/canal y destino/canal: 60 segundos y cinco/24 horas. SMS: cinco intentos por desafío.
- Cifrado autenticado para candidatos y destinos de avisos. Purga de contenido temporal de solicitud al resolver/vencer, y de destino al entregar/agotar avisos; procesador de limpieza cada minuto. Auditoría mínima sin contenido sensible y sin inventar retención definitiva.

## Autoridad y transacción

Se preservan users.id, patients.id y users.patient_id. Email vigente: users.email; al confirmar se actualiza también patients.email como espejo, sin reconciliar otros históricos. Teléfono: patients.phone. No se modifica DOB, nombre, entrevista, episodios, citas, tareas, objetivos, notas, relaciones ni autorizaciones clínicas.

El orden de locks es usuario → paciente → solicitud/desafío; luego advisory de destino para cuotas o email normalizado para unicidad. Registro paciente/profesional y confirmación C comparten el namespace de email. Comandos revalidan session_version después del lock, además del middleware. PostgreSQL mide plazos después de locks; confirmar vuelve a medir después de esperar el lock de email. La contraseña no se deduce del login o del reloj del cliente.

Confirmar revalida titularidad, origen, versión, estado, fecha, email previo para SMS, candidato verificado y autorización reciente. En una transacción: registra aviso final, resuelve solicitud, actualiza contacto/espejo, incrementa session_version, deja actuar la invalidación 004, escribe nueva evidencia del canal y consume todos los reset tokens pendientes. El otro canal conserva su evidencia. El trigger 005 invalida solicitudes pendientes ante cambio de contacto, asociación, rol o versión de seguridad, sin sustituir las protecciones de 002/004.

001 conserva automáticamente la versión anterior de patients al actualizar contactos. Esa nueva entrada de conservación es esperada; no se edita ni borra historial previo y no se copian contraseñas/OTP/enlaces/candidatos temporales a ese historial. El aviso no contiene información clínica ni el nuevo contacto completo.

Los resets revalidan el email dentro del lock del usuario. Un reset que esperaba con el email anterior no emite un token tras sustituirlo. Reset y confirmación C se serializan; el ganador invalida la autoridad del otro. Recuperación remota sigue deshabilitada y separada de este flujo.

## Contratos HTTP

Todas las rutas bajo /api/auth, autenticadas y exclusivas del paciente titular. IDs de cuenta/paciente, estados y evidencia no se aceptan en body. Cache-Control no-store y Referrer-Policy no-referrer. El fingerprint de sesión es interno no enumerable y no se devuelve en /me.

| Ruta | Entrada / resultado |
| --- | --- |
| GET /contact-changes | Solicitud más reciente propia, candidato solo mientras pendiente, estado, verificación, vencimiento y vigencia de reautenticación de esta sesión. |
| POST /contact-changes | operationId UUID estable, channel email/sms, contact, password; replaceRequestId solo para sustituir expresamente la pendiente. Repetición de mismo inicio no crea solicitud/aviso/consumo nuevo; payload diferente con misma clave pendiente da conflicto. |
| POST /contact-changes/:id/resend | operationId UUID estable por envío. Misma clave no emite otro desafío. Solo cambia el desafío C de esa solicitud; no extiende solicitud ni reinicia cuotas. |
| POST /contact-changes/:id/verify | secret. HMAC contextual C independiente de B. Email en fragmento #changeEmail=ID.TOKEN, importado y retirado por UI. SMS de seis dígitos. Verificar no cambia contactos. |
| POST /contact-changes/:id/reauthenticate | password; sustituye la autorización temporal por la sesión actual, sin perder candidato verificado. |
| POST /contact-changes/:id/confirm | Body vacío, confirmación explícita; confirmed/requestId, sin sesión nueva. Repetición con JWT revocado recibe 401; con nuevo login, una solicitud propia ya completada solo devuelve recibo mínimo. |
| POST /contact-changes/:id/cancel | Body vacío; cancelación propia idempotente. |

Errores: 400 entrada/secreto/contraseña inválida; 401 sesión inválida/revocada; 403 rol ajeno; 404 solicitud no disponible (ajena/inexistente iguales); 409 estado/credencial reciente/prerrequisito/destino no utilizable; 429 con Retry-After; 503 entrega o protección no disponible. No revelar otra cuenta ocupante. Mensajes de error no contienen body ni detalles SQL.

Se conserva un registro mínimo terminal de solicitud y eventos por cuenta/acción/instante/ID. No hay candidato ni destino en eventos. La política definitiva de retención de esa auditoría continúa pendiente; C no la fija ni la borra como si fuera temporal.

## Cifrado y rotación

AES-256-GCM con IV aleatorio y AAD por usuario, ID y tipo candidate/notice. Cada sobre guarda kid, IV, tag y ciphertext; sin clave en PostgreSQL. Configuración externa: CONTACT_CHANGE_KEYS, objeto JSON de IDs a claves de 32 bytes en base64; CONTACT_CHANGE_ACTIVE_KEY_ID selecciona la activa. No guardar valores en Git, frontend o logs. Una clave ausente/incorrecta falla de forma cerrada.

Solo el simulador local autorizado deriva una clave desechable de VERIFICATION_SECRET con contexto separado y kid sandbox-v1. Está protegido por las mismas guardas UUID/entorno/base de B; no es una configuración productiva ni se habilita remotamente.

Rotación: añadir nueva clave conservando anteriores, seleccionar nuevo ID activo y ejecutar mantenimiento en todas las instancias. El procesador recifra candidatos y avisos pendientes. Comprobar solo conteos por kid antes de retirar claves viejas. No retirar una clave aún referenciada. La rotación AES no cambia la clave HMAC de B ni reinicia cuotas; la rotación de esa otra clave conserva sus pendientes de diseño previos a producción.

## Entrega durable, interrupciones y limpieza

CONTACT_CHANGE_PROCESSOR=true habilita mantenimiento al arrancar y cada 60 segundos. Se configura únicamente en la API del sandbox nuevo, no en Compose habitual. Una sola ejecución local a la vez; múltiples procesos coordinan filas mediante FOR UPDATE SKIP LOCKED. El lease de PostgreSQL se libera si un proceso cae. Reintento exponencial de 60 segundos a una hora como máximo, siempre acotado por retry_until=creación+72 horas. Nunca se inicia entrega tras ese límite.

La entrega puede repetirse si el proceso cae después de aceptar el envío y antes de registrar éxito; garantía al menos una vez, no exactamente una vez. Avisos identificados por ID estable. No existe acción de veto/cancelación en el aviso anterior. El único adaptador sigue siendo el simulador privado de B, ahora con propósito y tipo de mensaje; sin proveedores, credenciales comerciales o redes de correo/SMS.

No se guardan secretos recuperables de desafíos en outbox. Una caída entre COMMIT y entrega puede requerir pedir otro código respetando cuotas. Fallo conocido invalida el desafío y conserva consumo. Una pérdida de respuesta de confirmación se recupera mediante login y consulta propia; nunca aceptando el JWT revocado ni revirtiendo el contacto.

Caducidad lógica se aplica en cada operación aun con procesador detenido. El procesador materializa vencimientos y elimina ciphertext de solicitudes; borra inmediatamente destinos entregados/agotados y digests de secretos C ya inválidos/consumidos. Los digests de destino necesarios para cuota se conservan solo por su ventana operativa de 24 horas y luego se purgan junto con los desafíos C. B no cambia su política histórica de retención. La limpieza física dentro de 24 horas requiere el procesador operativo; una caída total del servicio puede retrasarla y se debe supervisar antes de cualquier despliegue. Al volver, procesa vencimiento antes de entrega. No se ha desplegado un servicio productivo ni se declara disponibilidad garantizada.

## Migración y compatibilidad

005_secure_contact_changes.sql es aditiva y solo se aplica mediante target 005 con destino explícito. Añade tablas privadas de solicitudes, eventos y avisos, propósito/binding en desafíos y triggers de invalidación. No hace backfill, no cambia filas clínicas existentes y no modifica archivos/checksums 001–004. Runner valida huella previa, ledger y checksums, aplica sucesoras ordenadas con transacción/lock y registra cada nueva huella. Rechaza downgrade, deriva, versión desconocida o estructuras no registradas.

La aplicación C requiere 005 para verificación/identidad. Coordinar despliegue de todos los escritores: una versión B anterior ignora el propósito y no es un rollback seguro de C. La recuperación es deshabilitar el flujo/usar corrección aditiva conservando revocaciones y datos, nunca bajar session_version ni restaurar rutas legacy. No aplicar SQL ni inicializadores sobre la base habitual por este PR.

## Demo ficticia ADR-019

Solo con autorización de ensayo en recursos nuevos:

    bash scripts/clinical-episodes.sh contact-demo

Crea UUID, imágenes propias, PostgreSQL 17 tmpfs, DB sin puertos públicos y puertos UI/API dinámicos de loopback. Cuentas ficticias: r@episodes.invalid sin vínculo/verificaciones; p/q con clínica legacy de fixtures; a/b profesionales; admin/support operativos. Clave de demo publicada únicamente para el sandbox: Episode-Demo-Only-284!.

1. Abrir dos sesiones de r. En identidad, iniciar cambio de email con contraseña y candidato .invalid. El vigente permanece y se muestra plazo de 10 minutos.
2. Enviar verificación. Leer el buzón mediante el CLI privado del contenedor propio indicado en [guía B](patient-identity-verification.md), sin publicar su salida. Abrir linkFragment no verifica ni cambia contacto; confirmar candidato y después confirmar sustitución.
3. Todas las sesiones antiguas reciben 401. La pestaña iniciadora vuelve a login y las pestañas compartidas se cierran; otra sesión se cierra al contactar API. Entrar con nuevo correo conserva nombre/ID y clínica. No se emite JWT en confirmación.
4. Ya con correo verificado, cambiar teléfono: cancelar/sustituir explícitamente, verificar SMS y confirmar. Un código vencido/usado/ajeno o B no confirma C. Una nueva sesión permite reanudar y exige otra contraseña reciente.
5. Con a/p, comprobar clínica legacy existente; ninguna nueva relación o episodio se habilita. Support/admin sin datos privados de desafíos o candidatos.

Prueba visual reproducible: modo contact-review con red app interna, imagen propia [Dockerfile](../docker/contact-review.Dockerfile), [runner](../scripts/run-contact-ui-review.py) y [driver](../scripts/contact-ui-review.cjs). No instala herramientas en host. Alias frontend.localhost privado para secure context del navegador. La revisión documenta los fixtures de tiempo acelerado y no atribuye 72 horas reales de espera a una prueba simulada.

Limpieza solo con el UUID propio impreso por el wrapper; guardas de propiedad, sin prune ni recursos habituales. [Evidencia](contact-change-validation.md) registra destinos, resultados y limitaciones reales.
