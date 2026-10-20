# Reglas de negocio y permisos

Actualización D1: AB-18/24/27 y división D1/D2/D3 aprobados; únicamente persistencia privada/006 en implementación autorizada. [Contrato D1](../professional-persistence.md). A/B/C y CI integrados; sin despliegue ni permisos por episodio. ADR-029/RN-59–61 intactas.

## Conceptos

| Concepto | Significado |
| --- | --- |
| Responsabilidad vigente | Único psicólogo a cargo de un episodio `activo` o `pausado`; ambos cuentan para exclusividad. No equivale a la figura jurídica de responsable del tratamiento de datos. |
| Episodio | Periodo de atención con estados `activo`, `pausado`, `finalizado`. Reanudar pausa conserva episodio; regresar tras finalización crea otro. |
| Vinculación inicial | Alta bilateral sin responsabilidad vigente; una solicitud o invitación pendiente no es un episodio ni una autorización clínica. No equivale al cambio de 2B. |
| Solicitud inicial del paciente | Petición a un perfil público que acepta nuevos pacientes; ocupa el cupo único hasta resolución, incluida espera de confirmación final. |
| Invitación profesional inicial | Invitación a paciente conocido, incluso si aún no tiene cuenta; separada del cupo de solicitudes iniciadas por paciente. |
| Derivación profesional (ordinaria) | Cambio iniciado por A, aceptado por paciente y B, con resumen obligatorio de A cuya versión exacta aprueba el paciente. |
| Cambio directo | Solicitud iniciada por paciente con identidad verificada y aceptación de B; no requiere consentimiento ni resumen de A. |
| Antecedentes adicionales | Información clínica opcional, distinta del resumen obligatorio de derivación, con alcance expresamente autorizado. |
| Lectura archivada | Consulta del expediente clínico completo de los propios episodios; sin gestión del paciente ni episodios ajenos. Solo permite añadir adendas a notas propias. |
| Evidencia de consentimiento | Registro que permite acreditar quién autorizó qué, mediante qué canal y con qué verificación. Su metodología detallada sigue abierta. |

## Requisitos aprobados

| ID | Regla inequívoca |
| --- | --- |
| RN-01 | Los consultorios son independientes. Estar en la plataforma, red o directorio nunca concede acceso clínico por sí mismo. |
| RN-02 | Como máximo un psicólogo tiene responsabilidad vigente por paciente. Episodios activos y pausados cuentan para exclusividad; finalizar puede dejar al paciente sin responsable. |
| RN-03 | Cada atención tras cambio de responsable o tras finalización abre otro episodio. A→B→A no reactiva ni sobrescribe el primer episodio de A; reanudar una pausa sí conserva el mismo. |
| RN-04 | La derivación profesional la inicia A; requiere aceptación expresa del cambio por el paciente, aceptación de B y resumen clínico obligatorio elaborado por A. El paciente revisa, puede rechazar contenido con motivos y solicitar revisiones hasta aprobar la versión exacta; solo esa versión se comunica a B. Sin resumen aprobado no se completa esta vía. |
| RN-05 | Hasta el cambio atómico el anterior permanece responsable. Una aceptación parcial o la mera solicitud no conceden acceso clínico; el resumen y cualquier antecedente requieren la aprobación pertinente. En cambio directo rige RN-18, sin acuerdo obligatorio de A. |
| RN-06 | Aceptar el cambio, aprobar el resumen obligatorio y autorizar antecedentes adicionales son decisiones distintas. Negar historial adicional no bloquea una derivación con resumen aprobado y demás condiciones cumplidas; el resumen no habilita acceso ilimitado. En cambio directo no se exige resumen de A. |
| RN-07 | En transferencia ordinaria el origen propone qué antecedentes compartir y el paciente autoriza expresamente el alcance. No se comunica más de lo autorizado. No se da al destinatario autoría ni edición de notas ajenas. |
| RN-08 | Se admiten consentimiento digital mediante cuenta autenticada del paciente y presencial mediante documento firmado, con identidad y evidencia verificadas y registradas. Subir un archivo o marcar una casilla por el profesional no equivale automáticamente a consentimiento verificado. |
| RN-09 | Debe existir revocación para restringir accesos futuros y un registro auditable de autorizaciones y revocaciones. Revocar no borra la evidencia ni promete recuperar información ya consultada o recibida. |
| RN-10 | El psicólogo histórico conserva lectura archivada del expediente clínico completo de sus propios episodios: notas, citas, entrevista, evaluación de riesgo, tareas, objetivos y contexto. No puede gestionar al paciente ni ver episodios ajenos. La excepción de escritura son adendas solo a notas propias (RN-23). Sustituye el archivo limitado a notas de #5. |
| RN-11 | El nuevo responsable ve antecedentes de otro profesional solo si están expresamente autorizados para ese acceso. Los consentimientos no se heredan en cadenas de derivación. |
| RN-12 | No se borran ni reescriben expedientes, autoría o citas históricas al cambiar o cerrar atención. Preservar integridad, borradores/versiones de resúmenes y originales de notas finalizadas; las correcciones de estas son adendas (RN-23). |
| RN-13 | Las solicitudes ARCO, incluido acceso del paciente a sus datos, se atienden por un procedimiento separado del permiso de divulgación en derivaciones. No existe un veto absoluto del origen al ejercicio de esos derechos. |
| RN-14 | México es referencia inicial. Las consideraciones jurídicas, roles de tratamiento y excepciones requieren validación; estas reglas del flujo ordinario no son una afirmación universal sobre todas las transferencias médicas. |
| RN-15 | Identidad de paciente GLOBAL única, con consultorios independientes y búsqueda que no revele que un paciente está en otro consultorio. Evitar duplicados sin unir automáticamente coincidencias: correo/teléfono verificados no prueban por sí solos identidad física única. |
| RN-16 | Pacientes y psicólogos tendrán cuentas digitales obligatorias. Registro autogestionado o invitación del psicólogo; este es primer responsable solo tras confirmar ambos el vínculo y verificar identidad. Si existe episodio vigente, usar cambio, nunca segundo responsable. Verificación progresiva: correo y teléfono al activar y adicional ante duplicados o recuperación; sin CURP ni documento oficial universal por defecto. AB-13: nunca fusionar por contactos; revisión excepcional por soporte autorizado, solo datos no clínicos, auditada y con evidencia adicional cuando proceda, sin revelar otros consultorios. Métodos técnicos excepcionales pendientes. |
| RN-17 | El paciente administra nombre, contactos y fecha de nacimiento globales. El psicólogo puede pedir corrección, no modificar identidad global. Los datos básicos siguen al paciente tras cambio confirmado; los clínicos quedan en el episodio. Otros campos globales/clínicos requieren clasificación explícita. |
| RN-18 | El paciente puede iniciar cambio directo con verificación de identidad y aceptación de B. A no debe consentir ni puede bloquear; su resumen no es obligatorio y no se comparte historial automáticamente. Al completarse se notifica a A sin revelar nuevo contenido clínico ni divulgar innecesariamente su identidad a B. |
| RN-19 | Solo una solicitud pendiente de CAMBIO por paciente, iniciada por A o paciente, cancelable. En derivación profesional B ve identidad de remitente A y datos mínimos, sin notas antes de aprobación pertinente; en solicitud directa B solo ve datos básicos proporcionados por paciente. Revisar el resumen no obliga al autor a escribir información clínicamente falsa. |
| RN-20 | Al confirmar cambio, mostrar al paciente citas futuras con A y requerir confirmación de su cancelación; cancelarlas de forma consistente con el cambio, conservar histórico y no reprogramarlas automáticamente con B. Notificar a A al completarse. |
| RN-21 | Paciente o psicólogo pueden iniciar pausa o finalizar unilateralmente con confirmación/motivo apropiado y notificación al otro, resolviendo antes citas futuras sin borrado. Pausa impide crear citas nuevas; reanudar exige confirmación de ambos. Cualquiera puede finalizar durante pausa; finalizar puede dejar al paciente sin responsable. |
| RN-22 | Psicólogo suspendido: JWT inválido, sin nuevas citas; el paciente puede cambiar directamente sin su autorización. No finalizar episodios automáticamente. Citas futuras pendientes de resolución, con aviso al paciente sin motivo privado de suspensión, sin cancelación automática. Rehabilitar no restaura vínculos cambiados ni citas canceladas. |
| RN-23 | Borradores de notas editables; nota finalizada INMUTABLE. Correcciones mediante adendas vinculadas con autor, fecha y motivo, sin sobrescribir original. Autor puede añadirlas a notas propias incluso en episodio cerrado. Una adenda posterior a una nota compartida requiere NUEVA autorización expresa del paciente para que el receptor la vea. |
| RN-24 | El paciente ve citas, tareas, objetivos compartidos y resúmenes para él, incluido histórico de sus actividades. Las notas profesionales no son visibles automáticamente; acceso clínico/derechos ARCO se tramitan aparte sin bloqueo arbitrario (RN-13). |
| RN-25 | Riesgo clínico POR EPISODIO; uno nuevo comienza NO EVALUADO, nunca sin riesgo por defecto. Una entrevista independiente por episodio, sin compartir automáticamente la anterior al cambiar de psicólogo. AB-02: respuestas del paciente separadas de valoración profesional; paciente puede completar y consultar sus respuestas incluso históricamente, con trazabilidad de correcciones. La valoración profesional no se muestra automáticamente, sin limitar ARCO. Antecedentes autorizados no sustituyen entrevista ni evaluación propias. |
| RN-26 | Tareas y objetivos POR EPISODIO. Al cerrar, pendientes quedan registrados como no completados por cierre, sin inventar completitud; paciente conserva lectura histórica de sus actividades. |
| RN-27 | `superadmin`, `admin` y `support` sin acceso global ordinario a registros clínicos, entrevistas, notas, exportaciones ni alteración clínica. Los permisos globales previos de `superadmin` eran brecha, corregida para backoffice por #7, no política aprobada. Emergencias pendientes de diseño/validación jurídica, sin puerta trasera. |
| RN-28 | Datos de la demo local confirmados por usuario como de prueba y desechables: no construir conciliación manual exclusivamente para salvarlos. Nunca extenderlo a bases reales. Migración futura segura para datos reales; reinicializar demo requiere autorización separada y no se tocan ahora volúmenes existentes. |
| RN-29 | El paciente puede registrarse independientemente, sin psicólogo. Mantiene identidad global y verificación de correo y teléfono; registrarse no crea episodio ni concede acceso clínico a un profesional. |
| RN-30 | Cada psicólogo decide publicar su perfil, privado por defecto. Solo profesionales aprobados pueden activarlo públicamente. La publicación no expone pacientes, expedientes ni relaciones terapéuticas. |
| RN-31 | Visibilidad pública y recepción de nuevos pacientes son configuraciones independientes. Un perfil público puede indicar que no acepta nuevos pacientes; ello no impide invitar directamente a pacientes conocidos. |
| RN-32 | Cualquier visitante puede consultar perfiles públicos e información profesional mínima sin registro. El directorio básico pertenece a 2A; reseñas, reputación, filtros avanzados y funciones de red quedan en 6 y requieren diseño posterior de privacidad. |
| RN-33 | Solo pacientes autenticados y con las verificaciones exigidas pueden solicitar atención desde un perfil público que acepte nuevos pacientes. |
| RN-34 | El psicólogo invita a un paciente conocido; este se registra si es necesario, verifica sus datos y acepta expresamente. La invitación sola no crea episodio ni permisos clínicos: se requieren las confirmaciones y validaciones pertinentes. |
| RN-35 | El paciente puede enviar solicitud inicial con mensaje breve OPCIONAL; no se exige explicar motivo de consulta. El psicólogo acepta o rechaza; si acepta, el paciente debe confirmar finalmente la vinculación y completar las verificaciones correspondientes. La activación es distinta y exige RN-59. |
| RN-36 | El mensaje opcional es privado y sensible; no aparece en directorio ni auditoría administrativa. Su existencia no habilita lectura del expediente. |
| RN-37 | Cada paciente tiene como máximo UNA solicitud inicial pendiente iniciada por él. Ocupa el cupo esperando respuesta profesional o confirmación final del paciente. Este cupo es distinto de RN-19 (cambio). |
| RN-38 | El paciente puede cancelar su solicitud inicial y las solicitudes caducan. Plazos, límites de frecuencia y políticas de bloqueo requieren diseño y aprobación; no se fijan aquí. |
| RN-39 | Debe haber protección frente a solicitudes/cancelaciones masivas, automatización y acoso. Los rechazos no habilitan acoso repetitivo ni bloquean injustificadamente acceso a atención. Invitaciones profesionales se gestionan separadamente: no hay política definitiva aprobada sobre simultáneas de distintos profesionales. |
| RN-40 | Solicitudes pendientes no conceden acceso clínico. Crear episodio es transaccional, conserva la garantía PostgreSQL de uno activo o pausado por paciente y no revela otros consultorios. Con episodio vigente corresponde cambio 2B; los permisos clínicos son por episodio, nunca por directorio o aceptación parcial. |

## Requisitos adicionales posteriores a PR #9

| ID | Regla inequívoca |
| --- | --- |
| RN-41 | Registro independiente solo con edad >=18 y DOB global obligatoria, validada en backend: fechas reales, no futuras y bordes de edad. B usa referencia civil America/Mexico_City del reloj servidor, sin zona cliente/host; para DOB 29/02 espera al 01/03 en año no bisiesto (aprobado en segunda revisión). Solo elegibilidad de registro, sin política global o cambio de agenda. Menores, incluidos invitados, necesitan política pendiente; no abrir altas alternativas. |
| RN-42 | Registrar no exige motivo, entrevista, riesgo, CURP o documento oficial y no crea vínculo, episodio ni permisos. Puede registrarse y consultar directorio sin terminar verificaciones. |
| RN-43 | No deducir DOB de edad/entrevista, identidad de contactos, verificación de cuenta previa ni episodios/responsable del vínculo actual. No fusionar coincidencias ni reatribuir historia. |
| RN-44 | Email mediante enlace impredecible, único y de un uso, válido 24 h. Mínimo 60 s entre solicitudes y máximo 5 enlaces por dirección en ventana de 24 h; nuevo enlace invalida anterior. |
| RN-45 | SMS mediante código válido 10 min, mínimo 60 s entre solicitudes, máximo 5 SMS por número en ventana de 24 h y 5 intentos por código. Nuevo código invalida anterior; exceso restringe operación temporalmente, no toda la cuenta. |
| RN-46 | Proteger contra enumeración de correo registrado, automatización, fuerza bruta, reenvíos concurrentes, múltiples cuentas, consumo abusivo y bloqueo provocado por terceros. Cuotas no se reinician por reenviar. |
| RN-47 | Secretos almacenados de forma segura, sin tokens/códigos en logs, auditoría o respuestas públicas. Entrega configurable y simuladores seguros locales; sin habilitar proveedor real o credenciales de producción. |
| RN-48 | Backend comprueba ambos contactos vigentes verificados en operaciones sensibles que lo requieran. Sesión, dato del cliente o verificación antigua no sustituyen la comprobación; catálogo B: nuevas vinculaciones bloqueadas; clínica ya establecida sin requisitos nuevos. Solicitar SMS exige email vigente verificado (aprobación del encargo B). |
| RN-49 | Cambio de contacto: reautenticación reciente con contraseña, aviso al anterior sin veto ni exigir acceso antiguo, verificación del nuevo, invalidación de evidencia anterior del canal y confirmación consistente. Recuperación excepcional pendiente. |
| RN-50 | Confirmar cambio de contacto invalida todas las sesiones por session_version, incluida la actual, sin modificar registros clínicos. Probar regresión JWT y concurrencia. |
| RN-51 | Campos públicos: nombre profesional, foto opcional, formación, cédula, especialidades, enfoque, modalidad presencial/en línea/ambas, ciudad/estado, descripción breve y recepción de nuevos pacientes. Excluir precios, reseñas, agenda pública y contacto personal. |
| RN-52 | Perfil privado y recepción desactivada inicialmente; controles independientes. Solo aprobado publica, sin publicar existentes automáticamente. Público sin admisión válido; futuras invitaciones directas independientes. |
| RN-53 | Foto/descripción/modalidad/ubicación editables directamente. Formación/cédula/credenciales verificables requieren revisión administrativa; especialidad/enfoque también cuando declaren credencial verificable. |
| RN-54 | Mientras se revisa, público ve última versión aprobada; pendiente solo titular y administradores revisores autorizados. Aprobación actualiza versión pública si elegible/pública; rechazo conserva anterior y comunica razón. Eventos sin acceso clínico. |
| RN-55 | Directorio anónimo mediante proyección explícita limitada, sin pacientes, relaciones, cuentas privadas, notas de revisión ni metadatos administrativos. Titular no modifica aprobación ni publica pendientes por otra ruta. |
| RN-56 | Suspendido/inactivo/sin aprobación desaparece y no recibe nuevas solicitudes públicas. Rehabilitar exige reconfirmar publicación y recepción; conserva información aprobada salvo revisión necesaria. Sin motivo público ni cambios automáticos de historia clínica. |
| RN-57 | Auditar todas las mutaciones legacy de vínculos y acceso para cuentas nuevas y existentes; bloqueo/adaptación y pérdida funcional requieren aprobación expresa. Registro, verificación y directorio no habilitan clínica; no activar permisos por episodio con fallback sin retirar coordinadamente. |
| RN-58 | A→B→C→D conserva su orden; A/B/C integrados. División interna D1 persistencia privada/006, D2 gestión privada/estado restringido y D3 directorio aprobada; solo D1 autorizado ahora. Pruebas aisladas por entrega, sin solicitudes/invitaciones nuevas, permisos por episodio o recuperación excepcional. SQL 001–005/hashes intactos y sin recursos habituales. |
| RN-59 | Antes de activar cualquier episodio terapéutico nuevo debe existir entrevista inicial completada y validada expresamente por el psicólogo responsable para ese episodio. El paciente puede aportar información; el profesional determina completitud y suficiencia. Una entrevista de otro profesional/episodio no autoriza automáticamente el nuevo. Ningún episodio nuevo active sin validación previa; la futura implementación debe imponerlo en backend y base de datos. Precondición técnica pendiente, fuera de PR B, sin nuevas tablas/migraciones ahora. |
| RN-60 | Registro, login, identidad y verificación de contactos no dependen de entrevista ni vínculo/episodio. Una entrevista pendiente no bloquea globalmente funciones personales; se ofrece acceso explícito y cerrable cuando corresponda, sin completarla automáticamente ni alterar clínica existente. Conservar reglas específicas de escritura/edición autorizada. |
| RN-61 | Vinculación bilateral y activación del episodio son operaciones distintas; vincular no activa ni valida entrevista por sí mismo. No inferir episodios nuevos activos desde care_relationships.status=active ni aplicar RN-59 retroactivamente a legacy. Conservar datos y permisos históricos; no entrevistas ficticias ni completitud/validaciones automáticas. |

La resolución AB-25 del 19 de octubre de 2026 concreta RN-49–50 para C: contraseña 10 minutos por sesión/versión, candidato de 24 horas y verificación separada, avisos durables de hasta 72 horas, cuotas y protección temporal aprobadas. [Contrato C](../contact-changes.md). No cambia RN-59–61 ni autoriza D o despliegue habitual.

## Precisiones aprobadas para D1/D2/D3

AB-18 exige ID público aleatorio estable/no reutilizable, retiro en nuevas consultas, sin caché compartida inicial y reconfirmación de preferencias tras rehabilitación. AB-24 concreta catálogo controlado general, declaraciones formales protegidas, decisión sobre versión exacta y separación de motivo comunicable/observaciones internas; vigencia no sustentada exige nueva revisión. AB-27 habilitará únicamente estado propio restringido en D2, nunca clínica ni cuentas globalmente inactivas. D1 solo prepara persistencia y no modifica estas capacidades actuales. Retención de datos de producto pendiente de plazos, sin TTL/borrado automático; distinta de los 14 días CI.

## Matriz breve de actores y permisos objetivo

Esta matriz limita permisos clínicos ordinarios. No crea nuevos roles técnicos ni autoriza accesos de emergencia. La disponibilidad actual puede diferir; véase [roadmap.md](roadmap.md).

| Actor o situación | Lectura clínica | Escritura clínica | Derivación y consentimiento |
| --- | --- | --- | --- |
| Psicólogo con responsabilidad vigente | Información de su episodio; antecedentes ajenos solo autorizados | Operación según estado; pausa impide nuevas citas. Borradores propios editables; notas finalizadas solo con adendas | Inicia derivación profesional y redacta resumen; no bloquea cambio directo |
| Visitante del directorio | Solo información profesional pública mínima, sin datos de pacientes | Ninguna | Consultar no permite solicitar sin autenticación/verificaciones |
| Profesional con solicitud o invitación inicial pendiente | Solo datos mínimos del flujo y mensaje privado autorizado al destinatario; sin expediente | Ninguna por la solicitud/invitación | Su aceptación no sustituye la confirmación final exigida al paciente |
| Destinatario con solicitud pendiente de cambio | Solo datos mínimos según vía; resumen aprobado/antecedentes solo con autorización pertinente, nunca expediente por mera solicitud | Ninguna escritura clínica por esa solicitud | Acepta recibir al paciente; esa aceptación no sustituye la del paciente |
| Destinatario tras completar el cambio | Información de su nuevo episodio; historial anterior solo si está autorizado | Su nuevo episodio y sus propias notas | La aceptación del cambio no lo autoriza a recibir todo el historial |
| Psicólogo histórico | Expediente clínico completo de sus propios episodios, sin episodios ajenos ni gestión actual | Solo adendas a notas propias, sin sobrescribir originales | Conserva trazabilidad; no puede extender el permiso del paciente |
| Paciente | Citas, tareas, objetivos compartidos y resúmenes para él; histórico de actividades. Notas sin visibilidad automática; acceso/ARCO aparte | Administra básicos globales y participa en actividades; no edita notas profesionales | Acepta o inicia cambio, aprueba versión exacta de resumen y autoriza antecedentes aparte; revoca |
| `support` / `admin` | Sin lectura clínica global por su rol de backoffice | Sin escritura clínica por ese rol | Gestión operativa no sustituye los acuerdos ni el consentimiento |
| Revisión de datos legacy (procedimiento pendiente) | Sin permiso clínico nuevo por este documento; diseñar acceso mínimo compatible con RN-27 y revisión jurídica | No inventar atribución ni borrar historia; no exige conciliación manual de la demo desechable | No puede consentir en nombre del paciente |
| `superadmin` | Sin acceso clínico global ordinario, incluidas exportaciones; #7 implementó su denegación administrativa | Sin alteración clínica global | No sustituye acuerdos/consentimiento; emergencia sin diseñar no concede acceso |
| Psicólogo suspendido | Los JWT quedan inválidos; no se concede acceso por esta matriz | Sin creación de citas nuevas | No puede bloquear cambio directo; rehabilitación sin restablecer vínculos cambiados |
| Miembro de futura red sin relación asistencial | Ningún acceso al expediente por pertenecer a la red | Ninguno | Podrá participar en directorio/derivación según etapa futura |

El permiso de lectura de una nota ajena no habilita sus tareas, adjuntos, versiones, entrevista, indicadores, resúmenes o exportaciones por asociación implícita. Debe resolverse expresamente el alcance de cada componente. No se asume que todo el expediente actual sea compartible como una sola unidad.

## Estados funcionales y condiciones de transición

Lo aprobado son las condiciones siguientes y los estados de episodio `activo`, `pausado`, `finalizado`. En vinculación inicial está aprobada la confirmación final del paciente tras aceptación profesional de su solicitud. Los estados API, otros detalles de orden, plazos de caducidad, errores, almacenamiento y mecanismos de concurrencia siguen ABIERTOS o PROPUESTOS; no confundirlos con la cancelabilidad y solicitud pendiente única ya aprobadas.

| Situación funcional | Condición | Efecto obligatorio |
| --- | --- | --- |
| Registro independiente | Cuenta del paciente sin vínculo confirmado | Sin episodio ni acceso clínico profesional |
| Solicitud inicial pendiente | Espera respuesta profesional o confirmación final del paciente | Ocupa cupo RN-37; no concede expediente |
| Solicitud inicial lista | Profesional acepta y paciente confirma finalmente, con verificaciones | Completar vinculación sin activar por sí sola un episodio; activación posterior con RN-59, exclusividad y atomicidad |
| Activación de episodio nuevo | Entrevista completada y validada expresamente por el psicólogo responsable para ese episodio, además de RN-02/40 | Activación solo después de la validación, impuesta en backend y DB futuros; implementación fuera de B |
| Invitación inicial | Paciente conocido se registra si hace falta, verifica y acepta expresamente; restantes validaciones cumplidas | La invitación sola no habilita expediente ni activa episodio; activación separada con RN-59 y restantes condiciones |
| Derivación profesional pendiente | Falta aceptación de paciente/B o aprobación exacta del resumen | A sigue responsable; sin resumen aprobado no completar ni comunicarlo a B |
| Derivación profesional lista | A inicia, paciente acepta cambio y versión exacta del resumen, B acepta, paciente confirma cancelación de citas futuras; entrevista del destino validada según RN-59 antes de activar | Cambio atómico, episodio nuevo, cancelaciones consistentes e histórico íntegro; solo contenido aprobado |
| Cambio directo listo | Paciente con identidad verificada solicita, B acepta y paciente confirma cancelación de citas futuras con A; entrevista del destino validada según RN-59 antes de activar | No exige consentimiento/resumen de A; cambio atómico y notificación a A, sin historial automático |
| Rechazo o cancelación de solicitud | No se cumplen condiciones o se cancela la solicitud pendiente | No completar ese cambio; no transferir responsabilidad por aceptación parcial |
| Pausa | Cualquiera inicia, con confirmación/motivo apropiado, aviso y citas futuras resueltas | Mismo episodio, conserva responsabilidad vigente, sin citas nuevas |
| Reanudación | Paciente Y psicólogo confirman | Mismo episodio vuelve a activo; una confirmación sola no basta |
| Finalización desde activo o pausado | Cualquiera finaliza con confirmación/motivo apropiado, aviso y citas futuras resueltas | Histórico conservado; puede quedar sin responsable. Retorno crea otro episodio |
| Suspensión de psicólogo | Cuenta suspendida | No cambia episodio automáticamente; JWT inválido, futuras citas pendientes de resolución sin cancelarlas automáticamente |

| Situación del consentimiento de antecedentes | Condición | Efecto obligatorio |
| --- | --- | --- |
| Propuesta de alcance | El origen identifica lo que propone divulgar | No concede acceso por sí sola |
| Evidencia presencial pendiente de verificación | Se recibió documento, pero falta verificar identidad o evidencia | No tratarlo como consentimiento verificado ni habilitar acceso por la carga |
| Autorización expresa registrada | Paciente autoriza el alcance por canal digital autenticado o presencial verificado | Solo puede comunicarse el alcance autorizado; no modifica responsabilidad ni autoría |
| Sin autorización o con negativa | El paciente no autoriza antecedentes adicionales | No divulgarlos; derivación profesional puede seguir con resumen aprobado; cambio directo sin resumen obligatorio |
| Revocación registrada | El paciente revoca la autorización | Restringir accesos futuros y conservar trazabilidad; no deshacer automáticamente el cambio de responsable |

Falta decidir la duración, metodología presencial exacta, momento de activación de antecedentes respecto al cambio y representación de cambios de alcance. Como propuesta para 2C, cada autorización identificaría destinatario y conjunto fijo de registros/versiones. Ya está APROBADO que el resumen se autoriza por versión exacta y que adendas posteriores requieren nueva autorización; la estructura técnica sigue pendiente (ADR-007/013).

## Ejemplos de aceptación

1. **A→B pendiente:** A inicia y B acepta; el paciente aún no acepta el cambio. A sigue responsable; B no lee el expediente por haber aceptado recibir.
2. **A→B con resumen y sin antecedentes adicionales:** paciente acepta cambio y versión exacta del resumen de A, B acepta, paciente confirma cancelación de citas futuras. B recibe solo resumen aprobado, sin notas, entrevista, riesgo, tareas u objetivos adicionales. A conserva archivo completo de su episodio y adendas propias. Si el resumen no está aprobado, esta vía no se completa.
3. **A→B con alcance limitado:** A propone varias notas y el paciente autoriza solo una parte. B solo recibe lo autorizado, en lectura y con autoría de A. Ni los elementos excluidos ni los registros relacionados se habilitan automáticamente.
4. **A→B→C:** B puede proponer información de su propia atención a C bajo el flujo ordinario. La autorización de A→B no concede a C acceso a las notas de A ni permite a B volver a divulgarlas amparándose en ese permiso. C necesita autorización expresa aplicable a esos antecedentes; el procedimiento concreto queda abierto. A nunca ve las notas de B o C.
5. **A→B→A:** se conservan tres episodios distintos. A conserva archivo completo del primero; las notas de B requieren autorización expresa. No recupera gestión del primer episodio, aunque puede añadir adendas a notas propias. El nuevo episodio empieza con riesgo NO EVALUADO y entrevista propia.
6. **Revocación:** se conserva la prueba de lo autorizado, consultado y revocado; se restringen futuras consultas amparadas en el permiso revocado. Revocar historial no cambia por sí solo al responsable activo ni borra notas.
7. **Documento presencial sin verificar:** el profesional adjunta un archivo firmado. Mientras no se complete y registre la verificación acordada, la carga no habilita acceso al destinatario.
8. **Solicitud ARCO:** el paciente pide acceso a sus datos sin autorizar una derivación. La solicitud sigue su procedimiento propio; no se exige una autorización de transferencia ni se establece un veto absoluto del origen.
9. **Cambio directo:** paciente verificado solicita B; B acepta y paciente confirma cancelación de futuras con A. A no aprueba ni aporta resumen obligatorio; recibe aviso al completarse sin nuevo contenido clínico. B solo recibe los básicos proporcionados, sin historial automático. Otra solicitud de cambio simultánea no puede quedar pendiente.
10. **Adenda posterior:** B recibió una nota autorizada de A; A añade adenda a su nota tras cerrar episodio. Se conserva el original y B no ve la adenda sin nueva autorización expresa.
11. **Pausa y cierre:** paciente pausa con futuras citas resueltas. No puede vincularse otro responsable ni crear citas nuevas por estar pausado; reanudar exige ambos. El psicólogo puede finalizar con confirmación/motivo y aviso, conservando pendientes como no completados por cierre.
12. **Suspensión:** las citas futuras quedan pendientes de resolución y se avisa sin motivo privado. Paciente puede cambiar directamente. Rehabilitar A no recupera vínculo ya cambiado ni reactiva canceladas.
13. **Identidad y alta:** una coincidencia de correo/teléfono no une pacientes ni revela otro consultorio. Invitación inicial sin confirmación bilateral/verificación no activa responsabilidad; un episodio pausado obliga a usar cambio.

14. **Registro sin profesional:** paciente crea cuenta; ningún psicólogo obtiene acceso ni se abre episodio. Visita perfiles sin sesión, pero no puede enviar solicitud sin autenticación y verificaciones.
15. **Perfil público sin admisión:** profesional aprobado publica pero desactiva recepción. Visitantes ven información mínima y estado de admisión; no pueden enviar solicitudes. El profesional conserva la vía de invitar a pacientes conocidos.
16. **Confirmación final y cupo:** P solicita a A sin mensaje; A acepta. Mientras P no confirme, no hay episodio y otra solicitud iniciada por P se rechaza. Cancelar o caducar resuelve la solicitud; frecuencias de reintento siguen por aprobar.
17. **Mensaje sensible:** mensaje opcional de P solo accesible a las partes autorizadas del flujo; no aparece en proyecciones públicas, auditoría administrativa ni feed público. Ni aceptación ni mensaje habilitan expediente.
18. **Invitación y concurrencia:** paciente aún sin cuenta puede ser invitado y luego registrarse/verificar/aceptar. Dos confirmaciones concurrentes nunca crean dos episodios vigentes; no se divulga identidad de otro profesional. La política de simultaneidad de invitaciones sigue pendiente.

## Reglas existentes que se conservan

Según [arquitectura vigente](../architecture.md), [ADR de producto](decisions.md) y [clinical-data-integrity.md](../clinical-data-integrity.md): citas de 60 minutos por hora exacta, sin solapamientos y sin múltiples citas activas del paciente en el mismo día; no completar citas futuras; nota vinculada a cita completada, no futura; una cita con nota no vuelve a pendiente ni cancelada. Se conserva histórico; la regla objetivo de corrección de notas finalizadas es RN-23 (adendas sin sobrescritura), aunque el código previo permita edición versionada. No modificar 001/002.

La espera sigue siendo manual: sugerencia a prioridad 1 y decisión final del psicólogo. La disponibilidad conserva múltiples bloques, excepciones y bloqueos, y no debe dejar citas futuras fuera de cobertura. Las reglas actuales de negocio no garantizan por sí solas seguridad ante reservas concurrentes: eso corresponde a 2D.

La cancelación confirmada de citas futuras al cambiar ya está aprobada en RN-20; para pausa/cierre rige resolución previa sin borrado. Quedan abiertos el procedimiento de espera/recurrencias, conflictos y representación de citas pendientes de resolución por suspensión. No trasladar agenda/espera automáticamente ni inventar atribuciones legacy. Los mecanismos de implementación se especificarán en 2A/2B/2D.
