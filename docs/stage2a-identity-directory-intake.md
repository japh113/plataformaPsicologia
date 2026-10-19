# Etapa 2A — Identidad, directorio básico y vinculación inicial

Fecha: 18 de octubre de 2026. Base inspeccionada: `main`/`origin/main` en `0077f46` (#9 integrado).

**Estado: diseño técnico PROPUESTO, actualizado en PR A.** ADR-012/020–028 y RN-29–58 contienen decisiones de producto aprobadas; los mecanismos D-01–D-12 siguen pendientes salvo lo expresamente resuelto por esos ADR. Este documento abarca el objetivo completo de 2A, no todo se implementa en B/C/D.

La [división A/B/C/D](identity-directory-delivery-plan.md) y el inicio exclusivo de A están aprobados. A solo cambia Markdown y abre un PR sin merge: no crea código/SQL/migraciones, no ejecuta bases/demos ni altera contenedores/volúmenes. La deshabilitación funcional de rutas legacy no está aprobada. Arquitectura real en [architecture.md](architecture.md); inventario de mutaciones para cuentas nuevas y existentes en [stage2a-legacy-mutations.md](stage2a-legacy-mutations.md). La futura app móvil no se implementa ahora.

## 1. Base existente y límites de confianza

| Evidencia inspeccionada | Estado actual y consecuencia |
| --- | --- |
| [auth.service.js](../backend/src/modules/auth/auth.service.js), `registerPatientUser` | Inserta cuenta y `patients` sin psicólogo/episodio, pero no verifica correo/teléfono; admite edad/motivo y fija riesgo `none`/estado `active` globales. No equivale al alta objetivo ni a riesgo evaluado o episodio vigente. |
| [schema.sql](../backend/sql/schema.sql), `users.patient_id` | Asociación única cuenta-paciente; `patients.id` sigue estable. Contactos duplicados en cuenta/paciente; DOB en entrevista. Hace falta autoridad explícita de básicos. |
| `psychologist_profiles` | Título, cédula, aprobación y notas de revisión; sin elección de publicación/admisión independientes. Aprobación `active` no significa episodio activo. |
| `listAvailablePsychologists` / `mapPsychologistDirectoryRow` | Lista autenticada de aprobados con email y sin opt-in. No es directorio público; no volverla anónima sin nueva proyección. |
| `requestCareRelationship`, `inviteCareRelationship`, `respondToCareRelationship`, `acceptCareRelationshipInvite` | Reutilizan vínculos y pueden sincronizar acceso heredado. Invitación exige cuenta existente; código y plazo legacy no se adoptan como nueva política. |
| [auth.permissions.js](../backend/src/modules/auth/auth.permissions.js), `buildPatientAccessScope` | Vínculo activo O `psychologist_patient_access`, filtrado por paciente. #7 excluye backoffice, pero falta autorización por episodio. |
| [003](../backend/sql/migrations/003_clinical_episode_foundation.sql) y [fundamentos](clinical-episodes-foundation.md) | Episodios independientes `active`/`paused`/`finalized`; índice `clinical_episodes_one_current_patient_idx` por paciente active/paused; atribución compuesta opcional e inmutable en citas/notas/tareas/espera. No autoriza clínicamente ni atribuye legacy. |
| [ejecutor](../backend/scripts/episode-migration.js) y [manifiesto](../backend/sql/migrations/manifest.json) | Versiones 001–003 y huella de catálogo. Una sucesora necesita evolucionar protocolo, sin DDL por fuera ni borrar evidencia de deriva. |
| [auditoría](../backend/src/utils/audit.js) y preservación de 001 | Metadatos JSON e historial de filas. El filtro administrativo de #7 no protege un mensaje si primero se copia a auditoría/historial genéricos. |

La [evidencia de #8](clinical-episodes-validation.md) es histórica; no se vuelve a ejecutar en este encargo. No se consultan bases para diseñar. Tener 003 en Git no acredita instalación en un entorno.

## 2. Invariantes aprobadas y frontera con 2B/2C

- Registro independiente, correo/teléfono verificados y aceptación bilateral sin fusión automática. Sin motivo de consulta, CURP o documento universal obligatorio. Soporte excepcional no clínico conforme AB-13, con metodología pendiente.
- Perfil privado por defecto, publicación optativa solo del aprobado y recepción de nuevos pacientes independiente. Lectura anónima mínima; invitación directa independiente de admisión pública.
- Solicitud del paciente: aceptación profesional seguida de confirmación final. Una pendiente iniciada por él ocupa cupo en ambas esperas; cancelable y caducable. Mensaje opcional sensible fuera del directorio/auditoría administrativa.
- Invitación a conocido: admite registro posterior, exige verificación y aceptación expresa; sola no abre episodio. Invitaciones separadas, sin política definitiva de simultaneidad aprobada.
- Ningún pendiente concede expediente. Creación de episodio transaccional y máximo uno activo/pausado garantizado por PostgreSQL, sin revelar otros consultorios.

Con episodio activo o pausado, alta inicial no lo cierra, pausa ni transfiere: corresponde 2B. Solo al paciente en su ámbito puede indicarse que requiere cambio; al profesional, indisponibilidad genérica sin identidad ni existencia explícita de otro consultorio. Si 2B no existe, no simular éxito. Regreso tras finalización requiere nuevo ID (RN-03); elegibilidad exacta de readmisión en la futura vinculación requiere D-06/D-10.

Se conservan derivación con resumen por versión exacta, cambio directo, agenda y responsabilidad anterior de 2B; antecedentes adicionales, consentimiento/revocación de 2C; archivo propio, adendas, respuestas históricas y ARCO. Alta inicial no copia clínicos globales o de otros episodios.

## 3. Decisiones técnicas propuestas

Las alternativas de mecanismo D-01–D-12 requieren revisión/aprobación antes del código correspondiente. Los requisitos de producto ya resueltos en ADR-023–028 prevalecen sobre alternativas antiguas; la tabla indica qué partes siguen pendientes.

| ID / asunto | Alternativas | Recomendación propuesta | Riesgos | Aprobación necesaria |
| --- | --- | --- | --- | --- |
| D-01 Perfil/directorio | Ampliar perfil o catálogo duplicado; ID interno o público | Perfil existente, proyección pública explícita, ID opaco público independiente y dos flags inicialmente apagados | Publicación accidental, enumeración, caché y contactos sensibles | Campos/defaults resueltos ADR-026/027; pendientes identificador, persistencia, retiro/caché (AB-18) |
| D-02 Identidad/básicos | Reemplazar `patients` o preservar ID; inferir identidad por contactos o vínculo verificado | Preservar `patients.id`, asociación única de cuenta y básicos bajo control del paciente; separar clínicos | Duplicados, teléfonos compartidos/reciclados y fuentes contradictorias | DOB adulta/global resuelta ADR-023; pendientes normalización/unicidad y revisión excepcional (AB-13/14/21/26) |
| D-03 Verificación | Métodos resueltos: enlace email y código SMS; pendiente proveedor y mecanismo | Desafíos por cuenta, propósito y versión de contacto, de un uso; adaptadores de entrega | Fuerza bruta, SIM swap, replay, enumeración, fallas y costo | Métodos/TTL/reenvíos/cuotas/intentos SMS resueltos ADR-024; proveedores reales, controles adicionales y recuperación pendientes (AB-21/26) |
| D-04 Persistencia | Reutilizar `care_relationships`, tabla polimórfica o dos agregados | Solicitudes e invitaciones separadas, previas a episodio y sin sincronizar acceso legacy | Estados duplicados, joins que filtran datos y destinatario aún sin cuenta | Entidades/campos, evidencia y relación con episodio (AB-14/19/22) |
| D-05 Estados/cupo | Solo servicio o restricción DB; worker o vencimiento en operación | Índice parcial de pendientes del paciente y locks; caducidad materializada por worker y operaciones | Cupo ocupado por worker caído, carreras y cambios de admisión | Estados, transiciones, plazos y pendientes ante cambios (AB-18/19) |
| D-06 Confirmación | Solo índice, serializable o locks + índice | Transacción, locks ordenados, revalidación final y unicidad de 003 | Deadlocks, permisos legacy y cambios concurrentes de cuenta/aprobación | Protocolo de escritores, errores/reintentos, readmisión y activación (AB-14/15/17) |
| D-07 Idempotencia | Solo frontend, registro persistido o ID determinista | Registro transaccional por actor/operación/clave, huella autenticada y resultado mínimo | Copia de mensaje, reuso de clave y replay entre cuentas | Alcance/duración, huella y respuestas (AB-15/22) |
| D-08 Abuso | IP, cuenta o combinación; bloqueo total o por pareja | Límites compartidos por cuenta/destinatario/red/costo; cooldown por pareja con revisión | NAT, exclusión legítima, cuentas múltiples y acoso por invitación | Valores, bloqueo/revisión y simultaneidad de invitaciones (AB-20) |
| D-09 Mensajes | Texto en relación/audit, tabla privada o payload cifrado separado | Payload privado separado, llaves fuera de DB y eventos sin contenido | Historial/backup/logs duplican texto; llaves, XSS y longitud | Límite, cifrado/llaves, retención/borrado y privilegios (AB-22) |
| D-10 API/permisos | Adaptar legacy o comandos explícitos con adaptadores restrictivos | DTO por actor, permisos por episodio y comandos limitados | IDOR, inferencia por errores y ampliación administrativa | DTO/status/errores, transición legacy y readmisión (AB-08/14/18/19) |
| D-11 Evolución | DDL manual, editar 003 o sucesoras registradas | Sucesoras aditivas con huella previa/nueva y ejecutor ampliado; activación coordinada | Bloqueos, versiones mixtas y recuperación incompleta | Sucesoras/compatibilidad y despliegue por entorno (AB-17), separado |
| D-12 Pruebas/demo | Base reutilizada, solo mocks o sandbox PostgreSQL nuevo | Unitarias/API/DB y demo ficticia por cuentas, entrega simulada sin costo real | Falsa confianza en mocks, credenciales y etiquetas compartidas | Escenarios, guardas y evidencia por PR (ADR-019); sin ejecución ahora |

## 4. Modelo candidato y clasificación

### Perfil profesional (D-01)

Configuración sugerida: ID público, `is_public=false`, `accepts_new_patients=false`, versión y fechas. Ambos defaults apagados y su independencia están aprobados en ADR-026; persistencia/ID/versionado siguen propuestos. Publicación efectiva exige opt-in, cuenta activa, rol psicólogo y `approval_status='active'`: comprobar al guardar, leer y solicitar. Suspensión/inactivación retira exposición sin motivo privado. Rehabilitar no publica sin opt-in; reconfirmación de publicación y recepción tras rehabilitación aprobada en ADR-027; mecanismo técnico pendiente.

Campos públicos aprobados en ADR-026: nombre profesional, foto opcional, formación académica, cédula, especialidades, enfoque, modalidad presencial/en línea/ambas, ciudad/estado, descripción breve y recepción. ID público y forma exacta del DTO siguen propuestos. Excluir email de cuenta, teléfono personal, DOB, notas/fechas de revisión, IDs internos, pacientes, solicitudes/conteos, episodios, agenda y riesgo. Listado paginado acotado y orden estable; sin ranking, reseñas o filtros avanzados.

Recomendar sin caché compartida inicialmente; si se añade, aprobar invalidación de lista/detalle al despublicar/suspender y exposición obsoleta máxima. Privado/inactivo/inexistente indistinguibles. Cerrar admisión no oculta perfil ni impide invitación directa; tratamiento de solicitudes en curso al cambiar flags pendiente AB-18/19.

### Cuenta y verificaciones (D-02/D-03)

Registro candidato: nombre, apellidos, email, teléfono y contraseña; DOB global obligatoria en registro adulto (>=18) aprobada en ADR-023; no inferir históricos. Sin motivo, entrevista o riesgo. Cuenta/identidad en una transacción; contactos sin verificar. Sesión no acredita verificaciones ni permisos clínicos: comprobar servidor. Cuenta puede verificarse sin profesional. Correo y teléfono vigentes antes de solicitar y antes de abrir episodio.

Resolver autoridad de email/nombre entre `users` y `patients` mediante servicio de básicos consistente; psicólogo no cambia identidad por PUT legacy. No promover DOB desde entrevista ni reclamar una identidad legacy por conocer contacto. El riesgo `none` legacy no acredita evaluación: nuevo contexto de episodio debe representar NO EVALUADO con almacenamiento aún pendiente AB-02/14.

Desafío candidato: cuenta, canal, propósito, versión de contacto, digest de secreto, caducidad, intentos y consumo. Nunca código/token en auditoría ni preview remoto. Para códigos cortos, digest autenticado con secreto servidor y cuotas compartidas. Invalidar ante cambio de destino; reenvíos según política aprobada. Verificar email no verifica teléfono. Cambio de contacto invalida evidencia correspondiente; revocar todas las sesiones por session_version al confirmar cambio, incluida la actual (ADR-025), sin cerrar episodios. Vigencia de reautenticación y mecanismo de confirmación pendientes.

Normalización consistente (sin equivalencias asumidas de puntos/alias email; país explícito en teléfono). Restricciones DB resuelven carreras de registro, no prueban identidad. No imponer teléfono único sin resolver números familiares/reciclados. Respuestas de alta/reenvío/recuperación sin enumeración, con tiempos razonablemente comparables. Sin fusión por coincidencia; revisión excepcional por soporte autorizado no clínico, auditada y con evidencia según AB-13. Si métodos pendientes, mantener reconciliación bloqueada.

### Parámetros aprobados y cambios pendientes de implementación

ADR-024 fija email por enlace de 24 h, SMS por código de 10 min, espera de 60 s y máximo 5 envíos por destino en ventana de 24 h; SMS máximo 5 intentos por código. Nuevo desafío invalida anterior. Proponer cuotas transaccionales compartidas y digest/HMAC según entropía, con pruebas de carreras y protección de destino sin bloqueo provocado por terceros. Longitud del código, secreto servidor, almacenamiento, retención y umbrales adicionales siguen pendientes; no usar TTL legacy de invitaciones ni preview de reset como especificación.

ADR-025 exige contraseña reciente, aviso al contacto anterior sin veto, verificar nuevo e invalidar evidencia previa y todas las sesiones al confirmar. Separar candidato/vigente y aplicar commit con incremento de session_version son recomendaciones para C; diseñar entrega durable/fallos e idempotencia, sin inventar un proveedor ni recuperación excepcional.

ADR-026/027 requieren versión aprobada separada de pendiente, revisión administrativa selectiva y retiro/reconfirmación pública. Proponer snapshot aprobado + propuesta versionada y decisión transaccional, sin permitir que edición directa de campos, registro profesional o review genérico publiquen pendientes. El DTO de cuenta actual contiene reviewNotes: no reutilizarlo públicamente. Especialidades/enfoque verificables y nombre profesional/foto requieren cerrar AB-24; consulta de estado para cuentas no aprobadas AB-27.

### Agregados de vinculación (D-04)

| Entidad candidata | Datos mínimos sugeridos y límites |
| --- | --- |
| Solicitud inicial | ID opaco; paciente de sesión; profesional destinatario; estado/versión; creación/caducidad/resolución; aceptación profesional y confirmación final con actor/fecha/versión; mensaje privado opcional por referencia; episodio solo al completar. |
| Invitación profesional | ID opaco; emisor; contacto privado de entrega o cuenta verificada asociada posteriormente; digest de token aleatorio de alta entropía de un uso; estado/versión/fechas; aceptación del paciente; episodio al completar. No exigir cuenta al emitir. |
| Eventos | Agregado, transición, actor interno, instante y versión de condiciones. Sin mensaje, contacto, token o motivo libre; acceso restringido a participantes. No incorporarlos al feed administrativo. |
| Payload privado | Mensaje opcional cifrado y versión de llave; solo paciente autor/profesional destinatario autorizado. No es nota ni se copia al expediente. |
| Verificación/idempotencia | Datos mínimos por propósito, sin respuestas completas ni secretos en texto. Retención independiente de clínicos, pendiente AB-22. |

FK a paciente global/profesional; episodio enlazado debe coincidir en ambos. Propuesta: máximo un episodio por origen y un origen inicial por episodio; históricos pueden carecer de origen nuevo sin backfill inventado. Participantes inmutables tras emitir; otro destinatario requiere nueva operación. Timestamps servidor UTC con precisión acordada. Ninguna de estas entidades se crea aquí.

## 5. Estados y transiciones candidatos (D-05)

### Solicitudes iniciadas por paciente

| Origen | Acción / actor | Destino y condiciones |
| --- | --- | --- |
| Sin pendiente | Solicitar / paciente autenticado y verificado | `awaiting_professional`; público/aprobado/admite, cupo libre, elegibilidad inicial y cuotas. Mensaje opcional. |
| `awaiting_professional` | Aceptar / profesional destinatario | `awaiting_patient_confirmation`; registra aceptación/versionado. Sin episodio ni permiso. |
| `awaiting_professional` | Rechazar / profesional destinatario | `rejected`; libera cupo, sin motivo clínico libre ni exposición administrativa. |
| Ambas esperas | Cancelar / paciente solicitante | `cancelled`; libera cupo sin borrar historia o contadores. |
| Ambas esperas | Vencer / servidor | `expired` si llegó plazo; libera cupo aunque worker se retrase. |
| `awaiting_patient_confirmation` | Confirmar / mismo paciente verificado | `linked` junto al COMMIT del episodio y condiciones revalidadas. Aceptación profesional no basta. |
| Ambas esperas | Inhabilitar flujo / servidor | Candidato `closed_unavailable`, sin causa ajena detallada; condiciones requieren AB-18/19, no equivale a cambio 2B. |

Cupo DB ocupado por `awaiting_professional` y `awaiting_patient_confirmation`. Terminales: `linked`, `rejected`, `cancelled`, `expired` y, si se aprueba, `closed_unavailable`. Sin volver a pendiente ni reutilizar rechazo; nueva solicitud usa otro ID y cuotas. Aceptar solo desde primera espera y confirmar solo desde segunda. Reintentar o doble aceptar no extiende vida automáticamente.

Aprobar plazos de respuesta y confirmación, inicio de cada uno y cota de vida total; ningún valor está decidido. Recomendar no prolongar cota total por aceptación o cambios de flags. Evaluar reloj de pared de DB después de locks, no un instante congelado al iniciar transacción: al llegar al plazo, confirmar falla. Índice parcial sobre estados persistidos, sin predicado de reloj móvil. Worker materializa vencimientos y operaciones lo hacen también condicionalmente. Al crear, resolver pendientes ya vencidos del mismo paciente antes de comprobar unicidad. Worker no gobierna por sí solo validez. Al crear solicitud, adquirir el lock de identidad del paciente siguiendo el orden común, materializar vencidas y comprobar cupo/cuotas dentro de la misma transacción; el índice parcial arbitra inserciones concurrentes. Plazos y terminal ante inhabilitación siguen pendientes.

### Invitaciones profesionales

| Origen | Acción / actor | Destino propuesto |
| --- | --- | --- |
| Sin invitación | Emitir / profesional activo y aprobado | `awaiting_patient_acceptance`, token privado dirigido a conocido, acuse uniforme exista o no cuenta. Sin exigir publicación/admisión. |
| `awaiting_patient_acceptance` | Registrar/verificar/consultar / destinatario | Sigue pendiente: enlace/sesión no aceptan ni conceden expediente. |
| `awaiting_patient_acceptance` | Aceptar expresamente / destinatario verificado | `linked` junto al episodio y validaciones. Invitación expresa acuerdo del profesional; no añadir por defecto una segunda aceptación suya. |
| `awaiting_patient_acceptance` | Rechazar / destinatario verificado | `declined`, sin episodio. |
| `awaiting_patient_acceptance` | Retirar / profesional emisor | `revoked`, sin episodio. |
| `awaiting_patient_acceptance` | Vencer / servidor | `expired`, sin episodio. |

Estados, retirada, TTL y errores son propuestas. Token atado a destinatario, un uso, no aceptable por otra cuenta/contacto sin verificar. Evitar datos personales en URL y token en historial/referrer/telemetría; proponer canje por envío autenticado con redacción de logs. Entrega/canje pendientes D-03/D-09.

**No definir por accidente simultaneidad:** no aplicar cupo del paciente a invitaciones ni imponer una sola recibida. No decidir que aceptar una cancela las otras, que quedan reutilizables tras finalizar o que solicitud propia las invalida. Ante colisión solo un episodio vigente puede confirmar; las demás operaciones no abren otro y reciben resultado genérico. Destino terminal/pendiente, duración, cuotas y validez restante requieren AB-20 antes de habilitar. Integridad DB no resuelve esa política.

## 6. Concurrencia, atomicidad e idempotencia (D-05–D-07)

Protocolo candidato común a confirmación final y aceptación de invitación:

1. Autenticar con estado vigente/JWT de 002. Paciente desde cuenta, nunca body. Resolver metadatos del agregado con pertenencia autorizada antes de revelar información.
2. Abrir transacción. Orden común propuesto: cuentas participantes por ID estable, perfil profesional, identidad `patients`, agregado, idempotencia y episodio si corresponde. Cambios de contactos y otros escritores deben usar orden compatible probado; lectura preliminar no reemplaza relectura bloqueada.
3. Registrar/leer idempotencia por actor/operación/clave; comprobar huella. Revalidar agregado/versionado, destinatario, contactos verificados, aceptación pertinente y caducidad con reloj DB tras locks.
4. Revalidar cuenta/aprobación. Solicitud revalida flags conforme política de pendientes AB-18/19; invitación no exige flags públicos. Comprobar ausencia de active/paused y descartar responsabilidad legacy sin episodio: ausencia de `clinical_episodes` no prueba que legacy esté libre.
5. Insertar episodio `active`, inicialización propia NO EVALUADO/entrevista independiente según modelo aprobado, enlace al origen, evidencia y estado `linked` indivisiblemente. Sin sincronizar acceso legacy ni crear cita, nota, tarea, espera o copiar clínicos previos.
6. Guardar resultado mínimo de idempotencia/evento sin texto sensible. Si hay avisos, intención transaccional (outbox candidato) y entrega después del commit; fallo de entrega no crea otro episodio.
7. Commit y respuesta mínima propia. Un conflicto de unicidad de 003 revierte todo; error sin ID/estado/profesional del episodio competidor.

Lock por paciente serializa vías concurrentes; índice de pendientes protege cupo y 003 exclusividad aun ante escritor que incumpla protocolo. No finalizar responsabilidad existente para hacer espacio. Resolver cancelación vs confirmar, caducidad vs aceptar, suspensión/despublicación vs confirmar y cambio de contacto/recuperación vs aceptar. Gana commit coherente; la otra operación relee sin confirmar versión vieja. Éxito de aceptar solicitud no es éxito clínico.

Idempotencia propuesta en enviar, aceptar/confirmar, emitir/canjear invitación, cancelar y rechazar. Huella autenticada de entradas canónicas, referencia a resultado y vencimiento por aprobar. Misma clave con otro payload: conflicto; replay idéntico tras timeout: mismo resultado sin episodio/desafío/aviso duplicados. Reautorizar replay antes de devolverlo, también tras recuperación. No almacenar mensaje/token en registro ni usar hash simple de mensaje de baja entropía. Acordar duración, secreto y huella AB-22; reintentos limitados solo para fallos transitorios aprobados, no funcionales/de identidad.

## 7. Mensajes y prevención de abuso (D-08/D-09)

Mensaje como texto plano breve opcional, sin HTML/adjuntos; escape al renderizar y límite de bytes/caracteres antes de cifrar. No copiar a `patients.notes`, `reason_for_consultation`, entrevista, nota o resumen ni añadir chat por implicación. Longitud, edición posterior y conservación tras resolver requieren AB-22.

Lectura solo paciente autor y destinatario profesional activo/autorizado de la solicitud; permiso preclínico al mensaje no concede expediente. Backoffice sin contenido ni atajos por exportación, búsqueda, error, notificación o métrica. Avisos externos solo indican acción disponible y requieren sesión para leer. Denuncias/moderación necesitarían diseño aprobado separado de acceso mínimo; RN-27 no crea lectura clínica global.

**Historial/retención:** sin mensaje/secreto en `audit_logs.metadata`, logs de body, trazas, crash reports, analítica, idempotencia o tablas que 001 copie automáticamente. Evaluar payload cifrado separado, estado versionado sin texto y llaves fuera de DB con mínimo privilegio y copias cifradas. Verificar triggers concretos al diseñar sucesoras; cifrar no reemplaza control de duplicación. Retención/borrado/destrucción de llave, backups/restauración y ARCO requieren aprobación y revisión aplicable. No prometer borrado inmediato ni conservar por defecto como expediente.

Proponer cuotas combinadas por paciente/cuenta, pareja paciente-profesional, destinatario de invitación, red y costo del proveedor; ráfagas/ventanas sostenidas y consumo atómico compartido entre instancias. Cancelar/rechazar/caducar no borra contadores. 429 uniforme y datos de reintento solo seguros, sin cuotas de terceros. Cupo único no sustituye antiabuso.

Valorar cooldown por pareja tras rechazo y bloqueo de contacto con revisión, sin veto global de atención por un profesional. Limitar invitaciones repetidas, canje, registro y OTP contra acoso, cuentas múltiples y gasto. CAPTCHA adaptativo solo como propuesta con accesibilidad/privacidad/falsos positivos evaluados. AB-20 aprueba todos los números, ventanas, bloqueo, avisos y revisión/impugnación; sin bloqueo permanente ni frecuencia inventados por defecto.

## 8. Contratos API candidatos (D-10)

Operaciones siguientes NO son endpoints creados. Ruta/versionado exactos pendientes. DTO por allowlist: no reutilizar completos `mapUserRow`, `mapCareRelationshipRow` o `patientSelectColumns`. Rol no basta: titularidad, propósito y estado vigente.

| Operación candidata | Actor / entrada | Salida mínima y límites |
| --- | --- | --- |
| Directorio / detalle | Visitante; cursor acotado / ID público | Proyección aprobada; privado/inactivo/inexistente indistinguibles, sin pacientes/email. |
| Registrar paciente | Visitante; básicos y credencial | Estado propio/verificación, sin episodio/coincidencias. Respuesta uniforme y control de contacto AB-21. |
| Enviar/confirmar desafío | Cuenta propia; canal/propósito y código al confirmar | Estado propio; nunca preview/token remoto ni enumeración. |
| Consultar/editar identidad propia | Paciente; básicos aprobados | Solo propios y verificación; contacto cambiado invalida evidencia. Sin clínica asociada. |
| Consultar/editar perfil propio | Psicólogo titular activo; flags/versión/campos permitidos | Publicar solo aprobado; admin no publica por él ni cambia flags por DTO genérico. |
| Crear solicitud | Paciente autenticado/verificado; ID público, mensaje opcional, idempotencia | ID opaco, estado/versión/vencimiento; paciente de sesión, sin vínculos ajenos. |
| Listar/detallar solicitudes | Paciente titular / profesional destinatario | Estado/básicos mínimos propios; mensaje en detalle solo autorizado, sin texto en lista o terceros. |
| Aceptar/rechazar solicitud | Profesional destinatario; ID/versión/decisión/clave | Aceptar devuelve espera de confirmación, nunca expediente; sin motivo clínico administrativo. |
| Confirmar / cancelar | Paciente solicitante; ID/versión/acto explícito/clave | `linked` y episodio propio solo tras commit, o cancelación consistente; no `status=active` arbitrario. |
| Emitir invitación | Profesional activo/aprobado; contacto conocido/clave | Acuse uniforme exista o no cuenta; entrega privada, sin búsqueda global o estado ajeno. |
| Consultar/canjear/aceptar invitación | Destinatario autenticado; para aceptar, verificado; token/ID/versión/acto explícito | Emisor mínimo/estado propio tras validar destino; abrir/canjear no acepta ni revela otras invitaciones. |
| Listar emitidas / retirar | Profesional emisor; ID propio/versión | Estado mínimo de su invitación, sin existencia de cuenta/relaciones de terceros ni token reutilizable. |

Errores propuestos: 401 sesión inválida; 403 rol/operación; 404 agregado inexistente o ajeno indistinguibles; 409 versión/cupo/resolución/incompatibilidad segura; 429 cuotas; 503 entrega no configurada. Paciente puede conocer su estado propio, sin trasladar ese dato al profesional. Sin SQL/constraint/IDs ajenos/texto sensible reflejados. Códigos/mensajes y diferencia expirado/ajeno requieren aprobación y pruebas de inferencia.

No confiar en headers de rol/IDs del body o flags frontend. Preservar revocación de 002 y aprobación vigente en mutaciones. Comandos/JSON independientes de modales y deep links web para reutilizarlos en móvil futuro.

## 9. Rutas legacy y barrera de activación (D-06/D-10)

La [auditoría de mutaciones](stage2a-legacy-mutations.md) es el inventario canónico para B: rutas, funciones, auxiliares, SQL/scripts/fixtures, lectores laterales, clientes e impacto temporal. Incluye TODAS las cuentas y estados, no solo altas nuevas. Los bloqueos/adaptaciones son **PROPUESTOS y pendientes de aprobación funcional AB-23**, incluso tras aprobar A.

Se propone bloquear alta unilateral `POST /api/patients`, solicitud/invitación legacy, aceptación/rechazo y canje de códigos; preservar denegaciones administrativas #7 y operación clínica existente; adaptar básicos y registro. No se implementa aquí ni se afirma continuidad de las funciones propuestas para bloqueo. Resolver pendientes anteriores y experiencia de indisponibilidad antes de B; no convertirlos ni borrar accesos históricos automáticamente.

**Barrera verificable:** no habilitar episodio/expediente nuevo mientras lectores/escritores clínicos usen permisos solo por paciente o clínicos globales. 003 nullable no proporciona ese aislamiento. Verificar contactos no autoriza activar legacy. Futuro PR de permisos debe retirar fallback y coordinar propagación/lectores/escritores, incluidos agenda/notas/tareas/objetivos/disponibilidad/espera/series/recordatorios y derivados. B/C/D no activan ese modelo.

Sin atribución inequívoca, no inferir responsable/autor/DOB/verificación desde vínculo, edad, entrevista o contacto. Bloquear nuevas altas de menores por vías alternativas cuando se implemente el alcance aprobado; no reinterpretar pacientes históricos ni retirar atención por inferencia. No mantener bypass silencioso si no se aprueba el bloqueo: revisar alternativa antes de código.

## 10. Evolución posterior a 003 (D-11)

En A no se crean migraciones. El [plan de entregas](identity-directory-delivery-plan.md) estima 004 para identidad/verificación, 005 para cambios de contacto y 006 para perfiles/revisión. Cantidad, tablas y números finales pendientes. Solicitudes/invitaciones y contexto/permisos por episodio pertenecen a entregas posteriores, no a esas estimaciones por implicación.

El runner actual verifica versiones fijas y catálogo de 001–003. Evolución propuesta: validar huella previa, registrar sucesora/nueva huella y permitir verificar/repetir versión corriente sin confundir sucesora con deriva. No alterar checksum histórico, ignorar deriva, borrar registro o marcar versión sin validación. Conservar 001/002/003; runner/manifiesto solo se modifican con implementación autorizada y pruebas de upgrade/replay/fallo/compatibilidad.

Ensayos futuros en PostgreSQL nuevo aislado, fixtures ficticios, destino explícito y guardas. No ejecutar migraciones/schema/seed en la base habitual o bases existentes; no alterar contenedores/volúmenes existentes. Un despliegue real exige autorización separada, diagnóstico mínimo, respaldo/ensayo y coordinación de escritores. Git integrado no es despliegue. Recuperación propuesta mediante corrección aditiva conservando evidencia y revocaciones, sin borrar episodios ni reabrir fallback.

## 11. Pruebas automatizadas y demo ficticia (D-12 / ADR-019)

Requisitos de la futura 2A completa; no se crean suites ni ejecutan bases/contenedores en A. La cobertura exigible a cada PR B/C/D y su demo están en el [plan](identity-directory-delivery-plan.md); no se anticipan solicitudes/episodios. Usar los límites exactos aprobados de ADR-024, DOB adulta ADR-023, cambio de contacto ADR-025 y revisión/suspensión ADR-026/027.

| Área | Pruebas mínimas y resultado |
| --- | --- |
| Identidad/verificación | Alta sin episodio/acceso; correo/teléfono independientes; desafío vencido/usado/ajeno/contacto cambiado; concurrencia y cuotas; duplicado sin fusión; recuperación no revela otro consultorio. |
| Directorio/perfil | Anónimo solo ve público/aprobado/activo; privado/inexistente indistinguibles; flags independientes; público sin admisión puede invitar; DTO sin clínicos/contactos personales/notas administrativas de revisión. Retiro/caché y pendientes según política aprobada. |
| Estados | Cada arista válida/inválida por actor/versión; aceptar profesional no abre episodio; paciente confirma finalmente; sin mensaje/motivo obligatorio; terminal no reabre. |
| Cupo/caducidad | Dos creaciones a distintos destinatarios: solo una pendiente; confirmación ocupa cupo; cancelar/expirar libera sin resetear cuotas; worker caído, límite temporal y aceptación tardía. |
| Invitación | Sin cuenta previa, acuse uniforme y registro posterior; token ajeno/replay; abrir no acepta; simultaneidad/colisiones según AB-20 aprobado. |
| Atomicidad/idempotencia | Doble confirmación y replay; cancelación/caducidad/suspensión/contacto vs confirmar; dos vías simultáneas: máximo un vigente. Fallo entre inserción/enlace/evento/idempotencia revierte todo; reintento seguro. |
| Exclusividad/2B | Active/paused impide alta nueva sin cierre/transferencia ni filtración al profesional. Tras finalizado, nuevo ID cuando autorizado, sin herencia de contenido. |
| Permisos/API | IDOR, IDs/rol inyectados y cada ruta legacy/adaptador; pendientes y administradores sin clínica; episodio nuevo sin legacy/otros episodios. Cubrir agenda/notas/tareas/objetivos/disponibilidad/espera/series/recordatorios y derivados. |
| Mensajes/secretos | Solo partes autorizadas, render seguro y límites; sin texto/token en logs/audit/historial genérico/avisos/API pública/idempotencia/backoffice; retención/backup según aprobación. |
| Abuso | Cuotas atómicas multiinstancia; cancelar/rechazar/reenvío no elude; cuenta/red/destinatario, cooldown/revisión sin bloqueo indiscriminado de red compartida. Valores de verificación aprobados en ADR-024; límites adicionales AB-26 y los de solicitudes siguen pendientes. |
| Sucesoras/regresión | Upgrade sintético 001–003, checksums intactos, replay/deriva/fallo transaccional; invariantes/autoría/historia y JWT conservados; lint/build frontend y pruebas backend pertinentes. |

Demo propuesta: A/B aprobados, C pendiente y D suspendido; P sin cuenta al invitar, Q registrado sin vínculo, R no verificado, S con episodio pausado y T con histórico de otro profesional. Solo contactos `.invalid` y entrega simulada para demostrar verificaciones sin SMS/email reales ni secretos en API pública.

Recorridos con estado inicial, cuentas, URL local, pasos y resultado documentados:

1. Visitante ve A público/admite y B público/no admite; no C/D/privados. Cambio de flags demuestra independencia; sin sesión no solicita.
2. Q registra/verifica sin episodio y solicita A sin mensaje; A acepta sin expediente. Q confirma y entonces se abre episodio propio. Otra solicitud falla en ambas esperas.
3. B invita P pese a no admitir solicitudes públicas; P registra, verifica y acepta; cuenta distinta no canjea ni enlace concede clínica.
4. Cancelación/rechazo/caducidad liberan cupo según política, conservando contadores. Mensaje solo para partes; no backoffice/visitantes.
5. S no obtiene segundo responsable por estar pausado; T demuestra que vínculo nuevo no revela historia previa y archivo propio queda aislado cuando implementado. Carreras se prueban automáticamente además de UI.

Cada PR muestra solo alcance implementado: B de identidad/verificación no presenta solicitudes/episodios funcionales. Destino nuevo verificado development con UUID e imágenes/etiquetas propias conforme corrección #8; detenerse si existe o no es desarrollo. Sin copiar datos reales, compartir volúmenes, reutilizar etiquetas de app o autocargar cuentas en producción. Restablecer creando otro destino nuevo; limpieza solo de recursos propios comprobados, sin volúmenes/etiquetas ajenos o prune. Credenciales demo restringidas a ese destino. Procedimientos se autorizan/ejecutan con implementación, nunca en este PR.

## 12. Aprobaciones y siguiente implementación

La secuencia aprobada es [A→B→C→D](identity-directory-delivery-plan.md), con revisión/aprobación de A antes de iniciar B. Solo A está autorizado ahora; no crear ramas ni implementar B/C/D. Campos/defaults, métodos/límites y comportamiento de contactos/revisión/suspensión están aprobados en ADR-023–027; esquemas, endpoints, identificador, locks, normalización, retención y mecanismos no pasan a aprobados por aparecer aquí.

Antes de B, resolver AB-23 (matriz legacy e indisponibilidad explícita), AB-21/26 y decisiones técnicas aplicables. Antes de C, AB-25; antes de D, AB-18/24/27. AB-19/20 de solicitudes/invitaciones y permisos/segmentación por episodio corresponden a entregas posteriores. No exigir aprobar toda 2A para documentar o implementar una porción segura, ni usar esa porción para activar el resto.

## 13. Evidencia documental

PR #9 revisó 77 enlaces locales e intentó lint/build en WSL sin npm; es evidencia histórica, no validación de A. Su restricción a cinco Markdown no rige la reorganización expresamente autorizada ahora. Resultados nuevos, inventario y límites de PR A se registran en [documentation-audit.md](documentation-audit.md), sin afirmar que se ejecutaron pruebas funcionales o bases.
