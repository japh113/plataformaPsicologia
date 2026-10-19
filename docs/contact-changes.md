# PR C — cambio seguro de contactos

Integrado en PR #12 el 19 de octubre de 2026, merge `543442ea634e5977bc887ace1db5457eee2ebf8c`; HEAD revisado `c7f622608af4b7bc27a7c4e9dde49be23221b0ae`, base B `5e549f51bc7fa3e2535db023b4f9bca3d383a7c5`. 005 se ensayó solo en destinos nuevos aislados; no acredita despliegue habitual. Fuentes: ADR-025, AB-25, RN-49–50 y [plan](identity-directory-delivery-plan.md). Informes históricos: [inicial](contact-change-validation.md), [primera revisión P2](contact-change-review-validation.md) y [final del deadline](contact-change-deadline-validation.md). Sus resultados no son checks de GitHub ni nuevas ejecuciones de esta actualización documental; [CI propuesta](ci-plan.md) aún sin implementar.

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

Confirmar revalida titularidad, origen, versión, estado, fecha, email previo para SMS, candidato verificado y autorización reciente. En una transacción: registra aviso final, resuelve solicitud, actualiza contacto/espejo, incrementa session_version, deja actuar la invalidación 004, escribe nueva evidencia del canal y consume todos los reset tokens pendientes. El otro canal conserva su evidencia. El trigger 005 invalida solicitudes pendientes ante cambio efectivo de contacto, asociación, rol o versión de seguridad, sin sustituir las protecciones de 002/004. Es AFTER UPDATE con WHEN sobre OLD/NEW: observa también el incremento de session_version que 002 realiza en un BEFORE al actualizar solo password_hash. Invalida desafíos, borra candidato y autorización temporal, y libera la solicitud única pendiente. La lista UPDATE OF no serviría para ese caso; [semántica oficial de PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createtrigger.html).

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

CONTACT_CHANGE_PROCESSOR=true habilita mantenimiento al arrancar y cada 60 segundos. Se configura únicamente en la API del sandbox nuevo, no en Compose habitual. Limpieza y entrega tienen exclusiones locales independientes: una tanda de avisos lenta no impide el siguiente barrido. Múltiples procesos toman avisos con FOR UPDATE SKIP LOCKED en una transacción breve, registran lease_token aleatorio y lease_until de hasta 30 segundos y hacen COMMIT antes de descifrar o entregar. No hay locks ni conexión de esa transacción durante la espera externa. Una caída permite reclamar el aviso al vencer el lease; el resultado solo se aplica si todavía pertenece al mismo token. Un propietario antiguo no puede sobrescribir al sucesor ni resucitar un aviso agotado.

Cada intento tiene **un único deadline monótono absoluto**, compartido por el padre y su worker, con máximo de 10 segundos. No se calcula desde claimedAt ni se vuelve a conceder un plazo relativo al arrancar el worker:

1. Después del COMMIT del claim se hace una consulta PostgreSQL sin locks de fila: status pendiente, mismo lease_token, lease_until presente y tiempo restante hasta LEAST(lease_until,retry_until). La resta se calcula en SQL con clock_timestamp() fresco y EXTRACT(EPOCH), evitando precisión truncada de Date en JavaScript.
2. Se registra process.hrtime.bigint() **antes de enviar la consulta**. Se redondea hacia abajo el restante DB en milisegundos, se limita a 10 segundos y se suma al instante monótono anterior. Así se cobra conservadoramente toda la consulta, incluso la parte anterior a la muestra del servidor. Un presupuesto nulo, no finito o agotado no autoriza entrega. [Reloj monótono de Node 24](https://nodejs.org/docs/latest-v24.x/api/process.html#processhrtimebigint); [clock_timestamp de PostgreSQL 17](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).
3. Descifrar, preparar el mensaje y crear/cargar el worker consumen ese mismo presupuesto. El procesador lo comprueba inmediatamente antes de llamar a deliverContactNotice; esta función vuelve a comprobarlo antes de construir el worker. Su timer usa únicamente el restante, nunca otros 10 segundos.
4. El worker anuncia ready y espera permiso. El padre consulta otra vez PostgreSQL después del arranque para validar estado/token/vigencia del lease y retry_until. El nuevo deadline solo puede acortar el original: se toma el mínimo, descontando también toda esta consulta. Si hubo recuperación del lease, purga o vencimiento, se termina el worker sin invocar el adaptador.
5. Al recibir el permiso, el worker compara de nuevo el reloj monótono con el deadline compartido, justo antes de invocar el adaptador, sin await u otra operación intermedia. No hay acceso DB dentro del worker. Los threads del mismo proceso usan process.hrtime.bigint(); el reloj de pared del cliente/host no reemplaza a PostgreSQL.

Al agotarse el plazo se llama Worker.terminate() y se espera su salida antes de resolver el intento; no se abandona una promesa de entrega todavía ejecutándose. Respuesta, timeout, error y exit comparten una única transición de cierre. El resultado tardío no reinicia el plazo ni da un segundo cierre. Se descarta stdout/stderr del adaptador y no se heredan flags de evaluación del padre. Regresiones con contador compartido verifican que desaparece la actividad subyacente. [Terminación de Node 24](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate).

El asentamiento abre una transacción breve y exige status pendiente y lease_token vigente bajo lock. Obtiene clock_timestamp() de nuevo después del lock: si retry_until venció, marca exhausted y borra destino/lease; si el lease venció pero el aviso aún vive, deja la recuperación al siguiente propietario. Un token sustituido o estado terminal no se modifica. La limpieza independiente también purga por retry_until aunque exista un worker activo; una respuesta posterior no resucita el aviso. Si el deadline conservador local se agotó antes de que el reloj DB declare retry_until vencido, se omite la entrega y se aplica el asentamiento normal, sin inventar un vencimiento DB.

El backoff conserva la corrección previa: 60 segundos hasta una hora como máximo **desde la lectura PostgreSQL posterior al fallo y al lock**, con LEAST(retry_until, hora_del_fallo + espera). Una entrega lenta no consume la espera ni produce reintento inmediato. Nunca se inicia deliberadamente el adaptador con un presupuesto agotado.

Límites operativos: el protocolo presupone que Node/OS pueden ejecutar las comprobaciones y terminar el worker, y que el reloj DB avanza de forma coherente con el tiempo transcurrido. No es una garantía de tiempo real frente a pausas del sistema o un salto discontinuo del reloj DB después del último permiso; tampoco hace atómica la invocación externa con una transacción PostgreSQL. Bajo el protocolo de leases, otro procesador solo recupera al vencer el lease, cuyo límite ya forma parte del deadline. No cubre escritores ajenos que sustituyan arbitrariamente un token después del último permiso. Solo existe el simulador JS local, sin proveedores ni extensiones nativas: terminar JS no retracta un aviso ya aceptado. Cualquier proveedor futuro requerirá validar su cancelación/aislamiento; este PR no lo habilita.

La entrega puede repetirse si el proceso cae después de aceptar el envío y antes de registrar éxito; garantía al menos una vez, no exactamente una vez. Avisos identificados por ID estable. No existe acción de veto/cancelación en el aviso anterior. El único adaptador sigue siendo el simulador privado de B, ahora con propósito y tipo de mensaje; sin proveedores, credenciales comerciales o redes de correo/SMS.

No se guardan secretos recuperables de desafíos en outbox. Una caída entre COMMIT y entrega puede requerir pedir otro código respetando cuotas. Fallo conocido invalida el desafío y conserva consumo. Una pérdida de respuesta de confirmación se recupera mediante login y consulta propia; nunca aceptando el JWT revocado ni revirtiendo el contacto.

Caducidad lógica se aplica en cada operación aun con procesador detenido. El procesador materializa vencimientos y elimina ciphertext de solicitudes; borra inmediatamente destinos entregados/agotados y digests de secretos C ya inválidos/consumidos. Los digests de destino necesarios para cuota se conservan solo por su ventana operativa de 24 horas y luego se purgan junto con los desafíos C. B no cambia su política histórica de retención. La limpieza física dentro de 24 horas requiere el procesador operativo; una caída total del servicio puede retrasarla y se debe supervisar antes de cualquier despliegue. Al volver, procesa vencimiento antes de entrega. No se ha desplegado un servicio productivo ni se declara disponibilidad garantizada.

## Migración y compatibilidad

005_secure_contact_changes.sql es aditiva y solo se aplica mediante target 005 con destino explícito. Añade tablas privadas de solicitudes, eventos y avisos (incluidos leases de entrega), propósito/binding en desafíos y triggers de invalidación. Las correcciones P2 se incorporan a la propia 005 porque sigue sin integrar ni aplicar en la base habitual; su checksum se recalcula. Una base desechable con la 005 anterior debe recrearse: el runner rechaza su checksum, no la transforma silenciosamente ni se autoriza repararla sobre un destino existente. No hace backfill, no cambia filas clínicas existentes y no modifica archivos/checksums 001–004. Runner valida huella previa, ledger y checksums, aplica sucesoras ordenadas con transacción/lock y registra cada nueva huella. Rechaza downgrade, deriva, versión desconocida o estructuras no registradas.

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
