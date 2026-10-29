# Documentación de PsicoPanel

Estado operativo al 29 de octubre de 2026: base `main` `a1720245083008399a3543ca4b794ec4d1289d5a` (merge #27). A/B/C/D1/D2 y #25–#27 integrados; Issues #21–#23 cerrados. [Resumen vigente, backlog y cortes históricos](operational-status.md). D3, nuevas vinculaciones y activación/permisos por episodio pendientes. #19/#24 documentaron producto de pareja, sin implementar su motor. Integración en Git y pruebas aisladas no acreditan instalación ni despliegue habitual.

Entrada general en [README raíz](../README.md); instrucciones de trabajo en [AGENTS](../AGENTS.md) y [contribución](../CONTRIBUTING.md). A (#10, 0f2ebba), B (#11, 5e549f5) y C (#12, 543442e) integrados. Los informes anteriores de B/C conservan evidencia histórica aislada. La [validación CI](ci-validation.md) conserva ejecuciones históricas identificadas por SHA; la ejecución de cada nuevo PR se consulta separadamente.

## Fuentes canónicas

| Tema | Documento y estado |
| --- | --- |
| Estado operativo y backlog | [Corte #40 y seguimiento #28–#41](operational-status.md): integración, decisiones, pendientes y clasificación histórica |
| Cronología del paciente | [Mi seguimiento — contrato y evidencia Issue #21](patient-follow-up.md): integrado en #27; Issue #21 cerrado; consultas completadas, tareas e histórico separado sin notas profesionales |
| Cumplimiento de objetivos | [Contrato y evidencia Issue #22](objective-completion-authorization.md): integrado en #26; Issue #22 cerrado; solo psicólogo autorizado escribe, paciente consulta progreso y conserva tareas interactivas |
| Privacidad API del paciente | [Contrato y evidencia Issue #23](patient-response-privacy.md): integrado en #25; Issue #23 cerrado; proyecciones por rol; evidencia histórica aislada sin despliegue |
| Arquitectura | [architecture.md](architecture.md): implementación, fundamentos no activados y futuro separados |
| Desarrollo y pruebas | [development.md](development.md): Docker/WSL, inicialización nueva, seguridad y destinos aislados |
| Producto | [Visión](product/vision.md), [decisiones/abiertos](product/decisions.md), [reglas](product/business-rules.md), [roadmap](product/roadmap.md): aprobado no equivale a implementado |
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

- [clinical-data-integrity.md](clinical-data-integrity.md): política y evidencia de 001; distinguir edición versionada actual de objetivo de adendas.
- [authentication-security.md](authentication-security.md): contratos 002 y evidencia histórica, con nota de actualización de roles #7.
- [clinical-episodes-foundation.md](clinical-episodes-foundation.md): SQL/runner 003, destinos explícitos y aislamiento; no activa permisos por episodio.
- [clinical-episodes-validation.md](clinical-episodes-validation.md): evidencia histórica de #8, no ejecución de A.

Estos documentos no autorizan ejecutar procedimientos por el hecho de leerlos; conservar los límites del encargo y no reproducir schema/seed en bases existentes.

Las menciones de Draft, HEAD, Issue abierto o tareas futuras dentro de contratos e informes de entrega son cortes históricos de esas entregas. Consultar la [clasificación y estado posterior](operational-status.md#cortes-históricos-y-uso-de-la-evidencia) antes de usarlos como instrucciones.

## Archivo

[NOTES del 13 de abril de 2026](archive/notes-2026-04-13.md) se conserva íntegro con advertencia histórica. Ideas de métricas, feedback, Calendar, WhatsApp y otras no se convierten en requisitos aprobados. Los archivos raíz [ARCHITECTURE](../ARCHITECTURE.md) y [NOTES](../NOTES.md) son referencias de compatibilidad, sin contenido canónico duplicado.
