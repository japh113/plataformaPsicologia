# PsicoPanel

Plataforma para psicólogos independientes y pacientes: agenda, disponibilidad, espera manual asistida, tareas, objetivos, notas y seguimiento clínico, con backoffice separado.

La aplicación activa es web (React/Vite + Express JavaScript + PostgreSQL). React Native/Expo y TypeScript son dirección futura, sin migración en curso por este encargo.

## Estado y fuentes

PR #7 restringió el acceso clínico del backoffice; #8 integró fundamentos SQL de episodios sin activar sus permisos; #9 documentó identidad/directorio. PR A (#10, merge 0f2ebba) está integrado. PR B implementa en su rama el registro adulto, identidad propia y verificación simulada email/SMS, con bloqueo legacy aprobado AB-23. Revisión e integración de B pendientes; sin despliegue. Cambios de contacto (C) y directorio/revisión de credenciales (D) siguen pendientes.

| Necesidad | Fuente |
| --- | --- |
| Navegar documentación y distinguir estado actual/futuro | [docs/README.md](docs/README.md) |
| Trabajar como agente en este repositorio | [AGENTS.md](AGENTS.md) |
| Arquitectura implementada y fundamentos no activados | [docs/architecture.md](docs/architecture.md) |
| Identidad y verificación B | [Guía y demo](docs/patient-identity-verification.md), [evidencia aislada](docs/patient-identity-validation.md) |
| Desarrollo Docker/WSL, pruebas y demos aisladas | [docs/development.md](docs/development.md) |
| Producto y reglas aprobadas | [Visión](docs/product/vision.md), [decisiones](docs/product/decisions.md), [reglas](docs/product/business-rules.md), [roadmap](docs/product/roadmap.md) |
| Próximas entregas y decisiones pendientes | [Plan A/B/C/D](docs/identity-directory-delivery-plan.md), [diseño 2A](docs/stage2a-identity-directory-intake.md), [mutaciones legacy](docs/stage2a-legacy-mutations.md) |
| Reorganización y notas históricas | [Inventario](docs/documentation-audit.md), [archivo de abril](docs/archive/notes-2026-04-13.md) |

## Desarrollo y seguridad

Docker local usa Node 24 y PostgreSQL 17; no requiere instalar npm en host. [Preparación y comandos](docs/development.md) con secretos locales propios y dependencias por lockfile. App: http://localhost:5173; API: http://localhost:5000/api; salud: http://localhost:5000/api/health, solo con entorno autorizado levantado.

No ejecutar schema/seed o normalizadores como actualización de bases existentes. No aplicar migraciones sobre la base habitual ni alterar contenedores/volúmenes existentes por este encargo. 001–003 se conservan; 003 requiere ejecución explícita y no habilita permisos por episodio. Guías: [integridad](docs/clinical-data-integrity.md), [autenticación](docs/authentication-security.md), [fundamentos 003](docs/clinical-episodes-foundation.md).

Roles reales: patient, psychologist, support, admin y superadmin. Los tres administrativos no tienen acceso clínico global ordinario. Hoy todavía existe autorización legacy por paciente: ni registro, verificación o directorio autorizan clínica nueva por sí solos.

A está integrado y B autorizado expresamente. Las altas unilaterales y nuevas vinculaciones legacy están temporalmente deshabilitadas para todas las cuentas. [Contratos, migración 004, demo y límites de B](docs/patient-identity-verification.md). C/D requieren autorización propia. Entrega por rama y PR hacia main, sin merge ni push directo a main.
