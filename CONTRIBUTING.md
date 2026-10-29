# Contribución y revisión

Estado al 29 de octubre de 2026, base `main` `a1720245083008399a3543ca4b794ec4d1289d5a`: A/B/C/D1/D2 y #25–#27 integrados; CI implementada y obligatoria. D3 y activación/permisos por episodio pendientes. [Resumen operativo y backlog #28–#41](docs/operational-status.md). Los encargos históricos D1/D2 no autorizan reimplementarlos ni operar entornos. Cada contribución requiere alcance y autorización propios; verificar `main`, los Issues y las instrucciones aplicables antes de comenzar. La revisión y el merge se rigen por el encargo vigente y las reglas siguientes.

## Rama y PR

1. Verificar estado/diff y base remota; preservar cambios ajenos. Crear una rama nueva desde `main` actualizado y registrar SHA base. No trabajar ni hacer push directo en `main`.
2. Mantener alcance explícito, commits descriptivos y documentación vigente. Separar cambios funcionales, CI y decisiones de producto cuando requieran autorizaciones distintas.
3. Abrir PR hacia `main` con problema/resultado, archivos y alcance, validación realmente realizada, resultados/límites y decisiones pendientes. Enlazar evidencia por SHA; distinguir pruebas históricas de ejecuciones del PR. No declarar checks o protección inexistentes.
4. Obtener revisión y autorización posterior de merge. No habilitar auto-merge ni cambiar protección, permisos, secrets o ajustes de Actions por el hecho de abrir un PR.

## Verificación según alcance

Solo Markdown: contrastar estado/código, enlaces/fragmentos, UTF-8, IDs y diff. Confirmar que las garantías clínicas y decisiones permanecen intactas. No ejecutar manualmente SQL, integración, Docker o demos locales para comprobar documentación. La CI autorizada sí ejecuta automáticamente su matriz completa en runners nuevos, incluso para PR documentales. Conservar ADR-029 y RN-59–61; un cambio documental no implementa su precondición técnica de activación.

Código funcional: unitarias backend y frontend, lint/build, integración pertinente en destino nuevo verificado y demo ficticia ADR-019 conforme al alcance autorizado. [Desarrollo](docs/development.md) contiene procedimientos; leerlos no autoriza operar entornos. Registrar fallos/cancelaciones/omisiones, no solo salida cero. Si afecta agenda, revisar backend/frontend, disponibilidad y espera; identidad/contactos exige regresión JWT/backoffice/clínica y barrera legacy.

GitHub Actions/CI tiene [implementación integrada](docs/ci-implementation.md) conforme al [plan histórico CI-01–07](docs/ci-plan.md). Exige la matriz completa incluso en PR documentales. El resumen `ci/required` solo aprueba con todos los componentes y evidencias vigentes. Consultar el informe para distinguir resultados locales y Actions. Protect main exige los siete checks, con CI-02 demostrado en #15 y CI-07 en #16 (cerrado sin merge). Modificar esta configuración requiere autorización propia.

## Datos y decisiones

No modificar SQL histórico/checksums ni inferir DOB, verificación, autoría o episodios legacy. Conservar la clínica existente y AB-23, la separación backoffice/clínica y las garantías de ADR-029/RN-59–61. Identidad o verificación no conceden clínica; no retirar parcialmente fallback ni habilitar nuevos vínculos por este trabajo.

No operar bases/recursos habituales, normalizadores, schema/seed o migraciones sin destino y autorización explícitos. Las pruebas autorizadas usan PostgreSQL nuevo y aislado, fixtures ficticios, entrega simulada y limpieza solo de recursos propios. Nunca subir secretos, mensajes privados, dumps o datos reales. D3, nuevas funciones, proveedores, despliegue y cambios administrativos requieren autorización propia; integrar D1/D2 no acredita instalación de 006/007 por entorno.
