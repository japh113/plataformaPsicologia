# PR B — evidencia de validación aislada

Fecha: 18 de octubre de 2026. Base 0f2ebba (#10), rama feat/stage2a-patient-identity-verification. Código B pendiente de revisión/integración; no acredita despliegue habitual. [Guía y demo](patient-identity-verification.md).

## Segunda revisión de PR #11 — selector y edad

Base revisada: c337d99. El usuario aprobó expresamente America/Mexico_City como referencia civil única para registro B y 01/03 como elegibilidad para DOB 29/02 en año no bisiesto. No se cambia zona de agenda ni se declara una política multizona/global o criterio jurídico.

Correcciones: selector autenticado legacy devuelve 403 antes de DB (401 sin sesión), mapper de directorio eliminado y llamadas/estado/cliente retirados del frontend. El DTO clínico de vínculos omite correo profesional y compone el nombre desde sus columnas vigentes, conservando ID/estado/nombre para el panel. Backoffice mantiene proyección operativa autorizada. El registro calcula hoy civil desde el instante servidor en la referencia aprobada, también para rechazar DOB futura, sin depender de la zona del host/cliente.

Comando nuevo: bash scripts/clinical-episodes.sh test. Proyecto nuevo psicopanel-episodes-aa91e86d-379d-492f-8252-18796be0c2db, PostgreSQL tmpfs/red internal sin puerto DB y Node 24 Docker:

| Comprobación | Resultado de segunda revisión |
| --- | --- |
| 003 | 17/17 |
| Unitarias | 86/86 |
| HTTP/PostgreSQL | 45/45 |
| Total reportado Node | 148, cero fallos/omisiones (incluye pruebas contenedoras de integración) |
| Guardas Python | 6/6 |
| Markdown modificado | 76 enlaces/fragmentos locales válidos; IDs ADR/AB/RN conservados |
| Frontend lint/build | PASS |
| Diff de SQL, permisos clínicos y módulos de citas/disponibilidad/recordatorios frente a c337d99 | Vacío |
| Guardas de recursos | Etiquetas preexistentes intactas; sandbox de tests limpiado exclusivamente por UUID |

HTTP demuestra que una cuenta recién registrada con ambos contactos sin verificar no obtiene correos profesionales por available, users, pending, audit, care-relationships, me, identity o patients. Se conserva lectura de relación activa y clínica legacy con proyección mínima. La denegación del selector se prueba también sin sesión, como profesional y a nivel servicio sin consulta DB.

Pruebas deterministas de edad: UTC ya en el cumpleaños mientras CDMX sigue en día anterior; un milisegundo antes/exactamente después de medianoche local; cambio de año; fecha futura según referencia civil; 29/02 esperando al 01/03; cumpleaños en año bisiesto y fechas inválidas de siglos 1900/2100. Procesos con TZ=UTC, America/Tijuana y Asia/Tokyo producen la misma elegibilidad. Se prueba además la regla histórica DST de la referencia nombrada para evitar sustituirla por un offset fijo; nada de ello modifica reglas de agenda.

Demo nueva conservada para esta revisión: bb48d443-39c6-41ec-b32c-27901648853f, UI http://127.0.0.1:58797, API http://127.0.0.1:58796/api. El smoke pasó registro/dos sesiones/verificaciones/límite/nombre y, antes de verificar, 403 del selector y protección del backoffice; la relación histórica conserva nombre/ID/estado sin correo profesional y clínica existente sigue accesible. Cuenta r@episodes.invalid y demás cuentas ficticias de la guía conservan su estado inicial; el smoke usa otra cuenta .invalid. No se tocó la demo de la primera revisión ni otros contenedores/bases existentes. Sin acreditación de inspección visual interactiva; evidencia de demo HTTP.

Los resultados siguientes son históricos de la primera revisión, no el resultado vigente de estas correcciones.

## Ejecución de la primera revisión (c337d99)

Comando: bash scripts/clinical-episodes.sh test. Proyecto nuevo psicopanel-episodes-881cf61d-8990-41f7-a76e-8f8487746e05; PostgreSQL 17 con tmpfs, sin puerto DB y red internal. Node 24/npm dentro de imágenes Docker propias; no herramientas instaladas en host ni uso/reconstrucción de servicios habituales.

| Comprobación | Resultado nuevo |
| --- | --- |
| Guardas de imágenes/limpieza Python | 6/6 tests; preflight/verify y limpieza propia correctos; etiquetas preexistentes intactas |
| test:episodes (003) | 17/17, cero fallos/omisiones |
| npm test (unitarias) | 83/83, cero fallos/omisiones |
| test:integration (auth, clínica, backoffice e identidad) | 44/44, cero fallos/omisiones |
| frontend lint | PASS |
| frontend build | PASS, Vite 8.0.16 |
| 001/002/003 | Bytes y SHA-256 idénticos a base; manifest verificado para 001–004 |
| git diff --check | PASS al registrar el informe |
| Markdown modificado | 208 enlaces/rutas/fragmentos locales válidos; IDs ADR/AB/RN sin duplicados |

Total Node: 144 pruebas reportadas; se suman los reportes de Node, que incluyen las pruebas contenedoras de integración. Python: seis adicionales. No se ejecutó npm audit ni se atribuyen conteos históricos como estado actual.

Se corrigieron durante las iteraciones una expectativa antigua que consideraba 004 no autorizada, URLs de regresión que omitían /me y el orden de denegación de roles frente a validación de body. Una sustitución de textos afectó un optional chaining de App y se corrigió antes de lint/build. Ninguno queda como fallo oculto u omitido; la tabla describe exclusivamente la corrida final.

## Cobertura comprobada

- DOB exacta de 18, día anterior/posterior, fechas inexistentes/futuras/inválidas, años bisiestos y prefijo internacional explícito.
- Registro sin vínculo/acceso/episodio/intake; no acceso profesional al nuevo paciente, no fusión ni inferencia histórica. Registro público uniforme en ambos roles; aprobación profesional/JWT conservados.
- Email y SMS correctos, caducados, ajenos, reutilizados, sustituidos, restauración de contacto e independencia de evidencia. Secretos ausentes de API normal, auditoría e historial.
- Cooldown/cuota por cuenta y destino, teléfonos compartidos y cuota multicuenta; cinco intentos SMS persistidos. Solicitar SMS requiere email vigente verificado y no suspende login.
- Reenvíos/confirmaciones concurrentes desde dos sesiones y carrera de envíos desde dos procesos backend distintos; una sola emisión/confirmación efectiva según caso.
- Nombre propio sincronizado en cuenta/paciente, mass assignment/contactos/DOB rechazados y edición profesional limitada a clínica.
- Cinco rutas legacy y dos administrativas denegadas con cuentas nuevas/históricas; snapshot de pacientes/usuarios/relaciones/accesos/episodios/auditoría sin escrituras parciales ni revocaciones.
- Regresiones clínicas, backoffice, permisos laterales, JWT, cambios de estado y aprobaciones en las suites existentes.
- 004 sobre baseline nuevo y upgrade sintético 003 con datos: sin DOB/evidencia inferidas; ledger anterior intacto, replay/carrera de migraciones, rollback tras DDL parcial, checksum alterado, versión desconocida, drift y downgrade rechazados. Regresión completa 001–003.

## Demo B ejecutada y conservada

Proyecto: psicopanel-episodes-f361b8d9-adf0-4c1b-9763-10f9a4c051ea. Creado con identity-demo, DB nueva psicopanel_episode_demo; sin episodios insertados por B. UI http://127.0.0.1:54146; API http://127.0.0.1:54145/api. Cuenta inicial r@episodes.invalid sin verificar/vincular; a/p y b/q con clínica legacy sintética. Cuentas y contraseña ficticias en la guía.

smoke-identity-demo.py pasó registro, dos sesiones, email+SMS por buzón privado cifrado, límite de reenvío, nombre, denegación legacy y clínica preexistente; no imprimió secretos. Las dos ejecuciones smoke añadieron cuentas .invalid propias, sin cambiar el estado inicial de r. El frontend volvió a pasar lint/build dentro del servicio propio después del ajuste de fragmento para StrictMode.

La herramienta de navegador no ofrece navegadores/apps disponibles; no se pudo acreditar revisión visual interactiva. La demo está activa y el recorrido visual queda reproducible para el revisor. Esto no se presenta como una captura o prueba UI automatizada ejecutada.

El wrapper limpió todos los destinos de pruebas propios y conservó únicamente la demo para revisión. La limpieza de esta demo se hace con cleanup y su UUID; nunca prune. Ningún acceso a la base habitual, backfill, migración real o envío email/SMS real.

## Limitaciones vigentes

Correcciones posteriores de DOB y contactos C pendientes; C/D, nueva vinculación y permisos por episodio no habilitados. El email previo a SMS reduce abuso, pero varias cuentas verificadas aún pueden agotar un teléfono compartido. Antiautomatización/red/costo, proveedor/operación productiva, retención/rotación y recuperación excepcional requieren definición y autorización posteriores. 004 integrada en un PR no implica despliegue.
