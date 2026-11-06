# Inventario CI: corrección de ReDoS — candidato #61

Encargo independiente del propietario, base remota reconsultada `main`
`8b3adc5b965df4dffe85e089b7d206840daa2076` (merge de #60). Al iniciar,
workspace limpio; 29 alertas CodeQL abiertas sobre esa base: 28
`js/missing-rate-limiting` y una `py/redos`. Solo se corrige
[#1](https://github.com/japh113/plataformaPsicologia/security/code-scanning/1).
Las otras 28 no se modifican ni se consideran resueltas.

## Causa y alternativa seleccionada

La regex de [common.py](../scripts/ci/common.py) repetía dos alternativas que
podían consumir los mismos caracteres escapados. Un literal sin cierre podía
provocar backtracking exponencial. Las fuentes vienen del checkout del PR;
el timeout de los subprocesos de pruebas no protege la ejecución posterior de
`inventory()` en el proceso Python.

[inventory_source.py](../scripts/ci/inventory_source.py) sustituye únicamente
la extracción de nombres por un lector léxico determinista sin dependencias ni
evaluación de JavaScript. Los cursores avanzan sin retroceder; comentarios,
cadenas, regexes y texto de plantillas se consumen una vez. Las interpolaciones
de plantillas vuelven a código, para no ocultar llamadas con nombre literal.
Los nombres entre comillas simples/dobles conservan la normalización histórica:
solo se sustituyen las secuencias de comilla escapada, sin interpretar otros
escapes como JavaScript.

El coste esperado del lector es **O(n)** en caracteres de fuente y O(n) de
memoria en el peor caso, contando nombres y pilas de anidación. Las búsquedas de
fin de comentario operan sobre segmentos disjuntos y no se reinician desde
posiciones anteriores. La ordenación y comparaciones del inventario exterior
conservan su coste anterior; no se afirma que todo el sistema CI sea lineal.

## Contrato y límites explícitos

- Se reconocen llamadas `test(...)`, incluidas las de miembro como `t.test`,
  cuyo primer argumento es un literal simple/doble. Se permite espacio y
  comentarios entre tokens. Tras el literal debe seguir la coma de argumentos.
- Un literal iniciado pero sin cierre, escape colgante, composición del nombre
  o región léxica incompleta produce `ValueError`; no se entrega un inventario
  parcial como éxito. Los mensajes no incluyen el texto de fuente.
- Comentarios y contenido de cadenas/plantillas no crean pruebas ficticias.
  No se introduce un parser completo: las ambigüedades conocidas entre división
  y regex que requieren contexto no soportado se rechazan explícitamente
  (por ejemplo, slash tras `}`, `of`, etiqueta de break/continue o paréntesis
  de await). Clases regex anidadas también se rechazan. La sintaxis futura fuera
  de este subconjunto puede necesitar una ampliación revisada del lector.
- Por confirmación expresa del propietario, **nombres dinámicos, plantillas
  como nombre y variantes no reconocidas por el contrato anterior no se añaden
  al inventario estático**. Los dos sitios existentes de subtests interpolados
  de `contact-deadline.integration.test.js` permanecen intactos; su prueba padre
  literal sigue inventariada. Su ejecución efectiva se verifica en la CI de
  integración, sin omitir la suite ni cambiar sus controles TAP.
- El catálogo [episode-cases.json](../scripts/ci/episode-cases.json), su
  comprobación de declaraciones, unicidad y exigencia de exactamente una
  ejecución aprobada por caso obligatorio permanecen intactos. Las declaraciones
  ordinarias siguen colapsando a un conjunto como antes; no se introduce una
  política nueva de duplicados generales.
- No cambian descubrimiento, `parse_tap()`, aceptación de evidencia, nombres y
  formatos de artifacts, hashes, SHA/base/HEAD, saneamiento ni los siete checks.
  El resultado satisfactorio de un extractor no acredita por sí solo ejecución:
  se mantiene la comparación con TAP y el rechazo de evidencia incompleta.

## Validación local nueva

`python3 -B -m unittest discover -s scripts/ci -p 'test_*.py'`: **23/23**, las
11 pruebas previas y 12 nuevas de [regresión](../scripts/ci/test_inventory_source.py).
Incluyen simples/dobles, escapes, Unicode/puntuación, múltiples declaraciones,
comentarios/cadenas/regexes, interpolaciones, nombres dinámicos excluidos,
literales incompletos/compuestos, regiones no soportadas, discrepancia con TAP,
inventario vacío, duplicados ordinarios y lectura del catálogo obligatorio.
Las pruebas existentes conservan omisión, duplicación y falta de invocación de
casos importados, evidencia incompleta, hashes y saneamiento.

Comparación puntual con el extractor original obtenido por `git show` de la
base: **49 archivos, 469 coincidencias; igualdad exacta por archivo, orden y
duplicados**. Corpus: `backend/test` y `frontend/test`, solo archivos directos
`*.test.js` y `*.cases.js`. SHA-256 del JSON UTF-8 compacto de pares ordenados
`[ruta, nombres]`, `ensure_ascii=False`:
`ad05a52d99da04cfc5c048885d00c66823f3df089452a7eb744510f6cec7aa1b`.
Estos valores describen la base auditada, no son constantes exigidas a futuros
inventarios. La regex vulnerable no se incorpora a los tests nuevos ni se
ejecuta periódicamente contra fuentes de futuros PRs.

La comparación original se ejecutó solo sobre el corpus válido actual en un
subproceso con timeout de cinco segundos, CPU de dos segundos y memoria de
128 MiB. Las regresiones de complejidad ejecutan **solo el lector nuevo** bajo
los mismos límites: tamaños 128, 1024 y 8192, escapes repetidos, múltiples
declaraciones y fuentes malformadas. No se ejecutaron entradas de agotamiento
contra la regex original ni pruebas de carga; los límites temporales son una
regresión acotada, la justificación asintótica procede del avance del cursor.

La validación documental comprueba enlaces, decisiones protegidas y SQL/hashes.
No se ejecutan bases, migraciones, demos ni contenedores habituales localmente.

## CI, CodeQL y entrega

Los siete resultados, análisis CodeQL Python/JavaScript-TypeScript/Actions,
HEAD final, base, merge sintético y enlaces de artifacts de 14 días se registran
en el PR Draft. La validación local anterior no sustituye esos checks ni la
auditoría independiente de ChatGPT/Work. No se afirma el cierre de #1 en `main`:
solo podrá contrastarse tras una integración decidida por el propietario y un
nuevo análisis de GitHub. No se suprime ni descarta ninguna alerta manualmente.

No cambian backend/frontend funcional, autenticación, permisos, clínica,
SQL 001–011/manifiesto/hashes, Dockerfiles, Compose, workflows o configuración de
seguridad. Se conservan AB-23, `prepared`, `allowed:false`,
`audienceVerified:false` y originales privados. Sin merge, despliegue ni trabajo
de rate limiting; el siguiente incremento requiere autorización propia.
