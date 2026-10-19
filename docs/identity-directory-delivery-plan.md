# Identidad y directorio — plan de entregas A/B/C/D

Actualización C: B integrado en #11 (5e549f5). AB-25 resuelto expresamente y C autorizado/implementado en rama con 005 y validación aislada; revisión/integración pendientes, sin despliegue habitual. [Contrato](contact-changes.md), [evidencia](contact-change-validation.md). D y nuevas vinculaciones siguen pendientes.

Fecha: 18 de octubre de 2026. Base B: 0f2ebba, PR #10 integrado. **A/B integrados; C autorizado y en revisión de rama.** Código, 004 y demo B implementados en rama; sin despliegue habitual. C/D requieren autorización propia. [Guía B](patient-identity-verification.md) y [evidencia](patient-identity-validation.md).

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

- B deja el cambio de contacto sin habilitar hasta C. Nombre editable; DOB global capturada solo al registro adulto. Alta/corrección posterior de DOB pendiente, incluidas cuentas históricas; sin inferencias. No escribir contactos por ruta genérica.
- El cierre de las cinco entradas legacy fue **aprobado expresamente e implementado en B** para TODAS las cuentas; pendientes antiguos se conservan sin respuesta. La [matriz](stage2a-legacy-mutations.md) explica rutas, alternativas e indisponibilidad temporal, incluidos pendientes emitidos antes del cambio.
- Verificar email/teléfono no activa vínculos; un paciente ya verificado tampoco puede eludir la barrera legacy. No retirar el fallback lector ni habilitar atribución/permisos por episodio parcialmente.
- D no expone solicitudes de atención: “acepta nuevos pacientes” es configuración e información pública para un flujo posterior. Invitaciones directas futuras no dependen de ese flag.
- Solicitudes/invitaciones nuevas, confirmación bilateral/activación de episodios, derivaciones, antecedentes/consentimientos, reseñas, pagos/agenda pública, menores y recuperación excepcional siguen fuera de estas implementaciones.

## Migraciones y compatibilidad — 004 implementada; 005/006 estimadas

| Referencia orientativa | Posible contenido | PR |
| --- | --- | --- |
| 004_patient_identity_verification.sql | DOB global nullable, evidencia/desafíos, cuotas y revocación de evidencia ante cambio de contacto; probada solo aisladamente | B |
| 005_secure_contact_changes.sql | Solicitudes privadas, propósito C, autorización por sesión, eventos mínimos y avisos durables; implementada y ensayada solo aisladamente | C |
| 006 | Perfil público, versiones y revisiones profesionales | D |

La cantidad, nombres, tablas y distribución pueden cambiar tras diseño revisado. No existen nuevas migraciones por efecto de A. No modificar 001–003 ni sus checksums. El runner acepta 003/004 explícitos; valida huella previa y registra nueva huella, sin reescribir ledger/checksums históricos. Se probaron upgrade, replay, carreras, rollback, checksum/deriva y rechazo de downgrade.

Validar cada sucesora en PostgreSQL nuevo y aislado: instalación vacía; actualización con fixtures sintéticos legacy (incluidos datos ausentes); ejecución repetida; fallo transaccional; checksum alterado, versión desconocida y deriva rechazados; compatibilidad del diagnóstico/runner y regresión 001–003. Mantener vacíos los datos desconocidos; no convertir DOB de entrevista, edad, coincidencias, aprobación previa o relaciones en nueva evidencia.

No ejecutar schema/seed o migraciones sobre bases existentes ni la habitual. No modificar contenedores, imágenes o volúmenes habituales. Ensayos futuros solo en recursos nuevos propios, sin instalar herramientas en host ni iniciar/reconstruir el Compose habitual. B reutiliza el sandbox de #8 con destinos UUID nuevos y guardas de imágenes/limpieza conservadas; A fue exclusivamente documental.

## Revisión y reversión

Documentación puede revertirse independientemente. Separar B de C limita el impacto de cambios de autenticación; email y SMS permanecen juntos por compartir desafíos/cuotas/abuso. Directorio y credenciales permanecen juntos para no publicar antes de proteger la versión aprobada.

La estrategia técnica recomendada es revertir aplicación/funcionalidad conservando estructuras y evidencia, mediante corrección aditiva cuando proceda; no borrar datos ni bajar `session_version`. Revertir C no debe hacer válidos JWT revocados, y volver a una aplicación antigua no debe restablecer bypass legacy. Compatibilidad entre versiones, fallos de entrega, bloqueos DDL y recuperación se ensayan antes de cada implementación/despliegue. Ningún ensayo autoriza despliegue en la base habitual.

Cada PR se abre hacia `main` sin merge. Los asuntos abiertos se resuelven por alcance, no por integrar una propuesta documental.
