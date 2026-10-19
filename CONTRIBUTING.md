# Contribución y revisión

Corte: 19 de octubre de 2026, después de #12 (`543442ea634e5977bc887ace1db5457eee2ebf8c`). A/B/C integrados; D no iniciado ni autorizado. Leer [AGENTS](AGENTS.md), [índice](docs/README.md), [decisiones](docs/product/decisions.md), [reglas](docs/product/business-rules.md) y [plan de entregas](docs/identity-directory-delivery-plan.md).

## Rama y PR

1. Verificar estado/diff y base remota; preservar cambios ajenos. Crear una rama nueva desde `main` actualizado y registrar SHA base. No trabajar ni hacer push directo en `main`.
2. Mantener alcance explícito, commits descriptivos y documentación vigente. Separar cambios funcionales, CI y decisiones de producto cuando requieran autorizaciones distintas.
3. Abrir PR hacia `main` con problema/resultado, archivos y alcance, validación realmente realizada, resultados/límites y decisiones pendientes. Enlazar evidencia por SHA; distinguir pruebas históricas de ejecuciones del PR. No declarar checks o protección inexistentes.
4. Obtener revisión y autorización posterior de merge. No habilitar auto-merge ni cambiar protección, permisos, secrets o ajustes de Actions por el hecho de abrir un PR.

## Verificación según alcance

Solo Markdown: contrastar estado/código, enlaces/fragmentos, UTF-8, IDs y diff. Confirmar que las garantías clínicas y decisiones permanecen intactas. No ejecutar SQL, integración, Docker o demos para comprobar documentación. Esta actualización conserva literalmente ADR-029 y RN-59–61, y deja pendiente su precondición técnica de activación.

Código funcional: unitarias backend y frontend, lint/build, integración pertinente en destino nuevo verificado y demo ficticia ADR-019 conforme al alcance autorizado. [Desarrollo](docs/development.md) contiene procedimientos; leerlos no autoriza operar entornos. Registrar fallos/cancelaciones/omisiones, no solo salida cero. Si afecta agenda, revisar backend/frontend, disponibilidad y espera; identidad/contactos exige regresión JWT/backoffice/clínica y barrera legacy.

GitHub Actions/CI tiene [implementación técnica en revisión](docs/ci-implementation.md) conforme al [plan CI-01–07](docs/ci-plan.md). Exige la matriz completa incluso en PR documentales. El resumen `ci/required` solo aprueba con todos los componentes y evidencias vigentes. Consultar el informe para distinguir resultados locales y Actions. La protección administrativa/checks requeridos sigue pendiente de autorización separada; no afirmar que GitHub bloquea integración por esos checks hasta verificarla.

## Datos y decisiones

No modificar SQL histórico/checksums ni inferir DOB, verificación, autoría o episodios legacy. Conservar la clínica existente y AB-23, la separación backoffice/clínica y las garantías de ADR-029/RN-59–61. Identidad o verificación no conceden clínica; no retirar parcialmente fallback ni habilitar nuevos vínculos por este trabajo.

No operar bases/recursos habituales, normalizadores, schema/seed o migraciones sin destino y autorización explícitos. Las pruebas autorizadas usan PostgreSQL nuevo y aislado, fixtures ficticios, entrega simulada y limpieza solo de recursos propios. Nunca subir secretos, mensajes privados, dumps o datos reales. D, proveedores, despliegue y cambios administrativos requieren autorización propia.
