# Corrección de minimatch del backend — candidato #59

Encargo del propietario del 5 de noviembre de 2026. Base `main` reconsultada por fetch: `ec0ced404420e48572350f8f832d4968bd536dbe`, posterior al merge de #58; sin PRs abiertos ni cambios locales al iniciar. Rama `fix/security-backend-minimatch`, entrega Draft sin merge ni despliegue. Este documento conserva evidencia propia, sin reutilizar resultados de #58.

## Diagnóstico y alcance efectivo

`npm explain minimatch` y `npm ls minimatch --all`, ejecutados tras instalación limpia del árbol original, muestran una única copia:

```text
psicologia-backend
└─ nodemon@3.1.14 (devDependency directa ^3.1.10)
   └─ minimatch@10.2.5 (rango del consumidor ^10.2.1)
      └─ brace-expansion@5.0.12 (rango ^5.0.5)
```

La [alerta GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249) indica rango vulnerable `>=7.0.0 <11.0.1`, corregido desde 11.0.1. No basta actualizar dentro de 10.x.

La inspección de Nodemon identifica las llamadas en `lib/monitor/match.js`: export CommonJS nombrado `minimatch(file, pattern, options)`, reglas watch/ignore, extensiones y opciones `dot`, `nocase`, `windowsPathsNoEscape`. Los patrones provienen de CLI/configuración local de desarrollo; la aplicación no importa minimatch ni Nodemon desde `src`, scripts de negocio o rutas HTTP, ni transmite parámetros HTTP al watcher. No se infiere esto solo del campo `dev`.

`npm start` ejecuta Node directamente; `npm run dev` utiliza Nodemon. El Dockerfile actual instala devDependencies y ejecuta Nodemon, por lo que el paquete sí está presente en ese entorno de desarrollo. Una instalación nueva `npm ci --omit=dev` confirma su ausencia. No se afirma ausencia universal en todos los posibles despliegues.

## Alternativas y cambio elegido

1. **Actualizar consumidor:** metadatos npm consultados el 5 de noviembre: Nodemon estable más reciente **3.1.14**, ya instalado, exige `^10.2.1`. No hay versión estable publicada que admita 11.
2. **Resolución estándar sin override:** `^10.2.1` excluye 11.0.1. Cambiar solo el lockfile no produciría instalación coherente con ese rango.
3. **Override excepcional acotado:** `overrides.nodemon.minimatch = "11.0.1"`, versión mínima corregida exacta, sin reemplazo global ni nueva dependencia directa. Se adopta tras revisión de API y ensayos del consumidor real.

Árbol nuevo comprobado con `npm ls`:

```text
psicologia-backend
└─ nodemon@3.1.14
   └─ minimatch@11.0.1 overridden (antes ^10.2.1)
      ├─ @isaacs/nonrecursive-glob-match@1.0.3 (nuevo, rango ^1.0.1)
      └─ brace-expansion@5.0.12 (sin cambio, nuevo mínimo ^5.0.12)
```

Solo cambia la versión de minimatch y se añade su motor transitivo; ninguna otra versión del lockfile cambia. Las dependencias directas permanecen iguales. El lockfile se generó mediante `npm install --package-lock-only --ignore-scripts` en backend, con npm 11.19.1; no se usó `audit fix`.

## Compatibilidad mayor revisada

Fuentes: [changelog oficial 11.0](https://github.com/isaacs/minimatch/blob/v11.0.1/changelog.md), [release 11.0.1](https://github.com/isaacs/minimatch/releases/tag/v11.0.1) y metadatos/tarball npm publicados.

11 sustituye el motor regex por un matcher no recursivo y cambia elementos internos de `Minimatch.set`. Elimina `makeRe`, AST y métodos/opciones internos, y modifica coincidencias con segmentos vacíos/extglobs, ciertos globstars/partial y raíces Windows/UNC. Nodemon no usa esas APIs eliminadas, `partial` ni nivel de optimización 2. Su función nombrada CommonJS y las opciones efectivas permanecen disponibles. La configuración del proyecto observa `src`, extensiones `js,json` y exclusiones ordinarias; no usa los patrones especiales afectados por esos cambios. No se afirma compatibilidad universal con toda configuración arbitraria de Nodemon.

Ambas versiones publican requisito Node `18 || 20 || >=22`, compatible con **Node 24.22.0 / npm 11.19.1** de CI, sin cambio de referencia. Pruebas con opciones Windows verifican rutas/separadores y case-insensitivity en Linux; no equivalen a ejecutar el watcher en Windows nativo.

## Evidencia nueva

Ensayos en contenedores nuevos efímeros `node:24.22.0-bookworm-slim`, fuentes solo lectura copiadas a filesystem temporal interno, sin bases, volúmenes persistentes ni puertos publicados:

- `npm ci`: correcto, **132 paquetes** instalados, **133 auditados**.
- `npm ls` completo, `npm explain minimatch` y `npm ls minimatch --all`: correctos; una sola copia **11.0.1**, override reconocido, sin copia vulnerable anidada.
- `npm audit`: **cero vulnerabilidades backend** en esta consulta. El árbol original reportó dos moderate (minimatch y efecto en su consumidor).
- `npm test`: **160 pruebas aprobadas**, cero fallos/omitidas; incluye HTTP existente sin DB y tres regresiones nuevas en [nodemon-glob.test.js](../backend/test/nodemon-glob.test.js).
- Las mismas tres regresiones pasan también contra el árbol original 10.2.5, contrastando preservación de comportamiento: observación recursiva, JS/JSON, positivos/negativos, ignores/VCS/dependencias, dotfiles, espacios, braces/extglobs y opciones Windows.
- Smoke con backend real y Nodemon: arranque, HTTP 401 de ruta protegida y 404 de ruta inexistente; modificación JS y creación JSON reinician y vuelven a servir HTTP. Archivo JS ignorado y extensión MD no reinician. Procesador de contactos desactivado explícitamente, sin consultas DB; recursos propios terminados al concluir.
- `npm ci --omit=dev` y `npm ls --omit=dev`: correctos; resolución de minimatch ausente. No se ejecutaron patrones maliciosos.

Los siete checks completos, integración HTTP/PostgreSQL pertinente y navegador se verifican en CI del HEAD final, exclusivamente en runners nuevos. CodeQL, ejecución, SHA base/HEAD/merge probado y artifacts con retención de 14 días se registran en el comentario de entrega del PR; no se modifica el workflow ni se ejecuta manualmente SQL, schema, seed o normalizadores.

## Límites y mantenimiento

El override cruza el rango declarado por Nodemon; requiere mantener las regresiones y revisar/eliminar la excepción cuando el consumidor publique soporte de 11. Fijar 11.0.1 no absorbe automáticamente correcciones futuras. Se conserva el riesgo residual de configuraciones glob no ensayadas y plataformas nativas no ejecutadas. La alerta #2 debería quedar corregida tras eventual merge y reanálisis GitHub; no se declara cerrada desde esta rama.

Zod frontend queda fuera del encargo. Frontend, autenticación, clínica, SQL 001–011/hashes, Docker/Compose, siete checks y configuración de seguridad intactos. Se conservan AB-23, `prepared`, `allowed:false` y `audienceVerified:false`. Pendientes auditoría independiente ChatGPT/Work y decisión exclusiva del propietario; sin despliegue ni siguiente incremento.
