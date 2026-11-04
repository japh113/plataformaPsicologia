# AGENTS

Punto de continuidad al 4 de noviembre de 2026: `main` verificado `9238406b0c441fef8b1cbaec7f78b0ba1288b102`, PR #51/#52 integrados. Leer primero [checkpoint](docs/project-checkpoint.md): estado 2A parcial, producto aprobado, código integrado y capacidades/despliegue separados. A/B/C/D1/D2 y fundamentos internos 008–010 integrados; D3, nuevas vinculaciones, activación/permisos clínicos completos por episodio y despliegue pendientes. Mantener `prepared`, `allowed:false` y `audienceVerified:false` en las rutas técnicas nuevas actuales; originales privados, sin lectura clínica nueva ni publicación automática. Cada nuevo trabajo requiere alcance y autorización propios. Antes de modificar, verificar `main`, Issues/PRs e instrucciones aplicables; preservar cambios ajenos. Sin merge ni despliegue fuera del encargo. Conservar SQL 001–010 y manifiesto/hashes; siete checks de CI y artifacts de 14 días.

El [corte histórico #40](docs/operational-status.md) conserva la base `a1720245083008399a3543ca4b794ec4d1289d5a` del 29 de octubre, A/B/C/D1/D2 y #25–#27 integrados e Issues #21–#23 cerrados. D2 no está pendiente: [contrato](docs/private-professional-management.md), [evidencia histórica](docs/private-professional-validation.md). Sus resultados no se presentan como pruebas nuevas.

## Contexto y fuentes

PsicoPanel es hoy una web-app React/Vite + Express JavaScript + PostgreSQL. La dirección futura es React Native/Expo y TypeScript, sin migración ahora. Preservar lógica reutilizable, contratos claros y estilo existente. Leer [README](README.md), [índice](docs/README.md), [arquitectura](docs/architecture.md), [decisiones](docs/product/decisions.md), [reglas](docs/product/business-rules.md) y [roadmap](docs/product/roadmap.md).

Distinguir producto aprobado, propuesta técnica e implementación. PR #7 aisló backoffice; #8 integró fundamentos 003, sin activar permisos por episodio ni acreditar despliegue; #9 documentó identidad/directorio. [Plan A/B/C/D](docs/identity-directory-delivery-plan.md): A (#10), B (#11), C (#12), D1 (#17) y D2 (#18) integrados. #19/#24 documentaron producto de pareja, no su motor. AB-23 mantiene bloqueo legacy global. ADR-029/RN-59–61 conservan entrevista y validación profesional previa a toda activación nueva, con precondición backend/DB todavía pendiente. [Guía B](docs/patient-identity-verification.md). Consultar el backlog #28–#41 antes de cada encargo; registrar un Issue no autoriza implementarlo. #41 conserva el discovery inicial; ADR-031 aprobó plantillas predefinidas con personalización limitada y dos modalidades de admisión, aún sin implementación. Editor avanzado fuera del MVP. ADR-032/010 incorpora procedencia privada v1, sin resolver audiencia operativa ni lectura positiva; ver [contrato](docs/private-note-origins.md).

## Límites operativos

Corte histórico del contrato documental 2A, base `main` `e15610289614c4e8eee03ac4fca875810d1439a3` con #43: [ADR-031/D01–D20](docs/product/decisions.md#adr-031--consolidación-clínica-2a-y-admisión-en-dos-modalidades), [inventario/DTO y permisos](docs/patient-response-privacy.md#consolidación-2a--inventario-y-permisos-objetivo), [admisión en dos modalidades](docs/stage2a-identity-directory-intake.md#admisión-clínica-y-entrevistas--contrato-objetivo) y [dependencias](docs/product/roadmap.md#consolidación-2a--dependencias-y-entregas-acotadas). Amplía el discovery inicial #41 sin autorizar editor avanzado, clínica prematura ni implementación por el hecho de documentarlo. D21 no aprobada; D12–D20 no amplían automáticamente MVP/2A. RN-28/ADR-018 descartan migrar o conciliar registros demo, conservando SQL y sin borrar/restablecer recursos existentes.

- Revisar estado/diff antes de editar; preservar cambios ajenos. Usar rama de la tarea, commits pequeños/descriptivos y PR hacia main sin merge cuando así se encargue. No push directo a main ni merge por costumbre; respetar autorización del encargo.
- No ejecutar schema/seed, normalizadores o migraciones sobre bases existentes/habitual; no borrar datos ni alterar contenedores/volúmenes existentes. Conservar 001–010 y manifiesto. 004 de B, 005 de C, 006 de D1, 007 de D2 y fundamentos internos 008–010 están integrados en Git, sin instalación ni despliegue habitual acreditados. Su ejecución exige destino y autorización explícitos.
- Desarrollo Docker/WSL, herramientas y pruebas: [development.md](docs/development.md). No instalar herramientas en host o reconstruir entorno habitual para suplir npm sin autorización. Ensayos futuros solo en PostgreSQL nuevo y aislado, destino explícito y recursos propios verificados. No inferir despliegue por tener SQL en Git.
- No atribuir DOB/identidad/verificación/episodio/autoría históricos desde edad, entrevista, contactos, vínculos o aprobación. No fusionar identidades ni habilitar altas de menores por vías alternativas.
- Conservar y revalidar ante cambios futuros [todas las mutaciones legacy](docs/stage2a-legacy-mutations.md) para cuentas nuevas y existentes. AB-23 ya bloquea las cinco entradas identificadas y adapta identidad; no resolver ni borrar pendientes antiguos. No activar permisos por episodio sin retirar coordinadamente fallback y probar aislamiento completo.
- No seleccionar/habilitar proveedores comerciales, credenciales remotas, recuperación excepcional, invitaciones/solicitudes nuevas o acceso de emergencia por aparecer en un diseño.

## Invariantes y UX

Backoffice separado de clínica: support es lector operativo; admin/superadmin gestionan funciones autorizadas, sin acceso clínico global ordinario ni break-glass implícito (RN-27). Identidad, publicación y verificaciones no conceden clínica.

Citas de 60 min por hora exacta, sin solapamientos ni múltiples activas del paciente por día; no completar futuras. Nota solo desde cita completada no futura; cita con nota no vuelve a pendiente/cancelada. Conservar historia; adendas RN-23 son objetivo pendiente, no afirmar que ya están implementadas.

Waitlist manual: sugerir prioridad 1 y conservar decisión profesional. Disponibilidad: múltiples bloques, excepciones y rangos; no dejar citas futuras sin cobertura. Menos ruido en expediente, modales cuando se sature, agenda mensual calendario, chips compactos semanales/mensuales y colores semánticos distintos.

## Continuidad y revisión

Aplicar el [flujo de desarrollo del checkpoint](docs/project-checkpoint.md#flujo-de-desarrollo-y-actualización): propietario delimita y aprueba; Codex entrega Draft; siete checks; Work audita, Codex corrige bloqueantes y Work verifica el HEAD final; propietario decide integración. Verificar main después y actualizar documentación. No iniciar automáticamente el siguiente candidato técnico.

## Archivos y verificación

Estado principal: frontend/src/App.jsx; pantallas AppointmentsScreen y NotesScreen. Servicios sensibles: auth, patients, appointments y availability en backend/src/modules. Contratos y lectores laterales en [arquitectura](docs/architecture.md).

Antes de cerrar: revisar diff/scope y permisos; si toca agenda, evaluar backend/frontend, espera y disponibilidad. Código funcional: unitarias backend, integración pertinente **aislada**, frontend lint/build y demo ficticia ADR-019 por entrega. Markdown solo: contrastar código y validar enlaces/fragmentos/IDs y diff; no ejecutar manualmente bases o demos locales. La CI autorizada ejecuta la matriz completa en runners nuevos también para PR documentales. Documentar comprobaciones no disponibles sin presentar evidencia histórica como nueva. Commitear documentación también; push a la rama y abrir solo el PR autorizado.
