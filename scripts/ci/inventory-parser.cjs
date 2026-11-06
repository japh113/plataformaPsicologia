"use strict";
// The CI-pinned Node distribution already contains this parser. Require the
// builtin explicitly; never resolve a project package or execute analyzed code.
try {
  if (process.version !== "v24.22.0") throw Error();
  const acorn = require("node:internal/deps/acorn/acorn/dist/acorn");
  if (acorn.version !== "8.18.0") throw Error();
  const bytes = require("node:fs").readFileSync(0);
  if (bytes.length > 1024 * 1024) throw Error();
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const ast = acorn.parse(source, { ecmaVersion: 2025, sourceType: "module" });
  const children = node => Object.values(node).flatMap(value =>
    (Array.isArray(value) ? value : [value]).filter(child =>
      child && typeof child.type === "string"));
  const stack = [ast], nodes = [], names = [];
  while (stack.length) {
    const node = stack.pop();
    nodes.push(node);
    for (const child of children(node)) stack.push(child);
  }
  // Postorder marks composed literal arguments using AST structure, including
  // parentheses. Templates remain dynamic; their interpolations are still
  // traversed and any nested test calls are independently inventoried.
  const containsLiteral = new WeakSet();
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    const isString = node.type === "Literal" && typeof node.value === "string";
    if (node.type !== "TemplateLiteral" &&
        (isString || children(node).some(child => containsLiteral.has(child)))) {
      containsLiteral.add(node);
    }
    if (!["CallExpression", "NewExpression"].includes(node.type)) continue;
    const callee = node.callee;
    const isTest = (callee.type === "Identifier" && callee.name === "test") ||
      (callee.type === "MemberExpression" && !callee.computed &&
       ["Identifier", "PrivateIdentifier"].includes(callee.property.type) &&
       callee.property.name === "test");
    if (!isTest) continue;
    if (node.type === "NewExpression") throw Error();
    const argument = node.arguments[0];
    if (!argument) continue;
    if (argument.type === "Literal" && typeof argument.value === "string") {
      if (!["'", '"'].includes(source[argument.start]) || node.arguments.length < 2) throw Error();
      const raw = source.slice(argument.start + 1, argument.end - 1);
      names.push([argument.start, raw.replaceAll("\\'", "'").replaceAll('\\"', '"')]);
    } else if (containsLiteral.has(argument)) {
      // Do not silently turn a composed quoted name into a dynamic exclusion.
      throw Error();
    }
  }
  names.sort((a, b) => a[0] - b[0]);
  process.stdout.write(JSON.stringify(names.map(entry => entry[1])));
} catch {
  // No source excerpts, parser diagnostics or partial names leave the adapter.
  process.stderr.write("JavaScript inventory parse failed\n");
  process.exitCode = 1;
}
