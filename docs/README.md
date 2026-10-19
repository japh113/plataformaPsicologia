# Documentación de PsicoPanel

Corte C: B integrado en #11 (5e549f5); C autorizado en rama, pendiente de revisión/integración. [Contrato C](contact-changes.md) y [validación C](contact-change-validation.md). Sin despliegue habitual. Las referencias siguientes al corte B conservan su contexto anterior al merge.

Entrada general en [README raíz](../README.md); instrucciones de trabajo en [AGENTS](../AGENTS.md). A integrado en #10 (0f2ebba). B autorizado e implementado en su rama, con pruebas y demo aisladas; revisión/integración pendientes, sin despliegue habitual ni C/D.

## Fuentes canónicas

| Tema | Documento y estado |
| --- | --- |
| Arquitectura | [architecture.md](architecture.md): implementación, fundamentos no activados y futuro separados |
| Desarrollo y pruebas | [development.md](development.md): Docker/WSL, inicialización nueva, seguridad y destinos aislados |
| Producto | [Visión](product/vision.md), [decisiones/abiertos](product/decisions.md), [reglas](product/business-rules.md), [roadmap](product/roadmap.md): aprobado no equivale a implementado |
| Plan de entregas | [identity-directory-delivery-plan.md](identity-directory-delivery-plan.md): A integrado, B en ejecución/revisión; C/D pendientes |
| Diseño 2A | [stage2a-identity-directory-intake.md](stage2a-identity-directory-intake.md): mecanismos propuestos y requisitos aprobados diferenciados |
| Mutaciones legacy | [stage2a-legacy-mutations.md](stage2a-legacy-mutations.md): inventario revalidado por ruta/escritor; bloqueo AB-23 implementado en B |
| Identidad/verificación B | [Guía](patient-identity-verification.md), [validación](patient-identity-validation.md): código y demo aislada, sin despliegue habitual |
| Reorganización A | [documentation-audit.md](documentation-audit.md): inventario, clasificación, instrucciones sustituidas y validación |

## Seguridad, procedimientos y evidencia conservados

- [clinical-data-integrity.md](clinical-data-integrity.md): política y evidencia de 001; distinguir edición versionada actual de objetivo de adendas.
- [authentication-security.md](authentication-security.md): contratos 002 y evidencia histórica, con nota de actualización de roles #7.
- [clinical-episodes-foundation.md](clinical-episodes-foundation.md): SQL/runner 003, destinos explícitos y aislamiento; no activa permisos por episodio.
- [clinical-episodes-validation.md](clinical-episodes-validation.md): evidencia histórica de #8, no ejecución de A.

Estos documentos no autorizan ejecutar procedimientos por el hecho de leerlos; conservar los límites del encargo y no reproducir schema/seed en bases existentes.

## Archivo

[NOTES del 13 de abril de 2026](archive/notes-2026-04-13.md) se conserva íntegro con advertencia histórica. Ideas de métricas, feedback, Calendar, WhatsApp y otras no se convierten en requisitos aprobados. Los archivos raíz [ARCHITECTURE](../ARCHITECTURE.md) y [NOTES](../NOTES.md) son referencias de compatibilidad, sin contenido canónico duplicado.
