/**
 * Nullish ternary initializers: `const s = c ? new Svc() : null`.
 *
 * A `null` / global `undefined` arm adds no receiver type, so the variable is
 * bound to the value arm. `undefined` is a name, not a literal: when a
 * parameter or local named `undefined` holds another receiver, the arm is not
 * nullish and the value arm alone must not type the variable.
 *
 * A binding of `undefined` in another function leaves this one's global arm alone.
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
export function ownUndefined(undefined: Other) { return undefined; }
export function globalBesideShadow(c: boolean) { const s = c ? new Svc() : undefined; s?.ping(); }
export function twoValueArms(c: boolean) { const s = c ? new Svc() : new Other(); s.ping(); }
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
export function ownUndefined(undefined) { return undefined; }
export function globalBesideShadow(c) { const s = c ? new Svc() : undefined; s.ping(); }
export function twoValueArms(c) { const s = c ? new Svc() : new Other(); s.ping(); }
`;

describe.each([
  {
    lang: 'TypeScript',
    files: {
      'svc.ts': CLASSES.replace(
        'ping() {}\n}',
        'ping() {}\n  next(): Svc { return new Svc(); }\n}',
      ),
      'use.ts': TS_USE,
    },
    resolved: [
      'ctorOrNull',
      'nullOrCtor',
      'ctorOrUndefined',
      'undefinedOrCall',
      'memberCallOrNull',
      'identOrNull',
      'globalBesideShadow',
    ],
  },
  {
    lang: 'JavaScript',
    files: { 'svc.js': CLASSES, 'use.js': JS_USE },
    resolved: [
      'ctorOrNull',
      'nullOrCtor',
      'ctorOrUndefined',
      'undefinedOrIdent',
      'globalBesideShadow',
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

  it.each(['shadowedParamAfter', 'shadowedParamBefore', 'shadowedLocal'])(
    '%s: a local named undefined is not a nullish arm',
    (caller) => {
      // Either arm may be the receiver, so the value arm alone must not link.
      expect(pingOwners(caller)).toEqual([]);
    },
  );

  it('two value arms do not establish one receiver type', () => {
    expect(pingOwners('twoValueArms')).toEqual([]);
  });
});
