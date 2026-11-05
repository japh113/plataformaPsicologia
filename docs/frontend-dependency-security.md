# Actualización de seguridad del frontend — candidato #58

Encargo del propietario del 5 de noviembre de 2026. Base `main` reconsultada por fetch: `2725b81e89733e6c24f7bff59a5c4ac4fc65eebd` (#57 integrado); sin PRs abiertos al iniciar. Entrega Draft, sin merge ni despliegue. Solo manifiestos frontend y trazabilidad documental; backend, SQL 001–011, hashes, infraestructura, siete checks y funcionalidad clínica intactos.

## Resolución y compatibilidad

| Paquete | Antes | Después | Motivo |
| --- | --- | --- | --- |
| Vite (directa) | 8.0.16 | 8.1.6 | Primera versión corregida indicada para alertas #3–#7; rango directo `^8.1.6`. |
| postcss-selector-parser (transitiva) | 6.1.4 | 6.1.5 | Corrección indicada para #9; compartido por Tailwind 3.4.19 (`^6.1.2`) y postcss-nested 6.2.0 (`^6.1.1`). |
| rolldown y sus 15 bindings opcionales por plataforma | 1.0.3 | 1.1.5 | Vite 8.1.6 requiere `~1.1.5`. |
| @oxc-project/types | 0.133.0 | 0.139.0 | Dependencia exacta de Rolldown 1.1.5. |
| picomatch privado de Vite | 4.0.4 | 4.0.7 | Nuevo mínimo de Vite `^4.0.5`, resuelto por npm. |
| @napi-rs/wasm-runtime | 1.2.5 | 1.2.7 | Resolución npm de la rama opcional WASI de Rolldown. |
| @emnapi/core y @emnapi/runtime | 1.10.0 | 1.11.1 | Resolución transitiva de WASI. |
| @emnapi/wasi-threads | 1.2.1 | 1.2.2 | Resolución transitiva de WASI. |
| tslib | 2.8.1 | 2.9.1 | Resolución transitiva de WASI. |

No hay overrides ni nueva dependencia directa. Se usaron `npm install --package-lock-only --ignore-scripts --save-dev vite@8.1.6` y `npm update postcss-selector-parser --package-lock-only --ignore-scripts`, desde frontend en contenedor efímero. El lockfile fija las versiones ensayadas; no se utilizó `audit fix`.

Metadatos publicados consultados con `npm view`: Vite y @vitejs/plugin-react 6.0.1 requieren Node `^20.19.0 || >=22.12.0`; el plugin admite Vite `^8.0.0`. Parser exige Node `>=4`. Se verificó Node **24.22.0 / npm 11.19.1**, sin cambiar la referencia CI. [Release oficial de Vite 8.1.6](https://github.com/vitejs/vite/releases/tag/v8.1.6).

React/React DOM 19.2.4, plugin-react 6.0.1, Tailwind 3.4.19, PostCSS 8.5.23, autoprefixer 10.4.27 y lightningcss 1.32.0 permanecen iguales. No cambia configuración Vite, CSS, variables ni componentes.

## Validación de esta entrega

Contenedores efímeros nuevos `node:24.22.0-bookworm-slim`, fuentes montadas solo lectura y copia a `/tmp/frontend` interna; sin DB, migraciones, schema, seed, volúmenes persistentes ni puertos publicados:

- `npm ci`: correcto; 214 paquetes instalados.
- `npm ls` completo y árbol dirigido: correctos, sin dependencias inválidas; Vite 8.1.6 y parser 6.1.5 efectivos y deduplicados.
- `npm test`: **64/64**, cero fallos y cero omitidas.
- `npm run lint`: correcto.
- `npm run build`: correcto, 1756 módulos; CSS 45.16 kB y JS 511.56 kB. Persiste advertencia de chunk mayor a 500 kB; no se modifica arquitectura para resolverla.
- Smoke aislado adicional: servidor con configuración real, HTTP inicial, transformación de main/App JSX, módulo React, CSS real, variable pública `VITE_*` en fixture, selectores compuestos, Tailwind responsive/hover y PostCSS nesting. El primer ensayo de variable asumió que main.jsx consumía `import.meta.env`; se corrigió el fixture del ensayo, sin modificar aplicación.

La matriz existente de navegador se verifica en CI para el HEAD del Draft; sus suites B/C/D2 cubren carga, navegación, formularios y componentes. SHA final, ejecución, resultados y artifacts de esa ejecución se registran en el PR, evitando un commit nuevo solo para cambiar el SHA de evidencia. Artifacts conservan retención de 14 días. No se reutilizan pruebas históricas ni se ejecuta manualmente la base habitual.

## Riesgos y pendientes

`npm audit --json` ya no reporta Vite ni parser. Detecta **un aviso high residual en Zod <4.6.6**, [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), dependencia transitiva de herramientas; no se actualiza en este encargo limitado. Tampoco se toca minimatch 10.2.5 del backend, señalado por el propietario.

Las alertas #3–#7 y #9 deberían corregirse tras eventual integración y reanálisis de GitHub; cambiar el lockfile no acredita su cierre. CodeQL y siete checks deben corresponder al HEAD final. La auditoría independiente de ChatGPT/Work y la decisión exclusiva de merge del propietario siguen pendientes. Se conservan AB-23, `prepared`, `allowed:false` y `audienceVerified:false`, sin nueva lectura clínica o publicación.

## Corrección Zod posterior a #59 — candidato #60

Encargo independiente del 5 de noviembre de 2026; base remota reconsultada con `git fetch origin`: `5422162b73297b40f5a6759f5e3efbbd4afb42d1` (#59 integrado). Workspace limpio, ramas inspeccionadas y sin PRs abiertos según consulta del conector GitHub. Backlog #28–#41 consultado; no autoriza trabajo adicional. La evidencia de #58 anterior conserva su corte histórico.

### Cambio mínimo y compatibilidad efectiva

`npm update zod --package-lock-only --ignore-scripts`, en una copia aislada de frontend con Node **24.22.0 / npm 11.19.1**, resolvió **4.3.6 → 4.6.7**. Solo cambia versión, URL e integridad de `node_modules/zod` en el lockfile; permanece `dev:true`. `package.json` no cambia, tampoco consumidores, overrides u otros paquetes. Se acepta 4.6.7, resolución estándar dentro de major 4 y parche posterior al mínimo 4.6.6, respaldada por las pruebas de consumidores descritas abajo; esto no garantiza ausencia de defectos futuros.

[Advisory oficial GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): consumo excesivo de memoria, severidad high, rango `<4.6.6`. `npm audit --json` en la base confirmó un único aviso high de Zod; la ausencia de alertas Dependabot no sustituye esa auditoría. No se ensayaron cargas maliciosas ni agotamiento de memoria.

Hay **una copia efectiva**, compartida por `eslint-plugin-react-hooks@7.0.1` (dependencia) y `zod-validation-error@4.0.2` (peer), ambos con rango `^3.25.0 || ^4.0.0`. Todos permanecen solo en herramientas de desarrollo. La versión resuelta satisface ambos rangos y se probó ejecutando los consumidores, sin actualizar ninguno. Metadatos `npm view zod@4.6.7 version engines exports --json`: sin restricción `engines` declarada; exporta entradas `import`/`require` separadas. Ambos consumidores requieren Node `>=18`; las comprobaciones se ejecutaron en la referencia CI, sin modificarla.

Configuración npm del contenedor: registro `https://registry.npmjs.org/`, `omit` vacío, sin `.npmrc` del proyecto ni configuración host montada. Se inspeccionaron las referencias Node/imagen en workflows y `scripts/ci/versions.json`; permanecen intactas. No se instaló software en el host ni se operaron contenedores habituales.

### Evidencia nueva de esta entrega

Dos contenedores efímeros `node:24.22.0-bookworm-slim`, fuentes solo lectura copiadas a `/tmp/frontend` y directorio de evidencia propio `/tmp/psicopanel-zod-60`; sin DB, puertos ni volúmenes persistentes. El primero diagnosticó la base y generó el lockfile; el segundo instaló limpiamente el candidato:

- `npm ci`: 214 paquetes instalados, correcto. `npm ls --all`: árbol completo válido, sin dependencias inválidas. `npm ls zod --all` y `npm explain zod`: una copia 4.6.7 deduplicada, fuera del rango vulnerable.
- `npm audit --json`: **cero avisos en todas las severidades**, frente a un high en la base; misma cuenta lógica de dependencias. Es el resultado del registro en esta consulta, no garantía permanente ni afirmación de cierre de alertas GitHub.
- SHA-256 de `package.json` y `package-lock.json` iguales antes/después de instalación, pruebas y build: instalación coherente y lockfile sin mutación.
- `npm test`: **64/64**, cero fallos, cancelaciones u omisiones. `npm run lint`: correcto usando la configuración real. `npm run build`: correcto, 1756 módulos transformados; CSS 45.16 kB, JS 511.56 kB. Persiste la advertencia conocida de chunk mayor a 500 kB.
- Probe temporal con `ESLint.calculateConfigForFile('src/App.jsx')`: `react-hooks/rules-of-hooks` en error y `react-hooks/exhaustive-deps` en warning. `lintFiles(['src/**/*.{js,jsx}'])` analizó **37 archivos**, incluyendo App y main, sin errores de análisis ni lint. Un fixture JSX en memoria con `useState` condicional y `useEffect` sin su dependencia produjo explícitamente ambos rule IDs; no se omitieron silenciosamente JSX o Hooks.
- Probe temporal importó `zod` y `zod-validation-error` mediante ESM y `createRequire` CJS; validó objeto correcto, rechazo de tipo incorrecto y formato del error con nombre del campo en ambos modos. La ejecución de la configuración y del plugin real ejercitó además su resolución CJS y los esquemas usados por React Hooks.
- Inspección de `frontend/src`, HTML y configuración Vite: sin referencias Zod/ESLint. Build adicional con la configuración Vite real y un plugin de inspección `generateBundle`: **1755 IDs en `getModuleIds()`**, cero módulos de `zod`, `zod-validation-error`, `eslint` o `eslint-plugin-react-hooks`. Esta comprobación examina el grafo efectivo, no solo cadenas del JS minificado.

Los probes y logs temporales permanecen en el directorio local de evidencia; no se incorporan al runtime ni se modifica la configuración del proyecto. La matriz completa de CI, navegador/demo ficticia e integración se ejecuta en runners nuevos por el Draft. Su ejecución, HEAD y artifacts de 14 días se registran en el PR; estos resultados locales no reemplazan la CI ni la auditoría independiente de Work.

Se conservan backend (incluido el override Nodemon/minimatch de #59), SQL 001–011/manifiesto/hashes, infraestructura, siete checks, configuración de seguridad y producto clínico. Permanecen AB-23, `prepared`, `allowed:false`, `audienceVerified:false` y originales privados. Sin merge, despliegue ni siguiente incremento; el propietario decide integración después de la auditoría del HEAD definitivo.
