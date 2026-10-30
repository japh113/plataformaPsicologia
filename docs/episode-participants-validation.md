# Fundamentos 008 — Evidencia y límites

Implementación autorizada después de #45 sobre main `8670d8857f0a748955336a8f3565b9b4afe1eeb0`. Rama `feat/2a-episode-participants-foundation`; el HEAD entregado se registra en el PR. No es el informe histórico de 003 ni un despliegue. [Contrato implementado](clinical-episodes-foundation.md#implementación-del-incremento-008--sin-activación), [especificación y procedencia](clinical-episodes-foundation.md#iniciador-ejecutor-de-creación-y-responsable-clínico).

## Cambios e invariantes comprobadas

- [008](../backend/sql/migrations/008_episode_participants_foundation.sql): reemplaza la cabecera singular vacía, materializa CEP uno/dos con colación C, composición/responsable/creador inmutables y autor creador independiente del responsable.
- prepared es el único estado almacenable: sin fechas de inicio/finalización ni default de inicio automático. No admite INSERT operativo o transición; no es una admisión o tratamiento parcialmente activo.
- FK compuestas de recursos individuales y autor PSI, CHECK de completitud y claves normalizadas de 003 preservan cita–nota–tarea/espera y rechazan cruces/NULL parcial. No se reasigna autoría ni se migra demo.
- Materializador SECURITY DEFINER bajo propietario NOLOGIN de privilegios mínimos; EXECUTE público revocado, search_path seguro, referencias cualificadas y CEP sin DML para la conexión de aplicación. Conexión LOGIN no propietaria efectivamente probada, incluidos pg_temp, SET ROLE y trigger ajeno.
- Historia de cabecera por episodio; no inventar paciente singular para pareja. Historia protegida individual de 001 intacta. Rechazo de modificación no deja historia parcial.
- [Runner](../backend/scripts/episode-migration.js) y [CLI](../backend/scripts/migrate.js) reconocen 008; [manifiesto](../backend/sql/migrations/manifest.json) agrega solo su entrada. Huellas anteriores conservadas; 008 añade propietarios/roles/membresías/colación y ACL al contexto verificable. Provisión requiere administrador explícito en destino nuevo; no adopta roles existentes.

No se han cambiado rutas, permisos HTTP, fallback legacy, identidad, entrevista, consentimiento, activación, reanudación, derivaciones, notas finales/adendas o UI. Los roles de prueba son exclusivamente SQL y no otorgan nuevas capacidades a la aplicación. Preparación estructural no demuestra aislamiento clínico operativo por episodio.

## Pruebas locales nuevas

Ubuntu WSL/Docker Desktop; arnés existente `scripts/clinical-episodes.sh`. Imágenes propias por UUID y PostgreSQL nuevo en tmpfs, red privada sin puertos DB ni volumen persistente. Sin instalar Node/npm en host, reiniciar recursos habituales o ejecutar SQL sobre bases existentes.

| Ensayo | Destino propio | Resultado |
| --- | --- | --- |
| Primer ensayo dirigido | `aef52e77-c1bb-4b28-ac26-8640124b6d75` | Una prueba nueva de inyección DDL estaba montada después de la huella 007: el runner rechazó correctamente deriva antes de llegar a 008. Se corrigió el fixture, no la protección. Cleanup propio confirmado. |
| Matriz completa final `bash scripts/clinical-episodes.sh test` | `296da4b8-b4ff-4f8d-ac61-d6c758a8767b` | Episodios 33/33, unitarias backend 105/105, integración HTTP 133/133 y frontend 64/64; cero fallidas/canceladas/omitidas. Frontend lint/build PASS. |
| Demo SQL e inspección READ ONLY | `201c148b-ad54-49f2-bb7a-0845a72e1f5e` | Tres prepared, participaciones 1/1/2 (cuatro filas CEP), fechas nulas, creador P/responsable A y creador B/responsable B; cita/nota/tarea/espera individuales atribuidas. INSERT active rechazado. Solo servicio DB iniciado. |

Los 33 resultados TAP de episodios incluyen el contenedor, 16 casos legacy y 16 casos 008. La [suite 003](../backend/test/clinical-episodes.integration.test.js) llama al [módulo de casos 008](../backend/test/episode-participants.cases.js) dentro del mismo clúster nuevo verificado; cada caso usa bases nuevas y nunca el fixture HTTP. Mantiene la guarda original que rechaza clúster reutilizado. Integración HTTP utiliza sus esquemas previos 003–007 y escenarios propios, sin conectar los nuevos datos atribuidos a sus lectores por paciente.

La suite prueba instalación directa y 007→008 vacías, conservación de ledger previo, replay después de fixtures, downgrade rechazado, checksum de archivo/ledger, deriva de OWNER/rol/membresías/search_path/ACL/colación, rechazo de destino poblado y rollback tardío de DDL/rol/ledger con reintento. El inyector tardío se instala antes de registrar 007 y se controla mediante un switch de sesión: no se falsea huella ni se desactiva detección de deriva. Prueba también exactitud, cardinalidad inválida, creador diferente, inmutabilidad, rollback del segundo participante y SQL directo indebido.

Las carreras usan conexiones PostgreSQL independientes y verifican espera real en pg_stat_activity: dos migraciones se serializan (una instala y otra verifica replay); escritura de nota versus atribución de cita en ambos órdenes nunca confirma ámbitos inconsistentes. No se simulan activaciones ni se decide AB-37.

El build conserva el aviso de tamaño de bundle mayor de 500 kB; no hay cambio frontend en esta entrega. Las pruebas HTTP verifican regresiones existentes, incluidas AB-23, backoffice, objetivos/seguimiento/proyecciones y JWT; no acreditan permisos nuevos por episodio.

## Demo estructural reproducible

Solo con autorización de ensayo aislado, desde raíz:

```bash
bash scripts/clinical-episodes.sh participants-demo
```

Genera otro proyecto UUID y base nueva; aplica baseline y migraciones antes de cargar [identidades y datos sintéticos](../backend/scripts/episode-participants-fixture.js). [Creador](../backend/scripts/create-participants-demo.js) rechaza destino existente, clúster reutilizado o entorno distinto de development. No se reutiliza seed ni datos de otra demo. Los password_hash del fixture estructural son marcadores no utilizables para login; no hay cuentas HTTP nuevas habilitadas.

El JSON emitido identifica run/base y los tres contenedores prepared con responsable/creador/participantes. Tiene un episodio individual P/A creado lógicamente por P, otro P/B por B y pareja P–Q/A por P. No hay solicitudes reales ni consentimientos/entrevistas inventados; fixture declarado no es evidencia de autenticación humana. Inspeccionar en READ ONLY muestra tres episodios con fechas nulas y cuatro pertenencias; no cambiar estado o atribuir datos existentes.

La comprobación nueva de Docker confirmó PostgreSQL 17.11, tmpfs en /var/lib/postgresql/data, cero puertos DB, ausencia de montajes de volumen, red internal y únicamente servicio db. Se verificó limpieza del UUID y conservación de etiquetas de imágenes preexistentes. Inicialmente la inspección Compose externa al wrapper exigió exportar EPISODE_TEST_RUN_ID; se corrigió el contexto, sin tocar contenedores ajenos. El propio wrapper exporta siempre esa variable.

Limpiar exclusivamente con el comando impreso:

```bash
bash scripts/clinical-episodes.sh cleanup UUID_DE_ESTA_EJECUCION
```

El arnés comprueba estado/propiedad antes de detener contenedores o retirar sus dos referencias de imagen, sin prune, fuerza por ID, borrado de volúmenes o referencias habituales. Para restablecer, generar otra ejecución nueva. **No iniciar API/frontend sobre ese fixture**: los lectores legacy por paciente no aíslan sus episodios. Las demos HTTP legacy y la CI de navegador usan destinos separados.

## Verificación documental, CI y límites

Revisión final: UTF-8, enlaces/fragmentos/IDs mediante el validador existente, diez pruebas offline de CI, diff/alcance y conservación byte a byte de 001–007 y sus entradas SHA-256. La CI mantiene siete checks/artifacts de 14 días y ejecuta su matriz completa al publicar el Draft; su resultado se consulta por el HEAD del PR, sin tomar evidencia de #45 como nueva.

Instalación habitual, configuración productiva de roles, activación y retiro coordinado del fallback requieren encargos propios. El rol de aplicación real no debe ser propietario/superusuario cuando se habilite el modelo; los tests efectivos demuestran la separación para roles mínimos, no garantizan privilegios de un despliegue que no se ha realizado. Solamente se provisiona el rol NOLOGIN dedicado en las bases nuevas autorizadas.

Pendientes siguientes: permisos/DTO y todos los lectores/escritores, prohibición coordinada de nuevas escrituras NULL, admisión/entrevista validada backend/DB, ciclo/autoría de notas y sesiones/tareas conjuntas según sus contratos. AB-37 y política de pausados permanecen abiertos; no hay índice operativo de dupla activa, pues no se puede activar ningún episodio. No se presenta la coexistencia prepared ni los fixtures SQL como aislamiento clínico ya operativo.
