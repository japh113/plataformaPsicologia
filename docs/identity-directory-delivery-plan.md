# Identidad y directorio — plan de entregas A/B/C/D

Estado D2: D1 integrado en main `2fe0799ee683273df2dbed872840bbfd2ef03f6d` mediante #17; D2 se implementa en rama nueva con PR Draft y ensayos nuevos aislados. [Contrato D2](private-professional-management.md), [evidencia D2](private-professional-validation.md). Sin merge, despliegue habitual, D3 ni nuevas vinculaciones.

| Entrega | Integración comprobada | Estado |
| --- | --- | --- |
| A | #10, `0f2ebba3891c29683d8e63ba86f3a2ae6619b805` | Documentación integrada |
| B | #11, `5e549f51bc7fa3e2535db023b4f9bca3d383a7c5` | Identidad/verificación y 004 integradas; [guía](patient-identity-verification.md), [evidencia histórica](patient-identity-validation.md) |
| C | #12, `543442ea634e5977bc887ace1db5457eee2ebf8c` | Contactos y 005 integrados; HEAD revisado `c7f622608af4b7bc27a7c4e9dde49be23221b0ae` |
| D | D1 #17, `2fe0799` | D1 integrado; D2 privado en rama autorizada; D3 pendiente |

La siguiente entrega documental propone [GitHub Actions/CI](ci-plan.md) con criterios de aceptación, sin implementar workflows ni cambiar protecciones. No sustituye la autorización de D, de pruebas operativas o de despliegue.

Las letras de PR no son las subetapas del producto: **PR B no equivale a etapa 2B**. B/C/D entregan partes de 2A sin completarla. Fuente de requisitos: [ADR-023–028](product/decisions.md) y [RN-41–58](product/business-rules.md); [diseño técnico](stage2a-identity-directory-intake.md) y [matriz legacy](stage2a-legacy-mutations.md) conservan propuestas pendientes.

## Entregas y criterios de revisión

| PR | Funcionalidad/documentos | Pruebas y demo | Dependencias |
| --- | --- | --- | --- |
| A | Decisiones recientes; README como entrada; AGENTS operativo; arquitectura en docs; notas históricas archivadas; auditoría legacy, inventario y plan. Solo Markdown. Commits separados de producto/diseño y limpieza documental. | Contraste con código/rutas/scripts, IDs estables, enlaces/fragmentos, diff sin código/SQL. No requiere demo nueva ni ejecutar integración. Evidencia en [auditoría documental](documentation-audit.md). | #9; sin despliegue. |
| B | Registro adulto con DOB global; básicos bajo control del paciente; email/SMS con valores aprobados; estados servidor, cuotas compartidas, adaptadores/simuladores; UI mínima. Actualizar diseño, guía de identidad/seguridad, roadmap y evidencia real. | Fechas/bordes de edad; alta sin episodio/vínculo/acceso; titularidad; desafíos válidos/caducados/reutilizados/sustituidos, intentos y ventanas; carreras PostgreSQL multiusuario/multicuenta; cada entrada legacy aprobada; regresiones JWT/backoffice/clínicas, unitarias, integración, lint/build. Demo de adulto sin responsable que verifica ambos canales sin envíos reales y sin acceso profesional. | A integrado y B autorizado. AB-23 cerrado; DOB posterior pendiente y email previo a SMS aprobados. Runner ampliado conservando #8; abuso de producción pendiente. |
| C | Reautenticación, cambio de email/teléfono, aviso anterior, verificación y confirmación consistente, revocación global de sesiones. UI propia; actualizar seguridad, contratos y evidencia. | Contraseña incorrecta/reautenticación vencida; destino ocupado; cambio reemplazado/caducado/ajeno; carreras entre inicio, reenvío y confirmación; fallos de entrega; sesiones múltiples revocadas incluida actual; regresión login/reset; ninguna alteración clínica. Unitarias/integración/lint/build. Demo con dos sesiones y cambios simulados. | B y autorización de C; AB-25. |
| D | Perfil profesional, versiones pendientes/aprobadas, revisión selectiva y razones de rechazo; directorio anónimo limitado; flags independientes; suspensión/rehabilitación sin republicación. UI perfil/directorio/backoffice; actualizar diseño, arquitectura, roadmap y evidencia. | Privado inicial y datos existentes sin opt-in; público sin admisión; pendientes invisibles a terceros/support; aprobación/rechazo; acceso ajeno/mass assignment; suspensión concurrente con lectura/publicación, rehabilitación con reconfirmación; DTO público exacto; regresión JWT/roles/clínica, unitarias/integración/lint/build. Demo con visitante, titular, revisor y perfiles público/privado/pendiente/suspendido. | Orden acordado A→B→C→D y autorización de D. D reutiliza protocolo de migración de B; no depende funcionalmente del cambio de contacto C. AB-18/24/27. |

Cada PR funcional actualiza su documentación de estado; A no obliga a mantener afirmaciones futuras como si ya se hubieran implementado. ADR-019 exige estado inicial, cuentas ficticias, pasos visuales y resultados esperados para lo realmente entregado, sin simular solicitudes o episodios todavía inexistentes.

## Límites intermedios que requieren atención

- C ya incorpora cambio seguro de contactos por flujo específico, con contraseña reciente, verificación, confirmación y revocación global de sesiones. Nombre editable; DOB global capturada solo al registro adulto. Alta/corrección posterior de DOB pendiente, incluidas cuentas históricas; sin inferencias. No escribir contactos por ruta genérica.
- El cierre de las cinco entradas legacy fue **aprobado expresamente e implementado en B** para TODAS las cuentas; pendientes antiguos se conservan sin respuesta. La [matriz](stage2a-legacy-mutations.md) explica rutas, alternativas e indisponibilidad temporal, incluidos pendientes emitidos antes del cambio.
- Verificar email/teléfono no activa vínculos; un paciente ya verificado tampoco puede eludir la barrera legacy. No retirar el fallback lector ni habilitar atribución/permisos por episodio parcialmente.
- D no expone solicitudes de atención: “acepta nuevos pacientes” es configuración e información pública para un flujo posterior. Invitaciones directas futuras no dependen de ese flag.
- Solicitudes/invitaciones nuevas, confirmación bilateral/activación de episodios, derivaciones, antecedentes/consentimientos, reseñas, pagos/agenda pública, menores y recuperación excepcional siguen fuera de estas implementaciones.

## División interna aprobada de D

| Subentrega | Alcance y aceptación | Permanece deshabilitado |
| --- | --- | --- |
| D1 | 006, persistencia privada, runner y pruebas de integridad/compatibilidad en PostgreSQL nuevo | API D, sesiones nuevas, archivos reales, publicación y clínica nueva |
| D2 | Estado restringido, gestión privada, revisión y fotos, con autorización propia | Directorio y entrega anónima |
| D3 | Directorio, preferencias optativas y retiro completo; Chromium B+C+D reales | Solicitudes/invitaciones y episodios |

D1 está integrado y D2 está autorizado en rama nueva con 007 sucesora, pruebas nuevas aisladas y un PR Draft sin merge. D3 no está autorizado. El esquema mantiene compatibilidad con la aplicación anterior; 001–006 y sus entradas históricas permanecen intactos.

## Migraciones y compatibilidad — 004/005 integradas; 006 privada D1

| Referencia orientativa | Posible contenido | PR |
| --- | --- | --- |
| 004_patient_identity_verification.sql | DOB global nullable, evidencia/desafíos, cuotas y revocación de evidencia ante cambio de contacto; probada solo aisladamente | B |
| 005_secure_contact_changes.sql | Solicitudes privadas, propósito C, autorización por sesión, eventos mínimos y avisos durables; implementada y ensayada solo aisladamente | C |
| 006 | Perfil público, versiones y revisiones profesionales | D |

004/005 integradas; D1 agrega 006 y conserva los SQL/entradas/hashes históricos. Runner con targets explícitos 003/004/005/006, huella previa/nueva, ledger y rollback. Ensayos D1 y límites en su contrato; resultados B/C anteriores son historia.

Validar cada sucesora en PostgreSQL nuevo y aislado: instalación vacía; actualización con fixtures sintéticos legacy (incluidos datos ausentes); ejecución repetida; fallo transaccional; checksum alterado, versión desconocida y deriva rechazados; compatibilidad del diagnóstico/runner y regresión 001–003. Mantener vacíos los datos desconocidos; no convertir DOB de entrevista, edad, coincidencias, aprobación previa o relaciones en nueva evidencia.

No ejecutar schema/seed o migraciones sobre bases existentes ni la habitual. No modificar contenedores, imágenes o volúmenes habituales. Ensayos futuros solo en recursos nuevos propios, sin instalar herramientas en host ni iniciar/reconstruir el Compose habitual. B reutiliza el sandbox de #8 con destinos UUID nuevos y guardas de imágenes/limpieza conservadas; A fue exclusivamente documental.

## Revisión y reversión

Documentación puede revertirse independientemente. Separar B de C limita el impacto de cambios de autenticación; email y SMS permanecen juntos por compartir desafíos/cuotas/abuso. La división D1/D2/D3 sustituye la recomendación anterior de un único PR D: D1/D2 no publican; D3 expone solo después de proteger credenciales.

La estrategia técnica recomendada es revertir aplicación/funcionalidad conservando estructuras y evidencia, mediante corrección aditiva cuando proceda; no borrar datos ni bajar `session_version`. Revertir C no debe hacer válidos JWT revocados, y volver a una aplicación antigua no debe restablecer bypass legacy. Compatibilidad entre versiones, fallos de entrega, bloqueos DDL y recuperación se ensayan antes de cada implementación/despliegue. Ningún ensayo autoriza despliegue en la base habitual.

Cada PR se abre hacia `main` sin merge. Los asuntos abiertos se resuelven por alcance, no por integrar una propuesta documental.
