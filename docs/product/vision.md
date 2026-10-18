# Visión de producto de PsicoPanel

Fecha de referencia: 18 de octubre de 2026. Base revisada: `origin/main` en `7380e80d6fbe43ac048c1af08eaa64857306a66d`, con PR #1–#5 integrados. Esta actualización recoge decisiones de producto aprobadas después de #5; no acredita implementación.

Este documento fija el contexto de producto para futuros trabajos. Las reglas aprobadas están en [business-rules.md](business-rules.md), las etapas en [roadmap.md](roadmap.md) y la separación entre decisiones aprobadas, propuestas y asuntos abiertos en [decisions.md](decisions.md). Documentar una propuesta no autoriza implementarla.

## Público y problema

PsicoPanel sirve a psicólogos **independientes, con consultorios propios**, y a sus pacientes. Facilita agenda, disponibilidad, seguimiento clínico, notas, tareas, objetivos y lista de espera. Cada profesional conserva su ámbito de atención; el producto no representa una clínica con pacientes y expedientes compartidos entre todo su personal.

La continuidad de atención debe permitir cambiar de profesional sin perder historia ni confundir responsabilidad, autoría y permisos. Cada paciente tiene identidad global única en PsicoPanel y como máximo un psicólogo con responsabilidad vigente: tanto un episodio `activo` como uno `pausado` cuentan para esa exclusividad. Puede quedar sin responsable al finalizar. Reanudar una pausa conserva el episodio; volver tras uno `finalizado`, incluido A→B→A, crea otro.

Todos los pacientes y psicólogos tendrán cuenta digital obligatoria. El paciente puede registrarse o recibir una invitación iniciada por un psicólogo; el primer vínculo solo se confirma tras verificar identidad y aceptar ambas partes. Si ya existe responsabilidad vigente se usa el flujo de cambio. Al activar se verifican correo y teléfono, con verificación adicional ante duplicados o recuperación; no se exige universalmente CURP ni documento oficial. Coincidencias de contacto no prueban identidad física ni autorizan unir cuentas automáticamente. La búsqueda no debe revelar pacientes de otro consultorio.

El paciente administra nombre, contactos y fecha de nacimiento globales; el psicólogo puede solicitar correcciones, sin modificar esa identidad. Estos datos básicos acompañan al paciente tras el cambio confirmado; los datos clínicos pertenecen al episodio. Véanse RN-15–RN-17 y ADR-012 en los documentos enlazados.

## Aislamiento y continuidad

- Pertenecer a PsicoPanel o a una futura red no concede acceso al expediente de otro profesional.
- Ser el nuevo responsable no concede acceso automático a notas anteriores, entrevista, tareas, objetivos, riesgo ni contexto clínico producido en otro episodio.
- El profesional anterior conserva lectura archivada del **expediente clínico completo de sus propios episodios**: notas, citas, entrevista, evaluación de riesgo, tareas, objetivos y contexto. No puede gestionar al paciente ni consultar episodios ajenos. La única escritura histórica permitida son adendas a notas propias, con autor, fecha y motivo, sin sobrescribir la nota finalizada (RN-10/RN-23, ADR-005/013). Esto sustituye la limitación a solo notas de #5.
- En derivación profesional A→B, A inicia, el paciente acepta el cambio y B acepta. A debe elaborar un resumen clínico obligatorio; el paciente revisa y aprueba la versión exacta antes de comunicarla a B. Puede rechazar contenido con motivos y pedir revisiones, sin obligar a A a escribir información clínicamente falsa; se preservan borradores/versiones. Sin resumen aprobado no se completa esta vía.
- En cambio directo iniciado por el paciente, se verifica identidad y B acepta; A no consiente ni puede bloquear y su resumen no es obligatorio. No se comparte historial automáticamente. A recibe notificación al completar, sin conocer el nuevo contenido clínico; no se divulga innecesariamente su identidad a B. En la derivación profesional B sí conoce remitente y datos mínimos; en solicitud directa solo los datos básicos proporcionados por el paciente, sin acceso clínico por la mera solicitud.
- Compartir antecedentes adicionales es opcional: en la derivación profesional A propone contenido y el paciente autoriza expresamente el alcance. Rechazarlo no bloquea una derivación con resumen aprobado; ese resumen no habilita el resto del expediente. Solo hay una solicitud pendiente de cambio por paciente, cancelable, y el anterior sigue responsable hasta el cambio atómico (RN-04–RN-07/RN-18–RN-20, ADR-003/014).
- La autoría y la historia clínica se conservan. Recibir antecedentes no convierte al destinatario en autor de las notas recibidas.
- El consentimiento puede prestarse digitalmente mediante cuenta autenticada del paciente o presencialmente mediante documento firmado con identidad y evidencia verificadas y registradas. Una carga de archivo o casilla del profesional no sustituye esa verificación.

Al confirmar el cambio, se muestran al paciente sus citas futuras con A y se requiere confirmar su cancelación, que forma parte consistente del cambio y conserva histórico; no se reprograman con B. Pausar o finalizar también exige resolver las citas futuras sin borrarlas. Cualquiera puede iniciar pausa o finalizar unilateralmente con confirmación/motivo apropiado y notificación al otro; reanudar requiere confirmación de ambos y durante la pausa no se crean citas. La suspensión del profesional invalida JWT y bloquea nuevas citas, sin cerrar automáticamente episodios: las futuras quedan pendientes de resolución y se avisa al paciente sin revelar el motivo privado. El paciente puede cambiar directamente; rehabilitar no restaura vínculos cambiados ni citas canceladas (RN-20–RN-22, ADR-014/015).

El paciente ve citas, tareas, objetivos compartidos y resúmenes para él, además del histórico de sus actividades; las notas profesionales no son visibles automáticamente. El acceso a datos clínicos/ARCO sigue un procedimiento separado, sin bloqueo arbitrario. Entrevista, riesgo, tareas y objetivos son por episodio: el riesgo comienza **NO EVALUADO**, y los antecedentes autorizados no sustituyen entrevista ni evaluación propias. Las actividades pendientes al cerrar quedan no completadas por cierre (RN-24–RN-26, ADR-011/016).

La confianza depende de que estos límites se cumplan en los servicios, consultas y datos derivados, además de la interfaz. El modelo actual todavía presenta brechas respecto de esta visión; se describen en el roadmap y no deben confundirse con capacidades ya disponibles.

## Alcance actual y dirección técnica

La base activa es una aplicación web con React y Vite, API Node.js/Express en JavaScript y PostgreSQL. Ya existen agenda, disponibilidad, espera manual asistida, tareas, expediente y backoffice. Docker de desarrollo, conservación de integridad clínica, autenticación con revocación de JWT y correcciones de dependencias de producción están integrados para su alcance; esto no acredita preparación para producción ni despliegue de migraciones en una instancia concreta.

Se mantiene la dirección futura de experiencia móvil con React Native/Expo y evolución hacia TypeScript, descrita en [README.md](../../README.md), [ARCHITECTURE.md](../../ARCHITECTURE.md) y [AGENTS.md](../../AGENTS.md). No se encarga esa migración ahora. Se favorecen reglas y contratos reutilizables sin rediseñar de inmediato la aplicación web ni adoptar infraestructura futura por anticipado.

El backoffice sigue separado de la operación clínica. `support`, `admin` y `superadmin` no tendrán acceso global ordinario a registros clínicos, entrevistas, notas, exportaciones ni alteración clínica. Los permisos amplios actuales de `superadmin` son una brecha a corregir. Una excepción de emergencia queda por diseñar y validar jurídicamente; no se habilita una puerta trasera (RN-27, ADR-017).

## Visión de red escalable

La dirección de largo plazo es una red estatal y después nacional para **directorio profesional y derivación**. El crecimiento geográfico no altera el aislamiento entre consultorios, la responsabilidad activa única, la autoría ni el alcance autorizado por el paciente.

La etapa actual prepara límites de dominio que puedan sostener esa red. El directorio público, descubrimiento, operación de la red y sus reglas de admisión quedan para la etapa 6. No se implementan ahora. Google Calendar, WhatsApp, notificaciones y otros canales futuros mencionados en [NOTES.md](../../NOTES.md) tampoco se incorporan por efecto de estos documentos.

## Responsabilidades preliminares y revisión jurídica

México es el primer marco de referencia. Estas son consideraciones de diseño sujetas a revisión jurídica, no conclusiones de cumplimiento:

- Como hipótesis inicial, cada profesional independiente suele actuar como responsable respecto de su consulta; el proveedor tecnológico podría actuar como encargado según las operaciones que efectivamente realice. Deben analizarse los tratamientos propios del proveedor y cualquier otra función real antes de asignar obligaciones contractuales.
- Deben revisarse privacidad, avisos, conservación, acceso, seguridad, evidencia de consentimiento, revocación, atención de derechos y eventuales excepciones aplicables.
- El consentimiento explícito aquí acordado rige la **derivación ordinaria del producto**. No se afirma que toda transferencia médica, bajo cualquier circunstancia, requiera necesariamente consentimiento; las excepciones y emergencias necesitan una política específica validada.
- Las solicitudes del paciente de acceso a sus datos y otros derechos ARCO son un procedimiento distinto de la autorización para divulgar antecedentes a otro profesional. No se establece un veto absoluto del origen sobre esos derechos.

La plataforma debe aportar controles y trazabilidad sin prometer que la tecnología por sí sola determina validez jurídica. No se fijan todavía plazos de retención, criterios de emergencia ni métodos definitivos de verificación presencial.

## Qué significa avanzar correctamente

El avance se mide por escenarios verificables: una solicitud pendiente conserva al origen; una derivación profesional exige resumen aprobado pero admite negar antecedentes adicionales; un cambio directo funciona sin autorización de A; una autorización limitada no habilita información adicional ni adendas posteriores; una pausa conserva exclusividad; una revocación restringe accesos futuros y conserva evidencia; A→B→A produce tres episodios sin reescribir los anteriores.

La siguiente etapa es 2A: modelo, identidad, datos globales/clínicos, episodios, permisos y planificación de 003, que todavía **no existe**. Notas y adendas se planifican desde 2A aunque su entrega atraviese etapas y PR separados. Los datos de la demo local fueron confirmados como de prueba y desechables; esto no autoriza reinicializarla ahora ni borrar datos reales. La migración futura exige una estrategia segura para entornos reales, sin construir conciliación manual solo para salvar esa demo (RN-28, ADR-018).

Antes del encargo de implementación deben cerrarse las preguntas que condicionen cada etapa. El código y las migraciones se autorizarán por alcance separado, con criterios de aceptación y conservación del histórico.
