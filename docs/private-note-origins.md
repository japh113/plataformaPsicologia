# Procedencia privada de notas originales — contrato técnico v1

Base verificada local/remota: `main` `9c31900dd1fed3b7c277eff00b781ef1a7415db6`, merge de [#51](https://github.com/japh113/plataformaPsicologia/pull/51). El encargo posterior autoriza esta primera implementación interna y un único PR Draft. [ADR-032](product/decisions.md#adr-032--original-profesional-privado-y-procedencia-técnica-v1) registra las tres decisiones expresas del propietario. No se cierran #30/#35/#36/#39.

## Alcance implementado

[010](../backend/sql/migrations/010_private_note_origins.sql) añade `clinical_note_private_origins`, una constancia de nacimiento bajo contrato privado, y la función interna `public.create_private_clinical_note_v1(bigint,text,text,bigint,text)`. Recibe episodio, paciente, autor profesional, cita y contenido ficticio; devuelve únicamente el ID creado. No acepta ID de nota existente, registrador, clasificación, versión ni instante elegibles por el cliente.

Solo se ensaya en bases nuevas UUID del clúster PostgreSQL 17 efímero del arnés existente. Prepared continúa siendo el único estado permitido por 008. La capacidad acredita correspondencia técnica; el LOGIN PostgreSQL autorizado no autentica al psicólogo humano, ni acredita consentimiento, entrevista validada, activación o permiso clínico. El autor es una aserción estructural del fixture, validada contra CEP/responsable/cita. La autenticación real y la derivación del autor desde sesión deben entregarse antes de conectar una futura vía operativa.

No se modifica `createPatientClinicalNote`, ningún servicio HTTP, tareas/objetivos, seguimiento, autenticación, backoffice o frontend. El evaluador y el resolver siguen sin consultar la constancia: `audience:null,audienceVerified:false`, `allowed:false`, sin lectura/proyección de contenido. No conectar el pool habitual al LOGIN creador ni servir los fixtures atribuidos desde lectores legacy.

## Tabla, claves y desconocidos

| Campo | Restricción y significado |
| --- | --- |
| note_id | BIGINT PK; exactamente una constancia por nota. |
| episode_id, subject_patient_id, author_user_id | NOT NULL; FK compuesta a la nueva UNIQUE de `patient_clinical_notes(id,episode_id,patient_id,created_by_user_id)` y FK compuesta a CEP `(episode_id,patient_id,psychologist_user_id)`. |
| contract_version | INTEGER NOT NULL, CHECK = 1, sin DEFAULT. |
| registration_kind | TEXT NOT NULL, CHECK = professional_original, sin DEFAULT; no existe transición a compartido. |
| registered_by_user_id | NOT NULL, FK RESTRICT a users y CHECK igual a author_user_id. No prueba identidad humana. |
| registered_at | TIMESTAMPTZ NOT NULL, asignado con clock_timestamp() por el trigger; sin DEFAULT. |

Todas las FK son ON UPDATE/DELETE RESTRICT. Se conserva UNIQUE `(note_id,episode_id)` y un índice por episodio/sujeto. La tabla guarda hechos técnicos confidenciales, sin texto clínico ni consentimiento. El ledger de migraciones conserva únicamente versión/archivo/checksums/versión PostgreSQL/instante técnico; no recibe estos IDs ni actos clínicos.

010 no inscribe filas existentes, aunque tengan episodio y autor completos. Notas legacy NULL y notas anteriores atribuidas siguen desconocidas. Las nuevas inserciones con episodio no NULL requieren la función restringida. Se rechaza atribuir retrospectivamente una nota legacy mediante UPDATE. La tabla no clasifica por nombre, fecha, cita, vínculo ni DEFAULT. El paciente singular de una nota dentro de pareja sigue siendo A o B, nunca ambos; originales conjuntos siguen pendientes.

## Funciones, triggers e identidades efectivas

| Pieza | Seguridad, identidad y responsabilidad |
| --- | --- |
| create_private_clinical_note_v1 | SECURITY DEFINER, propietario NOLOGIN creador dedicado. Valida prepared/CEP/responsable/cita completada del mismo paciente/episodio/autor y no futura. Bloquea la cita FOR UPDATE, deriva fecha e inserta solo una nota nueva. |
| a_private_note_insert / guard_private_note_insert | BEFORE INSERT SECURITY INVOKER. Si hay episodio, exige current_user igual al propietario real de la función creadora, consultado por OID en catálogo. Sin GUC, parámetro trusted ni rol asumible. |
| materialize_private_note_origin | AFTER INSERT SECURITY INVOKER; durante la función creadora current_user aún es el propietario creador. Inserta la constancia exacta con literales v1 y datos NEW. Para legacy NULL no hace nada. |
| guard_private_note_origin | BEFORE INSERT/UPDATE/DELETE y BEFORE TRUNCATE SECURITY INVOKER. Insertar exige propietario creador y anidamiento de trigger exactamente 2; cualquier modificación/eliminación/truncado se rechaza. No existe una función de inscripción tardía. |
| private_note_origin_required / verify_private_note_origin | AFTER INSERT constraint trigger DEFERRABLE INITIALLY DEFERRED, WHEN NEW.episode_id IS NOT NULL; verificador SECURITY DEFINER con propietario NOLOGIN distinto y solo lectura. Exige nota y constancia con la tupla completa y v1/registrador correctos. |
| a_private_note_mutation / guard_private_note_mutation | BEFORE UPDATE/DELETE SECURITY DEFINER del verificador. Consulta únicamente la existencia de procedencia y bloquea toda edición actual de una nota acreditada, incluso no-op/updated_at. También rechaza atribución retrospectiva. Las notas no acreditadas conservan edición/historia anteriores y prohibición de borrado de 001. |

Todos los cuerpos son fijos, sin SQL dinámico ni callbacks. La función creadora fija `search_path=pg_catalog,public,pg_temp`: 001 requiere resolver su referencia histórica no cualificada a appointments y public es un esquema no escribible por estos roles. pg_temp explícitamente al final impide suplantar esa tabla mediante objetos temporales. Las otras funciones usan `pg_catalog,pg_temp` y referencias públicas cualificadas. Se prueba el intento de shadowing desde el LOGIN creador. Las funciones nuevas revocan EXECUTE de PUBLIC dentro de la misma transacción de instalación.

### P2 — Validador diferido independiente

El AFTER inmediato materializa; el constraint trigger comprueba obligatoriedad/correspondencia. Son responsabilidades distintas. WHEN se evalúa al insertar; para toda nota nueva atribuida queda pendiente una validación independiente, aunque el creador ya haya retornado.

Al COMMIT, el usuario efectivo externo vuelve al LOGIN llamador, que carece de SELECT sobre notas/constancias. PostgreSQL entra entonces en `verify_private_note_origin` como su propietario NOLOGIN verificador, con SELECT de las cuatro columnas de atribución de nota y de la constancia, sin contenido ni escritura. No se presupone que sobreviva la identidad del creador. La prueba positiva usa una conexión real sin esos SELECT; la inyección de fallo verifica expresamente current_user del verificador al COMMIT.

`SET CONSTRAINTS public.private_note_origin_required IMMEDIATE` después del retorno ejecuta esa misma comprobación y usa ese mismo propietario. Si se fija IMMEDIATE antes de crear, el AFTER de materialización precede al comprobador en la sentencia; ambos recorridos positivos y el fallo por constancia ausente están cubiertos. [CREATE TRIGGER](https://www.postgresql.org/docs/17/sql-createtrigger.html), [SECURITY DEFINER](https://www.postgresql.org/docs/17/sql-createfunction.html) y [SET CONSTRAINTS](https://www.postgresql.org/docs/17/sql-set-constraints.html) son las referencias PostgreSQL 17 de estas semánticas.

Un error de INSERT de nota, materialización, FK, comprobación inmediata o diferida cancela la operación; el llamador revierte la transacción. COMMIT fallido, rollback explícito y restricciones forzadas no dejan una nota o constancia parcial. El avance de una secuencia no es una fila clínica y no se revierte. Solo el aprovisionador de pruebas puede desactivar deliberadamente un trigger o inyectar un error para ensayar los fallos; los roles técnicos no pueden hacerlo.

## Privilegios efectivos y frontera de confianza

Se crean dos propietarios con sufijo OID de base, sin adoptar roles existentes: `psicopanel_note_creator_owner_*` y `psicopanel_note_verifier_owner_*`. Ambos son NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, sin configuración ni membresías en ninguna dirección. No poseen tablas, esquemas o bases ni pueden asumir otros roles. Las tablas y triggers conservan al aprovisionador como propietario. Este administrador del sandbox es la raíz confiable, fuera de las capacidades de aplicación ensayadas.

| Rol | Privilegios mínimos |
| --- | --- |
| LOGIN creador explícito y separado | USAGE public y EXECUTE únicamente de create_private_clinical_note_v1. Sin lectura directa, DML, secuencias, TRIGGER, CREATE, membresías ni SET ROLE al propietario. Se exige pristine antes de aprovisionarlo, también frente a dependencias de otros destinos del clúster. |
| NOLOGIN propietario creador | Columnas estructurales de episodio/CEP; INSERT de las seis columnas de nota, SELECT(id) para RETURNING y USAGE de su secuencia; INSERT de constancia. SELECT de appointments y UPDATE(id) exclusivamente para FOR UPDATE y el trigger invoker 001 que lee appointments%ROWTYPE. No se exporta ninguna sentencia UPDATE ni edición de cita. |
| NOLOGIN propietario verificador | SELECT(id,episode_id,patient_id,created_by_user_id) de notas y SELECT de constancias. Sin texto, historia, secuencias o escritura. |
| LOGIN lector 009 y su propietario | Contrato histórico estricto de 009 sin ampliación: el lector continúa sin escritura ni SELECT de constancias. |
| PUBLIC y otros LOGIN | Sin ejecución de funciones nuevas ni acceso directo a constancias. |

[private-note-contract.js](../backend/scripts/private-note-contract.js) valida cuerpos/firma/retorno/modo/path/propietarios, atributos y grafo de roles, ACL de funciones y tabla/columnas, privilegios efectivos incluso PUBLIC/heredados, rutinas peligrosas de cualquier esquema, tablas/secuencias/esquemas/base y configuración de triggers. Una concesión inesperada causa rechazo; no se registra como segura ni se repara automáticamente. Las comprobaciones y huella incluyen únicamente catálogo, nunca contraseñas o datos clínicos.

La constancia no finaliza el contenido. Este incremento no exporta un editor privado: bloquea los escritores actuales sobre notas acreditadas hasta un protocolo autorizado. #35 sigue debiendo implementar borradores/finalización/adendas y D10.1. No se congelan indiscriminadamente las notas antiguas ni se presenta la historia de 001 como finalización.

## Migración explícita y compatibilidad histórica

[Runner](../backend/scripts/episode-migration.js), [CLI](../backend/scripts/migrate.js) y [manifiesto](../backend/sql/migrations/manifest.json) agregan target 010. Los bytes y entradas/checksums de 001–009 se conservan. La huella 010 se agrega únicamente cuando existe la tabla nueva; el [algoritmo pre-010 congelado](../backend/test/fixtures/catalog-checksum-003-009.js) contrasta 009 antes del upgrade. El contrato de account-lock de 009 permanece intacto y se verifica también en 010; no se exige a una instalación 009 tener objetos futuros.

Instalación nueva hasta 010 exige los LOGIN explícitos `--account-reader=ROLE` y `--private-note-creator=ROLE`. En upgrade 009→010 el lector ya aprovisionado se verifica y se exige el creador nuevo. Las barreras vacías de 008/009 siguen vigentes para instalación nueva. El ensayo 009→010 no modifica filas anteriores ni concilia datos; no autoriza instalar sobre una base habitual. Replay verifica la huella de la última versión y los contratos, sin volver a aprovisionar; cambiar el nombre esperado de un rol se rechaza. Downgrade, deriva y ledger incompleto se rechazan sin reparación.

Todo DDL/GRANT/CREATE ROLE/ledger ocurre bajo la transacción y advisory lock existentes. El fallo tardío de instalación revierte tabla/FK/funciones/triggers/roles/concesiones y ledger, preservando 009. Las conexiones de migración concurrentes producen una instalación y un replay verificado.

## Matriz reproducible y evidencia

[Casos PostgreSQL](../backend/test/private-note-origins.cases.js) se invocan desde la suite aislada existente y se fijan en el [inventario CI](../scripts/ci/episode-cases.json); se conservan todas las etiquetas previas. Son además la demo ficticia SQL ADR-019 del incremento: identidades p/q, profesionales a/b, episodios prepared individuales paralelos y pareja, sin credenciales humanas ni API nueva.

La matriz cubre creación y correspondencia exacta; episodios/pacientes/autores/citas ajenos, pendientes/futuras; escritor directo/GUC/constancia tardía/legacy/duplicada; FK/PK/NOT NULL/CHECK; inmutabilidad de procedencia y rechazo de escritores legacy; fallos en cada fase, rollback explícito, COMMIT y los dos momentos de IMMEDIATE; identidad del verificador; LOGIN reales/propietarios/PUBLIC/SET ROLE/herencia/DDL; shadowing temporal; A/B de pareja y mismo/diferente profesional; resolver/evaluador/proyección todavía denegadores; instalación/upgrade/replay/downgrade/huellas históricas/deriva/ledger/fallo tardío/concurrencia.

Reproducción exclusivamente en proyecto nuevo autorizado:

```bash
python3 -B -m unittest discover -s scripts/ci -p 'test_*.py'
bash scripts/clinical-episodes.sh test
```

Se conservan los siete checks, los inventarios previos, las regresiones backend/HTTP/frontend/navegador y artifacts de 14 días. Resultados y artifacts deben consultarse para el HEAD definitivo del Draft, diferenciando SHA de rama y merge de prueba de GitHub. Tras iniciar Docker por indicación del propietario se ejecuta también la matriz local en proyectos UUID nuevos y efímeros, con tmpfs, red privada y cero puertos DB, sin iniciar ni alterar el entorno habitual. Sintaxis JS, contratos Python y validación documental locales se registran separadamente de PostgreSQL real local y CI; no se reutiliza evidencia histórica como nueva. La limpieza y preservación de recursos previos se verifican por el arnés de cada runner.

Pendientes: conectar el resolver de audiencia en otro PR; autorización/consulta/proyección transaccionales y corte completo del fallback #30/#39; editor privado/finalización/adendas #35; aprovisionamiento y operación persistente #36; materiales separados, revisión/autorizaciones/publicación/revocación y versiones históricas con decisiones propias. Admisión, entrevista validada backend/DB, activación y despliegue siguen deshabilitados y requieren sus entregas. D12–D16 no aprueban automáticamente esos mecanismos.
