# PR B — evidencia de validación aislada

Fecha: 18 de octubre de 2026. Base 0f2ebba (#10), rama feat/stage2a-patient-identity-verification. Código B pendiente de revisión/integración; no acredita despliegue habitual. [Guía y demo](patient-identity-verification.md).

## Ejecución final

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
