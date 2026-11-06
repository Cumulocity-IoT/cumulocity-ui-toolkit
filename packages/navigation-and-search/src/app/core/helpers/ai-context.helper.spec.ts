import { cappedList, cappedTail } from './ai-context.helper';

/**
 * Which end a projection caps from is a correctness question, not a style one: the agent must be
 * given the readings the user is looking at. `cappedTail` exists because the power curve's
 * selection list shows the most recent points, and capping from the front handed the assistant
 * the oldest ones instead.
 */
describe('cappedList', () => {
  it('keeps the first entries', () => {
    expect(cappedList([1, 2, 3, 4, 5], 3).items).toEqual([1, 2, 3]);
  });

  it('reports the whole collection, not the slice', () => {
    const capped = cappedList([1, 2, 3, 4, 5], 3);

    expect(capped.total).toBe(5);
    expect(capped.truncated).toBe(true);
  });

  it('is not truncated when everything fits', () => {
    expect(cappedList([1, 2], 3)).toEqual({ items: [1, 2], total: 2, truncated: false });
  });

  it('tolerates a missing list', () => {
    expect(cappedList(undefined, 3)).toEqual({ items: [], total: 0, truncated: false });
  });
});

describe('cappedTail', () => {
  it('keeps the last entries, in their original order', () => {
    expect(cappedTail([1, 2, 3, 4, 5], 3).items).toEqual([3, 4, 5]);
  });

  it('reports the whole collection, not the slice', () => {
    const capped = cappedTail([1, 2, 3, 4, 5], 3);

    expect(capped.total).toBe(5);
    expect(capped.truncated).toBe(true);
  });

  it('is not truncated when everything fits', () => {
    expect(cappedTail([1, 2], 3)).toEqual({ items: [1, 2], total: 2, truncated: false });
  });

  it('returns nothing for a limit of zero', () => {
    // `slice(-0)` is `slice(0)` — the whole list — which is the trap this guards.
    expect(cappedTail([1, 2, 3], 0).items).toEqual([]);
  });

  it('tolerates a missing list', () => {
    expect(cappedTail(null, 3)).toEqual({ items: [], total: 0, truncated: false });
  });

  it('takes the opposite end from cappedList', () => {
    const points = ['09:00', '10:00', '11:00', '12:00'];

    expect(cappedList(points, 2).items).toEqual(['09:00', '10:00']);
    expect(cappedTail(points, 2).items).toEqual(['11:00', '12:00']);
  });
});
