import { describeDot, scopeAlarms, totalAlarms, worstSeverity } from './status-dot.model';
import type { AlarmCounts } from '../../services/asset-store/asset-store.model';

function counts(partial: Partial<AlarmCounts>): AlarmCounts {
  return { critical: 0, major: 0, minor: 0, warning: 0, ...partial };
}

describe('worstSeverity', () => {
  it('returns the worst non-zero severity, not the first present one', () => {
    expect(worstSeverity(counts({ warning: 5, critical: 1 }))).toBe('critical');
    expect(worstSeverity(counts({ minor: 9, major: 1 }))).toBe('major');
    expect(worstSeverity(counts({ warning: 2, minor: 1 }))).toBe('minor');
    expect(worstSeverity(counts({ warning: 2 }))).toBe('warning');
  });

  it('returns null for all-zero counts, which is what the platform leaves behind', () => {
    expect(worstSeverity(counts({}))).toBeNull();
  });

  it('returns null for absent counts', () => {
    expect(worstSeverity(undefined)).toBeNull();
  });
});

describe('describeDot', () => {
  it('spells out every non-zero severity worst-first — colour alone is not accessible', () => {
    expect(describeDot({ alarms: counts({ critical: 2, minor: 1 }) })).toBe('2 critical, 1 minor');
  });

  it('says so explicitly when nothing is wrong', () => {
    expect(describeDot({})).toBe('No active alarms');
    expect(describeDot({ alarms: counts({}) })).toBe('No active alarms');
  });

  it('appends availability, which the fill encodes and the colour cannot', () => {
    expect(
      describeDot({ alarms: counts({ critical: 1 }), unavailableCount: 3, deratedCount: 2 })
    ).toBe('1 critical · 3 unavailable · 2 derated');
  });

  it('describes an alarm-free but stopped subtree — the case a severity-only dot hides', () => {
    expect(describeDot({ unavailableCount: 1 })).toBe('No active alarms · 1 unavailable');
  });

  it('omits zero counts rather than saying "0 unavailable"', () => {
    expect(
      describeDot({ alarms: counts({ major: 1 }), unavailableCount: 0, deratedCount: 0 })
    ).toBe('1 major');
  });
});

describe('scopeAlarms', () => {
  it('zeroes the severities that were not selected, so the worst reflects the match', () => {
    // The reported bug: filtering by Minor coloured the dot red, because the asset also had a
    // critical alarm. Scoped, the same asset reads as minor.
    const alarms = counts({ critical: 2, minor: 4 });

    expect(worstSeverity(alarms)).toBe('critical');
    expect(worstSeverity(scopeAlarms(alarms, ['minor']))).toBe('minor');
    expect(scopeAlarms(alarms, ['minor'])).toEqual(counts({ minor: 4 }));
  });

  it('keeps the worst of several selected severities', () => {
    const alarms = counts({ critical: 1, major: 2, minor: 3 });

    expect(worstSeverity(scopeAlarms(alarms, ['minor', 'major']))).toBe('major');
  });

  it('passes the counts through untouched when nothing is selected', () => {
    const alarms = counts({ critical: 1, warning: 7 });

    expect(scopeAlarms(alarms, [])).toBe(alarms);
  });

  it('yields no severity when the asset has none of the selected ones', () => {
    // It cannot normally be rendered — such a row would not have matched the filter — but the
    // dot must not fall back to the asset's worst if it ever is.
    expect(worstSeverity(scopeAlarms(counts({ critical: 3 }), ['warning']))).toBeNull();
  });

  it('counts only the selected severities, so the number agrees with the colour', () => {
    const alarms = counts({ critical: 2, minor: 4 });

    expect(totalAlarms(alarms)).toBe(6);
    expect(totalAlarms(scopeAlarms(alarms, ['minor']))).toBe(4);
  });
});
