# Auditoria de autenticacion — 2026-10-16

## Actualización B — identidad y verificación (18 de octubre de 2026)

A integrado en #10; B implementado en rama, sin despliegue habitual. Ambos registros públicos usan 202 uniforme sin JWT/ID; login posterior conserva contrato y revocación 002. El profesional sigue pending_review hasta aprobación. Identity/verification requieren paciente titular; no admiten destinos/IDs del body ni exponen desafíos a backoffice. [Contratos, claves, adaptador y demo](patient-identity-verification.md); [validación nueva](patient-identity-validation.md). Lo que sigue conserva evidencia histórica y no es un resultado nuevo de B.


> Evidencia histórica conservada. PR #7 restringió después el backoffice: support/admin/superadmin no tienen acceso clínico global ordinario (RN-27). La frase histórica sobre conservar permisos no describe una autorización clínica vigente. Arquitectura actual en [architecture.md](architecture.md); desarrollo en [development.md](development.md). Decisiones de verificación/contactos de [ADR-024/025](product/decisions.md) aún no implementadas. Resultados npm de este reporte no son una auditoría nueva de dependencias.

Rama `fix/authentication-security`, desde `origin/main` en `6a23ac8`.
Alcance: autenticacion, configuracion, inicializacion y pruebas. Sin cambios en modelos
clinicos, migracion clinica ni dependencias de npm.

## Cambios y contratos

- Cada endpoint protegido verifica la firma HS256 y el sujeto del JWT, y carga al usuario
  vigente desde PostgreSQL. Los permisos usan el rol actual de la base, no el rol del token.
- Usuario ausente/inactivo, token ausente, firma invalida o expiracion: **401**.
- Psicologo con estado pendiente, rechazado, suspendido, ausente o desconocido: **403**,
  tanto en login como con un JWT anterior. Solo `active` permite continuar.
- Los permisos existentes de paciente, support, admin y superadmin se conservan.
- Cada JWT nuevo contiene `sv`, que debe ser un entero no negativo igual a
  `users.session_version`. JWT sin version, con version invalida o anterior: **401**.
  Primero se comprueba el estado de la cuenta, conservando **403** mientras el
  psicologo no este aprobado; tras reactivarlo el token anterior recibe **401**.
- Los errores de base de datos llegan al manejador de errores; no se ocultan como 401.
- Las cuentas con los IDs reservados del seed demo se bloquean fuera del modo local,
  incluso con un token anterior. No se eliminan ni se modifican esas filas.
- Las credenciales demo solo se incluyen en el servidor frontend de desarrollo.
  El formulario inicia vacio y el build de produccion elimina los valores demo.

## Configuracion local y no local

`LOCAL_DEVELOPMENT=true` habilita excepciones **solo** junto con `NODE_ENV=development`
o `test`. Nunca activar esta opcion en un entorno compartido/remoto, aunque se llame
desarrollo. `NODE_ENV` ausente o `development` por si solo ya no permite el secreto
por defecto. Compose local declara ambas variables; las pruebas unitarias las fijan
en su propio proceso. No cambia la configuracion de una instancia en ejecucion.

Fuera de local, el proceso falla al importar su configuracion si falta `JWT_SECRET`,
tiene menos de 32 bytes o coincide con patrones conocidos, repetidos o triviales.
El mensaje no imprime el valor. El control es una barrera contra errores de
configuracion, no una prueba matematica de entropia: generar **32 bytes aleatorios
o mas** con un generador criptografico y guardar el resultado en un gestor de secretos.
Por ejemplo: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
No reutilizar secretos de ejemplos, tests, desarrollo ni otras aplicaciones.

Configurar `NODE_ENV=production`, desactivar/eliminar `LOCAL_DEVELOPMENT`, usar un
JWT_SECRET nuevo y las credenciales propias de PostgreSQL. Rotar el secreto invalida
todos los JWT anteriores; coordinar el cambio en todas las replicas. El Dockerfile
y `compose.yaml` existentes son exclusivamente de desarrollo (nodemon/Vite), no un
despliegue de produccion. Para la API de produccion usar `npm start` con su entorno.

## Inicializacion sin datos demo

- `db:init` es alias de `db:init:dev`; schema y seed historicos solo se permiten en
  modo local explicito. **Nunca ejecutarlos sobre datos existentes**, tampoco locales
  que se quieran conservar. Los scripts de normalizacion siguen siendo manuales.
- `seed.sql` tambien exige el ajuste SQL `psicopanel.allow_demo_seed=on`, que solo
  entregan los inicializadores locales. Un `psql -f seed.sql` accidental se rechaza.
  Un operador con privilegios puede saltarse estas barreras: no equivalen a permisos SQL.
- `docker/postgres/init.sh` exige modo local antes de ejecutar SQL, y sigue siendo
  ejecutado por PostgreSQL solo en PGDATA vacio. Reiniciar no ejecuta seeds ni migra.
- **Solo para una base de produccion NUEVA, vacia y dedicada**, configurar el entorno
  anterior y ejecutar `cd backend && npm run db:init:production`. Comprueba que no haya
  relaciones de usuario, serializa otros inicializadores y aplica schema + migraciones
  clinica y de sesiones, sin leer el seed. Rechaza una base existente antes de aplicar SQL. No correr
  simultaneamente otro administrador/migrador sobre esa base. Si falla parcialmente,
  conservarla para diagnostico y preparar otra base nueva; no hay reinicio destructivo.
- No crea administradores ni contrasenas predeterminadas. El primer administrador
  requiere un procedimiento de aprovisionamiento privado y revisado; esta fase no
  agrega un endpoint publico de bootstrap ni un usuario maestro conocido.
- Para bases existentes: aplicar **solo la migracion aditiva de sesiones 002** antes
  del codigo nuevo, siguiendo la seccion siguiente. Una base copiada de desarrollo no se convierte
  en produccion reiniciando; las cuentas reservadas quedan bloqueadas, pero sus datos
  permanecen y necesitan una decision operativa separada.

## Revocacion permanente y migracion de bases existentes

Se elige un contador persistente por usuario en lugar de una lista de JWT: la API
ya consulta al usuario en cada peticion, asi que comparar un entero no agrega otra
consulta ni almacenamiento por sesion. El JWT firmado incluye la version leida al
autenticar; nunca se completa una version ausente con cero para aceptar tokens antiguos.

`sql/migrations/002_auth_session_version.sql` agrega `users.session_version INTEGER
NOT NULL DEFAULT 0` con restriccion no negativa y dos triggers de autenticacion:

- Cambio efectivo de `password_hash`, por reset o cualquier UPDATE administrativo:
  incrementa la version de ese usuario.
- Transicion `is_active` de true a false: incrementa la version para todos los roles.
- Perfil profesional de `active` a cualquier otro estado, eliminacion de ese perfil
  activo o cambio de su propietario: incrementa la version del usuario anterior.
- La reactivacion no reduce ni reinicia el contador. Se rechazan intentos de reducirlo.
  Revisar sin cambiar el estado o guardar el mismo hash no revoca sesiones.

Cada incremento ocurre en la misma transaccion que el cambio. Un rollback revierte
ambos. Reaplicar la migracion no modifica versiones, contrasenas, estados ni registros
clinicos. Los triggers tambien cubren las actualizaciones SQL que no pasan por la API;
un propietario que deshabilite triggers o sustituya filas puede eludir la proteccion.
Los privilegios de actualizacion de `users` deben estar limitados a operadores de confianza.
Referencia del comportamiento transaccional: [triggers de PostgreSQL 17](https://www.postgresql.org/docs/17/trigger-definition.html).

No existe actualmente un endpoint separado para cambiar contrasena autenticado.
El trigger protege cualquier cambio de hash, incluido el flujo actual de reset y
un cambio administrativo. No se agrega un endpoint nuevo en esta fase.

En un despliegue existente, con respaldo y ventana de mantenimiento, detener todas
las replicas anteriores de la API. Aplicar la migracion con la configuracion de la
base deliberadamente seleccionada y un rol de migraciones con permisos DDL:

```sh
cd backend
npm run db:migrate:auth-sessions
```

Para el Compose local existente, desde la raiz del repo con el codigo nuevo disponible:

```sh
docker compose stop backend
docker compose build backend
docker compose run --rm --no-deps backend npm run db:migrate:auth-sessions
docker compose up -d --no-deps backend
```

Si la migracion falla, no arrancar el codigo nuevo hasta corregirla. El ALTER necesita
bloqueo de tabla: ejecutar en una ventana sin escrituras; no programarlo en el arranque
normal. **No ejecutar `db:schema`, `db:seed`, `db:init` ni normalizadores sobre esa base**.
Esta tarea no ejecuto la migracion sobre ninguna base real ni volumen persistente.

Todos los JWT emitidos por la version anterior carecen de `sv` y quedaran invalidados:
los usuarios deben iniciar sesion una vez tras el despliegue. El esquema es compatible
con el codigo anterior, pero ese codigo no verifica versiones: no mantener replicas
antiguas atendiendo trafico ni volver a ellas como rollback de seguridad. No quitar
la columna ni bajar contadores para recuperar sesiones.

Las bases nuevas de Docker, `db:init:dev` y `db:init:production` aplican 002 explicitamente.
Los volumenes existentes necesitan el comando anterior; reiniciar Docker no los migra.

## Recuperacion y riesgos pendientes

La recuperacion actual genera un token, pero no envia correo. Antes se devolvia el
token por HTTP en cualquier entorno distinto de `production`, permitiendo tomar
cuentas en staging mal configurado. Ahora request y confirm devuelven **503** fuera
del modo local explicito, antes de consultar/modificar datos. Local conserva el preview.
No habilitar recuperacion remota hasta implementar entrega privada y segura.

La verificacion bloquea desde la siguiente peticion, sin cache; no cancela una que
ya supero la verificacion. Tras suspension/desactivacion y posterior reactivacion,
los JWT anteriores permanecen invalidados. Cambiar/restablecer contrasena invalida
todas las sesiones anteriores del usuario. Un login concurrente puede producir un
token de la version anterior, pero la siguiente peticion lo rechaza.
El plazo sigue siendo `JWT_EXPIRES_IN` (7 dias por defecto). Cerrar sesion en el cliente
todavia solo elimina el token local: esta fase no agrega logout remoto ni revocacion
individual por dispositivo. La version revoca todas las sesiones del usuario juntas.

Request y confirm de reset toman primero un bloqueo de usuario `FOR NO KEY UPDATE`,
releen la validez del token despues de obtenerlo y consumen los tokens de ese usuario
en la misma transaccion del cambio de hash/version. Dos confirmaciones concurrentes
permiten un solo exito. Un reset invalido, vencido, reutilizado o de un usuario inactivo
no cambia el hash ni la version. Se conserva el **503** fuera del modo local.

Persisten: falta de limitacion de intentos en login/registro, almacenamiento web del
JWT en localStorage (expuesto a XSS), CORS abierto, bcrypt con limite de entrada de
72 bytes. La recuperacion remota esta deshabilitada; antes de habilitarla hace falta
entrega privada. La conexion con `DB_SSL=true` sigue sin validar certificados;
configurar TLS verificado requiere otro cambio. Esta fase no modifica estos contratos.
La consulta a PostgreSQL por peticion ya existia; se reutiliza sin agregar otra.

Referencia de criterio: [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)
(algoritmo explicito, secreto aleatorio y revocacion).

## Verificacion desde la laptop (Ubuntu/WSL o PowerShell)

Usar esta rama **localmente disponible** y Docker Desktop. Desde la raiz del checkout:

```sh
git switch fix/authentication-security
docker compose -p psicopanel-auth-test -f compose.integrity-test.yaml build
docker compose -p psicopanel-auth-test -f compose.integrity-test.yaml run --rm --no-deps backend npm test
docker compose -p psicopanel-auth-test -f compose.integrity-test.yaml run --rm backend npm run test:integration
docker compose -p psicopanel-auth-test -f compose.integrity-test.yaml run --rm --no-deps frontend
docker compose -p psicopanel-auth-test -f compose.integrity-test.yaml up -d --wait init-db
docker compose -p psicopanel-auth-test -f compose.integrity-test.yaml --profile initialization down
```

El nombre de proyecto anterior se reserva exclusivamente para pruebas. La base es
PostgreSQL 17 en tmpfs, sin puertos ni volumen persistente; `down` descarta solo ese
entorno. Para repetir integracion, bajar primero ese mismo proyecto: se exige base
vacia y no se borra ninguna base desde los tests. Nunca sustituir variables para
apuntar a una base real. No usar `down -v` ni ejecutar seeds en el proyecto normal.

La suite de autenticacion crea una segunda base dentro del cluster desechable:
prueba instalacion de produccion sin cuentas, rechazo de replay conservando una fila
testigo, rechazo de seeds, login real, JWT anterior tras suspension/rechazo/pendiente,
perfil ausente, desactivacion de todos los roles, cambios de rol, permisos, JWT invalidos,
bloqueo demo y recuperacion no local. Tambien cubre revocacion permanente despues de
reactivar, reset y cambio SQL para todos los roles, JWT sin version, registro de paciente,
versiones tras repetir la migracion, rollback e intentos de reset concurrentes.
La suite clinica corre despues en su propia base y compara los datos completos antes
y despues de aplicar dos veces 002 sobre usuarios y expedientes ya poblados.

Para observarlo en interfaz, usar **otra demo nueva y desechable**, obtener un JWT
con un psicologo activo y suspenderlo desde el backoffice admin. La siguiente llamada
a `/api/auth/me` o cualquier endpoint protegido con ese JWT debe responder 403;
desactivar `users.is_active` en esa demo debe producir 401. Un administrador/support
sigue accediendo al backoffice sin ganar acceso clinico global.

## Evidencia de la primera fase

Ejecutado el 2026-10-16 en Docker Desktop (Node 24, PostgreSQL 17), proyecto aislado
`psicopanel-auth-security-20261016`:

| Comprobacion | Resultado |
| --- | --- |
| `npm test` | 74/74 unitarias, 0 fallos, 0 omitidas (68 anteriores + 6 nuevas) |
| `npm run test:integration` | 7 escenarios auth + 10 clinicos; Node reporta 19/19 incluyendo los dos tests contenedores, 0 omitidos |
| `npm run lint` en frontend | Correcto |
| `npm run build` en frontend | Correcto; tambien se busco `Demo12345`, correos doctor/root/juan demo en `dist`, sin coincidencias |
| `node --check` en src/scripts/test de backend | Correcto; no hay script de lint/build propio en backend |
| `docker compose ... build` | Ambas imagenes construidas con `npm ci` y lockfiles sin cambios |
| `up -d --wait init-db` | PostgreSQL nuevo saludable con schema, seed y migracion exclusivamente en tmpfs |
| Inicializador demo con `NODE_ENV=production` | Rechazado antes de ejecutar psql |

La integracion final se repitio tras reconstruir las imagenes, sobre otro cluster
vacio, y confirma la comprobacion adicional de reset remoto deshabilitado.
Los stack traces 403/409 de los escenarios negativos los emite el manejador de
errores existente y son respuestas esperadas; los procesos finalizaron con codigo 0.
La inicializacion de produccion se probo solo en una base desechable; conservar una
fila testigo tras rechazar el replay demuestra que no se ejecuta schema sobre datos.
No hubo prueba visual interactiva del navegador.

Vite aviso que Browserslist/caniuse-lite esta desactualizado. `npm ci` informo
7 vulnerabilidades de backend (1 critica, 4 altas, 1 moderada, 1 baja) y 16 de
frontend (12 altas, 3 moderadas, 1 baja); no se cambio ninguna dependencia ni se
ejecuto `npm audit fix`. Su investigacion y correccion quedan para otro PR.

Los contenedores y la red de este proyecto desechable se retiraron con `down`,
sin `-v`. No se ejecutaron scripts ni seeds contra volumenes existentes ni se
modificaron datos reales. No se hizo push ni merge.

## Evidencia de la ampliacion: revocacion permanente

Ejecutado en la misma rama el 2026-10-16, proyecto Docker exclusivo de pruebas
`psicopanel-auth-revocation-20261016`, PostgreSQL 17 en tmpfs:

| Comprobacion | Resultado |
| --- | --- |
| `npm test` | **75/75**, sin fallos ni omitidas; se amplio el test de middleware y se agrego el de versiones |
| `npm run test:integration` final | **26/26** de Node, equivalentes a **24 escenarios** (13 auth + 11 clinicos/migracion) y dos tests contenedores |
| `npm run lint` y `npm run build` de frontend | Correctos, interfaz sin cambios en esta ampliacion |
| `node --check` de src/scripts/test de backend | Correcto |
| Construccion de imagen backend | Correcta, dependencias y lockfiles sin cambios |
| Inicializacion local nueva con `up -d --wait init-db` | Saludable; consulta SQL confirma los dos triggers y version 0 en las 11 cuentas demo desechables |
| Inicializacion de produccion nueva | Suite confirma schema + 001 + 002 sin cuentas demo |
| Upgrade sobre datos existentes desechables | Snapshot completo identico antes/despues, excluyendo solamente la columna nueva; migracion repetida dos veces |
| Reaplicacion con versiones no cero | Conserva contadores y sesiones nuevas; no resucita tokens anteriores |

Se comprobaron suspension/rechazo/pendiente y reactivacion, eliminacion de perfil,
desactivacion y reactivacion de todos los roles, contrasena cambiada por SQL y reset
HTTP para todos los roles, dos sesiones anteriores por reset, login con nueva
contrasena, rechazo de la anterior, JWT sin version, reset invalido/vencido/reutilizado,
cuenta inactiva y rollback de contrasena y suspension. Dos confirmaciones simultaneas
con el mismo token producen exactamente un 200 y un 400; el contador aumenta una vez.
La suite clinica previa continua pasando despues de actualizar una base ya poblada.

El entorno se retiro con `down` sin `-v`. No se migro ninguna base real, no se ejecuto
seed sobre volumen existente y no se mezclaron correcciones de npm audit.
