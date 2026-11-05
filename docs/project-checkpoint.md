# PsicoPanel — Checkpoint de continuidad

## Estado y uso

Checkpoint del **4 de noviembre de 2026**, posterior a [PR #52](https://github.com/japh113/plataformaPsicologia/pull/52). `main` verificado por fetch Git: [`9238406b0c441fef8b1cbaec7f78b0ba1288b102`](https://github.com/japh113/plataformaPsicologia/commit/9238406b0c441fef8b1cbaec7f78b0ba1288b102). Metadatos de GitHub contrastados al preparar este documento; no es una consulta permanente del estado remoto.

Para retomar: leer [AGENTS](../AGENTS.md), este checkpoint y las fuentes del alcance; comprobar nuevamente HEAD remoto, estado/diff local e Issues/PRs relevantes. Conservar cambios ajenos. Cada incremento requiere aprobación propia del propietario. Este resumen orienta; **los ADR, reglas y contratos canónicos prevalecen** y no se modifican por resumirlos aquí.

| Estado | Significado en este corte |
| --- | --- |
| Diseño aprobado | ADR-030/031/032 y reglas aplicables fijan producto o contrato; no prueban que todas sus capacidades están implementadas. |
| Código integrado | A/B/C/D1/D2 y fundamentos internos 2A, SQL 001–010, están en Git. |
| Funcionamiento habilitado | La web conserva autorización legacy por paciente y barrera AB-23. Las nuevas rutas técnicas de episodios solo admiten `prepared`; evaluadores deniegan con `allowed:false` y el resolver mantiene `audienceVerified:false`. |
| Instalación y despliegue | Pruebas aisladas y CI no acreditan aplicación de migraciones ni despliegue en la base habitual. No se verificó ni intervino esa base para este checkpoint. |

**2A sigue parcial.** D3, nuevas vinculaciones, admisión operativa, validación de entrevista backend/DB, activación, aislamiento clínico completo y retiro coordinado del fallback están pendientes.

## Integraciones relevantes

| PR integrado | Entrega y límite |
| --- | --- |
| #7/#8; #10–#12; #17/#18 | Backoffice separado, fundamentos 003; A/B/C e identidad/contactos; D1/D2 privados. D3 no habilitado. [Plan canónico](identity-directory-delivery-plan.md). |
| #19/#24; #43/#44 | Producto individual/pareja y consolidación clínica documental; no motor clínico. [ADR-030/031](product/decisions.md#adr-030--episodios-paralelos-pareja-y-derivación-por-tratamiento). |
| #25–#27 | Privacidad de respuestas del paciente, objetivos solo por profesional y seguimiento sin notas profesionales. Issues #21–#23 cerrados. [Corte histórico #40](operational-status.md). |
| #45–#48 | Diseño técnico y fundamentos 008, participantes/pertenencia/autoría y recursos verificables, con autorización interna denegadora. [Fundamentos](clinical-episodes-foundation.md#implementación-del-incremento-008--sin-activación). |
| #49/#50 | Elegibilidad interna transaccional y bloqueo de cuenta con privilegios mínimos/009; sin lectura clínica positiva. [Contrato y límites](private-note-read-eligibility.md). |
| [#51](https://github.com/japh113/plataformaPsicologia/pull/51) | Alternativas y propuesta de audiencia verificable. Su integración documental no aprobó todo el esquema de materiales, publicaciones o permisos. [Contrato propuesto](patient-response-privacy.md#propuesta-2a--contrato-de-audiencia-verificable). |
| [#52](https://github.com/japh113/plataformaPsicologia/pull/52) | ADR-032 y 010: nacimiento atómico de notas originales nuevas con constancia privada, creador restringido, verificador diferido independiente y control de ACL de parámetros. HEAD integrado de rama `17b2214d1edec2325a546c7eda8dae8919c23f90`; no conecta el resolver ni abre HTTP/frontend. [Contrato 010](private-note-origins.md). |

Las menciones de «esta rama», Draft o próximo PR dentro de entregas anteriores conservan su corte de evidencia. Consultar esta tabla y GitHub antes de retomarlas; no sustituir sus SHAs o resultados por los actuales.

## Producto aprobado y dependencias

Fuentes: [decisiones](product/decisions.md), [reglas](product/business-rules.md), [contrato clínico/DTO](patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo), [admisión](stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo) y [roadmap](product/roadmap.md). Esta tabla resume acuerdos; su implementación está pendiente salvo las garantías señaladas.

| Tema | Acuerdo y límite |
| --- | --- |
| Tratamientos y responsabilidad | Individual con un paciente; pareja con exactamente dos registrados y un psicólogo responsable. Episodios independientes, incluso al repetir paciente/profesional; no hay herencia de clínica ni de consentimiento. No dos conjuntos activos de la misma dupla; la reserva por pausados AB-37 sigue abierta. ADR-030, D12/D15. |
| Participantes y autoría | Pertenencia y autor explícitos; no mover registros ni atribuir históricos por inferencia. Una nota con sujeto individual dentro de pareja no se convierte en nota de ambos. Fundamentos técnicos no equivalen a permisos operativos. ADR-006/030/032. |
| Pausa, finalización y reanudación | Pausa sin vencimiento automático; revisión profesional a 12 meses de inactividad. Reanudación con confirmaciones aplicables, ambos pacientes en pareja y profesional, revisando permisos/consentimientos/verificaciones; conserva ID. Finalizado exige episodio nuevo. D09/D09.1; mecanismos pendientes. |
| Notas y adendas | Borradores profesionales bloqueados para edición ordinaria durante pausa. Al cierre se resuelven los de sesiones realizadas, por finalización explícita o descarte trazable, sin retención indefinida del texto descartado ni auto-finalización. Finales inmutables y adendas propias con fecha/motivo; #35 aún pendiente. Historia de versiones y bloqueo 010 no implementan ese ciclo. ADR-013, D10/D10.1. |
| Entrevista y plantillas | Autoadministrada con borrador privado y envío explícito, o dirigida en admisión clínica limitada, con permisos/consentimientos por concretar. Entrevista propia suficiente y validación profesional antes de activar, por cada integrante. Plantillas predefinidas con personalización limitada y versión exacta; mínimos clínicos/tipos/límites pendientes, editor avanzado fuera del MVP. ADR-029/031, D02/D11/D13. |
| Portal y confidencialidad | Respuestas propias enviadas, seguimiento y materiales expresamente destinados. Notas profesionales y revelaciones individuales no se publican automáticamente, ni siquiera a la pareja. ARCO separado, identidad verificada, terceros protegidos y revisión jurídica pendiente. D01/D03/D04/D07/D14–D16. |
| Tareas y materiales | Tareas existentes interactivas y objetivos evaluados solo por profesional (#26). Tarea conjunta futura con realización independiente por participante; visibilidad recíproca pendiente. Compartir instrucciones no comparte seguimiento. Materiales destinados serán recursos separados del original; esquema/publicación/revocación pendientes. D05 y ADR-032. |
| Suspensión y cierre de cuentas | Suspender no borra, finaliza ni reasigna episodios. D18–D20 prevén cierre asistido, baja profesional y procedimientos administrativos con custodia/revisión; no están implementados íntegramente ni amplían por sí solos MVP/2A. ADR-015, D17–D20. |
| Original profesional privado | ADR-032 aprueba modelo híbrido C mínimo, procedencia técnica v1 para originales nuevos y desarrollo incremental. No prueba identidad humana, consentimiento ni contenido finalizado. Legacy y notas fuera del mecanismo siguen desconocidas, sin inscripción retroactiva. |

**D21 continúa sin aprobarse.** D12–D20 no autorizan automáticamente todos sus flujos; conservar validaciones jurídicas/clínicas y dependencias específicas. No reinterpretar las propuestas restantes de #51 como decisiones aprobadas.

## Arquitectura integrada

Web React/Vite y backend Node.js/Express en JavaScript, PostgreSQL; los ensayos correspondientes usan **PostgreSQL 17**. React Native/Expo y TypeScript son dirección futura sin migración actual. [Arquitectura](architecture.md) conserva el detalle por dominio; su encabezado de octubre es un corte anterior.

Autenticación JWT con cuenta/rol vigente y `session_version`; backoffice separado de clínica, sesiones profesionales restringidas D2 y revocaciones B/C/D2. `support` es lector operativo; `admin`/`superadmin` gestionan funciones autorizadas sin acceso clínico global ordinario ni emergencia implícita (RN-27).

| SQL integrado | Garantía y frontera |
| --- | --- |
| 001–007 | Integridad/historia, sesiones, fundamentos originales de episodios, identidad/verificación, contactos y gestión profesional privada. Sus entradas y hashes históricos se conservan. |
| 008 | Cabeceras y participantes de individual/pareja, pertenencia/autoría y barrera exclusiva `prepared` en los nuevos fundamentos; sin activación. |
| 009 | Helper de bloqueo transaccional de cuenta, propietario NOLOGIN y LOGIN lector mínimo; contrato de catálogos/ACL, sin acceso clínico positivo. |
| 010 | `clinical_note_private_origins` y creación atómica restringida de originales nuevos, FK compuestas, constancia inmutable y validación diferida con propietario independiente. Rechaza capacidades peligrosas de replicación y deriva, sin reparar permisos. |

El [manifiesto](../backend/sql/migrations/manifest.json), runner, ledger y huellas verifican versiones/contratos; no instalan nada por existir en Git. Creador/lector técnicos y propietarios dedicados se ensayan con privilegios mínimos, cuerpos fijos y `search_path` controlado. El aprovisionador privilegiado es raíz confiable; no hay monitor continuo de administradores. [Contrato 009](private-note-read-eligibility.md#2a-sec--revocaciones-con-privilegios-mínimos), [roles y límites 010](private-note-origins.md#privilegios-efectivos-y-frontera-de-confianza).

## Restricciones críticas

- El proyecto no tiene usuarios ni datos clínicos reales; los registros actuales son demo/pruebas según RN-28/ADR-018. No migrar, reconciliar ni introducir compatibilidad para salvarlos. Esto **no autoriza borrar o restablecer recursos existentes**.
- Conservar íntegramente SQL **001–010**, manifiesto, entradas/hashes e historia técnica mientras rija este modelo de migraciones. No ejecutar schema/seed, normalizadores o migraciones en entornos habituales sin destino y autorización explícitos; no alterar bases, contenedores o volúmenes preexistentes.
- Mantener los episodios exclusivamente `prepared` en las rutas técnicas nuevas, `allowed:false` y `audienceVerified:false` en los componentes operativos actuales. No habilitar lecturas clínicas nuevas, nuevas relaciones, activación ni publicación automática. La propuesta de resolver siguiente no cambia estas garantías en este PR.
- Originales profesionales privados; constancia técnica distinta de identidad humana, consentimiento, validación de entrevista o autorización clínica. No inferir DOB, episodio, autoría, audiencia o validación histórica desde edad, entrevista, contactos, vínculo o aprobación.
- Conservar AB-23 para cuentas nuevas/existentes y [todas las mutaciones legacy](stage2a-legacy-mutations.md). No retirar parcialmente OR/JOIN de fallback ni conectar fixtures atribuidos o el LOGIN creador al pool/lectores habituales.
- No conceder acceso clínico global ordinario al personal administrativo; identidad, acreditación, publicación o directorio no conceden clínica. Sin proveedores, credenciales, recuperación excepcional ni acceso de emergencia por inferencia documental.

## Pendientes verificados y siguiente candidato

Issues abiertos consultados en GitHub el 4 de noviembre de 2026:

| Issue | Pendiente real tras #52 |
| --- | --- |
| [#30](https://github.com/japh113/plataformaPsicologia/issues/30) | Autorización/aislamiento por episodio, todos los lectores/escritores/derivados, retiro coordinado del fallback, activación e invariantes pendientes; fundamentos integrados no cierran el épico. |
| [#35](https://github.com/japh113/plataformaPsicologia/issues/35) | Editor privado, borradores por estado, finalización explícita, adendas propias y D10.1; 010 solo protege procedencia y bloquea escritores actuales sobre notas acreditadas. |
| [#36](https://github.com/japh113/plataformaPsicologia/issues/36) | Aprovisionamiento/conexiones operativas, compatibilidad por entorno, migración persistente y recuperación/restauración seguras; no ejecutado por este checkpoint. |
| [#39](https://github.com/japh113/plataformaPsicologia/issues/39) | Completar clasificación, DTO y lectores por origen/actor/episodio/destinatario; contratos documentales existentes son insumos, sin nuevas proyecciones clínicas. |
| [#31](https://github.com/japh113/plataformaPsicologia/issues/31), [#41](https://github.com/japh113/plataformaPsicologia/issues/41) | Vinculación bilateral/activación y entrevistas/plantillas. ADR-031 amplía el discovery #41 a dos modalidades; no se cierra ni autoriza editor avanzado. |
| [#32](https://github.com/japh113/plataformaPsicologia/issues/32), [#37](https://github.com/japh113/plataformaPsicologia/issues/37) | Concurrencia clínica antes de ampliar escrituras; gates jurídicos, seguridad y operación antes de los usos dependientes/producción. |

También siguen abiertos [#28](https://github.com/japh113/plataformaPsicologia/issues/28) (acreditación), [#29](https://github.com/japh113/plataformaPsicologia/issues/29) (D3), [#33](https://github.com/japh113/plataformaPsicologia/issues/33) (regresión browser), [#34](https://github.com/japh113/plataformaPsicologia/issues/34) (atomicidad de agenda) y [#38](https://github.com/japh113/plataformaPsicologia/issues/38) (identidad excepcional). No todos bloquean un lector interno deshabilitado; sí deben resolverse antes de la capacidad que dependa de ellos. #40 está cerrado; su informe permanece histórico.

**P3 — cobertura adicional de privilegios PostgreSQL, no bloqueante.** Fuente: segunda auditoría independiente de Work sobre #52, HEAD `17b2214d1edec2325a546c7eda8dae8919c23f90`, detalle aportado por el propietario al preparar este checkpoint. Dictamen de Work comunicado: **APROBAR**, sin P0/P1/P2 pendientes. Mejora futura de pruebas, sin vulnerabilidad confirmada ni impedimento para la integración ya realizada.

El caso 6 de [private-note-parameters.cases.js](../backend/test/private-note-parameters.cases.js), alrededor de la línea 139, concede membresía con `INHERIT TRUE, SET TRUE`; no ejecuta un `SET ROLE` real ni separa `INHERIT FALSE, SET TRUE`. Tampoco hay pruebas nuevas específicas de defaults a nivel de rol o combinación base/rol, concesiones con `GRANT OPTION` ni `ALTER SYSTEM` heredado. Work respaldó su rechazo mediante inspección de código; **estas variantes no se presentan como escenarios ejecutados individualmente**. La lectura local del caso y del [verificador](../backend/scripts/private-note-contract.js) contrasta las referencias, sin ejecutar PostgreSQL ni ampliar esa evidencia. Registrar cobertura futura en un encargo autorizado; no implementar las pruebas en este PR documental. El P2 de `session_replication_role` corregido en #52 es distinto.

**Siguiente incremento candidato, sin autorización de implementación:** reconocer internamente la procedencia privada de notas desde la constancia v1 de 010, conservando desconocidos denegados y `allowed:false`, sin texto clínico, nuevas lecturas clínicas, endpoints, permisos positivos, publicación ni activación. El contrato concreto deberá precisar cómo distinguir reconocimiento interno de audiencia operativa aún no habilitada; no cambiar `audienceVerified:false` por inferencia en esta entrega. [Secuencia propuesta tras #50](product/roadmap.md#propuesta-de-incrementos-de-audiencia-tras-50). No crear automáticamente ese PR técnico.


**Encargo posterior a #53, aún sin integrar:** el propietario autorizó el segundo incremento. Base reconsultada `054abd1aebf0e200d11c2783914d1205ccd14bd9`; [resolver y 011 en Draft](private-note-origin-resolver.md), pendientes de CI y auditoría independiente de Work. La procedencia reconocida no cambia audiencia operativa, allowed:false, prepared ni despliegue. No inicia el siguiente incremento. Las tablas anteriores conservan su corte integrado.

## Flujo de desarrollo y actualización

1. El propietario aprueba decisiones de producto y alcance concreto.
2. Codex implementa un PR **Draft** limitado desde `main` verificado.
3. CI ejecuta los siete checks obligatorios.
4. Work realiza auditoría independiente.
5. Codex corrige hallazgos bloqueantes en la misma entrega.
6. Work verifica el HEAD definitivo.
7. El propietario decide si integra el PR; no hay merge automático.
8. Se verifica `main` y se actualiza la documentación aplicable, conservando evidencia histórica.

Checks: `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence` y `ci/required`. Ejecutan normalmente también en PR documentales, en runners nuevos; no modificar workflow para omitirlos. Artifacts técnicos con **14 días** de retención, ligados a HEAD/base/merge probado e intento; no son archivo histórico permanente. [Implementación CI](ci-implementation.md).

Para Markdown: contrastar GitHub/código, enlaces/fragmentos/IDs, decisiones y diff; comprobar SQL/manifiesto intactos. No ejecutar manualmente bases ni demos. Este checkpoint no presenta los resultados históricos #51/#52 como una ejecución nueva: las comprobaciones y CI de su propio PR se registran en ese PR. Para código, aplicar [desarrollo](development.md) y las pruebas/demos ficticias pertinentes en destinos nuevos autorizados.

Actualizar este documento al cambiar el punto de continuidad: fecha, SHA remoto consultado, integraciones, pendientes y enlaces, contrastando de nuevo GitHub. No reemplazar fuentes de decisiones ni reescribir informes anteriores. Si el estado remoto difiere, registrar el nuevo corte antes de implementar.

## Encargo acotado posterior a #56 — instalación npm raíz

Base remota reconsultada el 4 de noviembre de 2026: `2636f3ed94fa98a916b714cff7b3e7e20b415685`, merge de #56; #54 (resolver interno/011) y #55 (endurecimiento de autenticación pública) también integrados. Este corte no reemplaza las tablas históricas anteriores ni acredita despliegue o activación clínica.

El propietario autorizó un único Draft `chore/remove-obsolete-root-npm`: retirar los dos manifiestos raíz tras auditar consumidores, conservar íntegros backend/frontend y su instalación por aplicación, sin merge ni despliegue. [Inventario, justificación y evidencia del encargo](backend-dependency-security.md#retirada-de-la-instalación-raíz-posterior-a-56). Cambios locales ajenos preservados en su checkout original. Se exigen siete checks y auditoría independiente de Work antes de decisión del propietario; no se afirma cierre de alertas antes del reanálisis de GitHub.

## Encargo frontend posterior a #57 — candidato #58

El 5 de noviembre de 2026 se reconsultó `main`: `2725b81e89733e6c24f7bff59a5c4ac4fc65eebd`, #57 integrado, sin PRs abiertos al iniciar. El propietario autorizó un único Draft `fix/security-frontend-dependencies`: Vite 8.0.16 → 8.1.6 y postcss-selector-parser 6.1.4 → 6.1.5, sin merge, despliegue ni cambios de producto/backend/SQL. [Resolución, compatibilidad, validación nueva y riesgos residuales](frontend-dependency-security.md). La evidencia CI del HEAD final y sus artifacts se registra en el PR; auditoría independiente y decisión de integración pendientes. Este encargo no inicia otro incremento.
