import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { CoreModule, IconDirective } from '@c8y/ngx-components';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { Tokenizer } from './string-tokenizer';

/**
 * Presentational kind assigned to each token so the template can apply the
 * appropriate badge / colour without any further logic.
 */
export type QueryTokenKind =
  | 'logical' // and, or
  | 'negation' // not
  | 'function' // has, hasany, bygroupid, isinhierarchyof
  | 'operator' // eq, lt, le, gt, ge
  | 'field' // property path identifiers
  | 'string' // quoted string literals  →  rendered with surrounding quotes
  | 'number' // numeric literals
  | 'paren' // ( )
  | 'comma'; // ,

export interface QueryDisplayToken {
  kind: QueryTokenKind;
  text: string;
}

export interface QueryClause {
  /** Drives the coloured left-border of the clause row. */
  clauseType: 'exclusion' | 'filter' | 'inclusion';
  tokens: QueryDisplayToken[];
}

// ---------------------------------------------------------------------------
// Helpers (module-level, allocated once)
// ---------------------------------------------------------------------------

/** Functions recognised by the Cumulocity query language. */
const QUERY_FUNCTIONS = new Set(['has', 'hasany', 'bygroupid', 'isinhierarchyof']);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'ps-query-display',
  standalone: true,
  imports: [CommonModule, CoreModule, IconDirective, TooltipModule],
  templateUrl: './ps-query-display.component.html',
  styleUrls: ['./ps-query-display.component.less'],
})
export class PSQueryDisplayComponent implements OnChanges {
  /** The raw Cumulocity inventory query string to visualise. */
  @Input({ required: true }) query!: string;

  /** Pre-computed clauses produced from the current `query` input. */
  clauses: QueryClause[] = [];

  /** When `true` the raw query string is shown instead of the rail. */
  showRaw = false;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnChanges(): void {
    this.clauses = this.query ? this.buildClauses(this.query) : [];
  }

  // ── Public actions ───────────────────────────────────────────────────────

  toggleView(): void {
    this.showRaw = !this.showRaw;
  }

  /**
   * Returns the human-readable station type label for the given clause type.
   */
  getStationTypeLabel(clauseType: QueryClause['clauseType']): string {
    const labels: Record<QueryClause['clauseType'], string> = {
      exclusion: 'Exclude',
      filter: 'Filter',
      inclusion: 'Include',
    };
    return labels[clauseType];
  }

  /**
   * For an inclusion clause (tokens wrapped in outer parentheses and joined
   * by OR), strips the outer parens and splits the token stream into one
   * group per OR branch — each group is a self-contained token list ready
   * for inline rendering.
   *
   * Returns an empty array for non-inclusion clauses.
   */
  getOrGroups(clause: QueryClause): QueryDisplayToken[][] {
    if (clause.clauseType !== 'inclusion') {
      return [];
    }

    // Strip the leading LPAREN and trailing RPAREN tokens
    const inner = clause.tokens.slice(1, clause.tokens.length - 1);

    const groups: QueryDisplayToken[][] = [];
    let current: QueryDisplayToken[] = [];

    for (const token of inner) {
      if (token.kind === 'logical' && token.text === 'or') {
        if (current.length > 0) {
          groups.push(current);
          current = [];
        }
      } else {
        current.push(token);
      }
    }

    if (current.length > 0) {
      groups.push(current);
    }

    return groups;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Splits the query on the top-level ` and ` conjunction.
   *
   * This is safe because the Cumulocity query language wraps all `or` groups
   * in parentheses, so ` and ` never appears inside a clause's own brackets.
   *
   * Each resulting clause is classified and tokenized independently.
   */
  private buildClauses(query: string): QueryClause[] {
    return query
      .split(' and ')
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => {
        const clauseType: QueryClause['clauseType'] = raw.startsWith('not(')
          ? 'exclusion'
          : raw.startsWith('(')
            ? 'inclusion'
            : 'filter';

        return { clauseType, tokens: this.tokenize(raw) };
      });
  }

  /**
   * Drives the shared {@link Tokenizer} over a single clause string and maps
   * every `Token` to a `QueryDisplayToken` with a presentational `kind`.
   *
   * If the tokenizer raises an error (e.g. unexpected character in a
   * future query syntax extension) the clause is returned as a single
   * plain-text `field` token so the display degrades gracefully.
   */
  private tokenize(clause: string): QueryDisplayToken[] {
    const result: QueryDisplayToken[] = [];
    const tokenizer = new Tokenizer(clause);

    try {
      while (true) {
        const token = tokenizer.next();

        if (token.type === 'EOF') break;

        switch (token.type) {
          case 'AND':
            result.push({ kind: 'logical', text: 'and' });
            break;

          case 'OR':
            result.push({ kind: 'logical', text: 'or' });
            break;

          case 'NOT':
            result.push({ kind: 'negation', text: 'not' });
            break;

          case 'OP':
            result.push({ kind: 'operator', text: token.value });
            break;

          case 'IDENT':
            result.push({
              kind: QUERY_FUNCTIONS.has(token.value.toLowerCase()) ? 'function' : 'field',
              text: token.value,
            });
            break;

          case 'STRING':
            // The Tokenizer strips the surrounding quotes; we restore them in
            // the template for readability.
            result.push({ kind: 'string', text: token.value });
            break;

          case 'NUMBER':
            result.push({ kind: 'number', text: token.value });
            break;

          case 'LPAREN':
            result.push({ kind: 'paren', text: '(' });
            break;

          case 'RPAREN':
            result.push({ kind: 'paren', text: ')' });
            break;

          case 'COMMA':
            result.push({ kind: 'comma', text: ',' });
            break;
        }
      }
    } catch {
      // Graceful fallback: show the raw clause text without any highlighting.
      return [{ kind: 'field', text: clause }];
    }

    return result;
  }
}
