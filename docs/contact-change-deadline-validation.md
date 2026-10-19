# PR #12 — vencimiento de avisos tras COMMIT

19 de octubre de 2026. P2 adicional identificado localmente como P2-4 en las pruebas. HEAD revisado: `112d01bdc97173efcd7cd3065b8e73393a1625fd`. Misma rama `feat/stage2a-secure-contact-changes` y PR #12 contra main `5e549f51bc7fa3e2535db023b4f9bca3d383a7c5`. Corrección funcional y revisión Chromium: `cfb46ebdf1a48a169ed94bfddf60364ff51014e6`; documentación posterior. Sin merge; esperar revisión independiente de Work.

Los [resultados de la primera revisión P2](contact-change-review-validation.md) y la [entrega inicial](contact-change-validation.md) son históricos. Este informe registra ejecuciones nuevas y conserva las fases fallidas separadas de la ejecución final.

## Causa raíz y solución

El código calculaba retry_until menos claimedAt, una muestra de PostgreSQL anterior a actualizar el lease y hacer COMMIT. La demora del COMMIT quedaba fuera del presupuesto. Además, el worker no recibía un deadline absoluto ni consultaba autoridad tras arrancar; una solicitud agotada podía alcanzar el adaptador.

Se conserva el protocolo de transacciones breves, leases y workers terminables. La corrección agrega dos consultas de autorización sin locks de fila: después del COMMIT y cuando el worker anuncia ready. Ambas revalidan estado pending, mismo token, presencia/vigencia de lease y retry_until con clock_timestamp() fresco.

PostgreSQL calcula la diferencia hasta LEAST(lease_until,retry_until). El padre registra process.hrtime.bigint() antes de consultar, redondea el restante hacia abajo y lo limita a 10 s. Deadline = instante monótono previo a la consulta + presupuesto DB limitado. Se descuenta así toda la consulta, conservadoramente incluso su tramo anterior a la muestra del servidor. Una nueva muestra solo puede acortar el deadline original.

Descifrado, preparación, creación/carga del worker, autorización posterior al arranque y entrega comparten ese deadline. El procesador y deliverContactNotice lo revisan inmediatamente antes de comenzar; el worker espera permiso y lo comprueba otra vez justo antes del adaptador, sin await intermedio. No hay otro plazo de 10 s al arrancar. No se sustituye PostgreSQL por Date.now(). [Contrato exacto](contact-changes.md#entrega-durable-interrupciones-y-limpieza).

El timer termina efectivamente el worker y espera su salida. Respuesta, timeout, error y exit tienen un único cierre. El asentamiento exige estado pendiente y token propio bajo lock; si venció retry_until, exhausted y destino/lease NULL. Un lease sustituido no se toca; si solo venció el lease, queda disponible para recuperación. La purga independiente puede agotar un aviso con worker activo, sin que una respuesta tardía lo resucite. No se mantiene transacción ni lock durante la espera del worker/adaptador.

## Reproducción roja antes de modificar producción

Se añadieron dos regresiones controladas sobre el código de `112d01b`. Ambas fallaron: **una llamada al adaptador en vez de cero**. Se comprueban mediante contador compartido en un worker real y PostgreSQL real; no mediante un mock de deliverContactNotice.

| Restante inicial | COMMIT simulado | Resultado rojo | Resultado final |
| --- | --- | --- | --- |
| 1000 ms | 1000 ms | 1 llamada indebida | 0 llamadas, exhausted, destino/lease purgados |
| 1000 ms | 2000 ms | 1 llamada indebida | 0 llamadas, exhausted, destino/lease purgados |

Proyecto rojo nuevo: `psicopanel-episodes-1f4594b5-8573-4532-ba26-c11826f15566`. SQL 17/17 y unitarias previas 89/89 PASS; integración 68 PASS / 3 FAIL (dos regresiones y su padre), cero omitidas. Las tres correcciones P2 anteriores ya pasaban en esa ejecución. Recursos propios limpiados.

La demora se simula en el límite de retorno del COMMIT: después de completar el COMMIT real, el wrapper de la conexión sitúa retry_until en PostgreSQL en el tiempo que restaría al devolverlo. El objeto devuelto por el claim conserva la fecha anterior, como en el defecto revisado. El reloj del servidor no se altera y no se esperan 72 horas reales. El mismo mecanismo permite los casos parciales de 400/12000 ms.

## Regresiones verdes y demoras controladas

| Caso nuevo | Comprobación final |
| --- | --- |
| 1000 ms − 400 ms de COMMIT | Worker invoca una vez con presupuesto positivo de como máximo 600 ms, sin otros 10 s. |
| 15000 ms − 12000 ms de COMMIT | Como máximo 3000 ms disponibles en el worker. |
| COMMIT al vencer/después de vencer | Cero invocaciones y purga comprobada. |
| Vencimiento durante revalidación | Muestra con 150 ms restantes y respuesta retenida 200 ms mediante pg_sleep en sandbox: se cobra toda la consulta; cero llamadas y purga. |
| Vencimiento durante arranque | Worker detenido por barrera de startup; el presupuesto original se agota, cero llamadas y aviso agotado. |
| Lease sustituido tras COMMIT | Propietario anterior no invoca ni modifica estado/token/destino del sucesor. |
| Lease recuperado durante startup | Otro procesador reclama y entrega; el permiso DB posterior al arranque rechaza al worker antiguo. Sin resurrección ni segunda entrega. |
| Purga concurrente a 72 h | Mantenimiento agota/purga mientras el worker espera; al liberarlo no invoca ni revive el aviso. |
| Deadline dentro del worker | Dos unitarias con Worker real y sin timer de terminación del padre: vencimiento durante startup y permiso ya vencido impiden invocar al adaptador. |
| Respuesta contra timeout | Respuesta en el borde del deadline, una sola llamada a Worker.terminate() y contador detenido después de esperar la salida. |
| Deadline ya vencido en padre | No se crea worker ni se invoca adaptador. |
| Conversión del presupuesto | Redondeo hacia abajo, débito de consulta, máximo/ceiling sin extensión y rechazo de valores no finitos. |

Las barreras se sincronizan con SharedArrayBuffer/Atomics; las comprobaciones de startup usan centenares de milisegundos reales. Las nueve regresiones de integración y cinco unitarias nuevas no se atribuyen todas a la fase roja: antes de corregir producción solo se ejecutaron los dos casos rojos indicados.

El primer ensayo corregido detectó una validación incompleta de entradas no finitas: Infinity se limitaba a 10 s antes de rechazarlo. Unitarias 93/94; la integración no se ejecutó en esa fase. Se corrigió el rechazo antes de limitar y se repitió todo desde otro destino vacío. Proyecto intermedio `psicopanel-episodes-4b360d45-c565-4b41-96a1-8170f72618fc`. Este log se conserva como fallo intermedio, no como evidencia verde.

## Suites completas nuevas

Comando final: `bash scripts/clinical-episodes.sh test`. Proyecto nuevo `psicopanel-episodes-6b3cb7e4-501a-45c5-ab21-00f4915c3ac4`, PostgreSQL 17 tmpfs, red privada sin puerto DB, datos ficticios y limpieza de recursos propios al terminar.

| Suite final | Resultado |
| --- | --- |
| Guardas Python del entorno aislado | 6/6 PASS |
| SQL/runner de fundamentos | 17/17 PASS |
| Unitarias Node | 94/94 PASS |
| Integración PostgreSQL/HTTP/concurrencia | 78/78 PASS |
| Frontend eslint | PASS, sin errores/avisos |
| Frontend Vite build | PASS |
| Chromium/Playwright repetido | 13/13 PASS, cero eventos inesperados |
| Capturas repetidas | 16 PNG nuevos, secretos enmascarados |

189 resultados Node según contadores nativos, incluidos nodos padres; no son 189 escenarios independientes. Cero fallos, cancelados u omitidos en la ejecución final.

P2-1 vuelve a verificar reset de contraseña, cambio indirecto de session_version, solicitud invalidada/candidato y autoridad borrados, desafío inválido, JWT anterior 401 y nuevo inicio con credenciales vigentes. P2-2 vuelve a comprobar ausencia de locks durante entrega colgada, mantenimiento independiente, terminación real, recuperación del lease y purga sin resurrección. P2-3 repite fallos con dos minutos simulados y backoff de 60/120 s calculado desde el instante PostgreSQL posterior al fallo, limitado por retry_until. Estas correcciones permanecen funcionales.

Las demás regresiones repiten cuotas, idempotencia, cancelación/sustitución, propósito B/C, roles/IDOR, varias sesiones/procesos, reset/confirmación concurrentes, interrupciones, cifrado/rotación y continuidad clínica/legacy.

## Migración, alcance y producto

No se crea ni modifica ninguna migración en esta corrección. Archivos SQL 001–005 y manifest idénticos al HEAD revisado. SHA-256 de 005 verificado de nuevo: `02ccc7017f4a6ceb9af12fd42b159d37cc8e69b07c9b7480e2504bf4865ff420`.

La suite vuelve a instalar 005 en una base nueva, actualizar 004→005 concurrentemente, hacer replay y comprobar ledger/filas previas, rechazo de downgrade/deriva/checksums/versiones y rollback transaccional de DDL parcial. No se afirma rollback por downgrade ni despliegue habitual. Una 005 antigua con checksum distinto sigue requiriendo recrear el sandbox; no se repara su ledger.

Se conservan los ocho acuerdos: contraseña 10 minutos por sesión/versión; candidato separado y confirmación explícita/revocación global; avisos durables sin veto hasta 72 h; una solicitud por cuenta con idempotencia; solicitud 24 h y desafíos/verificación aprobados; históricos sin evidencia inventada y email previo para teléfono; cuotas B/C sin suspender clínica/login; cifrado/rotación/purga y auditoría mínima sin nueva retención definitiva.

No cambian endpoints, UI de producto, identidad, episodios, expedientes, clínica, permisos o reglas de negocio. ADR-029/RN-59–61 y archivos de decisiones/reglas permanecen idénticos. No se inicia D, nueva vinculación ni recuperación excepcional.

## Chromium y evidencia visual nueva

Proyecto nuevo `psicopanel-episodes-ac2f400a-0010-4256-acf4-e54e52d66245`, red app interna y navegador sin privilegios en imagen propia UUID. Playwright 1.64.0, Chromium 155.0.8059.79, Node v24.22.0. Revisión de código funcional `cfb46ebdf1a48a169ed94bfddf60364ff51014e6`.

Se repiten C01–C09, M01–M03 y R01: sesiones/pestaña, contraseña incorrecta/vencida, enlace sin sustitución, candidato verificado, cierre global, nuevo login, cancelación y sustitución móviles, SMS y continuidad legacy. 16 capturas nuevas, incluidas Cancelado antes/después de recargar y panel móvil completo. Interacción 390×844; captura con altura ampliada temporalmente y ancho 390, registrada en results.json. Sin desbordamiento horizontal en vistas comprobadas.

## Entorno habitual y paquete

Se comparan metadatos Docker antes/después: tres contenedores y un volumen preexistentes, mismos IDs/imágenes/estados/StartedAt/montajes, redes y etiquetas de imágenes. Cero recursos propios restantes tras limpieza validada por UUID/labels. No se accede a credenciales o contenidos de PostgreSQL habitual ni se afirma checksum de sus datos. Sin migrar, reiniciar, reconstruir, reparar o eliminar recursos habituales.

Paquete nuevo `tmp/contact-c-deadline/delivery/`: informe MD/HTML offline, logs rojo/intermedio/final diferenciados, resultados/runtime de Chromium, 16 PNG, verificación de alcance/entorno, commits y SHA256SUMS recalculado. ZIP y SHA-256 separado en `tmp/contact-c-deadline/`. No se reutilizan resultados/capturas anteriores como evidencia de esta versión; se excluyen .env, claves, contraseñas, OTP, enlaces secretos, JWT, Authorization, cookies, buzones y dumps.

## Límites operativos y cierre

Deadline conservador para comenzar la invocación del adaptador; no una transacción distribuida con una aceptación externa. Si el límite local conservador vence pero PostgreSQL todavía no declara retry_until vencido, se omite la entrega y se asienta con las reglas normales, sin inventar una fecha de expiración DB. El timer/terminación dependen de que Node/OS puedan ejecutarse; pausas del sistema o saltos del reloj DB posteriores al último permiso no tienen garantía de tiempo real. Recuperación de leases supone escritores que cumplen el protocolo, no modificaciones arbitrarias de tokens después del último permiso.

Solo simulador local JS, sin correo/SMS real o proveedor nuevo. La entrega permanece al menos una vez y puede duplicarse tras aceptación previa a una caída. Limpieza física requiere procesador supervisado. Proveedor/cancelación real, hardening productivo, rotación HMAC de B y retención definitiva de auditoría siguen pendientes. El PR #12 debe quedar abierto y sin merge: detener el trabajo tras publicar y esperar revisión independiente de Work.
