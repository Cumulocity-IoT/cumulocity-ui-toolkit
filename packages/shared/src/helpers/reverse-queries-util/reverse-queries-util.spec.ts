import { QueriesUtil } from '@c8y/client';
import { ReverseQueriesUtil } from './reverse-queries-util';

describe('ReverseQueriesUtil.toQueryJSON roundtrip with QueriesUtil', () => {
  const queriesUtil = new QueriesUtil();
  const reverseUtil = new ReverseQueriesUtil();

  const cases: { name: string; json: any }[] = [
    { name: 'simple eq', json: { name: 'Bob' } },
    { name: 'comparison operator __gt', json: { age: { __gt: 30 } } },
    { name: 'has fragment', json: { __has: 'c8y_Custom' } },
    { name: 'bygroupid', json: { __bygroupid: '123' } },
    {
      name: 'nested and/or/not',
      json: {
        __and: [
          { type: 'c8y_Device' },
          {
            // `__ne` is intentionally omitted: `QueriesUtil.buildQuery()` renders
            // it as `(__ne eq …)`, dropping the field name, so it cannot round-trip.
            __or: [{ id: 1 }, { __not: { name: 'ignore' } }],
          },
        ],
      },
    },
  ];

  cases.forEach(({ name, json }) => {
    it(`should convert query string back to original JSON (${name})`, () => {
      const queryString = queriesUtil.buildQuery(json);

      expect(queryString).toBeTruthy();
      const parsed = reverseUtil.buildQueryJSON(queryString);

      expect(parsed).toEqual(json);
    });
  });

  describe('unsupported operators', () => {
    it('should warn when an operator is used in place of a field name', () => {
      const warnSpy = spyOn(console, 'warn');

      reverseUtil.buildQueryJSON(queriesUtil.buildQuery({ id: { __ne: 2 } }));

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.calls.mostRecent().args[0]).toContain('__ne');
    });

    it('should not warn for a supported query', () => {
      const warnSpy = spyOn(console, 'warn');

      reverseUtil.buildQueryJSON(queriesUtil.buildQuery({ age: { __gt: 30 } }));

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not treat a fragment named like an operator as unsupported', () => {
      const warnSpy = spyOn(console, 'warn');

      const parsed = reverseUtil.buildQueryJSON(queriesUtil.buildQuery({ __has: 'c8y_Custom' }));

      expect(warnSpy).not.toHaveBeenCalled();
      expect(parsed).toEqual({ __has: 'c8y_Custom' });
    });
  });
});
