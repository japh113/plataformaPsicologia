# PsicoPanel — Checkpoint de continuidad

## Estado y uso

Corte del **13 de noviembre de 2026**. `origin/main` reconsultado por fetch y GitHub: [`6bcc23a01dedbab973fdad9b5fbb687075032bc5`](https://github.com/japh113/plataformaPsicologia/commit/6bcc23a01dedbab973fdad9b5fbb687075032bc5), merge de [#68](https://github.com/japh113/plataformaPsicologia/pull/68), HEAD integrado `bd6d423c50409a8461e6eabe18c57bc629503d9c`. Coincide con la base esperada del encargo. Al iniciar: **0 PR abiertos, 13 Issues abiertos (#28–#39 y #41), 28 alertas CodeQL, 0 Dependabot**. #30/#31/#39/#41 consultados y abiertos; no se modifican ni cierran. Son consultas fechadas, no estado remoto permanente.

**2A sigue parcial.** Producto aprobado, código integrado, capacidad habilitada, ensayo aislado, instalación habitual y despliegue son estados distintos. Este corte no inspeccionó bases ni configuraciones de entornos. Ausencia de usuarios reales y datos exclusivamente ficticios es declaración del propietario y RN-28/ADR-018, coherente con fixtures/CI; GitHub no puede demostrar la población de una base no consultada.

Para retomar: [AGENTS](../AGENTS.md) → este checkpoint → [planificación vigente](product/roadmap.md#planificación-vigente--9-de-noviembre-de-2026) → decisiones/contratos de la tarea en el [índice](README.md). Los ADR y contratos prevalecen sobre resúmenes; los pasajes «Draft», «esta rama» o «pendiente de integrar» de informes anteriores corresponden a sus cortes históricos. Su índice de clasificación está en el [inventario](documentation-inventory.md).

## Capacidades y fronteras actuales

| Área | Integrado y verificable en código | Deshabilitado o pendiente |
| --- | --- | --- |
| Aplicación y operación legacy | Web React/Vite, Express JavaScript, PostgreSQL; agenda, disponibilidad, espera manual, tareas, objetivos y seguimiento. Backoffice separado; proyecciones privadas #25–#27. | Autorización aún por paciente/fallback legacy; no aislamiento operativo completo por episodio. React Native/Expo/TypeScript son dirección futura. |
| A/B/C | Registro adulto, identidad/verificación simulada, contactos con reautenticación y revocación de sesiones. AB-23 bloquea nuevas vinculaciones legacy globalmente. | Proveedores reales, recuperación excepcional, nuevas invitaciones/solicitudes y activación. |
| D1/D2 | Persistencia y gestión profesionales privadas, sesiones restringidas, propuestas/versiones y fotografías con controles. | D2 depende de flag, esquema y secretos; estado habitual no acreditado. Aprobación operativa de credenciales bloqueada; D3/publicación/admisión pública pendientes. |
| Fundamentos 008/009 | Participantes/pertenencia/autoría explícitos, resolutores de recursos y evaluadores denegadores; bloqueo de cuenta con LOGIN mínimo. | Nuevos episodios solo `prepared`; `allowed:false`, sin retirar fallback ni conceder lectura clínica. |
| Procedencia 010/011 | Nacimiento atómico de originales nuevos con constancia privada y reconocimiento interno de tupla exacta (`originVerified:true` solo con evidencia). | `audienceVerified:false`, `allowed:false`; resolver no conectado a lectores operativos. Sin texto, inscripción retroactiva, publicación ni finalización/adendas. |
| Seguridad 012 | Admisión bcrypt durable por titular antes del cálculo: 10/900 s, cinco fallos previos, replays con contraseña, revalidación A/B y descarte de conexión ante BEGIN/COMMIT incierto. | Carga DB previa, multicuenta y despliegue pendientes de evaluación contextual. No protege automáticamente todas las operaciones autenticadas. |

SQL **001–012** está integrado en Git con manifiesto/hashes. 001–007 conservan historia, sesiones, identidad/contactos y D1/D2; 008 añade participantes; 009 bloqueo mínimo; 010 procedencia; 011 reconocimiento booleano; 012 admisión bcrypt. Pruebas/CI usan destinos nuevos y ficticios: **ninguna integración acredita instalación habitual ni despliegue**. Contratos específicos en [arquitectura](architecture.md), [008](clinical-episodes-foundation.md#implementación-del-incremento-008--sin-activación), [009](private-note-read-eligibility.md#2a-sec--revocaciones-con-privilegios-mínimos), [010](private-note-origins.md), [011](private-note-origin-resolver.md) y [012](contact-bcrypt-admission-validation.md).

## Decisiones aprobadas y pendientes

[ADR-030/031/032](product/decisions.md) y [reglas](product/business-rules.md) conservan individual/pareja, responsabilidad por episodio, independencia de tratamientos, originales profesionales privados y desarrollo incremental. ADR-031 aprueba entrevista autoadministrada o dirigida en admisión limitada y plantillas predefinidas con personalización limitada. Cada integrante requiere entrevista propia suficiente y validación profesional antes de activación; ese acuerdo aún necesita garantías backend/DB. Notas finales inmutables y adendas propias, pausa/reanudación y resolución de borradores al cierre están aprobadas como producto, con mecanismos pendientes.

[D-VIN-01–07](product/decisions.md#decisiones-aprobadas-d-vin-01-a-d-vin-07--vinculación-bilateral) integrado documentalmente en #67 selecciona A, admisión pendiente y primer corte adulto registrado/verificado. [D-VIN-08–14](product/decisions.md#decisiones-aprobadas-d-vin-08-a-d-vin-14--precisiones-del-contrato-bilateral) aprueba correspondencia mediante referencia privada dirigida por canal independiente, cifras antiabuso configurables, terminación unilateral inmediata, efectos Habilitado/Suspendido/Deshabilitado, aceptación de condiciones exactas/versionadas, conservación diferenciada para pruebas ficticias y único acuerdo preclínico vigente PSI–PAC–propósito. **Este encargo autoriza solo consolidación documental y un Draft; sin código ni activación.** Se conserva íntegro el corte anterior de decisiones.

El [contrato canónico y su matriz de pendientes por hito](stage2a-identity-directory-intake.md#evaluación-crítica-y-decisiones-todavía-abiertas) separa lo aprobado de mecanismos aún bloqueantes: referencia/prueba técnica suficiente, estados/revocadores, transacción de desvinculación, texto/evidencia, propósito/unicidad, parámetros técnicos restantes, agotamiento malicioso de cuotas y política operativa ficticia. Revisión jurídica de retención definitiva/respaldos/supresión/bloqueo/ARCO antes de datos reales; 12 meses tras desvinculación sigue hipótesis. B/C no prueban identidad civil ni intención del emisor; reconocer límites humanos sin falsa garantía técnica.

Faltan permisos de admisión/consentimientos, mínimos de plantilla, destinatarios de materiales y marcas conjuntas, mecanismos/parámetros de vinculación aún abiertos, notas y concurrencia, duplicados de pareja pausada y gates jurídicos dependientes. **D21 no aprobada; editor avanzado fuera del MVP; D12–D20 no amplían automáticamente 2A.** Publicación, archivo propio y derechos ARCO no se resuelven mediante inferencias de este resumen. Ver [inventario/DTO](patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo) y [admisión](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo).

## Integraciones que explican el corte

| Entregas integradas | Resultado y evidencia histórica |
| --- | --- |
| #43/#44 | Demo desechable sin conciliación y consolidación ADR-031; [decisiones](product/decisions.md). No motor clínico. |
| #45–#48 | Diseño, 008, autorización denegadora y recursos verificables; [fundamentos](clinical-episodes-foundation.md), [validación](episode-participants-validation.md), [autorización](episode-authorization-foundation.md), [recursos](episode-resource-resolution.md). |
| #49/#50 | Elegibilidad interna y 009 con privilegios mínimos; [contrato](private-note-read-eligibility.md). |
| #51/#52 | Alternativas de audiencia, aprobación ADR-032 e implementación 010; [propuesta restante](patient-response-privacy.md#propuesta-2a--contrato-de-audiencia-verificable), [procedencia](private-note-origins.md). No aprobar en bloque el diseño de materiales. |
| #53/#54 | Continuidad documental y resolver 011; [contrato](private-note-origin-resolver.md). El siguiente candidato del checkpoint anterior ya está integrado. |
| #55 | Correo sin ReDoS y limitadores públicos antes de DB/bcrypt; [límites por proceso](public-auth-hardening.md). |
| #56/#57 | Dependencias backend y retirada de instalación npm raíz obsoleta; [auditoría de consumidores](backend-dependency-security.md). |
| #58–#60 | Vite/PostCSS, minimatch de desarrollo y Zod transitivo; [frontend](frontend-dependency-security.md), [backend](backend-minimatch-security.md). Conteos históricos npm no equivalen a auditoría nueva. |
| #61 | Inventario CI con AST completo, fallos cerrados y límites de recursos; [evidencia y dependencia de Node/Acorn](ci-inventory-security.md). |
| #62 | Admisión bcrypt/012 y correcciones auditadas, incluido BEGIN incierto; [diseño aprobado](contact-bcrypt-admission-design.md), [evidencia](contact-bcrypt-admission-validation.md). |
| #63/#64/#67 | Rebaseline/índices, [contrato mínimo de admisión](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo) y contrato bilateral D-VIN-01–07. #64 aún comparaba A/B; #67 incorpora A y primer corte sin código. D-VIN-08–14 precisa ahora solo producto y parámetros expresos, sin implementar. |
| #65/#66/#68 | Protocolo asíncrono, allowlist documental verificable y jobs ligeros de metadatos sin publicar éxito `ci/*` ya integrados; siete checks y artifacts 14 días conservados. [Clasificación real](../scripts/ci/classification.py), sin inferir fast path por extensión Markdown. |

Antecedentes A/B/C/D1/D2 y #25–#27: [corte histórico #40](operational-status.md). Los checkpoints previos quedan consultables en [Git antes de este rebaseline](https://github.com/japh113/plataformaPsicologia/blob/9ada64b2b529a2849b4881396585a3756a3781c1/docs/project-checkpoint.md), incluida observación P3 de cobertura PostgreSQL de #52: mejora no bloqueante, sin vulnerabilidad confirmada. 011 agrega pruebas SET-only reales para su alcance; no atribuirles cobertura universal de todas las variantes de 010.

## Seguridad y CI

[Triage del 9 de noviembre](security-codeql-triage.md), con conteos remotos reconsultados el 13 de noviembre: 28 alertas abiertas de `js/missing-rate-limiting`, severidad asignada por CodeQL high, instancias abiertas en la consulta; el análisis detallado enlazado corresponde a su SHA histórico; cero Dependabot abiertos. No hay nueva explotación demostrada en esta revisión estática. #8/#9 tienen admisión SQL antes de bcrypt, pero no limitan trabajo DB previo; #28 merece reproducción acotada antes de exponer fotografías; #32 tiene middleware propio con límites locales. No perseguir cero alertas ni descartar hallazgos sin evidencia. TLS DB con `rejectUnauthorized:false` sigue siendo gate antes de conexión remota sensible (#37).

[Protect main](https://github.com/japh113/plataformaPsicologia/rules/25440100) reconsultado de solo lectura el 13 de noviembre: activo, PR requerido, conversaciones resueltas, siete checks estrictos y sin bypass. Esta consulta no acredita checks/artifacts del Draft ni de la base actual; los análisis de bases anteriores son evidencia histórica, no prueba del presente HEAD. Verificar HEAD/base/merge/intento final y análisis aplicables antes de integrar; Work debe auditar independientemente esta entrega.

Checks: `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence`, `ci/required`; además análisis CodeQL JavaScript/TypeScript, Python y Actions. Artifacts **14 días**, no archivo histórico permanente. [Workflow](../.github/workflows/ci.yml) con [allowlist documental verificada y evidencia de no aplicabilidad](ci-implementation.md#ruta-documental-y-eventos) integrada en #66; los siete checks se conservan y solo cuatro suites pueden declararse no aplicables tras recomputar ambas diferencias y merge efectivo; [implementación](ci-implementation.md), [pins Node 24](ci-node24.md) e [inventario AST](ci-inventory-security.md). No cambiar configuración para facilitar aprobación.

## Pendientes y próximos candidatos

Los **13 Issues** siguen representando trabajo real. La [matriz vigente](product/roadmap.md#matriz-de-los-13-issues-abiertos) contrasta avances, pendientes, dependencias y siguiente acción, sin editarlos ni cerrarlos. La actualización remota del 11 de noviembre ya contextualiza avances; #64 y D-VIN posteriores son insumos adicionales, sin satisfacer criterios de cierre. No tomar texto histórico de los Issues como autorización de clínica.

La recomendación anterior de contrato mínimo se documentó en #64 y el contrato bilateral D-VIN-01–07 en #67. El presente encargo consolida D-VIN-08–14 y mantiene el [único primer código futuro](stage2a-identity-directory-intake.md#único-primer-código-futuro-y-prueba-de-aceptación): invitación bilateral segura a adulto registrado/verificado, sin entrevista ni clínica. No iniciarlo automáticamente: resolver los mecanismos realmente bloqueantes de la matriz y obtener autorización propia; no ampliar por defecto a motor clínico, D3, pareja, proveedores ni procedimientos administrativos generales. [Roadmap](product/roadmap.md#próximos-tres-incrementos-candidatos) conserva investigación de carga #37 y concurrencia #32/#35/#34 como candidatos/gates separados.

## Restricciones críticas

Sin nuevas lecturas clínicas, permisos positivos, activación, D2/D3, publicación ni nuevas relaciones. Mantener originales privados, `prepared`, `allowed:false`, `audienceVerified:false` y AB-23; identidad/acreditación/directorio no conceden clínica. No conectar LOGINs técnicos al pool habitual ni retirar fallback parcialmente. Sin atribución histórica inferida ni rescate/migración de demo.

Conservar SQL 001–012/manifiesto/hashes. Sin migraciones, schema/seed, bases habituales, datos/volúmenes/contenedores existentes, proveedores, credenciales remotas, recuperación excepcional, merge o despliegue fuera de encargo explícito. Ningún informe histórico autoriza esas acciones. Sin acceso clínico global ordinario de backoffice, ni emergencia implícita.

## Flujo de desarrollo y actualización

1. Propietario delimita y aprueba producto/alcance concreto.
2. Codex reconsulta main, PRs, Issues/seguridad aplicables y diff; preserva cambios ajenos y entrega rama + PR **Draft**.
3. CI ejecuta los siete checks y análisis aplicables. Verificar evidencia/artifacts del HEAD final, base, merge probado e intento.
4. Work audita independientemente; Codex corrige bloqueantes; Work verifica el HEAD definitivo.
5. Propietario decide integración. Sin merge automático ni siguiente incremento implícito.
6. Tras integración autorizada, verificar main y **reemplazar el corte vigente** de este checkpoint. Conservar cronologías/resultados en informes por fecha/SHA y enlaces Git, no acumular cada encargo aquí.

En otro chat: aportar alcance autorizado, SHA remoto nuevo, rama/HEAD/Draft si existen, decisiones pendientes y evidencia de checks. Releer la ruta mínima; los informes históricos solo cuando hagan falta. Markdown: enlaces/anchors/IDs, código/GitHub y diff; sin bases/demos manuales. Código: [development.md](development.md). Los ADR preservan decisiones; roadmap prioridades; contratos comportamientos; Issues trabajo pendiente; informes evidencia histórica. Actualizar [inventario](documentation-inventory.md) cuando cambie el corpus.
