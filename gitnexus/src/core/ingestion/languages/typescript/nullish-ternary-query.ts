/**
 * Nullish ternary type bindings (`const u = c ? new User() : null`), shared by
 * the JavaScript and TypeScript scope queries. The emitters drop a match whose
 * `@nullish-arm` reads a local binding of `undefined` (see `nullish-arm.ts`).
 */

/**
 * Six patterns: the value arm is a constructor, a call or an identifier, and
 * the other arm is `null` / `undefined`, in either position. Two value arms do
 * not establish one receiver type, so they are not matched.
 */
export function nullishTernaryQuery(): string {
  const nullish = '[(null) (undefined)] @nullish-arm';
  const arms = [
    [
      `(new_expression
      constructor: [(identifier) (member_expression)] @type-binding.type)`,
      'constructor',
    ],
    [
      `(call_expression
      function: [(identifier) (member_expression)] @type-binding.type)`,
      'alias',
    ],
    ['(identifier) @type-binding.type', 'alias'],
  ] as const;
  return arms
    .flatMap(([value, anchor]) =>
      [
        [value, nullish],
        [nullish, value],
      ].map(
        ([consequence, alternative]) => `
(variable_declarator
  name: (identifier) @type-binding.name
  value: (ternary_expression
    consequence: ${consequence}
    alternative: ${alternative})) @type-binding.${anchor}
`,
      ),
    )
    .join('');
}
