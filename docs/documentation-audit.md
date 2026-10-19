# Auditoría y reorganización documental — PR A

Fecha: 18 de octubre de 2026. Base: main/origin/main en 0077f46 (merge #9), confirmada con fetch y avance rápido sin cambios pendientes. Rama única: docs/identity-directory-decisions-and-reorganization. Alcance autorizado: Markdown, commits organizados y un PR hacia main sin merge. B/C/D no iniciados; bloqueo funcional legacy no aprobado.

## Inventario y motivos

| Documento | Acción | Motivo y fuente canónica |
| --- | --- | --- |
| [README raíz](../README.md) | Actualizado y reducido | Entrada navegable, cinco roles reales, estado implementado/futuro y límites; desarrollo/arquitectura detallados van a docs. |
| [AGENTS raíz](../AGENTS.md) | Conservado y actualizado | Instrucciones concisas, Docker/WSL, verificaciones por tipo de cambio, seguridad y autorización exclusiva de A. Sin duplicar producto. |
| [ARCHITECTURE raíz](../ARCHITECTURE.md) | Sustituido por referencia de compatibilidad | Conserva enlaces entrantes; detalle vigente en architecture.md. Corrige “faltan tests”, módulos notes/tasks inexistentes y omisiones de backoffice/001–003. |
| [Arquitectura](architecture.md) | Centralizado y actualizado desde ARCHITECTURE | Contraste con rutas, consultas y SQL actuales; implementación, fundamentos no activados y diseño futuro separados. |
| [NOTES raíz](../NOTES.md) | Sustituido por referencia de compatibilidad | Evita segunda lista de requisitos y conserva referencias anteriores. No eliminado porque aún sirve como punto de entrada histórico. |
| [Notas de abril](archive/notes-2026-04-13.md) | Archivado íntegro, con encabezado de advertencia | Preserva historia/ideas y evidencia del contenido original; no convierte pendientes sugeridos en requisitos. |
| [Desarrollo](development.md) | Centralizado desde README y actualizado | Mantiene procedimiento Docker/WSL y comandos de base nueva; elimina recomendaciones peligrosas de repetir schema/seed o detener entorno habitual para pruebas. Separa integración/demos aisladas de operaciones habituales. |
| [Índice docs](README.md) | Creado | Ubica fuentes canónicas por propósito/estado y evidencia histórica. |
| [Decisiones](product/decisions.md) | Actualizado | Preserva ADR-001–022 e IDs AB existentes; añade ADR-023–028 y AB-23–27. AB-18/21 precisan lo ya resuelto y lo pendiente. |
| [Reglas](product/business-rules.md) | Actualizado | Conserva íntegramente filas RN-01–40; agrega RN-41–58. Requisitos no se presentan como código implementado. |
| [Roadmap](product/roadmap.md) | Actualizado | Refleja #9, secuencia A/B/C/D y requisitos por alcance; sustituye agrupación anterior sin renumerar etapas. |
| [Visión](product/vision.md) | Actualizado | Incorpora adultos/verificación/contactos/perfiles/revisión/suspensión y enlaza fuentes técnicas vigentes. Mantiene visión futura como tal. |
| [Diseño 2A](stage2a-identity-directory-intake.md) | Actualizado | Resuelve producto aprobado antes abierto, conserva mecanismos propuestos; distingue 2A completa de B/C/D y delega matriz legacy al documento específico. |
| [Plan A/B/C/D](identity-directory-delivery-plan.md) | Creado | Alcance, dependencias, pruebas/demo, compatibilidad/reversión y estimaciones de migración revisables por entrega. |
| [Matriz legacy](stage2a-legacy-mutations.md) | Creado | TODAS las mutaciones HTTP relevantes, auxiliares, SQL/scripts/fixtures, lectores laterales/clientes y pérdidas temporales propuestas; cuentas nuevas y existentes. |
| [Autenticación](authentication-security.md) | Conservado con aclaración de vigencia | Preserva procedimientos/resultados; añade corrección de permisos posteriores #7 y separa decisiones no implementadas de contactos. |
| [Integridad](clinical-data-integrity.md) | Conservado con aclaración de vigencia | Preserva evidencia/procedimientos 001 y edición versionada actual; objetivo de adendas sigue pendiente. |
| [Fundamentos 003](clinical-episodes-foundation.md) | Conservado sin cambios | Contrato SQL, ejecución explícita, guardas y aislamiento siguen pertinentes; no es evidencia de despliegue. |
| [Validación #8](clinical-episodes-validation.md) | Conservado sin cambios | Evidencia histórica íntegra, no presentada como ejecución actual. |
| Este inventario | Creado | Razones de reorganización, clasificación e instrucciones sustituidas; registra validación de A. |

No se elimina ningún archivo documental: raíz conserva referencias pequeñas por compatibilidad. Fuentes históricas y evidencia de migraciones no se borran. No hay documentos de arquitectura paralelos con contenido independiente vigente.

## Clasificación de NOTES original

| Contenido original | Clasificación | Tratamiento |
| --- | --- | --- |
| Producto web y dirección móvil; “lo que ya existe” | Contexto histórico parcialmente vigente | Arquitectura contrasta capacidades reales, producto mantiene visión; no copiar la lista como prueba de implementación. |
| Agenda manual, notas desde cita, menos ruido, calendario/chips/colores | Decisiones/preferencias vigentes | Conservadas concisamente en AGENTS y reglas canónicas de producto. |
| Backoffice separado | Vigente, con formulación antigua incompleta | Se aplica RN-27 y #7, incluyendo superadmin sin clínica global ordinaria; no “acceso maestro” implícito. |
| Banner Ver cita/Abrir expediente, feedback y filtros/métricas | Ideas históricas, no backlog aprobado | Permanecen en archivo, no se agregan al roadmap como requisitos. Requieren validación si se retoman. |
| Calendar/WhatsApp/push/email/móvil/TypeScript | Dirección o ideas futuras | Visión/arquitectura distinguen futuro de alcance. No proveedor real seleccionado ni autorización de integración. |
| Cuentas y pacientes demo de abril | Datos ficticios históricos, no inventario actual de DB | Se conservan en archivo, sin validar ni tocar base; no prometer que existen en un entorno ni habilitarlos remotamente. |
| Scripts schema/seed/normalizadores; “si cambia schema correr seed” | Instrucciones obsoletas o peligrosas para bases existentes | Archivo conserva texto; desarrollo/AGENTS indican destinos nuevos y ejecución explícita autorizada, nunca reparación de históricos. |
| Pantallas grandes y acoplamiento agenda/espera | Deuda y riesgo aún pertinentes | Arquitectura/AGENTS conservan advertencia operativa; sin encargar refactor. |
| Leer README/ARCHITECTURE/AGENTS/NOTES; push frecuente a main | Navegación/procedimiento históricos | README→docs, AGENTS operativo y referencias de compatibilidad. Encargo actual exige rama/PR sin merge, no push directo. |

Ninguna “idea muy probable” de abril se convierte en requisito aprobado. Políticas realmente abiertas se centralizan con IDs AB en decisiones; no se duplica una lista paralela de pendientes.

## Instrucciones raíz sustituidas y por qué

- Checklist de ejecutar db:schema/db:seed tras cambiar esquema: sustituido por prohibición sobre bases existentes/habitual y guías de migración explícita. Contradecía restricciones del encargo, seguridad 001–003 y ADR-009/028.
- Push periódico a main y commits directos por costumbre: sustituido por autorización del encargo, rama y PR sin merge. No impide commits frecuentes/descriptivos.
- Superadmin “maestro excepcional”: precisado como gestión administrativa autorizada sin permiso clínico global, de acuerdo con RN-27 y corrección implementada #7; no se crea política break-glass.
- Checklist npm indiscriminado para todo cambio: diferenciado Markdown frente a código funcional; pruebas y demo ADR-019 siguen obligatorias cuando se implementa funcionalidad.
- Resend/R2/hosting listados como objetivo: preservados como dirección futura en arquitectura; no autorización para contratar/activar proveedores de entrega.
- Reglas clínicas/UX y contexto web→móvil: preservados con enlaces y resumen conciso. No se retiraron instrucciones de finalidad desconocida; cada sustitución anterior tiene conflicto o fuente identificable.

## Decisiones incorporadas y asuntos abiertos

ADR-023: adulto >=18/DOB global; ADR-024: email/SMS y plazos/cuotas/seguridad/simuladores; ADR-025: cambio de contactos/contraseña reciente/avisos/session_version; ADR-026: campos públicos/defaults/revisión/versiones; ADR-027: retiro y rehabilitación con reconfirmación; ADR-028: división y alcance autorizado. RN-41–58 expresan sus criterios verificables sin renumerar reglas previas.

Abiertos relevantes: AB-23 inventario/decisión legacy y operaciones sensibles; AB-24 clasificación de credenciales/nombre/foto/revisión al rehabilitar; AB-25 vigencia de reautenticación/cambios/fallos; AB-26 controles adicionales/normalización/reloj DOB; AB-27 acceso al estado propio de profesionales no aprobados. AB-18/21 mantienen mecanismos pendientes; AB-19/20 y permisos por episodio quedan para entregas posteriores. Recuperación excepcional y política de menores no se implementan.

## Validación de PR A

Validación estática con Python 3 (biblioteca estándar, sin instalar dependencias), sobre los 20 Markdown versionados o nuevos del repositorio:

- 251 enlaces locales y 1 fragmento comprobados: ningún archivo/directorio o encabezado de destino ausente. Se omiten URLs externas y bloques de código; no se afirma disponibilidad HTTP de sitios externos.
- RN-01–40 comparadas fila por fila con la base: contenido idéntico. RN-01–58 y ADR-001–028 continuos, sin IDs duplicados; AB-01–27 únicos.
- Texto original de NOTES.md comparado íntegramente con el cuerpo archivado: idéntico; solo se añade encabezado de contexto.
- 001/002/003 idénticas byte a byte a la base; SHA-256 coinciden con manifest.json: 350625b9…, 018f0c72… y 98180bd1… respectivamente. Sin cambios en SQL/manifiesto/runner, aplicación, dependencias o configuración.
- Diff revisado por alcance y git diff --check sin errores. Los 18 archivos modificados/nuevos son Markdown; fundamentos 003 y su validación permanecen intactos.
- Organización de commits: decisiones/diseño/matriz legacy y reorganización/guías/inventario. Publicación únicamente de esta rama y un PR hacia main sin merge; la entrega debe confirmar estado limpio después del push. No se ejecutaron migraciones, schema/seed, SQL, integración, demos o comandos Docker. WSL tiene docker/python3 en PATH; node/npm no disponibles. No se instaló software ni se modificaron contenedores o volúmenes existentes.

No se ejecutan lint/build de aplicación para Markdown: no hay cambio de código y hacerlo vía Docker alteraría recursos fuera del alcance de A. Las pruebas funcionales y su evidencia pertenecen a B/C/D cuando se autoricen. No se reutilizan resultados anteriores como nuevos.
