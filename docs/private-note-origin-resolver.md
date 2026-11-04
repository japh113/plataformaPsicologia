# Resolver interno de procedencia privada v1 — incremento 2A/011

Base verificada en GitHub y por fetch: `main` `054abd1aebf0e200d11c2783914d1205ccd14bd9` (#53), 4 de noviembre de 2026. Rama `feat/2a-private-note-origin-resolver`: entrega Draft para auditoría independiente de Work, todavía sin integrar ni desplegar. #30/#35/#36/#39 siguen abiertos.

## Contrato y separación de capacidades

[ADR-032](product/decisions.md#adr-032--original-profesional-privado-y-procedencia-técnica-v1) y [010](private-note-origins.md) acreditan el nacimiento técnico de originales nuevos. [resolvePrivateNoteOrigin](../backend/src/modules/episodes/episode.note-origin.js) consulta esa evidencia por la tupla completa de nota, episodio, paciente singular y autor. Estos valores son selectores; la evidencia procede exclusivamente de la constancia persistida, sus claves y el mecanismo restringido de 010. No acepta constancias, versiones, tipos, audiencia ni permisos del cliente como hechos verificables.

Solo una respuesta única con booleano PostgreSQL `true` produce `origin:'professional_private'`, `contractVersion:1`, `registrationKind:'professional_original'` y `originVerified:true`. La salida congelada siempre incluye `audienceVerified:false,allowed:false`. Ausencia, legacy, valores inválidos o respuesta ambigua producen origen desconocido. Los errores SQL/ACL/conexión se propagan, sin fallback. El resultado no es un permiso ni prueba identidad humana, consentimiento o finalización.

**No se conecta a los lectores operativos en esta entrega.** `resolveEpisodeResource` sigue produciendo `audience:null,audienceVerified:false`; `evaluatePrivateNoteRead` conserva su revalidación transaccional de cuenta/perfil/JWT y diagnóstico denegador sin evidencia de procedencia. Políticas y proyecciones rechazan toda operación nueva. Sin endpoints, capacidades frontend, texto, historia, fecha clínica, publicación o activación nuevos; prepared permanece como único estado admitido por 008. No se revelan aportaciones de A a B en pareja.

La conexión se selecciona internamente; el resolver no importa el pool habitual ni acepta destinos de solicitudes. Solo se invoca en fixtures ficticios aislados. La futura composición con un lector autenticado y autorización/consulta/proyección dentro de una misma transacción, con versiones estables y todos sus revocadores, requiere otro incremento. Un resultado guardado no autoriza lecturas posteriores.

## Capacidad PostgreSQL mínima

[011](../backend/sql/migrations/011_private_note_origin_resolver.sql) añade `public.recognize_private_note_origin_v1(bigint,bigint,text,text) RETURNS boolean`: SQL fijo, STRICT, STABLE, SECURITY DEFINER, PARALLEL UNSAFE y `search_path=pg_catalog,pg_temp`. Tablas cualificadas en public, sin SQL dinámico, callbacks o GUC de confianza. Cuenta correspondencias exactas entre constancia, nota y CEP; exige versión 1, tipo professional_original y registrador igual al autor. Solo reconoce exactamente una coincidencia, sin devolver filas, IDs ni conteos.

| Identidad | Capacidad de 011 |
| --- | --- |
| Propietario nuevo `psicopanel_origin_resolver_owner_<OID base>` | NOLOGIN/NOINHERIT, sin privilegios administrativos, configuración ni membresías. SELECT de cuatro columnas estructurales de nota, tres de CEP y siete de constancia. Sin registered_at, texto, historia, DML ni secuencias. Solo posee esta función. |
| LOGIN lector existente de 009 | Añade únicamente EXECUTE de la función booleana. Conserva su matriz estructural anterior, sin SELECT de constancias ni SET ROLE al propietario. |
| Propietarios de 009/010 y LOGIN creador | Sin concesiones nuevas. |
| PUBLIC y otros roles | Sin ejecución ni acceso directo nuevo a constancias. |

La función es un oráculo interno de **tupla completa**: todas las claves son obligatorias; sin comodines, listas, paginación o identificadores devueltos. El LOGIN lector ya puede consultar esa atribución estructural por 009. Disponer de ese LOGIN técnico y conocer la tupla permite comprobar si tiene constancia: ese booleano es la nueva capacidad autorizada, confidencial y nunca expuesta por HTTP. No equivale a autenticación humana, autorización por autor o aislamiento operativo completo; no conectar el LOGIN a solicitudes genéricas.

[Contrato 011](../backend/scripts/note-origin-resolver-contract.js) inspecciona cuerpo/firma/retorno, lenguaje, modo/path, propietario exacto, ACL sin PUBLIC ni grant option, roles y membresías en ambas direcciones (incluido SET-only), columnas efectivas, propiedad/DML/secuencias/esquemas/base. Reutiliza el catálogo de rutinas de 009: permisos PUBLIC/heredados, referencias iniciales pg_init_privs, SECURITY DEFINER y código nativo/no confiable en cualquier esquema. Añade privilegios efectivos de relaciones fuera de public. La única excepción nueva del verificador 009 es esta función, comprobada íntegramente por 011. La validación sucesora de 010 admite exclusivamente siete ACL SELECT de columna al propietario dedicado; las comprobaciones históricas por defecto no cambian.

Cuerpos, ACL y catálogos forman parte de la huella 011. Deriva o privilegios inesperados se rechazan sin reparar ni actualizar el ledger. Los checks de parámetros de 010 siguen vigentes; 011 añade permisos efectivos SET/ALTER SYSTEM, ACL con grantor/grant option y defaults de session_replication_role para el propietario nuevo y el lector. El administrador de aprovisionamiento y un catálogo initdb sano permanecen como raíces confiables; no hay monitor continuo ni resistencia absoluta frente a un administrador que reescriba código, datos o catálogos.

## Migración y compatibilidad

Bytes SQL 001–010 y todas sus entradas/hashes del manifiesto intactos; solo se añade 011. Instalación nueva: `--target=011 --database=NAME --account-reader=ROLE --private-note-creator=ROLE`. Upgrade explícito 010→011 reutiliza los roles verificados. Los preflights originales siguen vigentes y no hay destino implícito. No ejecutar en bases habituales.

La huella 011 solo se añade cuando existe su función. La [copia congelada del algoritmo 003–010](../backend/test/fixtures/catalog-checksum-003-010.js) comprueba compatibilidad antes del upgrade; se conservan las pruebas históricas. No cambia filas ni inscribe notas antiguas. DDL/roles/GRANT/ledger usan la transacción y advisory lock existentes; fallo tardío revierte el incremento. Replay verifica contratos y huella; downgrade, ledger incompatible y deriva se rechazan. No hay rollback destructivo instalado; operación/restauración siguen pendientes de #36.

## Matriz de validación

[Unitarias](../backend/test/episode-note-origin.test.js), [casos PostgreSQL](../backend/test/private-note-origin-resolver.cases.js) e [inventario CI](../scripts/ci/episode-cases.json). Los casos SQL constituyen la demo ficticia ADR-019 del alcance: PostgreSQL 17 en proyecto UUID nuevo con tmpfs, red privada y cero puertos DB; sin API ni credenciales humanas.

| Familia | Comprobación |
| --- | --- |
| Evidencia interna | Creación y COMMIT por LOGIN restringido real; reconocimiento por LOGIN lector 009, tupla exacta y salida inmutable denegadora. |
| Desconocidos/integridad | Legacy y atribuidos pre-010 sin backfill; ausencia y claves ajenas. Restricciones rechazan duplicados/versión/tipo/FK. Inyección administrativa reversible de ausencia, cruces, versión/tipo/registrador inválidos y duplicado: el resolver deniega. |
| Episodios/pareja | Individuales paralelos, mismo/diferente profesional y pareja A/B: sujeto/autor/episodio exactos, sin herencia de evidencia ni audiencia. |
| Sesiones/operación | JWT válido/revocado, suspensión, paciente, otro profesional y backoffice; evaluación sin salida de origen ni proyección. Regresiones de revocación concurrente y AB-23 en el arnés completo. |
| Privilegios reales | Texto, historia, fecha clínica y constancias denegados; propietario sin contenido/registered_at; creador sin EXECUTE. PUBLIC, membresías SET-only con SET ROLE real, ACL de columna y deriva sin reparación; shadowing temporal. |
| Ciclo 011 | Instalación completa, upgrade, huella 010 congelada, ledger/filas intactos, CLI/replay/downgrade y fallo tardío con rollback/reintento. |
| Errores | SQLSTATE de ACL real; unitarias de función ausente, cancelación y conexión fallida, sin evidencia parcial/fallback. |

Resultados locales y CI del HEAD final se registran en el PR; no reutilizar resultados históricos de #52. Se conservan `ci/docs`, `ci/backend-unit`, `ci/frontend`, `ci/postgres`, `ci/browser`, `ci/evidence`, `ci/required` y artifacts de 14 días. No se omiten ni modifican workflows.

Pendientes: composición operativa del resolver; permisos completos y retirada coordinada del fallback #30/#39; finalización/adendas #35; operación persistente #36; materiales/publicación/revocaciones, entrevistas/vinculación/activación y despliegue. Cada uno requiere autorización propia. Sin merge ni siguiente incremento automático.
