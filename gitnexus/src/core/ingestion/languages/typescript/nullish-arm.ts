/**
 * Nullish ternary arms: `const u = id ? new User() : undefined`.
 *
 * The JS/TS scope queries bind `u` to the value arm when the other arm is
 * `null` or `undefined`, because that arm adds no receiver type. `null` is a
 * literal. `undefined` is not: a parameter, declaration, `catch` clause or
 * import can bind the name, and then the arm holds whatever that binding holds:
 *
 *   function pick(c: boolean, undefined: Other) {
 *     const s = c ? new Svc() : undefined;
 *     s.ping(); // Svc.ping OR Other.ping
 *   }
 *
 * So the emitters keep an `undefined` arm only when no enclosing scope binds
 * `undefined`, i.e. it reads the global. The check walks up from the arm and
 * reads only the declarations that bind in each enclosing scope, through the
 * same `boundNames` pattern rules the local-loader scopes use.
 *
 * Shared by the JavaScript and TypeScript capture emitters (the patterns are in
 * `nullish-ternary-query.ts`); every node type named here exists in both grammars.
 */

import type { SyntaxNode } from '../../utils/ast-helpers.js';
import { boundNames } from './local-loaders.js';

const FUNCTION_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'function',
  'generator_function',
  'arrow_function',
  'method_definition',
]);

/** Scopes whose direct statements hold `let` / `const` / `class` / `function` declarations. */
const BLOCK_TYPES = new Set(['statement_block', 'switch_case', 'switch_default', 'program']);

const isUndefinedName = (node: SyntaxNode) =>
  node.type === 'undefined' || (node.endIndex - node.startIndex === 9 && node.text === 'undefined');

const bindsUndefined = (pattern: SyntaxNode | null) => boundNames(pattern).some(isUndefinedName);

/** A `let` / `const` / `var` statement binding `undefined`. */
function declarationBindsUndefined(statement: SyntaxNode): boolean {
  return statement.namedChildren.some(
    (declarator) =>
      declarator.type === 'variable_declarator' &&
      bindsUndefined(declarator.childForFieldName('name')),
  );
}

/** `var` declarations hoist to the function: search its body, not nested functions. */
function hoistsUndefined(body: SyntaxNode): boolean {
  const stack: SyntaxNode[] = [body];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node !== body && FUNCTION_TYPES.has(node.type)) continue;
    if (node.type === 'variable_declaration' && declarationBindsUndefined(node)) return true;
    if (
      node.type === 'for_in_statement' &&
      node.childForFieldName('kind')?.text === 'var' &&
      bindsUndefined(node.childForFieldName('left'))
    )
      return true;
    for (const child of node.namedChildren) stack.push(child);
  }
  return false;
}

/** A declaration statement directly inside a block that binds `undefined` there. */
function statementBindsUndefined(statement: SyntaxNode): boolean {
  switch (statement.type) {
    case 'lexical_declaration':
      return declarationBindsUndefined(statement);
    case 'function_declaration':
    case 'generator_function_declaration':
    case 'class_declaration': {
      const name = statement.childForFieldName('name');
      return name !== null && isUndefinedName(name);
    }
    case 'export_statement': {
      const declaration = statement.childForFieldName('declaration');
      return declaration !== null && statementBindsUndefined(declaration);
    }
    case 'import_statement': {
      const clause = statement.namedChildren.find((child) => child.type === 'import_clause');
      if (clause === undefined) return false;
      return clause.namedChildren.some((part) => {
        if (part.type === 'identifier') return isUndefinedName(part);
        if (part.type === 'namespace_import') return part.namedChildren.some(isUndefinedName);
        return part.namedChildren.some((specifier) => {
          const local = specifier.childForFieldName('alias') ?? specifier.childForFieldName('name');
          return specifier.type === 'import_specifier' && local !== null && isUndefinedName(local);
        });
      });
    }
    default:
      return false;
  }
}

/** True when `scope` binds `undefined` for code inside its `child`. */
function scopeBindsUndefined(scope: SyntaxNode, child: SyntaxNode): boolean {
  if (FUNCTION_TYPES.has(scope.type)) {
    const parameters =
      scope.childForFieldName('parameters') ?? scope.childForFieldName('parameter');
    if (bindsUndefined(parameters)) return true;
    // A named function expression binds its name only inside itself.
    const name = scope.childForFieldName('name');
    if (
      name !== null &&
      isUndefinedName(name) &&
      (scope.type === 'function_expression' ||
        scope.type === 'function' ||
        scope.type === 'generator_function')
    )
      return true;
    const body = scope.childForFieldName('body');
    return body !== null && hoistsUndefined(body);
  }
  switch (scope.type) {
    case 'catch_clause':
      return child.id === scope.childForFieldName('body')?.id
        ? bindsUndefined(scope.childForFieldName('parameter'))
        : false;
    case 'for_statement': {
      const initializer = scope.childForFieldName('initializer');
      return initializer?.type === 'lexical_declaration' && declarationBindsUndefined(initializer);
    }
    case 'for_in_statement': {
      const kind = scope.childForFieldName('kind')?.text;
      return (kind === 'let' || kind === 'const') &&
        child.id !== scope.childForFieldName('right')?.id
        ? bindsUndefined(scope.childForFieldName('left'))
        : false;
    }
  }
  if (BLOCK_TYPES.has(scope.type)) {
    if (scope.namedChildren.some(statementBindsUndefined)) return true;
    // At module level `var` reaches the program scope.
    return scope.type === 'program' && hoistsUndefined(scope);
  }
  return false;
}

/**
 * True when a nullish-ternary match must be dropped: its `undefined` arm reads
 * a local binding rather than the global value. A `null` arm always passes.
 */
export function isShadowedUndefinedArm(arm: SyntaxNode | undefined): boolean {
  if (arm === undefined || arm.type !== 'undefined') return false;
  for (let child = arm, scope = arm.parent; scope !== null; child = scope, scope = scope.parent) {
    if (scopeBindsUndefined(scope, child)) return true;
  }
  return false;
}
