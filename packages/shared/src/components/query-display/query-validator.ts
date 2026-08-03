import { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { AstNode } from './reverse-queries-util.model';
import { QueryParser } from './query-parser';
import { Tokenizer } from './string-tokenizer';

/**
 * Standard managed object properties that are NOT supported as arguments to
 * `has()` or `hasany()` in the Cumulocity inventory query language.
 *
 * @see https://cumulocity.com/api/core/#tag/Query-language
 */
export const UNSUPPORTED_HAS_PROPERTIES: ReadonlySet<string> = new Set([
  'id',
  'type',
  'name',
  'self',
  'lastUpdated',
  'owner',
  'creationTime',
  'supportedMeasurements',
  'childAssets',
  'childDevices',
  'childAdditions',
  'externalIds',
]);

/**
 * Walks an AST and collects all `has()`/`hasany()` calls that reference a
 * standard property not supported by the Cumulocity query language.
 */
function collectUnsupportedHasUsages(node: AstNode, messages: string[]): void {
  switch (node.type) {
    case 'and':
    case 'or':
      node.nodes.forEach((n) => collectUnsupportedHasUsages(n, messages));
      break;

    case 'not':
      collectUnsupportedHasUsages(node.node, messages);
      break;

    case 'has':
      if (UNSUPPORTED_HAS_PROPERTIES.has(node.fragment)) {
        messages.push(
          `has(${node.fragment}) is not supported — '${node.fragment}' is a standard property that cannot be checked with has()`
        );
      }
      break;

    case 'hasany': {
      const bad = node.fragments.filter((f) => UNSUPPORTED_HAS_PROPERTIES.has(f));

      if (bad.length > 0) {
        messages.push(
          `hasany(${bad.join(', ')}) is not supported — standard properties cannot be checked with hasany()`
        );
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Parses a Cumulocity query string and returns a list of human-readable
 * validation messages for any `has()`/`hasany()` calls that reference
 * unsupported standard properties.
 *
 * Returns an empty array when the query is valid or empty.
 *
 * @example
 * validateQuery("has(type)")
 * // → ["has(type) is not supported — 'type' is a standard property …"]
 *
 * validateQuery("has(c8y_IsDevice) and type eq 'Pump'")
 * // → []
 */
export function validateQuery(query?: string): string[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const messages: string[] = [];

  try {
    let processed = query.trim();

    if (processed.startsWith('$filter=')) {
      processed = processed.slice('$filter='.length).trim();

      if (processed.startsWith('(') && processed.endsWith(')')) {
        processed = processed.slice(1, -1).trim();
      }
    }

    const parser = new QueryParser(new Tokenizer(processed));

    collectUnsupportedHasUsages(parser.parse(), messages);
  } catch {
    // Parse errors are not validation errors — another validator handles those
  }

  return messages;
}

/**
 * Angular `ValidatorFn` that wraps `validateQuery()` for use in reactive forms
 * and formly field configs.
 *
 * Returns `null` when valid; `{ cumulocityQuery: string }` with a combined
 * error message when unsupported standard properties are detected.
 */
export function cumulocityQueryValidator(control: AbstractControl): ValidationErrors | null {
  const messages = validateQuery(control.value as string | undefined);

  if (messages.length === 0) {
    return null;
  }

  return { cumulocityQuery: messages.join('; ') };
}

/**
 * Formly-compatible validator descriptor for the Cumulocity query field.
 * Use inside a `FormlyFieldConfig.validators` map.
 *
 * @example
 * validators: { cumulocityQuery: CUMULOCITY_QUERY_VALIDATOR_CONFIG }
 */
export const CUMULOCITY_QUERY_VALIDATOR_CONFIG = {
  expression: cumulocityQueryValidator,
  message: (_error: unknown, field: FormlyFieldConfig): string => {
    const messages = validateQuery(field.formControl?.value as string | undefined);
    return messages.join(' ');
  },
};
