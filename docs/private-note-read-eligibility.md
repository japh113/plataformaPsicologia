# Elegibilidad interna de lectura privada de notas individuales

Base verificada el 3 de noviembre de 2026: `origin/main` `3206b38a5d013d6682f9f4ee27c6d83cd67d8e3a`, merge [#48](https://github.com/japh113/plataformaPsicologia/pull/48). Los Issues [#30](https://github.com/japh113/plataformaPsicologia/issues/30), [#35](https://github.com/japh113/plataformaPsicologia/issues/35), [#36](https://github.com/japh113/plataformaPsicologia/issues/36) y [#39](https://github.com/japh113/plataformaPsicologia/issues/39) siguen abiertos. Este incremento no los resuelve.

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

**Decisión necesaria para ampliar este subconjunto:** aprobar una clasificación verificable por registro/documento, su procedencia, custodia, inmutabilidad/versionado y coordinación con futuras publicaciones/revocaciones; o aprobar explícitamente un contrato de tipo exclusivamente privado que haga imposible mezclar categorías. No se introduce persistencia adicional, tabla genérica de concesiones, nueva migración ni valor privado supuesto. La lectura operativa sigue bloqueada también por prepared y por la frontera pública.

## Revalidación y concurrencia

READ COMMITTED se elige expresamente: BEGIN por sí solo **no** aporta una instantánea estable. La garantía procede del lock de cuenta y de las invariantes 001/003/008, no de reutilizar un contexto anterior.

1. Verificar firma, contexto ordinario y sv del token antes de adquirir conexión. IDs inválidos, operaciones distintas de read y tokens inválidos no consultan DB.
2. BEGIN ISOLATION LEVEL READ COMMITTED; seleccionar de users solamente ID, rol, actividad y session_version con **FOR SHARE**. KEY SHARE no basta: permitiría una actualización no clave de session_version.
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

El lock exige SELECT de las columnas leídas y privilegio UPDATE en al menos una columna de users según PostgreSQL; las pruebas conceden únicamente UPDATE(session_version) a un rol efímero del sandbox. El evaluador no ejecuta UPDATE, reparaciones ni DDL. No se alteran privilegios del entorno habitual.

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

## Evidencia y dependencias de habilitación

Ejecución local nueva del 3 de noviembre de 2026: 11/11 contratos offline CI; arnés completo con 47/47 tests de episodios, 136/136 unitarias backend, 133/133 de integración y 64/64 frontend; lint/build aprobados. Cero fallos, cancelaciones u omisiones. El build conserva el aviso existente de bundle mayor de 500 kB. También pasaron 25/25 unitarias privadas sin dependencias con Node Windows v25.9.0.

Destino propio: proyecto Docker `psicopanel-episodes-4e87a099-f531-4041-87ab-ab32c7284710`, PostgreSQL 17 nuevo con tmpfs, red privada y sin puertos DB; bases UUID nuevas por caso. El wrapper verificó imágenes preexistentes intactas y eliminó únicamente contenedores, redes e imágenes propios. Después se verificaron cero contenedores/redes/volúmenes con la etiqueta del proyecto y el inventario de contenedores preexistentes idéntico al inicial. No se usaron bases, volúmenes ni servicios habituales.

La evidencia CI se registra en el Draft PR y en los resultados del HEAD exacto. Los informes #46–#48 conservan sus cortes históricos. No confundir pruebas sintéticas positivas, diagnóstico estructural real y acceso operativo inexistente.

Quedan pendientes audiencia verificable, autorización operativa y versión/proyección bajo transacción, estados y escritores clínicos compatibles, archivo propio, notas finales/adendas #35, admisión/entrevista validada backend/DB y retirada coordinada de **todos** los lectores/fallback legacy. No se reutiliza este evaluador desde pacientes, citas, tareas, espera o recordatorios. AB-23, privacidad #25, objetivos #26, seguimiento #27, backoffice y rutas HTTP actuales permanecen intactos. Se conservan SQL 001–008, manifiesto/hashes, frontend y lockfiles. Sin migración habitual, merge, auto-merge o despliegue.
