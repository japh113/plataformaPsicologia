# Inventario CI: corrección de ReDoS — candidato #61

Encargo del propietario sobre `main`
`8b3adc5b965df4dffe85e089b7d206840daa2076`, dentro del mismo
[PR Draft #61](https://github.com/japh113/plataformaPsicologia/pull/61).
Solo se corrige [CodeQL #1, py/redos](https://github.com/japh113/plataformaPsicologia/security/code-scanning/1).
No se modifican las otras 28 alertas ni se cierra manualmente la alerta de main.

## Causa y reevaluación arquitectónica R1/R2

La regex original de [common.py](../scripts/ci/common.py) repetía alternativas
capaces de consumir los mismos escapes; un literal sin cierre podía causar
backtracking exponencial. El timeout de ejecución de pruebas no protegía este
análisis posterior en Python.

El primer lexer propio (`6a43a7c`) clasificaba mal `export default /.../`.
La corrección `87087c9` superó sus regresiones y CI, pero Work encontró dos P1
independientes: R1 perdía el contexto de propiedad ante `#default`; R2 lo perdía
ante U+FEFF, espacio de JavaScript que Python `str.isspace()` no reconoce.
En ambos casos confundía división con regex y podía ocultar `hidden`, aceptando
un TAP parcial. Esos resultados anteriores no acreditan la corrección actual.

Antes de editar se compararon estas estrategias:

| Estrategia | Evaluación |
| --- | --- |
| A: lexer propio determinista | El avance lineal evita ReDoS, pero no demuestra integridad. División/regex, ASI, propiedades privadas, escapes de identificador y Unicode requieren contexto gramatical. No existe una delimitación suficientemente fiable del subconjunto aceptado por el lector anterior; añadir palabras o espacios repetiría el problema. Se descarta. |
| B: Espree/Acorn del lock frontend | Son parsers mantenidos y disponibles tras instalar frontend, pero varios jobs actuales no lo instalan. Exigir esa instalación en todos ampliaría CI; no se elige. |
| B: Acorn incluido en Node fijado por CI | Node 24.22.0 ya contiene Acorn 8.18.0. Se verificó en el runtime exacto. Permite analizar el archivo completo sin instalar paquetes, añadir dependencias, copiar un parser ni modificar workflows. Se elige con comprobación estricta de versiones y fallo cerrado. |

La documentación de [Acorn](https://github.com/acornjs/acorn/blob/master/acorn/README.md)
explica que tokenizar JavaScript moderno requiere contexto del parser. Se usa
`parse`, con `ecmaVersion: 2025` y `sourceType: module`, sin recuperación,
plugins, modo loose ni análisis de fragmentos.

## Implementación y contrato

[inventory_source.py](../scripts/ci/inventory_source.py) llama al adaptador
[inventory-parser.cjs](../scripts/ci/inventory-parser.cjs) mediante argumentos
fijos, sin shell. El programa ejecutado es el adaptador; la fuente de pruebas
solo entra por stdin. No se evalúa, importa ni ejecuta esa fuente para extraer
nombres. Se eliminan `NODE_OPTIONS` y `NODE_PATH` del entorno del subproceso.

El adaptador requiere el builtin
`node:internal/deps/acorn/acorn/dist/acorn` con `--expose-internals` y exige
Node **24.22.0** y Acorn **8.18.0**. El prefijo `node:` impide resolver un paquete
homónimo del checkout. La ausencia del builtin, cambio de versión o cualquier
error produce rechazo: **no existe fallback al lexer**.

Se analiza todo el módulo antes de recorrer su AST. El recorrido iterativo
incluye ramas no ejecutadas, cuerpos de funciones, miembros privados e
interpolaciones de plantillas. Solo los nodos de llamada a `test`, incluidos
miembros no computados como `t.test`, pueden declarar nombres. El uso de
`new test(...)` se rechaza explícitamente. Se ordenan por posición del argumento
literal en la fuente (también en llamadas encadenadas), conservando orden y
duplicados. El texto dentro de strings,
comentarios, regexes y partes estáticas de plantillas no crea llamadas AST.

- Solo se inventarían nombres literales entre comillas simples o dobles.
  Se conserva la normalización histórica del texto crudo: reemplazar comillas
  escapadas, sin decodificar otros escapes como JavaScript.
- Un nombre que empieza por literal pero está compuesto, un literal sin segundo
  argumento o cualquier sintaxis inválida rechaza el archivo entero. No se
  entrega siquiera un prefijo válido antes de detectar el error.
- Por decisión expresa del propietario, los nombres dinámicos siguen fuera del
  inventario estático; se excluyen plantillas y expresiones sin literales de
  cadena internos,
  sin intentar resolverlas. Si el argumento compuesto contiene un literal de
  cadena fuera de una plantilla, se rechaza explícitamente, también entre
  paréntesis. Esta política conservadora se calcula sobre el AST completo y
  evita omitir composiciones como `('name').trim()`; puede rechazar algunos
  nombres dinámicos con strings internos. No se resuelven alias.
  Los dos sitios interpolados existentes en
  [contact-deadline.integration.test.js](../backend/test/contact-deadline.integration.test.js)
  permanecen intactos. Su padre literal se inventaría y sus cuatro ejecuciones
  reales se contrastan en la evidencia nueva de CI.
- El catálogo [episode-cases.json](../scripts/ci/episode-cases.json) y sus
  comprobaciones no cambian: declaraciones, unicidad y exactamente una ejecución
  aprobada de cada uno de los 99 obligatorios. Los duplicados ordinarios siguen
  colapsando a un conjunto en `inventory()` como antes.
- No cambian descubrimiento, controles TAP, aceptación de evidencia incompleta,
  hashes, saneamiento, identidad de artifacts ni los siete checks. El AST
  enumera declaraciones; la comparación existente con TAP exige su ejecución.

## Recursos, reproducibilidad y limitaciones

Cada fuente tiene un máximo de **1 MiB UTF-8**, comprobado antes del subproceso;
el adaptador también comprueba el tamaño. Cada análisis dispone de **10 segundos**
y heap V8 de **64 MiB**. Un timeout, fallo de memoria, profundidad excesiva o
error de sintaxis rechaza el inventario; nunca habilita un análisis parcial.
El límite del heap no pretende limitar toda la memoria nativa de Node.

El recorrido del AST es O(n) y la ordenación de k nombres O(k log k); ambos
usan O(n) de memoria respecto al árbol producido. No se afirma una garantía
lineal universal para Acorn: la validación gramatical/regex pertenece al parser
mantenido y está acotada operacionalmente por tamaño, timeout y heap. No se usa
la regex vulnerable ni se ejecutan las regexes del código analizado.
Python guarda solo análisis completos satisfactorios en una caché LRU de 32
fuentes, por contenido y no por ruta; el tamaño máximo limita su memoria.
Esto evita reanalizar los módulos obligatorios en las 99 regresiones de omisión.

La API interna de Node **no es un contrato público estable**. Una actualización
de Node o de su Acorn requiere reevaluación y cambio explícito de las versiones
permitidas; mientras tanto fallará cerrada. Sintaxis de Node fuera de ECMAScript
2025 admitido por este parser también se rechaza. Son límites de disponibilidad
explícitos, sin interpretación alternativa de regiones desconocidas.

## Regresiones y equivalencia

Validación local final: **35/35 contratos Python**, sin omisiones (28 anteriores
adaptados a AST y siete métodos nuevos), con **79 módulos ficticios** validados
por `node --check` y ejecutados con TAP real. Comando:
`python3 -B -m unittest discover -s scripts/ci -p 'test_*.py'`.
La validación documental final cubre 53 Markdown y 1115 enlaces locales;
decisiones protegidas y SQL/manifiesto/hashes permanecen intactos.

[Las regresiones](../scripts/ci/test_inventory_source.py) comprueban sintaxis con
Node 24.22.0, ejecución TAP real, extracción y `inventory()` para R1, R2 y A/B:

| Familia | Resultado exigido |
| --- | --- |
| R1: `#default`, `#new`, `#extends`, `#return`, `#if`; campos, métodos y getters | Se extraen `hidden` y `visible`; Node solo ejecuta `visible`; el inventario rechaza la omisión. |
| R2: U+FEFF y el conjunto de espacios/terminadores ECMAScript, comentarios entre tokens | Mismo rechazo de TAP que omite `hidden`, sin perder contexto de propiedad. |
| A: `export default /"/`, una línea y varias | Se detecta `hidden` y se rechaza la omisión. |
| B: regex con texto `test('phantom',x)` | Solo `visible`; el inventario completo se acepta sin inventar `phantom`. |
| ASI, Unicode y propiedades escapadas, clases regex anidadas y otros contextos | AST completo; se conserva detección de `hidden` y rechazo del TAP parcial. |
| Sintaxis inválida, nombres compuestos, runtime/parser ausentes o distintos, timeout y respuesta inválida | Rechazo completo sin nombres parciales ni texto de fuente en errores. |

Se conservan escapes, orden, duplicados, nombres dinámicos fuera de contrato,
omisiones, catálogo obligatorio, saneamiento y evidencia incompleta. Las entradas
repetitivas de tamaños 128, 1024 y 8192 se prueban **solo con el extractor nuevo**
en un hijo con límite CPU y timeout; cada Node conserva sus límites individuales.
No se ejecutan entradas de agotamiento contra la regex vulnerable ni el host.

La comparación puntual con el extractor original de la base se limita al corpus
válido actual: **49 archivos / 469 nombres**, igualdad por archivo, orden y
duplicados. JSON UTF-8 compacto de pares ordenados `[ruta, nombres]`,
`ensure_ascii=False`, SHA-256 esperado de ese corte:
`ad05a52d99da04cfc5c048885d00c66823f3df089452a7eb744510f6cec7aa1b`.
La regex original se ejecuta únicamente en un hijo acotado sobre ese corpus
conocido; no se incorpora a regresiones periódicas de futuros PRs.

La validación local usa Python y un wrapper temporal de Node en contenedores
nuevos sin red ni DB, raíz de solo lectura, 128 MiB, un CPU, 64 procesos y solo
`scripts/ci` montado de solo lectura. No se instala nada en host ni se tocan
recursos habituales. En CI se usa el Node ya provisionado por cada job.

## CI, CodeQL y entrega

El HEAD final, total de regresiones, resultados nuevos de los siete checks,
CodeQL Python/JavaScript-TypeScript/Actions, merge de prueba y artifacts de
14 días se registran en el PR y la entrega. La evidencia se comprueba contra el
nuevo HEAD; los runs de `87087c9` y `6a43a7c` son históricos. La alerta #1 de
main no se cierra manualmente; solo se comprueba la referencia del PR.

No cambian backend/frontend funcional, autenticación, permisos, clínica,
SQL 001–011/manifiesto/hashes, Dockerfiles, Compose, workflows ni reglas de
seguridad. Se conservan AB-23, `prepared`, `allowed:false`,
`audienceVerified:false` y originales privados. Sin merge ni despliegue;
el propietario decide integración tras revisión del HEAD final por ChatGPT/Work.
