# D2 — Evidencia de validación

Base verificada: main `2fe0799ee683273df2dbed872840bbfd2ef03f6d`, D1 #17 integrado. Rama nueva feat/d2-private-professional-management. [Contrato D2 y límites](private-professional-management.md). Sin merge, despliegue o recursos habituales.

## Registro durante implementación

Primer proyecto nuevo 80ad240f-7939-47e8-96b0-058dab364acc: episodios 17 aprobados; WSL perdió su directorio de trabajo (getwd) antes de iniciar integración y demás suites. No se presentan esas suites como aprobadas. Limpieza propia completada desde una sesión nueva.

Segundo proyecto nuevo 8540439d-7837-49fc-99c1-56f944f415ec, PostgreSQL 17.11: episodios 17 aprobados; integración 103 aprobados y dos fallos TAP (subcaso y contenedor); unitarias backend 97 aprobadas y una fallida; frontend tres unitarias, lint y build aprobados. Fallos de assertions/fixture: ruta privada sin sesión correctamente devuelve 401 en vez del 404 esperado; construcción de JWT de prueba con expiresIn undefined rechazada por la biblioteca antes de verificar. Se corrigieron fixtures sin relajar acceso. Recursos nuevos tmpfs/red interna, sin puertos DB ni volúmenes persistentes; cleanupConfirmed/preexistingContainersPreserved confirmados. Código todavía sin commit: esta evidencia no se atribuye al HEAD final.

Tercer proyecto 2e7ca695-5cce-44fe-bacf-f1178fd558eb: 17 episodios, 107 integración, 98 unitarias backend, tres frontend, lint y build aprobados, sin skips/cancelaciones. Chromium D2 en a24e3d13-2503-45b3-8e65-be656a1564e1 completó sus doce casos y capturas; no se atribuye al SHA main que registró el runtime, pues había código sin commit. La limpieza detectó correctamente que el otro ensayo, iniciado simultáneamente, había retirado sus propias imágenes registradas como baseline. No se debilitó la guarda: se archivó el rechazo y se retiraron solo las imágenes con etiquetas de propiedad de ese D2, comprobando que las diferencias eran exactamente las dos imágenes del ensayo terminado. Etiquetas ajenas intactas. Ensayos posteriores secuenciales.

Antes del cierre se fijó sharp 0.35.5 con loaders raster acotados, revisando su política de soporte de seguridad y lockfile. La aceptación final requiere repetición del código terminado, Chromium B+C+D2 y siete checks del HEAD final con artifacts de su ejecución/intento/merge sintético. Resultados finales se registrarán después de observarlos. No se declara aprobación anticipada.
