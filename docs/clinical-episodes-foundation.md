# Fundamentos de episodios clínicos — migración 003

Alcance del PR posterior a #7: ADR-006/009, RN-02/03/12/15 y fundamentos de 2A. No cierra 2A ni activa autorización por episodios, adendas, identidad excepcional, derivaciones 2B o consentimientos 2C. No cambia endpoints ni pantallas.

## Modelo e integridad

- `patients.id` sigue siendo la identidad global. `clinical_episodes` es independiente de `care_relationships`; no contiene ID de cuenta del paciente. Recuperar o sustituir su cuenta no modifica el episodio.
- Estados técnicos: `active`, `paused`, `finalized`. Índice único parcial por paciente para los dos primeros. El índice de PostgreSQL también arbitra inserciones concurrentes. A→B→A requiere tres IDs.
- Paciente válido por FK; profesional válido por FK compuesta `(psychologist_user_id, psychologist_role)` hacia `users(id, role)`, con rol fijo `psychologist`. Impide cambiar su rol o borrar la cuenta referenciada; suspenderla sigue permitido, conservando episodios y revocación de 002.
- Identidad inmutable: ID, paciente, profesional, rol, inicio y creación. Finalización requiere fecha >= inicio, y es terminal, incluida su fecha. No se permite DELETE ni TRUNCATE; cambios de estado conservan la versión previa en el historial de 001.
- `episode_id` nullable en citas, notas, tareas/objetivos y espera, con FK compuesta de paciente/episodio. Una atribución no nula no puede quitarse ni reasignarse.
- Nota atribuida requiere autor no nulo e igual al profesional del episodio. Nota/cita y tarea vinculada/nota requieren idénticos paciente y episodio. Objetivos y tareas sin nota pueden tener episodio propio.
- Las columnas internas generadas `episode_scope_id = COALESCE(episode_id, 0)` permiten claves compuestas que comprueban también NULL/NULL y rechazan NULL/episodio en ambos sentidos; los IDs de episodio deben ser positivos. No confiar solo en MATCH SIMPLE, que omite comprobaciones ante NULL. Las FK nativas serializan las actualizaciones concurrentes de las claves.
- La espera también conserva versiones y rechaza DELETE/TRUNCATE; cancelarla y reordenarla continúa funcionando. No hay asignación automática.

Todas las FK/checks se crean validadas. Una relación legacy paciente/cita/nota/tarea inconsistente bloquea la instalación, sin reparar ni borrar filas. Vínculos legacy múltiples o autor desconocido se diagnostican: no se convierten en episodios ni se adivina un responsable. La migración no ejecuta UPDATE sobre históricos, incluidas las notas y el historial de 001.

## Ejecución explícita y versiones

Se usa una conexión dedicada, sin importar la configuración de la aplicación ni leer `.env`. Se exige URL explícita y confirmación exacta del nombre de base; la URL no se imprime. No debe usarse la base habitual para ensayar.

```sh
cd backend
export MIGRATION_DATABASE_URL='postgresql://USUARIO:CLAVE@HOST:5432/BASE_AUTORIZADA'
npm run db:diagnose:episodes -- --database=BASE_AUTORIZADA
npm run db:migrate -- --target=003 --database=BASE_AUTORIZADA
# Segunda ejecución: already-applied, sin reaplicar DDL ni actualizar fechas.
npm run db:migrate -- --target=003 --database=BASE_AUTORIZADA
unset MIGRATION_DATABASE_URL
```

El diagnóstico abre una transacción REPEATABLE READ READ ONLY con timeout y devuelve solo conteos: vínculos activos múltiples, autores ausentes/no profesionales, relaciones con paciente distinto y registros sin episodio si ya existe 003. No divulga textos, IDs ni candidatos de atribución. Usar un rol de solo lectura con SELECT autorizado, en un entorno y destino expresamente autorizados; los conteos también son información operativa sensible.

El ejecutor abre una transacción, fija `search_path`, usa timeouts y toma el advisory lock `728194601`, compartido con la inicialización de base nueva. Verifica nombre real de base, cuerpos exactos de funciones de 001/002, triggers habilitados y sin filtros inesperados, columnas/constraint de sesiones y ausencia de cascadas clínicas inseguras. No ejecuta ni modifica 001/002. Una base sin esos prerrequisitos se rechaza.

El manifiesto fija SHA-256 de los tres archivos. `psicopanel_schema_migrations` registra versiones, archivo, checksum, versión mayor de PostgreSQL y huella de catálogo. 001/002 se registran como prerrequisitos adoptados tras comprobación estructural; esto no pretende probar qué archivo fue ejecutado históricamente. No hay adopción automática de una 003 instalada sin registro. Una versión desconocida, registro incompleto, checksum distinto, cambio de versión mayor o deriva del catálogo rechaza la ejecución sin intentar corregirla.

La huella es específica de esa instalación y cubre el esquema público (columnas, defaults, claves, índices y su validez, triggers/funciones y controles de acceso registrados). No incluye filas ni valores actuales de secuencias: operar la aplicación no provoca deriva. Cambios legítimos posteriores necesitan una migración sucesora revisada y actualizar el protocolo de versiones, no editar archivos históricos ni borrar el registro. El registro no protege frente a un propietario/superusuario que modifique deliberadamente catálogo y evidencias.

DDL, registro de versiones y checks finales se confirman juntos. Ante error se revierte toda 003. El ejecutor no expone rollback destructivo ni opciones de reparación, backfill o forzado. No ejecutar 003 directamente con psql ni con `run-sql-file.js`; el SQL exige la marca transaccional del ejecutor.

## Instalaciones futuras y rollout

1. En una base **nueva y verificada vacía**, el inicializador existente instala schema y 001/002. El inicializador de producción no carga cuentas demo. Después ejecutar explícitamente 003 mediante el procedimiento anterior. No se incorpora 003 automáticamente al arranque ni al Compose habitual.
2. En una base existente autorizada, revisar diagnóstico, respaldo restaurable y ensayo en destino aislado. Si faltan 001/002, usar sus procedimientos propios revisados; nunca repetir schema, seed o normalizadores. Si existen relaciones inconsistentes, detenerse y diseñar una resolución autorizada fuera de este PR.
3. Programar ventana sin escritores y coordinar versiones. Las columnas generadas almacenadas y claves pueden reescribir tablas, construir índices, validar históricos y tomar bloqueos fuertes; estimar espacio y duración sobre una copia autorizada. Los timeouts convierten espera excesiva en fallo transaccional.
4. Aplicar 003 explícitamente, repetir para verificar huella y comprobar operación clínica existente. Mantener respaldo e historial; ante problemas después del commit, detener nuevos escritores y preparar corrección aditiva, sin borrar episodios/atribuciones ni restaurar cascadas.

**Límite de compatibilidad:** la aplicación actual continúa creando registros sin episodio y conserva sus permisos legacy. No atribuir citas desde otro escritor mientras ese backend siga creando notas/tareas sin episodio: esas escrituras parciales se rechazarían correctamente. La activación futura debe coordinar todos los lectores/escritores, segmentación, identidad, permisos y flujos. Un episodio SQL por sí solo no concede ni revoca acceso. No se implementa todavía el protocolo funcional de pausa, cierre, citas futuras o aceptación bilateral.

## Pruebas aisladas y demo — ADR-019

Requisitos: Docker con Compose y Bash en Linux/WSL. El wrapper construye las imágenes con los manifests actuales:

```sh
bash scripts/clinical-episodes.sh test
```

Cada ejecución genera UUID y proyecto nuevo; rechaza contenedores/redes ya existentes con esa etiqueta. PostgreSQL usa tmpfs, red privada, sin puerto publicado ni volumen persistente. El wrapper inspecciona tmpfs/red/puertos antes del primer cliente. Los tests comprueban entorno, destino, usuario, clúster de control vacío y crean sus propias bases con nombres nuevos; CREATE DATABASE falla si existen. No se copian datos reales. La limpieza elimina exclusivamente contenedores/redes del nuevo proyecto y su tmpfs; nunca usa `down -v`, prune o reseteo de volúmenes.

La suite nueva comprueba instalación vacía/poblada sintética; todas las filas y autores originales; reaplicación sin DDL; checksums/versiones/deriva; prerrequisitos; diagnóstico; identidad/terminalidad; paciente y autor; NULL parcial; exclusividad y bloqueos concurrentes; rollback DDL y reintento. Las suites existentes optan por instalar 003 **antes de abrir HTTP**, cubriendo autenticación/JWT, backoffice, notas, tareas, agenda/recurrencias, disponibilidad y espera. Se ejecutan también unitarias y lint/build de frontend.

Para una demo nueva exclusivamente de desarrollo:

```sh
bash scripts/clinical-episodes.sh demo
```

El wrapper imprime URL local de UI/API y el comando exacto para cerrar **ese proyecto nuevo**. Cuentas ficticias: `a@episodes.invalid`, `b@episodes.invalid` (psicólogos), `p@episodes.invalid`, `q@episodes.invalid` (pacientes). Contraseña común de demo: `Episode-Demo-Only-284!`. No usarla fuera de ese entorno. Los puertos se asignan en localhost sin sustituir los de la instancia habitual.

Estado inicial reproducible: P vinculado por el modelo actual a A, Q a B; nota/tarea/objetivo/espera ficticios de P sin atribución; episodio finalizado P–B, activo P–A y pausado Q–B. No se atribuye el histórico ni se transfieren permisos. Pasos:

1. Entrar como A y abrir P: aparecen registros ficticios legacy. B ve Q y no el expediente P. Pacientes P/Q conservan sus respectivas vistas. Son los permisos actuales, no una demostración de autorización por episodio.
2. Inspeccionar con psql **del contenedor de la demo** en transacción READ ONLY: `SELECT id,patient_id,psychologist_user_id,status FROM clinical_episodes ORDER BY id;` y `SELECT id,created_by_user_id,episode_id FROM patient_clinical_notes;`. Resultado: tres episodios, nota con autor/episodio NULL.
3. Los rechazos de un segundo vigente, terminalidad y relaciones parciales se comprueban con la suite automatizada; aún no hay botones para operarlos ni atribuir registros. Archivo propio/permisos por episodio se demostrarán visualmente cuando se implementen.
4. Restablecer significa ejecutar de nuevo el wrapper para crear **otro proyecto nuevo**, nunca sobrescribir el anterior. El creador rechaza entorno no development, clúster reutilizado o base existente.

La demo complementa los tests; no adelanta flujos 2B/2C ni convierte el carácter ficticio en autorización para tocar otras bases. Este PR se ensayó únicamente sobre sus propios destinos desechables.

Resultados de esta entrega, archivos y riesgos en [clinical-episodes-validation.md](clinical-episodes-validation.md).
