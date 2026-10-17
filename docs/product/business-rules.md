# Reglas de negocio y permisos

Referencia: 17 de octubre de 2026; base revisada `main` en `3a1f0d7`. Este documento describe requisitos aprobados de producto, no afirma que el código actual ya los cumpla. Las propuestas de almacenamiento y transacciones están separadas en [decisions.md](decisions.md).

## Conceptos

| Concepto | Significado |
| --- | --- |
| Responsable activo | Único psicólogo que tiene a cargo la atención actual del paciente. No equivale a la figura jurídica de responsable del tratamiento de datos. |
| Episodio | Periodo de atención de un paciente con un profesional. Un regreso al mismo profesional inicia otro episodio. |
| Derivación ordinaria | Cambio iniciado por el origen, aceptado expresamente por el paciente y por el destinatario. |
| Divulgación de antecedentes | Comunicación de información clínica con alcance expresamente autorizado; es independiente de aceptar el cambio de profesional. |
| Lectura archivada | Consulta por el autor de sus propias notas históricas; no habilita escritura ni acceso a notas ajenas. |
| Evidencia de consentimiento | Registro que permite acreditar quién autorizó qué, mediante qué canal y con qué verificación. Su metodología detallada sigue abierta. |

## Requisitos aprobados

| ID | Regla inequívoca |
| --- | --- |
| RN-01 | Los consultorios son independientes. Estar en la plataforma, red o directorio nunca concede acceso clínico por sí mismo. |
| RN-02 | Un paciente no puede tener dos psicólogos responsables activos simultáneos. La falta de responsable inicial o el cierre sin sucesor requieren una política aparte; no justifican permitir dos activos. |
| RN-03 | Cada nueva atención tras un cambio de responsable es un episodio distinto. A→B→A no reactiva ni sobrescribe el primer episodio de A. |
| RN-04 | La derivación ordinaria la inicia el profesional de origen. Requiere aceptación expresa del cambio por el paciente y aceptación de recepción por el destinatario. |
| RN-05 | Hasta que concurran los tres acuerdos, el responsable sigue siendo el origen. Una aceptación parcial no transfiere responsabilidad ni concede acceso clínico al destinatario. |
| RN-06 | Autorizar el cambio y autorizar compartir antecedentes son decisiones separadas. Negarse a compartir historial no impide completar una derivación que reúna los tres acuerdos. |
| RN-07 | En transferencia ordinaria el origen propone qué antecedentes compartir y el paciente autoriza expresamente el alcance. No se comunica más de lo autorizado. No se da al destinatario autoría ni edición de notas ajenas. |
| RN-08 | Se admiten consentimiento digital mediante cuenta autenticada del paciente y presencial mediante documento firmado, con identidad y evidencia verificadas y registradas. Subir un archivo o marcar una casilla por el profesional no equivale automáticamente a consentimiento verificado. |
| RN-09 | Debe existir revocación para restringir accesos futuros y un registro auditable de autorizaciones y revocaciones. Revocar no borra la evidencia ni promete recuperar información ya consultada o recibida. |
| RN-10 | El psicólogo anterior conserva lectura archivada solo de las notas que él elaboró. No conserva escritura ni acceso a notas posteriores del nuevo profesional. |
| RN-11 | El nuevo responsable ve antecedentes de otro profesional solo si están expresamente autorizados para ese acceso. Los consentimientos no se heredan en cadenas de derivación. |
| RN-12 | No se borran ni reescriben expedientes, autoría o citas históricas para efectuar una derivación. Debe conservarse la protección de integridad existente. Las correcciones permitidas conservan versiones y no equivalen a reescribir el histórico. |
| RN-13 | Las solicitudes ARCO, incluido acceso del paciente a sus datos, se atienden por un procedimiento separado del permiso de divulgación en derivaciones. No existe un veto absoluto del origen al ejercicio de esos derechos. |
| RN-14 | México es referencia inicial. Las consideraciones jurídicas, roles de tratamiento y excepciones requieren validación; estas reglas del flujo ordinario no son una afirmación universal sobre todas las transferencias médicas. |

## Matriz breve de actores y permisos objetivo

Esta matriz limita permisos clínicos ordinarios. No crea nuevos roles técnicos ni autoriza accesos de emergencia. La disponibilidad actual puede diferir; véase [roadmap.md](roadmap.md).

| Actor o situación | Lectura clínica | Escritura clínica | Derivación y consentimiento |
| --- | --- | --- | --- |
| Psicólogo responsable activo | Información de su atención; antecedentes ajenos solo dentro del alcance autorizado | Operación de su episodio y notas propias bajo reglas de integridad; nunca editar notas ajenas | Inicia la derivación ordinaria y propone antecedentes |
| Destinatario con derivación pendiente | Ningún acceso clínico nuevo por la solicitud | Ninguna escritura por esa solicitud | Acepta recibir al paciente; esa aceptación no sustituye la del paciente |
| Destinatario tras completar el cambio | Información de su nuevo episodio; historial anterior solo si está autorizado | Su nuevo episodio y sus propias notas | La aceptación del cambio no lo autoriza a recibir todo el historial |
| Psicólogo anterior | Solo sus propias notas en archivo; ninguna nota posterior de otro autor | Ninguna escritura en el episodio cerrado | Conserva trazabilidad de sus actuaciones; no puede extender el permiso del paciente |
| Paciente | Su experiencia y datos conforme a permisos aplicables; visualización directa de notas aún por decidir | Cumplimiento de tareas/objetivos propios conforme al flujo existente; no texto clínico ni notas profesionales | Acepta expresamente el cambio; autoriza o rechaza el alcance por separado; puede revocar |
| `support` / `admin` | Sin lectura clínica global por su rol de backoffice | Sin escritura clínica por ese rol | Gestión operativa no sustituye los acuerdos ni el consentimiento |
| Operador autorizado para revisión legacy | Solo el alcance específico de una revisión autorizada y auditada | Atribución o resolución pendiente de procedimiento aprobado; nunca inventar autoría ni borrar historia | No puede consentir en nombre del paciente por ser operador |
| `superadmin` | El código tiene lectura excepcional amplia; su política y controles futuros están abiertos | No recibe autorización nueva de escritura ni borrado | No sustituye automáticamente a los tres participantes |
| Miembro de futura red sin relación asistencial | Ningún acceso al expediente por pertenecer a la red | Ninguno | Podrá participar en directorio/derivación según etapa futura |

El permiso de lectura de una nota ajena no habilita sus tareas, adjuntos, versiones, entrevista, indicadores, resúmenes o exportaciones por asociación implícita. Debe resolverse expresamente el alcance de cada componente. No se asume que todo el expediente actual sea compartible como una sola unidad.

## Estados funcionales y condiciones de transición

Lo aprobado son las condiciones siguientes. Los nombres de estados, orden de las dos aceptaciones posteriores a la iniciativa del origen, caducidades, cancelación, conflictos y almacenamiento de eventos son **propuestas por cerrar**, no un contrato API aprobado.

| Situación funcional | Condición | Efecto obligatorio |
| --- | --- | --- |
| Iniciada por el origen; faltan acuerdos | Falta aceptación del paciente, del destinatario o ambas | El origen continúa responsable; no hay acceso clínico nuevo para el destinatario |
| Tres acuerdos reunidos | Origen inicia, paciente acepta el cambio y destinatario acepta recibir | Puede completarse el cambio con un solo responsable y episodio nuevo; la finalización debe conservar íntegro el anterior |
| Rechazo o falta de aceptación | No concurren los tres acuerdos | No se completa la derivación |
| Cambio completado sin historial | Tres acuerdos para el cambio; ninguna autorización de antecedentes | El destinatario atiende sin leer antecedentes del origen |

| Situación del consentimiento de antecedentes | Condición | Efecto obligatorio |
| --- | --- | --- |
| Propuesta de alcance | El origen identifica lo que propone divulgar | No concede acceso por sí sola |
| Evidencia presencial pendiente de verificación | Se recibió documento, pero falta verificar identidad o evidencia | No tratarlo como consentimiento verificado ni habilitar acceso por la carga |
| Autorización expresa registrada | Paciente autoriza el alcance por canal digital autenticado o presencial verificado | Solo puede comunicarse el alcance autorizado; no modifica responsabilidad ni autoría |
| Sin autorización o con negativa | El paciente no autoriza antecedentes | No divulgar; la derivación puede seguir sin historial |
| Revocación registrada | El paciente revoca la autorización | Restringir accesos futuros y conservar trazabilidad; no deshacer automáticamente el cambio de responsable |

Falta decidir la duración, la metodología de verificación, el momento de activación de la divulgación respecto del cambio y el tratamiento de cambios de alcance. Como propuesta para 2C, cada autorización identificaría destinatario y conjunto fijo de registros/versiones; no incluiría notas futuras implícitas. No implementar estos detalles antes de cerrar su especificación.

## Ejemplos de aceptación

1. **A→B pendiente:** A inicia y B acepta; el paciente aún no acepta el cambio. A sigue responsable; B no lee el expediente por haber aceptado recibir.
2. **A→B sin historial:** los tres acuerdos están registrados y el paciente rechaza compartir antecedentes. B pasa a responsable en un episodio nuevo sin ver notas, entrevista, riesgo, tareas u objetivos del episodio de A. A conserva solo lectura de sus propias notas.
3. **A→B con alcance limitado:** A propone varias notas y el paciente autoriza solo una parte. B solo recibe lo autorizado, en lectura y con autoría de A. Ni los elementos excluidos ni los registros relacionados se habilitan automáticamente.
4. **A→B→C:** B puede proponer información de su propia atención a C bajo el flujo ordinario. La autorización de A→B no concede a C acceso a las notas de A ni permite a B volver a divulgarlas amparándose en ese permiso. C necesita autorización expresa aplicable a esos antecedentes; el procedimiento concreto queda abierto. A nunca ve las notas de B o C.
5. **A→B→A:** se conservan tres episodios distintos. Al regresar a A, sus primeras notas siguen siendo su archivo; las notas de B requieren autorización expresa. A no recupera escritura en su primer episodio.
6. **Revocación:** se conserva la prueba de lo autorizado, consultado y revocado; se restringen futuras consultas amparadas en el permiso revocado. Revocar historial no cambia por sí solo al responsable activo ni borra notas.
7. **Documento presencial sin verificar:** el profesional adjunta un archivo firmado. Mientras no se complete y registre la verificación acordada, la carga no habilita acceso al destinatario.
8. **Solicitud ARCO:** el paciente pide acceso a sus datos sin autorizar una derivación. La solicitud sigue su procedimiento propio; no se exige una autorización de transferencia ni se establece un veto absoluto del origen.

## Reglas existentes que se conservan

Según [AGENTS.md](../../AGENTS.md), [NOTES.md](../../NOTES.md) y [clinical-data-integrity.md](../clinical-data-integrity.md): citas de 60 minutos por hora exacta, sin solapamientos y sin múltiples citas activas del paciente en el mismo día; no completar citas futuras; nota vinculada a cita completada, no futura; una cita con nota no vuelve a pendiente ni cancelada. Las correcciones conservan versiones; no hay borrado físico del expediente ni de citas históricas.

La espera sigue siendo manual: sugerencia a prioridad 1 y decisión final del psicólogo. La disponibilidad conserva múltiples bloques, excepciones y bloqueos, y no debe dejar citas futuras fuera de cobertura. Las reglas actuales de negocio no garantizan por sí solas seguridad ante reservas concurrentes: eso corresponde a 2D.

Para implementar derivaciones se propone además un plan explícito de cierre de agenda: no trasladar automáticamente citas futuras ni espera, y revisar atribuciones inciertas con auditoría. Ese procedimiento y su resolución de casos conflictivos aún requieren aprobación.
