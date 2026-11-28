/**
 * Nullish ternary arms: `const u = id ? new User() : undefined`.
 *
 * The JS/TS scope queries bind `u` to the value arm when the other arm is
 * `null` or `undefined`, because that arm adds no receiver type. `null` is a
 * literal. `undefined` is not: it is an ordinary name that a parameter, a
 * declaration, a `catch` clause or an import can bind, and then the arm holds
 * whatever that binding holds:
 *
 *   function pick(c: boolean, undefined: Other) {
 *     const s = c ? new Svc() : undefined;
 *     s.ping(); // Svc.ping OR Other.ping
 *   }
 *
 * So the emitters keep an `undefined` arm only when no binding of `undefined`
 * encloses it, i.e. it reads the global.
 *
 * Shared by the JavaScript and TypeScript capture emitters. In both grammars
 * an `undefined` used as a value is its own `(undefined)` node, and a binding
 * is either an `identifier` / shorthand pattern spelled `undefined` (`const`,
 * `catch`, import alias, destructuring) or an `(undefined)` node in parameter
 * position.
 */

import type { SyntaxNode } from '../../utils/ast-helpers.js';

const FUNCTION_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'function',
  'generator_function',
  'arrow_function',
  'method_definition',
]);

/** Nodes that delimit a `let` / `const` / `class` / `catch` binding. */
const BLOCK_TYPES = new Set([
  'statement_block',
  'catch_clause',
  'for_statement',
  'for_in_statement',
  'class_body',
  'switch_body',
  'program',
]);

const PARAMETER_TYPES = new Set(['required_parameter', 'optional_parameter']);

/** The source range each binding of `undefined` is visible in, per tree. */
const undefinedScopesByRoot = new WeakMap<SyntaxNode, readonly [number, number][]>();

function enclosing(node: SyntaxNode, types: ReadonlySet<string>): SyntaxNode {
  let current: SyntaxNode = node;
  while (current.parent !== null && !types.has(current.type)) current = current.parent;
  return current;
}

/** The scope a binding of `undefined` at `node` is visible in, or null if `node` is a read. */
function bindingScope(node: SyntaxNode): SyntaxNode | null {
  const parent = node.parent;
  if (parent === null) return null;
  if (node.type === 'undefined') {
    // JS: `function f(undefined)`; TS: `function f(undefined: T)`. A default
    // value (`a = undefined`) is a read in both grammars.
    const isParameter =
      parent.type === 'formal_parameters' ||
      (PARAMETER_TYPES.has(parent.type) && parent.childForFieldName('pattern')?.id === node.id);
    return isParameter ? enclosing(parent, FUNCTION_TYPES) : null;
  }
  // An identifier spelled `undefined` is always a binding: as a value the
  // grammars parse the name as `(undefined)`.
  if (parent.type === 'import_specifier' || parent.type === 'namespace_import') {
    return enclosing(parent, new Set(['program']));
  }
  // `var` and parameters reached through a pattern bind in the function.
  for (let current: SyntaxNode | null = parent; current !== null; current = current.parent) {
    if (current.type === 'variable_declaration' || current.type === 'formal_parameters') {
      return enclosing(current, FUNCTION_TYPES);
    }
    if (current.type === 'lexical_declaration' || current.type === 'catch_clause') break;
    if (FUNCTION_TYPES.has(current.type) || current.type === 'program') break;
  }
  if (FUNCTION_TYPES.has(parent.type)) {
    // `function undefined() {}` binds in the enclosing scope.
    return parent.parent === null ? parent : enclosing(parent.parent, BLOCK_TYPES);
  }
  return enclosing(parent, BLOCK_TYPES);
}

function undefinedScopes(root: SyntaxNode): readonly [number, number][] {
  const cached = undefinedScopesByRoot.get(root);
  if (cached !== undefined) return cached;
  const scopes: [number, number][] = [];
  const stack: SyntaxNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const spelled =
      node.type === 'undefined' ||
      ((node.type === 'identifier' || node.type === 'shorthand_property_identifier_pattern') &&
        node.text === 'undefined');
    if (spelled) {
      const scope = bindingScope(node);
      if (scope !== null) scopes.push([scope.startIndex, scope.endIndex]);
    }
    for (const child of node.namedChildren) stack.push(child);
  }
  undefinedScopesByRoot.set(root, scopes);
  return scopes;
}

/**
 * True when a nullish-ternary match must be dropped: its `undefined` arm is
 * a local binding rather than the global value. A `null` arm always passes.
 */
export function isShadowedUndefinedArm(arm: SyntaxNode | undefined, root: SyntaxNode): boolean {
  if (arm === undefined || arm.type !== 'undefined') return false;
  const at = arm.startIndex;
  return undefinedScopes(root).some(([start, end]) => start <= at && at < end);
}
