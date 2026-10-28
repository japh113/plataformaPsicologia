# Privacidad de respuestas clínicas del paciente — Issue #23

## Alcance y causa

Implementación acotada de [Issue #23](https://github.com/japh113/plataformaPsicologia/issues/23), autorizada expresamente por el propietario. Base remota verificada: `main` `edc1bb00db97fd500b5ddc1ae479bce2e5c3fcf4`, merge de [#24](https://github.com/japh113/plataformaPsicologia/pull/24). Código funcional y fixtures: `eb0c2e7e47e275848c7d19ff0dc566c1bc4b2ac0`. Rama `fix/patient-api-clinical-projection`, entrega mediante Draft PR sin merge ni auto-merge.

Los lectores compartían un mapeo que incluía `patients.notes` y `patients.risk_level` para paciente y psicólogo. El mapeo de tareas añadía el objetivo interno de la nota asociada, incluso después de actualizar `completed`. Ocultar estos datos en React no protegía el JSON. La reproducción de abajo utilizó exclusivamente fixtures ficticios; no acredita un incidente con datos reales.

La corrección aplica proyecciones explícitas en el servidor: solo el psicólogo recibe `notes`, `riskLevel` y `clinicalNoteObjective`. Se omiten también cuando falta el actor. Las propiedades se seleccionan explícitamente, sin copiar filas completas. `clinicalNotes` permanece vacío para el paciente aunque una consulta suministrase notas por error. La autorización previa y el aislamiento siguen en servicios/middleware; una proyección limitada no concede acceso administrativo.

Reglas aplicables: [RN-13, RN-24, RN-25, RN-27 y RN-67](product/business-rules.md). Acceso legal/ARCO y clasificación más amplia de entrevistas, citas y texto libre permanecen separados de esta corrección.

## Contrato revisado

| Respuesta | Paciente | Psicólogo autorizado |
| --- | --- | --- |
| `GET /api/patients` y `GET /api/patients/:id` | Sin `notes`, `riskLevel` ni objetivo profesional en objetos anidados | Conserva contexto, riesgo, notas clínicas y contexto de tareas |
| `PATCH /api/patients/:id/tasks/:taskId` | Puede actualizar únicamente `completed`; respuesta sin objetivo profesional | Conserva edición de texto/estado y objetivo profesional |
| `PUT /api/patients/:id/interview` | Primera entrevista permitida; devuelve expediente proyectado y respuestas propias | Conserva edición autorizada y respuesta profesional |
| Otras escrituras de expediente/notas/tareas | Conservan denegaciones existentes | Conservan operaciones autorizadas; expedientes devueltos usan el mismo lector por actor |
| `/objectives` | Permisos actuales sin cambios; desaparece el campo profesional vacío del mapeo compartido | Operaciones actuales sin cambios |

`clinicalNoteId` y `clinicalNoteDate` se conservan en las tareas propias para identificar y ordenar su asociación actual con un seguimiento. No incluyen texto profesional ni habilitan lectura de notas; tampoco constituyen publicación o consentimiento. Las pruebas verifican que cambiar IDs no permite leer o modificar el expediente/tarea ajeno y que el paciente sigue sin acceso directo a notas. No se amplían metadatos ni se implementa la UX de [#21](https://github.com/japh113/plataformaPsicologia/issues/21).

Se conservan los datos ordinarios existentes (identidad/contactos, estado, motivo, fechas y entrevista propia), las tareas y los objetivos compartidos. No se reclasifica la entrevista ni se retiran indiscriminadamente respuestas aportadas por el paciente. La política de cumplimiento de objetivos corresponde a [#22](https://github.com/japh113/plataformaPsicologia/issues/22), fuera de este PR.

Ejemplo ficticio, fragmento del expediente anterior:

```json
{
  "id": "a",
  "notes": "FICTIONAL_PRIVATE_CONTEXT_a",
  "riskLevel": "high",
  "tasks": [{
    "id": "7", "text": "FICTIONAL_PATIENT_TASK_a", "completed": false,
    "clinicalNoteId": "10", "clinicalNoteDate": "2026-10-23",
    "clinicalNoteObjective": "FICTIONAL_NOTE_OBJECTIVE_a"
  }]
}
```

Mismo fragmento destinado al paciente después:

```json
{
  "id": "a",
  "tasks": [{
    "id": "7", "text": "FICTIONAL_PATIENT_TASK_a", "completed": false,
    "clinicalNoteId": "10", "clinicalNoteDate": "2026-10-23"
  }]
}
```

El PATCH devuelve `data` con esa misma forma de tarea y el nuevo `completed`. Los campos restringidos están ausentes, no vacíos. El psicólogo conserva la primera forma. La insignia de riesgo de la lista frontend se limita al psicólogo para que el valor ausente no se presente al paciente como «sin riesgo».

## Evidencia local del 28 de octubre de 2026

Ubuntu WSL/Docker Desktop, Node `v24.22.1`, PostgreSQL `17.11`. Sin instalar npm en host ni operar el Compose habitual. El wrapper verifica UUID nuevo, PostgreSQL tmpfs, red de DB interna, cero puertos de DB y propiedad de imágenes. Logs/capturas temporales quedan ignorados en `tmp/issue23/`; no se incorporan JWT, datos reales, dumps o secretos a Git.

| Ejecución | Destino UUID | Resultado |
| --- | --- | --- |
| Reproducción nueva, antes del arreglo, misma suite HTTP | `db90d4a8-de98-4dac-ac05-55db2d20b0c6` | 17 pruebas de episodios y 99 unitarias aprobadas. Integración: 112 aprobadas, 7 fallidas de 119, sin omitidas: seis casos negativos de privacidad y su padre fallaron como se esperaba |
| `bash scripts/clinical-episodes.sh test`, servicio corregido | `9e9d0a6e-e55b-4ba4-896d-61f186f4b203` | 17/17 episodios, 101/101 unitarias backend, 119/119 integración; cero fallidas/canceladas/omitidas; frontend lint/build aprobados |
| `npm test` frontend en imagen de demo propia | `fce818af-ef0d-41b7-96ea-8f87d4cbc216` | 3/3 aprobadas, sin omitidas |
| Demo final `patient-projection-demo` y Chromium | `6fd0f5f9-d7b9-4ab2-96ab-c487a9089513` | Tres recorridos aprobados; cero errores de página o respuestas API HTTP >=400 en el recorrido final |

La reproducción falló en listado, detalle, PATCH de tarea, expediente devuelto por entrevista, lectura propia del segundo paciente y proyección de objetivos. La suite revisa recursivamente claves de todo el JSON y busca marcadores ficticios inequívocos. Los mismos casos pasan con la corrección. También comprueba conservación de valores en PostgreSQL, operaciones de tareas del profesional, denegaciones administrativas, aislamiento al manipular IDs y permisos de objetivos sin cambios.

Las unitarias conservan el positivo de `mapTaskRow` para el psicólogo y añaden negativos para paciente, roles administrativos, actor ausente, alias legacy y notas inesperadas en la fila. La suite nueva se declara en `backend/package.json`; la CI existente comprueba que ninguna integración descubierta quede omitida.

Chromium `156.0.8078.4`, Playwright `1.64.0`, Node del arnés `v24.21.0`, escritorio 1440×1000: login paciente, JSON depurado, tarea completada tras seleccionar expediente, lista sin insignia de riesgo; login profesional, campos conservados, riesgo alto y nota clínica accesibles. Capturas con entradas/credenciales demo ocultas e inspeccionadas visualmente. El arnés local temporal no añade checks ni sustituye la regresión B/C/D2 de Actions.

Incidencias registradas:

- El primer arnés interceptaba también módulos JavaScript; se acotó a rutas `/api/`. Otros intentos fallaron al comprobar/esperar la actualización desde el tablero sin expediente seleccionado. Es comportamiento previo confirmado en `App.jsx`, idéntico a la base. El recorrido válido abre «Ver detalle», vuelve a «Tablero» y completa la tarea. No se declara arreglado ese límite de UX.
- La primera demo instalaba hasta 004 y mostró un error del panel de contactos C. El fixture final instala hasta 005, como la demo de identidad existente, exclusivamente en otra base nueva. El recorrido final exige ausencia de errores API, además de privacidad.
- Solapar ensayo corregido y primera demo hizo que la limpieza de imágenes de demo detectase las dos etiquetas del otro ensayo propio ya eliminado. Contenedores/redes propios se retiraron; antes de retirar manualmente las imágenes de demo se verificó propiedad y que las únicas diferencias del baseline eran exactamente aquella limpieza propia, acreditada por su log. Sin restaurar imágenes ni modificar recursos ajenos. La demo final se ejecutó en secuencia y su limpieza verificada terminó correctamente.

SQL 001–007, manifiesto/hashes y ambos lockfiles se contrastaron byte por byte con la base y permanecen idénticos. Sin cambios de autenticación, episodios, vínculos, participantes, estados clínicos, CI, retención de artifacts, proveedores o configuración habitual. `git diff --check` y el verificador documental offline forman parte de la revisión final.

## Demo reproducible — ADR-019

Desde la raíz, con Docker/WSL y autorización de pruebas aisladas:

```bash
bash scripts/clinical-episodes.sh patient-projection-demo
```

Genera UUID y destino nuevos y muestra URLs loopback dinámicas. El creador rechaza entorno distinto de desarrollo, cluster reutilizado o base existente; no usa seed ni activa episodios. Instala baseline/sucesoras hasta 005 solo en esa base nueva. Para restablecer, limpiar únicamente ese UUID y crear otro destino, sin reutilizar bases ni borrar volúmenes existentes.

Cuentas ficticias: `p@episodes.invalid` (paciente P), `q@episodes.invalid` (paciente Q), `a@episodes.invalid` (psicólogo de P), `b@episodes.invalid` (psicólogo de Q). Contraseña de prueba: `Episode-Demo-Only-284!`. Introducirlas manualmente; las tarjetas de otras demos no corresponden a este fixture.

1. Como P, comprobar «Synthetic legacy task» en el tablero y ausencia de `FICTIONAL_PRIVATE_CONTEXT_p`, `FICTIONAL_NOTE_OBJECTIVE_p` y `FICTIONAL_NOTE_CONTENT_p` en el JSON de `/api/patients` y `/api/patients/p`.
2. Abrir «Ver detalle», volver a «Tablero» y completar la tarea. El PATCH conserva texto, estado, ID/fecha de asociación; omite objetivo profesional. «Mi Seguimiento» no muestra riesgo.
3. `/api/patients/q` con sesión P devuelve 404. Q consulta solo su expediente. No usar cuentas reales ni copiar tokens a evidencia.
4. Como A, abrir «Mis Pacientes» y el expediente de P: riesgo alto, nota general y nota clínica conservan marcadores ficticios. B sigue sin acceso a P. No editar objetivos para comprobar este arreglo.
5. Guardar por primera vez la entrevista de P con respuestas ficticias: la respuesta conserva esas respuestas y devuelve expediente depurado. No valida ni activa un episodio.
6. Limpiar únicamente con `bash scripts/clinical-episodes.sh cleanup UUID`, usando el UUID impreso por esa ejecución. No solapar ensayos que se incluyan mutuamente en sus inventarios de imágenes.

La API permite completar tareas; la navegación/agrupación mantiene límites previos: el tablero requiere expediente seleccionado y el detalle depende del historial de notas que ya era vacío para el paciente. Se conservan como temas de #21, sin divulgar notas para suplirlos. Publicación clínica, política de entrevista, ARCO, permisos por episodio, #22, D3 y despliegue quedan fuera de alcance. Esta corrección no certifica preparación para producción.

## Entrega y CI

La evidencia anterior es local de este encargo. GitHub Actions ejecutará su matriz completa al abrir el Draft PR, conservando siete checks y artifacts técnicos de 14 días. Sus resultados se consultan por HEAD del PR, sin sustituirlos por evidencia histórica. El PR permanece Draft sin merge/auto-merge; revisión e integración requieren decisión posterior.