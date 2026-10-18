# PsicoPanel

PsicoPanel es una aplicacion web para psicologos y pacientes. Hoy funciona como una `web-app` real y esa es la base activa del repo. La direccion de producto a mediano plazo es migrar la experiencia cliente a una app movil, pero sin perder la logica de negocio ya consolidada en esta version web.

Hoy ya tiene una base funcional real con frontend React + Vite, backend Express, PostgreSQL, auth por roles, agenda, disponibilidad, lista de espera, tareas, recordatorios y expediente clinico.

## Stack actual
- Frontend: React 19, Vite, Tailwind, lucide-react
- Backend: Node.js, Express, PostgreSQL, JWT, bcryptjs
- Base de datos: PostgreSQL

## Stack lean objetivo
Este es el stack de referencia para el futuro del producto y debe mantenerse presente en decisiones tecnicas nuevas:
- React Native + Expo
- Node.js + TypeScript + Express
- PostgreSQL
- Railway o Render
- Auth propia
- Expo Notifications
- Cloudflare R2 si se necesitan archivos
- Resend para emails

Nota:
- hoy el repo sigue en `web-app`
- no se esta migrando todavia a React Native
- los cambios actuales deben intentar no bloquear esa migracion futura

## Estado actual
- Roles reales: `psychologist` y `patient`
- Auth con JWT
- Pacientes persistidos en PostgreSQL
- Citas con reglas de agenda, disponibilidad y conflictos
- Disponibilidad semanal con multiples bloques por dia
- Excepciones por fecha y bloqueos por rango
- Lista de espera por horario con prioridad y drag & drop
- Tareas por paciente
- Historial clinico por notas clinicas
- Recordatorios in-app

## Estructura
- [`frontend/`](./frontend): app web
- [`backend/`](./backend): API REST + SQL
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): mapa tecnico del sistema
- [`AGENTS.md`](./AGENTS.md): guia operativa para futuros chats/agentes
- [`NOTES.md`](./NOTES.md): decisiones, estado del producto y pendientes

## Desarrollo local con Docker (recomendado)

No hace falta instalar Node.js, npm ni PostgreSQL en el host. Las imagenes de desarrollo usan Node 24 y PostgreSQL 17; las dependencias se instalan con `npm ci` usando los lockfiles existentes.

### Requisitos en Windows / Ubuntu WSL 2

- Docker Desktop en modo **Linux containers**, con motor WSL 2.
- Activar **Settings > Resources > WSL Integration > Ubuntu**.
- Se recomienda clonar el repositorio dentro del filesystem de Ubuntu, por ejemplo `~/projects/plataformaPsicologia`, y ejecutar los comandos desde esa terminal. Evitar `/mnt/c` mejora el rendimiento.
- Comprobar `docker version` y `docker compose version`. El entorno tambien puede ejecutarse desde PowerShell con Docker Desktop y el repo accesible.

### Primera ejecucion

Desde la raiz del repositorio, crear la configuracion local:

```bash
cp .env.example .env
```

En PowerShell: `Copy-Item .env.example .env`.

Completar `POSTGRES_PASSWORD` y `JWT_SECRET` con dos valores aleatorios distintos de al menos 32 bytes. Se puede generar cada valor sin Node en el host:

```bash
docker run --rm node:24-bookworm-slim node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

El archivo `.env` de la raiz esta ignorado por Git. Compose rechaza secretos vacios y solo entrega las variables necesarias a cada servicio. No copiar secretos al frontend: las variables `VITE_*` son publicas. Los `.env` del frontend/backend no se copian a las imagenes ni se montan en los contenedores; este entorno usa unicamente la configuracion declarada en Compose.

Levantar los tres servicios:

```bash
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:5000/api
- Salud de API y conexion a PostgreSQL: http://localhost:5000/api/health

La respuesta de salud debe indicar `success: true` y `data.database: "connected"`. Para segundo plano usar `docker compose up --build -d --wait`.

Solo los puertos 5173 y 5000 se publican en `127.0.0.1`. PostgreSQL no publica puertos; esta en una red `internal` compartida solo con el backend. El navegador usa `localhost:5000`, mientras que la API conecta al host interno `db:5432`.

### Inicializacion y persistencia

El volumen nombrado `postgres_data` conserva la base al detener, recrear o reconstruir los contenedores. Solo cuando PostgreSQL crea un directorio de datos nuevo ejecuta `docker/postgres/init.sh`: aplica `schema.sql` y despues `seed.sql` en una unica transaccion con parada ante errores. El healthcheck exige que termine esa inicializacion y que PostgreSQL acepte conexiones TCP antes de arrancar la API.

**El SQL existente no es una migracion inocua**: el esquema incluye cambios de columnas, eliminaciones y normalizaciones; el seed actualiza perfiles, relaciones, citas y notas, y elimina notas duplicadas. No se ejecutan `db:init`, `db:schema`, `db:seed` ni los normalizadores al arrancar el backend o al reiniciar los servicios. Cambiar SQL en el repo no actualiza automaticamente una base existente; cualquier evolucion de esquema requiere revision y ejecucion manual sobre una copia/backup.

Si falla la primera inicializacion, revisar `docker compose logs db`. PostgreSQL no reintenta los scripts sobre un directorio ya creado y el marcador faltante mantiene el servicio no saludable. No crear ese marcador manualmente: corregir el problema y usar un volumen nuevo, conservando el anterior si contiene datos que deban recuperarse.

La contrasena de PostgreSQL se fija al crear el volumen. Cambiarla solo en `.env` no actualiza el usuario de una base existente: restaurar el valor original o cambiarla explicitamente con SQL antes de actualizar la configuracion.

### Trabajo diario y hot reload

```bash
docker compose logs -f
docker compose stop
docker compose start
docker compose down
docker compose up --build
```

`stop` y `down` conservan los datos. **No usar `docker compose down -v` salvo que se quiera eliminar definitivamente la base local y todos sus datos.** Para una demo nueva sin borrar la anterior, usar otro nombre de proyecto, por ejemplo `docker compose -p psicopanel-demo-nueva up --build`, tras detener el proyecto anterior para liberar los puertos. Usar el mismo `-p` en los comandos posteriores.

React/Vite y nodemon observan los cambios con polling para soportar archivos editados desde Windows/WSL. Se montan los directorios fuente y archivos de configuracion en solo lectura desde el contenedor: el editor del host sigue pudiendo modificarlos. `node_modules` vive en las imagenes Linux, sin depender de instalaciones del host ni de volumenes de dependencias que queden desactualizados. Tras cambiar `package.json` o `package-lock.json`, ejecutar `docker compose up --build`.

### Tests y comprobaciones dentro de Docker

Con el entorno levantado:

```bash
docker compose exec backend npm test
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
curl --fail http://localhost:5000/api/health
```

En PowerShell puede usarse `Invoke-RestMethod http://localhost:5000/api/health`. El backend tiene tests automatizados de agenda, notas, entrevista, permisos y recuperacion de contrasena; el frontend dispone de lint y build, sin script de tests propio.

Acceso manual a la base, sin publicar PostgreSQL:

```bash
docker compose exec db psql -U psicopanel -d psicopanel
```

Si 5173 o 5000 estan ocupados, detener el proceso que los utiliza. Para problemas de arranque revisar `docker compose ps` y `docker compose logs db backend frontend`.

Este Compose es exclusivamente de desarrollo local, con cuentas demo conocidas; no es una configuracion de despliegue de produccion.

## Ejecucion manual alternativa

Solo para quienes ya tengan Node y PostgreSQL instalados. Usar `frontend/.env.example` y `backend/.env.example` como referencia. Aplicar esquema y demo **solo sobre una base local nueva y vacia**, despues de revisar el SQL:

```bash
cd backend
npm ci
npm run db:init
npm run dev
```

En otra terminal:

```bash
cd frontend
npm ci
npm run dev
```

En arranques posteriores ejecutar solamente `npm run dev` en cada carpeta.

## Credenciales demo
Solo en desarrollo local explicito. No se incluyen en el build de produccion ni se
permite autenticar los IDs reservados del seed fuera del modo local.

- Psicologo: `doctor@psicopanel.com` / `Demo12345!`
- Paciente: `juan@example.com` / `Demo12345!`

## Comandos utiles

La politica de JWT, bloqueo inmediato por estado, configuracion segura e inicializacion
de produccion sin demos estan en [docs/authentication-security.md](docs/authentication-security.md).
Incluye pasos de pruebas aisladas desde la laptop y limites de revocacion.
`LOCAL_DEVELOPMENT=true` solo es valido con `NODE_ENV=development` o `test`; no usarlo
en entornos remotos. Fuera de local se exige un secreto JWT aleatorio propio y la
recuperacion de contrasena devuelve 503 hasta configurar un canal privado de entrega.
`db:init`/`db:schema`/`db:seed` quedan restringidos a local; `db:init:production` acepta
exclusivamente una base nueva y vacia y no crea cuentas.
Las bases existentes requieren **`npm run db:migrate:auth-sessions`** antes de arrancar
el backend nuevo. La migracion 002 agrega la version de sesion y triggers de revocacion,
sin schema/seed ni cambios clinicos. Los JWT anteriores sin version dejan de funcionar;
todos deben iniciar sesion de nuevo. Reiniciar Docker no aplica la migracion a un volumen
existente. El procedimiento completo esta en la guia de autenticacion enlazada arriba.

### Frontend
```bash
cd frontend
npm run lint
npm run build
```

### Backend
```bash
cd backend
npm run db:schema
npm run db:seed
npm run db:normalize-appointments
npm run db:normalize-future-clinical-notes
```

## Nota importante
Este repo ya trae bastante contexto conversacional convertido en codigo. Antes de tocar agenda, disponibilidad, notas clinicas o lista de espera, conviene leer:
- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`AGENTS.md`](./AGENTS.md)
- [`NOTES.md`](./NOTES.md)

## Convencion de trabajo
- hacer commits descriptivos cuando un cambio quede estable
- push frecuente a `main` si la tarea ya esta validada
- si el cambio es grande o riesgoso, se puede usar branch temporal, pero por defecto se ha trabajado con commits frecuentes a `main`

## Proteccion de expedientes clinicos

La politica de conservacion, la auditoria de citas/pacientes y el procedimiento de migracion estan en [docs/clinical-data-integrity.md](docs/clinical-data-integrity.md). Una base existente requiere la migracion especifica antes de arrancar este backend; reiniciar Docker no la aplica. No usar schema/seed para migrar expedientes reales.

## Fundamentos de episodios clínicos (003)

Migración aditiva de 2A con ejecución explícita; no se aplica al iniciar Docker ni activa permisos por episodio. Procedimiento para instalaciones nuevas/existentes autorizadas, diagnóstico, pruebas y demo en [docs/clinical-episodes-foundation.md](docs/clinical-episodes-foundation.md). Pruebas aisladas: `bash scripts/clinical-episodes.sh test`; demo nueva: `bash scripts/clinical-episodes.sh demo`. No usar schema/seed para actualizar bases existentes.
