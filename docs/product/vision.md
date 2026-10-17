# Visión de producto de PsicoPanel

Fecha de referencia: 17 de octubre de 2026. Base técnica contrastada: `origin/main` en `3a1f0d73960e72d1e92082817141a236f638464a`, con PR #1–#4 integrados.

Este documento fija el contexto de producto para futuros trabajos. Las reglas aprobadas están en [business-rules.md](business-rules.md), las etapas en [roadmap.md](roadmap.md) y la separación entre decisiones aprobadas, propuestas y asuntos abiertos en [decisions.md](decisions.md). Documentar una propuesta no autoriza implementarla.

## Público y problema

PsicoPanel sirve a psicólogos **independientes, con consultorios propios**, y a sus pacientes. Facilita agenda, disponibilidad, seguimiento clínico, notas, tareas, objetivos y lista de espera. Cada profesional conserva su ámbito de atención; el producto no representa una clínica con pacientes y expedientes compartidos entre todo su personal.

La continuidad de atención debe permitir cambiar de profesional sin perder historia ni confundir responsabilidad, autoría y permisos. Un paciente tiene un único psicólogo responsable activo a la vez; los cambios generan episodios históricos distintos. Una derivación puede completarse sin compartir antecedentes.

## Aislamiento y continuidad

- Pertenecer a PsicoPanel o a una futura red no concede acceso al expediente de otro profesional.
- Ser el nuevo responsable no concede acceso automático a notas anteriores, entrevista, tareas, objetivos, riesgo ni contexto clínico producido en otro episodio.
- El profesional anterior conserva exclusivamente lectura archivada de las notas que él elaboró; no puede escribir en el episodio cerrado ni consultar las notas posteriores del nuevo responsable.
- Compartir antecedentes requiere una decisión separada del cambio de responsable. En el flujo ordinario, el origen propone el contenido y el paciente autoriza expresamente su alcance.
- La autoría y la historia clínica se conservan. Recibir antecedentes no convierte al destinatario en autor de las notas recibidas.
- El consentimiento puede prestarse digitalmente mediante cuenta autenticada del paciente o presencialmente mediante documento firmado con identidad y evidencia verificadas y registradas. Una carga de archivo o casilla del profesional no sustituye esa verificación.

La confianza depende de que estos límites se cumplan en los servicios, consultas y datos derivados, además de la interfaz. El modelo actual todavía presenta brechas respecto de esta visión; se describen en el roadmap y no deben confundirse con capacidades ya disponibles.

## Alcance actual y dirección técnica

La base activa es una aplicación web con React y Vite, API Node.js/Express en JavaScript y PostgreSQL. Ya existen agenda, disponibilidad, espera manual asistida, tareas, expediente y backoffice. Docker de desarrollo, conservación de integridad clínica, autenticación con revocación de JWT y correcciones de dependencias de producción están integrados para su alcance; esto no acredita preparación para producción ni despliegue de migraciones en una instancia concreta.

Se mantiene la dirección futura de experiencia móvil con React Native/Expo y evolución hacia TypeScript, descrita en [README.md](../../README.md), [ARCHITECTURE.md](../../ARCHITECTURE.md) y [AGENTS.md](../../AGENTS.md). No se encarga esa migración ahora. Se favorecen reglas y contratos reutilizables sin rediseñar de inmediato la aplicación web ni adoptar infraestructura futura por anticipado.

El backoffice sigue separado de la operación clínica. `support` y `admin` no reciben lectura clínica global. El acceso excepcional existente de `superadmin` requiere revisión específica; no debe convertirse en un permiso cotidiano ni confundirse con una política de emergencia aprobada.

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

El avance se mide por escenarios verificables: una derivación pendiente conserva al origen; una completada deja un solo responsable; una sin historial no filtra antecedentes; una autorización limitada no habilita información adicional; una revocación restringe accesos futuros y conserva evidencia; A→B→A produce tres episodios sin reescribir los anteriores.

Antes del encargo de implementación deben cerrarse las preguntas que condicionen cada etapa. El código y las migraciones se autorizarán por alcance separado, con criterios de aceptación y conservación del histórico.
