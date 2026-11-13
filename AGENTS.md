# AGENTS

## Ruta mínima de continuidad

1. Leer este archivo: reglas generales y límites.
2. Leer [checkpoint](docs/project-checkpoint.md): estado vigente, SHA remoto consultado y capacidades reales.
3. Leer [planificación vigente](docs/product/roadmap.md#planificación-vigente--9-de-noviembre-de-2026): prioridades, dependencias y siguiente candidato.
4. Leer los ADR, reglas y contratos específicos del alcance en el [índice](docs/README.md). Consultar [arquitectura](docs/architecture.md) y [desarrollo](docs/development.md) cuando la tarea los requiera.
5. Abrir informes históricos solo para comprobar evidencia necesaria. El [inventario](docs/documentation-inventory.md) distingue contratos, propuestas e historia; no hace falta leer todo docs/ en cada sesión.

Corte del 9 de noviembre de 2026: `main` consultado `9ada64b2b529a2849b4881396585a3756a3781c1`, #62 integrado. A/B/C/D1/D2 y SQL 001–012 integrados en Git; **2A parcial**, D3 y permisos clínicos completos pendientes. Las rutas técnicas nuevas mantienen `prepared`, `allowed:false`, `audienceVerified:false`; procedencia reconocida por 011 no equivale a audiencia operativa. Originales privados, sin lectura clínica nueva ni publicación automática. El checkout o GitHub pueden haber avanzado: reconsultarlos antes de trabajar.

## Alcance y límites operativos

- Cada trabajo requiere alcance y autorización propios. Un Issue, candidato del roadmap, informe histórico o PR integrado no autoriza el siguiente incremento. Verificar `origin/main`, PRs, Issues y seguridad pertinentes, estado/diff e instrucciones aplicables antes de editar. Preservar cambios ajenos; usar rama de tarea y commits descriptivos. Publicar solo el PR autorizado; sin push directo a main, merge ni despliegue por costumbre.
- PsicoPanel es React/Vite + Express JavaScript + PostgreSQL. React Native/Expo y TypeScript son dirección futura, sin migración actual. Preservar servicios reutilizables, contratos y estilo existente.
- Conservar SQL **001–012**, manifiesto y hashes. No ejecutar schema/seed, normalizadores o migraciones sobre bases existentes/habituales, ni alterar datos, contenedores o volúmenes preexistentes. Instalación y despliegue requieren destino y autorización explícitos; Git/CI no los acreditan.
- Desarrollo Docker/WSL según [development.md](docs/development.md). No instalar herramientas en host ni reconstruir el entorno habitual para suplir npm sin autorización. Ensayos autorizados solo en PostgreSQL nuevo, aislado y con recursos propios verificados.
- RN-28/ADR-018: datos actuales ficticios, sin usuarios reales según declaración de producto; no migrar ni conciliar demo para salvarla, sin autorización para borrar/restablecer recursos existentes. Demos ADR-019 solo conforme al incremento autorizado.
- Conservar AB-23 y [todas las mutaciones legacy](docs/stage2a-legacy-mutations.md), para cuentas nuevas y existentes; no resolver ni borrar pendientes antiguos. No retirar parcialmente el fallback ni conectar LOGINs técnicos/fixtures atribuidos al pool o lectores habituales. Activación exige aislamiento integral y retiro coordinado probado.
- No inferir DOB, identidad, verificación, episodio, autoría, audiencia ni validación histórica desde edad, entrevista, contacto, vínculo o aprobación. Sin fusiones de identidad ni vías alternativas para menores.
- Entrevista propia suficiente y validación profesional antes de cada activación nueva (ADR-029/RN-59–61), con precondición backend/DB aún pendiente. ADR-031 aprueba dos modalidades y plantillas predefinidas con personalización limitada; editor avanzado fuera del MVP. D21 no aprobada; D12–D20 no amplían automáticamente MVP/2A.
- No activar D2/D3, nuevas relaciones, clínica, publicación, proveedores, credenciales remotas, recuperación excepcional o emergencia por aparecer en un diseño. Acreditación, identidad y directorio no conceden clínica.

## Invariantes y UX

Backoffice separado de clínica: support lector operativo; admin/superadmin gestionan funciones autorizadas, sin acceso clínico global ordinario ni break-glass implícito (RN-27).

Citas de 60 minutos por hora exacta, sin solapamientos ni múltiples activas del paciente por día; no completar futuras. Nota solo desde cita completada no futura; cita con nota no vuelve a pendiente/cancelada. Conservar historia; finalización/adendas RN-23 siguen pendientes (#35).

Espera manual: sugerir prioridad 1 y conservar decisión profesional. Disponibilidad con múltiples bloques, excepciones y rangos; no dejar citas futuras sin cobertura. Menos ruido en expediente, modales cuando se sature, agenda mensual calendario, chips compactos semanales/mensuales y colores semánticos distintos.

## Verificación y entrega

Aplicar el [flujo del checkpoint](docs/project-checkpoint.md#flujo-de-desarrollo-y-actualización): propietario delimita/aprueba; Codex entrega Draft; siete checks; Work audita; Codex corrige bloqueantes; Work verifica HEAD final; propietario decide integración. Verificar main después y actualizar documentación. No iniciar el siguiente candidato automáticamente.

Antes de cerrar: revisar diff, alcance y permisos. Código funcional: unitarias backend, integración pertinente aislada, frontend lint/build y demo ficticia ADR-019. Agenda exige evaluar backend/frontend, espera y disponibilidad. Markdown solo: contrastar código/GitHub, enlaces/fragmentos/IDs, decisiones y hashes; no ejecutar manualmente bases ni demos. CI conserva siete checks y artifacts de **14 días** del HEAD final en runners nuevos: matriz completa para cambios técnicos/mixtos, push a main y ejecución manual; solo la allowlist documental verificada admite suites explícitamente no aplicables según el [contrato CI](docs/ci-implementation.md#ruta-documental-y-eventos). Documentar lo no disponible; evidencia histórica nunca cuenta como prueba nueva. Commitear documentación y publicar solo la rama/PR autorizados.

### CI asíncrona: no consumir agentes esperando checks

- **Codex y Work no deben permanecer activos esperando** a que GitHub Actions termine ni realizar polling repetitivo de checks, jobs, logs o artifacts. La espera pasiva y la ejecución de CI pertenecen a GitHub, no al trabajo del agente.
- **Codex:** completar el alcance autorizado, las validaciones locales posibles y publicar el PR/HEAD. Consultar como máximo una vez que la CI haya iniciado; si sigue en ejecución, terminar la intervención con SHA, enlaces, comprobaciones realizadas y estado **`CI pendiente`**. No afirmar éxito ni inventar artifacts todavía no disponibles.
- **Work:** auditar código/contratos sin esperar la CI. Si al consultar una vez la evidencia ya está completa, verificar HEAD, checks y artifacts pertinentes; si no, entregar dictamen de contenido y señalar exactamente qué validación sigue pendiente. No repetir consultas solo para observar el progreso.
- **Propietario:** comprobar después la finalización de CI/CodeQL y los artifacts del HEAD definitivo, y solicitar una intervención adicional únicamente si hay fallos, cambio de HEAD, evidencia faltante o una revisión específica necesaria. El estado comunicado por el propietario no sustituye comprobar la evidencia requerida antes de integrar.
- **Puerta de merge inalterada:** ningún PR se integra sin los siete checks obligatorios, análisis aplicables, evidencia del HEAD final y auditorías exigidas. El protocolo reduce consultas y consumo; no relaja pruebas, privacidad, seguridad ni aprobación del propietario.

Referencias de implementación: frontend/src/App.jsx, AppointmentsScreen y NotesScreen; servicios auth, patients, appointments y availability, más lectores laterales del inventario de arquitectura.

## Mantenimiento documental

El checkpoint **se actualiza**, no acumula encargos/PR indefinidamente. Los ADR preservan decisiones aprobadas; el roadmap, prioridades y dependencias; los contratos, comportamiento exigible; los informes históricos, evidencia por fecha/commit; los Issues, trabajo pendiente y estado remoto. No duplicar todos los ADR aquí. Ningún documento histórico autoriza trabajo nuevo. Actualizar el inventario cuando se añadan documentos; cualquier traslado/consolidación/eliminación requiere alcance separado y auditoría de consumidores.
