# Registro de decisiones de producto y arquitectura

Consolidación clínica documental del 28 de octubre de 2026: base verificada `main` `021c12e2481a3a2c4f74b65a37e468c28634bc92`. [Evidencia anonimizada](../couple-clinical-evidence.md); producto aprobado, implementación y revisión jurídica pendientes. Esta actualización solo modifica Markdown.

Antecedente documental de ADR-030: main `fcabf5245d889f700804ec6d1b9f48043fd30fc0`, merge de [D2 / #18](https://github.com/japh113/plataformaPsicologia/pull/18). D1/D2 integrados, sin despliegue habitual acreditado; D3 y nuevas vinculaciones pendientes. Este encargo solo formaliza [episodios paralelos y pareja](../parallel-couple-episodes.md) como producto aprobado, con implementación pendiente; no activa capacidades clínicas ni modifica D2.

Base histórica de la auditoría A: `0077f46`, merge #9, el 18 de octubre de 2026; #7 y #8 ya integrados. La actualización de estado posterior a #12 no acredita ejecución de 003–005 en la base habitual ni autorización clínica por episodio.

A documental se integró en #10 (0f2ebba); B en #11 (5e549f5), incluida la deshabilitación global AB-23 y 004; C en #12 (543442e), con contactos seguros y 005. [Guía B](../patient-identity-verification.md), [contrato C](../contact-changes.md) y [evidencia histórica final C](../contact-change-deadline-validation.md). Integración no acredita despliegue; D1/D2 se integraron después en #17/#18; D3 y nueva vinculación siguen pendientes.

El diseño completo de 2A conserva propuestas fuera de B. El usuario confirmó para B nombre editable y DOB histórica desconocida sin alta/corrección posterior; también email verificado como requisito para solicitar SMS, con cuotas por cuenta/destino y limitación residual de abuso multicuenta.

## Estados y uso del registro

- **APROBADA:** decisión de producto o secuencia de trabajo expresamente acordada. No significa implementada.
- **PROPUESTA:** alternativa técnica para discutir y especificar; no autoriza código, SQL ni despliegue.
- **ABIERTA:** pregunta sin resolución aprobada, con etapa en la que debe cerrarse.
- **NO APROBADA:** acción o comportamiento sin autorización para este alcance; no debe incorporarse como requisito acordado.
- **LEGAL A VALIDAR:** consideración o hipótesis para revisión jurídica; no conclusión de cumplimiento.

Cada encargo futuro debe citar estos IDs y cerrar solo las decisiones necesarias para su etapa. Una propuesta pasa a aprobada únicamente con acuerdo explícito registrado en una modificación posterior, explicando consecuencias y criterios; no por aparecer en un PR documental.

Como antecedente de #5/#9, se actualizaron ADR-002/003/005/010/011, conservando IDs: resumen obligatorio solo en derivación profesional, archivo completo de episodios propios con adendas, estados del episodio y visión del paciente sustituyen sus formulaciones de #5. ADR-012–ADR-018 registran las nuevas decisiones de dominio; RN-01–RN-58 en [business-rules.md](business-rules.md) son sus reglas verificables. ADR-019 añade el requisito transversal de demos reproducibles a los criterios de aceptación del roadmap. ADR-006/009 fueron aprobados técnicamente para los fundamentos integrados en #8, con el alcance aditivo descrito abajo; ADR-007/008 siguen siendo propuestas para sus flujos.

## ADR-001 — Consultorios independientes y red sin acceso implícito

**Estado: APROBADA.**

**Contexto:** PsicoPanel sirve a psicólogos independientes con consultorios propios. La visión futura incluye directorio y derivación estatal/nacional.

**Decisión:** no modelar el producto como clínica con pacientes compartidos. La pertenencia a la red nunca concede acceso al expediente. Mantener separación entre backoffice y operación clínica.

**Consecuencia:** permisos ordinarios se justifican por relación asistencial, archivo de episodios propios o autorización expresa; no por membresía. La red avanzada sigue en etapa 6; el directorio básico para vinculación inicial se incorpora a 2A por ADR-020. #7 corrigió los permisos globales de backoffice frente a RN-27/ADR-017; no existe una política de emergencia implícita.

## ADR-002 — Responsabilidad vigente única y ciclo de episodios

**Estado: APROBADA.**

**Sustitución parcial por ADR-030 (20 de octubre de 2026):** el texto siguiente conserva la decisión histórica. Su exclusividad global por paciente deja de ser política vigente; ahora hay un responsable por episodio y tratamientos paralelos. El ciclo individual y la conservación histórica permanecen; el ciclo de pareja se precisa en ADR-030/RN-71; sus transiciones siguen pendientes (AB-28/29). No interpretar «reanudar requiere ambos» como resolución del ciclo de pareja: en el acuerdo individual son paciente y profesional.

**Decisión:** como máximo un responsable vigente por paciente; episodios `activo` y `pausado` cuentan para exclusividad. Reanudar pausa conserva episodio; tras `finalizado` se abre otro, incluido A→B→A. No sobrescribir episodios ni reatribuir citas/notas. Cualquiera puede iniciar pausa o finalizar unilateralmente con confirmación/motivo apropiado y aviso al otro, resolviendo citas futuras antes sin borrado. Reanudar requiere ambos; pausa impide citas nuevas y permite finalizar. El paciente puede quedar sin responsable (RN-02/03/21).

**Consecuencia:** responsabilidad actual no habilita gestión de episodios cerrados ni antecedentes ajenos. Archivo y adendas propias se rigen por ADR-005/013; alta inicial por ADR-012. Índice y estados técnicos de los fundamentos están aprobados en ADR-006; las transacciones funcionales siguen en ADR-008 y AB-14/15. No interpretar la pausa como vacante para otro responsable.

## ADR-003 — Derivación profesional con resumen y cambio directo

**Estado: APROBADA.**

**Alcance precisado por ADR-030:** ambas vías se aplican al tratamiento objeto del cambio. Abrir otro tratamiento independiente no es derivación. Pareja requiere confirmación expresa de ambos pacientes y mantiene los demás requisitos de la vía; privacidad ordinaria aprobada y diseño de confidencialidad pendiente (AB-30/31).

**Decisión:** dos vías (RN-04–RN-07/18/19):

- **Profesional A→B:** A inicia, paciente acepta cambio, B acepta. A redacta resumen clínico obligatorio; paciente revisa, puede rechazar contenido con motivos y pedir revisiones a A hasta aprobar la versión exacta. Solo esa versión se comunica a B y sin ella no se completa esta vía. A no está obligado a escribir información clínicamente falsa y se conservan borradores/versiones. B conoce identidad del remitente A y datos mínimos, sin notas antes de aprobación pertinente.
- **Directa del paciente:** identidad verificada y aceptación de B, sin consentimiento ni bloqueo de A y sin resumen obligatorio de A. No comparte historial automáticamente. B solo ve los datos básicos proporcionados por el paciente; no divulgar innecesariamente identidad de A. Al completarse A recibe aviso sin conocer nuevo contenido clínico.

En ambas se conserva una sola solicitud pendiente de cambio por paciente, cancelable. La solicitud identifica el tratamiento que se deriva; A sigue responsable de su episodio de origen hasta el cambio atómico, sin afectar otros tratamientos. El cupo no impone exclusividad clínica ni obliga a derivar para abrir atención independiente; su aplicación conjunta necesita diseño, sin ampliarlo por inferencia. Autorizar cambio, aprobar resumen y autorizar antecedentes adicionales son decisiones separadas: negar los adicionales no bloquea derivación con resumen aprobado. Resumen obligatorio no equivale a historial ilimitado.

**Consecuencia:** solicitud o aceptación parcial no habilitan expediente. No hay asignación administrativa que sustituya acuerdos. Cancelabilidad y solicitud pendiente única están aprobadas; estados API, orden detallado, caducidad, errores y mecanismo de concurrencia quedan abiertos. Agenda al completar: ADR-014. La frase previa «sin historial obligatorio» se limita ahora a antecedentes adicionales; no elimina el resumen de la vía profesional.

## ADR-004 — Alcance de antecedentes, evidencia y revocación

**Estado: APROBADA.**

**Decisión:** en transferencia ordinaria el origen propone qué compartir; el paciente autoriza expresamente su alcance y no se comunica más. El destinatario no adquiere autoría ni edición sobre notas recibidas. El consentimiento se admite digital por cuenta autenticada del paciente o presencial por documento firmado con identidad/evidencia verificadas y registradas. Cargar un documento o marcar una casilla del profesional no constituye por sí solo consentimiento verificado. Debe poder revocarse para restringir accesos futuros, conservando auditoría.

**Consecuencia:** diseñar autorización separada de responsabilidad y recepción de evidencia, distinguiendo el resumen obligatorio de ADR-003 de antecedentes opcionales. Tener cuenta digital obligatoria no elimina el consentimiento presencial verificado. No prometer retirar conocimiento ya comunicado. Metodología presencial exacta, duración, categorías/registros y representación técnica siguen abiertas o propuestas en ADR-007.

## ADR-005 — Archivo completo de episodios propios, no herencia e integridad

**Estado: APROBADA.**

**Decisión:** el psicólogo histórico conserva lectura archivada del **expediente clínico completo de sus propios episodios**, incluyendo notas, citas, entrevista, evaluación de riesgo, tareas, objetivos y contexto. No puede gestionar al paciente ni ver episodios ajenos; única escritura histórica: adendas a notas propias (ADR-013). Sustituye expresamente el límite a notas de #5 (RN-10/12). Antecedentes ajenos requieren autorización expresa; los consentimientos no se heredan en A→B→C. No borrar ni reescribir expedientes, autoría o citas históricas.

**Consecuencia:** archivo de episodio no es vínculo vigente ni expediente global. En A→B→A, A conserva archivo completo del primero, abre otro y no obtiene notas de B automáticamente. A→B no permite a B divulgar notas de A a C con ese mismo permiso; debe especificarse una nueva autorización aplicable. El archivo propio no amplía permisos sobre contenido ajeno recibido con alcance limitado/revocable.

La migración [001_clinical_data_integrity.sql](../../backend/sql/migrations/001_clinical_data_integrity.sql) protege histórico y registros; [002_auth_session_version.sql](../../backend/sql/migrations/002_auth_session_version.sql) versiona y revoca JWT. No modificarlas ni debilitarlas. La edición versionada descrita en [clinical-data-integrity.md](../clinical-data-integrity.md) es contexto previo; el objetivo aprobado para notas finalizadas es adenda sin sobrescritura (ADR-013).

## ADR-006 — Episodios independientes y atribución opcional

**Estado: APROBADA para los fundamentos técnicos del PR posterior a #7. Etapa: 2A, entrega parcial.**

**Contrato histórico implementado en 003, conservado:** ADR-030 sustituye la exclusividad global como producto y añade pareja; no modifica este SQL ni sus garantías. El modelo de un paciente por fila y el índice descritos abajo requieren evolución sucesora antes de habilitar el nuevo dominio. Identidad inmutable, autoría, terminalidad y ausencia de backfill siguen vigentes.

**Decisión técnica confirmada por el usuario:** crear `clinical_episodes` independiente de `care_relationships`; conservar `patients.id` como identidad global estable. El episodio referencia paciente y psicólogo, sin referencia permanente obligatoria a la cuenta del paciente: la asociación de cuenta se resuelve en el modelo de identidad y puede cambiar en una recuperación excepcional sin reescribir historia clínica.

Estados técnicos `active`, `paused`, `finalized`; índice único parcial por paciente para activos Y pausados. Identidad del episodio inmutable, finalización terminal y conservación sin DELETE/TRUNCATE. Regresar tras finalización crea otro ID, incluso A→B→A. Referencia compuesta al rol profesional impide atribuir episodios a usuarios no psicólogos sin impedir suspensión de la cuenta.

Añadir `episode_id` opcional a citas, notas, tareas/objetivos y espera. Claves compuestas validadas garantizan paciente/episodio y nota/cita/tarea consistentes; una nota atribuida exige autor conocido del episodio. Las claves internas generadas comparan también ausencia de episodio: una referencia nullable no puede dejar cita/nota o nota/tarea con atribución parcial. La atribución existente no se elimina ni cambia de episodio.

**Consecuencias y límites:** reemplaza la propuesta anterior de reutilizar `care_relationships` como episodios y de usar `care_relationship_id`. No se crean episodios desde relaciones legacy ni se atribuye histórico al psicólogo actual, incluso si su vínculo está activo. Citas/notas/autoría originales permanecen intactas. El backend actual continúa operando con atribución nula; la nueva tabla todavía no es fuente de autorización. No se retira el fallback `psychologist_patient_access` ni se activan permisos, endpoints o flujos nuevos.

Clasificación restante de datos globales/clínicos, entrevista/riesgo, estructura de borradores/adendas, identidad excepcional y sustitución coordinada de lectores/escritores siguen pendientes. La activación de atribución y permisos necesita otro PR; no atribuir desde escritores externos mientras el backend actual no pueda propagar el episodio. Véase el contrato SQL y operativo en [clinical-episodes-foundation.md](../clinical-episodes-foundation.md).

## ADR-007 — Estructuras de derivación y autorización de alcance fijo

**Estado: PROPUESTA; no aprobada para código. Etapas: 2B/2C.**

**Propuesta:** evaluar estructuras llamadas `patient_referrals`, `referral_events`, `clinical_disclosures`, `clinical_disclosure_items`, `patient_consent_events` y `clinical_history_grants`, además de evidencia digital/presencial. **Son nombres candidatos, no tablas ni rutas existentes.** Separar las dos vías de cambio, acuerdos, versiones/aprobación exacta del resumen, propuesta de antecedentes, evidencia verificada, permiso y revocación.

Cada autorización identificaría destinatario y alcance fijo de registros/versiones; no abarcaría notas futuras implícitas. Aprobar versión exacta del resumen y exigir nueva autorización para adendas posteriores ya son requisitos, no propuestas. Evaluar manifiesto de referencias/versiones frente a snapshots evitando duplicación y exposición de contenido posterior; limitar acceso a evidencia e historial de versiones.

**Pendiente de aprobación:** esquema, estados técnicos, contenido de historial, selección por categorías/registros, exposición de versiones, duración, momento de activación, revocación concurrente y metodología de evidencia. No codificar el esquema candidato como si estuviera decidido.

## ADR-008 — Finalización transaccional y coordinación con escrituras

**Estado: PROPUESTA; no aprobada para código. Etapas: 2A/2B, ampliación en 2C/2D.**

**Precisión ADR-030:** el cambio cierra el episodio de origen y abre otro para el destino del tratamiento; continuidad lógica no permite cambiar `psychologist_user_id` en el original. El bloqueo por paciente siguiente es un candidato histórico que debe revisarse para participantes y concurrencia; no impone exclusividad global ni afecta otros episodios.

**Propuesta:** completar cambio mediante transacción con bloqueo por paciente y revalidación de condiciones según vía (resumen aprobado en profesional; sin acuerdo de A en directa), responsabilidad vigente, solicitud única, cancelación confirmada de futuras y permisos. Cerrar episodio anterior y abrir el nuevo de forma indivisible es requisito aprobado; este mecanismo aún no. Coordinar con **todas** las escrituras clínicas/operativas, pausa, cierre y suspensión; validar fuera y escribir después no basta.

**Consecuencia esperada:** una solicitud antigua, un cambio administrativo de vínculo o una nota/cita concurrente no deben reabrir permisos ni escribir en el episodio equivocado. También debe definirse cómo las lecturas y divulgaciones concurrentes respetan revocación.

**Pendiente de aprobación:** locks, orden, idempotencia, reintentos/errores y protocolo exacto de agenda/espera. Ya están aprobados solicitud pendiente única/cancelable y cancelación confirmada de futuras al cambiar. No trasladar automáticamente citas, espera, entrevista ni riesgo; no inventar atribución incierta.

## ADR-009 — Migración 003 aditiva y ejecución explícita comprobable

**Estado: APROBADA para implementar y probar en destinos nuevos desechables; no autoriza ejecutarla en la base habitual. Etapa: 2A, fundamentos.**

**Decisión:** `003_clinical_episode_foundation.sql` implementa ADR-006 de forma aditiva, sin modificar 001/002, schema, seed o registros originales. No hace backfill, atribución, conciliación ni corrección automática. Las relaciones legacy inconsistentes bloquean las nuevas claves; vínculos múltiples o autoría desconocida solo se diagnostican y nunca eligen un dueño.

Ejecución exclusivamente explícita: URL y nombre de base confirmados, transacción, lock compartido con inicialización, prerrequisitos verificables de 001/002, SHA-256 de archivos, registro de versiones y huella de catálogo. Reaplicar verifica y no repite DDL. Versiones/checksums incompatibles, deriva o 003 no registrada se rechazan; no hay opción de forzado. 001/002 se adoptan como prerrequisitos estructuralmente comprobados, sin ejecutarlas ni afirmar evidencia histórica de sus archivos. Diagnóstico independiente en transacción de solo lectura, con conteos y sin candidatos de atribución.

**Evidencia requerida:** PostgreSQL aislado creado por las pruebas; instalación vacía y sintética poblada, conservación de todas las filas/autoría, reaplicación, deriva/versiones, exclusividad y concurrencia, relaciones compuestas con NULL, regresión 001/002 y backend, rollback transaccional ante fallo DDL. Demo ficticia reproducible conforme ADR-019, limitada a fundamentos SQL y permisos actuales; no anticipar UI o autorización por episodios.

**Rollout futuro:** ventana sin escritores, respaldo restaurable, ensayo autorizado y estimación de bloqueos/espacio por columnas generadas e índices. Las instalaciones nuevas aplicarán 003 explícitamente después de inicializar 001/002; no se incorpora al arranque habitual. En bases existentes nunca ejecutar schema/seed o normalizadores. Recuperación sin borrar historia ni restaurar cascadas. El protocolo funcional de cambio/pausa/cierre y la segmentación de acceso necesitan diseño y entrega posteriores.

**Antecedente del encargo #8, ya integrado:** crear rama desde main con #7 integrado, implementar, probar y abrir PR hacia main sin merge. La evidencia integrada está en [clinical-episodes-validation.md](../clinical-episodes-validation.md). No describe operaciones autorizadas por el presente PR documental. No consultar ni migrar expedientes reales, ni tocar base habitual o volúmenes existentes. Procedimiento, demo y límites: [clinical-episodes-foundation.md](../clinical-episodes-foundation.md). No cierra toda 2A ni implementa 2B/2C.

## ADR-010 — Secuencia de trabajo y UI mínima

**Estado: APROBADA para la secuencia; mecanismos de implementación sujetos a sus ADR.**

**Decisión:** 0 Docker y 1 integridad/autenticación/dependencias de producción completadas para su alcance; 2A modelo/permisos/episodios/datos globales y clínicos/identidad, directorio básico y vinculación inicial, con fundamentos 003 integrados y evolución/rollout pendientes; 2B derivación con resumen revisable, cambio directo, pausas/cierre; 2C historial adicional opcional, consentimiento y revocación; 2D concurrencia de agenda; 2E zonas horarias; 3 pruebas/confiabilidad; 4 experiencia/refactor; 5 producción; 6 red. Riesgos del audit de desarrollo, hardening y respaldo pendientes. Suspensión, agenda, privacidad y notas/adendas atraviesan etapas: planificar estructura/permisos desde 2A y repartir entregas sin sobrecargar un PR.

**Consecuencia:** cada etapa incluye sus pruebas; 3 no es el inicio de toda validación. La UI mínima de aceptación, autorización digital/presencial y revocación se entrega en 2B/2C, sin esperar a 4. Los entregables y criterios por etapa están en [roadmap.md](roadmap.md). La planificación puede usar ChatGPT, implementación autorizada Codex local y auditoría Work cuando aporte valor; no se impone usar las tres herramientas.

## ADR-011 — Derechos del paciente y marco jurídico inicial

**Estado: APROBADA como separación de producto; LEGAL A VALIDAR en alcance normativo y responsabilidades.**

**Decisión de producto:** paciente ve citas, tareas, objetivos compartidos y resúmenes para él, con lectura histórica de sus actividades; notas profesionales no visibles automáticamente (RN-24). Solicitar acceso clínico y otros derechos ARCO sigue procedimiento separado de divulgación en derivación, sin bloqueo arbitrario ni veto absoluto del origen. El procedimiento exacto sigue abierto, sin limitar derechos por la UI.

**Consideraciones por validar:** México es referencia inicial. Como hipótesis de análisis, el independiente suele actuar como responsable respecto de su consulta y el proveedor como encargado según sus operaciones reales; deben revisarse sus tratamientos efectivos antes de concluir roles. No afirmar que todas las transferencias médicas exigen consentimiento en cualquier circunstancia: pueden existir excepciones. Revisar procedimientos, conservación, evidencia y emergencias con asesoría competente. Estos documentos no declaran cumplimiento ni crean una excepción operativa automática.

## ADR-012 — Identidad global, cuenta obligatoria y básicos del paciente

**Estado: APROBADA. Etapas: 2A/2B. Reglas: RN-15–RN-17/29/34/40.**

**Decisión:** identidad global única sin búsqueda que revele pacientes de otro consultorio; prevenir duplicados sin unión automática por coincidencias. Todos los pacientes y psicólogos tienen cuenta digital obligatoria. Paciente puede registrarse independientemente sin psicólogo; el registro por sí solo no crea episodio ni concede acceso clínico. Psicólogo también puede invitar a un paciente conocido, aunque este aún no tenga cuenta. Responsable del nuevo episodio solo después de verificación y confirmaciones según vía (ADR-021/030). ADR-030 sustituye «si hay episodio vigente, usar cambio»: un tratamiento nuevo independiente no exige derivación, aunque existan otros activos o pausados. Verificar correo y teléfono al activar y adicionalmente en duplicados/recuperación; no imponer universalmente CURP/documento oficial. Contactos verificados no prueban identidad física única.

El paciente administra nombre, contactos y fecha de nacimiento globales; el psicólogo solicita corrección, no cambia identidad. Básicos acompañan al paciente tras cambio confirmado; clínicos por episodio.

**AB-13 — Identidad y recuperación: decisión de producto APROBADA.** Verificación de correo y teléfono en el flujo normal; nunca fusionar identidades automáticamente por coincidencia de contactos. Los casos excepcionales requieren revisión por personal autorizado de soporte, limitada a datos no clínicos y auditada, con evidencia adicional cuando sea necesaria. No revelar relaciones entre pacientes y otros consultorios. **Pendiente de diseño técnico:** métodos concretos de verificación excepcional, evidencia y controles de recuperación. Este acuerdo no autoriza implementar esos flujos en el primer PR de permisos de 2A. El resto de campos y almacenamiento sigue en AB-02/14.

## ADR-013 — Nota finalizada inmutable y adendas propias

**Estado: APROBADA. Planificar en 2A; entrega transversal y consentimiento en 2C. Regla: RN-23.**

**Decisión:** borradores editables; finalizar nota la vuelve inmutable. Corregir mediante adendas vinculadas con autor, fecha y motivo, sin sobrescribir original. Autor puede añadirlas solo a notas propias aun con episodio cerrado, como excepción a lectura histórica. Receptor de nota autorizada no ve adendas posteriores sin NUEVA autorización expresa del paciente. No confundir preservar versiones con permitir sobrescribir una nota finalizada.

**Abierto:** estructura, contratos y reparto en PR posteriores; conservar 001/002 y reglas cita completada/no futura sin alterarlas aquí.

## ADR-014 — Agenda y comunicación al cambiar

**Estado: APROBADA. Etapas: 2A/2B, concurrencia en 2D. Reglas: RN-18–RN-20.**

**Decisión:** notificar a A al completar cualquier cambio. Mostrar al paciente futuras citas con A y exigir confirmación de cancelación; cancelarlas consistentemente con el cambio atómico, conservar histórico, sin reprogramar con B. Datos visibles según vía en ADR-003. Resolver agenda también antes de pausa/cierre; procedimiento de espera, recurrencias y conflictos sigue AB-09/15.

**Delimitación ADR-030:** futuras citas del tratamiento objeto del cambio, sin cancelar las de otros episodios aunque coincida el profesional. Pausa/cierre se delimitan al episodio; no se resuelven desacuerdos de pareja aquí ni se trasladan registros históricos.

## ADR-015 — Suspensión sin cierre automático

**Estado: APROBADA. Etapas: 2A/2B y agenda 2D. Regla: RN-22.**

**Decisión:** JWT del suspendido inválido y no crear nuevas citas. Pacientes pueden cambiar directamente sin su autorización. No auto-finalizar episodios. Futuras citas se marcan pendientes de resolución y se avisa sin motivo privado, sin cancelarlas automáticamente. Rehabilitación no restaura vínculos ya cambiados ni reactiva citas canceladas. **Abierto:** representación y procedimiento exacto de pendientes de resolución (AB-16); no afirmar que ese estado técnico ya existe.

## ADR-016 — Datos clínicos propios de cada episodio

**Estado: APROBADA. Etapas: 2A/2B. Reglas: RN-25/26.**

**Decisión:** entrevista inicial, riesgo, tareas y objetivos por episodio. Riesgo inicial NO EVALUADO, nunca sin riesgo por defecto. Antecedente autorizado no sustituye entrevista ni evaluación propias. Al cerrar, pendientes quedan no completados por cierre; paciente conserva lectura histórica de actividades.

**AB-02 — Entrevista clínica: decisión de producto APROBADA.** Una entrevista independiente por episodio. Las respuestas del paciente están separadas de la valoración profesional: el paciente puede completar y consultar sus respuestas, incluso históricamente; las correcciones posteriores conservan trazabilidad. La valoración profesional no se muestra automáticamente, sin limitar los derechos ARCO. La entrevista anterior no se comparte automáticamente al cambiar de psicólogo. Esta decisión no implementa el nuevo flujo ni cambia ahora la edición de la entrevista existente. Columnas, clasificación restante y representación de metadatos, adjuntos, versiones y alcance compartible siguen pendientes en AB-02/14.

## ADR-017 — Backoffice sin acceso clínico global ordinario

**Estado: APROBADA; emergencia ABIERTA y LEGAL A VALIDAR. Etapa: permisos en 2A. Regla: RN-27.**

**Decisión:** `superadmin`, `admin` y `support` sin acceso global ordinario a registros clínicos, entrevistas, notas, exportaciones ni alteración clínica. El acceso global que permitía el código era una brecha, no una excepción aceptada. Acceso de emergencia requiere diseño y revisión jurídica aparte; este documento no habilita puerta trasera ni rol de conciliación con acceso clínico global (AB-06/07).

**Primer PR de 2A, integrado como #7:** se retiró el bypass de `superadmin`, se deniegan las rutas y servicios clínicos a los tres roles administrativos y se proyectan explícitamente las respuestas operativas. El feed de auditoría del backoffice solo consulta eventos de revisión de psicólogos y solicitud/confirmación de recuperación, sin texto libre, pacientes, referencias clínicas ni secretos; los demás eventos históricos permanecen almacenados. Los vínculos administrativos conservan únicamente consulta operativa de datos básicos/estado, sin lectura ni escritura de notas ni exposición de invitaciones. Crear vínculos o cambiar cualquier estado desde backoffice está temporalmente bloqueado (403), incluso pending/ended/rejected: esas escrituras podían conceder o revocar acceso heredado y alterar responsabilidad clínica sin autorización bilateral. Se rechazan antes de consultar la base; el flujo seguro sigue pendiente; #7 no implementó episodios. No se crea autorización clínica independiente para administradores.

El modelo actual de rol único no representa doble autorización administrativa/clínica. La segmentación por episodio, archivo propio y sustitución segura del fallback `psychologist_patient_access` requieren el diseño de ADR-006/009 y una evolución posterior de datos (003 ya existe en #8, sin activación de permisos ni despliegue en base habitual); siguen pendientes de entrega autorizada.

## ADR-018 — Demo desechable y migraciones seguras para datos reales

**Estado: APROBADA como límite operativo. Etapa: planificación 2A. Regla: RN-28.**

**Decisión (aclaración transversal posterior):** PsicoPanel continúa en desarrollo, sin usuarios reales; los registros existentes son únicamente de demostración y son desechables. Para cualquier cambio futuro de arquitectura, infraestructura, esquema o decisión funcional, **no migrar datos demo ni exigir compatibilidad, atribución histórica, conciliación o interfaz de recuperación únicamente por preservarlos**: los escenarios ficticios pueden regenerarse de forma aislada conforme a ADR-019. Diferenciar historial técnico de migraciones SQL (que se conserva) de la migración de registros demo (innecesaria). Esta regla no autoriza borrar ni sobrescribir bases/volúmenes existentes: verificar primero entorno autorizado y ausencia de datos reales, y solicitar autorización específica para restablecer o eliminar. Antes de admitir usuarios/datos reales, revisar la política y acordar procedimientos legales/operativos de migración, conservación y recuperación. El diseño para futuros datos reales (ADR-009) no bloquea trabajo actual por supuestas necesidades de preservar demo. En aquel encargo documental 003 aún no existía. #8 ya integró su implementación y evidencia aislada; no autoriza despliegue. El presente encargo no toca bases o volúmenes ni ejecuta schema/seeds/migraciones.

## ADR-019 — Escenarios demo ficticios y reproducibles por subetapa

**Estado: APROBADA expresamente por el usuario como requisito de futuras implementaciones. Etapas: 2A–2E.**

**Decisión:** cada subetapa incorpora escenarios demo conforme implemente sus funcionalidades, con datos ficticios y reproducibles y distintas cuentas de psicólogos y pacientes. Deben permitir iniciar sesión y comprobar visualmente permisos, denegaciones y flujos, con estado inicial, pasos de acceso/recorrido y resultados esperados documentados. La cobertura por subetapa está en [roadmap.md](roadmap.md).

Datos y cuentas demo exclusivamente para desarrollo, aislados de datos reales y nunca habilitados ni cargados automáticamente en producción. Cada entrega debe incluir un procedimiento explícito y seguro de generación/restablecimiento: verificar entorno de desarrollo y destino aislado nuevo, detenerse si existe el destino o si no es desarrollo, y reproducir el estado inicial sin sobrescribir bases ni volúmenes existentes. Restablecer debe usar otro destino aislado nuevo; documentar selección de cuentas y comprobación del estado inicial. Los comandos y el mecanismo técnico se diseñarán en la implementación correspondiente; no se afirma que existan hoy.

**Consecuencia:** demo verificable y pruebas automatizadas obligatorias son entregables complementarios de cada subetapa; la demo no sustituye pruebas ni permite posponerlas hasta 3. El carácter desechable de la demo previa (ADR-018/RN-28) no autoriza sobrescribir bases existentes. Este acuerdo documental tampoco autoriza generar/restablecer datos ni ejecutar código, SQL, schema, seeds o migraciones ahora; cualquier actuación sobre la demo actual sigue requiriendo autorización separada. No cambia las propuestas de migración/rollout ni habilita demos en producción.

## ADR-020 — Perfil público opcional y directorio básico en 2A

**Estado: APROBADA como decisión de producto; implementación pendiente. Reglas: RN-30–RN-33.**

**Decisión:** cada psicólogo elige si publica su perfil; todos privados por defecto y solo aprobados pueden activar publicación. Visibilidad y recepción de nuevos pacientes son configuraciones independientes. Un profesional público puede no aceptar solicitudes; puede invitar directamente a pacientes conocidos aunque no acepte solicitudes públicas. Publicación nunca expone pacientes, expedientes ni relaciones terapéuticas.

Cualquier visitante consulta perfiles públicos sin registrarse. Solo pacientes autenticados y con verificaciones exigidas solicitan atención desde perfiles públicos que aceptan nuevos pacientes. En 2A entra exclusivamente directorio básico e información profesional mínima necesaria para vinculación inicial. Reseñas, reputación, filtros avanzados y funciones de red siguen en etapa 6 con diseño posterior de privacidad.

**Consecuencias y pendientes:** no publicar perfiles existentes automáticamente. Campos y defaults públicos están resueltos en ADR-026; suspensión/rehabilitación en ADR-027. Identificador, caché y comportamiento futuro de solicitudes en curso requieren definición técnica (AB-18). Aprobar un profesional no equivale a que elija publicar ni a garantía de reputación.

## ADR-021 — Vinculación inicial bilateral, separada del episodio

**Estado: APROBADA como decisión de producto; implementación pendiente. Reglas: RN-29/34–RN-36/40.**

**Decisión:** invitación profesional a paciente conocido: este se registra si hace falta, verifica datos y acepta expresamente; la invitación sola no crea episodio ni acceso. Solicitud del paciente: consulta perfil público que admite nuevos pacientes y envía petición, con mensaje breve opcional y sin exigir motivo de consulta. El profesional acepta o rechaza; si acepta, el paciente debe confirmar finalmente. Las confirmaciones y verificaciones completan la vinculación; la activación del episodio es una operación distinta, transaccional y sujeta además a la entrevista validada de ADR-029/RN-59.

El mensaje es privado y sensible: no aparece en directorio ni auditoría administrativa. Ninguna solicitud pendiente concede acceso clínico. ADR-030 sustituye la exclusividad global y la obligación histórica de usar cambio 2B ante cualquier episodio vigente: se admite vinculación para tratamiento independiente, sin modificar otros. La restricción de PostgreSQL 003 sigue efectiva hasta transición segura. Permisos clínicos por episodio, nunca por aparecer en directorio; no revelar tratamientos de otros consultorios.

**Consecuencias y pendientes:** la separación funcional de vinculación y episodio está aprobada. Como propuesta técnica, se recomienda persistir solicitudes/invitaciones fuera de `clinical_episodes` y no tratarlas como `care_relationships` activas que sincronicen permisos legacy. Estados/nombres de almacenamiento, API, locks, idempotencia, protección del mensaje y sucesoras de 003 son PROPUESTAS en el [diseño](../stage2a-identity-directory-intake.md). No cambian derivación, resumen, consentimiento adicional, archivo, ARCO ni responsabilidad vigente de ADR-002–ADR-018.

## ADR-022 — Cupo de solicitud inicial y prevención de abuso

**Estado: APROBADA como decisión de producto; parámetros y políticas técnicas ABIERTOS. Reglas: RN-37–RN-39.**

**Decisión:** máximo una solicitud inicial pendiente iniciada por paciente; ocupa cupo esperando respuesta o confirmación final. Es cancelable por el paciente y las solicitudes caducan. Debe haber protecciones contra solicitudes/cancelaciones masivas, automatización y acoso. Rechazar no debe permitir acoso reiterado ni impedir injustificadamente atención.

Invitaciones profesionales se administran separadamente del cupo del paciente. No queda aprobada una política definitiva para invitaciones simultáneas de profesionales distintos. ADR-030 sustituye únicamente la exclusividad global de episodios: el cupo inicial permanece, sin convertirse en prohibición de tratamientos paralelos. Su aplicación a solicitudes conjuntas requiere diseño. Tampoco se mezcla este cupo con el de cambio por paciente en RN-19.

**Pendiente de aprobación antes de habilitar los flujos:** plazos por estado, límites de frecuencia, cooldown, bloqueos y revisión, simultaneidad de invitaciones y tratamiento de solicitudes en curso. El diseño propone mecanismos, sin fijar valores ni reglas definitivas por defecto (AB-19/20).

## ADR-023 — Registro independiente exclusivamente adulto y DOB global

**Estado: APROBADA e integrada en B (#11); sin despliegue habitual acreditado. Reglas: RN-41–43.**

La primera versión del registro independiente exige fecha de nacimiento válida y edad de al menos 18 años, comprobadas en backend; cumplir exactamente 18 sí permite registrarse. Rechazar fechas inexistentes o futuras y probar los bordes de edad. DOB pertenece a la identidad global, bajo control del paciente conforme ADR-012, no al episodio ni a la entrevista clínica.

**Aprobación en segunda revisión de B:** referencia única America/Mexico_City para calcular la fecha civil de registro desde el instante del servidor. No usar UTC ni zona del host/cliente para adelantar el cumpleaños. DOB 29/02 alcanza la elegibilidad el 01/03 en un año no bisiesto. Es política de producto para este alcance mexicano, sin conclusión jurídica ni política global/multizona; no afecta agenda 2E. Ambas decisiones fueron confirmadas expresamente antes de cambiar código.

El registro no exige motivo de consulta, entrevista, evaluación de riesgo, CURP ni documento oficial. No crea episodio, vínculo asistencial ni acceso profesional. Registro y consulta del directorio no requieren terminar verificaciones. Los contactos no prueban identidad física única y nunca provocan fusiones automáticas.

El flujo de menores, incluidos invitados por profesionales, sigue pendiente; no habilitar nuevas altas por rutas alternativas. Esto no autoriza bloquear atención o reinterpretar registros históricos de menores. Conservar datos previos sin deducir DOB desde edad/entrevista, identidad desde contactos, verificación desde existencia de cuenta ni episodios desde vínculos.

## ADR-024 — Verificación normal de email y teléfono

**Estado: APROBADA e integrada en B (#11) mediante simulación local; sin proveedor real. Reglas: RN-44–48.**

| Canal | Método | Vigencia | Reenvío mínimo | Cuota por destino en ventana de 24 h | Intentos |
| --- | --- | --- | --- | --- | --- |
| Email | Enlace único, de un solo uso | 24 horas | 60 segundos | Máximo 5 enlaces por dirección | Límite adicional de confirmación pendiente de diseño |
| Teléfono | Código temporal por SMS | 10 minutos | 60 segundos | Máximo 5 SMS por número | Máximo 5 intentos de validación por código |

Generar un desafío nuevo invalida el anterior del mismo flujo; no reinicia cuotas. Los tokens de email son impredecibles y los secretos de ambos canales se almacenan de forma segura, sin aparecer en logs, auditoría ni respuestas públicas. Proteger frente a automatización, fuerza bruta, reenvíos concurrentes, múltiples cuentas, consumo abusivo y bloqueo provocado por terceros. Exceder límites de SMS restringe temporalmente la operación, sin suspender toda la cuenta.

Entrega configurable mediante adaptadores y simuladores seguros de desarrollo/pruebas, sin email/SMS reales. Ningún proveedor comercial ni credencial de producción queda seleccionado o habilitado. Las operaciones sensibles que requieran identidad verificada deben comprobar en backend que ambos contactos vigentes están verificados; una sesión o una marca enviada por frontend no bastan. AB-23 bloquea las nuevas vinculaciones; ninguna operación clínica ya establecida exige ahora ambos contactos. Solicitar SMS exige email vigente verificado por aprobación adicional del encargo B. Ambos canales conservan evidencia independiente; cambio de email no revoca SMS. No se activan solicitudes nuevas.

## ADR-025 — Cambio de contacto, reautenticación y revocación

**Estado: APROBADA como producto; implementación C integrada en #12. Reglas: RN-49–50.**

Cambiar email o teléfono exige reautenticación reciente con contraseña, notificación al contacto anterior, verificación del nuevo e invalidación de la evidencia anterior del canal correspondiente. La confirmación debe ser consistente y revocar todas las sesiones mediante `session_version`, incluida la que hizo el cambio. El aviso no da veto al contacto anterior ni exige conservar acceso a él.

No modificar episodios, citas, notas ni historial clínico. La recuperación excepcional de identidad permanece pendiente y no se sustituye por un cambio inseguro de contacto.

La resolución AB-25 siguiente aprobó los acuerdos aplicables; C ya mantiene candidato separado del vigente, prueba temporal de reautenticación y avisos durables. Vigencia, tratamiento de fallos y carreras se detallan en el contrato C. Proveedor real, retención definitiva y operación productiva siguen pendientes; esta actualización no reabre los acuerdos aprobados.

### Resolución AB-25 — PR C, 19 de octubre de 2026

El usuario aprobó expresamente las ocho decisiones del análisis y autorizó implementar C desde main 5e549f5 (#11/B integrado), con pruebas y demos solo en destinos nuevos aislados y PR sin merge. Reautenticación 10 minutos ligada a cuenta/sesión/versión; candidato separado, verificado antes de sustitución explícita; una pendiente total, cancelación/sustitución e idempotencia; solicitud 24 horas sin extensión, verificación completada conservada hasta vencer solicitud. Email 24 horas acotadas por solicitud; SMS 10 minutos.

Avisos anterior al iniciar y completar, sin veto, con intención durable y reintentos máximos de 72 horas. No exigir acceso/verificación anterior; teléfono exige email vigente verificado. Cinco contraseñas incorrectas/15 minutos, cinco inicios/24 horas y diez cancelaciones/sustituciones/24 horas por cuenta; cuotas B compartidas y sin suspensión automática de login/clínica. Cifrado autenticado temporal, claves externas versionadas/rotables; purga de contenido operativo de avisos tras entrega/agotar reintentos y de solicitudes vencidas en máximo 24 horas mediante procesador. Auditoría mínima sin secretos y sin política definitiva de retención inventada. [Contrato y límites operativos](../contact-changes.md).

Esto autoriza C y 005 en sandboxes nuevos; no despliegue habitual, proveedores, recuperación excepcional, D, vinculaciones legacy ni activación de episodios. La protección no demuestra identidad física si se compromete también la contraseña. La entrevista previa ADR-029/RN-59–61 permanece pendiente e intacta.

## ADR-026 — Campos públicos y revisión selectiva profesional

**Estado: APROBADA como producto; implementación pendiente en PR D. Reglas: RN-51–55.**

Campos de primera versión: nombre profesional, fotografía opcional, formación académica, cédula profesional, especialidades, enfoque terapéutico, modalidad presencial/en línea/ambas, ciudad, estado, descripción profesional breve e indicador de recepción de nuevos pacientes. Sin precios, reseñas, agenda pública ni datos personales de contacto.

Perfil privado y recepción desactivada por defecto, con controles independientes. Solo profesionales aprobados pueden publicar; cuentas existentes no se publican automáticamente. Perfil público sin admisión sigue siendo válido y no debe impedir futuras invitaciones directas.

Foto, descripción, modalidad y ubicación se actualizan directamente. Formación, cédula y credenciales verificables requieren aprobación administrativa; especialidades y enfoque requieren revisión cuando impliquen credenciales verificables. AB-24 concreta catálogo controlado general y campos protegidos para declaraciones formales; el profesional no puede declarar una exención para evitar revisión.

Conservar públicamente la última versión aprobada durante revisión. La propuesta pendiente solo la ven titular y administradores autorizados para revisarla; `support` no obtiene acceso al contenido pendiente por ser lector operativo. Aprobar publica el cambio dentro de un perfil elegible y elegido público; no enciende el opt-in de un perfil privado. Rechazar conserva lo aprobado y comunica razón al titular. Registrar revisión y decisión sin acceso clínico. Ningún endpoint del titular puede cambiar aprobación o publicar credenciales pendientes.

La proyección pública será explícita y limitada, consultable sin autenticación, sin reutilizar DTO clínico/administrativo completo. Excluir pacientes, relaciones, cuentas privadas, notas de revisión y metadatos internos.

## ADR-027 — Retiro público y rehabilitación profesional

**Estado: APROBADA como producto; implementación pendiente en PR D. Regla: RN-56.**

Profesional suspendido, inactivo o sin aprobación vigente desaparece del directorio y no recibe nuevas solicitudes públicas. Consultar y modificar perfil deben comprobar elegibilidad en backend, sin revelar públicamente el motivo de suspensión.

Rehabilitar no republica ni reactiva recepción automáticamente: el profesional confirma nuevamente ambas preferencias. Conservar información aprobada, salvo credenciales que requieran revisión. No alterar, borrar, reabrir episodios ni restaurar relaciones o citas por rehabilitar la cuenta. Las solicitudes públicas siguen fuera de B/C/D; esta regla define su futura elegibilidad, no autoriza implementarlas.

## ADR-028 — Secuencia A/B/C/D y barrera legacy

**Estado: APROBADA la secuencia; A/B/C integrados en #10/#11/#12. D1/006 y D2/007 integrados en #17/#18; D3 pendiente. Reglas: RN-57–58.**

B implementa registro adulto, nombre propio, estados y verificación email/SMS, migración 004 y barrera legacy. El usuario aprobó AB-23: bloquear POST patients y request/invite/respond/accept-code para todas las cuentas, incluidos pendientes antiguos y rechazos. Se conservan los 403 administrativos de #7 y todos los accesos/pendientes existentes sin sync incidental. [Inventario revalidado](../stage2a-legacy-mutations.md).

No activar permisos por episodio ni retirar parcialmente fallback. C (contactos) fue autorizado e integrado; D (directorio/perfiles) requiere autorización propia. Solicitudes/invitaciones nuevas y recuperación excepcional siguen fuera. No modificar 001–003 ni la base habitual. La revisión de B/C se realizó en PR separados y ensayos nuevos aislados con demo ficticia ADR-019; esa autorización histórica no habilita operaciones en esta actualización documental.

## ADR-029 — Entrevista previa a la activación y autonomía de la cuenta

**Estado: APROBADA tras la revisión visual de PR #11. Reglas: RN-59–61. Precondición backend/base de datos PENDIENTE; fuera de PR B.**

La entrevista inicial es obligatoria antes de activar cualquier episodio terapéutico nuevo. El paciente puede aportar sus respuestas; el psicólogo responsable debe validar explícitamente que está completada y es suficiente para ese episodio. Una entrevista histórica de otro profesional o episodio no satisface automáticamente esta condición. No puede existir un episodio nuevo en estado active sin la validación previa correspondiente.

Vinculación bilateral y activación son operaciones distintas: vincular no activa por sí mismo el episodio. El ciclo de vida futuro deberá hacer cumplir esta precondición tanto en backend como en base de datos, con atribución de la validación al profesional y episodio correspondientes. Contratos, almacenamiento, transición y concurrencia se diseñarán en la entrega de episodios; no se crean ahora tablas, migraciones o un motor nuevo, ni se modifica 003/004.

La cuenta puede registrarse, iniciar sesión, administrar identidad y verificar contactos sin entrevista, psicólogo o episodio. Una entrevista pendiente no bloquea globalmente las funciones personales. B retira la apertura automática del modal: los pacientes con atención legacy pueden abrir y cerrar explícitamente su entrevista pendiente, sin marcarla completa por consultar/cerrar.

Se conservan los permisos y reglas concretas legacy: el paciente solo puede guardar por primera vez una entrevista; su edición posterior corresponde al profesional autorizado. Guardar una entrevista legacy conserva su significado actual y NO constituye la nueva validación de activación. No se crean entrevistas ficticias ni se marca completitud automáticamente. Las relaciones care_relationships con status=active no se reinterpretan como episodios activos ni se les aplica retroactivamente la nueva precondición.

Esta decisión precisa ADR-016/021 y los efectos de activación de RN-34/35/40: las aceptaciones de vinculación no bastan para activar. Solicitudes/invitaciones, atribución y permisos por episodio siguen pendientes, con fallback legacy intacto y nuevas vinculaciones bloqueadas.

## ADR-030 — Episodios paralelos, pareja y derivación por tratamiento

**Estado: APROBADA como producto el 20 de octubre de 2026; implementación PENDIENTE. Etapas: fundamentos 2A y flujos 2B, consentimiento adicional 2C y concurrencia 2D. Reglas: RN-62–73. Consolidación clínica documental del 28 de octubre de 2026.**

**Decisión:** un paciente global puede participar en varios episodios activos o pausados, con distintos profesionales; puede mantener terapia individual con uno y de pareja con otro. Pareja contiene exactamente dos pacientes registrados y un psicólogo responsable, en un tratamiento conjunto con identidad clínica propia, sin dividirlo en dos episodios individuales. **No se permiten dos episodios conjuntos activos simultáneos para la misma pareja**, aunque cambien profesional, objetivos u orden de los participantes (AB-37/RN-73). La semántica de episodios pausados requiere especificación antes de implementar esta restricción; no limita los tratamientos individuales independientes. No se aprueban familiar de tres o más, grupal ni varios corresponsables en un episodio.

Ambos pacientes deben aceptar expresamente el tratamiento y contar con entrevista inicial propia; el objetivo del tratamiento es conjunto. Antes de activar, el psicólogo responsable valida expresamente la completitud y suficiencia de las entrevistas conforme a ADR-029. Se admiten sesiones conjuntas e individuales, diferenciadas en agenda y notas, sin secuencia fija ni cuatro visitas obligatorias. Representación y garantía backend/DB pendientes (RN-69/70).

Crear tratamiento independiente no inicia ni exige derivación ni cambia atenciones previas. Derivar uno conserva las dos vías, resumen revisable, confirmaciones profesionales, autorización adicional separada, cancelación confirmada de futuras de ese tratamiento y cierre de origen/apertura de destino. RN-03 y la identidad inmutable de ADR-006 permanecen: no reasignar el profesional histórico, mover citas/notas/autoría ni reutilizar finalizados. El efecto del cambio se delimita al tratamiento; el cupo pendiente por paciente RN-19 se conserva, sin impedir nuevos tratamientos independientes. Su aplicación a pareja requiere diseño sin ampliar cupos por inferencia.

Derivar pareja requiere confirmación expresa de ambos pacientes y los demás requisitos de la vía correspondiente; si uno no acepta no se completa. Parciales sin acceso clínico anticipado. No se inventa resolución posterior, silencio, plazos, mayoría o aceptación unilateral. Confirmar derivación, aprobar resumen y autorizar antecedentes adicionales son actos distintos.

Participación explícita y permisos por episodio/participante/alcance, sin herencia de consentimientos ni acceso a otros tratamientos; proteger contra inferencia/enumeración. El psicólogo autorizado registra y consulta información clínica dentro de su episodio. Ningún integrante recibe automáticamente las notas profesionales, incluidos secretos o revelaciones individuales, ni se publican automáticamente sus aportaciones. El portal muestra seguimiento expresamente destinado al paciente, sus tareas individuales autorizadas y, para ambos, tareas compartidas, objetivos y resúmenes aprobados para ambos. Una comunicación o revelación deliberada en sesión sigue siendo decisión profesional, sin automatismos de la plataforma. Privacidad ordinaria aprobada; excepciones, publicación, DTO/API y permisos pendientes (AB-30/31). El acceso legal a datos y ARCO tiene procedimiento separado y revisión jurídica pendiente (AB-36); la privacidad del portal no deniega absolutamente derechos.

La participación en pareja es voluntaria: no se obliga a continuar contra la voluntad de un integrante. Su abandono definitivo impide continuar normalmente el episodio conjunto; una inasistencia aislada no equivale a abandono, no convierte automáticamente la sesión conjunta en individual ni finaliza automáticamente el episodio. Distinguir pausa temporal, finalización definitiva e inasistencia. El profesional gestiona y documenta la decisión clínica y operativa, conservando historial, autoría y datos; confirmaciones, transiciones, avisos y agenda quedan pendientes (AB-28/29/35). No extrapolar el procedimiento unilateral individual ni diseñar aquí la conversión a terapia individual con el mismo profesional tras el cierre; tampoco declararla universalmente prohibida o jurídicamente resuelta.

Solo el psicólogo responsable determina el cumplimiento de objetivos; el paciente consulta objetivos y progreso, sin evaluarlos ni registrar autopercepción de cumplimiento. Sí puede marcar tareas asignadas como realizadas. Se conservan exactamente los estados actuales de objetivos ([Issue #22](https://github.com/japh113/plataformaPsicologia/issues/22), RN-72); no se implementa esa corrección aquí. RN-27 y ADR-029/RN-59–61 permanecen íntegros.

**Fuentes y alcance de la evidencia:** [matrices anónimas de ambos cuestionarios](../couple-clinical-evidence.md), con las tres respuestas recibidas en cada uno, aclaración del propietario sobre la pregunta 15 y diferencias clínicas conservadas. El rechazo de los tres profesionales a dos terapias de pareja simultáneas respalda AB-37; su aprobación procede de la decisión expresa del propietario, no de convertir opiniones en reglas legales. Las discrepancias sobre continuidad individual, consulta de información reservada e inasistencias permanecen registradas. AB-36 sigue pendiente; ningún comentario sobre entrega de expedientes o COFEPRIS constituye conclusión jurídica.

**Sustitución y trazabilidad:** reemplaza solo exclusividad global y obligación de cambio por existir cualquier episodio en ADR-002/006/012/021/022 y RN-02/16/40; precisa alcance de ADR-003/008/014 y RN-03/05/18–21. Cupo inicial RN-37, identidad, verificaciones, historia, derivación y consentimiento conservados. [Tabla detallada y ejemplos](../parallel-couple-episodes.md#trazabilidad-de-reglas-sustituidas-y-conservadas).

**Consecuencia técnica pendiente:** `clinical_episodes_one_current_patient_idx` de 003 impide coexistencia; la fila de un paciente y sus FK no representan pareja. Requiere migración sucesora, participantes explícitos, pertenencia/autoría consistentes, permisos y transición coordinada del fallback legacy; esquema definitivo aún sin aprobar. No modificar 001–007 ni sus hashes. AB-23 y protecciones efectivas continúan hasta transición segura autorizada; no se implementa ni despliega nada en este PR. [Impacto, privacidad, dependencias y preguntas](../parallel-couple-episodes.md).

## Resolución D1 — Persistencia y división interna

**Antecedente aprobado para D1:** D1 fundamentos privados/006, D2 gestión privada y estado restringido, D3 directorio; en ese encargo solo D1 autorizado en rama nueva, pruebas nuevas aisladas y PR Draft sin merge. [Contrato y mecanismos concretos](../professional-persistence.md). No se aprueban API, autenticación o publicación por implicación.

AB-18/24/27 están resueltos como producto según sus filas. Retención específica de propuestas, versiones, observaciones y fotografías: aprobada su necesidad, sin plazos ni borrado automático autorizados; los 14 días CI son independientes. Criterios operativos de evidencia/vigencia, catálogo concreto, comunicaciones autorizadas y tratamiento de afirmaciones en texto libre se concretan antes del flujo correspondiente D2/D3.

## Asuntos abiertos y momento de resolución

Antecedente del encargo D2, integrado mediante #18: D1 ya estaba integrado en #17; se autorizó implementar D2 privado en rama nueva, ensayos nuevos aislados y un PR Draft sin merge. Se concretan edición privada de descripción plana acotada, catálogo inicialmente vacío, mensajes explícitos al titular sin copiar review_notes históricas y cuotas sin purgas definitivas. Evidencia registra fuente, responsable, fecha y resultado, pero aprobación operativa permanece bloqueada hasta aprobar criterios por acreditación. [Contrato D2](../private-professional-management.md). D3, vinculaciones, proveedores y despliegue no quedan autorizados.

Los puntos siguientes conservan cuestiones **ABIERTAS**. AB-02 y AB-13 tienen decisiones de producto aprobadas explícitas arriba; solo sus detalles indicados siguen pendientes:

| ID | Pregunta a resolver | Antes de |
| --- | --- | --- |
| AB-01 | ¿Seleccionar antecedentes por categorías, por registros o una combinación? ¿Cómo confirmar y mostrar el alcance final al paciente? | Especificar 2C |
| AB-02 | Entrevista por episodio, respuestas propias históricas separadas de valoración profesional, trazabilidad y no divulgación automática: APROBADO en ADR-016. Pendiente: clasificar campos restantes y representar metadatos, adjuntos, versiones y alcance compartible. ADR-029 agrega la validación profesional explícita antes de activar un episodio nuevo, sin implementarla en B. | Modelo/permisos 2A; divulgación 2C |
| AB-03 | ¿Qué procedimiento separado atenderá solicitudes de acceso clínico/ARCO sin bloqueo arbitrario? La visibilidad ordinaria está decidida en RN-24; notas no visibles automáticamente. | Diseño aplicable y revisión de 5; no limitar derechos por UI |
| AB-04 | ¿Quién verifica identidad y firma presencial, con qué evidencia, independencia, estados y controles? ¿Cómo tratar evidencia incompleta o impugnada? | Consentimiento presencial de 2C |
| AB-05 | ¿Qué duración tendrá el permiso, cuál será la metodología de autorización/verificación y qué ocurre al ampliar alcance, corregir versiones, caducar o revocar? | Contratos de 2C |
| AB-06 | Para datos reales, ¿qué evidencia permite atribuir legacy sin inventar autoría y cómo resolver inciertos con acceso mínimo/auditoría compatibles con RN-27? No exige salvar manualmente la demo desechable. | Migración/permisos 2A |
| AB-07 | ¿Qué política de emergencia/excepción, base, necesidad y auditoría puede validarse jurídicamente? La prohibición de acceso clínico global ordinario de superadmin/admin/support ya está decidida. | Antes de cualquier flujo excepcional; revisión de 5 |
| AB-08 | ¿Qué estados API, orden detallado, caducidad y errores corresponden a las dos vías, rechazos y cancelaciones? ¿Cómo restringir rutas heredadas/invitaciones? Primer vínculo bilateral, cierre sin sucesor y solicitud única/cancelable ya están decididos. | Especificación 2A/2B |
| AB-09 | ¿Cómo resolver espera, recurrencias, conflictos y atribución incierta en cambio/pausa/cierre? Cancelación confirmada de futuras al cambiar y pendientes no completados al cierre ya están decididos. | Flujos 2B; concurrencia 2D |
| AB-10 | ¿Cuándo se activa el acceso de antecedentes respecto al cambio? ¿Cómo pedir permiso nuevo sobre notas de A en B→C? ¿Qué garantías tienen consultas en curso al revocar? | Especificación de 2C |
| AB-11 | ¿Qué almacenamiento temporal y zona gobiernan consultorio/paciente, API/UI y día clínico? ¿Cómo mantener interpretación de datos legacy? | Diseño de 2E |
| AB-12 | ¿Qué roles jurídicos reales, avisos, contratos, conservación, respaldos, restauración y controles operativos se requieren en México? | Diseño aplicable de 2C y salida de 5 |
| AB-13 | Verificación normal de correo/teléfono, sin fusión por contactos; revisión excepcional no clínica por soporte autorizado, auditada y con evidencia adicional cuando proceda: APROBADO en ADR-012. Pendientes los métodos técnicos concretos de verificación excepcional y recuperación. | Identidad/alta 2A y cambio directo 2B |
| AB-14 | Fundamentos de episodios/atribución aprobados en ADR-006. Pendientes contratos/permisos, identidad, notas/adendas y sustitución de todas las rutas heredadas. | Implementación aplicable 2A |
| AB-15 | ¿Qué locks/transacciones, idempotencia, errores y coordinación de lectores/escritores preservan integridad por episodio/participante, tratamientos paralelos, cambios atómicos, pausa/cierre/suspensión y agenda (ADR-030)? | Diseño 2A/2B, ampliación 2C/2D |
| AB-16 | ¿Qué estado técnico, procedimiento y actores resuelven citas pendientes por suspensión, respetando privacidad y sin cancelación automática? | Permisos 2A y flujo 2B; agenda 2D |
| AB-17 | Diseño/ensayo de fundamentos 003 aprobados en ADR-009. Pendientes resolución de legacy real, activación de atribuciones/permisos y autorización/ensayo del rollout de cada entorno. | Antes del despliegue y activación de 2A |
| AB-18 | APROBADO: ID público aleatorio, opaco, estable, independiente y no reutilizable; flags privados/apagados e independientes; retiro en nuevas consultas y sin caché compartida inicial; rehabilitar no restaura flags. Persistencia D1; lectores y reconfirmación D2/D3. Solicitudes pendientes fuera de D. | D1 persistencia; D2/D3 con autorización independiente |
| AB-19 | ¿Qué estados técnicos, plazos de respuesta/confirmación, caducidad, versión de aceptación, cancelación y eventos terminales se aprueban para alta inicial? | Habilitar solicitudes/invitaciones 2A |
| AB-20 | ¿Qué cuotas/ventanas, cooldown, bloqueo y revisión evitan abuso sin exclusión injustificada? ¿Qué política rige invitaciones simultáneas y colisiones entre vías? | Habilitar solicitudes/invitaciones 2A |
| AB-21 | B requiere prefijo internacional explícito y normalización sintáctica (sin inferir país); permite teléfonos compartidos sin unicidad/fusión. Política definitiva de números reciclados/unicidad y entrega comercial pendientes; recuperación AB-13 no habilitada. | Identidad PR B; proveedor antes de producción |
| AB-22 | ¿Qué retención, acceso, cifrado/llaves y tratamiento de mensajes/tokens/evidencia en historial, copias y eliminación se aprueban? | Guardar datos sensibles de vinculación 2A; revisión jurídica aplicable |
| AB-23 | APROBADO e implementado en B: cinco rutas legacy bloqueadas globalmente; pendientes conservados sin respuesta; clínica establecida preservada sin exigir verificaciones adicionales. Nuevas vinculaciones futuras exigirán ambas; no implementadas. | Cerrado para B; integrado en #11 |
| AB-24 | APROBADO: catálogo controlado de enfoques generales; acreditaciones formales en campos protegidos sin exención del cliente; versiones separadas, revisión exacta, razones comunicables y observaciones internas separadas. Rehabilitación exige revisar vigencia no sustentada. D1 prepara almacenamiento; criterio operativo, catálogo y retención concreta pendientes para D2/D3. | D1 persistencia; D2/D3 con autorización independiente |
| AB-25 | APROBADO para C: resolución del 19 de octubre de 2026 y contrato de cambio seguro. Integrado en #12, sin despliegue habitual acreditado. | Cerrado para el alcance C; retención definitiva de auditoría y operación productiva pendientes |
| AB-26 | Segunda revisión B: APROBADA referencia civil America/Mexico_City obtenida del reloj servidor, independiente del host/cliente, solo para registro mexicano B; DOB gregoriana y cumpleaños exacto, con 29/02 elegible el 01/03 en año no bisiesto. No define todas las zonas mexicanas ni cambia agenda 2E; cuotas 60 s/5 por 24 h tanto por cuenta como destino, 5 intentos SMS por código y email previo aprobado. Abuso multicuenta aún puede agotar teléfono compartido; límites por red/costo, mecanismos antiautomatización de producción y revisión siguen pendientes antes de envíos reales. | B parcial; endurecimiento antes de producción |
| AB-27 | APROBADO: acceso restringido al estado propio de pending_review/rejected/suspended sin clínica, con estado vigente, revocación y expiración; cuentas globalmente inactivas siguen rechazadas. Implementación exclusiva D2; D1 no modifica autenticación. | D1 persistencia; D2/D3 con autorización independiente |

Los fundamentos integrados en #8 están delimitados en ADR-006/009; AB-06 no autoriza atribución legacy. Antes de activar el resto de 2A deben cerrarse las propuestas y asuntos bloqueantes aplicables, especialmente AB-02/06/08/13–AB-22. Los mecanismos técnicos D-01–D-12 permanecen PROPUESTOS salvo los requisitos de producto expresamente resueltos en ADR-023–028. AB-23 fue aprobado expresamente en el encargo B; el resto de propuestas no se aprueba por aceptar la división. Los requisitos de producto aprobados no aprueban todos los detalles técnicos de 2A. No inventar respuestas de 2C para cerrar este PR documental; dividir encargos y dependencias según [roadmap.md](roadmap.md).

Pareja y tratamientos paralelos (ADR-030): principios aprobados y mecanismos pendientes. Las precisiones siguientes sustituyen las preguntas de producto originales; no cierran los bloqueos técnicos ni la revisión jurídica:

| ID | Principio aprobado y pendiente específico | Momento bloqueante |
| --- | --- | --- |
| AB-28 | APROBADO: abandono definitivo de un integrante impide continuar normalmente el episodio conjunto; una ausencia aislada no es abandono. Pendientes confirmación, transiciones y resolución de agenda, sin cierre automático por inasistencia (RN-71). | Ciclo de pareja 2A/2B |
| AB-29 | APROBADO: participación voluntaria, nadie obligado a continuar; distinguir pausa temporal, finalización definitiva e inasistencia. Profesional gestiona/documenta sin imponer continuidad. Procedimiento, avisos y transiciones pendientes (RN-71). | Pausa/cierre 2B |
| AB-30 | APROBADO: privacidad ordinaria RN-67, notas sin entrega automática y comunicación deliberada como decisión profesional. Pendientes excepciones, criterios de publicación y tratamiento de derechos de acceso; revisión jurídica AB-36. | Privacidad 2A; resumen/consentimiento 2B/2C |
| AB-31 | APROBADO: seguimiento destinado a cada paciente, tareas individuales propias autorizadas y contenido compartido aprobado para ambos. Pendientes DTO/API y permisos por participante (RN-67). | Permisos y UX de pareja 2A |
| AB-32 | APROBADO: entrevista inicial propia de cada integrante, aceptación expresa de ambos y objetivo conjunto; validación profesional previa ADR-029 intacta (RN-69). Presentación, atribución y garantía técnica backend/DB pendientes. | Antes de activar pareja 2A |
| AB-33 | APROBADO: una negativa impide completar derivación conjunta y las aceptaciones parciales no conceden clínica. Alternativas y resolución posterior pendientes, conservando las dos vías (RN-65). | Derivación de pareja 2B |
| AB-34 | ABIERTA la prevención de duplicados y concurrencia sin exclusividad global por paciente; debe respetar la prohibición aprobada de AB-37 sin imponer límites a tratamientos individuales independientes. | Vinculación/concurrencia 2A |
| AB-35 | APROBADO: sesiones conjuntas e individuales diferenciadas en agenda/notas, sin secuencia fija; ausencia sin conversión automática ni cierre automático (RN-70). Pendientes agenda, tratamiento operativo de inasistencias y atribución, conservando reglas vigentes. | Agenda 2A/2B/2D |
| AB-36 | LEGAL A VALIDAR: revisión jurídica mexicana de consentimiento, confidencialidad, datos, entrega de expedientes y procedimiento ARCO pendiente. Opiniones clínicas no establecen obligaciones ni restricciones legales; privacidad ordinaria no es denegación absoluta de derechos. | Diseño de pareja y preparación para producción |
| AB-37 | RESUELTA COMO PRODUCTO: no permitir dos episodios conjuntos activos simultáneos para la misma pareja, aunque cambien profesional u objetivos (RN-73). Pendientes semántica de pausados y mecanismo técnico seguro antes de implementar. | Alcance/vinculación 2A; implementación pendiente |

## Acciones y supuestos no aprobados

**Estado: NO APROBADA para el alcance actual**, o incompatibles con las reglas firmes según se indica:

- En este encargo documental: modificar backend/frontend, crear o ejecutar migraciones, modificar 001/002/003, ejecutar schema/seed, tocar la base habitual, crear/eliminar contenedores o volúmenes, o hacer merge. La autorización histórica de #8 para ensayar 003 en destinos propios no se extiende a este encargo; no autoriza despliegue ni atribución histórica.
- Tratar como aprobados los nombres/tablas/estados/API/locks/cifrado/plazos propuestos para identidad y vinculación, o los mecanismos pendientes de 2B/2C. Los fundamentos específicos de 003 sí fueron aprobados en ADR-006/009 e integrados en #8.
- Implementar ahora la red estatal/nacional, migración móvil, emergencias o un flujo break-glass por aparecer en la visión futura.
- Conceder expediente por red o backoffice, varios responsables simultáneos en un mismo episodio, heredar consentimiento, compartir automáticamente historial, reutilizar episodios finalizados o cambiar autoría: incompatibles con RN-01–RN-12/27/62–68. Tratamientos paralelos sí están aprobados como producto por ADR-030, con implementación pendiente; no retirar por ello protecciones existentes.
- Convertir carga/casilla profesional en consentimiento verificado, bloquear derivación por negar antecedentes adicionales con resumen aprobado, bloquear cambio directo por A o vetar ARCO: incompatibles con RN-06/08/13/18.
- Completar derivación profesional sin resumen aprobado, mostrar adendas posteriores sin nueva autorización, unir identidades por contacto, exigir CURP universal, cancelar futuras por suspensión automáticamente o reinicializar demo sin autorización separada: incompatibles con RN-04/15/16/22/23/28.
- Asignar automáticamente dueños legacy inciertos, borrar duplicados o trasladar agenda/espera para facilitar la migración: sin aprobación y contrarios al enfoque conservador propuesto.

## Fuentes vigentes y evidencia histórica

[README](../../README.md) es la entrada, [AGENTS](../../AGENTS.md) contiene instrucciones operativas y [arquitectura](../architecture.md) describe la implementación. Las [notas de abril](../archive/notes-2026-04-13.md) son historia, no requisitos. El [inventario documental](../documentation-audit.md) explica traslados, correcciones e instrucciones sustituidas.

Las guías de [integridad](../clinical-data-integrity.md), [autenticación](../authentication-security.md), [fundamentos 003](../clinical-episodes-foundation.md) y su [validación histórica](../clinical-episodes-validation.md) conservan evidencia y procedimientos pertinentes. No trasladar resultados o conteos npm antiguos a una validación nueva. #7 restringió el backoffice; #8 no activó permisos por episodio. La edición versionada actual de notas aún no cumple el objetivo de adendas RN-23.
