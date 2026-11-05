# Primer incremento de seguridad de autenticación pública

Entrega acotada desde `main` `f1a5be6abdc8b3007f1ee93b63b14ca513ab3dc3`, mediante un único PR Draft sin merge ni despliegue. No actualiza prioridades del [checkpoint](project-checkpoint.md). Los [contratos de autenticación](authentication-security.md), [identidad B](patient-identity-verification.md), [contactos C](contact-changes.md) y [privacidad](patient-response-privacy.md) conservan sus garantías.

## Diagnóstico y corrección de correo

CodeQL sobre la base indicada mantiene abiertas [#30](https://github.com/japh113/plataformaPsicologia/security/code-scanning/30) y [#31](https://github.com/japh113/plataformaPsicologia/security/code-scanning/31), `js/polynomial-redos`, en auth.validators e identity.validation. El punto y los caracteres repetidos del dominio permiten backtracking polinomial. La comprobación posterior de longitud en registro paciente no protege la evaluación previa de la expresión.

[email.validation.js](../backend/src/modules/auth/email.validation.js) valida tipo y longitud de entrada **antes** de normalizar o recorrer el correo. Mantiene el formato simple anterior con índices y una comprobación de espacio en blanco sin repetición ambigua: un solo `@`, parte local no vacía y algún punto del dominio con caracteres a ambos lados. Conserva formatos antes admitidos como dominios con puntos consecutivos; no incorpora validación RFC ni nuevos requisitos para login. La normalización de los servicios no cambia.

El techo compartido es **254 caracteres de entrada**, incluido espacio exterior. Ya existía en registro paciente; ahora se aplica también a registro profesional, solicitud de recuperación e invitación legacy (que sigue bloqueada). Ese rechazo de entradas largas es el cambio funcional mínimo de seguridad. Cambio de contacto sustituye su copia de la regex con el helper, sobre el candidato ya normalizado y acotado como antes; no cambia cuotas, reautenticación ni confirmaciones. No quedan otras copias del patrón en backend/frontend.

## Política técnica inicial de solicitudes

[public-auth-limiter.js](../backend/src/modules/auth/public-auth-limiter.js) se instala únicamente en las cinco rutas públicas de [auth.routes.js](../backend/src/modules/auth/auth.routes.js), antes del controlador, de PostgreSQL y de bcrypt. Las peticiones que llegan al middleware consumen presupuesto aunque fallen validación o autenticación; no se pueden obtener intentos gratuitos variando el contenido o el resultado. El parser JSON y CORS conservan su orden anterior; un JSON sintácticamente inválido puede ser rechazado por el parser antes del limitador.

| Familia | Presupuesto por cliente y proceso | Motivo y consecuencia |
| --- | --- | --- |
| Login | 60 por minuto | Permite reintentos de varias personas en NAT y acota las consultas/comparaciones de contraseña. No pretende impedir ataques distribuidos ni adivinación lenta. |
| Registro paciente + profesional | 30 entre ambas rutas por 10 minutos | Las altas manuales son poco frecuentes y calculan bcrypt incluso ante un correo existente para conservar el acuse uniforme. Alternar modalidad no duplica el presupuesto. |
| Reset request + confirm | 40 entre ambas rutas por 10 minutos | Reserva margen para unos 20 recorridos de solicitud/confirmación detrás de NAT, con reintentos compartidos. No habilita entrega remota. |

Son parámetros técnicos iniciales revisables con medición de uso/coste en un encargo posterior; no son cuotas de producto ni capacidad acreditada por una prueba de carga. NAT concurrida puede recibir 429 y deberá esperar o usar otra conexión legítima. No hay contador por email, cuenta, contraseña o token: un atacante en otra red no puede agotar una cuenta específica mediante su correo. Un atacante en la misma red sí comparte presupuesto con usuarios legítimos.

Cada familia usa ventana fija compartida por sus clientes, iniciada con la primera petición, reloj monótono y contador saturado. `429` utiliza el envelope de error habitual y `Retry-After` entero positivo en segundos, redondeado hacia arriba hasta el fin de ventana. Nuevos intentos bloqueados no extienden el plazo. El cambio de ventana permite un máximo de dos presupuestos alrededor del borde; no es una ventana móvil.

La identidad procede exclusivamente de `req.socket.remoteAddress`, nunca de `req.ip` o encabezados de proxy. IPv4 y sus formas IPv4-mapped IPv6 comparten clave; IPv6 se canoniza y agrupa por `/64` para resistir rotación de direcciones de privacidad dentro del prefijo. Distintos `/64` tienen presupuestos independientes; rotar prefijos o direcciones IPv4 sigue siendo un riesgo residual. No se modifica `trust proxy`. Detrás de un proxy el peer será el proxy y sus clientes compartirán el presupuesto: identificar clientes a través de una topología de proxy verificada requiere trabajo autorizado previo a ese despliegue.

## Memoria, errores y límites operativos

Se elige memoria porque este incremento permite protección local sin nuevas dependencias, infraestructura, tablas ni migraciones. **No es protección global para producción distribuida**: cada proceso/réplica tiene sus contadores, reiniciar los borra y balancear entre procesos multiplica los presupuestos. Un almacenamiento compartido y su diseño operativo quedan pendientes antes de requerir esa garantía.

Cada familia retiene como máximo 4096 claves de tamaño acotado (12288 entre las tres), sin timers ni barridos por petición. Sustituye el Map completo al vencer la ventana; la memoria anterior queda disponible para GC. No expulsa contadores vigentes para admitir otros, lo que permitiría evadir cuotas. Al llenarse, clientes nuevos reciben `503` con `Retry-After` hasta el fin de ventana; los conocidos conservan su presupuesto restante. Un origen capaz de ocupar muchos peers puede producir indisponibilidad temporal a clientes nuevos; no se presenta este límite de memoria como defensa contra un botnet.

Dirección ausente/inválida o error interno: rechazo cerrado `503` genérico, sin consultas, criptografía ni exposición del error original. Las respuestas bloqueadas llevan `Cache-Control: no-store`. El limitador no registra bodies, claves/IP, correos, tokens ni excepciones. No captura errores de servicios posteriores. CORS sigue exponiendo `Retry-After`; preflight no consume estas cuotas POST.

Se preservan los errores 400/401/403/503 de controladores y servicios **dentro del presupuesto**; al agotarlo prevalece 429. Recuperación fuera de desarrollo local continúa devolviendo 503 bajo presupuesto, sin preview ni acceso a DB, y nunca se habilita al reiniciar la ventana. Emisión/revocación JWT, mayoría de edad, validación profesional, registro 202 antienumeración y cuotas persistentes B/C no se modifican. No se monta el limitador sobre rutas autenticadas B/C o clínicas.

## Verificación reproducible y alcance de evidencia

Nuevas unitarias, incluidas automáticamente por el runner existente:

- [Correos](../backend/test/email.validation.test.js): normales, inválidos, frontera 254/255, Unicode, repeticiones CodeQL y entradas acotadas de hasta 100000 caracteres; mensajes y login por presencia.
- [Limitador](../backend/test/public-auth-limiter.test.js): presupuesto, 429, Retry-After, reloj controlado, reinicio, clientes independientes, IPv4-mapped, IPv6 /64, proxies manipulados, saturación y fallos cerrados.
- [HTTP](../backend/test/public-auth-routes.test.js): Router público/controladores reales con límites pequeños y reloj controlado, CORS/preflight, 400/401/503, presupuesto compartido y spies de PostgreSQL/bcrypt que demuestran ausencia de ejecución al rechazar. Sin base ni carga criptográfica, sin sleeps.

Ejecución local inicial: Node **25.9.0**, copia temporal propia con dependencias por lockfile, sin SQL ejecutado ni conexiones a base. **154/155** pasan; el único fallo es la prueba preexistente `professional-photo-path.test.js`, que no resuelve `pg` desde su copia con symlink en una ruta temporal Windows. No se modifica D2 para suplir esa diferencia de plataforma. Las 16 pruebas nuevas (incluidos cuatro subtests HTTP) pasan. La CI en Ubuntu/Node **24.22.0** es la comprobación completa requerida, no esta ejecución Windows.

El primer ensayo de navegador del HEAD intermedio `5ec3a8e` detectó una carrera en D10 de [identity-ui-review.cjs](../scripts/identity-ui-review.cjs): HTTP 200 precedía al commit de React y el conteo inmediato de badges podía fallar; la captura sanitizada ya mostraba ambos contactos verificados. Se añade espera por el segundo badge visible antes de conservar la aserción exacta de dos, sin sleeps ni cambio de producto. [Ejecución y artifact del fallo](https://github.com/japh113/plataformaPsicologia/actions/runs/41932440421). La validación del HEAD final se registra separadamente en el PR.

La CI existente ejecuta los siete checks y conserva artifacts 14 días asociados al HEAD/merge probado. `ci/postgres` ejecuta regresión auth/identidad/contactos/JWT/legacy sobre clústeres nuevos; `ci/frontend` valida tests/lint/build y `ci/browser` revisa demos ficticias B/C/D2. Los resultados finales, SHAs, enlace a ejecución y artifacts se registran en el PR; no se atribuye la evidencia histórica a esta entrega. No se ejecutan bases, migraciones, contenedores o volúmenes habituales.

CodeQL debe analizar el HEAD del PR sin cambios de Default Setup. La alerta [#6](https://github.com/japh113/plataformaPsicologia/security/code-scanning/6), `js/missing-rate-limiting`, señalaba login sin protección. El middleware propio cubre las cinco rutas por ejecución HTTP; que CodeQL reconozca ese middleware es una comprobación distinta. Consultar instancias del PR para #6/#30/#31, sin inferir resolución por tests ni descartar alertas. Las demás alertas históricas de rate limiting y la Python #1 quedan fuera de alcance.

## Demo ficticia del incremento

La prueba HTTP anterior es el recorrido ejecutable y repetible sin datos persistentes: `npm test` en backend dentro del entorno de pruebas reproduce error de validación, login inexistente, 429, cambio de ventana y recuperación deshabilitada con direcciones/correos `.invalid`. No iniciar un servidor conectado a una base habitual para demostrarlo.

Para revisión visual complementaria usar exclusivamente las demos B/C/D2 de `ci/browser` y sus screenshots en artifacts de este PR. Conservan los recorridos de cuentas ficticias de la [guía B](patient-identity-verification.md#demo-reproducible-adr-019) y [contactos C](contact-changes.md#demo-ficticia-adr-019), sin habilitar clínica nueva. No se afirma haber efectuado una revisión visual manual de esos artifacts antes de consultar la ejecución concreta.

SQL 001–011, manifiesto/hashes, workflows y configuración administrativa quedan intactos. AB-23, `prepared`, `allowed:false`, `audienceVerified:false`, originales privados y ausencia de publicación/lectura clínica positiva se conservan. No hay merge, despliegue, proveedores ni siguiente incremento implícito.
