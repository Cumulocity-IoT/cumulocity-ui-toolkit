import { QueriesUtil } from '@c8y/client';
import { isEqual } from 'lodash';
import { ReverseQueriesUtil } from './reverse-queries-util';

describe('ReverseQueriesUtil.buildQueryJSON roundtrip with QueriesUtil', () => {
  const queriesUtil = new QueriesUtil();
  const reverseUtil = new ReverseQueriesUtil();

  const cases: { name: string; json: unknown }[] = [
    { name: 'simple eq', json: { name: 'Bob' } },
    { name: 'comparison operator __gt', json: { age: { __gt: 30 } } },
    { name: 'comparison operator __ge', json: { age: { __ge: 30 } } },
    { name: 'comparison operator __lt', json: { price: { __lt: 20 } } },
    { name: 'comparison operator __le', json: { age: { __le: 100 } } },
    { name: 'and operator', json: { __and: [{ type: 'c8y_Device' }, { status: 'active' }] } },
    { name: 'or operator', json: { __or: [{ model: 'X' }, { model: 'Y' }] } },
    { name: 'not operator', json: { __not: { has: 'c8y_IsDevice' } } },
    { name: 'has fragment', json: { __has: 'c8y_IsDevice' } },
    { name: 'bygroupid', json: { __bygroupid: 123 } },
    {
      name: 'nested and/or/not',
      json: {
        __and: [
          { type: 'c8y_Device' },
          {
            __or: [{ id: 1 }, { __not: { name: 'ignore' } }],
          },
        ],
      },
    },
    {
      name: 'complex case',
      json: {
        __and: [
          { name: 'My Device' },
          {
            creationTime: {
              __lt: '2015-11-30T13:28:123Z',
            },
          },
          {
            'c8y_ActiveAlarmsStatus.critical': {
              __gt: 0,
            },
          },
          {
            __or: [
              { __not: { __has: 'c8y_ActiveAlarmsStatus.major' } },
              {
                __or: [{ __bygroupid: 10300 }, { __bygroupid: 10400 }],
              },
            ],
          },
        ],
      },
    },
  ];

  cases.forEach(({ name, json }) => {
    it(`should convert query string back to original JSON (${name})`, () => {
      const queryString = queriesUtil.buildQuery(json);

      expect(queryString).not.toBe(null);

      const parsed = reverseUtil.buildQueryJSON(queryString);

      expect(parsed).not.toBe(null);

      const equal = isEqual(parsed, json);

      expect(equal).toBe(true);
    });
  });
});
