# Etapa 2A — Identidad, directorio básico y vinculación inicial

**Actualización documental 2A, base `e15610289614c4e8eee03ac4fca875810d1439a3` (#43):** [ADR-031](product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades) amplía el flujo de entrevistas a dos modalidades. El [contrato de admisión](#admisión-clínica-y-entrevistas--contrato-objetivo) prevalece sobre candidatos que confundan preparación, consulta de admisión y tratamiento ordinario activo. Las propuestas D-01–D-12 siguientes no son las decisiones clínicas D01–D11 ni están aprobadas en bloque.

Estado operativo al 29 de octubre de 2026: base `main` `a1720245083008399a3543ca4b794ec4d1289d5a` (merge #27). A/B/C/D1/D2 y #25–#27 integrados; Issues #21–#23 cerrados. [Resumen vigente, backlog y cortes históricos](operational-status.md). D3, nuevas vinculaciones y activación/permisos por episodio pendientes. #19/#24 documentaron producto de pareja, sin implementar su motor. Integración en Git y pruebas aisladas no acreditan instalación ni despliegue habitual.

Base histórica del diseño: 18 de octubre de 2026, `0077f46` (#9 integrado); los contratos B/C y el estado posterior a #12 actualizan únicamente las porciones entregadas.

**Estado: diseño completo de 2A, mayoritariamente PROPUESTO; B/C implementan solo sus porciones autorizadas.** A integrado en #10 (0f2ebba), B en #11 (5e549f5), C en #12 (543442e), sin despliegue habitual acreditado. La [guía B](patient-identity-verification.md) y el contrato C definen lo implementado y prevalecen sobre candidatos antiguos. [Evidencia histórica B](patient-identity-validation.md).

AB-23 fue aprobado expresamente: alta unilateral y request/invite/respond/accept-code bloqueados para todas las cuentas, incluidos pendientes antiguos, sin sincronizar accesos. DOB posterior pendiente por confirmación del usuario; email vigente verificado antes de solicitar SMS. D1/D2 privados integrados en #17/#18; directorio público D3 y nuevas vinculaciones pendientes, con alcance y autorización propios requeridos para su implementación. ADR-029/RN-59–61 conservan precondición backend/DB pendiente antes de activar cualquier episodio nuevo.

## 1. Base existente y límites de confianza

| Evidencia inspeccionada | Estado actual y consecuencia |
| --- | --- |
| [auth.service.js](../backend/src/modules/auth/auth.service.js), `registerPatientUser` | B exige DOB adulta y teléfono internacional; inserta cuenta/paciente sin psicólogo, episodio o entrevista. Acuse 202 y login posterior; defaults legacy no constituyen riesgo evaluado o responsabilidad. |
| [schema.sql](../backend/sql/schema.sql), `users.patient_id` | Asociación única cuenta-paciente; `patients.id` sigue estable. Contactos duplicados en cuenta/paciente; DOB global nueva separada de entrevista. Autoridad y espejos legacy documentados en la guía B. |
| `psychologist_profiles` | Título, cédula, aprobación y notas de revisión; sin elección de publicación/admisión independientes. Aprobación `active` no significa episodio activo. |
| `listAvailablePsychologists` / `mapPsychologistDirectoryRow` | Lista autenticada de aprobados con email y sin opt-in. No es directorio público; no volverla anónima sin nueva proyección. |
| `requestCareRelationship`, `inviteCareRelationship`, `respondToCareRelationship`, `acceptCareRelationshipInvite` | B deniega todas esas mutaciones antes de DB; no sincroniza acceso. Pendientes históricos permanecen conservados, sin aceptar/rechazar/canjear. |
| [auth.permissions.js](../backend/src/modules/auth/auth.permissions.js), `buildPatientAccessScope` | Vínculo activo O `psychologist_patient_access`, filtrado por paciente. #7 excluye backoffice, pero falta autorización por episodio. |
| [003](../backend/sql/migrations/003_clinical_episode_foundation.sql) y [fundamentos](clinical-episodes-foundation.md) | Episodios independientes `active`/`paused`/`finalized`; índice `clinical_episodes_one_current_patient_idx` por paciente active/paused; atribución compuesta opcional e inmutable en citas/notas/tareas/espera. No autoriza clínicamente ni atribuye legacy. |
| [ejecutor](../backend/scripts/episode-migration.js) y [manifiesto](../backend/sql/migrations/manifest.json) | D2 reconoce 001–007 y targets 003/004/005/006/007 con huella previa/nueva, ledger, lock y transacción; archivos/checksums 001–003 intactos. |
| [auditoría](../backend/src/utils/audit.js) y preservación de 001 | Metadatos JSON e historial de filas. El filtro administrativo de #7 no protege un mensaje si primero se copia a auditoría/historial genéricos. |

La [evidencia de #8](clinical-episodes-validation.md) es histórica; no representa la ejecución de B; B aporta su propio reporte en destino nuevo aislado, sin consultar la base habitual. Tener 003 en Git no acredita instalación en un entorno.

## 2. Invariantes aprobadas y frontera con 2B/2C

**Actualización de producto ADR-030:** [tratamientos paralelos y pareja](parallel-couple-episodes.md) sustituyen exclusividad global, sin cambiar código/SQL ni activar flujos. Individual tiene un paciente; pareja dos registrados en un único tratamiento conjunto; un profesional por episodio. Participación, confidencialidad y entrevista de ambos necesitan diseño específico. Las alternativas D-01–D-12 siguen siendo propuestas y no un esquema aprobado de pareja.

- Registro independiente, correo/teléfono verificados y aceptación bilateral sin fusión automática. Sin motivo de consulta, CURP o documento universal obligatorio. Soporte excepcional no clínico conforme AB-13, con metodología pendiente.
- Perfil privado por defecto, publicación optativa solo del aprobado y recepción de nuevos pacientes independiente. Lectura anónima mínima; invitación directa independiente de admisión pública.
- Solicitud del paciente: aceptación profesional seguida de confirmación final. Una pendiente iniciada por él ocupa cupo en ambas esperas; cancelable y caducable. Mensaje opcional sensible fuera del directorio/auditoría administrativa.
- Invitación a conocido: admite registro posterior, exige verificación y aceptación expresa; sola no abre episodio. Invitaciones separadas, sin política definitiva de simultaneidad aprobada.
- Ningún pendiente concede expediente. Creación/activación transaccional con pertenencia, permisos y entrevista validada propios, sin revelar otros tratamientos. PostgreSQL 003 aún impide varios active/paused por paciente: protección histórica incompatible con ADR-030 que solo se evoluciona mediante transición segura autorizada.

Con episodio activo o pausado puede acordarse un tratamiento nuevo independiente: no exige ni inicia 2B, ni cierra, pausa o transfiere otros. Derivar un tratamiento específico sí usa 2B y conserva cierre de origen/apertura de destino, resumen y acuerdos correspondientes; no simular flujos aún ausentes. No revelar identidad/existencia de otros tratamientos por errores o elegibilidad. Regreso tras finalización requiere nuevo ID (RN-03); readmisión y prevención de duplicados requieren diseño D-06/D-10 y AB-34/37. El cupo inicial RN-37 permanece y no es exclusividad clínica.

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
| D-06 Confirmación | Serializable o locks + restricciones sucesoras por definir | Transacción, locks ordenados y revalidación de participantes, entrevista y permisos; revisar candidato ante ADR-030 | Deadlocks, duplicados, permisos legacy y cambios concurrentes de cuenta/aprobación | Protocolo, sucesora de 003, errores/reintentos y activación (AB-14/15/17/32/34) |
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

Desafío candidato: cuenta, canal, propósito, versión de contacto, digest de secreto, caducidad, intentos y consumo. Nunca código/token en auditoría ni preview remoto. Para códigos cortos, digest autenticado con secreto servidor y cuotas compartidas. Invalidar ante cambio de destino; reenvíos según política aprobada. Verificar email no verifica teléfono. Cambio de contacto invalida evidencia correspondiente; revocar todas las sesiones por session_version al confirmar cambio, incluida la actual (ADR-025), sin cerrar episodios. Vigencia de reautenticación y confirmación ya definidas en el contrato C; no siguen abiertas para su alcance.

Normalización consistente (sin equivalencias asumidas de puntos/alias email; país explícito en teléfono). Restricciones DB resuelven carreras de registro, no prueban identidad. No imponer teléfono único sin resolver números familiares/reciclados. Respuestas de alta/reenvío/recuperación sin enumeración, con tiempos razonablemente comparables. Sin fusión por coincidencia; revisión excepcional por soporte autorizado no clínico, auditada y con evidencia según AB-13. Si métodos pendientes, mantener reconciliación bloqueada.

### Parámetros de B implementados y cambios posteriores pendientes

ADR-024 fija email por enlace de 24 h, SMS por código de 10 min, espera de 60 s y máximo 5 envíos por destino en ventana de 24 h; SMS máximo 5 intentos por código. Nuevo desafío invalida anterior. B implementa cuotas transaccionales compartidas, HMAC, código SMS de seis dígitos y simulador privado, con pruebas entre procesos. Exigir email previo reduce abuso sin eliminar agotamiento deliberado de números compartidos. Retención/rotación y controles adicionales antes de producción siguen pendientes; no usar TTL legacy de invitaciones ni preview de reset como especificación.

ADR-025 exige contraseña reciente, aviso al contacto anterior sin veto, verificar nuevo e invalidar evidencia previa y todas las sesiones al confirmar. C ya separa candidato/vigente, confirma con incremento de session_version y usa avisos durables con entrega simulada al menos una vez. Preservar los límites de deadline, lease y limpieza del contrato C; proveedor real y recuperación excepcional siguen pendientes.

ADR-026/027 requieren versión aprobada separada de pendiente, revisión administrativa selectiva y retiro/reconfirmación pública. Proponer snapshot aprobado + propuesta versionada y decisión transaccional, sin permitir que edición directa de campos, registro profesional o review genérico publiquen pendientes. El DTO de cuenta actual contiene reviewNotes: no reutilizarlo públicamente. AB-24 aprueba catálogo general controlado y acreditaciones protegidas; AB-27 aprueba estado restringido en D2. La persistencia D1 y la API/gestión privadas D2 están integradas en #17/#18; [contrato D2](private-professional-management.md). API pública, publicación y flujos de D3 siguen pendientes (#28/#29).

### Agregados de vinculación (D-04)

| Entidad candidata | Datos mínimos sugeridos y límites |
| --- | --- |
| Solicitud inicial | ID opaco; paciente de sesión; profesional destinatario; estado/versión; creación/caducidad/resolución; aceptación profesional y confirmación final con actor/fecha/versión; mensaje privado opcional por referencia; relación con episodio/activación separada por diseñar. |
| Invitación profesional | ID opaco; emisor; contacto privado de entrega o cuenta verificada asociada posteriormente; digest de token aleatorio de alta entropía de un uso; estado/versión/fechas; aceptación del paciente; relación con episodio/activación separada por diseñar. No exigir cuenta al emitir. |
| Eventos | Agregado, transición, actor interno, instante y versión de condiciones. Sin mensaje, contacto, token o motivo libre; acceso restringido a participantes. No incorporarlos al feed administrativo. |
| Payload privado | Mensaje opcional cifrado y versión de llave; solo paciente autor/profesional destinatario autorizado. No es nota ni se copia al expediente. |
| Verificación/idempotencia | Datos mínimos por propósito, sin respuestas completas ni secretos en texto. Retención independiente de clínicos, pendiente AB-22. |

El candidato anterior de FK a un paciente global/profesional requiere revisión para representar participantes explícitos de pareja y comprobar su pertenencia sin romper autoría. Propuesta individual: máximo un episodio por origen y un origen inicial por episodio; no determina la representación conjunta ni la continuidad entre episodios derivados. Históricos sin backfill inventado. Participantes del agregado inmutables tras emitir; otro destinatario requiere nueva operación, con diseño conjunto pendiente. Timestamps servidor UTC con precisión acordada. Ninguna entidad o relación definitiva se aprueba o crea aquí.

## 5. Estados y transiciones candidatos (D-05)

### Solicitudes iniciadas por paciente

| Origen | Acción / actor | Destino y condiciones |
| --- | --- | --- |
| Sin pendiente | Solicitar / paciente autenticado y verificado | `awaiting_professional`; público/aprobado/admite, cupo libre, elegibilidad inicial y cuotas. Mensaje opcional. |
| `awaiting_professional` | Aceptar / profesional destinatario | `awaiting_patient_confirmation`; registra aceptación/versionado. Sin episodio ni permiso. |
| `awaiting_professional` | Rechazar / profesional destinatario | `rejected`; libera cupo, sin motivo clínico libre ni exposición administrativa. |
| Ambas esperas | Cancelar / paciente solicitante | `cancelled`; libera cupo sin borrar historia o contadores. |
| Ambas esperas | Vencer / servidor | `expired` si llegó plazo; libera cupo aunque worker se retrase. |
| `awaiting_patient_confirmation` | Confirmar / mismo paciente verificado | `linked` confirma vinculación, no activa episodio. Activación separada con RN-59–61, entrevista validada, participantes y permisos propios. Diseño conjunto pendiente. |
| Ambas esperas | Inhabilitar flujo / servidor | Candidato `closed_unavailable`, sin causa ajena detallada; condiciones requieren AB-18/19, no equivale a cambio 2B. |

Cupo DB ocupado por `awaiting_professional` y `awaiting_patient_confirmation`. Terminales: `linked`, `rejected`, `cancelled`, `expired` y, si se aprueba, `closed_unavailable`. Sin volver a pendiente ni reutilizar rechazo; nueva solicitud usa otro ID y cuotas. Aceptar solo desde primera espera y confirmar solo desde segunda. Reintentar o doble aceptar no extiende vida automáticamente.

Aprobar plazos de respuesta y confirmación, inicio de cada uno y cota de vida total; ningún valor está decidido. Recomendar no prolongar cota total por aceptación o cambios de flags. Evaluar reloj de pared de DB después de locks, no un instante congelado al iniciar transacción: al llegar al plazo, confirmar falla. Índice parcial sobre estados persistidos, sin predicado de reloj móvil. Worker materializa vencimientos y operaciones lo hacen también condicionalmente. Al crear, resolver pendientes ya vencidos del mismo paciente antes de comprobar unicidad. Worker no gobierna por sí solo validez. Al crear solicitud, adquirir el lock de identidad del paciente siguiendo el orden común, materializar vencidas y comprobar cupo/cuotas dentro de la misma transacción; el índice parcial arbitra inserciones concurrentes. Plazos y terminal ante inhabilitación siguen pendientes.

### Invitaciones profesionales

| Origen | Acción / actor | Destino propuesto |
| --- | --- | --- |
| Sin invitación | Emitir / profesional activo y aprobado | `awaiting_patient_acceptance`, token privado dirigido a conocido, acuse uniforme exista o no cuenta. Sin exigir publicación/admisión. |
| `awaiting_patient_acceptance` | Registrar/verificar/consultar / destinatario | Sigue pendiente: enlace/sesión no aceptan ni conceden expediente. |
| `awaiting_patient_acceptance` | Aceptar expresamente / destinatario verificado | `linked` de vinculación, sin activar episodio ni validar entrevista automáticamente. Invitación expresa acuerdo del profesional; no añadir por defecto una segunda aceptación suya. Activación separada con RN-59–61. |
| `awaiting_patient_acceptance` | Rechazar / destinatario verificado | `declined`, sin episodio. |
| `awaiting_patient_acceptance` | Retirar / profesional emisor | `revoked`, sin episodio. |
| `awaiting_patient_acceptance` | Vencer / servidor | `expired`, sin episodio. |

Estados, retirada, TTL y errores son propuestas. Token atado a destinatario, un uso, no aceptable por otra cuenta/contacto sin verificar. Evitar datos personales en URL y token en historial/referrer/telemetría; proponer canje por envío autenticado con redacción de logs. Entrega/canje pendientes D-03/D-09.

**No definir por accidente simultaneidad:** no aplicar cupo del paciente a invitaciones ni imponer una sola recibida. No decidir que aceptar una cancela las otras, que quedan reutilizables tras finalizar o que solicitud propia las invalida. ADR-030 permite tratamientos independientes paralelos; no usar una colisión de invitaciones como exclusividad clínica global. Duplicados, política conjunta, destino terminal/pendiente, duración, cuotas y validez requieren AB-20/34/37 antes de habilitar. Integridad DB no resuelve esas políticas.

## 6. Concurrencia, atomicidad e idempotencia (D-05–D-07)

Protocolo candidato de vinculación individual; activación es otra operación con RN-59–61. El candidato anterior que insertaba `active` al confirmar queda corregido: aceptación no valida entrevista. Extenderlo a pareja exige resolver participantes/entrevista/privacidad; no queda aprobado un protocolo definitivo:

1. Autenticar con estado vigente/JWT de 002. Paciente desde cuenta, nunca body. Resolver metadatos del agregado con pertenencia autorizada antes de revelar información.
2. Abrir transacción. Orden común propuesto: cuentas participantes por ID estable, perfil profesional, identidad `patients`, agregado, idempotencia y episodio si corresponde. Cambios de contactos y otros escritores deben usar orden compatible probado; lectura preliminar no reemplaza relectura bloqueada.
3. Registrar/leer idempotencia por actor/operación/clave; comprobar huella. Revalidar agregado/versionado, destinatario, contactos verificados, aceptación pertinente y caducidad con reloj DB tras locks.
4. Revalidar cuenta/aprobación. Solicitud revalida flags conforme política de pendientes AB-18/19; invitación no exige flags públicos. No exigir ausencia global de active/paused para tratamiento independiente. No interpretar ausencia de episodios como ausencia de acceso legacy: AB-23 y barrera de permisos siguen cerrados hasta transición completa.
5. Confirmar vinculación, evidencia y estado `linked` indivisiblemente, sin clínica ni activación automática. Diseñar aparte preparación/activación del episodio con entrevista completada y validada antes de cualquier `active`, riesgo propio NO EVALUADO, participantes y permisos comprobados. Sin sincronizar acceso legacy ni crear cita, nota, tarea, espera o copiar clínicos previos.
6. Guardar resultado mínimo de idempotencia/evento sin texto sensible. Si hay avisos, intención transaccional (outbox candidato) y entrega después del commit; fallo de entrega no crea otro episodio.
7. Commit y respuesta mínima propia. Conflictos de integridad revierten la operación, sin IDs/estados/profesionales ajenos. El índice de 003 no puede servir como garantía final de tratamientos paralelos: su sucesora necesita diseño y pruebas propios antes de activar.

Revisar orden de locks de participantes/agregados/episodios y restricciones sucesoras: serializar una identidad no equivale a imponer exclusividad global. Mantener cupo RN-37 separado de duplicados de operación/tratamiento, cuya política sigue pendiente. No finalizar atenciones para hacer espacio. Resolver cancelación vs confirmar, caducidad vs aceptar, suspensión/despublicación vs confirmar, cambios de contacto y consentimientos/confirmaciones parciales de pareja. La otra operación relee sin confirmar versión vieja. Éxito de aceptar solicitud no es éxito clínico.

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
| Confirmar / cancelar | Paciente solicitante; ID/versión/acto explícito/clave | `linked` de vinculación tras commit, o cancelación consistente; no activa ni valida entrevista. Participación conjunta por diseñar. |
| Emitir invitación | Profesional activo/aprobado; contacto conocido/clave | Acuse uniforme exista o no cuenta; entrega privada, sin búsqueda global o estado ajeno. |
| Consultar/canjear/aceptar invitación | Destinatario autenticado; para aceptar, verificado; token/ID/versión/acto explícito | Emisor mínimo/estado propio tras validar destino; abrir/canjear no acepta ni revela otras invitaciones. |
| Listar emitidas / retirar | Profesional emisor; ID propio/versión | Estado mínimo de su invitación, sin existencia de cuenta/relaciones de terceros ni token reutilizable. |

Errores propuestos: 401 sesión inválida; 403 rol/operación; 404 agregado inexistente o ajeno indistinguibles; 409 versión/cupo/resolución/incompatibilidad segura; 429 cuotas; 503 entrega no configurada. Paciente puede conocer su estado propio, sin trasladar ese dato al profesional. Sin SQL/constraint/IDs ajenos/texto sensible reflejados. Códigos/mensajes y diferencia expirado/ajeno requieren aprobación y pruebas de inferencia.

No confiar en headers de rol/IDs del body o flags frontend. Preservar revocación de 002 y aprobación vigente en mutaciones. Comandos/JSON independientes de modales y deep links web para reutilizarlos en móvil futuro.

## 9. Rutas legacy y barrera de activación (D-06/D-10)

La [auditoría de mutaciones](stage2a-legacy-mutations.md) fue revalidada contra base 0f2ebba y servicios de B. AB-23 está aprobado e implementado para todas las cuentas: cinco mutaciones bloqueadas; 403 administrativos preservados; identidad profesional adaptada por allowlist; lectores/fallback sin cambios. No se borran ni resuelven pendientes antiguos, ni se revoca acceso al rechazar una operación.

**Barrera verificable:** no habilitar episodio/expediente nuevo mientras lectores/escritores clínicos usen permisos solo por paciente o clínicos globales. 003 nullable no proporciona ese aislamiento. Verificar contactos no autoriza activar legacy. Futuro PR de permisos debe retirar fallback y coordinar propagación/lectores/escritores, incluidos agenda/notas/tareas/objetivos/disponibilidad/espera/series/recordatorios y derivados. B/C/D no activan ese modelo.

Sin atribución inequívoca, no inferir responsable/autor/DOB/verificación desde vínculo, edad, entrevista o contacto. Bloquear nuevas altas de menores por vías alternativas cuando se implemente el alcance aprobado; no reinterpretar pacientes históricos ni retirar atención por inferencia. No mantener bypass silencioso si no se aprueba el bloqueo: revisar alternativa antes de código.

## 10. Evolución posterior a 003 (D-11)

ADR-030 exige una sucesora para `clinical_episodes_one_current_patient_idx`, participantes explícitos, FK de pertenencia/autoría, autorización por episodio/participante/permiso y transición coordinada del fallback. El modelo actual de un `patient_id` no basta para pareja. Preservar profesionales e IDs históricos, sin inferir participantes o hacer backfills ambiguos. No se decide esquema definitivo ni se modifica SQL 001–007, manifiesto o hashes aquí. [Impacto y dependencias 2A/2B](parallel-couple-episodes.md#impacto-técnico-futuro-y-dependencias).

A no creó migraciones. B integró 004 para identidad/verificación y C integró 005 de contactos; 006 privada y 007 están integradas en D1/D2 en el [plan](identity-directory-delivery-plan.md). Solicitudes/invitaciones y contexto/permisos por episodio pertenecen a entregas posteriores, no a esas estimaciones por implicación.

El runner actual verifica 001–007, catálogo corriente y destino explícito, con targets 003/004/005/006/007. Protocolo implementado: validar huella previa, registrar sucesora/nueva huella y permitir verificar/repetir versión corriente sin confundir sucesora con deriva. No alterar checksum histórico, ignorar deriva, borrar registro o marcar versión sin validación. Conservar 001/002/003; runner/manifiesto solo se modifican con implementación autorizada y pruebas de upgrade/replay/fallo/compatibilidad.

Ensayos futuros en PostgreSQL nuevo aislado, fixtures ficticios, destino explícito y guardas. No ejecutar migraciones/schema/seed en la base habitual o bases existentes; no alterar contenedores/volúmenes existentes. Un despliegue real exige autorización separada, diagnóstico mínimo, respaldo/ensayo y coordinación de escritores. Git integrado no es despliegue. Recuperación propuesta mediante corrección aditiva conservando evidencia y revocaciones, sin borrar episodios ni reabrir fallback.

## 11. Pruebas automatizadas y demo ficticia (D-12 / ADR-019)

La tabla siguiente describe la futura 2A completa. A fue documental; B crea suites y demo solo de identidad/verificación y barrera legacy, con reporte propio. La cobertura exigible a cada PR B/C/D y su demo están en el [plan](identity-directory-delivery-plan.md); no se anticipan solicitudes/episodios. Usar los límites exactos aprobados de ADR-024, DOB adulta ADR-023, cambio de contacto ADR-025 y revisión/suspensión ADR-026/027.

| Área | Pruebas mínimas y resultado |
| --- | --- |
| Identidad/verificación | Alta sin episodio/acceso; correo/teléfono independientes; desafío vencido/usado/ajeno/contacto cambiado; concurrencia y cuotas; duplicado sin fusión; recuperación no revela otro consultorio. |
| Directorio/perfil | Anónimo solo ve público/aprobado/activo; privado/inexistente indistinguibles; flags independientes; público sin admisión puede invitar; DTO sin clínicos/contactos personales/notas administrativas de revisión. Retiro/caché y pendientes según política aprobada. |
| Estados | Cada arista válida/inválida por actor/versión; aceptar profesional no abre episodio; paciente confirma finalmente; sin mensaje/motivo obligatorio; terminal no reabre. |
| Cupo/caducidad | Dos creaciones a distintos destinatarios: solo una pendiente; confirmación ocupa cupo; cancelar/expirar libera sin resetear cuotas; worker caído, límite temporal y aceptación tardía. |
| Invitación | Sin cuenta previa, acuse uniforme y registro posterior; token ajeno/replay; abrir no acepta; simultaneidad/colisiones según AB-20 aprobado. |
| Atomicidad/idempotencia | Doble confirmación/replay; cancelación/caducidad/suspensión/contacto/consentimiento vs confirmar; sin duplicar operación ni acceso cruzado. Fallos revierten todo; reintento seguro. Carrera de derivaciones conserva cupo por paciente RN-19, sin afectar otros episodios; aplicación a pareja por diseñar. |
| Paralelos/pareja/2B | Individuales y pareja coexisten aislados; nuevo tratamiento no deriva/cierra otros. Derivar uno cierra origen/abre destino conservando los otros. Pareja requiere ambos, sin clínica por parciales; negativa no completa. Tras finalizado, nuevo ID sin herencia. Política de confidencialidad/duplicados por aprobar antes de sus regresiones definitivas. |
| Permisos/API | IDOR, IDs/rol inyectados y cada ruta legacy/adaptador; pendientes y administradores sin clínica; episodio nuevo sin legacy/otros episodios. Cubrir agenda/notas/tareas/objetivos/disponibilidad/espera/series/recordatorios y derivados. |
| Mensajes/secretos | Solo partes autorizadas, render seguro y límites; sin texto/token en logs/audit/historial genérico/avisos/API pública/idempotencia/backoffice; retención/backup según aprobación. |
| Abuso | Cuotas atómicas multiinstancia; cancelar/rechazar/reenvío no elude; cuenta/red/destinatario, cooldown/revisión sin bloqueo indiscriminado de red compartida. Valores de verificación aprobados en ADR-024; límites adicionales AB-26 y los de solicitudes siguen pendientes. |
| Sucesoras/regresión | Upgrade sintético 001–003, checksums intactos, replay/deriva/fallo transaccional; invariantes/autoría/historia y JWT conservados; lint/build frontend y pruebas backend pertinentes. |

Demo propuesta: A/B aprobados, C pendiente y D suspendido; P sin cuenta al invitar, Q registrado sin vínculo, R no verificado, S con episodio pausado y T con histórico de otro profesional. Solo contactos `.invalid` y entrega simulada para demostrar verificaciones sin SMS/email reales ni secretos en API pública.

Recorridos con estado inicial, cuentas, URL local, pasos y resultado documentados:

1. Visitante ve A público/admite y B público/no admite; no C/D/privados. Cambio de flags demuestra independencia; sin sesión no solicita.
2. Q registra/verifica sin episodio y solicita A sin mensaje; A acepta sin expediente. Q confirma vinculación; activar exige después entrevista propia validada y permisos seguros. Otra solicitud falla en ambas esperas por cupo inicial, no por tener otro episodio.
3. B invita P pese a no admitir solicitudes públicas; P registra, verifica y acepta; cuenta distinta no canjea ni enlace concede clínica.
4. Cancelación/rechazo/caducidad liberan cupo según política, conservando contadores. Mensaje solo para partes; no backoffice/visitantes.
5. S con episodio pausado puede iniciar tratamiento independiente sin derivarlo cuando se implemente la transición; T demuestra aislamiento de historia y archivo propio. Añadir Carlos/Ana, Carlos/Luis y Carlos/María/Laura simultáneos; derivar solo personal sin efecto en los otros y pareja con una confirmación insuficiente. Carreras se prueban automáticamente además de UI; pendientes de confidencialidad no se inventan en la demo.

Cada PR muestra solo alcance implementado: B de identidad/verificación no presenta solicitudes/episodios funcionales. Destino nuevo verificado development con UUID e imágenes/etiquetas propias conforme corrección #8; detenerse si existe o no es desarrollo. Sin copiar datos reales, compartir volúmenes, reutilizar etiquetas de app o autocargar cuentas en producción. Restablecer creando otro destino nuevo; limpieza solo de recursos propios comprobados, sin volúmenes/etiquetas ajenos o prune. Credenciales demo restringidas a ese destino. Los procedimientos requieren autorización específica de implementación y ensayos; leer este diseño no autoriza ejecutarlos.

## 12. Aprobaciones y siguiente implementación

La secuencia sigue A→B→C→D. A/B/C integrados; D1 persistencia y D2 gestión privada integrados; D3 pendiente. AB-23 resuelto para B, AB-25 para C y aspectos técnicos aplicables de AB-21/26 documentados en la guía. El endurecimiento multicuenta/red/costo antes de envíos reales sigue pendiente.

AB-18/24/27 aprobados; D1/D2 integrados con alcance privado y D3 requiere autorización propia; no reabrir AB-25 ya resuelto para C. AB-19/20 de nuevas solicitudes/invitaciones y segmentación por episodio corresponden a entregas posteriores. B/C no las habilitan.

## 13. Evidencia documental

PR #9 revisó 77 enlaces locales e intentó lint/build en WSL sin npm; es evidencia histórica, no validación de A. Su restricción a cinco Markdown no rige la reorganización expresamente autorizada ahora. Resultados nuevos, inventario y límites de PR A se registran en [documentation-audit.md](documentation-audit.md), sin afirmar que se ejecutaron pruebas funcionales o bases.

## Admisión clínica y entrevistas — Contrato objetivo

**Producto aprobado, implementación pendiente.** Fuente/precedencia: ADR-031; RN-59–61 y ADR-029 se mantienen íntegros. Esta sección es el detalle canónico de entrevistas/admisión para [#41](https://github.com/japh113/plataformaPsicologia/issues/41), coordinado con [#31](https://github.com/japh113/plataformaPsicologia/issues/31), [#30](https://github.com/japh113/plataformaPsicologia/issues/30) y [privacidad #39](patient-response-privacy.md#matriz-objetivo-por-episodio-participante-y-documento). No cierra esos Issues ni aprueba estados/rutas/SQL concretos.

### Dos modalidades y cuatro fronteras de permiso

1. **Identidad/vinculación:** registro y funciones personales independientes de entrevista. Solicitud/invitación o aceptación parcial no otorgan clínica. Vinculación completa tampoco activa tratamiento.
2. **Autoadministrada:** PAC responde en portal; guarda borrador privado y **envía explícitamente** la versión destinada al profesional autorizado para esa admisión. Guardar, abrir o cerrar formulario no envía ni valida. PSI nunca recibe el borrador no enviado, tampoco como vista previa, estado de progreso detallado, historial o respuesta de escritura. PAC consulta sus respuestas enviadas y conserva historia; en pareja cada integrante tiene entrevista propia y privada respecto del otro.
3. **Dirigida:** PSI realiza y documenta la entrevista durante una **primera consulta clínica de admisión**, con consentimientos aplicables y autorización clínica limitada a ese contexto/participante. Registrar profesional/participante, modalidad, fecha y procedencia; distinguir declaraciones de PAC y valoración PSI sin suplantar autoría. No es un formulario rellenado informalmente por el profesional ni un permiso de tratamiento ordinario. El documento profesional no se publica íntegro por llamarse entrevista: respuestas propias y valoración se proyectan separadamente conforme RN-25 y la matriz de privacidad.
4. **Activación ordinaria:** ambas modalidades necesitan validación profesional explícita, atribuida a episodio, participante y versión exacta. En pareja son necesarias las dos entrevistas y aceptaciones expresas. Verificaciones y demás precondiciones aplicables también siguen vigentes. Enviar, tener campos completos, asistir a admisión o registrar una nota no bastan para activar. Backend y DB deben impedir activación con validación ausente/ajena/obsoleta. No reutilizar entrevista o consentimiento de otro episodio, incluso con el mismo PSI.

La existencia de una consulta clínica de admisión antes de activación **no contradice** exigir entrevista validada antes de tratamiento ordinario; precisa el alcance de «primera consulta» de #41. Requiere una capacidad separada y limitada. El permiso de admisión no permite GET del expediente global del paciente, agenda de otros episodios, tareas u objetivos ordinarios, notas históricas ni acceso recíproco entre integrantes. Acceso indebido tampoco puede obtenerse mediante POST/PUT/PATCH o un JOIN lateral.

**Por concretar antes de implementar la modalidad dirigida:** acto que concede/revoca permiso, evidencia de consentimientos aplicables, documentos y datos mínimos autorizados, alcance de agenda/documentación de esa consulta, efecto de cancelación y conservación/lectura tras abandono. Una propuesta técnica acotada es asignación explícita al contexto de admisión con audiencia verificable, separada de `active`; sus tablas/estados/endpoints no están aprobados. No insertar un episodio ordinario activo provisional para sortear esta definición. No modificar retrospectivamente reglas nota↔cita del runtime: la documentación de admisión debe diseñarse sin convertirla en un bypass de cita completada/no futura.

### Condiciones funcionales y transiciones por especificar

La tabla usa descripciones funcionales; no enumera estados API definitivos ni agrega caducidades.

| Situación/acto | Lectura y escritura permitidas | Condición de avance o límite |
| --- | --- | --- |
| Solicitud/invitación pendiente | Partes ven mínimos del flujo y mensaje autorizado. | Sin expediente ni entrevista por la mera solicitud; asignación segura de admisión se especifica con #31. |
| Borrador autoadministrado | Solo PAC titular lee/escribe. | Envío requiere acto explícito a destinatario/contexto autorizado; no recepción PSI implícita. |
| Envío autoadministrado | PAC conserva consulta propia; PSI autorizado revisa versión recibida. | No edición silenciosa de respuesta PAC por PSI, ni activación automática. Correcciones deben conservar original/procedencia. |
| Consulta dirigida | PSI autorizado documenta actividad clínica real; audiencia según clase de dato. | Consentimientos, alcance limitado y trazabilidad anteriores; no depende de fingir tratamiento ordinario activo. |
| Revisión/corrección | PSI registra juicio de suficiencia propio y comunicación destinada separada de observaciones reservadas. | Cambio de versión antes de activar no hereda validación anterior. Mecanismo de corrección y errores por especificar, sin autoevaluación diagnóstica. |
| Validación explícita | Profesional responsable valida la versión del participante/episodio correspondiente. | Activar solo con todas las precondiciones backend/DB; parcial de pareja nunca basta. |
| Cancelación o abandono | Sin acceso nuevo por estado anterior; borrador sigue privado. | Retención y lectura profesional posterior requieren definición D07/D13. No borrar documentación clínica ni crear archivo perpetuo por inferencia. |

El runtime legacy sigue teniendo PUT único por paciente y primera escritura PAC/edición PSI; no tiene estas transiciones, borradores privados persistidos, plantillas o validación nueva. Sus reglas de edición conservadas en ADR-029 no se trasladan como permiso para sobrescribir envíos del nuevo flujo. Tampoco se reinterpretan filas legacy como versiones enviadas/finalizadas. RN-28/ADR-018 evitan construir convivencia/migración solo para salvar demos; esta tarea no toca ninguna base.

### Plantillas predefinidas y versión exacta

Acuerdo D11: plantillas predefinidas, personalización limitada de secciones/preguntas, sujetas a validación clínica. La entrevista enviada conserva exactamente la plantilla usada, preguntas, opciones, orden, versión y respuestas, con procedencia de modalidad/registrador; modificar plantilla no altera entrevistas recibidas. No usar versión histórica para validar automáticamente un episodio nuevo. La documentación dirigida también requiere trazabilidad y conservación de su versión, con valoración profesional separada de las respuestas propias.

Quedan por fijar con revisión clínica los mínimos protegidos, tipos admitidos, límites, opciones y accesibilidad antes de implementar los campos correspondientes. Propuesta técnica: referencia inmutable o snapshot verificable, sin decidir tablas. El editor avanzado de formularios queda fuera del MVP; lógica condicional avanzada, scoring diagnóstico, fórmulas, automatizaciones, adjuntos libres e integraciones no se aprueban por este acuerdo. La elección funcional de plantillas limitadas ya fue aportada por el propietario; no exigir otra investigación general GO/NO-GO para volver a decidirla. #41 conserva pendientes concretos de campos/validación, no autorización para un constructor general.

### Admisión abandonada D13

Se aprueba como intención funcional **condicionada a validación jurídica y clínica**: cierre administrativo tras 90 días sin actividad, con aviso previo; eliminación de borradores elegibles 30 días después del cierre. «Puede cerrarse» no aprueba un cron automático ni impone cierre de tratamiento activo. Es distinto de la caducidad de solicitudes RN-38 y de pausa/finalización RN-21/71.

Antes de implementar: definir actividad relevante, elegibilidad de borradores, aviso/canal y evidencia, alcance del cierre administrativo, custodia/conservación y derechos posteriores. No se inventan otros plazos. El borrador no enviado es privado; una entrevista dirigida es documentación profesional y un envío ya recibido no se trata como borrador desechable por defecto. Nunca eliminar registros de conservación obligatoria. No usar los 14 días de artifacts CI como plazo clínico ni ejecutar purgas sobre demo. Retención/automatización queda en entrega posterior específica y preparación de 5; privacidad/versionado de 2A pueden avanzar sin ese automatismo.
