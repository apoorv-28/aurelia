import { hasMultipleBindings } from '@aurelia/jit-html'
import { assert } from '@aurelia/testing';

describe.skip('has-multi-bindings.spec.ts', function() {
  type IHasMultipleBindingParserTestCase = [/* attr value */string, /* has multiple bindings? */boolean];

  const testCases: IHasMultipleBindingParserTestCase[] = [
    ['color', false],
    ['${c}', false],
    ['http\\://abc.def', false],
    ['1111', false],
    ['1.11', false],
    ['${a | b:{c:b}}', false],
    ['${a & b:{c:b}}', false],
    ['${a & b:{c:b}} ${a & b:{c:b}}', false],
    ['a:b', true],
    ['a:a;b: b', true],
    ['a:1;b: 2', true],
    ['a.bind:1;b: 2', true],
    ['a:1; b.bind: 2', true],
    ['a:1 | c:d; b.bind: 2', true],
    ['a.bind:1 | c:d; b.bind: 2', true],
    ['a: ${a | c:d} abcd; b.bind: 2', true],
    ['a: http\\:/ahbc.def; b.bind: 2', true],
    ['a-a.bind: bcd; b-b5.bind: 2', true],
  ];

  for (const testCase of testCases) {
    const [attrValue, isMultiple] = testCase;
    it(`detects multiple bindings on ${attrValue} (${isMultiple}) correctly`, function() {
      assert.strictEqual(hasMultipleBindings(attrValue), isMultiple, ``);
    });
  }
});
