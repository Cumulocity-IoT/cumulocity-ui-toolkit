/**
 * Escapes text so it can safely be interpolated into an HTML string.
 *
 * Needed wherever HTML is built by hand rather than rendered by a template —
 * e.g. `AlertService` messages with `allowHtml: true`, or markup handed to
 * third-party libraries. Angular templates escape by default and do not need this.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
