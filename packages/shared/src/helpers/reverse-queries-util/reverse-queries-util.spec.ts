import { QueriesUtil } from '@c8y/client';
import { ReverseQueriesUtil } from '../helpers/reverse-queries-util/reverse-queries-util';

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
            __or: [{ id: 1 }, { id: { __ne: 2 } }, { __not: { name: 'ignore' } }],
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
});
