# Proteccion de expedientes: auditoria y politica implementada

Fecha: 16 de octubre de 2026. Base revisada: `main` en `9dbc305`, con Docker integrado.
Trabajo local en `fix/clinical-data-integrity`; sin push, merge ni cambios a la base en uso.

## Hallazgos de la auditoria

| Accion original | Riesgo encontrado | Comportamiento nuevo |
| --- | --- | --- |
| Cancelar cita | Conservaba la fila; rechazaba notas vinculadas solo desde el servicio, con una ventana entre validacion y escritura | Conserva registro y libera horario; PostgreSQL verifica tambien la nota y serializa operaciones concurrentes |
| Eliminar cita individual | No comprobaba la nota; la cascada cita → nota → tareas podia borrar informacion clinica | HTTP 409 para registros accesibles; se usa cancelacion |
| Eliminar esta y futuras | Comprobacion previa de notas sin bloqueo y borrado fisico; sin auditoria de la serie | DELETE devuelve 409; la interfaz usa cancelacion mediante PATCH, transaccion y auditoria por cita |
| Reprogramar | Proteccion de notas solo en servicio; sobrescribia fecha y hora; la serie no registraba auditoria | Proteccion tambien en PostgreSQL; conserva valores anteriores e incorpora auditoria de la serie |
| Eliminar paciente | Borraba entrevista, citas, notas, tareas, espera y vinculos por cascada; desvinculaba cuenta y auditoria | HTTP 409; usar estado inactivo o dado de alta, conservando el expediente |
| Eliminar nota | Borraba tareas por cascada y permitia despues cambiar la cita | HTTP 409; la nota se corrige conservando versiones; no puede cambiar de cita o paciente |
| Retirar tareas/objetivos | DELETE directo y borrado de las tareas omitidas al editar una nota | Marca `retired_at`; la fila y su version anterior permanecen |
| Retirar espera | Borrado fisico operativo | Cambia a `cancelled`; se excluye de la lista activa y se normaliza su prioridad |

Las relaciones clinicas hacia pacientes, citas, notas y autores usan `RESTRICT` mediante una migracion que localiza las claves por relacion, incluso con nombres antiguos. Se conservan las cascadas operativas no clinicas, por ejemplo bloques de disponibilidad y tokens de restablecimiento. La cuenta de un autor o una referencia de auditoria ya no puede borrarse fisicamente si sigue referenciada; usar `is_active`.

`schema.sql` contiene historicamente borrado de vinculos duplicados, eliminacion de columnas y otras transformaciones. `seed.sql` puede borrar notas duplicadas o actualizar registros. El normalizador de notas futuras tambien contiene un DELETE. **Ninguno de esos archivos es una migracion segura para una base con expedientes.** No se ejecutaron contra la instancia actual. Tras esta migracion, los triggers rechazan el borrado de notas incluso desde esos scripts.

## Politica y contratos

- No se permite borrado fisico de pacientes, entrevistas, citas, notas ni tareas/objetivos, aunque no tengan dependencias. Tambien se rechaza TRUNCATE, incluido CASCADE.
- Las cancelaciones conservan ID, paciente, fecha y hora. Reprogramar una cita sin nota conserva el mismo ID y guarda el estado anterior en el historial. No crea otra cita.
- Las notas con cita quedan vinculadas de forma permanente. Solo se aceptan notas para citas completadas, del mismo paciente y fecha, que no sean futuras (zona `America/Los_Angeles`). Los registros antiguos inconsistentes no se eliminan ni se corrigen automaticamente; una edicion incompatible puede requerir revision manual.
- La serie se cancela mediante `PATCH /api/appointments/:id` con `{ "status": "cancelled", "recurrenceEditScope": "future" }`. Afecta el ancla y las posteriores no canceladas dentro del alcance autorizado. Una nota en cualquier objetivo rechaza toda la operacion. Elegir un ancla ya cancelada devuelve 409; seleccionar una cita no cancelada. Al reprogramar se mantienen los intervalos de fechas, incluidos huecos de cancelaciones anteriores.
- DELETE de paciente, cita, recurrencia o nota accesible devuelve 409 y `CLINICAL_RECORD_PRESERVED`. Se mantiene 404 para ID inexistente o fuera de alcance; roles no autorizados reciben 403. No se simula un borrado exitoso.
- DELETE de tareas/objetivos sigue devolviendo 200 al retirarlos; un segundo intento devuelve 404. Los items retirados no aparecen en expedientes ni recordatorios, y una solicitud antigua no puede modificarlos.
- Cancelar no satisface ni reasigna la lista de espera. La asignacion sigue siendo manual. El cambio a inactivo/dado de alta no modifica citas ni revoca vinculos automaticamente; hay que gestionarlos explicitamente.

## Permisos revisados

Las mutaciones clinicas de creacion, eliminacion/retiro y notas exigen psicologo. Pacientes solo pueden marcar el cumplimiento de sus propias tareas/objetivos; el servicio tambien rechaza cambios al texto por otros roles. Admin y soporte no adquieren lectura clinica global. Superadmin mantiene su alcance excepcional de lectura existente, con las diferencias de campos que ya tenia la API; no obtiene permiso nuevo para borrar.

La autorizacion de lectura usa vinculo activo **o** `psychologist_patient_access`. Algunas validaciones de agenda, disponibilidad, espera y seleccion de series aun dependen solo de esta tabla heredada. El flujo normal sincroniza ambas al cambiar vinculos, pero bases inconsistentes pueden mostrar un expediente y rechazar alguna operacion. No se amplia ni se elimina ese fallback en esta fase. Tampoco se introduce un flujo break-glass; sigue pendiente una revision especifica de ese acceso excepcional.

## Migracion y despliegue pendiente de autorizacion

Archivo: `backend/sql/migrations/001_clinical_data_integrity.sql`. Es transaccional e idempotente; agrega columna e historial, sustituye claves y crea triggers. No transforma filas clinicas existentes. Adquiere bloqueos DDL y valida claves: programar una ventana sin escrituras, comprobar respaldo restaurable y revisar restricciones personalizadas antes de aplicarla.

Orden para una base existente, una vez autorizado el despliegue:

1. Detener temporalmente las escrituras de la aplicacion antigua y obtener el respaldo.
2. Con el codigo nuevo disponible, ejecutar **solo** `npm run db:migrate:clinical-integrity` en backend, apuntando deliberadamente a la base deseada. En Docker usar el servicio backend reconstruido con ese codigo y su configuracion; no ejecutar schema, seed, db:init ni normalizadores.
3. Arrancar backend e interfaz nuevos juntos y comprobar lectura de expedientes, cancelacion y recordatorios. El nuevo backend necesita `retired_at`; no debe arrancar antes de la migracion.

Las bases Docker nuevas ejecutan schema + seed, y despues la migracion en su propia transaccion, antes de escribir la marca de salud. Un volumen existente no se migra con reiniciar Docker. `db:schema` incorpora la proteccion para instalaciones nuevas, pero conserva el caracter historico del schema y no debe usarse para actualizar expedientes reales.

No se proporciona rollback que borre el historial o restituya cascadas. Ante un problema, conservar las estructuras y los datos; revertir a la aplicacion antigua necesita evaluar los endpoints que ahora fallaran por proteccion. La migracion no recupera informacion eliminada antes de instalarla.

## Historial, recuperacion y limites

`clinical_record_history` guarda la fila anterior completa de cada UPDATE de pacientes, entrevistas, citas, notas y tareas/objetivos. Es append-only ante UPDATE, DELETE y TRUNCATE. Los cambios y las versiones se confirman o revierten juntos. No se expone por API ni se concede acceso PUBLIC; contiene informacion clinica y necesita los mismos controles de acceso y respaldo que el expediente.

La recuperacion de tareas retiradas o la consulta de versiones requiere una revision manual con acceso autorizado a PostgreSQL; no hay todavia interfaz de restauracion. El historial conserva valores pero no incorpora autor ni motivo de cada cambio. `audit_logs` registra los actores de las operaciones que ya lo usan, incluidas ahora las series y retiros directos; no equivale a una firma clinica ni a un registro completo de atribucion de todas las escrituras SQL.

Los triggers no protegen frente a un propietario/superusuario que altere el esquema o deshabilite triggers. El entorno Docker de desarrollo usa un rol privilegiado; separar rol de migraciones y rol de aplicacion requiere otro ajuste operativo. El historial crece con cada edicion y almacena versiones completas: monitorizar espacio y definir retencion mediante una politica autorizada. Esta fase no define plazos de conservacion ni una purga legal.

Los controles de conflictos de agenda siguen siendo validaciones previas de la aplicacion; no se agrega una exclusion SQL para reservas simultaneas. Los efectos de espera posteriores al COMMIT y las posibles escrituras antiguas desde otra sesion mantienen sus limites previos. El historial permite conservar los valores anteriores; no agrega control de versiones optimista.

## Pruebas reproducibles

Se usan las imagenes Docker del proyecto y PostgreSQL 17. `compose.integrity-test.yaml` tiene base propia en tmpfs, sin puertos, volumen persistente ni credenciales de la instancia real. No cambiar su nombre de base para ejecutar integracion.

```sh
docker compose -p psicopanel-integrity-test -f compose.integrity-test.yaml run --rm backend npm test
docker compose -p psicopanel-integrity-test -f compose.integrity-test.yaml run --rm backend
docker compose -p psicopanel-integrity-test -f compose.integrity-test.yaml run --rm --no-deps frontend
docker compose -p psicopanel-integrity-test -f compose.integrity-test.yaml up -d --wait init-db
docker compose -p psicopanel-integrity-test -f compose.integrity-test.yaml --profile initialization down
```

La integracion se ejecuta una vez por base vacia; repetir tras bajar el proyecto de pruebas descarta exclusivamente su tmpfs. Verifica migracion de cascadas con nombres legacy, segunda aplicacion sin cambios de conteo, schema/seed compatibles en datos de prueba, contratos HTTP, permisos, inactivacion, cancelacion, retiro de tareas y objetivos, historial, reprogramacion y bloqueo SQL de DELETE/TRUNCATE. Las carreras en ambos sentidos verifican `pg_stat_activity` para confirmar la espera por bloqueo antes de resolverla.

Resultado local: **68 pruebas unitarias aprobadas; 10 escenarios de integracion aprobados** (Node reporta 11 contando el contenedor del test), lint y build de frontend correctos, e inicializacion Docker nueva saludable. No se realizo prueba visual interactiva. Vite emitio un aviso no bloqueante sobre la antiguedad de Browserslist.
