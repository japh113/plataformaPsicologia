# Protección bcrypt de cambios de contacto — diseño revisado y aprobado


**Actualización posterior:** el propietario aprobó este diseño y autorizó implementar un Draft independiente, con retención exclusiva de admisiones, cobertura real de 012 y conservación de contratos 009–011. [Implementación, retención, validación y límites](contact-bcrypt-admission-validation.md). El texto siguiente conserva la propuesta revisada que se aprobó; sus expresiones de implementación pendiente corresponden a ese corte anterior y no acreditan pruebas nuevas.

## Estado, corrección y recomendación

Revisión del 6 de noviembre de 2026 para el candidato PR #62. `main` reconsultado por fetch: `3d89863cebb592fb250d7dd6014bf46b8e1b0782`, merge de #61; consulta GitHub sin PRs abiertos. Rama local `fix/security-contact-bcrypt-admission`; estado inicial de esta revisión limpio, con el diseño anterior en `628a2b2fe9d4889cba5c4662dc099dab07fdd813`.

**El propietario seleccionó revisar antes de implementar. Este documento no autoriza implementación.** Se modifica exclusivamente documentación local: no servicio, migración ejecutable, manifiesto, pruebas, workflows ni despliegue. No se publica PR funcional ni se hace merge. Las alertas [#8](https://github.com/japh113/plataformaPsicologia/security/code-scanning/8) y [#9](https://github.com/japh113/plataformaPsicologia/security/code-scanning/9) fueron consultadas abiertas sobre esa base durante el diagnóstico inicial; no se cerraron ni descartaron.

**Corrección de la propuesta anterior:** no se omite bcrypt en el POST idempotente. El contrato actual exige contraseña al iniciar, incluido su reintento, y se conservará. Cada reintento admitido consume presupuesto técnico antes de comparar; no consume otro inicio funcional ni crea otro aviso. Que GET permita consultar el resultado no es una protección equivalente que autorice omitir contraseña en POST. No se introduce caché de contraseñas correctas ni de su hash como alternativa de autenticación.

**Recomendación:** aprobar, para una implementación posterior explícitamente autorizada, reserva persistente confirmada antes de bcrypt, dos transacciones secuenciales y la ampliación técnica 012 descrita abajo. Mantener **10 admisiones por titular en ventana móvil de 900 segundos** como política inicial revisable, con los límites y costo legítimo expuestos; no presentarlo como resultado de mediciones. Si se requiere que todos los reintentos sean gratuitos, este diseño no satisface esa preferencia y habría que aprobar otro contrato de autenticación; no se hará esa sustitución implícitamente.

Fuentes locales revisadas: [checkpoint](project-checkpoint.md), [contrato C](contact-changes.md), [desarrollo](development.md), [servicio](../backend/src/modules/auth/contact-change.service.js), [controlador](../backend/src/modules/auth/contact-change.controller.js), [rutas](../backend/src/modules/auth/auth.routes.js), [middleware](../backend/src/middlewares/authMiddleware.js), [identidad](../backend/src/modules/auth/identity.service.js), [005](../backend/sql/migrations/005_secure_contact_changes.sql), [runner](../backend/scripts/episode-migration.js), [CLI](../backend/scripts/migrate.js) y [manifiesto](../backend/sql/migrations/manifest.json).

## 1. Diagnóstico y alternativas

`passwordCheck()` limita cinco eventos `password_failed` en 900 segundos. Los aciertos no consumen esa cuota. `startContactChange()` compara antes de resolver idempotencia y antes de comprobar algunas cuotas/conflictos funcionales. `reauthenticate` permite comparaciones correctas reiteradas sin límite de admisión. El lock de usuario las serializa, pero no limita su cantidad en el tiempo.

`withIdentity()` bloquea usuario y paciente, resuelve expiraciones y ejecuta la acción en una transacción. Los errores ordinarios hacen ROLLBACK; únicamente los marcados `commit:true` confirman. Una admisión escrita ahí se perdería ante un error posterior al trabajo costoso. Además, confirmar el fallo de contraseña podría confirmar limpiezas anteriores: el diseño revisado evita esas escrituras antes de decidir rechazo.

| Alternativa | Resultado |
| --- | --- |
| Adelantar cuotas funcionales | Se hará cuando apliquen; no resuelve aciertos repetidos en idempotencia o reautenticación. |
| Limitar por memoria, sesión, operationId o instancia | Evasión por cambio de clave/sesión o proceso; reinicio borra consumo. |
| Limitar por IP reenviada | Identidad no confiable y bloqueo de titulares distintos; descartado. |
| Contar aciertos como `password_failed` | Corrompe el significado y el límite de cinco errores; descartado. |
| Cachear éxito u omitir contraseña en reintentos | Cambia el contrato requerido; descartado en esta revisión. |
| Registrar admisión en la transacción funcional, con o sin savepoint | No sobrevive a rollback completo, desconexión o caída previa al COMMIT. |
| Confirmar con una segunda conexión mientras la primera retiene locks | Riesgo de autoespera por FK y agotamiento del pool; descartado. |
| Tabla propia de cuotas | Viable, pero duplica almacenamiento/índice y control que ya ofrece C. No se necesita un estado de cuota separado. |
| Evento técnico en transacción A y operación en B | Recomendado: persistencia separada, índice existente y serialización por titular; requiere releer todo el estado al entrar en B. |

## 2. Presupuesto e impacto legítimo

La identidad del presupuesto es `users.id`, tomada del actor autenticado y revalidada bajo lock. Inicio y reautenticación, ambos canales, todas las solicitudes y sesiones y todas las instancias contra el mismo PostgreSQL comparten **10 admisiones por 900 segundos**. Cada reserva confirmada habilita como máximo una llamada bcrypt en esa invocación; no habilita ninguna llamada futura o remota.

Separar las cuotas:

| Control | Política conservada o propuesta |
| --- | --- |
| Trabajo bcrypt de C | Nueva: 10 admisiones/900 s, aciertos, errores y reservas abandonadas compartidos. |
| Contraseña incorrecta de C | Existente: 5 fallos/900 s, comprobada antes de comparar, sin reinicio por aciertos. |
| Inicios funcionales | Existente: 5/24 h; idempotencia no es otro inicio. |
| Cancelaciones/sustituciones | Existente: 10/24 h. |
| Envíos/verificaciones | Cuotas y propósito actuales de B/C, sin cambios. |

La cifra 10 no se deriva de cinco inicios diarios como si fueran diez operaciones necesarias en quince minutos. Es un margen técnico propuesto: dobla el umbral de cinco fallos y limita también aciertos, permitiendo interacciones y reintentos legítimos. Ventana de quince minutos coherente con la barrera de errores ya existente; no se propone nueva suspensión de cuenta.

Ejemplos de consumo dentro de una misma ventana, suponiendo contraseñas correctas y prerrequisitos válidos:

- Flujo habitual: un inicio, envío/verificación y confirmación dentro de diez minutos: **1 admisión**.
- Inicio cuya respuesta se pierde y dos reintentos con el mismo ID: **3 admisiones**, una solicitud y un aviso.
- Ese caso más dos reautenticaciones desde sesiones distintas y un reintento de cada una: **7 admisiones**. Reautenticar alterna la autoridad de sesión, como hoy; no autoriza simultáneamente a todas.
- Diez POST idempotentes admitidos: **10 admisiones**; el siguiente recibe 429 aunque su contraseña sea correcta. Una recarga que solo hace GET no consume. No añadir reintentos automáticos del POST ni sugerir iniciar sesión para evadir la espera.

El límite permite una ráfaga de diez, no una comparación cada noventa segundos. En agotamiento completo, la espera puede aproximarse a quince minutos. Una autorización de diez minutos puede vencer durante esa espera: habrá que reautenticar cuando vuelva el presupuesto, manteniendo candidato/verificación mientras la solicitud de 24 horas siga vigente. Si la autoridad aún sirve, confirmar no consume este presupuesto. Los reintentos idempotentes también quedan limitados aunque la cuota diaria esté agotada: no se les aplica otra cuota de inicio, sí las de contraseña y trabajo técnico.

La consecuencia conservadora es consumo sin trabajo cuando hay caída, carrera o error después de reservar. No se reembolsa: evita que errores fabricados liberen presupuesto. La cuenta puede continuar GET, login ordinario, cancelación/confirmación permitidas y clínica con sus controles actuales. Login no recibe esta cuota nueva.

No hay métricas de uso ni benchmark del hash actual que prueben que 10 sea óptimo. Antes de aceptar el PR funcional deben ejecutarse los casos ficticios de UX y concurrencia previstos; ajustar la cifra requiere revisión explícita. Conservar 10 es mi recomendación inicial por margen y simplicidad; no propongo añadir otra ventana ni limitador global sin evidencia y autorización.

## 3. Idempotencia exacta y puntos de rechazo

**Regla sin excepción:** nunca llamar a bcrypt sin una reserva propia cuyo COMMIT haya sido confirmado. Nunca devolver un resultado exitoso del POST de inicio sin comprobar la contraseña requerida en esa invocación. No se considera el JWT, una llamada GET anterior o un éxito de otra sesión como sustituto de esa contraseña.

| Situación | Trabajo y resultado propuestos |
| --- | --- |
| Nuevo inicio admisible | Reserva A; revalidación B; bcrypt; creación atómica y un evento `started`. |
| Mismo ID propio y mismo candidato pendiente | Reserva A; revalidación B; bcrypt; mismo DTO, sin otro inicio, aviso, desafío o renovación de autoridad. |
| Mismo ID propio terminal | Reserva A; revalidación B; bcrypt; recibo terminal actual, sin reconstruir candidato purgado ni reabrir solicitud. |
| Mismo ID propio pendiente con payload distinto | Se mantiene comprobación de contraseña antes del conflicto 409 actual; reserva consumida. No se devuelve el DTO del candidato distinto. |
| Contraseña errónea en cualquier reintento que llega a comparar | Consume reserva y registra `password_failed`; 400, sin DTO de éxito. |
| Otra sesión del titular | Mismo presupuesto y contraseña requerida; un inicio repetido no transfiere ni renueva autoridad. Debe usar reautenticación explícita. |
| Reautenticación reiterada | Cada POST admitido reserva y compara; solo un acierto puede actualizar la autoridad de esa sesión por diez minutos. |
| Formato/rol/sesión/prerrequisito inválido, o cuota agotada antes de reservar | No bcrypt ni reserva confirmada. No existe obligación de realizar trabajo costoso para devolver un rechazo. |

Los valores de contraseña ausentes, de tipo incorrecto o de más de 72 bytes conservan el tratamiento actual de `passwordCheck`: no llaman a bcrypt, registran fallo si la barrera de cinco errores lo permite y devuelven 400. Si ya se confirmó la admisión para esa invocación, también se conserva; no se cambia este caso a un rechazo estructural que evite contabilizar errores.

Una operación existente no se rechaza por la cuota de cinco inicios ni por el contacto ya vigente tras una confirmación: primero se distingue replay de nueva creación, pero no se devuelve replay antes de passwordCheck. Si no hay ID propio existente, se comprueban cuotas funcionales y condiciones baratas antes de bcrypt. No buscar candidatos o cuentas ajenas para explicar errores.

Dos inicios concurrentes con el mismo ID pueden reservar ambos; bajo el lock de B, el segundo relee la fila que creó el primero, compara con su propia reserva y devuelve el mismo resultado. Dos comparaciones implican dos reservas; una solicitud, un inicio y un aviso. Si se agota presupuesto antes de admitir al segundo, puede obtener 429 en lugar de replay exitoso: idempotencia garantiza no duplicar efectos, no éxito ilimitado sin autenticación.

## 4. Transacciones, locks y atomicidad

Una única conexión por invocación, usada secuencialmente para A y B. Nunca mantener una transacción o conexión mientras se espera otra del mismo pool. No hay transacción autónoma oculta, conexión de cuota aparte ni lock de sesión que sobreviva al COMMIT.

### A — admisión durable

1. Validación estructural y barreras actuales fuera de transacción cuando corresponda. Iniciar A con READ COMMITTED y tiempos locales acotados: `lock_timeout=2s`, `statement_timeout=5s`. Configurar `synchronous_commit=on` para confirmar la reserva con la durabilidad de WAL correspondiente; no alterar configuración global.
2. Bloquear **usuario → paciente → solicitud propia cuando corresponda**, usando el mismo orden de `currentIdentity(..., true)` y `owned`. Revalidar rol, is_active, asociación paciente y versión de sesión; fingerprint de sesión proviene del JWT autenticado, nunca del body.
3. Solo lecturas funcionales: clasificar replay/nuevo inicio, consultar expiraciones como estado lógico, origen, email verificado para SMS y cuotas funcionales aplicables. Una pendiente caducada no se actualiza aquí. No usar el wrapper actual tal cual, porque procesa expiraciones antes de la acción.
4. Después de los locks obtener reloj DB fresco. Comprobar cinco fallos y diez admisiones en sus ventanas. Si una barrera impide admitir, ROLLBACK y 429 antes de bcrypt. Si aún se admite, insertar `password_admitted` con `request_id=NULL` y devolver internamente su ID/instante.
5. COMMIT A y esperar confirmación. Solo entonces existe permiso para pasar a B. La inserción y la decisión de cupo quedan serializadas por el lock de usuario; se libera al confirmar. Los lectores de cuotas de este flujo deben consultar el primario, no una réplica con retraso.

Los locks duran hasta fin de transacción; el siguiente solicitante cuenta después de adquirir el lock. No se combina lock y conteo en una única consulta cuya instantánea pudiera haberse tomado antes de esperar. La serialización se apoya en el [bloqueo de filas PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS), no en exclusión local de Node.

### B — autenticación y operación funcional

1. Tras confirmar A, iniciar B con READ COMMITTED y los mismos tiempos locales, reutilizando el cliente sano. Repetir locks **usuario → paciente → solicitud**. Releer hash de contraseña, cuenta/asociación/versión y estado: ninguna autoridad o fila de A se considera vigente por haber sido válida entonces.
2. Revalidar precondiciones, cuotas funcionales de nueva creación y cinco fallos. **No volver a rechazar porque la cuenta tenga ya diez reservas:** la de esta invocación ya fue concedida; contar otra vez la cuota técnica aquí podría rechazar todas las reservas válidas. Una quinta contraseña errónea intercalada sí puede impedir usar una reserva aún pendiente; no se compara y esa reserva se conserva.
3. Antes de cualquier mutación funcional y justo antes de bcrypt, comprobar plazo y que la reserva privada de esta invocación no se haya usado. Plazo de **10 segundos**, reloj monótono iniciado antes de la consulta de reloj/conteo de A, sin ampliarlo tras COMMIT, espera de locks o reintento. B comprueba además la fila de evento por ID interno, titular, acción y request_id nulo, y que su edad DB sea no negativa y menor de diez segundos, sin convertirla en un token aceptado por HTTP. No se toma lock de evento antes del de usuario. Vencimiento o reserva inválida: rollback B, 503 genérico y cero bcrypt.
4. Marcar usada en el control interno de esta invocación antes de llamar una sola vez a bcrypt. No reintentar B ni bcrypt automáticamente tras error; una nueva solicitud HTTP debe reservar otra vez. Un reinicio de proceso no recupera permisos en memoria ni ofrece API de canje. El ID de evento nunca viene del body.
5. Si es incorrecta: insertar solo `password_failed`, confirmar B y devolver 400. No renovar/cancelar solicitud, resolver expiraciones ni invalidar desafíos en ese camino. El registro de fallo mantiene el mecanismo persistente actual y no reinicia por aciertos.
6. Si es correcta: refrescar reloj y revalidar los plazos relevantes tras el trabajo costoso; devolver replay sin cambios o ejecutar el inicio/reautenticación. Solo entonces realizar limpiezas funcionales necesarias. Revalidar antes de escribir y mantener los efectos funcionales en un único COMMIT B. Cualquier error posterior revierte B; A no puede revertirse desde B.

El plazo corto es de **inicio** de trabajo, distinto de diez minutos de autorización. No promete interrumpir bcrypt ya iniciado ni tiempo real frente a pausas del proceso. La garantía cuantitativa es diez admisiones por ventana de 900 segundos; cada comparación puede comenzar hasta diez segundos después de su admisión. No afirmar diez comparaciones completadas en toda ventana posible de 900 segundos. Se presupone un reloj DB operativo; un salto hacia adelante puede liberar ventanas anticipadamente y uno hacia atrás prolongar la espera. No se resuelve el reloj global con timestamps aportados por el cliente.

### Errores, concurrencia y durabilidad

| Interrupción | Resultado |
| --- | --- |
| A rechaza por cuota o falla antes de COMMIT | Ninguna comparación. Si revierte, ninguna reserva nueva. |
| COMMIT A incierto por desconexión | No comparar ni reintentar sobre ese permiso; 503. Puede quedar consumo confirmado. Descartar el cliente roto. |
| Caída después de COMMIT A, antes de B/bcrypt | Reserva conservada hasta salir de la ventana. |
| Contraseña incorrecta | Reserva A conservada; fallo B persistido si confirma. Sexto fallo bloqueado al revalidar bajo lock. |
| Error SQL/pérdida de conexión durante B, incluso después de bcrypt | No reembolso A; rollback B si no confirmó. Si tampoco pudo confirmar el evento de error, no inventar ese fallo: la admisión técnica permanece. |
| B confirma y se pierde la respuesta | A y efectos B conservados. El reintento es otro POST con nueva reserva y contraseña, sin duplicar inicio/aviso. |
| Otro proceso reserva o reautentica a la vez | Cuenta compartida serializa A y B por separado; cada comparación corresponde a su propia admisión. |
| Revocación/cambio de contraseña entre A y B | B relee estado y versión bajo lock; 401 sin comparar con el hash antiguo. A se conserva. |
| Lock timeout/deadlock antes de bcrypt | Rollback de la transacción afectada y 503 genérico; no retry automático. Si A había confirmado, se conserva. |

La durabilidad es respecto del PostgreSQL al que todas las instancias conectan; `synchronous_commit=on` espera flush local de WAL bajo las condiciones de [durabilidad documentadas](https://www.postgresql.org/docs/17/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT). No es garantía de failover sin pérdida, almacenamiento roto ni fsync deshabilitado. No configurar réplicas ni despliegue en este encargo.

## 5. Retry-After, evasiones y ausencia de mutaciones por 429

La ventana móvil incluye eventos `created_at > ahora_DB − 900s`. El cálculo se hace después de adquirir locks con `clock_timestamp()`, que refleja tiempo actual, no el inicio de la transacción ([reloj PostgreSQL](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)). No truncar microsegundos a Date de JavaScript para decidir la frontera: mantener el valor DB o calcular en SQL.

Para máximo M y N eventos vigentes, si N ≥ M, el primer cupo se libera cuando vence el evento en posición N−M al ordenar ascendente. Equivale a tomar los M más recientes y esperar al más antiguo de esos M. `Retry-After = max(1, ceil((ese_instante + ventana − ahora_DB)/1s))`. Devolver el máximo de las esperas de las barreras aplicables ya conocidas, sin incluir cuotas de creación en un replay. Puede volver a haber competencia al reintentar: el encabezado no reserva cupo futuro.

Ejemplo de consulta **propuesta**, ejecutada después del lock, para cada acción/umbral de ventana de 900 segundos; parámetros internos: titular, acción, máximo y muestra DB de ahora. Solo interpretar `retry_after` si `recent_count` alcanza el máximo:

```sql
WITH recent AS (
  SELECT created_at
  FROM public.contact_change_events
  WHERE user_id = $1 AND action = $2
    AND created_at > $4::timestamptz - INTERVAL '900 seconds'
  ORDER BY created_at DESC, id DESC
  LIMIT $3
)
SELECT count(*) AS recent_count,
       GREATEST(1, ceil(EXTRACT(EPOCH FROM
         min(created_at) + INTERVAL '900 seconds' - $4::timestamptz
       ))) AS retry_after
FROM recent;
```

Cambiar `operationId`, requestId, destino, canal o sesión no cambia el titular ni los eventos; login correcto, reautenticación correcta o reinicio tampoco los borran. Instancias/procesos distintos consultan la misma base/tabla/usuario. No usar IP ni cabeceras reenviadas como identidad. Otra cuenta mantiene presupuesto independiente; cuentas distintas coordinadas constituyen riesgo residual de abuso agregado, fuera de una cuota por titular.

**Todo 429 de estas dos acciones ocurre antes de bcrypt y sin cambios funcionales de esa invocación.** En A implica rollback sin inserción nueva. En B puede quedar exclusivamente la reserva técnica previamente confirmada. Antes de devolver 429 no se ejecuta el barrido de expiración del wrapper: no cambiar is_active, version/hash de sesión, autoridad de reautenticación, estado/candidato de solicitud, desafíos, verificaciones, avisos, tokens de reset o clínica. Si B detecta cuota funcional agotada durante el intervalo A/B, revierte sin mutaciones; A se conserva. El mantenimiento independiente u otra solicitud concurrente pueden actuar legítimamente: las pruebas deben atribuir cambios al escritor que los produjo.

El controlador conserva 429 con mensaje genérico y Retry-After entero positivo, no-store y no-referrer. Falta de infraestructura, lock timeout o COMMIT incierto producen 503 genérico, sin cuerpo SQL, secretos o detalles de candidatos. No cambiar ni configurar una limitación nueva para login, recuperación o clínica. GET, cancelación, confirmación ya autorizada y mantenimiento no usan el presupuesto bcrypt nuevo.

## 6. Migración técnica 012 propuesta

Necesaria porque el CHECK de 005 solo permite acciones funcionales y `password_failed`; ninguna representa una admisión indistinta al resultado. Reutilizar `reauthenticated` o `password_failed` falsearía el contrato y las cuotas. El índice existente `(user_id, action, created_at)` sirve para la ventana; no se propone tabla, columna, rol, función privilegiada o índice nuevo.

SQL candidato, **solo texto de diseño, sin archivo de migración ni ejecución**. Lo envolvería el runner explícito existente y su transacción. Reemplaza el CHECK, no elimina ni reescribe registros:

```sql
DO $$ BEGIN
  IF current_setting('psicopanel.migration_target', true)
     IS DISTINCT FROM '012' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 012';
  END IF;
END $$;

ALTER TABLE public.contact_change_events
  DROP CONSTRAINT contact_change_events_action_check,
  ADD CONSTRAINT contact_change_events_action_check
    CHECK (action IN (
      'password_failed', 'started', 'cancelled', 'replaced',
      'reauthenticated', 'verified', 'confirmed', 'password_admitted'
    )),
  ADD CONSTRAINT contact_change_admission_without_request
    CHECK (action <> 'password_admitted' OR request_id IS NULL);
```

El nombre del CHECK anterior procede del DDL de 005 y debe verificarse en el sandbox y contrato de catálogo antes de aceptar la implementación. Sin `IF EXISTS`, adopción, reparación de deriva ni cambios permisivos ante esquema incompatible. La sustitución completa y la entrada de ledger se confirman juntas; un fallo no deja una ventana de CHECK ausente. ALTER TABLE puede tomar ACCESS EXCLUSIVE y validar restricciones; es operación explícita de instalación, nunca al arrancar ni por solicitud HTTP ([ALTER TABLE PostgreSQL 17](https://www.postgresql.org/docs/17/sql-altertable.html)).

Inserción candidata dentro de A, usando titular derivado del actor y conservando ID/fecha solo internamente:

```sql
INSERT INTO public.contact_change_events
  (user_id, request_id, action, created_at)
VALUES ($1, NULL, 'password_admitted', clock_timestamp())
RETURNING id, created_at;
```

No aceptar evento/instante/titular del body; no almacenar contraseña, candidato, destino, JWT ni secreto. `request_id=NULL` evita FK a un inicio que todavía no existe y expresa que la cuota pertenece a la cuenta. PK, FK restrictiva al usuario y ACL de 005 permanecen. La FK se comprueba en A sobre el usuario que esa misma transacción bloqueó: no hay segunda conexión esperando el lock propio.

No requerimos migrar, reconciliar, atribuir, conservar compatibilidad ni transformar datos demo. 012 es evolución **técnica del esquema versionado**, no migración de esos datos. No añadir backfill, dual write, normalizador, UPDATE/DELETE/TRUNCATE ni editar 001–011. Conservar hashes y entradas históricas y agregar solo la entrada 012 calculada de su archivo definitivo cuando se autorice implementar. Nuevos fixtures se crean con la cadena completa, sin saltar versiones.

El cambio del runner/CLI debe admitir target/ledger 012, mantener huellas, rechazar deriva y downgrade y comprobar los contratos de seguridad de 009–011 también cuando la última versión sea 012. Hay condiciones actuales `applied.version === '011'` que deberán generalizarse con cuidado: no basta agregar 012 a una lista y perder validación del resolver/creador. Esta revisión no cambia esos archivos. La preparación de pruebas hoy en 005 deberá instalar cadena completa y roles sintéticos restringidos; no alterar roles habituales, workflows ni configuración de despliegue.

Los eventos no se borran para recuperar cupo: salen lógicamente de la ventana. Crecimiento y política definitiva de retención continúan pendientes; a régimen máximo el nuevo presupuesto permite hasta 960 admisiones diarias por cuenta con reloj estable. No introducir purga de auditoría como ampliación implícita de alcance.

## 7. Invariantes y pruebas negativas previstas

Invariantes exigibles a la implementación futura:

1. Toda comparación de estas acciones tiene una reserva A confirmada, del mismo titular, aún utilizable y usada como máximo una vez por la invocación. Los errores, incluidos los de B, nunca devuelven esa reserva.
2. Todo éxito del POST de inicio, también idempotente/terminal, acredita contraseña actual en esa invocación; toda reautenticación exitosa también. Ninguna caché, sesión previa o GET lo sustituye.
3. Conteo e inserción A se serializan entre instancias por usuario; B no usa autoridad ni hash leídos antes de liberar ese lock. Cinco fallos se revalidan bajo lock antes de comparar.
4. 429 precede a bcrypt, sin efectos funcionales. Otros errores revierten efectos B salvo el registro deliberado de fallo; A conserva consumo. COMMIT incierto nunca autoriza más trabajo.
5. Un inicio/aviso por operationId; idempotencia no crea otro inicio ni renueva autoridad. Sesión, versión, plazo de diez minutos, solicitud de 24 horas, confirmación y revocación conservan su contrato.
6. Orden de locks usuario → paciente → solicitud/desafío cuando se utilice; ninguna transacción inicia otra conexión reteniendo recursos del pool. La confirmación conserva su lock de unicidad y transacción actual.
7. AB-23, `prepared`, `allowed:false`, `audienceVerified:false`, originales privados, ausencia de clínica nueva y barreras del simulador permanecen intactos. Sin datos sensibles en errores, auditoría técnica o artifacts.

| Caso negativo/regresión | Comprobación futura |
| --- | --- |
| Aciertos repetidos de inicio | Mismo ID permite alcanzar el presupuesto sin fabricar inicios; diez reservas/comparaciones, una solicitud/aviso, undécimo 429 y ninguna llamada adicional a bcrypt. |
| Aciertos repetidos de reautenticación | Inicio consume una; siguientes nueve reautenticaciones correctas completan diez; siguiente 429 sin renovar autoridad. |
| Cinco fallos existentes | Cinco comparaciones erróneas registradas, sexta rechazada incluso con contraseña correcta; acierto previo no limpia errores. Login y cuenta continúan disponibles. |
| Replay con contraseña errónea | 400, incremento técnico y fallo; nunca DTO exitoso, incluso si se comprobó contraseña en otra sesión. |
| Idempotencia serial/concurrente/terminal | Repetición compara y consume cada vez que se admite; cero nuevos efectos; nueva sesión no hereda autoridad y payload distinto mantiene conflicto tras contraseña. |
| Cuotas funcionales | Cinco inicios/día y cancelación/sustitución agotadas rechazan nuevos inicios antes de reservar/comparar; no impiden replay por cuota diaria. |
| Evasión | IDs nuevos, otra solicitud, canal, sesión y backend no renuevan presupuesto; otra cuenta no queda bloqueada. |
| Instrumentación real | Spy de bcrypt instalado tras preparar registro/login, o fixture privado de proceso; contar por cada ruta. En proceso hijo, instrumentar bcrypt dentro del hijo, no inferir cero llamadas solo desde el padre. Sin helper productivo de bypass. |
| HTTP 429 | Mensaje genérico, no-store/no-referrer y Retry-After entero; cero bcrypt y snapshots funcionales idénticos. |
| Frontera temporal | Mover fechas de eventos en DB nueva: justo antes, exactamente al vencer y después; liberación de una unidad y cálculo con más de M eventos ficticios. Sin espera real de quince minutos ni borrar auditoría. |
| Concurrencia finita | Un máximo fijo de 12 solicitudes sobre un titular; no exceder diez reservas en ventana, comparar como máximo una vez por reserva; quinto fallo intercalado bloquea comparaciones posteriores. |
| Dos procesos/reinicio | Pools distintos, mismo PostgreSQL aislado y titular; suma compartida. Reiniciar proceso no resetea reservas ni habilita canjearlas. |
| TOCTOU A/B | Barrera de prueba entre commits: revocar sesión, cambiar contraseña, resolver solicitud o consumir cuota funcional; B relee y rechaza sin usar estado antiguo ni mutar. |
| Errores después de bcrypt | Inyectar error SQL en creación/reautenticación y cerrar cliente B: reserva sigue presente, ninguna modificación parcial de solicitud, sesiones, desafíos o avisos. |
| COMMIT A fallido/incierto | Casos de rollback real y COMMIT confirmado por servidor cuya respuesta se oculta: cero bcrypt; en el segundo, consumo persiste. |
| Reserva vencida/locks | Retener lock antes de A y entre A/B, agotar timeout/plazo; sin comparación ni extensión automática, liberar cliente y locks. Probar segundo titular progresando. |
| Conexión/pool | Pool pequeño y concurrencia acotada: no pedir otra conexión reteniendo una; ninguna transacción abandonada. |
| Conservación clínica | Snapshots de cuentas, solicitudes, sesiones, desafíos, verificaciones, avisos, reset y tablas clínicas alrededor de rechazo, excluyendo únicamente eventos técnicos esperados. |
| Regresión de contrato completo | Diez minutos, reanudar con otra sesión, candidato verificado, confirmación, revocación total y propósito/cifrado/deadline del simulador. |
| Migración 012 | Instalación nueva completa, 011→012, replay, concurrencia del runner, rollback de DDL/ledger, deriva, target incorrecto y downgrade; hashes 001–011, ACL y contratos clínicos intactos. |

Solo datos ficticios y PostgreSQL nuevo aislado, recursos propios verificados y cargas finitas. No ejecutar ataques de saturación ni tocar bases/volúmenes habituales. Las suites existentes de [contacto](../backend/test/contact-change.integration.test.js), [revisión](../backend/test/contact-change-review.integration.test.js), [identidad](../backend/test/identity.integration.test.js) y [deadline](../backend/test/contact-deadline.integration.test.js) son fuentes para ampliar regresiones, no evidencia nueva ejecutada ahora.

Después de autorización e implementación: unitarias backend, integración pertinente aislada, frontend lint/build y demo ficticia; los siete checks `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence`, `ci/required`; CodeQL y artifacts del HEAD final con identidad, hashes, inventario, limpieza y retención de 14 días. No modificar reglas o workflows para reducir alertas; evaluar protección real si CodeQL no reconoce el control SQL. Auditoría independiente y decisión de integración corresponden al flujo del propietario.

## Validación y límites de esta entrega documental

Se contrastaron servicio, locks, contrato de contraseña, esquema de eventos y mecanismos de migración. Se consultó documentación oficial de PostgreSQL para bloqueo, ALTER TABLE, reloj y durabilidad; el SQL anterior es una propuesta revisable, **no SQL ejecutado ni protección demostrada**. Esta entrega solo ejecuta contratos documentales locales, enlaces/fragmentos, diff y conservación de SQL/manifiesto. No hay nuevas pruebas funcionales, DB, demo, CI, CodeQL o artifacts atribuibles a este commit documental local.

Quedan por aprobar arquitectura y política revisadas. Riesgos residuales: consumo conservador sin comparación, posibles esperas legítimas, dos transacciones y latencia extra, carreras que deben revalidarse, crecimiento de eventos, reloj DB y abuso agregado de múltiples cuentas. No prometer defensa de toda la API ni recuperación sin pérdida ante cualquier configuración de almacenamiento. Ningún punto pendiente autoriza implementar automáticamente ni publicar un PR funcional.
