# Seguridad de dependencias del backend

Informe histórico de #56 (integrado), corte del encargo: 4 de noviembre de 2026. Base remota verificada por `git fetch origin`: `d15cd5c1e09411bbfe794c6415d05e3c9ed65dac`, con #54 y #55 integrados; GitHub no devolvió PR abiertos al iniciar. Rama `fix/security-backend-dependencies`, un único PR Draft hacia main, sin merge ni despliegue. Este informe complementa el [checkpoint histórico](project-checkpoint.md), sin iniciar otro incremento.

## Cambio mínimo y versiones efectivas

`npm view express@4.22.3 dependencies --json` confirma `body-parser: ~1.20.5`, `proxy-addr: ~2.0.7` y `qs: ~6.16.0`. `npm view body-parser@1.20.9 version dependencies engines --json` confirma disponibilidad y compatibilidad. El comando estándar `npm update body-parser --package-lock-only --ignore-scripts --no-audit --no-fund --prefix backend` cambia exclusivamente versión, URL e integridad de body-parser en [backend/package-lock.json](../backend/package-lock.json). No requiere dependencia directa ni override. No cambia el manifiesto ni actualiza Express.

| Paquete | Backend antes | Backend después | Motivo / alcance |
| --- | --- | --- | --- |
| express | 4.22.3 | 4.22.3 | Sin cambio mayor ni menor. |
| body-parser | 1.20.8 | 1.20.9 | Primera versión corregida indicada por el diagnóstico del propietario; satisface la restricción transitiva de Express 4. |
| proxy-addr | 2.0.8 | 2.0.8 | Ya cumple el mínimo corregido proporcionado. |
| qs | 6.16.1 | 6.16.1 | Ya cumple el mínimo corregido proporcionado. |
| brace-expansion | 5.0.12 | 5.0.12 | Sin cambio; la consulta npm audit de esta entrega no lo señala en backend. |
| minimatch | 10.2.5 | 10.2.5 | Salto mayor a 11 fuera de alcance; permanece pendiente. |

No hay otras modificaciones transitivas, eliminaciones ni dependencias añadidas en el lockfile del backend. `npm ls --all` termina con salida cero en la instalación nueva; el árbol relevante es Express → body-parser → qs, Express → proxy-addr y nodemon → minimatch → brace-expansion.

## Evaluación histórica de la raíz en #56

[package.json histórico](https://github.com/japh113/plataformaPsicologia/blob/2636f3ed94fa98a916b714cff7b3e7e20b415685/package.json) solo declara `psicologia-backend: file:backend`. Su [lockfile histórico](https://github.com/japh113/plataformaPsicologia/blob/2636f3ed94fa98a916b714cff7b3e7e20b415685/package-lock.json) guarda una instantánea antigua del manifiesto backend (solo cors y Express), mientras que el backend actual también necesita bcryptjs, jsonwebtoken, pg y sharp.

No se encontró consumidor vigente de una instalación raíz entre scripts, workflows, Dockerfiles y procedimientos versionados. [Docker backend](../backend/Dockerfile) copia sus propios manifiestos desde el contexto backend; frontend hace lo mismo. [CI](../scripts/ci/run.py) instala por subdirectorio con `npm ci --ignore-scripts`; sus sandboxes construyen por aplicación y el navegador tiene su propio lockfile. [Desarrollo](development.md) describe instalaciones backend/frontend, sin instalación raíz. La declaración file sigue siendo un posible punto de entrada manual; no se acredita que alguien la use fuera de Git.

Ensayo nuevo: `npm ci --ignore-scripts --no-audit --no-fund` desde una copia efímera de los manifiestos raíz y backend, en Linux/Node 24.22.0/npm 11.19.1, **falla con EUSAGE**. Señala dependencias ausentes y Express incompatible con el manifiesto actual. El lockfile raíz no es reproducible con ese comando y no representa el backend vigente.

Se conservan **ambos archivos raíz sin cambios**, según la vía del encargo para archivos aparentemente innecesarios. No se elimina ni reestructura ese punto de entrada. Una retirada futura debe confirmar usos externos y advertir que `npm ci`/`npm install` en raíz dejarían de ofrecer ese enlace local; no afecta los contextos actuales Docker/CI, que instalan por aplicación. Si se decide conservarlo como instalador soportado, requerirá sincronizar el manifiesto enlazado y todas sus dependencias hoy ausentes, y verificar separadamente instalación y ejecución; no basta con actualizar cuatro transitivas. Una regeneración exploratoria desde Windows/UNC resolvió incorrectamente el enlace e intentó retirar el árbol: fue descartada íntegramente, no forma parte del diff ni de la evidencia de instalación Linux.

| Paquete raíz conservado | Versión | Resultado de este PR |
| --- | --- | --- |
| express | 4.22.1 | Sin cambio; raíz sin consumidor versionado identificado. |
| body-parser | 1.20.4 | Pendiente frente al mínimo 1.20.9 indicado. |
| proxy-addr | 2.0.7 | Pendiente frente al mínimo 2.0.8 indicado. |
| qs | 6.14.2 | Pendiente frente al mínimo 6.16.1 indicado. |
| brace-expansion | 5.0.5 | Alertas raíz proporcionadas siguen pendientes de verificación posterior. |
| minimatch | 10.2.5 | Pendiente; sin salto mayor forzado. |

## Validación nueva y límites

Contenedores nuevos `docker run --rm`, sin PostgreSQL, sin puertos publicados ni volúmenes persistentes: fuente montada en solo lectura y copia selectiva de manifiestos/src/test/scripts/sql a tmpfs. No se copian `.env`, no se ejecuta SQL ni se conecta una base. Imagen Node fijada por [versions.json](../scripts/ci/versions.json): `sha256:ec857ea6bb60cb3d0fa4d97495590c5fe7d51be8572c307b55957eeb06569cf7`, Node 24.22.0/npm 11.19.1. No se instalan herramientas en host ni se reconstruyen servicios habituales.

- Backend: `npm ci --no-audit --no-fund` correcto, 131 paquetes instalados; `npm ls --all` correcto. `npm test`: **157 aprobadas, cero fallos, canceladas u omitidas**.
- La nueva [regresión HTTP](../backend/test/http-json-parser.test.js) monta la aplicación de producción: JSON ordinario y gzip/deflate válidos llegan al validador; JSON malformado, escalar estricto y gzip corrupto devuelven 400; cuerpos de 100 KiB + 1 byte, sin comprimir y expandidos desde gzip, devuelven 413; codificación br y charset no soportados devuelven 415. CORS y Retry-After expuesto se conservan, sin DB/bcrypt. Carga máxima acotada, sin estrés.
- Las pruebas existentes de autenticación, registro, recuperación y limitadores se ejecutan en la misma suite. Conservan cuotas compartidas, 429, preflight, validación y recuperación deshabilitada; no se modifica middleware, configuración, orden ni lógica de autenticación.
- Frontend sin cambios: npm ci correcto; **64 unitarias aprobadas, cero fallos/omisiones**; lint y build correctos en copia efímera. Build emite avisos de reglas @tailwind y bundle mayor de 500 kB; no se cambian dependencias ni configuración frontend.
- Integración PostgreSQL/JWT/B/C/AB-23 y demos ficticias B/C/D2: matriz CI autorizada en runners nuevos; no se ejecutan contra recursos habituales. Los siete checks y artifacts de 14 días se registran con HEAD y merge probado en el PR. No se reutiliza evidencia histórica como prueba nueva.

`npm audit --json` sobre el lockfile backend intervenido devuelve **dos entradas moderadas**: minimatch y su dependiente nodemon (una misma cadena, no dos vulnerabilidades independientes). [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) indica rango `>=7.0.0 <11.0.1`; 10.2.5 sigue afectado. No señala body-parser, proxy-addr, qs ni brace-expansion en ese árbol. Las dependencias de frontend, navegador, raíz y demás alertas no se declaran resueltas por esta consulta.

La ocurrencia backend de body-parser debería quedar fuera del rango vulnerable proporcionado al integrar y reanalizar, pero las alertas #1/#22 y #13 deben contrastarse por manifiesto; no se afirma cierre de ninguna alerta GitHub. Las ocurrencias raíz de #21, #11/#16/#17/#23, #12/#20 y body-parser se conservan; #2/#24 de minimatch requieren revisión posterior sin forzar un major. La presencia en un lockfile no acredita explotabilidad: la aplicación usa express.json por defecto y el limitador de #55 obtiene el peer del socket. No se prueba carga distribuida ni resistencia integral a DoS.

SQL 001–011, manifiesto/hashes, frontend, workflows, Docker/Compose y versiones de runtime quedan intactos. Se mantienen JWT/revocación, identidad adulta, cuotas B/C, antienumeración, backoffice separado, AB-23, `prepared`, `allowed:false`, `audienceVerified:false` y originales privados, sin lecturas clínicas nuevas ni publicación automática. Auditoría independiente y decisión de integración corresponden al flujo del propietario.

## Retirada de la instalación raíz posterior a #56

Encargo independiente del 4 de noviembre de 2026, base remota reconsultada por fetch: `2636f3ed94fa98a916b714cff7b3e7e20b415685`. GitHub no devolvió PR abiertos al iniciar; se consultó el backlog abierto #28–#41. Rama `chore/remove-obsolete-root-npm`, entrega Draft sin merge ni despliegue. Las secciones anteriores conservan el diagnóstico y los ensayos de #56; no son pruebas nuevas de esta retirada.

Se eliminan exclusivamente los manifiestos npm de la raíz, `package.json` y `package-lock.json`. El primero solo enlazaba `file:backend`: no tenía scripts, workspaces, metadatos de distribución ni configuración de módulos. El segundo conservaba dependencias antiguas y una instantánea incompleta del backend. La razón de retirarlos es que no cumplen una función vigente identificada en el repositorio y la instalación no era reproducible; no se actualiza un árbol sin uso para reducir alertas.

### Inventario de consumidores investigados

Búsqueda sobre todos los archivos versionados, incluidos ocultos, con `git grep` (rg no disponible en WSL): manifiestos/lockfiles, `file:backend`, comandos npm, resolución de módulos, directorios de trabajo y empaquetado. Solo existe AGENTS raíz; no hay instrucciones anidadas versionadas.

| Superficie inspeccionada | Consumidor efectivo y resultado |
| --- | --- |
| [Docker backend](../backend/Dockerfile), [Docker frontend](../frontend/Dockerfile) | Cada Dockerfile copia sus propios manifiestos y ejecuta npm ci en /app; Compose usa contextos ./backend y ./frontend. No consume la raíz. |
| [Compose habitual](../compose.yaml), [episodios](../compose.episodes-test.yaml), [integridad](../compose.integrity-test.yaml) y [revisión](../compose.contact-review.yaml) | Construcciones por aplicación; los montajes de package.json apuntan explícitamente a backend/package.json. El override de revisión solo cambia la red. Inspección estática, sin levantar servicios habituales. |
| [Workflows](../.github/workflows), [runner CI](../scripts/ci/run.py), [negativos](../scripts/ci/negative.py) y [sandbox](../scripts/ci/sandbox.py) | npm ci/test con cwd backend o frontend; builds con contextos por aplicación. Las acciones y sus siete checks no requieren manifiesto raíz. Sin cambios de workflows ni retención de 14 días. |
| [Wrapper](../scripts/clinical-episodes.sh), [guardas de imágenes](../scripts/episode_images.py), scripts/run-*.py y revisiones *.cjs | Orquestan servicios por aplicación; navegador usa /review y sus [manifiestos propios](../scripts/ci/browser/package.json), o instalación explícita /review en [Dockerfile de revisión](../docker/contact-review.Dockerfile). Ese cuarto lockfile versionado también se conserva. |
| [Auditor de callbacks](../scripts/audit-patient-callbacks.cjs) | createRequire usa package.json del cwd para resolver ESLint; su uso documentado es en frontend, donde reside ESLint. No requiere el manifiesto raíz. Se verifica ejecutándolo desde frontend sin manifiesto raíz en la copia de pruebas. |
| Manifiestos backend/frontend, tests, Vite/ESLint/PostCSS/Tailwind, .dockerignore, .gitignore, .gitattributes | Scripts y resolución de dependencias propios de cada aplicación. El test professional-photo-path crea su propio package.json temporal. No se encontró npm pack/publish ni consumidor de distribución del enlace psicologia-backend. |
| [README](../README.md), [contribución](../CONTRIBUTING.md), [desarrollo](development.md), índice y documentación histórica | La instalación manual ya separa backend/frontend; las instrucciones Docker se lanzan desde raíz pero instalan dentro de cada aplicación. El diagnóstico de #56 se conserva con enlaces al commit histórico. |

La instalación npm soportada se realiza desde `backend/` y `frontend/`, cada una con sus propios manifiestos y lockfile. `npm ci` o `npm install` desde raíz dejan de ofrecer el enlace local obsoleto y no son procedimientos soportados. No se añaden workspaces ni manifiesto sustituto; no se modifica el empaquetado propio del backend o frontend.

### Validación nueva de la retirada

Contenedor nuevo `psicopanel-root-npm-b0ad270e-fa48-4746-a33f-d43ef43c1add`, eliminado automáticamente al terminar. Imagen Node fijada por [versions.json](../scripts/ci/versions.json): `node@sha256:ec857ea6bb60cb3d0fa4d97495590c5fe7d51be8572c307b55957eeb06569cf7`; Node 24.22.0/npm 11.19.1. Fuente montada de solo lectura, filesystem raíz de solo lectura y copias selectivas de backend/frontend/scripts en /work tmpfs, sin manifiestos raíz, .env ni node_modules previos. Sin PostgreSQL, puertos publicados, volúmenes persistentes o instalaciones en host.

- Backend, desde /work/backend: `npm ci --no-audit --no-fund`, 131 paquetes; `npm ls --all` y `npm ls express body-parser qs proxy-addr`, salida cero. Versiones efectivas: Express 4.22.3, body-parser 1.20.9, qs 6.16.1 y proxy-addr 2.0.8. `npm test`: **157 aprobadas, cero fallos/cancelaciones/omisiones**.
- Frontend, desde /work/frontend: `npm ci --no-audit --no-fund`, 214 paquetes; `npm test`: **64 aprobadas, cero fallos/cancelaciones/omisiones**. `npm run lint` y `npm run build` correctos; persiste aviso de bundle mayor de 500 kB, sin cambio de dependencias/configuración.
- `node ../scripts/audit-patient-callbacks.cjs` desde frontend: **44 callbacks, 58 await, ninguna guarda posterior ausente**, usando exclusivamente ESLint instalado en frontend.
- Contrato documental existente `scripts/ci/docs.py`: enlaces/fragmentos/IDs, decisiones protegidas y hashes SQL válidos. Diff restringido a los dos archivos retirados y estos documentos: seguridad de dependencias, desarrollo y checkpoint. Manifiestos y lockfiles backend/frontend/navegador, Docker/Compose, workflows, código y SQL idénticos a la base.
- La integración PostgreSQL y las demos/navegador B/C/D2 corresponden a la matriz CI automática en runners nuevos del Draft. Sus siete checks deben aprobar sobre el HEAD entregado; resultados, SHA exacto y ejecución se registran en el PR. Los resultados de #56 no se reutilizan como evidencia de esta entrega.

### Límites y seguridad residual

La ausencia de referencias versionadas no demuestra ausencia absoluta de consumidores externos: una automatización o práctica manual no registrada podría depender del enlace raíz y deberá pasar a instalar en backend/frontend. No se consultan ni modifican recursos habituales ni bases.

Las diez alertas raíz aportadas por el propietario (#21, #22, #12, #23/#17/#16/#11, #20, #24 y #13) corresponden al lockfile retirado. No se afirma que estén cerradas: GitHub debe reanalizar tras una eventual integración autorizada. No se descartan manualmente alertas; dependencias pendientes de backend/frontend, incluido minimatch/Vite, quedan fuera de este encargo.

SQL 001–011 y manifiesto/hashes, código de producción, autenticación, permisos y dependencias backend/frontend permanecen intactos. Se conservan AB-23, prepared, allowed:false, audienceVerified:false y originales privados. Work debe auditar independientemente los consumidores y el propietario decide el merge.
