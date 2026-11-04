# Elegibilidad interna de lectura privada de notas individuales

Antecedente #49, verificado el 3 de noviembre de 2026: `origin/main` `3206b38a5d013d6682f9f4ee27c6d83cd67d8e3a`, merge [#48](https://github.com/japh113/plataformaPsicologia/pull/48). Los Issues [#30](https://github.com/japh113/plataformaPsicologia/issues/30), [#35](https://github.com/japh113/plataformaPsicologia/issues/35), [#36](https://github.com/japh113/plataformaPsicologia/issues/36) y [#39](https://github.com/japh113/plataformaPsicologia/issues/39) siguen abiertos. Este incremento no los resuelve. El contrato sucesor [2A-SEC/009](#2a-sec--revocaciones-con-privilegios-mínimos) elimina el UPDATE directo del lector; las cifras de #49 al final conservan su alcance histórico.

Contrato aplicable: [ADR-030/031 y D10/D10.1/D12/D14/D16](product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades), [RN-27/28](product/business-rules.md), [inventario de privacidad](patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo), [resolución de recursos](episode-resource-resolution.md) y [frontera denegadora y transición completa legacy](episode-authorization-foundation.md#matriz-técnica-de-transición). No se modifican decisiones clínicas, AB-37 ni contratos de archivo.

## Capacidad implementada y salida privada

[evaluatePrivateNoteRead](../backend/src/modules/episodes/episode.note-read.js) recibe un proveedor de conexiones seleccionado por el servidor, un token ordinario y exclusivamente episodio, ID de nota y operación `read`. Adquiere una conexión propia y gestiona BEGIN/COMMIT/ROLLBACK/release. No acepta actor, snapshot, versión de sesión, audiencia o concesiones aportadas por el llamador; no devuelve contexto ni identificadores. Se reutiliza el verificador JWT real de autenticación y sus restricciones HS256/contexto ordinario; el rol firmado no decide el rol efectivo.

[assessPrivateNoteRead](../backend/src/modules/episodes/episode.note-read-policy.js) separa cuatro campos congelados:

| Campo | Significado y límite |
| --- | --- |
| structurallyEligible | Sesión vigente, profesional activo/aprobado, read, episodio individual exacto prepared/active, único sujeto CEP, responsable y autor iguales al actor, nota real atribuida y cita identificada. No es permiso clínico. |
| audience | Vocabulario interno: professional_private, patient_document, shared_document o unverified. No constituye enum SQL ni clasificación automática de documentos generales. |
| eligible | Condiciones necesarias anteriores, estado active y audiencia profesional privada acreditada. Solo puede ser true en las pruebas sintéticas de este incremento. |
| allowed | Siempre false, incluso si la política sintética satisface todas las condiciones necesarias. |

No se toma un atajo desde responsable/autor/CEP: se exige simultáneamente pertenencia de nota y sujeto al episodio solicitado. Abrir otro episodio con el mismo paciente, aun repitiendo profesional, no permite reutilizar su nota. La atribución legacy NULL permanece desconocida. paused/finalized se mantienen fuera de esta evaluación: el archivo histórico propio y las reglas completas de notas requieren sus entregas correspondientes.

La evaluación pura usa hechos internos y sirve para pruebas sintéticas; no autentica y nunca debe exponerse como decisión de acceso. [authorizeEpisodeOperation](../backend/src/modules/episodes/episode.policy.js) y [projectEpisodeResource](../backend/src/modules/episodes/episode.projections.js) conservan denegación total. No hay endpoint, DTO, callback de lectura, handle de transacción ni consumidor nuevo en producción.

## Audiencia: subconjunto seguro entregado

El inventario identifica `content,clinicalObservations,clinicalNoteObjective,nextSteps` como texto profesional y el contrato legacy oculta las notas al paciente. Eso justifica conservar su confidencialidad; **no acredita por fila una audiencia verificada**. SQL 001–008 no guarda clasificación de documento, destinatarios, publicación ni versión autorizada. La atribución CEP y el nombre de una tabla tampoco prueban ausencia de una autorización de divulgación.

Por tanto, se conserva la resolución de #48: `audience:null,audienceVerified:false`, normalizada a `unverified` en el resultado. Se rechaza audiencia desconocida, dirigida al paciente o compartida. Ni el token ni argumentos adicionales pueden cambiarla. No se consulta ni se presume una concesión externa; esta evaluación tampoco es una vía de transferencia o publicación.

**Decisión necesaria para ampliar este subconjunto:** aprobar una clasificación verificable por registro/documento, su procedencia, custodia, inmutabilidad/versionado y coordinación con futuras publicaciones/revocaciones; o aprobar explícitamente un contrato de tipo exclusivamente privado que haga imposible mezclar categorías. No se introduce persistencia de audiencias, tabla genérica de concesiones ni valor privado supuesto. 009 incorpora exclusivamente el mecanismo de bloqueo y sus privilegios. La lectura operativa sigue bloqueada también por prepared y por la frontera pública.

El [diseño documental posterior a #50](patient-response-privacy.md#propuesta-2a--contrato-de-audiencia-verificable) compara clasificación persistida, privacidad por tipo y modelo híbrido. Recomienda para aprobación original privado con evidencia de procedencia y materiales destinados separados; concreta versiones, destinatarios, publicación/revocación y guardas futuras. Es propuesta pendiente, sin evidencia nueva persistida: este evaluador conserva audienceVerified:false, allowed:false, prepared y privilegios actuales. Consulta/proyección futuras deben permanecer en una única transacción protegida, sin reutilizar este diagnóstico tras COMMIT.

## Revalidación y concurrencia

READ COMMITTED se elige expresamente: BEGIN por sí solo **no** aporta una instantánea estable. La garantía procede del lock de cuenta y de las invariantes 001/003/008, no de reutilizar un contexto anterior.

1. Verificar firma, contexto ordinario y sv del token antes de adquirir conexión. IDs inválidos, operaciones distintas de read y tokens inválidos no consultan DB.
2. BEGIN ISOLATION LEVEL READ COMMITTED; invocar public.lock_account_session($1::text) de 009 para obtener exclusivamente ID, rol, actividad y session_version con **FOR SHARE**, en esa misma conexión/transacción. KEY SHARE no basta: permitiría una actualización no clave de session_version.
3. Leer user_id/approval_status de psychologist_profiles mediante SELECT ordinario, sin lock de fila; comprobar aprobación active, cuenta y versión contra el token mediante los contratos existentes. Sin aprobación o sesión vigente no se resuelve clínica.
4. Resolver de nuevo cabecera, CEP y nota con las consultas explícitas existentes, sin texto, observaciones, objetivos, historia, agregados ni vínculos globales.
5. Revalidar firma/caducidad del token tras las esperas y consultas; evaluar solo los hechos recién leídos. COMMIT y devolver exclusivamente diagnóstico denegador; los errores SQL/ACL/locks provocan rollback, liberación y propagación sin fallback.

El orden no adquiere locks de perfil después del de users. Los servicios administrativos actuales bloquean users antes de modificar perfiles; además, un UPDATE/DELETE SQL directo puede bloquear primero el perfil y ejecutar después el trigger 002 que incrementa users.session_version. Bloquear ese perfil desde el evaluador invertiría el orden y podría causar deadlock.

En cambio, todo abandono de active, eliminación del perfil activo o cambio de su user_id incrementa la versión del usuario original en el trigger 002; 007 complementa otras transiciones. El FOR SHARE de users entra en conflicto con ese UPDATE, incluso cuando no se cambian claves. Una revocación no puede **confirmarse** mientras el evaluador retiene ese lock. El lector del perfil usa MVCC y no espera su lock: si el escritor está pendiente en el trigger, observa el active confirmado anterior y termina antes de que la revocación pueda confirmar. Si el escritor ganó primero, la lectura bloqueante de users espera y, bajo READ COMMITTED, devuelve la versión vigente tras COMMIT; se rechaza la sesión antigua. Un perfil ausente/no activo siempre deniega. Una rehabilitación no revive tokens previos.

| Hecho/operación concurrente | Protección efectiva en este incremento |
| --- | --- |
| Cambio de contraseña, inactividad, incremento explícito de sv, cambios de cuenta | FOR SHARE de users contra UPDATE/DELETE; se compara versión persistida. |
| Suspensión/rechazo, cambio de propietario o eliminación de perfil activo | Trigger 002 actualiza el mismo users; SELECT de perfil sin lock evita inversión. 007 conserva revocación al rehabilitar. |
| Modalidad, estado prepared, responsable, composición y CEP | Inmutabilidad 008; no se fabrican estados activos ni transiciones. La FK compuesta mantiene rol profesional. |
| Episodio, sujeto y autor de nota ya atribuida | Inmutabilidad 008 y FK a CEP; no existe reasignación/transferencia inferida. |
| Relación nota/cita/episodio/paciente | FK compuestas 003, asociación fija y cita completada/no futura de 001. |
| Edición concurrente de texto profesional | No se lee texto ni versión; solo atribución inmutable. Este contrato no permite proyectar contenido ni afirmar una versión estable. |
| Audiencia/publicación/consentimiento | Sin evidencia persistida, resultado unverified y denegación. Su futura mutación requiere contrato propio. |

PostgreSQL exige SELECT de las columnas leídas y UPDATE en alguna columna para FOR SHARE. #49 concedía UPDATE(session_version) a un lector efímero; esa dependencia queda sustituida por 009: solo el propietario NOLOGIN posee ese UPDATE y el lector invoca la función fija con EXECUTE. El evaluador no ejecuta UPDATE, reparaciones ni DDL. No se alteran privilegios del entorno habitual.

**Frontera temporal:** el diagnóstico devuelto después de COMMIT no sigue siendo evidencia vigente ni puede almacenarse como grant. No hay ventana de lectura clínica porque el incremento no consulta contenido y todas las proyecciones siguen denegadas. Antes de habilitar una lectura futura se deberá implementar autorización, consulta de la versión autorizada y proyección dentro de la misma transacción protegida, reteniendo los locks hasta terminar; además, coordinar todos los escritores nuevos de ciclo de vida, audiencia y revocación. No basta añadir una rama allowed:true ni consultar texto después de esta función. Las garantías futuras no se presentan como implementadas.

## Pruebas y demo ficticia

[Política unitaria](../backend/test/episode-note-policy.test.js): cinco casos sintéticos, incluidos active/audiencia privada hipotéticos, cuatro audiencias, episodios paralelos y ajenos, sujeto/autor distintos, legacy, estado profesional/cuenta/sesión y backoffice. La combinación positiva mantiene allowed:false y proyección 403 con proxy centinela sin acceso a contenido, observaciones, objetivos, IDs, historia o derivados.

[Transacción unitaria](../backend/test/episode-note-read.test.js): cinco casos con verificador JWT real y DB simulada; rol persistido frente al firmado, assertions del llamador con getters, tokens inválidos/restringidos, expiración durante SQL, sesión revocada, orden de consultas, rollback/release y fallos ACL. Se distinguen de PostgreSQL real.

[Arnés PostgreSQL existente](../backend/test/episode-participants.cases.js): seis casos notes adicionales, cada uno con base nueva en el clúster UUID aislado. Cubren atribución real prepared, paralelos del mismo paciente con A/A/B, legacy sin reparación, estados/cuenta/sesión actuales, roles administrativos, ACL por columna sin SELECT de texto/historia, snapshots completos sin escrituras y conexiones independientes. Las FK de referencias cruzadas y autoría conservan también sus casos reales existentes. Las carreras comprueban espera efectiva mediante pg_stat_activity: revocación de usuario primero, suspensión/eliminación de perfil primero y evaluador primero con el trigger de suspensión bloqueado en users. No se deshabilitan triggers ni se simulan estados clínicos imposibles en 008.

Estas notas/citas sintéticas y la evaluación sin contenido constituyen la demo SQL automatizada ADR-019 del alcance; no inicia una API sobre episodios atribuidos. El [catálogo obligatorio CI](../scripts/ci/episode-cases.json) conserva las 24 etiquetas anteriores y agrega seis (30 importadas, 47 tests de episodios contando la suite). Se conservan matriz, siete checks y artifacts de 14 días.

Reproducción solo en recursos nuevos autorizados:

```bash
python3 -B -m unittest discover -s scripts/ci -p 'test_*.py'
bash scripts/clinical-episodes.sh test
```

## Evidencia histórica de #49 y dependencias de habilitación

Ejecución local nueva del 3 de noviembre de 2026: 11/11 contratos offline CI; arnés completo con 47/47 tests de episodios, 136/136 unitarias backend, 133/133 de integración y 64/64 frontend; lint/build aprobados. Cero fallos, cancelaciones u omisiones. El build conserva el aviso existente de bundle mayor de 500 kB. También pasaron 25/25 unitarias privadas sin dependencias con Node Windows v25.9.0.

Destino propio: proyecto Docker `psicopanel-episodes-4e87a099-f531-4041-87ab-ab32c7284710`, PostgreSQL 17 nuevo con tmpfs, red privada y sin puertos DB; bases UUID nuevas por caso. El wrapper verificó imágenes preexistentes intactas y eliminó únicamente contenedores, redes e imágenes propios. Después se verificaron cero contenedores/redes/volúmenes con la etiqueta del proyecto y el inventario de contenedores preexistentes idéntico al inicial. No se usaron bases, volúmenes ni servicios habituales.

La evidencia CI se registra en el Draft PR y en los resultados del HEAD exacto. Los informes #46–#48 conservan sus cortes históricos. No confundir pruebas sintéticas positivas, diagnóstico estructural real y acceso operativo inexistente.

Quedan pendientes audiencia verificable, autorización operativa y versión/proyección bajo transacción, estados y escritores clínicos compatibles, archivo propio, notas finales/adendas #35, admisión/entrevista validada backend/DB y retirada coordinada de **todos** los lectores/fallback legacy. No se reutiliza este evaluador desde pacientes, citas, tareas, espera o recordatorios. AB-23, privacidad #25, objetivos #26, seguimiento #27, backoffice y rutas HTTP actuales permanecen intactos. Se conservan SQL 001–008, manifiesto/hashes, frontend y lockfiles. Sin migración habitual, merge, auto-merge o despliegue.

## 2A-SEC — Revocaciones con privilegios mínimos

Base de este incremento: main `50969e5957c4165bfd18a02b68805d9252a0abfa`, merge [#49](https://github.com/japh113/plataformaPsicologia/pull/49), comprobado el 3 de noviembre de 2026. Se revisaron #46–#49, backlog #28–#41 y #36. Las cifras anteriores son evidencia histórica de #49.

### Opciones consideradas antes de codificar

- SECURITY DEFINER con consulta fija FOR SHARE, propietario NOLOGIN dedicado y lector LOGIN explícito sin membresías: opción seleccionada, inicialmente sujeta a pruebas reales. Conserva los revocadores 002/007 y la transacción del llamador; encapsula el UPDATE exigido por PostgreSQL.
- UPDATE directo del lector: descartado porque permite alterar arbitrariamente session_version y agotar el entero, afectando revocaciones posteriores.
- FOR KEY SHARE: no bloquea las actualizaciones no clave de la versión.
- Advisory locks: exigirían adaptar todos los escritores, incluidos triggers y SQL directo; por sí solos no conservan la barrera existente.
- Conexión separada o snapshot sin lock: no conserva la protección hasta el fin de la evaluación.

La semántica corresponde a la documentación primaria de PostgreSQL 17: [privilegios SELECT](https://www.postgresql.org/docs/17/sql-select.html), [SECURITY DEFINER y search_path](https://www.postgresql.org/docs/17/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY) y [locks de filas hasta fin de transacción](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS). Las comprobaciones de abajo prueban esas propiedades con conexiones independientes; no se deducen solo del SQL.

### Contrato SQL y roles

[009](../backend/sql/migrations/009_minimal_account_lock.sql) crea public.lock_account_session(text). Es SQL VOLATILE, STRICT, PARALLEL UNSAFE, SECURITY DEFINER con search_path=pg_catalog,pg_temp. Su cuerpo fijo selecciona exclusivamente id/role/is_active/session_version de public.users WHERE id=$1 FOR SHARE OF u. No contiene UPDATE, SQL dinámico, callbacks, nombres o columnas elegidos por el llamador, ni lectura de credenciales/contactos/contenido. ID ausente, NULL o cadena de inyección no selecciona cuentas adicionales.

| Papel | Contrato y privilegios |
| --- | --- |
| Aprovisionador | Administrador superusuario explícito, solo para instalar en un destino nuevo aislado vacío. No es el lector ni una garantía sobre la cuenta del backend habitual. |
| Propietario de función | Nuevo psicopanel_account_lock_owner_<OID de base>, NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS; sin membresías entrantes/salientes. USAGE public, SELECT de las cuatro columnas y UPDATE(session_version) de users. No posee users ni tablas clínicas. Nombre preexistente hace fallar la instalación, sin adopción. |
| Rol autorizado de ejecución | LOGIN NOINHERIT explícito, preaprovisionado sin objetos, ACL explícitas ni membresías; sin atributos administrativos/configuración de rol. Recibe USAGE public y EXECUTE de esta firma, sin grant option ni EXECUTE público. Recibe solo SELECT por columna de las cuatro tablas estructurales requeridas por el evaluador, enumeradas en 009. No SELECT directo de users, DML, textos, historia, secuencias, propiedad ni capacidad de asumir al propietario. |
| Rol de conexión | Es el LOGIN autenticado por PostgreSQL que entrega el proveedor de conexiones del servidor. En los ensayos coincide con el rol autorizado de ejecución; no usa un LOGIN administrador seguido de SET ROLE para acreditar privilegios mínimos. El helper cambia temporalmente de identidad efectiva, no de conexión ni transacción. |

El SELECT estructural concedido al lector abarca únicamente user_id/approval_status del perfil, los siete campos de cabecera utilizados por el contexto, los cuatro de CEP y los cinco de atribución de nota/cita. Son hechos privados internos, no permiso clínico ni DTO publicable. La capacidad no se entrega a usuarios HTTP, pacientes, parejas o backoffice. Los superusuarios PostgreSQL conservan sus facultades intrínsecas; el rol administrativo ajeno de la prueba es un LOGIN sin privilegios de superusuario.

La función conserva el lock en la transacción del llamador tras devolver sus filas. evaluatePrivateNoteRead la invoca después de BEGIN READ COMMITTED y antes del SELECT MVCC del perfil, en el mismo client. Mantiene validaciones JWT inicial/final, rol/actividad/aprobación/sv persistidos, resolución estructural, COMMIT/ROLLBACK/release y allowed:false. No existe una conexión auxiliar ni un UPDATE para bloquear; el diagnóstico después de COMMIT sigue sin autorizar lecturas futuras.

### Instalación explícita e integridad

[Runner/CLI](../backend/scripts/migrate.js): target 009 exige al instalar --account-reader=ROLE, además de URL y nombre de base explícitos. No crea contraseñas ni toma un rol implícito de env. Ejemplo de forma del comando, únicamente dentro del destino aislado autorizado y con MIGRATION_DATABASE_URL ya preparado sin imprimirlo:

```bash
npm run db:migrate -- --target=009 --database=BASE_AISLADA_NUEVA --account-reader=LOGIN_RESTRINGIDO_NUEVO
```

001–008 y sus entradas/hashes permanecen intactos; el manifiesto añade 009. 009 permite cadena completa desde el baseline 001/002 o upgrade desde 008 compatible, **solo vacío y aislado**: bloquea las tablas públicas y rechaza filas salvo ledger. No instala sobre bases habituales, adopta roles/esquemas, rescata demos ni concilia autorías. Replay de 009 con fixtures verifica sin repetir DDL, cambiar grants o exigir vaciar tablas. Puede omitir el argumento de lector en replay, pero si se aporta debe coincidir exactamente. Downgrade a 008 se rechaza antes de validar como histórico.

El algoritmo de catalogChecksum para instalaciones 003–008 sigue igual, corroborado contra una [copia congelada de main #49](../backend/test/fixtures/catalog-checksum-003-008.js) en PostgreSQL real para cada versión. Solo si existe el objeto 009 se añade su [catálogo de seguridad](../backend/scripts/account-lock-contract.js): definición/firma/atributos/search_path, propietario, ACL sin PUBLIC y sin grant option, atributos de propietario/lector, grafo de membresías y derechos efectivos por columna, esquema, base, funciones y secuencias. La huella 008 anterior no se recalcula ni sustituye durante el upgrade. Un 009 no satisface una validación 008.

Antes de registrar 009 se verifica también el contrato contra su SQL checksum-verificado, el nombre esperado del propietario y la matriz exacta de privilegios efectivos. Esto impide registrar como correcto un grant peligroso heredado de defaults del aprovisionador. Replay rechaza cuerpo/owner/ACL/roles/membresías/columna alterados o ledger incompatible, sin reparación ni adopción. La transacción/advisory lock del runner conserva rollback de objetos, grants, rol nuevo y ledger y serializa dos instalaciones concurrentes.

**Dependencia operativa pendiente:** el pool actual usa DATABASE_URL o PGUSER, y Compose configura el mismo nombre para backend e inicialización POSTGRES_USER. No se ha inspeccionado ni modificado la DB habitual ni se acredita un rol mínimo allí. El uso operativo requerirá aprovisionar la conexión restringida, destino compatible y contrato de todos los escritores según [#36](https://github.com/japh113/plataformaPsicologia/issues/36), con autorización separada. Este PR no cambia el pool global ni convierte el backend legacy en lector mínimo.

### Pruebas exigibles y evidencia de este incremento

El [catálogo PostgreSQL](../scripts/ci/episode-cases.json) conserva las 30 etiquetas previas y añade 13: 43 casos importados obligatorios y 60 tests de episodios contando la suite y los casos 003 existentes. Los seis notes previos ejecutan realmente 009; las carreras usan LOGIN restringido. Los casos unitarios simulados siguen identificados aparte.

- Instalación nueva, upgrade vacío 008→009 con ledger anterior idéntico, replay tras fixtures, downgrade denegado; compatibilidad real de huellas 003–008; rechazo de archivo/ledger incompatible sin adopción, roles inseguros/destino poblado, 20 variantes de deriva y dos migraciones concurrentes en destino nuevo. Fallo DDL tardío revierte grants, propietario, objetos y ledger; reintento instala.
- LOGIN autorizado devuelve exactamente las cuatro columnas; UPDATE al máximo entero, incrementos repetidos, valor anterior/negativo, contraseña, actividad y rol fallan con 42501, conservando snapshot de tablas. Derechos efectivos y membresías corroboran ausencia de UPDATE y de acceso al propietario. Roles ajenos no tienen EXECUTE, PUBLIC no tiene ACL y el propietario no puede iniciar sesión.
- Reemplazo/propiedad/SET ROLE/GRANT del propietario y funciones internas ajenas denegados. Argumentos/columnas extra, ID inexistente, NULL e inyección no amplían datos. Tabla temporal users y search_path hostil no cambian la cuenta seleccionada.
- Función retornada, llamador todavía abierto: actualización independiente espera hasta COMMIT o ROLLBACK. Revocador primero observa espera y sesión revocada; evaluador primero bloquea contraseña/inactividad/sv y suspensión/DELETE de perfil. SELECT MVCC del perfil no invierte locks; evaluación posterior deniega. ROLLBACK del revocador conserva sesión anterior.
- Esperas corroboradas mediante pg_stat_activity y pg_blocking_pids, con barreras de promesas después del retorno real de función; no se acredita concurrencia solo con sleeps. Timeout 55P03, cancelación real pg_cancel_backend 57014 y error tras retorno fuerzan rollback/release y dejan conexión reutilizable y sin lock retenido.

La demo ADR-019 es el grafo SQL ficticio prepared y su evaluación automatizada con lector real; no inicia API/frontend sobre episodios atribuidos. El resultado siempre deniega y la audiencia permanece sin verificar. Resolver 2A-SEC no resuelve autorización clínica integral: siguen pendientes audiencia/versiones/publicación, permisos y proyección de contenido protegidos, activación/admisión y entrevista validada, notas/adendas y transición completa de lectores/escritores legacy.

Ejecución local nueva del 3 de noviembre de 2026: 60/60 episodios, 136/136 unitarias backend, 133/133 integración HTTP legacy, 64/64 frontend; lint/build aprobados, cero fallos/cancelaciones/omisiones. Los 11 contratos offline de CI también aprobaron. Se conserva el aviso previo de bundle >500 kB. La matriz de navegador B/C/D2 y los siete checks/artifacts de 14 días se comprueban en el Draft del HEAD definitivo, sin reutilizar evidencia histórica.

Proyecto aprobado local: psicopanel-episodes-e97a9ff2-c9bb-44b7-8fc4-dab453d8e5e9, PostgreSQL 17 nuevo, tmpfs, red privada y cero puertos DB; bases nuevas por caso. El wrapper terminó con exit 0, verificó imágenes preexistentes y eliminó contenedores/redes/imágenes propios. Inventarios de contenedores y volúmenes preexistentes antes/después idénticos; sin recursos propios persistentes. Dos ensayos iniciales se limpiaron también: 0e59f095-878e-4fd2-8995-78887a8eb8b2 agotó conexiones del arnés conservadas hasta fin de suite; 8eba328a-b5a0-4b0d-be77-930ceaaae365 detectó un inyector de fallo tardío que no disparaba. Se corrigió cierre por caso y selección verificable del evento de prueba, sin relajar ACL, preflight ni catálogo.

Este resultado resuelve la dependencia técnica 2A-SEC dentro del alcance aislado probado. No acredita instalación, aprovisionamiento mínimo ni despliegue habituales, y no concede ninguna operación clínica. PR Draft para auditoría independiente, sin merge ni auto-merge.

### Corrección P2-01 — Privilegios administrativos de rutinas

La auditoría independiente sobre HEAD `33d8bfff531c8b6f4add0a623e7361e274edfbd2` solicitó cambios: la consulta de funciones de la huella 009 excluía pg_catalog y el verificador no rechazaba capacidades administrativas de otras rutinas. Un GRANT de pg_read_file(text) al lector o a PUBLIC podía ampliar privilegios sin alterar esa huella. Los resultados anteriores corresponden a aquel HEAD; no acreditan esta corrección.

Investigación previa en PostgreSQL 17.11 mediante un proyecto nuevo del arnés: pg_init_privs registró 62 rutinas con ejecución inicialmente restringida, incluidas todas las sobrecargas de acceso a archivos inspeccionadas. Las funciones ordinarias como length(text), set_config(text,text,boolean), pg_cancel_backend(integer) y pg_terminate_backend(integer,bigint) tienen EXECUTE público legítimo; las dos últimas conservan sus comprobaciones internas de rol. No se prohíbe en bloque pg_catalog.

Fuentes primarias: [funciones administrativas y sobrecargas](https://www.postgresql.org/docs/17/functions-admin.html), [roles predefinidos](https://www.postgresql.org/docs/17/predefined-roles.html), [catálogo de privilegios iniciales](https://www.postgresql.org/docs/17/catalog-pg-init-privs.html), [revocaciones iniciales de PostgreSQL 17](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/catalog/system_functions.sql) y [FirstNormalObjectId](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/include/access/transam.h). COPY PROGRAM y accesos generales del servidor dependen también de atributos/roles; conceder pg_execute_server_program, pg_read_server_files o pg_write_server_files es incompatible con la ausencia de membresías exigida aquí.

**Superficie comprobada del contrato 009 corregido:**

- Registrar por firma todas las rutinas de pg_proc, sin excluir esquemas por nombre: ACL actual e inicial/procedencia, identidad/propietario, clase, lenguaje/confianza, SECURITY DEFINER/configuración y cuerpo/binario/árbol SQL. Calcular has_function_privilege para propietario y lector; incluye PUBLIC, propiedad y permisos heredados. Cambios de ACL, definición, propietario o superficie quedan en la huella.
- Rechazar EXECUTE efectivo sobre cualquier rutina que pg_init_privs identifique como inicialmente restringida. Un GRANT a PUBLIC no redefine la referencia inicial. Se comprueba además la presencia de la referencia initdb de las familias de archivos/large objects requeridas; no hay fallback silencioso a la ACL actual.
- Rechazar cualquier otro SECURITY DEFINER accesible, incluidos wrappers y funciones trigger en otros esquemas, y código añadido de lenguaje no confiable/C/internal. La separación entre rutinas nativas de initdb y código añadido usa el límite FirstNormalObjectId=16384 de PostgreSQL 17. Solo lock_account_session conserva su excepción, con la firma, propietario y cuerpo exactos ya verificados.
- Mantener la matriz de columnas, ACL exclusiva del helper, rol NOLOGIN/lector LOGIN y ausencia de membresías entrantes/salientes. La comprobación de CREATE/propiedad de esquemas abarca también pg_catalog e information_schema; solo excluye namespaces temporales. SET ROLE sin herencia también se rechaza, aunque has_function_privilege todavía sea false.
- Aplicar el rechazo antes de registrar una instalación, además de fingerprint y verificación del replay. La huella 009 anterior a P2-01 es incompatible incluso en un destino limpio: se rechaza sin adopción ni actualización del ledger. SQL/manifiesto/hashes 001–009 y los algoritmos históricos 003–008 permanecen iguales. Los ensayos se regeneran en destinos nuevos; no se propone reparar o reinstalar bases existentes.

**Límites:** se presupone un catálogo initdb sano y administración confiable; no es una barrera frente a un superusuario que reescriba catálogos iniciales, binarios, el runner o el ledger. No es una auditoría semántica de extensiones ni de todas las capacidades del servidor. Las rutinas invocadoras en lenguajes confiables conservan las comprobaciones de privilegios del llamador; la huella registra sus cambios, sin atribuirles automáticamente la identidad del propietario. Extensiones/definers/código nativo añadidos accesibles requieren revisión y contrato propios; no se admiten como excepciones implícitas. Las funciones peligrosas de los fixtures se inspeccionan mediante permisos, nunca leyendo archivos ni ejecutando programas.

Nueve casos PostgreSQL adicionales conservan las 43 etiquetas importadas anteriores: A/B reproducen el hueco contra el catálogo congelado del HEAD auditado; A–C prueban cambios de permisos efectivos, nueva huella, rechazo directo del verificador/replay y conservación de grants/ledger sin reparar; D cubre 24 firmas adicionales de archivos, large objects, backup/WAL, configuración, replicación y estadísticas; E wrappers SQL/PROGRAM, alias native y trigger definer en otro esquema; F estado limpio y funciones normales; G roles administrativos, herencia transitiva, SET-only, propiedad de rutina y CREATE pg_catalog. También se rechaza instalación sobre privilegios PUBLIC inseguros y un ledger con el algoritmo anterior. Total esperado: 52 casos importados obligatorios y 69 tests de episodios, sin ejecutar cuerpos sensibles.

Evidencia local nueva de P2-01, 3 de noviembre de 2026: arnés completo aprobado con **69/69 episodios, 136/136 unitarias backend, 133/133 integración HTTP legacy y 64/64 frontend**, lint/build y 11/11 contratos offline de CI. Cero fallos/cancelaciones/omisiones; se conserva el aviso previo de bundle >500 kB. La demo SQL ficticia y las carreras de revocación continúan denegando clínica. Esta evidencia corresponde a la corrección; la CI/navegador del HEAD nuevo se consulta separadamente en el [PR #50](https://github.com/japh113/plataformaPsicologia/pull/50/checks).

Investigación propia e9892d50-572c-402f-86ae-cc7a7ebd77cc y ensayo completo a68249b5-dfa5-4b0c-8b1f-14bb0c9d8cd9: PostgreSQL nuevo con tmpfs/red privada/cero puertos DB, limpieza UUID propia verificada; sin servicios habituales intervenidos ni herramientas instaladas en host. El wrapper terminó con exit 0 y conservó imágenes preexistentes; los inventarios de contenedores y volúmenes del ensayo antes/después coinciden. Sin SQL/manifiesto, rutas, frontend, pool, políticas clínicas, allowed:false o fallback modificados. El Draft permanece pendiente de nueva auditoría independiente.
