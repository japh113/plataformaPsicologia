# Recursos individuales verificables por episodio

Actualización posterior a #48: [elegibilidad privada de notas individuales](private-note-read-eligibility.md) implementa revalidación transaccional acotada sin lectura operativa; esta página conserva su corte de entrega.

Base comprobada: main `ef5aa7c2a5aadd47997df0dd91197caaf7e0a9c2`, integración de [#47](https://github.com/japh113/plataformaPsicologia/pull/47). Los Issues [#30](https://github.com/japh113/plataformaPsicologia/issues/30), [#31](https://github.com/japh113/plataformaPsicologia/issues/31), [#35](https://github.com/japh113/plataformaPsicologia/issues/35), [#36](https://github.com/japh113/plataformaPsicologia/issues/36) y [#39](https://github.com/japh113/plataformaPsicologia/issues/39) fueron reconsultados y permanecen abiertos. Este incremento implementa únicamente resolución estructural privada y pruebas, sin cerrar esos contratos.

Se conservan [ADR-030/031](product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades), RN-27/28, [privacidad](patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo), [fundamentos 008](clinical-episodes-foundation.md#implementación-del-incremento-008--sin-activación) y la [matriz completa de transición legacy](episode-authorization-foundation.md#matriz-técnica-de-transición). AB-37 y D20 no se modifican.

## Fuente de verdad y contrato privado

[resolveEpisodeContext](../backend/src/modules/episodes/episode.context.js) verifica cabecera/CEP y llama a [resolveEpisodeResource](../backend/src/modules/episodes/episode.resource.js). El llamador interno selecciona solo `resource.type` e `id`; `episodeId,subjectPatientId,authorUserId,state,audience` del descriptor no se leen como prueba, ni siquiera mediante getters. El episodio solicitado es un parámetro separado y obligatorio para resolver recursos.

Las consultas literales forman una allowlist de cinco tipos, usan parámetros y filtran simultáneamente ID/episodio y correspondencia CEP/paciente/autor. No hay nombres de tabla del llamador, pool/env implícitos ni lectores de vínculos globales. Episodios e IDs BIGINT aceptan enteros positivos canónicos hasta 9223372036854775807, números seguros o bigint; se rechazan signos, ceros iniciales, objetos, coerciones y números redondeados. Los IDs de paciente/usuario son claves TEXT no vacías, conservadas sin inferencias.

| Tipo | Hechos leídos además del ID, episodio, sujeto y autor |
| --- | --- |
| appointment | Estado persistido pending/completed/cancelled/no_show |
| note | ID de cita; ningún texto, observación, objetivo, formato o historia |
| task | kind=task e ID de nota nullable |
| objective | kind=objective e ID de nota nullable; no intercambiable con task |
| waitlist | Solo los cuatro hechos comunes; sin prioridad/ranking, horarios, mensajes ni terceros |

Resultado congelado dentro del contexto privado: `verified:true,matchesEpisode:true` indican pertenencia estructural comprobada. `audience:null,audienceVerified:false` conservan la falta de evidencia de publicación/destinatarios. El estado de una nota no se inventa como draft/final; queda null. Tampoco se inventa un estado de tarea desde completed o retired_at. Identificadores y metadatos siguen siendo confidenciales: este objeto no es DTO, respuesta HTTP, registro de log ni autorización.

ID/tipo inválido, fila inexistente, otro episodio, legacy con episode_id NULL, kind incorrecto o respuesta duplicada/incoherente producen `resource:null`. La composición inconsistente produce `episode:null` y no consulta el recurso. Los fallos SQL y de ACL se propagan sin contexto ni fallback; un futuro llamador deberá manejar el error sin devolver detalles privados. Actor ausente/inactivo/administrativo no resuelve episodios ni recursos.

## Integridad SQL y responsabilidades del servicio

| Responsable | Invariantes |
| --- | --- |
| PostgreSQL 003/008 | Cabecera inmutable, CEP exacta/materializada, responsable con rol profesional, paciente/autor del recurso mediante FK compuestas; autor no NULL en filas atribuidas; identidad/autoría atribuida inmutable |
| PostgreSQL 003 | Nota/cita con mismo paciente y episode_scope_id; tarea/nota con mismo paciente y episode_scope_id. La clave generada equipara NULL solo con NULL y evita atribuciones parciales |
| PostgreSQL 001 | Cita completada no futura para nota, historia clínica conservada y protegida. El lector no accede a previous_record ni reinterpreta esa historia |
| Servicio privado | Validación de claves/tipo, episodio explícito, SELECT mínimo parametrizado, una única fila, comprobación de forma/composición, kind real, correspondencia con el contexto y resultado inmutable |
| Política/proyección | Sesión efectiva y estado técnico, ninguna concesión por autor/responsable/CEP; toda operación denegada antes de tocar contenido, IDs o derivados de la fila a proyectar |

No se duplican mediante consultas adicionales las FK de nota/cita/tarea: se seleccionan sus referencias y se prueba el rechazo SQL de ámbitos incompatibles con código 23503 y constraint concreta. Las inconsistencias sintéticas del driver se prueban aparte; no se presentan como filas válidas en PostgreSQL.

La cabecera y el recurso se leen en dos sentencias con el cliente explícito. 008 mantiene composición, responsable y atribución inmutables; este incremento no promete un permiso vigente entre lecturas ni frente a revocaciones. Antes de cualquier concesión futura deberá existir un contrato de transacción/revalidación para actor, estado, recurso/versión, destinatarios y consentimiento. No almacenar/reutilizar estos hechos como grants.

## P3 de estado profesional y barrera de acceso

[getUserById](../backend/src/modules/auth/auth.service.js) filtra is_active y mapea psychologist_approval_status a psychologistStatus; [authenticate](../backend/src/middlewares/authMiddleware.js) recarga el usuario DB, comprueba sesión y [ensureAccountCanAuthenticate](../backend/src/modules/auth/auth.account-status.js) exige active. La política ahora usa ese mismo active, sustituyendo approved. No se cambian enums ni etiquetas administrativas D20.

La prueba añadida en [auth.security.test.js](../backend/test/auth.security.test.js) utiliza el mapper getUserById y el middleware reales con DB simulada, incluso JWT con rol contradictorio. Cubre active, pending_review, rejected, suspended, approved inválido, null, cuenta inactiva y actor ausente. Demuestra que active alcanza las comprobaciones estructurales de la política y sigue recibiendo allowed:false. Es una prueba unitaria del contrato, separada de autenticación HTTP/PostgreSQL real de la suite existente.

[authorizeEpisodeOperation](../backend/src/modules/episodes/episode.policy.js) y [projectEpisodeResource](../backend/src/modules/episodes/episode.projections.js) siguen denegando read/list/create/update/delete/complete/activate y operaciones desconocidas. Ningún caller externo de producción importa los módulos privados. No se añaden endpoints, DTO, UI, flags, altas, admisión, activación, sesiones conjuntas, permisos de paciente/pareja/BO ni caminos alternativos de proyección. El fallback legacy y AB-23 quedan intactos.

## Pruebas y demo estructural reproducible

[Unitarias de recursos](../backend/test/episode-resources.test.js) y [matriz previa](../backend/test/episode-authorization.test.js): consultas simuladas, claims contradictorios/no leídos, autor distinto del actor, creador distinto del responsable, pareja con sujeto individual, audiencia sin verificar, prepared, IDs/tipos inválidos, duplicados/forma incoherente, ACL/consulta fallida y contexto congelado. Getters/proxies centinela prueban que denegar no lee ni enumera texto de notas, borradores de entrevista, contenido individual de pareja, objetivos profesionales, mensajes, IDs, agregados ni toJSON. Estos centinelas son sintéticos; no se afirma persistencia de contratos de audiencia/entrevista inexistentes.

Cinco casos nuevos de [episode-participants.cases.js](../backend/test/episode-participants.cases.js) ejecutan PostgreSQL real dentro del arnés existente, con base nueva por caso. Conservan los 36 casos estructurales anteriores y añaden:

1. Grafo individual cita→nota→tarea, objetivo independiente y espera; resolución de los cinco tipos con rol de prueba de permisos SELECT por columna que carece de permiso para texto clínico. Primero se comprueba el rechazo 42501 sin permisos de recurso.
2. Tres episodios del mismo paciente: dos con A y otro con B; un recurso de E1 no se resuelve en E2, aunque se repita profesional. Incluye espera ajena y claims falsos.
3. Pareja P–Q/A: ambos son participantes, la nota sigue teniendo sujeto P y una tarea propia tiene sujeto Q, sin audiencia recíproca ni publicación.
4. FK concreta de nota/cita y tarea/nota cruzadas, autor ajeno y paciente fuera de CEP. La cita del rechazo no tiene nota previa, evitando que UNIQUE enmascare la FK.
5. Recursos legacy con NULL y autoría desconocida, inexistentes e IDs inválidos, sin reatribución ni escritura reparadora.

Esta demo ficticia SQL automatizada (ADR-019) reside en los tests; no inicia HTTP sobre datos atribuidos. Los fixtures y demos B/C/D2 de regresión se ejecutan separadamente por CI. Para repetir únicamente en destinos nuevos autorizados:

```bash
python3 -B -m unittest discover -s scripts/ci -p 'test_*.py'
bash scripts/clinical-episodes.sh test
```

[Catálogo CI](../scripts/ci/episode-cases.json): se conservan las 19 etiquetas obligatorias previas y se añaden cinco, total 24 importadas y 41 pruebas de episodios contando la suite. No se cambia infraestructura, flags, versiones, workflow, siete checks ni retención de artifacts de 14 días. El arnés verifica UUID nuevo, DB tmpfs, red privada, cero puertos DB y cero volúmenes persistentes; limpia únicamente recursos propios y preserva los contenedores preexistentes.

## Evidencia de esta entrega y dependencias

Validación local inicial: 20/20 unitarias privadas de episodios con Node v25.9.0 ya instalado en Windows; 11/11 contratos offline CI en WSL, sin omisiones ni fallos. La primera ejecución de las nuevas aserciones confundía ::text con una columna text y se corrigió antes de obtener 20/20. Docker Desktop Linux no está disponible localmente; no se inició ni alteró el entorno habitual. No se presenta ejecución PostgreSQL local, prueba completa backend o navegador local. La primera ejecución [CI 41716662520](https://github.com/japh113/plataformaPsicologia/actions/runs/41716662520), HEAD 03c259c, aprobó backend/frontend/docs y 39/41 etiquetas de episodios; falló el caso de ACL y su suite contenedora porque la prueba negativa nombraba priority en vez de la columna real priority_position. Se corrigió esa consulta de prueba, sin cambiar SQL ni lector; el sandbox fallido también confirmó limpieza y preservación de recursos preexistentes. La validación completa y limpieza deben consultarse en la ejecución CI asociada al HEAD del Draft PR; las cifras de #47 conservan su corte histórico.

SQL/manifiesto/checksums 001–008, lockfiles y frontend se conservan. Sin migración habitual, merge, auto-merge ni despliegue. Permanecen pendientes concesiones verificables y revalidación transaccional, destinatarios/publicación/consentimiento/versiones por dominio, admisión y activación #31 con entrevista validada backend/DB, notas finales/adendas #35, transición coordinada de todo lector/escritor y retiro completo de fallback antes de habilitar permisos. AB-37 conserva su decisión pendiente para la capacidad correspondiente; no se crea una tabla universal de grants.
