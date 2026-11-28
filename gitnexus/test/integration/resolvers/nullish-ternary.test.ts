/**
 * Nullish ternary initializers: `const s = c ? new Svc() : null`.
 *
 * A `null` / global `undefined` arm adds no receiver type, so the variable is
 * bound to the value arm. `undefined` is a name, not a literal: when a
 * parameter or local named `undefined` holds another receiver, the arm is not
 * nullish and the value arm alone must not type the variable.
 *
 * Every binding form counts: parameters (with defaults or destructured), `const`,
 * destructuring, `for (var … of …)`, which hoists past its loop, and imports.
 * Names that bind nothing do not: an export specifier, `typeof undefined`, a
 * named function expression seen from outside it, or a binding in another
 * function.
 *
 * Every receiver class has a same-named `ping`, so a call that resolves by
 * name alone, or to the wrong arm, shows up as a wrong or extra target.
 */
import { describe, it, expect } from 'vitest';
import { getRelationships, useFixture } from './helpers.js';

const CLASSES = `export class Svc {
  ping() {}
}
export class Other {
  ping() {}
}
`;

const TS_USE = `import { Svc, Other } from './svc';

export function makeSvc(): Svc { return new Svc(); }

export function ctorOrNull(c: boolean) { const s = c ? new Svc() : null; s?.ping(); }
export function nullOrCtor(c: boolean) { const s = c ? null : new Svc(); s?.ping(); }
export function ctorOrUndefined(c: boolean) { const s = c ? new Svc() : undefined; s?.ping(); }
export function undefinedOrCall(c: boolean) { let s = c ? undefined : makeSvc(); s?.ping(); }
export function memberCallOrNull(c: boolean, x: Svc) { const s = c ? x.next() : null; s?.ping(); }
export function identOrNull(c: boolean, x: Svc) { var s = c ? x : null; s?.ping(); }

export function shadowedParamAfter(c: boolean, undefined: Other) {
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedParamBefore(c: boolean, undefined: Other) {
  const s = c ? undefined : new Svc();
  s.ping();
}
export function shadowedLocal(c: boolean) {
  const undefined = new Other();
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedDefaultParam(c: boolean, undefined: Other = new Other()) {
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedArrayPattern(c: boolean) {
  const [undefined] = [new Other()];
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedPairPattern(c: boolean) {
  const { a: undefined } = { a: new Other() };
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedForVar(c: boolean, xs: Other[]) {
  for (var undefined of xs) {}
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function besideNamedFunctionExpression(c: boolean) {
  const g = function undefined() {};
  const s = c ? new Svc() : undefined;
  s?.ping();
}
export function ownUndefined(undefined: Other) { return undefined; }
export function globalBesideShadow(c: boolean) { const s = c ? new Svc() : undefined; s?.ping(); }
export function twoValueArms(c: boolean) { const s = c ? new Svc() : new Other(); s.ping(); }
`;

// Module-level names: an import binds `undefined` for the whole file; an
// export specifier and a type query bind nothing.
const TS_IMPORT_SHADOW = `import { Svc, Other as undefined } from './svc';
export function shadowedByImport(c: boolean) { const s = c ? new Svc() : undefined; s.ping(); }
`;
const TS_EXPORT_NAME = `import { Svc } from './svc';
const x = 1;
export { x as undefined };
export type T = typeof undefined;
export function besideExportSpecifier(c: boolean) { const s = c ? new Svc() : undefined; s?.ping(); }
`;

const JS_USE = `import { Svc, Other } from './svc.js';

export function ctorOrNull(c) { const s = c ? new Svc() : null; s.ping(); }
export function nullOrCtor(c) { const s = c ? null : new Svc(); s.ping(); }
export function ctorOrUndefined(c) { const s = c ? new Svc() : undefined; s.ping(); }
export function undefinedOrIdent(c) { const x = new Svc(); let s = c ? undefined : x; s.ping(); }

export function shadowedParamAfter(c, undefined) {
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedParamBefore(c, undefined) {
  const s = c ? undefined : new Svc();
  s.ping();
}
export function shadowedLocal(c) {
  const undefined = new Other();
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedDefaultParam(c, undefined = new Other()) {
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedArrayPattern(c) {
  const [undefined] = [new Other()];
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedPairPattern(c) {
  const { a: undefined } = { a: new Other() };
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function shadowedForVar(c, xs) {
  for (var undefined of xs) {}
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function besideNamedFunctionExpression(c) {
  const g = function undefined() {};
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function ownUndefined(undefined) { return undefined; }
export function globalBesideShadow(c) { const s = c ? new Svc() : undefined; s.ping(); }
export function twoValueArms(c) { const s = c ? new Svc() : new Other(); s.ping(); }
`;

const JS_IMPORT_SHADOW = `import { Svc, Other as undefined } from './svc.js';
export function shadowedByImport(c) { const s = c ? new Svc() : undefined; s.ping(); }
`;
const JS_EXPORT_NAME = `import { Svc } from './svc.js';
const x = 1;
export { x as undefined };
export function besideExportSpecifier(c) { const s = c ? new Svc() : undefined; s.ping(); }
`;

const SHADOWED = [
  'shadowedParamAfter',
  'shadowedParamBefore',
  'shadowedLocal',
  'shadowedDefaultParam',
  'shadowedArrayPattern',
  'shadowedPairPattern',
  'shadowedForVar',
  'shadowedByImport',
];

describe.each([
  {
    lang: 'TypeScript',
    files: {
      'svc.ts': CLASSES.replace(
        'ping() {}\n}',
        'ping() {}\n  next(): Svc { return new Svc(); }\n}',
      ),
      'use.ts': TS_USE,
      'import-shadow.ts': TS_IMPORT_SHADOW,
      'export-name.ts': TS_EXPORT_NAME,
    },
    resolved: [
      'ctorOrNull',
      'nullOrCtor',
      'ctorOrUndefined',
      'undefinedOrCall',
      'memberCallOrNull',
      'identOrNull',
      'globalBesideShadow',
      'besideNamedFunctionExpression',
      'besideExportSpecifier',
    ],
  },
  {
    lang: 'JavaScript',
    files: {
      'svc.js': CLASSES,
      'use.js': JS_USE,
      'import-shadow.js': JS_IMPORT_SHADOW,
      'export-name.js': JS_EXPORT_NAME,
    },
    resolved: [
      'ctorOrNull',
      'nullOrCtor',
      'ctorOrUndefined',
      'undefinedOrIdent',
      'globalBesideShadow',
      'besideNamedFunctionExpression',
      'besideExportSpecifier',
    ],
  },
])('$lang nullish ternary initializers', ({ lang, files, resolved }) => {
  const result = useFixture(`nullish-ternary-${lang.toLowerCase()}`, files);
  const pingOwners = (caller: string) =>
    getRelationships(result(), 'CALLS')
      .filter((r) => r.source === caller && r.target === 'ping')
      .map((r) => r.rel.targetId)
      .sort();

  it.each(resolved)('%s binds the value arm and calls Svc.ping only', (caller) => {
    const owners = pingOwners(caller);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toContain('Svc.ping');
  });

  it.each(SHADOWED)('%s: a local named undefined is not a nullish arm', (caller) => {
    // Either arm may be the receiver, so the value arm alone must not link.
    expect(pingOwners(caller)).toEqual([]);
  });

  it('two value arms do not establish one receiver type', () => {
    expect(pingOwners('twoValueArms')).toEqual([]);
  });
});
