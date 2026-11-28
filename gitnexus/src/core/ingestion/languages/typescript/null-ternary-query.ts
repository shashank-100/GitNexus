/**
 * Null ternary type bindings (`const u = c ? new User() : null`), shared by the
 * JavaScript and TypeScript scope queries.
 *
 * Six patterns: the value arm is a constructor, a call or an identifier, and
 * the other arm is `null`, in either position. `null` adds no receiver type, so
 * the value arm's binding holds. Two value arms do not establish one receiver
 * type, so they are not matched.
 *
 * Only `null`, never `undefined`: `null` is a reserved literal, while
 * `undefined` is an ordinary name that a parameter, declaration, import or
 * class can bind, and then the arm may hold another receiver.
 */
export function nullTernaryQuery(): string {
  const nullArm = '(null)';
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
        [value, nullArm],
        [nullArm, value],
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
