# PsicoPanel

Estado tras el merge de PR #14 en `main`, commit `3f51f09c525fa7a202bd57232637832dd2d036cd`. A, B y C están integrados; D no está iniciado. Integración en Git no acredita despliegue habitual. GitHub Actions/CI está integrado en `main`: [implementación](docs/ci-implementation.md), [plan y criterios](docs/ci-plan.md) y [evidencia técnica histórica](docs/ci-validation.md). La [ejecución del merge 39363841602](https://github.com/japh113/plataformaPsicologia/actions/runs/39363841602) aprobó los siete checks.

CI-02 sigue pendiente de comprobar un PR exclusivamente Markdown, independiente de #14, con los siete checks aprobados y artifacts del commit realmente probado. CI-07 sigue pendiente de activación y verificación administrativa de checks obligatorios, con autorización separada. La aceptación de CI será completa solo después de ambas validaciones; este PR documental no modifica la protección de `main`.

Plataforma para psicólogos independientes y pacientes: agenda, disponibilidad, espera manual asistida, tareas, objetivos, notas y seguimiento clínico, con backoffice separado.

La aplicación activa es web (React/Vite + Express JavaScript + PostgreSQL). React Native/Expo y TypeScript son dirección futura, sin migración en curso por este encargo.

## Estado y fuentes

PR #7 restringió el acceso clínico del backoffice; #8 integró fundamentos SQL de episodios sin activar sus permisos; #9 documentó identidad/directorio. A (#10, `0f2ebba`) integró decisiones y documentación; B (#11, `5e549f5`), registro adulto, identidad propia y verificación simulada email/SMS con barrera legacy AB-23; C (#12, `543442e`), cambio seguro de contactos y revocación total de sesiones. D (perfil/directorio) requiere autorización propia. 2A sigue parcial: nuevas vinculaciones, activación y permisos por episodio no están implementados.

| Necesidad | Fuente |
| --- | --- |
| Navegar documentación y distinguir estado actual/futuro | [docs/README.md](docs/README.md) |
| Trabajar como agente en este repositorio | [AGENTS.md](AGENTS.md) |
| Arquitectura implementada y fundamentos no activados | [docs/architecture.md](docs/architecture.md) |
| Identidad y verificación B | [Guía y demo](docs/patient-identity-verification.md), [evidencia aislada](docs/patient-identity-validation.md) |
| Desarrollo Docker/WSL, pruebas y demos aisladas | [docs/development.md](docs/development.md) |
| Contribuir por rama y PR; CI, evidencia y aceptación | [CONTRIBUTING.md](CONTRIBUTING.md), [implementación](docs/ci-implementation.md), [resultados](docs/ci-validation.md) |
| Contrato C y evidencia histórica final | [Cambio seguro de contactos](docs/contact-changes.md), [deadline](docs/contact-change-deadline-validation.md); informes anteriores: [inicial](docs/contact-change-validation.md), [primera revisión P2](docs/contact-change-review-validation.md) |
| Producto y reglas aprobadas | [Visión](docs/product/vision.md), [decisiones](docs/product/decisions.md), [reglas](docs/product/business-rules.md), [roadmap](docs/product/roadmap.md) |
| Próximas entregas y decisiones pendientes | [Plan A/B/C/D](docs/identity-directory-delivery-plan.md), [diseño 2A](docs/stage2a-identity-directory-intake.md), [mutaciones legacy](docs/stage2a-legacy-mutations.md) |
| Reorganización y notas históricas | [Inventario](docs/documentation-audit.md), [archivo de abril](docs/archive/notes-2026-04-13.md) |

## Desarrollo y seguridad

Docker local usa Node 24 y PostgreSQL 17; no requiere instalar npm en host. [Preparación y comandos](docs/development.md) con secretos locales propios y dependencias por lockfile. App: http://localhost:5173; API: http://localhost:5000/api; salud: http://localhost:5000/api/health, solo con entorno autorizado levantado.

No ejecutar schema/seed o normalizadores como actualización de bases existentes. No aplicar migraciones sobre la base habitual ni alterar contenedores/volúmenes existentes por este encargo. 001–003 se conservan; 003 requiere ejecución explícita y no habilita permisos por episodio. Guías: [integridad](docs/clinical-data-integrity.md), [autenticación](docs/authentication-security.md), [fundamentos 003](docs/clinical-episodes-foundation.md).

Roles reales: patient, psychologist, support, admin y superadmin. Los tres administrativos no tienen acceso clínico global ordinario. Hoy todavía existe autorización legacy por paciente: ni registro, verificación o directorio autorizan clínica nueva por sí solos.

A/B/C están integrados; 004 y 005 existen y fueron ensayadas aisladamente, sin acreditar aplicación habitual. Las altas unilaterales y nuevas vinculaciones legacy están temporalmente deshabilitadas para todas las cuentas. [Contratos y límites B](docs/patient-identity-verification.md), [contrato C](docs/contact-changes.md). ADR-029/RN-59–61 siguen vigentes con precondición backend/DB de activación pendiente. Entrega por rama nueva y PR hacia main; merge y cambios administrativos requieren autorización posterior.
