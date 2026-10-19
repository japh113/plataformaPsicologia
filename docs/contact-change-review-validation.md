# PR #12 — validación de correcciones P2

19 de octubre de 2026. Misma rama `feat/stage2a-secure-contact-changes`, PR #12 contra main `5e549f51bc7fa3e2535db023b4f9bca3d383a7c5`. HEAD revisado: `6e3a81dbd1d116e95cf40c95408220f0d39fbec6`. Corrección funcional: `e3fb6d63302a3fc6454da5617088865f2cd52a0f`. Harness y revisión Chromium: `5681b4584b17c28f180f64c4c02cc24d85834289`; documentación posterior. Sin merge, despliegue ni cambio de política de producto. Se requiere segunda revisión independiente antes de integrar.

La [validación inicial](contact-change-validation.md) es histórica. Las ejecuciones siguientes son nuevas; el paquete conserva también los fallos intermedios, identificados como tales.

## Causa raíz, corrección y comparación

| Hallazgo | Fallo reproducido sobre código revisado | Corrección y resultado nuevo |
| --- | --- | --- |
| P2-1 Reset | Reset HTTP con solicitud pendiente dejaba status=pending, aunque 002 revocaba JWT al cambiar la contraseña. UPDATE OF solo examinaba columnas de SET, no el incremento indirecto de session_version. | 005 usa AFTER UPDATE + WHEN OLD/NEW sobre valores efectivos. Regresión PostgreSQL/HTTP PASS: solicitud invalidated, candidato/digests/autorización NULL, desafío invalidado, JWT anterior 401, login con contraseña nueva e inicio nuevo permitido. No se modifica 002. |
| P2-2 Entrega suspendida | El adaptador que nunca resolvía retenía el lock dentro de BEGIN; FOR UPDATE NOWAIT fallaba con 55P03. | Claim breve con lease de hasta 30 s, COMMIT, entrega en worker con máximo de 10 s y terminación esperada, y settlement separado condicionado al token. PASS: fila bloqueable durante entrega, limpieza de otra cuenta continúa, contador del worker se detiene, destino de 72 h se purga incluso con entrega activa. |
| P2-3 Reloj anterior al fallo | La regresión con snapshot previo envejecido dos minutos programaba el reintento sin la espera exigida. | clock_timestamp() nuevo tras fallo y lock; esperas exponenciales desde ese instante. PASS: primer intento +60 s, segundo +120 s y LEAST con retry_until cuando solo restan 30 s. |

La fase roja agregó tres regresiones antes de cambiar producción: las tres fallaron. Integración: 62 PASS / 4 FAIL (incluido su nodo padre), no cuatro defectos distintos. Proyecto nuevo `psicopanel-episodes-5e8404a9-b2ef-4957-b9c1-907a5966109d`.

El primer ensayo corregido tuvo los tres P2 en PASS, pero falló la prueba existente de procesador reiniciado: el worker heredaba `--input-type=module` del CLI, incompatible con un worker de archivo. Se aisló execArgv del worker; el ensayo final repite y aprueba ese reinicio. Resultado intermedio de integración: 66 PASS / 2 FAIL, incluido padre; proyecto `psicopanel-episodes-d5e0066f-cb16-4266-ab19-4175e67c5b00`. No se presenta esa ejecución como verde.

Las pruebas adicionales de lease vencido/propietario obsoleto, purga durante entrega y dos unitarias del worker se añadieron con la corrección; no se les atribuye una ejecución roja previa.

## Límite de entrega y recuperación

El [contrato técnico](contact-changes.md#entrega-durable-interrupciones-y-limpieza) detalla el protocolo. La operación que no responde vive en un worker_threads dedicado; el timer llama Worker.terminate() y espera el evento de salida mediante su promesa antes de informar fallo. No hay Promise.race de producción que abandone la operación subyacente. La prueba usa SharedArrayBuffer con un contador periódico: empieza durante la entrega y permanece inmóvil después del timeout. Los límites inválidos o infinitos son rechazados.

La limpieza tiene su propio turno periódico y exclusión local; no espera la tanda de entregas. La purga ignora leases de avisos agotados. Un lease abandonado puede reclamarse; settlement exige el token vigente. Las regresiones verifican que un propietario obsoleto no cambia un delivered del sucesor ni revive un exhausted. Se conserva intención durable, ID estable/idempotencia y entrega al menos una vez: una caída tras aceptación puede causar duplicado.

El límite depende de que Node/OS puedan ejecutar el timer y terminar el worker; no es una garantía de tiempo real frente a bloqueo de todo el proceso o fallo del sistema. El único adaptador es el simulador local JS; no se incorporan proveedores ni extensiones nativas. Terminar JS no retracta un aviso ya aceptado. Un proveedor futuro deberá demostrar cancelación/aislamiento antes de habilitarse. No se envió correo/SMS real.

## Suites completas ejecutadas de nuevo

Comando: `bash scripts/clinical-episodes.sh test`. Ejecución final: proyecto nuevo `psicopanel-episodes-c6dd0b7b-d41c-47e3-8fe6-8985a3474114`, PostgreSQL 17 tmpfs, sin puerto DB público, bases nuevas ficticias y recursos propios retirados por el wrapper.

| Suite | Resultado final |
| --- | --- |
| Guardas Python del sandbox | 6/6 PASS |
| SQL/runner de fundamentos | 17/17 PASS |
| Unitarias backend Node | 89/89 PASS |
| Integración HTTP/PostgreSQL y concurrencia | 68/68 PASS |
| Frontend eslint | PASS, sin errores/avisos |
| Frontend Vite build | PASS |
| Chromium/Playwright | 13/13 PASS, cero eventos inesperados |
| Capturas nuevas | 16 PNG enmascarados |

174 resultados Node según sus contadores nativos, incluidos padres: no son 174 escenarios de producto independientes. Ninguna prueba Node omitida o cancelada. Además de los P2, se repiten identidad, cuotas B/C, IDOR/roles, cancelación/sustitución, colisiones de email, reset/confirmación simultáneos, varios procesadores, fallos antes/después de commit, rotación, vínculos legacy bloqueados, permisos y conservación clínica.

El tiempo de dos minutos de P2-3 se simula envejeciendo solo el snapshot previo a entregar dentro del wrapper de conexión de la prueba; la lectura posterior proviene de PostgreSQL real sin alterar su reloj. Las esperas de 24/72 h se ensayan mediante fechas ficticias en filas del sandbox, no con horas reales transcurridas.

## Migración y compatibilidad

La corrección pertenece a la propia 005 porque aún no está integrada ni aplicada en la base habitual. Añade leases a avisos y corrige el trigger; checksum SHA-256 nuevo: `02ccc7017f4a6ceb9af12fd42b159d37cc8e69b07c9b7480e2504bf4865ff420`.

Se repiten instalación baseline→005, upgrade 004→005 concurrente y replay, conservación de ledger/filas previas, rechazo de downgrade y deriva, checksums/versiones y rollback de DDL parcial. El rollback probado es transaccional ante error de instalación, no un downgrade de producción. Archivos y entradas de manifest 001–004 idénticos a main. ADR-029 y RN-59–61 idénticos al HEAD revisado.

Un sandbox con la 005 anterior no es un upgrade admitido: el runner rechaza checksum diferente y debe recrearse para ensayo. No se edita su ledger como reparación ni se ejecuta SQL sobre bases habituales. La aplicación C requiere la nueva 005 y coordinación de escritores; una versión B antigua no es rollback seguro.

## Ocho decisiones aprobadas, conservadas

| Decisión | Comprobación repetida |
| --- | --- |
| Reautenticación | Contraseña al iniciar; 10 minutos por cuenta/JWT/versión; vence sin perder candidato verificado, nueva sesión exige validación. |
| Candidato separado | Propósitos B/C aislados, enlace sin acción automática, verificación y confirmación explícitas, cambio atómico y todas las sesiones revocadas. |
| Avisos | Inicio/final durables al anterior, sin veto ni rollback externo, hasta 72 h; reenvío no duplica inicio. Deadline/lease son mecanismos técnicos dentro de esa política. |
| Pendientes | Una por cuenta entre canales, continuar/cancelar/sustituir explícitos e idempotentes, cuotas conservadas. Reset libera el cupo mediante invalidación. |
| Caducidad | Solicitud 24 h, email hasta su límite, SMS 10 minutos; reenvío no extiende y verificación completada dura mientras viva la solicitud. |
| Históricas | No exigir contacto anterior verificado/accesible; teléfono exige email vigente verificado; sin evidencia inventada ni recuperación excepcional. |
| Abuso | Cinco contraseñas incorrectas/15 min, cinco inicios/24 h, diez cancelaciones/sustituciones/24 h, cuotas B compartidas; sin suspender clínica/login. |
| Información temporal | Cifrado autenticado/rotación, claves externas, purga al resolver/entregar/agotar y mantenimiento independiente; auditoría mínima sin fijar nueva retención definitiva. |

No cambian identidad estable, expedientes, episodios ni permisos clínicos. No se inicia D, no se habilitan nuevas relaciones legacy ni la activación de episodios.

## Chromium y capturas corregidas

Proyecto nuevo `psicopanel-episodes-8a3a97a5-66f9-429c-b3a1-7d9bed10707d`, datos sintéticos, red app interna, navegador sin privilegios e imagen propia UUID. Playwright 1.64.0, Chromium 155.0.8059.79, Node v24.22.0. C01–C09, M01–M03 y R01 vuelven a pasar: dos sesiones/pestaña, contraseña incorrecta/vencida, enlace, candidato, revocación, nuevo login, cancelación, sustitución, teléfono y continuidad legacy.

Interacción móvil a 390×844; medidas documentWidth=390 en vistas comprobadas. Para la evidencia se amplía temporalmente solo la altura del viewport y se captura la sección completa de identidad manteniendo ancho móvil; se restaura 390×844 para continuar. results.json registra ambos tamaños y región. No se cambia CSS/producto para la captura.

11-mobile-cancelled y 11b-mobile-cancelled-after-reload comprueban explícitamente Estado: Cancelado; ambas son nuevas. Se inspeccionaron visualmente cancelación móvil, teléfono móvil verificado y confirmación de escritorio. Inputs de contraseña/OTP y secretos importados están enmascarados; no se exportan traces/HAR/video/cookies/storage ni buzón.

## Entorno, paquete y límites

Inventario antes/después: los tres contenedores y un volumen preexistentes se conservan; mismos IDs/imágenes/estados/StartedAt/montajes, redes y etiquetas de imágenes. Cero recursos propios restantes. Comparación de metadatos Docker, sin conexión a PostgreSQL habitual ni afirmación de checksum de sus datos. No se operaron, reiniciaron, reconstruyeron o repararon recursos habituales.

Paquete nuevo en `tmp/contact-c-review/delivery/`: informe MD/HTML con galería offline, logs rojo/intermedio/final identificados, resultados/runtime de Chromium, comparación del entorno, alcance/commits y 16 PNG. SHA256SUMS se recalcula sobre cada archivo y el ZIP tiene checksum separado. Se excluyen .env, claves, contraseñas, OTP, enlaces secretos, JWT, Authorization, cookies, dumps y buzones. No se reutilizan capturas ni resultados de la entrega inicial como evidencia nueva.

Limitaciones existentes: limpieza física requiere procesador activo y supervisado; entrega al menos una vez admite duplicados tras aceptación; retención definitiva de auditoría, rotación HMAC de B, proveedor y hardening productivo siguen pendientes. No se ha validado ni autorizado un despliegue habitual. PR #12 debe permanecer abierto sin merge para una segunda revisión independiente.
