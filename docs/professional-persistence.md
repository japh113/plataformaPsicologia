# D1 — Persistencia profesional privada

Base verificada: `3148c9124fb631ff57e2aedd46649182f087bde6` (#15), después de A/B/C y CI. Implementación D1 en rama, pendiente de integración y despliegue. [Evidencia D1](professional-persistence-validation.md). El encargo autoriza únicamente 006, persistencia, integridad y ensayos en recursos nuevos aislados; PR en borrador sin merge. D2/D3 requieren autorización independiente.

## Producto aprobado y límites

AB-18 aprueba identificador público aleatorio, opaco, estable e independiente; no reutilizable. Perfil privado y admisión apagada inicialmente, preferencias independientes. Retiro por suspensión/inactividad/pérdida de aprobación/despublicación y reconfirmación independiente al rehabilitar; D3 no usará caché pública compartida. D1 solo almacena preferencias: ninguna fila ni flag constituye una autorización de exposición.

AB-24 aprueba catálogo controlado de enfoques generales; nombre profesional cambiado, formación, cédula, especialidades/certificaciones formales y enfoques acreditativos son protegidos. El cliente no decide exenciones. Las versiones aprobadas y propuestas se separan; aprobar no publica automáticamente; rechazar conserva lo aprobado. Motivo comunicable separado de observaciones internas. Vigencia no sustentada exige nueva revisión al rehabilitar. Una decisión administrativa no garantiza calidad terapéutica.

AB-27 aprueba consulta autenticada restringida de estado propio para pending_review/rejected/suspended en D2; D1 no cambia login, JWT, session_version, middleware, permisos o frontend. Cuenta globalmente inactiva sigue rechazada. Los textos históricos review_notes no se convierten en comunicaciones autorizadas ni se copian al almacenamiento nuevo.

La división D1/D2/D3 está aprobada dentro de A→B→C→D. D1 no crea endpoints, servidores de archivos, solicitudes, invitaciones o episodios. No concede clínica ni modifica AB-23, fallback legacy o ADR-029/RN-59–61.

## Estructuras incorporadas

[006](../backend/sql/migrations/006_professional_directory_foundation.sql) crea únicamente objetos nuevos. No modifica filas, funciones o triggers legacy, schema.sql, seed.sql o 001–005.

| Estructura | Contrato implementado |
| --- | --- |
| professional_public_ids | Reserva únicamente UUID, sin nombre/contacto/contenido. No admite actualización, borrado ni TRUNCATE. |
| professional_publication_profiles | Uno por propietario, FK a psychologist_profiles y FK compuesta a users con rol psychologist. UUID generado exclusivamente por trigger PostgreSQL; preferencias false; descripción/modalidad/ciudad/estado; row_version; punteros a versión aprobada, pendiente y foto lista del mismo propietario. |
| professional_general_approaches | Catálogo controlado vacío en D1. No inventa etiquetas clínicas ni acreditaciones. |
| professional_profile_approaches | Selección mediante FK al catálogo; ningún campo del cliente puede declarar exención. Cambiar la selección no equivale a verificar una credencial formal. |
| professional_credential_versions | Snapshot presentado inmutable por propietario y número positivo de versión: nombre, título, cédula y listas separadas de formación, especialidades formales, certificaciones y enfoques acreditativos. |
| professional_credential_decisions | Una decisión terminal por propietario/versión exacta; approved/rejected; revisor admin/superadmin con FK compuesta; sin autorrevisión. Razón comunicable obligatoria al rechazar; referencia de evidencia obligatoria al aprobar; fechas de vigencia opcionales y coherentes. |
| professional_review_internal_notes | Observaciones reservadas separadas del DTO de decisión, con propietario/versión/revisor. No se copian a audit_logs ni clinical_record_history. |
| professional_credential_validity | Valoración actual independiente de la decisión histórica. Default requires_review, sin vencimiento ni evidencia inferidos. supported exige referencia, revisor autorizado y fecha; row_version protege actualizaciones condicionadas. |
| professional_photographs | Solo metadatos: UUID, propietario, versión, clave UUID sin ruta, staged/ready/retired, MIME procesado permitido, bytes/dimensiones positivos. ready exige metadatos completos; contenido listo e identidad inmutables; retired terminal. |
| professional_credential_review_states | Vista invocadora de estado derivado: ausencia de decisión = pending; decisión = approved/rejected. No duplica estado editable ni concede permisos. |

Las tablas/vista y funciones nuevas revocan privilegios de PUBLIC. Eso no convierte los roles lógicos de aplicación en roles PostgreSQL ni protege frente al propietario/superusuario de DB. D2 debe implementar permisos y proyecciones del titular/revisor; support no podrá leer propuestas u observaciones. D1 no conecta ninguna consulta HTTP con estas tablas.

## Creación, identidad y retención

Perfiles bajo demanda en el futuro servicio D2. 006 no inserta perfiles, reservas, propuestas, evidencia, decisiones o fotografías, tampoco para profesionales ya aprobados. Registrar actualmente un profesional sigue creando únicamente las filas legacy existentes. No se promueven título/cédula/nombre históricos como credenciales nuevamente verificadas.

El trigger rechaza un public_id aportado por el escritor y genera gen_random_uuid(); inserta la reserva en la misma transacción. UNIQUE arbitra colisiones y el perfil no permite cambiar propietario, UUID o fecha de creación. Una reserva confirmada no puede borrarse/truncarse ni reutilizarse. Un rollback no publica un identificador y revierte también su reserva. No hay slug de nombre ni derivación de ID interno.

No se ha aprobado plazo de eliminación de propuestas, decisiones, evidencia, notas internas o metadatos/ficheros fotográficos. D1 no crea TTL, purgas, originales binarios ni almacenamiento físico. Por cautela bloquea DELETE/TRUNCATE de los agregados persistentes; no fija retención eterna de contenido como producto. Una futura política autorizada deberá evolucionar esos controles mediante sucesora revisada, preservando las reservas opacas no reutilizables. La tabla de selección de enfoques permite retirar selecciones; no es historial de credenciales.

Los **14 días** de artifacts CI son una autorización técnica diferente. No son TTL de datos de producto. No cargar datos reales ni originales en estas estructuras durante D1.

## Decisiones, punteros y concurrencia

Las credenciales se presentan como snapshots inmutables; corregir crea otra versión. Una decisión requiere la misma pareja propietario/versión y solo puede insertarse una vez. El puntero aprobado tiene FK compuesta hacia una decisión approved; no puede apuntar a un rechazo, a una propuesta sin decisión o a otro propietario. Decidir no cambia el puntero aprobado ni psychologist_profiles.approval_status.

El puntero pendiente tiene FK al snapshot propio. Triggers de restricción diferidos comprueban al commit que no siga designando una versión decidida. Ambos lados bloquean la fila de perfil para serializar la comprobación; D2 debe bloquear primero el perfil y retirar explícitamente su puntero pendiente en la transacción de decisión. Una carrera que intente conservar pendiente y decidir debe abortar una operación. Las pruebas observan el bloqueo PostgreSQL real.

Ediciones futuras usan UPDATE con row_version esperada y SET row_version=row_version+1; cero filas significa conflicto. El trigger exige el incremento exacto, pero no sustituye el WHERE con versión esperada. Asignar números de versión requiere serializar por perfil; la PK rechaza duplicados. Los locks de cuentas y la coordinación con suspensión global se diseñarán en D2, sin alterar 002 ni los escritores legacy en D1.

Las preferencias son independientes. La FK exige versión aprobada para is_public=true, pero D1 no implementa elegibilidad global, vigencia efectiva, retiro o reconfirmación: solo su persistencia. D2/D3 deben comprobar users.is_active, rol, aprobación global, validez actual/fechas y opt-in, incluso en fotografías. No montar un lector público antes de completar esos controles. No afirmar que almacenar supported valida por sí mismo una acreditación.

La foto actual solo referencia metadatos ready del propietario. Antes de retirarla debe quitarse el puntero; no hay cascadas. El retiro físico, procesamiento real, tamaños máximos y nueva política de retención corresponden a D2/D3. JPEG/PNG/WebP son tipos de metadato admitidos, no una selección definitiva del procesador ni una validación del archivo.

## Ejecución explícita y compatibilidad

El [runner](../backend/scripts/episode-migration.js) y [CLI](../backend/scripts/migrate.js) aceptan targets 003/004/005/006; el default interno sigue siendo 003. Conservan secuencia exacta del manifiesto, prefijos completos de ledger, destino explícito, prerequisitos 001/002, SHA-256, major PostgreSQL, huella anterior, lock y transacción. Añaden detección de objetos profesionales no registrados; nunca los adoptan o reparan. No hay downgrade o force.

Los inicializadores Docker/producción siguen llegando a 002. Tener 006 en Git no instala nada al arrancar. En una instalación NUEVA autorizada se prepara baseline y 001/002; después se invoca el runner con URL y nombre explícitos. Jamás repetir schema/seed en una base existente.

La huella histórica de catálogo se conserva sin cambios. Para 006, el runner valida además la vista de revisión antes de aceptar un replay y después de instalarla, dentro de la misma transacción y antes de registrar 006. Compara `pg_get_viewdef` con una vista temporal creada a partir del SELECT de 006 verificado por SHA-256, en el mismo servidor y search_path; exige únicamente `security_invoker=true` como opción y una sola regla habilitada. Así detecta cambios de expresión, joins, filtros y opciones de seguridad sin depender del formato SQL entre versiones PostgreSQL. No acepta una definición observada como referencia, no sustituye huellas y no repara la vista instalada. La referencia temporal se elimina; un rechazo revierte la transacción.

Forma del comando, solo con destino nuevo propio ya verificado y autorización vigente:

```bash
MIGRATION_DATABASE_URL=postgresql://USUARIO:SECRETO@DESTINO/BASE_NUEVA npm run db:migrate -- --target=006 --database=BASE_NUEVA
```

No pegar credenciales reales en documentación, PR o logs. El secreto de prueba de CI solo vive en recursos efímeros. Aplicar sobre destinos habituales o un rollout real exige autorización separada; D1 no la proporciona.

El ensayo automatizado incorporado al comando test:integration de [package.json](../backend/package.json) usa createSandboxDatabase: nombre UUID nuevo, rechazo de existencia previa, comprobación de base vacía antes de instalar baseline. El [sandbox CI](../scripts/ci/sandbox.py) exige proyecto nuevo, DB tmpfs, redes privadas, ningún puerto DB o volumen persistente e imágenes propias verificadas; limpia solo recursos registrados propios. Ejecutar mediante las guardas existentes, nunca Compose habitual.

## Verificación y demostración D1

La [suite D1](../backend/test/professional-persistence.integration.test.js) prueba instalación vacía/CLI, upgrades 003/004/005→006, replay y migración concurrente, conservación de filas/ledger, UUID, titularidad/FK, decisiones, pendientes concurrentes, versiones optimistas, validez, metadatos fotográficos, privilegios, downgrade/checksum/deriva y rollback DDL.

La demostración reproducible de persistencia usa exclusivamente a/b/p/q y revisor/support ficticios en un destino nuevo. Tras 006 no hay perfiles; se crean por SQL de fixture, se muestra separación de propuestas/decisiones y se comprueba que la aplicación actual sigue operando. No representa un flujo D de producto. El ensayo HTTP sobre 006 verifica acceso clínico legacy, los cinco bloqueos AB-23 sin cambios de datos, ausencia de rutas D y revocación suspendiendo/rehabilitando mediante fixture propio. Frontend y Chromium B/C continúan como regresión; no se añade Chromium D artificial. D3 exigirá B+C+D reales.

## Pendientes de D2/D3

- D2: permisos/DTO reservados, autenticación restringida y comunicaciones autorizadas; catálogo concreto, tratamiento de afirmaciones acreditativas en descripción libre y criterios operativos de evidencia/vigencia; revisión/edición condicionadas; procesamiento/almacenamiento real de fotos. La cuenta globalmente inactiva sigue rechazada.
- D2/D3: coordinar suspensión/inactividad con limpieza de preferencias y reconfirmación; ninguna rehabilitación podrá recuperar preferencias antiguas automáticamente. No hay triggers nuevos sobre users o psychologist_profiles en D1.
- D3: directorio mínimo, proyección allowlist, elegibilidad por cada lectura, foto controlada, errores indistinguibles y ausencia de caché compartida; evidencia Chromium B+C+D.
- Retención: plazos, acceso, eliminación y copias aún pendientes. Cualquier evolución del esquema integrado requiere otra migración; 006 no se reescribirá tras integración.

Riesgo P1 de integración futura: tratar flags o evidencia almacenados como autorización pública completa. Se evita en D1 porque no existe lector/API D; D2/D3 deben resolverlo antes de exponer. Riesgos P2 operativos: locks DDL y privilegios mínimos/despliegue siguen necesitando ensayo y autorización por entorno. No se certifica producción.
