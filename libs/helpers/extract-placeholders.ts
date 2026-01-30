/**
 * Recursively walks an object/array and extracts unique template placeholders
 * of the form `{{ ... }}` along with the path where they were found.
 * Returns placeholders in encounter order.
 */
export function extractPlaceholdersFromObject(obj: unknown): { key: string; path: string }[] {
  const results: { key: string; path: string }[] = [];
  const seen = new Set<string>();

  const regex = /{{\s*([^{}\n]+?)\s*}}/g;

  function visit(value: unknown, path: string) {
    if (value == null) return;

    if (typeof value === 'string') {
      let match: RegExpExecArray | null;

      while ((match = regex.exec(value)) !== null) {
        const extracted = match[1].trim();

        if (!seen.has(extracted)) {
          seen.add(extracted);
          results.push({
            key: extracted,
            path,
          });
        }
      }

      // reset for next string
      regex.lastIndex = 0;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, `${path}[${index}]`);
      });
    } else if (typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
        visit(val, path ? `${path}.${key}` : key);
      });
    }
  }

  visit(obj, '');

  return results;
}
