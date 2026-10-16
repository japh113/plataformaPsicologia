# Auditoria de autenticacion — 2026-10-16

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
  relaciones de usuario, serializa otros inicializadores y aplica schema + migracion
  clinica, sin leer el seed. Rechaza una base existente antes de aplicar SQL. No correr
  simultaneamente otro administrador/migrador sobre esa base. Si falla parcialmente,
  conservarla para diagnostico y preparar otra base nueva; no hay reinicio destructivo.
- No crea administradores ni contrasenas predeterminadas. El primer administrador
  requiere un procedimiento de aprovisionamiento privado y revisado; esta fase no
  agrega un endpoint publico de bootstrap ni un usuario maestro conocido.
- Para bases existentes: **no hay migracion de datos necesaria por esta fase**.
  Aplicar solo configuracion y codigo. Una base copiada de desarrollo no se convierte
  en produccion reiniciando; las cuentas reservadas quedan bloqueadas, pero sus datos
  permanecen y necesitan una decision operativa separada.

## Recuperacion y riesgos pendientes

La recuperacion actual genera un token, pero no envia correo. Antes se devolvia el
token por HTTP en cualquier entorno distinto de `production`, permitiendo tomar
cuentas en staging mal configurado. Ahora request y confirm devuelven **503** fuera
del modo local explicito, antes de consultar/modificar datos. Local conserva el preview.
No habilitar recuperacion remota hasta implementar entrega privada y segura.

La verificacion vigente bloquea desde la siguiente peticion, sin cache. No cancela
una peticion que ya supero la verificacion. Si se reactiva una cuenta, su JWT aun
no expirado vuelve a funcionar. No es una lista permanente de tokens revocados.
El plazo sigue siendo `JWT_EXPIRES_IN` (7 dias por defecto); cambiar contrasena o
cerrar sesion no revoca JWT anteriores. Una futura version de sesion o registro de
tokens permitiria revocacion definitiva por usuario sin rotacion global.

Persisten: falta de limitacion de intentos en login/registro, almacenamiento web del
JWT en localStorage (expuesto a XSS), CORS abierto, bcrypt con limite de entrada de
72 bytes y flujo de reset sin bloqueo concurrente del token. La recuperacion remota
esta deshabilitada; antes de habilitarla hacen falta entrega, pruebas de concurrencia
y revocacion de sesiones. La conexion con `DB_SSL=true` sigue sin validar certificados;
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
bloqueo demo y recuperacion no local. La suite clinica corre despues en su propia base.

Para observarlo en interfaz, usar **otra demo nueva y desechable**, obtener un JWT
con un psicologo activo y suspenderlo desde el backoffice admin. La siguiente llamada
a `/api/auth/me` o cualquier endpoint protegido con ese JWT debe responder 403;
desactivar `users.is_active` en esa demo debe producir 401. Un administrador/support
sigue accediendo al backoffice sin ganar acceso clinico global.

## Evidencia de esta ejecucion

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
