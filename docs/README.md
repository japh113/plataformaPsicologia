# Documentación de PsicoPanel

Estado tras el merge de PR #14: `main` en `3f51f09c525fa7a202bd57232637832dd2d036cd`, con [GitHub Actions/CI integrado](ci-implementation.md) y los siete checks aprobados en la [ejecución del merge 39363841602](https://github.com/japh113/plataformaPsicologia/actions/runs/39363841602). A/B/C integrados; D no iniciado. [Contrato C](contact-changes.md). No acredita despliegue habitual. [Plan y aceptación CI-01–07](ci-plan.md).

Entrada general en [README raíz](../README.md); instrucciones de trabajo en [AGENTS](../AGENTS.md) y [contribución](../CONTRIBUTING.md). A (#10, 0f2ebba), B (#11, 5e549f5) y C (#12, 543442e) integrados. Los informes anteriores de B/C conservan evidencia histórica aislada. Las nuevas ejecuciones Actions se registran separadamente en la [validación CI](ci-validation.md).

## Fuentes canónicas

| Tema | Documento y estado |
| --- | --- |
| Arquitectura | [architecture.md](architecture.md): implementación, fundamentos no activados y futuro separados |
| Desarrollo y pruebas | [development.md](development.md): Docker/WSL, inicialización nueva, seguridad y destinos aislados |
| Producto | [Visión](product/vision.md), [decisiones/abiertos](product/decisions.md), [reglas](product/business-rules.md), [roadmap](product/roadmap.md): aprobado no equivale a implementado |
| Plan de entregas | [identity-directory-delivery-plan.md](identity-directory-delivery-plan.md): A/B/C integrados; D no iniciado |
| CI y contribución | [ci-plan.md](ci-plan.md), [CONTRIBUTING](../CONTRIBUTING.md): checks integrados en `main`, [evidencia técnica histórica](ci-validation.md), aislamiento y artifacts; CI-02 pendiente de validar un PR exclusivamente Markdown independiente de #14; CI-07 administrativo pendiente, con autorización separada; aceptación completa solo tras ambas validaciones |
| Diseño 2A | [stage2a-identity-directory-intake.md](stage2a-identity-directory-intake.md): mecanismos propuestos y requisitos aprobados diferenciados |
| Mutaciones legacy | [stage2a-legacy-mutations.md](stage2a-legacy-mutations.md): inventario revalidado por ruta/escritor; bloqueo AB-23 implementado en B |
| Identidad/verificación B | [Guía](patient-identity-verification.md), [validación](patient-identity-validation.md): código y demo aislada, sin despliegue habitual |
| Contactos C | [Contrato](contact-changes.md), [validación final del deadline](contact-change-deadline-validation.md); informes [inicial](contact-change-validation.md) y [primera revisión P2](contact-change-review-validation.md) históricos |
| Reorganización A | [documentation-audit.md](documentation-audit.md): inventario, clasificación, instrucciones sustituidas y validación |

## Seguridad, procedimientos y evidencia conservados

- [clinical-data-integrity.md](clinical-data-integrity.md): política y evidencia de 001; distinguir edición versionada actual de objetivo de adendas.
- [authentication-security.md](authentication-security.md): contratos 002 y evidencia histórica, con nota de actualización de roles #7.
- [clinical-episodes-foundation.md](clinical-episodes-foundation.md): SQL/runner 003, destinos explícitos y aislamiento; no activa permisos por episodio.
- [clinical-episodes-validation.md](clinical-episodes-validation.md): evidencia histórica de #8, no ejecución de A.

Estos documentos no autorizan ejecutar procedimientos por el hecho de leerlos; conservar los límites del encargo y no reproducir schema/seed en bases existentes.

## Archivo

[NOTES del 13 de abril de 2026](archive/notes-2026-04-13.md) se conserva íntegro con advertencia histórica. Ideas de métricas, feedback, Calendar, WhatsApp y otras no se convierten en requisitos aprobados. Los archivos raíz [ARCHITECTURE](../ARCHITECTURE.md) y [NOTES](../NOTES.md) son referencias de compatibilidad, sin contenido canónico duplicado.
