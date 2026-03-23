import { extractPlaceholdersFromObject } from './extract-placeholders';

describe('extractPlaceholdersFromObject', () => {
  it('extracts templates with paths from nested objects and arrays in encounter order', () => {
    const obj = {
      deviceId: '123',
      op: { example: '{{test}}', nested: 'value-{{a}}-{{b}}' },
      arr: ['no-template', '{{arr1}}', { deep: '{{deep_val}} and {{arr1}}' }],
    };

    const result = extractPlaceholdersFromObject(obj as unknown);

    expect(result).toEqual([
      { key: 'test', path: 'op.example' },
      { key: 'a', path: 'op.nested' },
      { key: 'b', path: 'op.nested' },
      { key: 'arr1', path: 'arr[1]' },
      { key: 'deep_val', path: 'arr[2].deep' },
    ]);
  });

  it('returns empty array when no templates are present', () => {
    expect(extractPlaceholdersFromObject({ a: 'x', b: [1, 2], c: { d: null } })).toEqual([]);
  });

  it('handles multiple occurrences and trims whitespace', () => {
    const obj = { s: 'prefix {{  spaced  }} suffix {{spaced}} {{other}}' };

    const result = extractPlaceholdersFromObject(obj);

    expect(result).toEqual([
      { key: 'spaced', path: 's' },
      { key: 'other', path: 's' },
    ]);
  });

  it('handles non-string primitives safely', () => {
    const obj = { n: 42, bool: true, nested: { s: '{{x}}' } };

    expect(extractPlaceholdersFromObject(obj)).toEqual([{ key: 'x', path: 'nested.s' }]);
  });
});
