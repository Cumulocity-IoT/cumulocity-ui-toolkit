import { Injectable } from '@angular/core';
import uFuzzy from '@leeoniya/ufuzzy';
import type { SearchResult } from './search.model';

/**
 * Typo-tolerant ranking over a candidate set someone else selected.
 *
 * This is the seam between the candidate sources: in `prefetched` mode it sees the whole
 * corpus, in `passthrough` mode one platform page, and (later) in `indexed` mode the top
 * hits a microservice already ranked. Either way the ordering and the highlight ranges are
 * produced here, so there is exactly one definition of "what a good match looks like"
 * regardless of where the candidates came from.
 *
 * The platform cannot do any of this: no `like`, no regex, and exact equality is
 * case-sensitive, so a mistyped name never matches server-side.
 *
 * **Why this exists next to `~services/asset-store`'s MiniSearch index, deliberately.**
 * They answer different questions and neither subsumes the other. `asset-search.ts` builds
 * an *inverted index* because the tree re-filters up to 50k cached nodes on every
 * keystroke, where an index earns its keep. This ranks a supplied candidate set — often
 * ≤50 rows — where an index buys nothing, and it brings two things MiniSearch structurally
 * does not: transposition tolerance (`pmup` → `Pump`) and character offsets for the
 * `<mark>` ranges. The convergence path, if they ever should converge, is uFuzzy backing
 * `asset-search`'s subsequence pass — not a second index. See `docs/GlobalSearch/spec.md`.
 */
@Injectable({ providedIn: 'root' })
export class FuzzyService {
  private readonly matcher = new uFuzzy({
    // Single-error mode tolerates one mistake per term. Enabling transposition in
    // particular is what makes "pmup" find "Pump" — the most common way a name gets
    // mistyped, and something the platform can never match.
    intraMode: 1,
    intraIns: 1,
    intraSub: 1,
    intraTrn: 1,
    intraDel: 1,
  });

  /**
   * Ranks candidates against the term, best first, annotating matched ranges.
   * An empty term returns the candidates untouched.
   */
  rank(candidates: readonly SearchResult[], term: string): SearchResult[] {
    const needle = term.trim();

    if (needle.length === 0 || candidates.length === 0) {
      return [...candidates];
    }

    const haystack = candidates.map((candidate) => this.searchableText(candidate));
    const [indexes, info, order] = this.matcher.search(haystack, needle, 0, 1e5);

    if (!indexes || indexes.length === 0) {
      return [];
    }

    // Without `info`/`order` uFuzzy has skipped the expensive ranking pass, so fall back
    // to the raw match order rather than dropping results entirely.
    if (!info || !order) {
      return indexes
        .map((index) => candidates[index])
        .filter((candidate): candidate is SearchResult => candidate !== undefined);
    }

    const ranked: SearchResult[] = [];

    for (const position of order) {
      const candidate = candidates[info.idx[position]];

      if (!candidate) continue;
      ranked.push({
        ...candidate,
        highlights: this.toNameRanges(candidate, info.ranges[position]),
      });
    }

    return preferNumberIdentity(ranked, needle);
  }

  /**
   * Name, type and identifying keywords, followed by a separator-free copy of all of it.
   *
   * The collapsed copy exists because punctuation is a term boundary for the matcher.
   * Without it, someone typing a serial as `e101sn01` gets nothing back for `E101-SN-01` —
   * verified against a live tenant, where that was a real miss. Collapsing the whole
   * string rather than just the name is what makes serials and model numbers reachable
   * that way, not only names.
   *
   * Matches landing in the trailing copy produce offsets past the name, which
   * `toNameRanges` discards, so the synthetic text never leaks into the rendered label.
   */
  private searchableText(candidate: SearchResult): string {
    const base = `${candidate.name} ${candidate.type} ${candidate.keywords}`.trim();
    return `${base} ${base.replace(/[^A-Za-z0-9]+/g, '')}`;
  }

  /**
   * uFuzzy reports ranges as a flat [start, end, start, end, …] array over the whole
   * searchable string. Ranges at or past the end of the name belong to the type/keyword
   * suffix and are dropped, since only the name is highlighted.
   */
  private toNameRanges(
    candidate: SearchResult,
    flatRanges: number[] | undefined
  ): ReadonlyArray<readonly [number, number]> {
    if (!flatRanges) return [];

    const ranges: Array<readonly [number, number]> = [];
    const nameLength = candidate.name.length;

    for (let i = 0; i + 1 < flatRanges.length; i += 2) {
      const start = flatRanges[i];
      const end = flatRanges[i + 1];

      if (start === undefined || end === undefined || start >= nameLength) continue;
      ranges.push([start, Math.min(end, nameLength)] as const);
    }

    return ranges;
  }
}

/**
 * A typed bare number is an identity — "turbine 4" — and the fuzzy ranker does not know that.
 * Measured on windy-dev: `In: Rostock` + `4` put ROWTG07 "Vestas V150-**4**.2 MW" first and
 * ROWTG**04** tenth, so the issue's own flow (`Husum` `→` `4` `Enter`) opened the wrong turbine.
 *
 * So for each all-digit word of the term, a name scores by how the number appears in it, and
 * the ranking is stably re-sorted on that score (the fuzzy order survives within a tier):
 *
 * - **0** — a digit run of that value right after a letter, or after a letter and one `-`/`_`/`#`:
 *   `TG04`, `T4`, `WTG-04`, `T#4`. Leading zeros are ignored.
 * - **1** — a standalone word of that value: `Turbine 4`, `WTG 04`, `Turbine 4, north`.
 * - **2** — anything else: a decimal (`4.2`), part of a larger number (`40`, `14`), a model code.
 *
 * Several number words take the worst tier, so every typed number has to identify the row.
 * Digits are compared as strings, not `Number`s, so a long serial keeps every digit.
 */
export function preferNumberIdentity(ranked: SearchResult[], term: string): SearchResult[] {
  const unpadded = (digits: string) => digits.replace(/^0+(?=\d)/, '');
  const numbers = term
    .split(/\s+/)
    .filter((word) => /^\d+$/.test(word))
    .map(unpadded);

  if (numbers.length === 0) return ranked;

  const tier = (name: string): number => {
    let worst = 0;

    for (const value of numbers) {
      let best = 2;

      for (const match of name.matchAll(/\d+/g)) {
        if (unpadded(match[0]) !== value) continue;
        const start = match.index;
        const end = start + match[0].length;
        const before = name.slice(Math.max(0, start - 2), start);
        const after = name[end] ?? '';

        // A digit run continued by `.` or `,` and another digit is a decimal, not an identifier.
        if (/[.,]/.test(after) && /\d/.test(name[end + 1] ?? '')) continue;
        if (/\p{L}[-_#]?$/u.test(before)) best = 0;
        else if (/(^|\s)$/.test(before) && /^$|[^\p{L}\p{N}.]/u.test(after))
          best = Math.min(best, 1);
      }
      worst = Math.max(worst, best);
    }

    return worst;
  };

  return ranked
    .map((result, index) => ({ result, index, tier: tier(result.name) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.result);
}
