# Documentación de PsicoPanel

La continuidad vigente está en el [checkpoint](project-checkpoint.md), corte del **13 de noviembre de 2026**, `main` `23593644564c4e8214c5c139dc60a61056f731b2`, #70 integrado. **2A parcial**, A/B/C/D1/D2 y SQL 001–012 en Git; D3, nuevas vinculaciones, activación y aislamiento clínico completo pendientes. Procedencia privada reconocida por 011 no habilita audiencia operativa ni lectura clínica. Instalación habitual/despliegue no acreditados.

El [primer incremento bilateral ficticio 013](stage2a-identity-directory-intake.md#implementación-del-primer-incremento-ficticio--013) se implementa en una rama propia pendiente de auditoría/integración; sin habilitación habitual ni clínica.

## Ruta mínima de lectura

1. [AGENTS](../AGENTS.md): reglas y alcance/autorización.
2. [Checkpoint](project-checkpoint.md): qué está integrado, qué sigue cerrado, seguridad/CI y cómo retomar.
3. [Roadmap vigente](product/roadmap.md#planificación-vigente--9-de-noviembre-de-2026): prioridades por resultado, dependencias y [13 Issues](product/roadmap.md#matriz-de-los-13-issues-abiertos).
4. Decisiones/reglas y contratos concretos de la tabla siguiente, según tarea.
5. Informes históricos solo cuando aporten evidencia necesaria. El [inventario de 57 Markdown](documentation-inventory.md) registra propósito, autoridad, consumidores, contenido exclusivo y acciones de mantenimiento.

No hace falta leer todo docs/ para iniciar una tarea. [README raíz](../README.md) orienta sobre el producto; [CONTRIBUTING](../CONTRIBUTING.md) conserva el flujo de contribución. Verificar remoto y diff antes de trabajar; ningún candidato/Issue/informe autoriza un incremento nuevo.

## Fuentes canónicas por tarea

| Necesidad | Fuente y frontera |
| --- | --- |
| Decidir producto | [Visión](product/vision.md), [ADR/AB](product/decisions.md), [reglas RN](product/business-rules.md). ADR-031/032 aprobados con límites; D21 no aprobada. Producto aprobado no significa implementado. |
| Saber qué está implementado | [Checkpoint](project-checkpoint.md), [arquitectura](architecture.md) y código del SHA consultado. La arquitectura conserva encabezados de octubre y detalle de dominios; el checkpoint actualiza integración 008–012. |
| Elegir siguiente trabajo | [Roadmap](product/roadmap.md), [candidatos](product/roadmap.md#próximos-tres-incrementos-candidatos). Orden propuesto, no autorización ni cambio de etapas 0–6/2A–2E. |
| Ver seguridad actual | [Triage de 28 CodeQL y cero Dependabot](security-codeql-triage.md). Corte fechado y residual por superficie; no evaluación de despliegue ni falso positivo automático. |
| Desarrollar/verificar | [Desarrollo Docker/WSL](development.md), [CI implementada](ci-implementation.md). Destinos nuevos autorizados, siete checks, artifacts 14 días por HEAD/base/merge/intento. |
| Identidad y contactos | [B](patient-identity-verification.md), [C](contact-changes.md), [diseño bcrypt/012 aprobado](contact-bcrypt-admission-design.md), [auth pública #55](public-auth-hardening.md). Simuladores no autorizan proveedores reales. |
| Perfil profesional/directorio | [Plan A/B/C/D](identity-directory-delivery-plan.md), [D1/006](professional-persistence.md), [D2/007](private-professional-management.md). D1/D2 integrados; D2 condicionado a configuración; aprobación acreditada y D3 siguen pendientes (#28/#29). |
| Episodios/participantes y privacidad | [Paralelos/pareja](parallel-couple-episodes.md), [fundamentos 003/008](clinical-episodes-foundation.md), [evaluación denegadora](episode-authorization-foundation.md), [recursos](episode-resource-resolution.md). Estructura preparada, sin permisos positivos. |
| Procedencia privada y mínimos técnicos | [Elegibilidad/009](private-note-read-eligibility.md), [originales/010](private-note-origins.md), [resolver/011](private-note-origin-resolver.md). Los tres contratos se complementan; 011 ya integrado #54, no conectado a lectores operativos. |
| Inventario de datos y destinatarios | [Privacidad/DTO actual y objetivo 2A](patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo). [Alternativas de audiencia #51](patient-response-privacy.md#propuesta-2a--contrato-de-audiencia-verificable) siguen propuestas salvo subconjunto ADR-032; materiales/publicación no aprobados en bloque. |
| Admisión/entrevistas y vinculación | [D-VIN-01–07](product/decisions.md#decisiones-aprobadas-d-vin-01-a-d-vin-07--vinculación-bilateral) y [contrato canónico de invitaciones](stage2a-identity-directory-intake.md#invitaciones-bilaterales-seguras--contrato-del-primer-incremento): A aprobada, 14 días, primer corte adulto registrado con email/teléfono vigentes verificados; [D-VIN-08–14](product/decisions.md#decisiones-aprobadas-d-vin-08-a-d-vin-14--precisiones-del-contrato-bilateral) precisa referencia privada, cuotas, terminación/restricciones, evidencia, conservación ficticia y unicidad. Mecanismos/texto aún pendientes por hito, sin código. [Contrato objetivo en dos modalidades](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo); D-01–D-12 son propuestas técnicas distintas de D01–D20 clínicos. Validación profesional backend/DB pendiente antes de activación, editor avanzado fuera del MVP. |
| Lectores/escritores existentes | [Seguimiento #27](patient-follow-up.md), [objetivos #26](objective-completion-authorization.md), [privacidad #25](patient-response-privacy.md#contrato-revisado), [integridad/historia](clinical-data-integrity.md). Versiones de notas no equivalen a finalización/adendas #35. |
| Barreras a revalidar | [Mutaciones legacy/AB-23](stage2a-legacy-mutations.md). Nuevas/existentes bloqueadas; no retirar fallback parcialmente ni atribuir historia por inferencia. |

## Evidencia histórica y precedencia

Estos informes conservan fecha, SHA, resultados y límites de **su** entrega. «Draft», «no integrado», «siguiente PR» o «CI propuesta» en esos cortes no describen main hoy. No modificar sus cifras para aparentar validación nueva; comprobar implementación actual en código/checkpoint. Las propuestas todavía no aprobadas siguen siendo propuestas aunque su Markdown esté integrado.

| Evidencia necesaria | Documento |
| --- | --- |
| Razones de reorganización anterior y origen del backlog | [Auditoría de PR A](documentation-audit.md), [corte #40](operational-status.md); ambos históricos, no inventario/estado vigente. |
| CI original, aceptación y negativos | [Plan CI](ci-plan.md), [validación original](ci-validation.md); #14/#15 integrados y #16 ensayo negativo cerrado sin merge. Detalle operativo actual en implementación/workflow. |
| Mantenimiento de CI | [Pins de acciones Node 24](ci-node24.md), [AST y ReDoS #61](ci-inventory-security.md). Conservar motivos, límites y versiones; no repetir lexer abandonado. |
| Fundamentos y privilegios | [003/#8](clinical-episodes-validation.md), [008/#46](episode-participants-validation.md), evidencias por sección de 009/010/011. |
| Identidad/contactos | [B](patient-identity-validation.md); C: [inicial](contact-change-validation.md), [revisión P2](contact-change-review-validation.md), [deadline final](contact-change-deadline-validation.md); [bcrypt #62](contact-bcrypt-admission-validation.md). Etapas de evidencia diferentes, no duplicados eliminables. |
| Profesionales/medios | [D1](professional-persistence-validation.md), [D2](private-professional-validation.md). Ensayos aislados no acreditan D2 habilitado ni capacidad de carga productiva. |
| Dependencias | [Backend #56/#57](backend-dependency-security.md), [minimatch #59](backend-minimatch-security.md), [frontend #58/#60](frontend-dependency-security.md). Conteos/pendientes anteriores no sustituyen consulta vigente. |
| Fundamento clínico de pareja | [Matrices anonimizadas](couple-clinical-evidence.md). Preservar discrepancias; opinión clínica no es dictamen jurídico. |
| Notas iniciales | [Archivo abril](archive/notes-2026-04-13.md), accesible desde [NOTES raíz](../NOTES.md); no fuente operativa ni permiso de push a main/schema/seed. [ARCHITECTURE raíz](../ARCHITECTURE.md) es otra redirección compatible. |

## Regla de mantenimiento

Checkpoint se actualiza sin acumular todos los PRs; ADR preservan decisiones, roadmap prioridades/dependencias, contratos comportamientos exigibles, Issues trabajo/estado, e informes evidencia fechada por commit. Al integrar una entrega, verificar main y ajustar las entradas vigentes, dejando enlaces a historia. Inventario se amplía con cada documento nuevo; el tamaño no decide su valor. [Limpieza propuesta](documentation-inventory.md#segundo-pr-de-limpieza-propuesto-no-autorizado) requiere otro alcance: no mover/eliminar/fusionar archivos en este PR.

Mantener `prepared`, `allowed:false`, `audienceVerified:false`, AB-23, originales privados y separación backoffice/clínica. Conservar SQL 001–012/manifiesto/hashes; sin bases habituales, datos reales, migraciones, publicación, proveedores, merge o despliegue por inferencia documental.
