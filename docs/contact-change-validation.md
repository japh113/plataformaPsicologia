# Validación inicial PR C — cambio seguro de contactos

Este informe conserva la evidencia histórica anterior a la revisión de `6e3a81d`. **No acredita las correcciones P2.** Las revisiones posteriores están en [primera revisión P2](contact-change-review-validation.md) y [validación del deadline](contact-change-deadline-validation.md).

Fecha: 19 de octubre de 2026. Base main/origin/main verificada en `5e549f51bc7fa3e2535db023b4f9bca3d383a7c5` (#11/B integrado). Rama `feat/stage2a-secure-contact-changes`. Código funcional y harness revisados en `f997a616e5e1a642e9954264a29170f6ccd7e659`; documentación en commit posterior. [Contrato y diseño aplicado](contact-changes.md). Sin merge ni despliegue habitual.

## Resultados de la entrega inicial

| Comprobación | Resultado |
| --- | --- |
| Fundamentos SQL/runner 003–005 y regresiones | 17/17, sin fallos ni omitidas |
| Unitarias backend | 87/87, sin fallos ni omitidas |
| Integración HTTP/PostgreSQL y concurrencia | 62/62, sin fallos ni omitidas |
| Frontend eslint | PASS, cero errores/avisos |
| Frontend Vite build | PASS |
| Chromium real escritorio/móvil | 13/13 escenarios PASS, cero eventos inesperados |
| Capturas | 15 PNG con contraseñas y OTP/tokens enmascarados |
| Layout móvil | Sin desbordamiento horizontal en vistas medidas a 390×844 |
| SQL 001–004 | Archivos byte a byte iguales al commit base; checksums conservados |

Los 166 resultados Node incluyen nodos padres de suites según su contador nativo. No representan 166 escenarios de producto independientes. No se trasladan conteos históricos de B.

Ejecución final: `bash scripts/clinical-episodes.sh test`, proyecto nuevo `psicopanel-episodes-8596c7cb-8eb3-4c4b-8237-119aed3ad5ea`. DB tmpfs PostgreSQL 17, sin puertos DB, red privada, bases ficticias nuevas verificadas por helpers. Imágenes y recursos propios eliminados por el wrapper. Salida completa saneada en `tmp/contact-c/delivery/backend-frontend-tests.txt`.

Cubre upgrade 004→005 concurrente/replay, instalación nueva, checksum/deriva y rollback DDL; contraseña errónea/vencida, IDOR/roles, nueva sesión y autorización por fingerprint/sv; propósito B/C, desafíos reutilizados/incorrectos, cinco intentos SMS y verificación conservada tras caducar código consumido; cuotas compartidas entre cuentas y procesos, límite de inicios/cancelaciones/sustituciones; solicitud vencida, email ocupado, confirmar/cancelar simultáneos, reset concurrente y lookup viejo esperando lock; JWT anteriores revocados, fallo antes/después de commit, fallo de entrega y reintento seguro, procesador en proceso nuevo, varios procesadores, agotamiento a 72 horas, cifrado/rotación y clave retirada sin impedir limpieza. Regresiones de clínica, backoffice, vínculos legacy denegados e integridad histórica preservadas.

## Chromium y demo ADR-019

Runtime real: Playwright 1.64.0, Chromium 155.0.8059.79, Node v24.22.0. Escritorio 1440×1000 y otra sesión 1280×900; móvil 390×844. Sin instalar herramientas en host. Imagen propia etiquetada por UUID, navegador sin privilegios en red interna; sin traces, HAR, video o exportación de storage/cookies.

Proyecto nuevo `psicopanel-episodes-8350b6af-6aed-4a20-9ee7-9bfc05846073`, separado de todas las bases de integración y del primer ensayo visual. Fixtures iniciales: r sin verificaciones/vínculo, a/p y b/q con clínica legacy sintética; directorio/nuevas vinculaciones/episodios funcionales deshabilitados. Dos sesiones independientes y otra pestaña de la sesión iniciadora.

| Escenario | Resultado |
| --- | --- |
| C01 Dos sesiones y pestaña compartida | PASS |
| C02 Contraseña incorrecta sin sustitución | PASS |
| C03 Candidato separado y plazo de contraseña | PASS |
| C04 Enlace retirado de URL, sin acción automática | PASS |
| C05 Verificación sin cambiar contacto vigente | PASS |
| C06 Recarga y reautenticación vencida, candidato conservado | PASS |
| C07 Reautenticación y confirmación habilitada | PASS |
| C08 Cierre actual/pestaña/otra sesión al contactar API | PASS |
| C09 Login nuevo correo, identidad/evidencia conservadas | PASS |
| M01 Cancelación móvil conserva vigente | PASS |
| M02 Sustitución explícita móvil | PASS |
| M03 SMS, confirmación y nuevo login móvil | PASS |
| R01 Clínica legacy y acceso personal | PASS |

Se revisaron visualmente capturas de confirmación de escritorio, teléfono móvil verificado y sustitución móvil. Se corrigieron texto obsoleto, codificación y bloqueo indebido de cancelar durante cooldown antes de generar las capturas finales. La revisión anterior del harness resolvió hostname privado/secure context; los resultados finales se repitieron desde una base vacía nueva. No se publican capturas de ensayos fallidos como evidencia de la versión final.

Los tiempos largos se ejercitaron con fixtures de fechas en destinos propios y reloj DB real de la lógica, no esperando 10 minutos/24/72 horas. En UI solo se envejeció la reautenticación de su solicitud ficticia por un CLI privado validado por UUID. No se alteró reloj ni datos de entornos habituales.

## Conservación del entorno habitual

Inventario Docker antes/después: **3 contenedores y 1 volumen preexistentes conservados**; mismos IDs, imágenes, estado, StartedAt y montajes; redes y etiquetas de imágenes preexistentes iguales. Cero contenedores propios restantes. Solo se eliminaron proyectos UUID e imagen Chromium propios tras validar propiedad. Sin prune, reconstrucción, reinicio o reparación de referencias de imágenes habituales.

La prueba compara metadatos Docker: no consulta contenidos ni credenciales de PostgreSQL habitual y no afirma un checksum de sus datos. No se conectó a esa base, no se ejecutaron migraciones/schema/seed/normalizadores sobre ella y no se copiaron datos reales. [Límites del entorno](development.md).

## Paquete saneado y límites

Entrega local en `tmp/contact-c/delivery/`: INFORME.html con galería offline, INFORME.md, salida completa de pruebas final, resultados JSON, runtime, inventario comparado, lista de archivos/commits y 15 PNG. ZIP y SHA-256 en `tmp/contact-c/`, indicados en el mensaje de entrega. El paquete excluye .env, claves, buzones, dumps, contraseñas, códigos, enlaces secretos, JWT, Authorization, cookies y perfiles. Se comprobaron resultados contra los secretos ficticios de la entrega privada antes de eliminar su sandbox.

Ningún email/SMS real, proveedor comercial, credencial productiva, directorio D, nueva vinculación legacy o activación de episodios. ADR-029 y RN-59–61 permanecen intactos. 005 solo se instaló en destinos nuevos de este ensayo; código Git no acredita despliegue habitual.

Pendientes existentes: retención definitiva de auditoría mínima, rotación HMAC de B y hardening/operación productiva. Limpieza física en 24 horas requiere procesador operativo supervisado; caducidad lógica no depende de él. Entrega al menos una vez puede duplicar un aviso tras caída posterior a aceptación externa. No se promete resistencia a contraseña también comprometida ni se habilita recuperación excepcional.
