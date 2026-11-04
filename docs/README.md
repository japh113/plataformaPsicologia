# Documentación de PsicoPanel

Punto de continuidad al 4 de noviembre de 2026: [checkpoint tras #51/#52](project-checkpoint.md), `main` verificado `9238406b0c441fef8b1cbaec7f78b0ba1288b102`. 2A parcial, fundamentos internos 008–010 integrados, sin nuevas lecturas clínicas, activación ni despliegue acreditado. Reconsultar GitHub antes de cada encargo; el checkpoint enlaza las fuentes canónicas y no autoriza el siguiente incremento.

Corte histórico al 29 de octubre de 2026: base `main` `a1720245083008399a3543ca4b794ec4d1289d5a` (merge #27). A/B/C/D1/D2 y #25–#27 integrados; Issues #21–#23 cerrados. [Resumen de ese corte, backlog y evidencia histórica](operational-status.md). D3, nuevas vinculaciones y activación/permisos por episodio pendientes. #19/#24 documentaron producto de pareja, sin implementar su motor. Integración en Git y pruebas aisladas no acreditan instalación ni despliegue habitual.

Entrada general en [README raíz](../README.md); instrucciones de trabajo en [AGENTS](../AGENTS.md) y [contribución](../CONTRIBUTING.md). A (#10, 0f2ebba), B (#11, 5e549f5) y C (#12, 543442e) integrados. Los informes anteriores de B/C conservan evidencia histórica aislada. La [validación CI](ci-validation.md) conserva ejecuciones históricas identificadas por SHA; la ejecución de cada nuevo PR se consulta separadamente.

## Fuentes canónicas

| Tema | Documento y estado |
| --- | --- |
| Consolidación clínica 2A, base #43 | [ADR-031/D01–D20](product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades): acuerdos funcionales, equivalencias y pendientes; D21 no aprobada. [Inventario/DTO y permisos](patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo), [admisión/plantillas](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo), [dependencias y cortes propuestos](product/roadmap.md#consolidación-2a--dependencias-y-entregas-acotadas); documentación, sin implementación nueva. |
| Estado operativo y backlog | [Corte #40 y seguimiento #28–#41](operational-status.md): integración, decisiones, pendientes y clasificación histórica |
| Cronología del paciente | [Mi seguimiento — contrato y evidencia Issue #21](patient-follow-up.md): integrado en #27; Issue #21 cerrado; consultas completadas, tareas e histórico separado sin notas profesionales |
| Cumplimiento de objetivos | [Contrato y evidencia Issue #22](objective-completion-authorization.md): integrado en #26; Issue #22 cerrado; solo psicólogo autorizado escribe, paciente consulta progreso y conserva tareas interactivas |
| Privacidad API del paciente | [Contrato y evidencia Issue #23](patient-response-privacy.md): integrado en #25; Issue #23 cerrado; proyecciones por rol; evidencia histórica aislada sin despliegue |
| Arquitectura | [architecture.md](architecture.md): implementación, fundamentos no activados y futuro separados |
| Desarrollo y pruebas | [development.md](development.md): Docker/WSL, inicialización nueva, seguridad y destinos aislados |
| Producto | [Visión](product/vision.md), [decisiones/abiertos](product/decisions.md), [reglas](product/business-rules.md), [roadmap](product/roadmap.md): aprobado no equivale a implementado |
| Resolver interno de procedencia, entrega Draft posterior a #53 | [Contrato 011 y matriz](private-note-origin-resolver.md): evidencia interna v1, sin audiencia operativa ni lectura positiva; pendiente de auditoría/integración. |
| Procedencia privada v1 — incremento interno posterior a #51 | [Contrato 010, roles, P2, aislamiento y pruebas](private-note-origins.md), [ADR-032](product/decisions.md#adr-032--original-profesional-privado-y-procedencia-técnica-v1): solo originales nuevos, sin HTTP/lectura/activación. Materiales/publicación siguen propuestos. |
| Audiencia verificable de recursos clínicos — propuesta tras #50 | [Contrato, alternativas y esquema candidato](patient-response-privacy.md#propuesta-2a--contrato-de-audiencia-verificable), [incrementos futuros](product/roadmap.md#propuesta-de-incrementos-de-audiencia-tras-50). Corte #51 propuesto; ADR-032/010 implementa solo procedencia privada. Materiales, permisos, lectura clínica y activación siguen pendientes. |
| Elegibilidad interna de notas individuales | [Contrato transaccional y límites](private-note-read-eligibility.md): revalidación JWT/PostgreSQL, audiencia sin acreditar y denegación operativa total; sin endpoints ni activación. |
| Fundamentos 008 integrados, sin activación | [Contrato y límites](clinical-episodes-foundation.md#implementación-del-incremento-008--sin-activación), [evidencia histórica de la entrega](episode-participants-validation.md): solo prepared y destinos aislados vacíos; sin motor clínico ni despliegue. |
| Fundamentos técnicos 2A tras #44 | [Propuesta de participantes/pertenencia/autoría](clinical-episodes-foundation.md#propuesta-técnica-2a--participantes-pertenencia-y-autoría), [aislamiento/corte legacy](patient-response-privacy.md#vinculación-técnica-propuesta-de-autor-sujeto-y-audiencia) y [único siguiente PR propuesto](product/roadmap.md#incremento-propuesto-de-fundamentos-tras-44): antecedente técnico de #45, cuyo subconjunto de fundamentos entrega 008 arriba; flujos/permisos posteriores pendientes, sin activación. |
| Episodios paralelos y pareja | [Decisión y trazabilidad ADR-030/RN-62–68](parallel-couple-episodes.md): aprobado como producto; sucesora PostgreSQL, permisos, confidencialidad y flujos pendientes |
| Plan de entregas | [identity-directory-delivery-plan.md](identity-directory-delivery-plan.md): A/B/C/D1/D2 integrados; D3 pendiente |
| CI y contribución | [ci-plan.md](ci-plan.md), [CONTRIBUTING](../CONTRIBUTING.md): checks integrados en `main`, [evidencia técnica histórica](ci-validation.md), aislamiento y artifacts; CI-02 demostrado con #15 y CI-07 con #16; Protect main exige los siete checks |
| Diseño 2A | [stage2a-identity-directory-intake.md](stage2a-identity-directory-intake.md): mecanismos propuestos y requisitos aprobados diferenciados |
| Mutaciones legacy | [stage2a-legacy-mutations.md](stage2a-legacy-mutations.md): inventario revalidado por ruta/escritor; bloqueo AB-23 implementado en B |
| Identidad/verificación B | [Guía](patient-identity-verification.md), [validación](patient-identity-validation.md): código y demo aislada, sin despliegue habitual |
| Contactos C | [Contrato](contact-changes.md), [validación final del deadline](contact-change-deadline-validation.md); informes [inicial](contact-change-validation.md) y [primera revisión P2](contact-change-review-validation.md) históricos |
| Reorganización A | [documentation-audit.md](documentation-audit.md): inventario, clasificación, instrucciones sustituidas y validación |
| Persistencia D1 | [Contrato](professional-persistence.md), [validación propia](professional-persistence-validation.md): 006 integrada en #17, sin despliegue habitual acreditado |
| Gestión privada D2 | [Contrato](private-professional-management.md), [validación](private-professional-validation.md): sesiones restringidas, 007, perfil/revisión y fotos; aprobación operativa y D3 deshabilitados |

## Seguridad, procedimientos y evidencia conservados

- [Primer incremento de seguridad pública de autenticación](public-auth-hardening.md): correo acotado, política local de solicitudes, límites operativos y pruebas; entrega Draft sin despliegue.

- [clinical-data-integrity.md](clinical-data-integrity.md): política y evidencia de 001; distinguir edición versionada actual de objetivo de adendas.
- [authentication-security.md](authentication-security.md): contratos 002 y evidencia histórica, con nota de actualización de roles #7.
- [clinical-episodes-foundation.md](clinical-episodes-foundation.md): SQL/runner 003, destinos explícitos y aislamiento; no activa permisos por episodio.
- [clinical-episodes-validation.md](clinical-episodes-validation.md): evidencia histórica de #8, no ejecución de A.

Estos documentos no autorizan ejecutar procedimientos por el hecho de leerlos; conservar los límites del encargo y no reproducir schema/seed en bases existentes.

Las menciones de Draft, HEAD, Issue abierto o tareas futuras dentro de contratos e informes de entrega son cortes históricos de esas entregas. Consultar la [clasificación y estado posterior](operational-status.md#cortes-históricos-y-uso-de-la-evidencia) antes de usarlos como instrucciones.

## Archivo

[NOTES del 13 de abril de 2026](archive/notes-2026-04-13.md) se conserva íntegro con advertencia histórica. Ideas de métricas, feedback, Calendar, WhatsApp y otras no se convierten en requisitos aprobados. Los archivos raíz [ARCHITECTURE](../ARCHITECTURE.md) y [NOTES](../NOTES.md) son referencias de compatibilidad, sin contenido canónico duplicado.
