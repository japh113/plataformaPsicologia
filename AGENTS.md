# AGENTS

Corte documental, 19 de octubre de 2026: A/B/C integrados en #10/#11/#12; main de referencia `543442ea634e5977bc887ace1db5457eee2ebf8c`. D no iniciado ni autorizado. [Contrato C](docs/contact-changes.md). Encargo CI actual: una rama y un PR técnico, sin merge; autorización para GitHub-hosted Ubuntu y PostgreSQL/Docker nuevos aislados, fixtures ficticios y entrega simulada, retención técnica 14 días. [Implementación/evidencia CI](docs/ci-implementation.md), [plan](docs/ci-plan.md) y [contribución](CONTRIBUTING.md). No modificar administración/protecciones ni operar recursos habituales.

## Contexto y fuentes

PsicoPanel es hoy una web-app React/Vite + Express JavaScript + PostgreSQL. La dirección futura es React Native/Expo y TypeScript, sin migración ahora. Preservar lógica reutilizable, contratos claros y estilo existente. Leer [README](README.md), [índice](docs/README.md), [arquitectura](docs/architecture.md), [decisiones](docs/product/decisions.md), [reglas](docs/product/business-rules.md) y [roadmap](docs/product/roadmap.md).

Distinguir producto aprobado, propuesta técnica e implementación. PR #7 aisló backoffice; #8 integró fundamentos 003, sin activar permisos por episodio ni acreditar despliegue; #9 documentó identidad/directorio. [Plan A/B/C/D](docs/identity-directory-delivery-plan.md): A (#10, 0f2ebba), B (#11, 5e549f5) y C (#12, 543442e) integrados. AB-23 mantiene bloqueo legacy global. ADR-029/RN-59–61 conservan entrevista y validación profesional previa a toda activación nueva, con precondición backend/DB todavía pendiente. [Guía B](docs/patient-identity-verification.md). No iniciar D ni nuevas vinculaciones.

## Límites operativos

- Revisar estado/diff antes de editar; preservar cambios ajenos. Usar rama de la tarea, commits pequeños/descriptivos y PR hacia main sin merge cuando así se encargue. No push directo a main ni merge por costumbre; respetar autorización del encargo.
- No ejecutar schema/seed, normalizadores o migraciones sobre bases existentes/habitual; no borrar datos ni alterar contenedores/volúmenes existentes. Conservar 001–005 y manifiesto en este encargo. 004 de B y 005 de C están integradas, ambas sin despliegue habitual acreditado; 006 de D sigue estimada. Su ejecución exige destino y autorización explícitos.
- Desarrollo Docker/WSL, herramientas y pruebas: [development.md](docs/development.md). No instalar herramientas en host o reconstruir entorno habitual para suplir npm sin autorización. Ensayos futuros solo en PostgreSQL nuevo y aislado, destino explícito y recursos propios verificados. No inferir despliegue por tener SQL en Git.
- No atribuir DOB/identidad/verificación/episodio/autoría históricos desde edad, entrevista, contactos, vínculos o aprobación. No fusionar identidades ni habilitar altas de menores por vías alternativas.
- Conservar y revalidar ante cambios futuros [todas las mutaciones legacy](docs/stage2a-legacy-mutations.md) para cuentas nuevas y existentes. AB-23 ya bloquea las cinco entradas identificadas y adapta identidad; no resolver ni borrar pendientes antiguos. No activar permisos por episodio sin retirar coordinadamente fallback y probar aislamiento completo.
- No seleccionar/habilitar proveedores comerciales, credenciales remotas, recuperación excepcional, invitaciones/solicitudes nuevas o acceso de emergencia por aparecer en un diseño.

## Invariantes y UX

Backoffice separado de clínica: support es lector operativo; admin/superadmin gestionan funciones autorizadas, sin acceso clínico global ordinario ni break-glass implícito (RN-27). Identidad, publicación y verificaciones no conceden clínica.

Citas de 60 min por hora exacta, sin solapamientos ni múltiples activas del paciente por día; no completar futuras. Nota solo desde cita completada no futura; cita con nota no vuelve a pendiente/cancelada. Conservar historia; adendas RN-23 son objetivo pendiente, no afirmar que ya están implementadas.

Waitlist manual: sugerir prioridad 1 y conservar decisión profesional. Disponibilidad: múltiples bloques, excepciones y rangos; no dejar citas futuras sin cobertura. Menos ruido en expediente, modales cuando se sature, agenda mensual calendario, chips compactos semanales/mensuales y colores semánticos distintos.

## Archivos y verificación

Estado principal: frontend/src/App.jsx; pantallas AppointmentsScreen y NotesScreen. Servicios sensibles: auth, patients, appointments y availability en backend/src/modules. Contratos y lectores laterales en [arquitectura](docs/architecture.md).

Antes de cerrar: revisar diff/scope y permisos; si toca agenda, evaluar backend/frontend, espera y disponibilidad. Código funcional: unitarias backend, integración pertinente **aislada**, frontend lint/build y demo ficticia ADR-019 por entrega. Markdown solo: contrastar código y validar enlaces/fragmentos/IDs y diff; no ejecutar bases o demos. Documentar comprobaciones no disponibles sin presentar evidencia histórica como nueva. Commitear documentación también; push a la rama y abrir solo el PR autorizado.
