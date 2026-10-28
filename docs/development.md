# Desarrollo, Docker/WSL y validación

Estado D2: D1 integrado en main `2fe0799ee683273df2dbed872840bbfd2ef03f6d` mediante #17; D2 se implementa en rama nueva con PR Draft y ensayos nuevos aislados. [Contrato D2](private-professional-management.md), [evidencia D2](private-professional-validation.md). Sin merge, despliegue habitual, D3 ni nuevas vinculaciones.

Procedimientos contrastados con [compose.yaml](../compose.yaml), [Dockerfile backend](../backend/Dockerfile), [Dockerfile frontend](../frontend/Dockerfile) y [package.json backend](../backend/package.json)/[frontend](../frontend/package.json). Documentar un comando no autoriza ejecutarlo. La CI integrada usa exclusivamente runners estándar GitHub-hosted Ubuntu, sandboxes nuevos y ensayos ficticios; [implementación y límites](ci-implementation.md).

**Pruebas y contribución:** [CONTRIBUTING](../CONTRIBUTING.md) define entrega por rama/PR; el [plan CI-01–07](ci-plan.md) conserva la propuesta histórica y sus criterios. La [implementación CI](ci-implementation.md) está integrada en `main` mediante #14; la [ejecución del merge 39363841602](https://github.com/japh113/plataformaPsicologia/actions/runs/39363841602) aprobó los siete checks. Los PR exclusivamente Markdown también ejecutan automáticamente toda la matriz en runners nuevos, con artifacts del commit realmente probado.

CI-02 fue comprobado con PR #15; CI-07 con el [ensayo negativo #16](https://github.com/japh113/plataformaPsicologia/pull/16), cerrado sin merge. Protect main exige los siete checks, política estricta y sin bypass. D1 conserva esa configuración; sus resultados propios se documentan por SHA, sin reutilizar evidencia B/C como nueva. Ensayos D1 autorizados solo en recursos nuevos aislados; no operar Compose/base habitual.

## Preparación de entorno local nuevo (solo con autorización)

No hace falta instalar Node.js, npm ni PostgreSQL en el host. Las imagenes de desarrollo usan Node 24 y PostgreSQL 17; las dependencias se instalan con `npm ci` usando los lockfiles existentes.

### Requisitos en Windows / Ubuntu WSL 2

- Docker Desktop en modo **Linux containers**, con motor WSL 2.
- Activar **Settings > Resources > WSL Integration > Ubuntu**.
- Se recomienda clonar el repositorio dentro del filesystem de Ubuntu, por ejemplo `~/projects/plataformaPsicologia`, y ejecutar los comandos desde esa terminal. Evitar `/mnt/c` mejora el rendimiento.
- Comprobar `docker version` y `docker compose version`. El entorno tambien puede ejecutarse desde PowerShell con Docker Desktop y el repo accesible.

### Primera ejecucion

Desde la raíz del repositorio, solo en la preparación autorizada de un entorno nuevo y sin sobrescribir un .env existente, crear la configuración local:

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

`stop` y `down` conservan los datos. No eliminar volúmenes existentes. Los comandos destructivos o cambios al entorno habitual requieren autorización expresa. Para una demo nueva, usar el sandbox aislado descrito abajo, con puertos dinámicos y recursos propios; no detener ni reconstruir el proyecto habitual para hacer espacio.

React/Vite y nodemon observan los cambios con polling para soportar archivos editados desde Windows/WSL. Se montan los directorios fuente y archivos de configuracion en solo lectura desde el contenedor: el editor del host sigue pudiendo modificarlos. `node_modules` vive en las imagenes Linux, sin depender de instalaciones del host ni de volumenes de dependencias que queden desactualizados. Tras cambiar `package.json` o `package-lock.json`, ejecutar `docker compose up --build`.

### Tests y comprobaciones dentro de Docker

Con el entorno ya autorizado y levantado, estas comprobaciones no ejecutan schema/seed ni integración de bases:

```bash
docker compose exec backend npm test
docker compose exec frontend npm test
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
curl --fail http://localhost:5000/api/health
```

En PowerShell puede usarse `Invoke-RestMethod http://localhost:5000/api/health`. El backend tiene tests automatizados de agenda, notas, entrevista, permisos, identidad/contactos y recuperación de contraseña; el frontend dispone de unitarias Node, lint y build. Salud comprueba DB; no usarla en un encargo sin autorización de conexión.

Acceso manual a la base, sin publicar PostgreSQL:

```bash
docker compose exec db psql -U psicopanel -d psicopanel
```

Si 5173 o 5000 están ocupados, identificar el conflicto sin detener procesos ajenos; las demos aisladas usan puertos dinámicos. Para problemas de arranque revisar `docker compose ps` y `docker compose logs db backend frontend`.

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

## Pruebas aisladas y ausencia de npm en WSL

WSL puede no tener node/npm; en la auditoría de A ninguno estaba en PATH. No instalar en host por defecto ni usar contenedores habituales para integrar cambios. Las imágenes existentes de desarrollo usan Node 24 y lockfiles; verificar disponibilidad del motor y elegir ejecución autorizada antes de ensayar.

El proyecto ya dispone de [scripts/clinical-episodes.sh](../scripts/clinical-episodes.sh) y [compose.episodes-test.yaml](../compose.episodes-test.yaml). El wrapper genera proyecto UUID, comprueba recursos nuevos, usa DB tmpfs sin puerto público en red privada y verifica propiedad de imágenes. El modo test ejecuta SQL/runner de episodios, unitarias backend, integración auth/clínica/backoffice/identidad/contactos y lint/build. También ejecuta `frontend npm test`; Chromium se valida por separado y en la [implementación CI](ci-implementation.md). La demo usa puertos loopback dinámicos y datos ficticios; identity-demo no activa episodios o solicitudes nuevas. [Contrato C](contact-changes.md) describe contact-demo/contact-review y sus requisitos.

Solo con alcance de pruebas/demos autorizado, desde raíz:

```bash
bash scripts/clinical-episodes.sh test
bash scripts/clinical-episodes.sh demo
bash scripts/clinical-episodes.sh identity-demo
```

El modo demo muestra URL/cuentas ficticias y deja únicamente sus recursos propios para inspección. Restablecer significa crear otro destino nuevo; no reutilizar bases ni volúmenes. Limpieza solo del proyecto UUID propio y verificado según el procedimiento de [fundamentos 003](clinical-episodes-foundation.md); nunca prune o limpieza de recursos habituales. A no ejecutó el wrapper; B sí lo ejecuta con autorización y destinos nuevos.

`npm test` en backend selecciona unitarias; `npm run test:integration` requiere entorno opt-in aislado y `test:episodes` prueba SQL/runner y sucesoras. Ejecutarlos fuera del destino verificado puede omitir integración por flags: registrar ejecutadas/omitidas y entorno. En la CI integrada en `main`, cualquier omisión inesperada falla el check. No confundir un comando verde con validación de D o permisos por episodio todavía inexistentes.

## Inicialización, migraciones y evidencia

- Docker PostgreSQL nuevo aplica schema+seed y 001/002 mediante [init.sh](../docker/postgres/init.sh). El marcador solo se crea al terminar; no crearlo manualmente ni borrar el volumen tras un fallo.
- `db:schema` ejecuta baseline más 001/002 y `db:seed` datos demo; **no son upgrades**. No repetirlos sobre bases existentes ni ejecutarlos por un cambio documental.
- `db:init:production` rechaza base no vacía y no carga demo. Instala schema/001/002, no 003. No ejecutarlo ahora ni confundirlo con despliegue.
- 003 tiene runner de destino explícito, checksums/ledger/huella, y no se aplica por reiniciar Docker. Procedimientos específicos en [clinical-episodes-foundation.md](clinical-episodes-foundation.md); 001/002 en [integridad](clinical-data-integrity.md) y [autenticación](authentication-security.md).
- D1 conserva 001–005 y sus entradas/hashes, agrega 006 al manifiesto; no, asumir despliegue, inferir históricos ni ejecutar normalizadores como reparación. 004 de B y 005 de C están integradas y validadas aisladamente; 006 de D1 prepara persistencia privada en el [plan](identity-directory-delivery-plan.md). Runner actual admite targets explícitos 003/004/005/006.
- Mantener secretos fuera de logs/commits/frontend. Las cuentas demo se restringen al modo local explícito; nunca copiarlas o habilitarlas en producción.

## Validaciones según tipo de cambio

Markdown: revisar diff, referencias a archivos/fragmentos, IDs y estados aprobado/propuesto/implementado. No ejecutar manualmente integración, SQL o demos para validar enlaces. La [auditoría documental A](documentation-audit.md) conserva su corte histórico. La CI integrada ejecuta automáticamente los siete checks también para PR documentales, sin filtros de paths; verificar su ejecución vigente y la procedencia de sus artifacts según el [plan y criterios](ci-plan.md).

Código funcional: unitarias backend, integración HTTP/PostgreSQL pertinente en destino nuevo, lint/build frontend y demo ficticia ADR-019 del alcance, con evidencia reproducible. Si afecta agenda, revisar citas, disponibilidad y espera en frontend/backend; si afecta identidad, todos los escritores/lectores legacy y regresión JWT/backoffice. No retrasar pruebas hasta otra etapa.

Los reportes [de autenticación](authentication-security.md) y [de 003](clinical-episodes-validation.md) preservan evidencia histórica; no presentarla como ejecutada de nuevo ni reutilizar conteos de dependencias como estado vigente.
