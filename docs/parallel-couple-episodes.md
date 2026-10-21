# Episodios paralelos, terapia de pareja y derivaciones independientes

## Estado y alcance

Decisión de producto aprobada por el propietario el 20 de octubre de 2026 y formalizada en [ADR-030](product/decisions.md#adr-030--episodios-paralelos-pareja-y-derivación-por-tratamiento), con reglas RN-62–68 en [business-rules.md](product/business-rules.md). Base verificada: `main` `fcabf5245d889f700804ec6d1b9f48043fd30fc0`, merge de [D2 / #18](https://github.com/japh113/plataformaPsicologia/pull/18). Este encargo es exclusivamente documental, en rama independiente y Draft PR sin merge ni auto-merge.

**Aprobado no equivale a implementado.** La aplicación conserva autorización legacy por paciente; 003 conserva su índice de exclusividad donde esté instalada. AB-23, ADR-029/RN-59–61, JWT y las protecciones existentes permanecen intactos. D2 integrado no acredita despliegue habitual ni activa D3, directorio, vinculaciones o permisos por episodio. No se ejecutan SQL, pruebas funcionales, demos, migraciones ni operaciones sobre recursos habituales en este encargo.

## Tratamiento e identidad del episodio

Un paciente global puede participar en varios tratamientos simultáneos, activos o pausados, con distintos profesionales. La existencia de uno no bloquea automáticamente otros. Cada episodio tiene identidad clínica, contexto, participantes explícitos, permisos, notas, citas, tareas, antecedentes, estado y ciclo de vida propios; un único psicólogo responsable por episodio.

| Modalidad aprobada | Participantes y alcance |
| --- | --- |
| Individual | Un paciente registrado y un psicólogo responsable; contexto clínico propio. |
| Pareja | Dos pacientes registrados y un psicólogo responsable; un tratamiento conjunto con identidad clínica propia, consentimiento, confidencialidad y participación específicos. No representarlo artificialmente mediante dos episodios individuales. |

Carlos puede tener terapia personal con Ana, sexología con Luis y terapia de pareja con María y Laura al mismo tiempo. Carlos y María pueden mantener tratamientos individuales con otros profesionales sin duplicar sus cuentas. No están aprobados terapia familiar de tres o más participantes, terapia grupal, varios psicólogos corresponsables simultáneos, acceso irrestricto entre participantes ni compartición automática de antecedentes.

**Vinculación independiente:** abrir un tratamiento nuevo no es derivar otro. No exige ni inicia automáticamente derivación; tampoco cancela, modifica, pausa o finaliza atenciones previas. Se mantienen verificaciones, aceptaciones pertinentes y activación separada con entrevista propia validada. El cupo de solicitud inicial de RN-37/ADR-022 sigue vigente; no es exclusividad de tratamientos. Su adaptación operativa a solicitudes conjuntas requiere diseño, sin habilitar ahora ningún flujo.

**Derivación de un tratamiento:** conserva las dos vías de ADR-003/RN-04–07/18–20. La profesional exige iniciativa de A, aceptación del paciente y de B, resumen obligatorio revisable y aprobación de su versión exacta. La directa del paciente exige identidad verificada y aceptación de B, sin consentimiento ni resumen obligatorio de A. A continúa responsable del episodio de origen hasta completar el cambio atómico. Se conserva solicitud única pendiente y cancelable por paciente (RN-19), identificando el tratamiento derivado: el efecto del cambio no altera otros. El cupo no es exclusividad clínica ni obliga a derivar al abrir tratamiento independiente. Su aplicación a pareja requiere diseño; no se amplía por inferencia.

La continuidad lógica del tratamiento no convierte al episodio en un registro reasignable. RN-03, ADR-006 y el requisito funcional de ADR-008 conservan cierre del origen y apertura de un episodio nuevo para el destino, incluido A→B→A. Nunca cambiar retrospectivamente `psychologist_user_id`, reutilizar finalizados ni mover automáticamente citas, notas o autoría. No se decide aquí cómo representar técnicamente esa continuidad entre IDs.

Si Carlos deriva su terapia personal de Ana a Roberto, sexología con Luis y pareja con Laura permanecen intactas. María no interviene en esa derivación individual; Roberto no obtiene acceso a esos otros episodios. Si Carlos inicia terapia nueva con Roberto, no hay derivación de Ana. La cancelación confirmada de futuras citas de RN-20/ADR-014 afecta solo al tratamiento derivado; no traslada agenda al destino ni afecta otras atenciones. Pausa, reanudación y cierre se delimitan al episodio: las reglas individuales vigentes se conservan; desacuerdos de pareja no se resuelven por extensión unilateral de RN-21.

## Derivación conjunta y confidencialidad

Derivar la terapia de Carlos y María de Laura a Roberto requiere confirmación expresa de **ambos pacientes**, además de las confirmaciones profesionales correspondientes a la vía existente, resumen revisable y aprobación exacta cuando esa vía lo exige. La ampliación a pareja no elimina requisitos ni crea una tercera vía. Una confirmación parcial no completa la derivación ni concede acceso clínico anticipado. Si uno no acepta, no se completa; la resolución posterior queda pendiente. No se presume consentimiento por silencio, plazos, mayoría o autorización unilateral. Los demás tratamientos de ambos permanecen intactos.

Confirmar derivación, aprobar el resumen y autorizar antecedentes adicionales siguen siendo actos separados. Negar antecedentes adicionales no bloquea por sí solo la vía con resumen aprobado y demás condiciones cumplidas. No hay herencia de consentimientos ni acceso a tratamientos ajenos. La política exacta de revisión del resumen conjunto y de autorizaciones sobre aportaciones individuales requiere diseño de confidencialidad; no se presupone divulgación por pertenecer a la pareja.

| Ámbito que debe distinguir el diseño | Límite aprobado |
| --- | --- |
| Información del tratamiento conjunto | Participar no concede lectura indiscriminada de todo el episodio. |
| Información aportada individualmente | No se vuelve automáticamente visible al otro paciente. |
| Comunicaciones privadas | No presumir acceso compartido ni una política de comunicación ya disponible. |
| Consentimientos y autorizaciones | Identificar actor, propósito y alcance; confirmación conjunta de derivación no autoriza por sí sola antecedentes adicionales. |
| Acceso del profesional responsable | Delimitado por episodio y permiso concreto; no por identidad global del paciente. |
| Derechos y límites de cada participante | Política de portal y confidencialidad pendiente, sin limitar por inferencia derechos ARCO ni autorizar acceso cruzado. |

La política exacta de confidencialidad individual y compartida está pendiente de aprobación. Las reglas individuales RN-24/25 no resuelven qué aportaciones del otro participante pueden consultarse. Tampoco basta con incorporar dos IDs para declarar resueltos consentimiento o privacidad.

## Invariantes de privacidad

- Identidad global estable y participación explícita; no duplicar cuentas arbitrariamente ni inferir participantes desde vínculos, contactos, entrevistas o registros legacy.
- Autorización por episodio, participante y permiso concreto. Atender a un paciente no abre sus otros tratamientos; una derivación tampoco los enumera ni revela por errores, listados, conteos o metadatos.
- Solicitudes pendientes y confirmaciones parciales sin acceso clínico; consentimientos y permisos no heredados entre tratamientos ni profesionales.
- Autoría histórica preservada y archivo propio según ADR-005; ni recibir un resumen ni antecedentes concede edición o autoría sobre registros ajenos.
- `support`, `admin` y `superadmin` sin clínica global ordinaria, exportación ni alteración clínica por su rol; sin emergencia implícita (RN-27).
- Entrevista inicial propia completada y validada expresamente por el profesional antes de toda activación nueva, con precondición futura backend/DB (ADR-029/RN-59–61). Cómo recabar y validar la de ambos pacientes sigue abierto.

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
| ADR-002 / RN-21 / ADR-014 | Pausa/reanudación/cierre y resolución de futuras | Se conservan para individual, por episodio. No extrapolar unilateralidad a pareja; AB-28/29 pendientes. No se relajan reglas actuales de citas. |
| ADR-004/005/011/016/017 / RN-06–15/23–27 | Alcance autorizado, archivo, no herencia, datos por episodio y backoffice separado | Se conservan. Pareja no implica acceso automático a aportaciones individuales; política detallada pendiente. |
| ADR-029 / RN-59–61 / AB-23 | Entrevista validada previa, autonomía de cuenta, no reinterpretación legacy y nuevas vinculaciones bloqueadas | Íntegros, sin debilitamiento ni activación. RN-65 añade confirmación de ambos para derivar pareja, sin sustituir entrevista ni permisos. |

## Impacto técnico futuro y dependencias

La inspección de [003](../backend/sql/migrations/003_clinical_episode_foundation.sql) confirma `clinical_episodes_one_current_patient_idx` sobre `patient_id` para `status IN ('active', 'paused')`. Impide tratamientos paralelos y es incompatible con la nueva política de producto. La tabla actual exige un `patient_id`, un `psychologist_user_id` y claves compuestas de pertenencia/autoría; el trigger protege su identidad. No representa aún pareja. Ver [arquitectura actual](architecture.md) y [fundamentos 003](clinical-episodes-foundation.md).

Una futura implementación autorizada deberá:

1. Evolucionar la restricción mediante migración sucesora, conservando SQL 001–007, manifiesto y hashes históricos; no retirar una protección efectiva sin sustitución segura.
2. Representar participantes explícitos y conservar identidad histórica de episodios/profesionales. No se aprueba aquí tabla, índice, relación ni esquema definitivo.
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

## Decisiones pendientes del propietario

| ID en el registro | Pregunta sin resolver | Dependencia |
| --- | --- | --- |
| AB-28 | ¿Qué ocurre si un participante quiere abandonar la terapia de pareja? | Ciclo de pareja 2A/2B |
| AB-29 | ¿Qué ocurre si uno quiere pausar/finalizar y el otro no? | Pausa/cierre 2B |
| AB-30 | ¿Cómo se distingue información compartida e individualmente confidencial? | Privacidad 2A; resumen/consentimiento 2B/2C |
| AB-31 | ¿Qué ve cada paciente en su portal? | Permisos/UX 2A |
| AB-32 | ¿Cómo se presenta y valida la entrevista inicial de ambos? | Precondición de activación 2A |
| AB-33 | ¿Qué sigue después del rechazo de una derivación conjunta? | Flujo 2B; no se completa mientras falte aceptación |
| AB-34 | ¿Cómo evitar duplicados no deseados sin exclusividad global? | Vinculación/concurrencia 2A |
| AB-35 | ¿Cómo representar citas individuales y conjuntas en pareja? | Agenda 2A/2B/2D; no relajar por inferencia las reglas vigentes |
| AB-36 | ¿Qué reglas de consentimiento, confidencialidad y tratamiento de datos requieren validación jurídica mexicana? | Diseño de pareja y salida a producción; sin conclusión legal |
| AB-37 | ¿Se permiten varios tratamientos conjuntos simultáneos de las mismas dos personas con distintos objetivos? | Alcance/vinculación 2A |

No se resuelven por inferencia. Si un flujo exige una de estas políticas, queda pendiente hasta su aprobación y entrega autorizada.

## Verificación documental de esta entrega

- Diez archivos, exclusivamente Markdown; diff revisado contra la base `fcabf5245d889f700804ec6d1b9f48043fd30fc0` y `git diff --check` sin errores.
- 222 enlaces locales y seis fragmentos comprobados en los diez documentos; sin rutas o anclas inexistentes. UTF-8 válido.
- Definiciones únicas: ADR-001–030 (30), RN-01–68 (68) y AB-01–37 (37), sin IDs duplicados. Nuevos: ADR-030, RN-62–68 y AB-28–37.
- ADR-029, RN-59–61 y fila AB-23 comparados literalmente con la base, sin cambios. Textos históricos ADR-002/006 conservados con notas de sustitución; derivación mantiene cierre de origen/apertura de destino y cupos previos, sin ampliar estos por inferencia.
- SQL 001–007 y manifiesto comparados byte a byte con la base, idénticos. Inspección estática de 003, claves de pertenencia/autoría y autorización legacy; sin ejecutar SQL ni pruebas funcionales.
- Sin cambios en backend, frontend, seeds, tests, CI, JWT o permisos; sin operar bases, contenedores, volúmenes, datos persistentes ni configuración GitHub. Se mantienen siete checks y retención CI de 14 días. No se atribuyen resultados históricos a esta entrega ni se declara aprobada una ejecución CI nueva.

La diferencia entre la política aprobada y las restricciones actuales queda documentada como transición pendiente; confidencialidad, entrevista conjunta, desacuerdos y duplicados no se resuelven por inferencia. El Draft PR se detiene para revisión del propietario, sin merge ni auto-merge.
