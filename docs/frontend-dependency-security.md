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
