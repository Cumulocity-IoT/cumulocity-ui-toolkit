import {
  ALARM_SEVERITIES,
  type AlarmCounts,
  type AlarmSeverityKey,
} from '../../services/asset-store/asset-store.model';

/**
 * The status dot's vocabulary — the one place the fleet's colour language is defined.
 *
 * `ok` is "nothing wrong that we know of", `gone` is "no longer in the fleet" (a pinned or
 * recent entry whose asset has disappeared), and the four alarm severities are the platform's
 * own. Deliberately not a subset of `AlarmSeverityKey`: the dot has to say things an alarm
 * severity cannot.
 */
export type DotSeverity = AlarmSeverityKey | 'ok' | 'gone';

/** Worst active severity in a set of counts, or `null` when they are all zero. */
export function worstSeverity(alarms: AlarmCounts | undefined): AlarmSeverityKey | null {
  if (!alarms) return null;

  // ALARM_SEVERITIES is ordered worst-first, which is exactly the precedence wanted here.
  return ALARM_SEVERITIES.find((severity) => alarms[severity] > 0) ?? null;
}

/**
 * The same counts with every unselected severity zeroed, so "worst" can be asked of a subset.
 *
 * This is what stops a severity-filtered list contradicting itself: filtering by *Minor* on an
 * asset that also has a critical alarm produced a red dot, which is true of the asset but not of
 * the match, and made the row look like it matched on critical. Scoping the counts first keeps
 * {@link worstSeverity} honest — it still answers "worst of what it was given".
 *
 * An empty selection means "no filter", so the counts pass through unchanged.
 */
export function scopeAlarms(
  alarms: AlarmCounts,
  severities: readonly AlarmSeverityKey[]
): AlarmCounts {
  if (severities.length === 0) return alarms;

  return ALARM_SEVERITIES.reduce<AlarmCounts>(
    (counts, severity) => ({
      ...counts,
      [severity]: severities.includes(severity) ? alarms[severity] : 0,
    }),
    { critical: 0, major: 0, minor: 0, warning: 0 }
  );
}

/** Total across all four severities. */
export function totalAlarms(alarms: AlarmCounts): number {
  return ALARM_SEVERITIES.reduce((total, severity) => total + alarms[severity], 0);
}

/**
 * The dot's meaning in words, for `title` and `aria-label`.
 *
 * Not decoration: the dot encodes severity as colour and availability as its fill, and colour
 * alone is not an accessible channel (NFR-T3). Anything rendering a dot owes a reader this
 * sentence.
 */
export function describeDot(input: {
  alarms?: AlarmCounts;
  unavailableCount?: number;
  deratedCount?: number;
}): string {
  const parts: string[] = [];
  const counts = input.alarms;
  const worst = worstSeverity(counts);

  if (worst && counts) {
    parts.push(
      ALARM_SEVERITIES.filter((severity) => counts[severity] > 0)
        .map((severity) => `${counts[severity]} ${severity}`)
        .join(', ')
    );
  } else {
    parts.push('No active alarms');
  }

  if (input.unavailableCount) parts.push(`${input.unavailableCount} unavailable`);
  if (input.deratedCount) parts.push(`${input.deratedCount} derated`);

  return parts.join(' · ');
}
