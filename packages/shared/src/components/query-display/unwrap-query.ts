/**
 * Strips a `$filter=` prefix and one layer of surrounding parentheses.
 *
 * A leaf module so that both the query parser side (`query-validator`,
 * `reverse-queries-util`) and the builder side (`query-builder.model`) can use it
 * without an import cycle — the logic used to be copy-pasted in all three.
 */
export function unwrapQuery(query: string): string {
  const trimmed = query.trim();

  if (!trimmed.startsWith('$filter=')) {
    // Without the prefix the parentheses are part of the expression. Stripping
    // them unconditionally corrupts queries such as
    // `(type eq 'Pump') or (type eq 'Valve')`, whose first and last characters
    // are parentheses that do not match each other.
    return trimmed;
  }

  const withoutPrefix = trimmed.slice('$filter='.length).trim();

  return withoutPrefix.startsWith('(') && withoutPrefix.endsWith(')')
    ? withoutPrefix.slice(1, -1).trim()
    : withoutPrefix;
}
