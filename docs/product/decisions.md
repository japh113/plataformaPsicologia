# Registro de decisiones de producto y arquitectura

Fecha: 18 de octubre de 2026. Base revisada: `main`/`origin/main` en `b3bfd40`, con PR #7 y #8 integrados. Antecedentes: #5 fijó la base documental; #7 restringió backoffice; #8 integró fundamentos 003. Esto no acredita ejecución de 003 en la base habitual ni autorización clínica por episodio.

Esta actualización exclusivamente documental recoge nuevas decisiones de producto expresamente aprobadas por el usuario: registro independiente, directorio básico y vinculación inicial. ADR-012 se precisa y ADR-020–ADR-022 amplían producto; el [diseño técnico](../stage2a-identity-directory-intake.md) es PROPUESTA pendiente de revisión y aprobación, sin autorización para código ni operaciones de base.

## Estados y uso del registro

- **APROBADA:** decisión de producto o secuencia de trabajo expresamente acordada. No significa implementada.
- **PROPUESTA:** alternativa técnica para discutir y especificar; no autoriza código, SQL ni despliegue.
- **ABIERTA:** pregunta sin resolución aprobada, con etapa en la que debe cerrarse.
- **NO APROBADA:** acción o comportamiento sin autorización para este alcance; no debe incorporarse como requisito acordado.
- **LEGAL A VALIDAR:** consideración o hipótesis para revisión jurídica; no conclusión de cumplimiento.

Cada encargo futuro debe citar estos IDs y cerrar solo las decisiones necesarias para su etapa. Una propuesta pasa a aprobada únicamente con acuerdo explícito registrado en una modificación posterior, explicando consecuencias y criterios; no por aparecer en un PR documental.

Se actualizan ADR-002/003/005/010/011, conservando IDs: resumen obligatorio solo en derivación profesional, archivo completo de episodios propios con adendas, estados del episodio y visión del paciente sustituyen sus formulaciones de #5. ADR-012–ADR-018 registran las nuevas decisiones de dominio; RN-01–RN-40 en [business-rules.md](business-rules.md) son sus reglas verificables. ADR-019 añade el requisito transversal de demos reproducibles a los criterios de aceptación del roadmap. ADR-006/009 se aprueban técnicamente para el PR de fundamentos posterior a #7, con el alcance aditivo descrito abajo; ADR-007/008 siguen siendo propuestas para sus flujos.

## ADR-001 — Consultorios independientes y red sin acceso implícito

**Estado: APROBADA.**

**Contexto:** PsicoPanel sirve a psicólogos independientes con consultorios propios. La visión futura incluye directorio y derivación estatal/nacional.

**Decisión:** no modelar el producto como clínica con pacientes compartidos. La pertenencia a la red nunca concede acceso al expediente. Mantener separación entre backoffice y operación clínica.

**Consecuencia:** permisos ordinarios se justifican por relación asistencial, archivo de episodios propios o autorización expresa; no por membresía. La red avanzada sigue en etapa 6; el directorio básico para vinculación inicial se incorpora a 2A por ADR-020. #7 corrigió los permisos globales de backoffice frente a RN-27/ADR-017; no existe una política de emergencia implícita.

## ADR-002 — Responsabilidad vigente única y ciclo de episodios

**Estado: APROBADA.**

**Decisión:** como máximo un responsable vigente por paciente; episodios `activo` y `pausado` cuentan para exclusividad. Reanudar pausa conserva episodio; tras `finalizado` se abre otro, incluido A→B→A. No sobrescribir episodios ni reatribuir citas/notas. Cualquiera puede iniciar pausa o finalizar unilateralmente con confirmación/motivo apropiado y aviso al otro, resolviendo citas futuras antes sin borrado. Reanudar requiere ambos; pausa impide citas nuevas y permite finalizar. El paciente puede quedar sin responsable (RN-02/03/21).

**Consecuencia:** responsabilidad actual no habilita gestión de episodios cerrados ni antecedentes ajenos. Archivo y adendas propias se rigen por ADR-005/013; alta inicial por ADR-012. Índice y estados técnicos de los fundamentos están aprobados en ADR-006; las transacciones funcionales siguen en ADR-008 y AB-14/15. No interpretar la pausa como vacante para otro responsable.

## ADR-003 — Derivación profesional con resumen y cambio directo

**Estado: APROBADA.**

**Decisión:** dos vías (RN-04–RN-07/18/19):

- **Profesional A→B:** A inicia, paciente acepta cambio, B acepta. A redacta resumen clínico obligatorio; paciente revisa, puede rechazar contenido con motivos y pedir revisiones a A hasta aprobar la versión exacta. Solo esa versión se comunica a B y sin ella no se completa esta vía. A no está obligado a escribir información clínicamente falsa y se conservan borradores/versiones. B conoce identidad del remitente A y datos mínimos, sin notas antes de aprobación pertinente.
- **Directa del paciente:** identidad verificada y aceptación de B, sin consentimiento ni bloqueo de A y sin resumen obligatorio de A. No comparte historial automáticamente. B solo ve los datos básicos proporcionados por el paciente; no divulgar innecesariamente identidad de A. Al completarse A recibe aviso sin conocer nuevo contenido clínico.

En ambas, una sola solicitud pendiente de cambio por paciente, cancelable, y A sigue responsable hasta cambio atómico. Autorizar cambio, aprobar resumen y autorizar antecedentes adicionales son decisiones separadas: negar los adicionales no bloquea derivación con resumen aprobado. Resumen obligatorio no equivale a historial ilimitado.

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

**Decisión:** identidad global única sin búsqueda que revele pacientes de otro consultorio; prevenir duplicados sin unión automática por coincidencias. Todos los pacientes y psicólogos tienen cuenta digital obligatoria. Paciente puede registrarse independientemente sin psicólogo; el registro por sí solo no crea episodio ni concede acceso clínico. Psicólogo también puede invitar a un paciente conocido, aunque este aún no tenga cuenta. Primer responsable solo después de verificación y confirmación bilateral según vía (ADR-021). Si hay episodio vigente, usar cambio. Verificar correo y teléfono al activar y adicionalmente en duplicados/recuperación; no imponer universalmente CURP/documento oficial. Contactos verificados no prueban identidad física única.

El paciente administra nombre, contactos y fecha de nacimiento globales; el psicólogo solicita corrección, no cambia identidad. Básicos acompañan al paciente tras cambio confirmado; clínicos por episodio.

**AB-13 — Identidad y recuperación: decisión de producto APROBADA.** Verificación de correo y teléfono en el flujo normal; nunca fusionar identidades automáticamente por coincidencia de contactos. Los casos excepcionales requieren revisión por personal autorizado de soporte, limitada a datos no clínicos y auditada, con evidencia adicional cuando sea necesaria. No revelar relaciones entre pacientes y otros consultorios. **Pendiente de diseño técnico:** métodos concretos de verificación excepcional, evidencia y controles de recuperación. Este acuerdo no autoriza implementar esos flujos en el primer PR de permisos de 2A. El resto de campos y almacenamiento sigue en AB-02/14.

## ADR-013 — Nota finalizada inmutable y adendas propias

**Estado: APROBADA. Planificar en 2A; entrega transversal y consentimiento en 2C. Regla: RN-23.**

**Decisión:** borradores editables; finalizar nota la vuelve inmutable. Corregir mediante adendas vinculadas con autor, fecha y motivo, sin sobrescribir original. Autor puede añadirlas solo a notas propias aun con episodio cerrado, como excepción a lectura histórica. Receptor de nota autorizada no ve adendas posteriores sin NUEVA autorización expresa del paciente. No confundir preservar versiones con permitir sobrescribir una nota finalizada.

**Abierto:** estructura, contratos y reparto en PR posteriores; conservar 001/002 y reglas cita completada/no futura sin alterarlas aquí.

## ADR-014 — Agenda y comunicación al cambiar

**Estado: APROBADA. Etapas: 2A/2B, concurrencia en 2D. Reglas: RN-18–RN-20.**

**Decisión:** notificar a A al completar cualquier cambio. Mostrar al paciente futuras citas con A y exigir confirmación de cancelación; cancelarlas consistentemente con el cambio atómico, conservar histórico, sin reprogramar con B. Datos visibles según vía en ADR-003. Resolver agenda también antes de pausa/cierre; procedimiento de espera, recurrencias y conflictos sigue AB-09/15.

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

**Decisión:** usuario confirma que datos presentes en demo local son de prueba y desechables; no construir conciliación manual exclusivamente para salvarlos. Nunca asumir bases reales borrables. Planificar migración segura, legacy y rollout para datos reales (ADR-009); cualquier reinicialización demo exige autorización separada. En aquel encargo documental 003 aún no existía. #8 ya integró su implementación y evidencia aislada; no autoriza despliegue. El presente encargo no toca bases o volúmenes ni ejecuta schema/seeds/migraciones.

## ADR-019 — Escenarios demo ficticios y reproducibles por subetapa

**Estado: APROBADA expresamente por el usuario como requisito de futuras implementaciones. Etapas: 2A–2E.**

**Decisión:** cada subetapa incorpora escenarios demo conforme implemente sus funcionalidades, con datos ficticios y reproducibles y distintas cuentas de psicólogos y pacientes. Deben permitir iniciar sesión y comprobar visualmente permisos, denegaciones y flujos, con estado inicial, pasos de acceso/recorrido y resultados esperados documentados. La cobertura por subetapa está en [roadmap.md](roadmap.md).

Datos y cuentas demo exclusivamente para desarrollo, aislados de datos reales y nunca habilitados ni cargados automáticamente en producción. Cada entrega debe incluir un procedimiento explícito y seguro de generación/restablecimiento: verificar entorno de desarrollo y destino aislado nuevo, detenerse si existe el destino o si no es desarrollo, y reproducir el estado inicial sin sobrescribir bases ni volúmenes existentes. Restablecer debe usar otro destino aislado nuevo; documentar selección de cuentas y comprobación del estado inicial. Los comandos y el mecanismo técnico se diseñarán en la implementación correspondiente; no se afirma que existan hoy.

**Consecuencia:** demo verificable y pruebas automatizadas obligatorias son entregables complementarios de cada subetapa; la demo no sustituye pruebas ni permite posponerlas hasta 3. El carácter desechable de la demo previa (ADR-018/RN-28) no autoriza sobrescribir bases existentes. Este acuerdo documental tampoco autoriza generar/restablecer datos ni ejecutar código, SQL, schema, seeds o migraciones ahora; cualquier actuación sobre la demo actual sigue requiriendo autorización separada. No cambia las propuestas de migración/rollout ni habilita demos en producción.

## ADR-020 — Perfil público opcional y directorio básico en 2A

**Estado: APROBADA como decisión de producto; implementación pendiente. Reglas: RN-30–RN-33.**

**Decisión:** cada psicólogo elige si publica su perfil; todos privados por defecto y solo aprobados pueden activar publicación. Visibilidad y recepción de nuevos pacientes son configuraciones independientes. Un profesional público puede no aceptar solicitudes; puede invitar directamente a pacientes conocidos aunque no acepte solicitudes públicas. Publicación nunca expone pacientes, expedientes ni relaciones terapéuticas.

Cualquier visitante consulta perfiles públicos sin registrarse. Solo pacientes autenticados y con verificaciones exigidas solicitan atención desde perfiles públicos que aceptan nuevos pacientes. En 2A entra exclusivamente directorio básico e información profesional mínima necesaria para vinculación inicial. Reseñas, reputación, filtros avanzados y funciones de red siguen en etapa 6 con diseño posterior de privacidad.

**Consecuencias y pendientes:** no publicar perfiles existentes automáticamente. Campos públicos exactos, identificador, caché y comportamiento de solicitudes en curso al cambiar configuraciones requieren aprobación técnica (AB-18). Aprobar un profesional no equivale a que elija publicar ni a garantía de reputación.

## ADR-021 — Vinculación inicial bilateral, separada del episodio

**Estado: APROBADA como decisión de producto; implementación pendiente. Reglas: RN-29/34–RN-36/40.**

**Decisión:** invitación profesional a paciente conocido: este se registra si hace falta, verifica datos y acepta expresamente; la invitación sola no crea episodio ni acceso. Solicitud del paciente: consulta perfil público que admite nuevos pacientes y envía petición, con mensaje breve opcional y sin exigir motivo de consulta. El profesional acepta o rechaza; si acepta, el paciente debe confirmar finalmente. Solo al completar confirmaciones y verificaciones pertinentes se crea el episodio transaccionalmente.

El mensaje es privado y sensible: no aparece en directorio ni auditoría administrativa. Ninguna solicitud pendiente concede acceso clínico. PostgreSQL conserva máximo un episodio activo o pausado por paciente; no revelar vínculos con otros consultorios. Si existe episodio vigente, corresponde cambio 2B, sin reutilizar este flujo como atajo. Permisos clínicos por episodio, nunca por aparecer en directorio.

**Consecuencias y pendientes:** la separación funcional de vinculación y episodio está aprobada. Como propuesta técnica, se recomienda persistir solicitudes/invitaciones fuera de `clinical_episodes` y no tratarlas como `care_relationships` activas que sincronicen permisos legacy. Estados/nombres de almacenamiento, API, locks, idempotencia, protección del mensaje y sucesoras de 003 son PROPUESTAS en el [diseño](../stage2a-identity-directory-intake.md). No cambian derivación, resumen, consentimiento adicional, archivo, ARCO ni responsabilidad vigente de ADR-002–ADR-018.

## ADR-022 — Cupo de solicitud inicial y prevención de abuso

**Estado: APROBADA como decisión de producto; parámetros y políticas técnicas ABIERTOS. Reglas: RN-37–RN-39.**

**Decisión:** máximo una solicitud inicial pendiente iniciada por paciente; ocupa cupo esperando respuesta o confirmación final. Es cancelable por el paciente y las solicitudes caducan. Debe haber protecciones contra solicitudes/cancelaciones masivas, automatización y acoso. Rechazar no debe permitir acoso reiterado ni impedir injustificadamente atención.

Invitaciones profesionales se administran separadamente del cupo del paciente. No queda aprobada una política definitiva para invitaciones simultáneas de profesionales distintos; exclusividad de episodio vigente sí permanece obligatoria. Tampoco se mezcla este cupo con el de cambio en RN-19.

**Pendiente de aprobación antes de habilitar los flujos:** plazos por estado, límites de frecuencia, cooldown, bloqueos y revisión, simultaneidad de invitaciones y tratamiento de solicitudes en curso. El diseño propone mecanismos, sin fijar valores ni reglas definitivas por defecto (AB-19/20).

## Asuntos abiertos y momento de resolución

Los puntos siguientes conservan cuestiones **ABIERTAS**. AB-02 y AB-13 tienen decisiones de producto aprobadas explícitas arriba; solo sus detalles indicados siguen pendientes:

| ID | Pregunta a resolver | Antes de |
| --- | --- | --- |
| AB-01 | ¿Seleccionar antecedentes por categorías, por registros o una combinación? ¿Cómo confirmar y mostrar el alcance final al paciente? | Especificar 2C |
| AB-02 | Entrevista por episodio, respuestas propias históricas separadas de valoración profesional, trazabilidad y no divulgación automática: APROBADO en ADR-016. Pendiente: clasificar campos restantes y representar metadatos, adjuntos, versiones y alcance compartible. | Modelo/permisos 2A; divulgación 2C |
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
| AB-15 | ¿Qué locks/transacciones, idempotencia, errores y coordinación de lectores/escritores preservan exclusividad, cambios atómicos, pausa/cierre/suspensión y agenda? | Diseño 2A/2B, ampliación 2C/2D |
| AB-16 | ¿Qué estado técnico, procedimiento y actores resuelven citas pendientes por suspensión, respetando privacidad y sin cancelación automática? | Permisos 2A y flujo 2B; agenda 2D |
| AB-17 | Diseño/ensayo de fundamentos 003 aprobados en ADR-009. Pendientes resolución de legacy real, activación de atribuciones/permisos y autorización/ensayo del rollout de cada entorno. | Antes del despliegue y activación de 2A |
| AB-18 | ¿Qué campos mínimos e identificador público, configuración de admisión, caché y tratamiento de pendientes ante despublicación/cierre de admisión se aprueban? | Implementación del directorio básico de 2A |
| AB-19 | ¿Qué estados técnicos, plazos de respuesta/confirmación, caducidad, versión de aceptación, cancelación y eventos terminales se aprueban para alta inicial? | Habilitar solicitudes/invitaciones 2A |
| AB-20 | ¿Qué cuotas/ventanas, cooldown, bloqueo y revisión evitan abuso sin exclusión injustificada? ¿Qué política rige invitaciones simultáneas y colisiones entre vías? | Habilitar solicitudes/invitaciones 2A |
| AB-21 | ¿Qué normalización, métodos y proveedores de correo/teléfono, recuperación excepcional, revalidación y controles de entrega se aprueban? | Identidad verificada 2A; AB-13 sigue abierto técnicamente |
| AB-22 | ¿Qué retención, acceso, cifrado/llaves y tratamiento de mensajes/tokens/evidencia en historial, copias y eliminación se aprueban? | Guardar datos sensibles de vinculación 2A; revisión jurídica aplicable |

Los fundamentos integrados en #8 están delimitados en ADR-006/009; AB-06 no autoriza atribución legacy. Antes de activar el resto de 2A deben cerrarse las propuestas y asuntos bloqueantes aplicables, especialmente AB-02/06/08/13–AB-22. Las decisiones técnicas D-01–D-12 del diseño permanecen PROPUESTAS hasta aprobación explícita. Los requisitos de producto aprobados no aprueban todos los detalles técnicos de 2A. No inventar respuestas de 2C para cerrar este PR documental; dividir encargos y dependencias según [roadmap.md](roadmap.md).

## Acciones y supuestos no aprobados

**Estado: NO APROBADA para el alcance actual**, o incompatibles con las reglas firmes según se indica:

- En este encargo documental: modificar backend/frontend, crear o ejecutar migraciones, modificar 001/002/003, ejecutar schema/seed, tocar la base habitual, crear/eliminar contenedores o volúmenes, o hacer merge. La autorización histórica de #8 para ensayar 003 en destinos propios no se extiende a este encargo; no autoriza despliegue ni atribución histórica.
- Tratar como aprobados los nombres/tablas/estados/API/locks/cifrado/plazos propuestos para identidad y vinculación, o los mecanismos pendientes de 2B/2C. Los fundamentos específicos de 003 sí fueron aprobados en ADR-006/009 e integrados en #8.
- Implementar ahora la red estatal/nacional, migración móvil, emergencias o un flujo break-glass por aparecer en la visión futura.
- Conceder expediente por red o backoffice, aceptar dos responsables vigentes (incluida pausa), heredar consentimiento, compartir automáticamente historial, reutilizar episodios finalizados o cambiar autoría: incompatibles con RN-01–RN-12/27.
- Convertir carga/casilla profesional en consentimiento verificado, bloquear derivación por negar antecedentes adicionales con resumen aprobado, bloquear cambio directo por A o vetar ARCO: incompatibles con RN-06/08/13/18.
- Completar derivación profesional sin resumen aprobado, mostrar adendas posteriores sin nueva autorización, unir identidades por contacto, exigir CURP universal, cancelar futuras por suspensión automáticamente o reinicializar demo sin autorización separada: incompatibles con RN-04/15/16/22/23/28.
- Asignar automáticamente dueños legacy inciertos, borrar duplicados o trasladar agenda/espera para facilitar la migración: sin aprobación y contrarios al enfoque conservador propuesto.

## Referencias y discrepancias de contexto existentes

[README.md](../../README.md), [ARCHITECTURE.md](../../ARCHITECTURE.md), [AGENTS.md](../../AGENTS.md), [NOTES.md](../../NOTES.md), [clinical-data-integrity.md](../clinical-data-integrity.md) y [authentication-security.md](../authentication-security.md) se leyeron para contrastar el estado. `NOTES.md` tiene fecha de abril de 2026; `ARCHITECTURE.md` aún menciona falta de tests y módulos legacy, mientras hoy existen suites en [backend/test](../../backend/test). Las guías de seguridad conservan evidencia histórica previa a #4; no asumir que sus conteos npm describen el estado posterior.

Las referencias antiguas a trabajar/push en `main` no sustituyen los encargos con rama y PR sin merge. La exención de tests npm correspondía al PR solo documental; el primer PR de 2A sí exige pruebas, lint y build, con integración exclusivamente aislada y desechable. Las indicaciones históricas sobre schema/seed no autorizan ejecutarlos en la base habitual. El «acceso maestro» de `superadmin` en AGENTS.md se subordina a RN-27, implementada en #7 para backoffice. La edición versionada previa sigue pendiente de alineación con RN-23 y la autorización clínica por episodio no fue activada por #8. La restricción a cuatro archivos correspondía al encargo documental anterior. Futuras tareas deben distinguir decisiones objetivo y comportamiento implementado.
