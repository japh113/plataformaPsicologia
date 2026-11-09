# PsicoPanel

Punto de continuidad vigente: [checkpoint](docs/project-checkpoint.md), corte del 9 de noviembre de 2026, `main` verificado `9ada64b2b529a2849b4881396585a3756a3781c1`, #62 integrado. 2A parcial, A/B/C/D1/D2 y SQL 001–012 integrados; sin nuevas lecturas clínicas, activación ni despliegue acreditado. Reconsultar GitHub antes de cada encargo. [Prioridades](docs/product/roadmap.md#planificación-vigente--9-de-noviembre-de-2026), [inventario documental](docs/documentation-inventory.md) y [seguridad](docs/security-codeql-triage.md).

El [corte #40](docs/operational-status.md) del 29 de octubre conserva evidencia histórica de A/B/C/D1/D2 y #25–#27; no es el estado vigente. D3, nuevas vinculaciones y permisos clínicos completos por episodio siguen pendientes. Código integrado y pruebas aisladas no acreditan instalación o despliegue habitual.

CI implementada en #14, con aceptación documental #15 y ensayo negativo #16 cerrado sin merge. Protect main exige siete checks con política estricta y sin bypass, rereconsultado de solo lectura para este rebaseline. Los resultados históricos conservan su SHA; cada PR documental ejecuta su propia matriz completa en runners nuevos.

Plataforma para psicólogos independientes y pacientes: agenda, disponibilidad, espera manual asistida, tareas, objetivos, notas y seguimiento clínico, con backoffice separado.

La aplicación activa es web (React/Vite + Express JavaScript + PostgreSQL). React Native/Expo y TypeScript son dirección futura; esa dirección no autoriza iniciar una migración.

## Estado y fuentes

PR #7 restringió el acceso clínico del backoffice; #8 integró fundamentos SQL de episodios sin activar sus permisos; #9 documentó identidad/directorio. A (#10, `0f2ebba`) integró decisiones y documentación; B (#11, `5e549f5`), registro adulto, identidad propia y verificación simulada email/SMS con barrera legacy AB-23; C (#12, `543442e`), cambio seguro de contactos y revocación total de sesiones. D1/006 (#17) y D2/007 (#18) integraron persistencia y gestión privadas; el directorio público D3 sigue pendiente (#29). 2A sigue parcial: nuevas vinculaciones, activación y permisos por episodio no están implementados.

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
| Estado, riesgos residuales y backlog GitHub | [Checkpoint vigente](docs/project-checkpoint.md) y [matriz de Issues](docs/product/roadmap.md#matriz-de-los-13-issues-abiertos); seguimiento no equivale a autorización |
| Próximas entregas y decisiones pendientes | [Plan A/B/C/D](docs/identity-directory-delivery-plan.md), [diseño 2A](docs/stage2a-identity-directory-intake.md), [mutaciones legacy](docs/stage2a-legacy-mutations.md) |
| Reorganización y notas históricas | [Inventario vigente](docs/documentation-inventory.md), [archivo de abril](docs/archive/notes-2026-04-13.md) |

## Desarrollo y seguridad

Docker local usa Node 24 y PostgreSQL 17; no requiere instalar npm en host. [Preparación y comandos](docs/development.md) con secretos locales propios y dependencias por lockfile. App: http://localhost:5173; API: http://localhost:5000/api; salud: http://localhost:5000/api/health, solo con entorno autorizado levantado.

No ejecutar schema/seed o normalizadores como actualización de bases existentes. Aplicar migraciones sobre la base habitual o alterar contenedores/volúmenes existentes requiere destino verificado y autorización específica. 001–012 y sus hashes se conservan; 003–012 requieren ejecución explícita y no habilitan permisos por episodio. Guías: [integridad](docs/clinical-data-integrity.md), [autenticación](docs/authentication-security.md), [fundamentos 003](docs/clinical-episodes-foundation.md).

Roles reales: patient, psychologist, support, admin y superadmin. Los tres administrativos no tienen acceso clínico global ordinario. Hoy todavía existe autorización legacy por paciente: ni registro, verificación o directorio autorizan clínica nueva por sí solos.

A/B/C/D1/D2 están integrados; 004–007 existen y fueron ensayadas aisladamente, sin acreditar aplicación habitual. Las altas unilaterales y nuevas vinculaciones legacy están temporalmente deshabilitadas para todas las cuentas. [Contratos y límites B](docs/patient-identity-verification.md), [contrato C](docs/contact-changes.md). ADR-029/RN-59–61 siguen vigentes con precondición backend/DB de activación pendiente. Entrega por rama nueva y PR hacia main; merge y cambios administrativos requieren autorización posterior.
