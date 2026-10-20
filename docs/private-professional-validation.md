# D2 — Evidencia de validación

Base verificada: main `2fe0799ee683273df2dbed872840bbfd2ef03f6d`, D1 #17 integrado. Rama nueva feat/d2-private-professional-management. [Contrato D2 y límites](private-professional-management.md). Sin merge, despliegue o recursos habituales.

## Registro durante implementación

Primer proyecto nuevo 80ad240f-7939-47e8-96b0-058dab364acc: episodios 17 aprobados; WSL perdió su directorio de trabajo (getwd) antes de iniciar integración y demás suites. No se presentan esas suites como aprobadas. Limpieza propia completada desde una sesión nueva.

Segundo proyecto nuevo 8540439d-7837-49fc-99c1-56f944f415ec, PostgreSQL 17.11: episodios 17 aprobados; integración 103 aprobados y dos fallos TAP (subcaso y contenedor); unitarias backend 97 aprobadas y una fallida; frontend tres unitarias, lint y build aprobados. Fallos de assertions/fixture: ruta privada sin sesión correctamente devuelve 401 en vez del 404 esperado; construcción de JWT de prueba con expiresIn undefined rechazada por la biblioteca antes de verificar. Se corrigieron fixtures sin relajar acceso. Recursos nuevos tmpfs/red interna, sin puertos DB ni volúmenes persistentes; cleanupConfirmed/preexistingContainersPreserved confirmados. Código todavía sin commit: esta evidencia no se atribuye al HEAD final.

Tercer proyecto 2e7ca695-5cce-44fe-bacf-f1178fd558eb: 17 episodios, 107 integración, 98 unitarias backend, tres frontend, lint y build aprobados, sin skips/cancelaciones. Chromium D2 en a24e3d13-2503-45b3-8e65-be656a1564e1 completó sus doce casos y capturas; no se atribuye al SHA main que registró el runtime, pues había código sin commit. La limpieza detectó correctamente que el otro ensayo, iniciado simultáneamente, había retirado sus propias imágenes registradas como baseline. No se debilitó la guarda: se archivó el rechazo y se retiraron solo las imágenes con etiquetas de propiedad de ese D2, comprobando que las diferencias eran exactamente las dos imágenes del ensayo terminado. Etiquetas ajenas intactas. Ensayos posteriores secuenciales.

Antes del cierre se fijó sharp 0.35.5 con loaders raster acotados, revisando su política de soporte de seguridad y lockfile. La aceptación final requiere repetición del código terminado, Chromium B+C+D2 y siete checks del HEAD final con artifacts de su ejecución/intento/merge sintético. Resultados finales se registrarán después de observarlos. No se declara aprobación anticipada.

## Repetición local con procesador actualizado

Proyecto nuevo dce51507-ecbd-4235-b810-389b3e50d414, PostgreSQL 17.11: test:episodes 17 aprobados; test:integration 107 aprobados; npm test backend 98 aprobados; npm test frontend tres aprobados; lint/build exit 0. Sin fallos, skips ni cancelaciones. Incluye upgrade/replay/concurrencia/vista de 007, rollback DDL, los tres accesos restringidos, inventario de rutas protegido, rechazo y promoción sintética atómica, fotografía, cuotas/recuperación y suspensión frente a edición con espera PostgreSQL observada. La matriz empezó en bd290bf; durante el ensayo se completaron controles frontend de cuenta en 7d0f3a9. No se presenta como aceptación remota de un SHA final. Sandbox, imágenes propias y recursos nuevos limpiados; baseline ajeno preservado.

Chromium D2 secuencial, proyecto nuevo c17f9555-c907-4c51-ba42-b971fe1598a5: doce casos D201–D212 aprobados, 14 capturas enmascaradas. Runtime registra `7d0f3a9f5c15e302de6960ab4e77200c85644cf6`; Playwright 1.64.0, Chromium 156.0.8078.4, Node v24.21.0 de la imagen browser fijada. Incluye suspensión y rehabilitación desde controles administrativos reales. Cero peticiones clínicas en las tres sesiones restringidas; recarga/logout, rechazo y conflicto, razón comunicable, foto y denegación support. Limpieza y conservación de contenedores/etiquetas ajenos confirmadas. Cambios posteriores a ese runtime hasta 293f964 fueron documentales.

Comandos reales mediante Sandbox.cmd sobre compose.episodes-test.yaml más override UUID propio: backend npm run test:episodes, npm run test:integration, npm test; frontend npm test, npm run lint y npm run build. El browser usa Sandbox.review('D2') y run-professional-ui-review.py dentro de imagen Chromium propia. Contratos Python CI: diez aprobados. Documentación en 293f964: 34 Markdown/461 enlaces, decisiones protegidas intactas; SQL 001–006 y entradas históricas preservados. No se ejecutó Compose habitual ni envíos reales.

La matriz remota B+C+D2 y sus siete checks deben corresponder al HEAD final y merge sintético del PR. Se comprueban separadamente; su identidad, artifacts y resultado se registran en el cuerpo del PR e informe final, sin atribuirles estos resultados locales.

## Corrección focalizada de portabilidad de fotografías — PR #18

Código de partida `534cd8de16bd1a63266a2c65e255e6a00cd2d962`. Antes de modificar el lanzador, la nueva prueba `backend/test/professional-photo-path.test.js` falló al procesar el primer JPEG válido: el worker existente se resolvía mediante `URL.pathname`, conservando `%20`, `%23` y `%C3%A9`. Ensayo rojo en proyecto nuevo `6ebdbc2f-16a8-42fb-9a40-6af7dd81912e`: cero aprobados, uno fallido, sin skips/cancelaciones. No fue un fallo de importación o dependencia: la prueba importó el módulo real y comprobó que el archivo del worker existía antes de llamar a `processImage`.

La corrección importa `fileURLToPath` de `node:url` y lo aplica a la URL del worker antes de `spawn`. Ningún otro parámetro, límite, permiso, estado, cuota ni contrato de fotografías cambia. La prueba copia el código backend real a un directorio temporal nuevo con espacios, `#` y `é`, enlaza las dependencias instaladas y ejecuta el proceso hijo sin simularlo. Comprueba JPEG/PNG/WebP convertidos a WebP sin metadatos, MIME falso, truncamiento, dimensiones excesivas y SVG; el error serializado por `safeHandler` conserva exclusivamente el mensaje público y estado 400, sin rutas ni diagnósticos. Retira únicamente su directorio temporal al terminar.

Repetición con la corrección en proyecto nuevo `ddd812dc-8e1e-428f-adec-11b154fcdf65`, PostgreSQL 17.11: episodios 17, integración 107, unitarias backend 99 y frontend tres aprobadas; lint/build exit 0. Sin fallos, skips ni cancelaciones. Los diez contratos Python CI aprobaron con `python -X utf8 -B -m unittest discover -s scripts/ci -p test_*.py`. En ambos sandboxes: DB tmpfs, red interna, sin puertos DB ni volúmenes persistentes; `cleanupConfirmed` y `preexistingContainersPreserved` confirmados. No se usaron recursos habituales.

Estos ensayos locales no sustituyen la aceptación del nuevo HEAD en Actions: se exige de nuevo la matriz completa, Chromium B+C+D2 y siete checks, verificando ejecución/intento/HEAD/base/merge sintético e integridad de artifacts. La ejecución `39496399248` pertenece al HEAD anterior y no acredita esta corrección. La identidad y resultados remotos observados se entregan en el informe final del encargo, manteniendo PR #18 Draft, sin merge ni auto-merge.

## Auditoría independiente D2 — P2-01 y P2-02

Punto auditado: HEAD `e28897faf269952e7e6c920bd490600ce6d79ff6`, base main `2fe0799ee683273df2dbed872840bbfd2ef03f6d`, PR #18 Draft. La ejecución histórica `39506186039` no acredita estas correcciones. Se preservan migraciones 001–007, autenticación, fotografías/fileURLToPath, reglas clínicas y decisiones de producto; no se habilitan aprobación operativa de credenciales ni D3.

| Hallazgo | Causa | Corrección y regresión real de UI |
| --- | --- | --- |
| P2-01: rehabilitación involuntaria | El modal inicializaba siempre approvalStatus=active, también al editar comunicaciones de cuentas suspendidas/rechazadas. | Inicializar desde la cuenta seleccionada, mostrar estado actual y opción de mantenerlo, rehabilitar solo mediante elección explícita, reiniciar campos por apertura y bloquear edición/cierre durante guardado. D213 conserva ambos estados al guardar solo mensaje o nota; comprueba cierre/cambio de profesional, rehabilitación de ambos, JWT restringido anterior revocado, flags false, notas reservadas y support sin gestión ni PATCH autorizado. Pendientes siguen exigiendo decisión explícita según el endpoint existente. |
| P2-02: textos cruzados entre propuestas | Campos no controlados compartían instancia; las respuestas de carga se aplicaban sin comprobar qué selección seguía vigente. | Desmontar al seleccionar/recargar, clave ownerId+credentialVersion, secuencia que ignora respuestas antiguas e invalidación al desmontar. Capturar propuesta y campos juntos al enviar; bloquear selección, recarga, campos y doble envío mientras se decide. Error/conflicto retira el formulario y exige cargar de nuevo. D214 cambia A→B sin recargar, verifica ambos campos vacíos, payload exacto de B sin textos A, motivo propio y exclusión de nota interna del DTO titular. D215 entrega A después de B, mantiene identidad/textos de B, observa controles bloqueados durante POST retenido, induce rowVersion obsoleto/409, recarga campos vacíos y decide únicamente la versión exacta vigente; reintento terminal y versión antigua siguen rechazados. |

Los tres IDs nuevos se añaden al inventario obligatorio [browser-cases.json](../scripts/ci/browser-cases.json), conservando D201–D212 y las suites B/C. Los contratos existentes rechazan omisiones, duplicados, fallos y revisión de otro SHA. Capturas siguen enmascaradas; los diagnósticos de fallo del driver quedan en el directorio de control privado, fuera del export allowlist.

### Reproducción local rojo/verde

- Proyecto nuevo `99d8e060-c17a-493e-afbb-00c410dfc178`, pantallas originales: D201–D212 aprobados; D214 falló por textos conservados de A al abrir B.
- Proyecto nuevo `fee639fc-f9fc-4d00-bfc8-e4128fd0e913`, solo P2-02 corregido: D201–D212, D214 y D215 aprobados; D213 falló porque el guardado de solo mensaje de suspended enviaba active.
- Proyecto nuevo `1e63127a-645d-4131-b738-dd92bafa8c10`, ambas correcciones: D214/D215 aprobados; D213 se detuvo con un selector de cierre ambiguo entre aviso y modal. Se acotó al botón accesible Cerrar revisión, sin retirar aserciones ni relajar guardas.
- Proyecto nuevo `4765c5fa-3f26-4f1d-8584-cecef30d1ff7`: quince casos D2 aprobados, 22 capturas enmascaradas, sin eventos inesperados. Playwright 1.64.0/Chromium 156.0.8078.4. El runtime local registró e28897f con cambios de trabajo todavía sin commit: esta prueba acredita los cambios locales, no una aceptación remota de ese HEAD.

Los cuatro ensayos usaron PostgreSQL 17.11 nuevo, tmpfs, redes internas, sin puertos DB ni volúmenes persistentes. Todos confirmaron cleanupConfirmed y preexistingContainersPreserved; fueron secuenciales. No se tocaron servicios, contenedores, volúmenes ni datos habituales.

Matriz local posterior, proyecto nuevo `aa2ae0d4-d509-418c-9717-56306b584d34`, PostgreSQL 17.11: 17 episodios, 107 integración, 99 unitarias backend y tres frontend aprobados; lint/build exit 0, sin skips/cancelaciones. Incluye la regresión existente de fotografías bajo ruta con espacios. Mismas garantías de aislamiento y limpieza confirmadas. Diez contratos Python CI aprobados con modo UTF-8; documentación/enlaces y decisiones/migraciones protegidas contrastadas. La revisión visual ajustó el contraste del nuevo rótulo de estado; el HEAD remoto final deberá acreditar también ese acabado y su aserción visible.

### Aceptación del HEAD final

La aceptación se exige de nuevo en los [siete checks del HEAD vigente de PR #18](https://github.com/japh113/plataformaPsicologia/pull/18/checks), incluyendo Chromium B+C+D2 e inventario/evidencia. La identidad exacta de ejecución/intento/HEAD/base/merge sintético y verificación de artifacts se registra después de observarla en el cuerpo del PR y el informe de entrega, enlazados desde este registro; nunca se hereda de e28897f. Se conserva la retención CI de 14 días y no se cambia la política de producto.

Límites conservados: aprobación real de credenciales bloqueada; catálogo vacío; publicación/admisión y D3 deshabilitados; esta validación no acredita despliegue ni endurecimiento productivo. No se introduce el modelo futuro de episodios paralelos, pareja o derivaciones.
