/**
 * Null ternary initializers: `const s = c ? new Svc() : null`.
 *
 * A `null` arm adds no receiver type, so the variable is bound to the value
 * arm, in either position and for constructor, call, member-call and
 * identifier arms.
 *
 * `undefined` is not treated as nullish: it is an ordinary name, and a
 * parameter or local named `undefined` can hold another receiver. Such arms
 * stay unbound, as do two value arms.
 *
 * Every receiver class has a same-named `ping`, so a call that resolves by
 * name alone, or to the wrong arm, shows up as a wrong or extra target.
 */
import { describe, it, expect } from 'vitest';
import { getRelationships, useFixture } from './helpers.js';

const TS_CLASSES = `export class Svc {
  ping(): void {}
  next(): Svc { return new Svc(); }
}
export class Other {
  ping(): void {}
}
`;

const TS_USE = `import { Svc, Other } from './svc';

export function makeSvc(): Svc { return new Svc(); }

export function ctorOrNull(c: boolean) { const s = c ? new Svc() : null; s?.ping(); }
export function nullOrCtor(c: boolean) { const s = c ? null : new Svc(); s?.ping(); }
export function callOrNull(c: boolean) { let s = c ? makeSvc() : null; s?.ping(); }
export function nullOrMemberCall(c: boolean, x: Svc) { const s = c ? null : x.next(); s?.ping(); }
export function identOrNull(c: boolean, x: Svc) { var s = c ? x : null; s?.ping(); }

export function ctorOrUndefined(c: boolean) { const s = c ? new Svc() : undefined; s?.ping(); }
export function shadowedUndefined(c: boolean, undefined: Other) {
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function twoValueArms(c: boolean) { const s = c ? new Svc() : new Other(); s.ping(); }
`;

const JS_CLASSES = `export class Svc {
  ping() {}
}
export class Other {
  ping() {}
}
`;

const JS_USE = `import { Svc, Other } from './svc.js';

export function ctorOrNull(c) { const s = c ? new Svc() : null; s.ping(); }
export function nullOrCtor(c) { const s = c ? null : new Svc(); s.ping(); }
export function identOrNull(c) { const x = new Svc(); let s = c ? x : null; s.ping(); }

export function ctorOrUndefined(c) { const s = c ? new Svc() : undefined; s.ping(); }
export function shadowedUndefined(c, undefined) {
  const s = c ? new Svc() : undefined;
  s.ping();
}
export function twoValueArms(c) { const s = c ? new Svc() : new Other(); s.ping(); }
`;

describe.each([
  {
    lang: 'TypeScript',
    files: { 'svc.ts': TS_CLASSES, 'use.ts': TS_USE },
    resolved: ['ctorOrNull', 'nullOrCtor', 'callOrNull', 'nullOrMemberCall', 'identOrNull'],
  },
  {
    lang: 'JavaScript',
    files: { 'svc.js': JS_CLASSES, 'use.js': JS_USE },
    resolved: ['ctorOrNull', 'nullOrCtor', 'identOrNull'],
  },
])('$lang null ternary initializers', ({ lang, files, resolved }) => {
  const result = useFixture(`null-ternary-${lang.toLowerCase()}`, files);
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

  it.each(['ctorOrUndefined', 'shadowedUndefined', 'twoValueArms'])(
    '%s: an undefined or second value arm does not establish one receiver type',
    (caller) => {
      expect(pingOwners(caller)).toEqual([]);
    },
  );
});
