# Episodios paralelos, terapia de pareja y derivaciones independientes

## Estado y alcance

Decisión de producto aprobada por el propietario el 20 de octubre de 2026 y formalizada en [ADR-030](product/decisions.md#adr-030--episodios-paralelos-pareja-y-derivación-por-tratamiento), con reglas RN-62–73 en [business-rules.md](product/business-rules.md). Base de la formalización anterior: `main` `fcabf5245d889f700804ec6d1b9f48043fd30fc0`, merge de [D2 / #18](https://github.com/japh113/plataformaPsicologia/pull/18). La consolidación clínica del 28 de octubre de 2026 parte de `main` `021c12e2481a3a2c4f74b65a37e468c28634bc92` y conserva la [evidencia anónima de ambos cuestionarios](couple-clinical-evidence.md). Este encargo es exclusivamente documental, en rama independiente y Draft PR sin merge ni auto-merge; no desarrolla Issues #21, #22 o #23.

**Aprobado no equivale a implementado.** La aplicación conserva autorización legacy por paciente; 003 conserva su índice de exclusividad donde esté instalada. AB-23, ADR-029/RN-59–61, JWT y las protecciones existentes permanecen intactos. D2 integrado no acredita despliegue habitual ni activa D3, directorio, vinculaciones o permisos por episodio. No se ejecutan manualmente SQL, pruebas funcionales, demos, migraciones ni operaciones sobre recursos habituales en este encargo. La CI autorizada conserva su matriz completa en runners nuevos, siete checks y artifacts técnicos de 14 días; sus resultados no acreditan implementación de pareja.

## Tratamiento e identidad del episodio

**Precedencia de la consolidación 2A (base #43):** [ADR-031](product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades) precisa RN-67/69/71 mediante los acuerdos del propietario. El [inventario y matriz canónicos](patient-response-privacy.md#matriz-objetivo-por-episodio-participante-y-documento) concretan entrevistas privadas por integrante, documentos completos con audiencia, metadatos restringidos y tareas conjuntas con seguimiento independiente. La [admisión](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo) admite ambas modalidades, siempre con validación profesional previa a activación ordinaria.

D17 amplía lo que la entrega anterior dejaba fuera: quien permanece puede solicitar episodio individual **nuevo**, incluso con el mismo profesional únicamente si es ética y clínicamente apropiado. No convierte automáticamente el conjunto ni copia información, permisos o consentimientos. D16 exige encuadre de confidencialidad comprensible y manejo profesional de revelaciones/seguridad sin avisos que las divulguen; validación clínica/jurídica pendiente. No resuelve por inferencia pausados AB-37, procedimiento de retiro ni publicación de material privado. Los cortes históricos siguientes se leen con esta precisión, sin alterar su evidencia ni afirmar implementación.

Un paciente global puede participar en varios tratamientos simultáneos, activos o pausados, con distintos profesionales. La existencia de uno no bloquea automáticamente otros. Cada episodio tiene identidad clínica, contexto, participantes explícitos, permisos, notas, citas, tareas, antecedentes, estado y ciclo de vida propios; un único psicólogo responsable por episodio.

| Modalidad aprobada | Participantes y alcance |
| --- | --- |
| Individual | Un paciente registrado y un psicólogo responsable; contexto clínico propio. |
| Pareja | Exactamente dos pacientes registrados y un psicólogo responsable; un tratamiento conjunto con identidad clínica propia, consentimiento, confidencialidad y participación específicos. No representarlo artificialmente mediante dos episodios individuales. |

Carlos puede tener terapia personal con Ana, sexología con Luis y terapia de pareja con María y Laura al mismo tiempo. Carlos y María pueden mantener tratamientos individuales con otros profesionales sin duplicar sus cuentas. No se permiten dos episodios conjuntos activos simultáneos para la misma pareja, aunque cambien profesional, objetivos u orden de sus participantes (AB-37/RN-73). Los tres profesionales rechazaron dos terapias de pareja simultáneas de la misma dupla; la restricción de producto fue aprobada expresamente por el propietario. El caso de episodios pausados requiere especificación antes de implementar el mecanismo; no se limita la atención individual independiente. No están aprobados terapia familiar de tres o más participantes, terapia grupal, varios psicólogos corresponsables simultáneos, acceso irrestricto entre participantes ni compartición automática de antecedentes.

**Vinculación independiente:** abrir un tratamiento nuevo no es derivar otro. No exige ni inicia automáticamente derivación; tampoco cancela, modifica, pausa o finaliza atenciones previas. Se mantienen verificaciones, aceptaciones pertinentes y activación separada con entrevista propia validada. El cupo de solicitud inicial de RN-37/ADR-022 sigue vigente; no es exclusividad de tratamientos. Su adaptación operativa a solicitudes conjuntas requiere diseño, sin habilitar ahora ningún flujo.

**Derivación de un tratamiento:** conserva las dos vías de ADR-003/RN-04–07/18–20. La profesional exige iniciativa de A, aceptación del paciente y de B, resumen obligatorio revisable y aprobación de su versión exacta. La directa del paciente exige identidad verificada y aceptación de B, sin consentimiento ni resumen obligatorio de A. A continúa responsable del episodio de origen hasta completar el cambio atómico. Se conserva solicitud única pendiente y cancelable por paciente (RN-19), identificando el tratamiento derivado: el efecto del cambio no altera otros. El cupo no es exclusividad clínica ni obliga a derivar al abrir tratamiento independiente. Su aplicación a pareja requiere diseño; no se amplía por inferencia.

La continuidad lógica del tratamiento no convierte al episodio en un registro reasignable. RN-03, ADR-006 y el requisito funcional de ADR-008 conservan cierre del origen y apertura de un episodio nuevo para el destino, incluido A→B→A. Nunca cambiar retrospectivamente `psychologist_user_id`, reutilizar finalizados ni mover automáticamente citas, notas o autoría. No se decide aquí cómo representar técnicamente esa continuidad entre IDs.

Si Carlos deriva su terapia personal de Ana a Roberto, sexología con Luis y pareja con Laura permanecen intactas. María no interviene en esa derivación individual; Roberto no obtiene acceso a esos otros episodios. Si Carlos inicia terapia nueva con Roberto, no hay derivación de Ana. La cancelación confirmada de futuras citas de RN-20/ADR-014 afecta solo al tratamiento derivado; no traslada agenda al destino ni afecta otras atenciones. Pausa, reanudación y cierre se delimitan al episodio: las reglas individuales vigentes se conservan; desacuerdos de pareja no se resuelven por extensión unilateral de RN-21.

## Participación, sesiones y ciclo de pareja

Ambos pacientes aceptan expresamente el tratamiento y tienen entrevista inicial propia; el objetivo terapéutico es conjunto. El psicólogo responsable valida explícitamente completitud y suficiencia de las entrevistas antes de activar, sin sustituir ADR-029/RN-59–61 por aceptaciones, una entrevista anterior o una marca automática. Presentación, atribución y precondición backend/DB siguen pendientes (AB-32/RN-69).

El episodio admite sesiones conjuntas e individuales, diferenciadas en agenda y notas, sin orden ni frecuencia fijos y sin imponer cuatro visitas obligatorias. La elección depende del caso y del criterio profesional. Las respuestas clínicas difieren sobre continuidad individual y sobre atender individualmente cuando falta un integrante; no se convierten en una regla universal.

Una inasistencia aislada no equivale a abandono: **no convierte automáticamente la sesión conjunta en individual ni provoca la finalización automática del episodio**. El profesional valora y documenta si corresponde reagendar o realizar una sesión individual según el caso, acuerdos terapéuticos y etapa del proceso. Agenda, atribución y procedimiento de inasistencias pendientes (AB-35/RN-70); se conservan las reglas actuales de citas, notas, disponibilidad y espera.

La participación es voluntaria y nadie puede ser obligado a continuar contra su voluntad. El abandono definitivo de uno impide continuar normalmente el episodio conjunto. Distinguirlo de pausa temporal, finalización definitiva e inasistencia; el profesional gestiona y documenta las decisiones clínicas y operativas preservando historial, autoría y datos. Confirmaciones, transiciones, avisos y resolución de futuras citas pendientes (AB-28/29/RN-71), sin extrapolar el procedimiento unilateral de terapia individual ni crear cierre automático.

La conversión a terapia individual con el mismo profesional tras cerrar pareja queda fuera del diseño de esta entrega. No se declara universalmente prohibida ni jurídicamente resuelta; las diferencias clínicas se conservan en la evidencia. La mención de infidelidad activa puede motivar valoración profesional, sin automatismo de continuidad o divulgación.

## Derivación conjunta y confidencialidad

Derivar la terapia de Carlos y María de Laura a Roberto requiere confirmación expresa de **ambos pacientes**, además de las confirmaciones profesionales correspondientes a la vía existente, resumen revisable y aprobación exacta cuando esa vía lo exige. La ampliación a pareja no elimina requisitos ni crea una tercera vía. Una confirmación parcial no completa la derivación ni concede acceso clínico anticipado. Si uno no acepta, no se completa; la resolución posterior queda pendiente. No se presume consentimiento por silencio, plazos, mayoría o autorización unilateral. Los demás tratamientos de ambos permanecen intactos.

Confirmar derivación, aprobar el resumen y autorizar antecedentes adicionales siguen siendo actos separados. Negar antecedentes adicionales no bloquea por sí solo la vía con resumen aprobado y demás condiciones cumplidas. No hay herencia de consentimientos ni acceso a tratamientos ajenos. La política exacta de revisión del resumen conjunto y de autorizaciones sobre aportaciones individuales requiere diseño de confidencialidad; no se presupone divulgación por pertenecer a la pareja.

| Ámbito que debe distinguir el diseño | Límite aprobado |
| --- | --- |
| Información del tratamiento conjunto | Ambos consultan tareas compartidas, objetivos y resúmenes aprobados para ambos; participar no concede lectura indiscriminada de todo el episodio. |
| Información aportada individualmente | No se publica automáticamente ni se vuelve visible al otro por pertenecer a la pareja. Ningún integrante recibe automáticamente notas profesionales, incluidos secretos o revelaciones individuales. |
| Comunicaciones privadas | Sin acceso compartido automático. Una comunicación o revelación deliberada en sesión depende del criterio profesional, sin automatismo de la plataforma. |
| Consentimientos y autorizaciones | Identificar actor, propósito y alcance; confirmación conjunta de derivación no autoriza por sí sola antecedentes adicionales. |
| Acceso del profesional responsable | Puede registrar y consultar información clínica de su episodio, según permiso concreto; no por identidad global del paciente ni con acceso a otras atenciones. |
| Portal de cada participante | Seguimiento expresamente destinado a él y sus tareas individuales autorizadas; contenido compartido aprobado para ambos según la primera fila, sin acceso cruzado implícito. |
| Derechos de acceso a datos | Procedimiento legal/ARCO separado, sujeto a revisión AB-36. Privacidad del portal ordinario no es denegación absoluta de derechos ni veto del profesional. |

La privacidad ordinaria anterior está aprobada (RN-67/AB-30/31); excepciones, criterios de publicación, DTO/API y aplicación de permisos requieren diseño. Las discrepancias clínicas sobre consulta de revelaciones reservadas por su autor permanecen en la evidencia; no generan entrega automática de notas ni una prohibición legal de acceso. No basta incorporar dos IDs para declarar implementados consentimiento o privacidad. AB-36 sigue pendiente: ni el comentario COFEPRIS ni las restricciones de entrega de expedientes expresadas por entrevistados son conclusiones jurídicas.

Solo el psicólogo responsable determina el cumplimiento de objetivos; el paciente únicamente consulta objetivos/progreso, sin evaluación ni autopercepción de cumplimiento. Puede marcar sus tareas asignadas como realizadas. Conservar exactamente los estados actuales de objetivos, sin añadir otros ([Issue #22](https://github.com/japh113/plataformaPsicologia/issues/22), RN-72). Es producto aprobado con corrección técnica pendiente; no se implementa aquí ni se modifica la privacidad efectiva.

## Invariantes de privacidad

- Identidad global estable y participación explícita; no duplicar cuentas arbitrariamente ni inferir participantes desde vínculos, contactos, entrevistas o registros legacy.
- Autorización por episodio, participante y permiso concreto. Atender a un paciente no abre sus otros tratamientos; una derivación tampoco los enumera ni revela por errores, listados, conteos o metadatos.
- Solicitudes pendientes y confirmaciones parciales sin acceso clínico; consentimientos y permisos no heredados entre tratamientos ni profesionales.
- Autoría histórica preservada y archivo propio según ADR-005; ni recibir un resumen ni antecedentes concede edición o autoría sobre registros ajenos.
- `support`, `admin` y `superadmin` sin clínica global ordinaria, exportación ni alteración clínica por su rol; sin emergencia implícita (RN-27).
- Entrevista inicial propia completada y validada expresamente por el profesional antes de toda activación nueva, con precondición futura backend/DB (ADR-029/RN-59–61). Ambos tienen entrevista propia y aceptación expresa aprobadas; representación, atribución y garantía técnica de esa validación siguen abiertas (AB-32).

## Trazabilidad de reglas sustituidas y conservadas

Los textos históricos de ADR-002/006 se conservan identificados. Las reglas efectivas se actualizan con referencias a ADR-030; la sustitución es parcial y no vuelve errónea la evidencia histórica de 003.

| Fuente histórica | Regla anterior o contexto | Política efectiva y parte conservada |
| --- | --- | --- |
| ADR-002 / RN-02 | Máximo un responsable vigente por paciente, contando activo y pausado | Sustituida solo la exclusividad global por RN-62; un responsable por episodio. Ciclo individual, historia y retorno con ID nuevo se conservan. Pareja tiene pendientes propios. |
| ADR-006 / ADR-009 | Episodio de un paciente/profesional e índice único parcial por paciente | Contrato histórico y SQL 003 intactos. Evolución futura para participantes y coexistencia; identidad inmutable, terminalidad, integridad y no backfill preservados. |
| RN-03 / ADR-008 | Cambio cierra origen y abre destino atómicamente; mecanismo de locks propuesto | Semántica conservada por tratamiento, sin reasignar el episodio original. Continuidad lógica no altera identidad ni autoría. Concurrencia se debe rediseñar; mecanismo no implementado. |
| ADR-012 / RN-16 | Si hay episodio vigente, usar cambio, nunca segundo responsable | Sustituido el bloqueo de tratamiento independiente; cuentas, verificación y confirmaciones se conservan. Derivar un tratamiento concreto sigue su flujo. |
| ADR-020 / ADR-021 / RN-40 | Directorio sin clínica; vinculación inicial impedida por episodio vigente | Directorio y pendientes siguen sin conceder clínica; RN-63 permite vinculación independiente como producto, con permisos seguros y entrevista previos a activación. Implementación pendiente. |
| ADR-022 / RN-37–39 | Cupo único inicial del paciente e invitaciones separadas; exclusividad de episodio | Solo se sustituye exclusividad clínica. Cupo inicial, cancelación/caducidad y antiabuso se conservan; solicitudes conjuntas y simultaneidad de invitaciones pendientes. |
| ADR-003 / RN-05 / RN-18–20 | Dos vías, origen responsable hasta cambio, solicitud única por paciente, aviso/cancelación de futuras | Dos vías y cupo pendiente por paciente conservados; cada solicitud identifica tratamiento y solo su agenda/episodio cambia. Aplicación conjunta por diseñar sin ampliar cupo. RN-64 impide afectar otros. |
| ADR-002 / RN-21 / ADR-014 | Pausa/reanudación/cierre y resolución de futuras | Se conservan para individual, por episodio. Pareja tiene voluntariedad y abandono definidos en RN-71; procedimiento AB-28/29 pendiente, sin extrapolar unilateralidad individual. No se relajan reglas actuales de citas. |
| ADR-004/005/011/016/017 / RN-06–15/23–27 | Alcance autorizado, archivo, no herencia, datos por episodio y backoffice separado | Se conservan. Pareja no implica acceso automático a aportaciones individuales; privacidad ordinaria RN-67 aprobada, mecanismos detallados pendientes. |
| ADR-029 / RN-59–61 / AB-23 | Entrevista validada previa, autonomía de cuenta, no reinterpretación legacy y nuevas vinculaciones bloqueadas | Íntegros, sin debilitamiento ni activación. RN-65 añade confirmación de ambos para derivar pareja, sin sustituir entrevista ni permisos. |

## Impacto técnico futuro y dependencias

La inspección de [003](../backend/sql/migrations/003_clinical_episode_foundation.sql) confirma `clinical_episodes_one_current_patient_idx` sobre `patient_id` para `status IN ('active', 'paused')`. Impide tratamientos paralelos y es incompatible con la nueva política de producto. La tabla actual exige un `patient_id`, un `psychologist_user_id` y claves compuestas de pertenencia/autoría; el trigger protege su identidad. No representa aún pareja. Ver [arquitectura actual](architecture.md) y [fundamentos 003](clinical-episodes-foundation.md).

Una futura implementación autorizada deberá:

1. Evolucionar la restricción mediante migración sucesora, conservando SQL 001–007, manifiesto y hashes históricos; no retirar una protección efectiva sin sustitución segura.
2. Representar participantes explícitos y conservar identidad histórica de episodios/profesionales. Impedir dos episodios conjuntos activos de la misma pareja aunque se invierta su orden; especificar pausados antes de implementar, sin reintroducir exclusividad global por paciente (AB-34/37). No se aprueba aquí tabla, índice, relación ni esquema definitivo.
3. Ajustar FK y comprobaciones de pertenencia, nota/cita/tarea y autoría sin perder integridad ni permitir atribuciones parciales o cruzadas.
4. Autorizar por episodio, participante y permiso, incluidos lectores laterales y derivados de notas, citas, tareas, antecedentes, espera, disponibilidad y recordatorios.
5. Adaptar vinculaciones, invitaciones y solicitudes a tratamientos nuevos independientes, sin activar AB-23 ni forzar derivación/cierre para hacer espacio.
6. Adaptar derivaciones, pausa, reanudación y cierre al tratamiento correspondiente; cierre de origen/apertura de destino sin alterar los otros episodios.
7. Proteger carreras, reintentos y operaciones concurrentes, incluidas dobles confirmaciones, cambios de consentimiento y decisiones conjuntas parciales.
8. Planificar transición coordinada de todos los lectores/escritores y retirada completa del fallback legacy; la autorización actual por paciente no aísla tratamientos.
9. Mantener entrevista inicial y validación profesional previa a toda activación, incluida la futura pareja, sin entrevistas ficticias o validaciones inferidas.
10. Preservar datos históricos sin backfills ambiguos ni participantes deducidos; coordinar versiones, compatibilidad y rollout por entorno autorizado.
11. Diseñar regresiones de aislamiento, consentimiento, confidencialidad, integridad y concurrencia, con fixtures nuevos aislados y demo ADR-019 cuando se implemente.

**2A** debe resolver identidad global, participantes, tratamientos paralelos, vinculación independiente, entrevista por tratamiento, permisos/privacidad, evolución PostgreSQL y compatibilidad histórica. **2B** depende de esos fundamentos para derivaciones por tratamiento, confirmación conjunta, resumen/consentimiento vigentes, agenda, pausa/cierre e historia sin afectar otras atenciones. 2C conserva antecedentes adicionales/revocación; 2D amplía concurrencia sin posponer la atomicidad mínima de 2A/2B. No se mueven entregas ni se aprueba calendario. Véase [roadmap](product/roadmap.md).

## Principios aprobados y mecanismos pendientes

La [matriz canónica AB-28–37](product/decisions.md#asuntos-abiertos-y-momento-de-resolución) distingue principio aprobado, mecanismo pendiente y validación jurídica; no son diez preguntas de producto sin resolver.

| ID | Principio aprobado o estado | Pendiente bloqueante |
| --- | --- | --- |
| AB-28 | Abandono definitivo impide continuidad normal conjunta; ausencia aislada no es abandono | Confirmaciones, transiciones y agenda 2A/2B |
| AB-29 | Voluntariedad; distinguir pausa temporal, cierre definitivo e inasistencia | Procedimiento, avisos y transiciones 2B |
| AB-30 | Privacidad ordinaria definida en RN-67 | Excepciones, publicación y derechos de acceso; 2A/2B/2C y AB-36 |
| AB-31 | Visibilidad básica por participante definida | DTO/API y permisos 2A |
| AB-32 | Entrevista propia de ambos, aceptación expresa y objetivo conjunto; ADR-029 intacta | Representación y validación técnica backend/DB 2A |
| AB-33 | Una negativa impide completar derivación; parciales sin acceso | Alternativas y resolución posterior 2B |
| AB-34 | Prevención de duplicados/concurrencia todavía abierta | Mecanismo 2A compatible con RN-73 |
| AB-35 | Sesiones conjuntas/individuales; ausencia sin conversión ni cierre automáticos | Agenda, inasistencias y atribución 2A/2B/2D |
| AB-36 | Revisión jurídica mexicana pendiente | Consentimiento, confidencialidad, datos, entrega de expedientes y ARCO; sin conclusión normativa |
| AB-37 | Producto resuelto: prohibir dos conjuntos activos simultáneos para la misma pareja | Semántica de pausados y mecanismo técnico antes de implementar 2A |

Los principios aprobados no cierran los mecanismos. Ninguna respuesta clínica resuelve AB-36 ni autoriza desarrollar episodios, permisos, Issues #21–23 o D3.

## Escenarios de aceptación futura

1. Carlos y María mantienen pareja con Laura; Carlos puede tener terapia individual con Ana y María con otro profesional, sin acceso cruzado ni derivación automática.
2. La misma pareja solicita otro episodio conjunto activo con Roberto, con objetivos distintos o participantes en orden inverso: no permitirlo. El diseño de pausados queda pendiente; no se resuelve imponiendo la antigua exclusividad global.
3. María falta a una cita conjunta: sin conversión automática a individual para Carlos ni cierre del episodio. Laura valora y documenta la decisión clínica; ausencia aislada no prueba abandono.
4. Un integrante comunica abandono definitivo: nadie puede obligarlo a continuar, ni seguir normalmente el conjunto. El procedimiento exacto de confirmaciones, avisos, transiciones y agenda requiere diseño previo, sin borrar historia.
5. Cada integrante consulta sus tareas individuales autorizadas y ambos el contenido compartido aprobado; no se entregan automáticamente secretos o notas profesionales. El acceso legal sigue su procedimiento separado, pendiente de revisión.
6. Solo Laura determina cumplimiento de objetivos; los pacientes los consultan y pueden marcar sus tareas como realizadas, sin nuevos estados. No acredita corrección actual del backend o portal.

## Verificación histórica de ADR-030 — PR #19

Los resultados siguientes pertenecen a la entrega documental anterior sobre base `fcabf5245d889f700804ec6d1b9f48043fd30fc0`; se conservan como historia y no son ejecuciones nuevas de esta consolidación.

- Diez archivos, exclusivamente Markdown; diff revisado contra la base `fcabf5245d889f700804ec6d1b9f48043fd30fc0` y `git diff --check` sin errores.
- 222 enlaces locales y seis fragmentos comprobados en los diez documentos; sin rutas o anclas inexistentes. UTF-8 válido.
- Definiciones únicas: ADR-001–030 (30), RN-01–68 (68) y AB-01–37 (37), sin IDs duplicados. Nuevos: ADR-030, RN-62–68 y AB-28–37.
- ADR-029, RN-59–61 y fila AB-23 comparados literalmente con la base, sin cambios. Textos históricos ADR-002/006 conservados con notas de sustitución; derivación mantiene cierre de origen/apertura de destino y cupos previos, sin ampliar estos por inferencia.
- SQL 001–007 y manifiesto comparados byte a byte con la base, idénticos. Inspección estática de 003, claves de pertenencia/autoría y autorización legacy; sin ejecutar SQL ni pruebas funcionales.
- Sin cambios en backend, frontend, seeds, tests, CI, JWT o permisos; sin operar bases, contenedores, volúmenes, datos persistentes ni configuración GitHub. Se mantienen siete checks y retención CI de 14 días. No se atribuyen resultados históricos a esta entrega ni se declara aprobada una ejecución CI nueva.

La diferencia entre producto aprobado e implementación continúa como transición pendiente. Esta consolidación precisa privacidad ordinaria, entrevistas de ambos, voluntariedad y AB-37; no resuelve por inferencia sus mecanismos ni AB-36. El nuevo Draft PR se detiene para revisión del propietario, sin merge ni auto-merge.


## Verificación de la consolidación clínica — 28 de octubre de 2026

- Base local y remota verificadas: `main` `021c12e2481a3a2c4f74b65a37e468c28634bc92`, árbol limpio antes de crear `docs/couple-clinical-consolidation`.
- Alcance revisado: seis archivos Markdown autorizados (evidencia, este contrato, decisiones, reglas, roadmap y visión). `git diff --check` sin errores; sin cambios de código, configuración, SQL, CI o recursos habituales.
- Verificador documental existente ejecutado sin red sobre los 37 Markdown del repositorio: UTF-8, destinos y fragmentos locales y referencias a IDs válidos. Definiciones adicionales comprobadas únicas y consecutivas: 30 ADR, 73 RN y 37 AB.
- Matrices contrastadas con el encargo: conservadas las 15 respuestas de A/B/C y las 12 previas de B/C; las 12 de Q2-T coinciden literalmente con la actualización. Aclaración de la pregunta 15 conservada. No se reconstruyen enunciados ni correspondencia de Q2-T con A/B/C ausentes en las fuentes.
- ADR-029, RN-59–61 y AB-23 comparados con la base, sin cambios; SQL 001–007 y manifiesto comparados como bytes, idénticos. Inspección estática de 003 y autorización legacy confirma que el producto nuevo requiere transición técnica futura.
- Sin ejecución manual de suites funcionales, bases, Docker, demos, schema, seeds o migraciones. La matriz completa de CI autorizada se ejecuta en runners nuevos al publicar el PR; esta revisión documental no atribuye resultados previos ni certifica esa ejecución o funcionalidades pendientes.

AB-37 queda resuelta como producto; pausados y mecanismo pendientes. AB-36 sigue pendiente de revisión jurídica. Las opiniones clínicas, principios aprobados, mecanismos abiertos y capacidades implementadas permanecen diferenciados.
