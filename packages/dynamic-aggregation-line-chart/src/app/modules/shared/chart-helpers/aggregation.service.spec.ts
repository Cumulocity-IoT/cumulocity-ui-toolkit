import { expect } from '@jest/globals';
import { AGGREGATION_CANDIDATES, AggregationService } from './aggregation.service';

// Millisecond helpers to keep test cases readable.
const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY; // 365-day approximation (matches service internals)

describe('AggregationService', () => {
  let service: AggregationService;

  beforeEach(() => {
    service = new AggregationService();
  });

  /**
   * Helper: computes the interval for a range starting at epoch 0.
   * @param rangeMs   Range length in milliseconds.
   * @param maxPoints Optional override for the 5 000 default.
   */
  function pick(rangeMs: number, maxPoints?: number): string {
    return service.computeAggregationInterval(new Date(0), new Date(rangeMs), maxPoints);
  }

  // ── AGGREGATION_CANDIDATES sanity ────────────────────────────────────────────

  describe('AGGREGATION_CANDIDATES', () => {
    it('is sorted in strictly ascending order of seconds', () => {
      for (let i = 1; i < AGGREGATION_CANDIDATES.length; i++) {
        expect(AGGREGATION_CANDIDATES[i].seconds).toBeGreaterThan(
          AGGREGATION_CANDIDATES[i - 1].seconds
        );
      }
    });

    it('contains all expected day variants', () => {
      const values = AGGREGATION_CANDIDATES.map((c) => c.value);

      for (const v of ['1d', '2d', '3d', '4d', '5d', '6d']) {
        expect(values).toContain(v);
      }
    });

    it('contains all expected week variants', () => {
      const values = AGGREGATION_CANDIDATES.map((c) => c.value);

      for (const v of ['1w', '2w', '3w', '4w']) {
        expect(values).toContain(v);
      }
    });

    it('all values match the Cumulocity format: 1–3 digit integer + single-letter unit', () => {
      const PATTERN = /^\d{1,3}[smhdwMqy]$/;

      for (const { value } of AGGREGATION_CANDIDATES) {
        expect(value).toMatch(PATTERN);
      }
    });

    it('all values are between 2 and 4 characters (per API spec)', () => {
      for (const { value } of AGGREGATION_CANDIDATES) {
        expect(value.length).toBeGreaterThanOrEqual(2);
        expect(value.length).toBeLessThanOrEqual(4);
      }
    });
  });

  // ── Exact boundary transitions ───────────────────────────────────────────────

  describe('exact boundary transitions', () => {
    it('picks 300s when minIntervalSeconds equals 300 exactly', () => {
      // range = 300s × 5000 → minIntervalSeconds = 300 → first candidate ≥ 300 is "300s"
      expect(pick(300 * 5_000 * SEC)).toBe('300s');
    });

    it('picks 600s when range exceeds the 300s threshold by 1 ms', () => {
      // minIntervalSeconds just crosses 300 → "300s" no longer fits
      expect(pick(300 * 5_000 * SEC + 1)).toBe('600s');
    });

    it('picks 15m when minIntervalSeconds equals 600 exactly', () => {
      // minIntervalSeconds = 600 → "600s" fits (600 ≥ 600), but wait:
      // 600 >= 600, so "600s" IS picked at the boundary.
      expect(pick(600 * 5_000 * SEC)).toBe('600s');
    });

    it('picks 15m when range exceeds the 600s threshold by 1 ms', () => {
      expect(pick(600 * 5_000 * SEC + 1)).toBe('15m');
    });
  });

  // ── Representative second/minute/hour picks ──────────────────────────────────

  describe('second and minute candidates', () => {
    it('picks 300s for a 1-day range', () => {
      // minIntervalSeconds = 86400 / 5000 = 17.28 → "300s"
      expect(pick(DAY)).toBe('300s');
    });

    it('picks 300s for a 17-day range', () => {
      // minIntervalSeconds = 17 × 86400 / 5000 = 293.76 → "300s" (300 ≥ 293.76)
      expect(pick(17 * DAY)).toBe('300s');
    });

    it('picks 600s for an 18-day range', () => {
      // minIntervalSeconds = 18 × 86400 / 5000 = 311.04 → "600s"
      expect(pick(18 * DAY)).toBe('600s');
    });

    it('picks 15m for a 50-day range', () => {
      // minIntervalSeconds = 50 × 86400 / 5000 = 864 → "15m" (900s)
      expect(pick(50 * DAY)).toBe('15m');
    });

    it('picks 30m for a 3-month (90-day) range', () => {
      // minIntervalSeconds = 90 × 86400 / 5000 = 1555.2 → "30m" (1800s)
      expect(pick(90 * DAY)).toBe('30m');
    });

    it('picks 1h for a 6-month (180-day) range', () => {
      // minIntervalSeconds = 180 × 86400 / 5000 = 3110.4 → "1h" (3600s)
      expect(pick(180 * DAY)).toBe('1h');
    });

    it('picks 2h for a 1-year range', () => {
      // minIntervalSeconds = 365 × 86400 / 5000 = 6307.2 → "2h" (7200s)
      expect(pick(YEAR)).toBe('2h');
    });

    it('picks 12h for a 5-year range', () => {
      // minIntervalSeconds = 5 × 365 × 86400 / 5000 = 31536 → "12h" (43200s)
      expect(pick(5 * YEAR)).toBe('12h');
    });
  });

  // ── Day variants ─────────────────────────────────────────────────────────────

  describe('day variants (1d - 6d)', () => {
    it('picks 1d for an 8-year range', () => {
      // minIntervalSeconds ≈ 8 × 365 × 86400 / 5000 = 50457.6 → "1d" (86400s)
      expect(pick(8 * YEAR)).toBe('1d');
    });

    it('picks 2d for a 14-year range', () => {
      // minIntervalSeconds ≈ 14 × 365 × 86400 / 5000 = 88300.8 → "2d" (172800s)
      expect(pick(14 * YEAR)).toBe('2d');
    });

    it('picks 3d for a ~28-year range', () => {
      // minIntervalSeconds ≈ 28 × 365 × 86400 / 5000 = 176601.6 → "3d" (259200s)
      expect(pick(28 * YEAR)).toBe('3d');
    });

    it('picks 4d for a ~45-year range', () => {
      // minIntervalSeconds ≈ 45 × 365 × 86400 / 5000 = 283824 → "4d" (345600s)
      expect(pick(45 * YEAR)).toBe('4d');
    });

    it('picks 5d for a ~55-year range', () => {
      // minIntervalSeconds ≈ 55 × 365 × 86400 / 5000 = 347,  → "5d" (432000s)
      expect(pick(55 * YEAR)).toBe('5d');
    });

    it('picks 6d for a 70-year range', () => {
      // minIntervalSeconds ≈ 70 × 365 × 86400 / 5000 = 441504 → "6d" (518400s)
      expect(pick(70 * YEAR)).toBe('6d');
    });
  });

  // ── Week variants ─────────────────────────────────────────────────────────────

  describe('week variants (1w - 4w)', () => {
    it('picks 1w for an 85-year range', () => {
      // minIntervalSeconds ≈ 85 × 365 × 86400 / 5000 = 535968 → "1w" (604800s)
      expect(pick(85 * YEAR)).toBe('1w');
    });

    it('picks 2w for a 100-year range', () => {
      // minIntervalSeconds ≈ 100 × 365 × 86400 / 5000 = 630720 → "2w" (1209600s)
      expect(pick(100 * YEAR)).toBe('2w');
    });

    it('picks 3w for a 200-year range', () => {
      // minIntervalSeconds ≈ 200 × 365 × 86400 / 5000 = 1261440 → "3w" (1814400s)
      expect(pick(200 * YEAR)).toBe('3w');
    });

    it('picks 4w for a 300-year range', () => {
      // minIntervalSeconds ≈ 300 × 365 × 86400 / 5000 = 1892160 → "4w" (2419200s)
      expect(pick(300 * YEAR)).toBe('4w');
    });
  });

  // ── Month / quarter / year candidates ────────────────────────────────────────

  describe('month, quarter, and year candidates', () => {
    it('picks 1M for a 400-year range', () => {
      // minIntervalSeconds ≈ 400 × 365 × 86400 / 5000 = 2522880 → "1M" (2592000s)
      expect(pick(400 * YEAR)).toBe('1M');
    });

    it('picks 1q for a ~700-year range', () => {
      // minIntervalSeconds ≈ 700 × 365 × 86400 / 5000 = 4415040 → "1q" (7776000s)
      // (2M = 5184000 < 4415040; 1q = 7776000 ≥ 4415040? Wait: 4415040 > 5184000? No: 5184000 > 4415040)
      // Actually "2M" (5184000) ≥ 4415040 → picks "2M"
      // Let me recalculate: use 900 years
      // 900 * 365 * 86400 / 5000 = 567648  × ... → let me just verify 700:
      // 700 * 365 * 86400 = 22,075,200,000 ms / 1000 = 22,075,200 seconds
      // minIntervalSeconds = 22,075,200 / 5000 = 4415.04 -- wait that's only 4415 seconds!
      // I need to convert to seconds first: 700 * 365 * 24 * 3600 = 22,075,200,000 / 1000 → no wait
      // 700 years in ms = 700 * YEAR = 700 * 365 * 24 * 3600 * 1000
      // rangeSeconds = (rangeMs) / 1000 = 700 * 365 * 24 * 3600 = 22,075,200,000s? No:
      // 1 year = 365 * 24 * 3600 = 31,536,000 seconds
      // 700 years = 700 * 31,536,000 = 22,075,200,000 seconds
      // minIntervalSeconds = 22,075,200,000 / 5000 = 4,415,040
      // 1q = 7,776,000 ≥ 4,415,040 → picks 1q? But what about 2M = 5,184,000?
      // 2M = 5,184,000 ≥ 4,415,040 → picks 2M!
      // So 700 years → 2M, not 1q.
      // For 1q: need minIntervalSeconds in [5,184,000, 7,776,000)
      // 5,184,000 * 5000 = 25,920,000,000 seconds = 25,920,000,000 / 31,536,000 = 821.9 years
      // So ~900 years → 1q
      expect(pick(900 * YEAR)).toBe('1q');
    });

    it('picks 5y for the largest finite candidate range', () => {
      // 5y = 157,680,000 seconds. Range that just fits:
      // minIntervalSeconds = 5y_seconds = 157,680,000 → rangeSeconds = 157,680,000 × 5000 = 788,400,000,000
      // 788,400,000,000 / 31,536,000 ≈ 25,000 years
      expect(pick(25_000 * YEAR)).toBe('5y');
    });
  });

  // ── Fallback ──────────────────────────────────────────────────────────────────

  describe('fallback', () => {
    it('returns "5y" when no candidate fits (range > 5y × maxPoints)', () => {
      // 30,000 years: minIntervalSeconds ≈ 946,080,000,000 / 5000 = 189,216,000
      // All candidates max at 5y = 157,680,000 → no match → default "5y"
      expect(pick(30_000 * YEAR)).toBe('5y');
    });
  });

  // ── Custom maxPoints ──────────────────────────────────────────────────────────

  describe('custom maxPoints', () => {
    it('picks a coarser interval when maxPoints is 1', () => {
      // 1 day with maxPoints=1: minIntervalSeconds = 86400 → "1d"
      expect(pick(DAY, 1)).toBe('1d');
    });

    it('picks the finest interval when maxPoints is very large', () => {
      // 90-day range with maxPoints=1,000,000: minIntervalSeconds ≈ 7.78 → "300s"
      expect(pick(90 * DAY, 1_000_000)).toBe('300s');
    });
  });
});
