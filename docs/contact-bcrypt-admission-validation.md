# Candidato PR #62 — admisión persistente de bcrypt en cambios de contacto

## Alcance y base

Encargo autorizado el 6 de noviembre de 2026, sobre `main` remoto reconsultado `3d89863cebb592fb250d7dd6014bf46b8e1b0782`. Rama `fix/security-contact-bcrypt-admission`. [Diseño revisado y aprobado](contact-bcrypt-admission-design.md); incluye alternativas, justificación del presupuesto y costo legítimo. Sus dos commits documentales preceden la implementación.

Corrección acotada de los riesgos bcrypt de CodeQL #8/#9. No modifica login público/limitador, recuperación, fotografías, flujos clínicos, reglas CodeQL, workflows o despliegue. Conserva AB-23, `prepared`, `allowed:false`, `audienceVerified:false` y confidencialidad. No hay merge, aplicación SQL habitual ni despliegue autorizado. Draft para auditoría independiente de ChatGPT/Work y decisión exclusiva del propietario.

## Implementación

[Ejecutor](../backend/src/modules/auth/contact-password-admission.js), [servicio](../backend/src/modules/auth/contact-change.service.js) y [controlador conservado](../backend/src/modules/auth/contact-change.controller.js):

- Diez admisiones compartidas por `users.id` en ventana móvil de 900 segundos entre inicio, reautenticación, canales, IDs, sesiones e instancias. Se conservan cinco fallos/900 segundos y cuotas funcionales. La cifra inicial es política técnica aprobada, no benchmark de capacidad.
- Una conexión secuencial, dos transacciones READ COMMITTED y orden usuario → paciente → solicitud. A realiza preflight de solo lectura, comprueba cuotas después del lock, inserta `password_admitted` y confirma con `synchronous_commit=on`. Sin confirmación inequívoca, no compara.
- B vuelve a bloquear y relee identidad, hash, versión, estado y prerrequisitos. Revalida cinco fallos y cuotas funcionales; no cobra de nuevo el presupuesto ya reservado. Valida la fila de evento/edad DB y deadline monótono de diez segundos. El indicador privado de uso se establece antes de la única llamada a bcrypt y no hay retry interno ni endpoint de canje.
- Un reintento idempotente requiere su propia reserva y contraseña correcta, incluidos recibos terminales. No duplica inicio/aviso ni renueva autoridad. Contraseñas malformadas mantienen error y contador de fallos sin llamar bcrypt; su admisión confirmada tampoco se devuelve.
- 429 siempre antes de comparar, sin barrido previo de expiraciones ni efectos funcionales de esa invocación. B puede conservar únicamente la admisión A. Los errores de infraestructura y reservas vencidas tienen 503 y mensajes distintos; fallos incorrectos 400, sesión revocada 401. Errores SQL quedan fuera de mensajes/logs de contacto.
- Retry-After se calcula con reloj PostgreSQL y redondeo hacia arriba. Se toman los M eventos más recientes para calcular el cupo correcto también con más de M eventos. El encabezado no garantiza cupo futuro frente a otros intentos.
- Después de comparar se refresca tiempo; las mutaciones funcionales siguen siendo atómicas en B. Error SQL, rollback, desconexión o pérdida de respuesta no reembolsan A. Confirmación de contacto conserva su transacción y revocación actuales.

El fingerprint del JWT no sustituye contraseña. Las reservas son privadas a la invocación, nunca se reciben por body y nunca se reconstituyen después de reiniciar proceso. El runtime de confianza es el servicio; una aplicación o administrador con capacidad de modificar arbitrariamente DB/código queda fuera de esta prueba.

## Migración 012 y ensayos de 005

[012](../backend/sql/migrations/012_contact_password_admission.sql) amplía exclusivamente el CHECK de acciones de eventos y exige request_id nulo para `password_admitted`. Agrega un índice parcial por fecha/ID exclusivamente de admisiones para la limpieza acotada; no agrega tablas, roles, funciones privilegiadas ni backfill/demo compatibility. [Manifiesto](../backend/sql/migrations/manifest.json), [runner](../backend/scripts/episode-migration.js) y [CLI](../backend/scripts/migrate.js) incorporan la versión sin modificar SQL 001–011 ni sus entradas/hashes históricos.

El runner mantiene catálogo/ledger y vuelve a aplicar contratos especiales de 009–011 cuando la versión instalada es 012; se generalizan condiciones antes exclusivas de 011. Las pruebas negativas conceden permisos indebidos a lector/creador/propietario del resolver y, aun actualizando la huella de prueba, requieren rechazo por el contrato especial correspondiente.

[Preparación aislada](../backend/scripts/contact-admission-sandbox.js) aprovisiona dos LOGIN distintos NOINHERIT con credencial ficticia y aplica cadena completa mediante el runner original, sin relajar sus precondiciones. Los fixtures HTTP de contacto, identidad, revisión y deadline y la demo de identidad usan realmente 012. Los casos históricos que prueban instalación/rollback/deriva de 005 se conservan en 005 y se conservan sus bases pobladas separadas; HTTP utiliza otro destino nuevo, con cadena 012 instalada antes de crear fixtures. Nunca vaciar ni adoptar una base poblada para superar 008/009. No se cambia infraestructura CI para eludir pruebas.

## Retención técnica aprobada dentro del encargo

Política definida para estos eventos técnicos, sin ampliar retención de auditoría funcional: **solo `password_admitted` con antigüedad estrictamente mayor de 24 horas es elegible para borrado**. Mantiene margen respecto de ventana de 900 segundos y permiso de diez segundos. No borra ni reescribe `password_failed`, `started`, `reauthenticated` u otras acciones, aunque sean más antiguas.

El [mantenimiento existente](../backend/src/modules/auth/contact-change.processor.js) ejecuta primero un lote de hasta 1000 eventos elegibles por llamada mediante SELECT FOR UPDATE SKIP LOCKED y DELETE con predicado de acción/antigüedad repetido. Se ejecuta antes de depender de claves de cifrado: una clave ausente no impide esta limpieza. No toma locks de usuario después de bloquear eventos ni toca datos clínicos.

No es un nuevo cron, proveedor, recurso o servicio. Con el procesador habilitado se usa su tick existente de 60 segundos; si está detenido o existe backlog, la eliminación física se retrasa. Por tanto, 24 horas es horizonte de elegibilidad, no una promesa de borrado físico exacto a las 24 horas. No se instala ni habilita ese procesador en ningún entorno habitual por este PR. Se prueban exclusividad de acción, conservación de ventana activa, dos limpiadores concurrentes y máximo de 1000 por lote. El presupuesto se recupera por tiempo, nunca por esta limpieza.

## Pruebas y evidencia

[Unitarias](../backend/test/contact-password-admission.test.js): COMMIT antes de comparar, revalidación doble, compare que lanza sin retry, COMMIT incierto, vencimiento y cuota agotada.

[Integración nueva](../backend/test/contact-password-admission.integration.test.js): HTTP real y PostgreSQL aislado; instrumentación bcrypt del padre y [proceso hijo](../backend/test/fixtures/contact-admission-worker.js); diez aciertos de replay, reautenticaciones, cinco errores, formatos incorrectos, IDs/sesiones distintos, concurrencia finita, cuotas funcionales previas, rollback y desconexión después de bcrypt, respuesta perdida de COMMIT A, versión/contraseña cambiadas entre A/B, quinto fallo intercalado, lock timeout, reserva envejecida, recuperación, retención, instalación completa, upgrade 011→012, rollback/concurrencia/replay/CLI y contratos especiales. Se conservan regresiones históricas de identidad/contacto/sesión/deadline y clínica.

**Resultados todavía pendientes de CI en este corte.** No convertir nombres de pruebas o inspección de código en ejecución demostrada. Se exige comprobar HEAD final, base, merge de prueba, siete checks y análisis CodeQL; artifacts de 14 días con hashes, inventarios e identidad y limpieza contrastadas. Los resultados definitivos se registran en el PR mediante comentario para no reiniciar la matriz al editar su descripción.

Entorno local: Docker Desktop Linux Engine no está disponible y no hay Node Linux en PATH. No se instala ninguna herramienta en host ni se inicia/reconstruye el entorno habitual. Se permite lectura/comprobación de sintaxis con Node Windows existente; no acredita runtime Node 24.22.0 ni PostgreSQL. Las pruebas y demo browser del alcance se ejecutarán en sandboxes nuevos de los runners autorizados de CI.

## Riesgos residuales

Consumo conservador sin comparación, margen de diez segundos entre admisión y comienzo, esperas legítimas por replay y sesiones alternantes, costo de dos transacciones, crecimiento mientras no opere el mantenimiento y límites del reloj DB. Durabilidad depende del PostgreSQL/almacenamiento confiables; no se promete failover sin pérdida. No es límite global de CPU ni protección agregada frente a muchas cuentas. La protección SQL puede no ser reconocida por CodeQL; no se cambian reglas ni se descartan alertas manualmente. No activar capacidades clínicas o afirmar despliegue por aprobar ensayos.
