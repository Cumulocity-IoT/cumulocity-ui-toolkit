/**
 * Helpers for building the small HTML snippets that Leaflet renders directly
 * (marker `divIcon`s and layer-control labels).
 *
 * Layer configuration is persisted per dashboard and shared between users, so
 * these values are untrusted input and must never be interpolated raw.
 */

export { escapeHtml } from '~helpers/escape-html';

/** Hex, `rgb()`/`rgba()`, `hsl()`/`hsla()` and plain CSS colour keywords. */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]+)$/i;

/**
 * Returns the colour only if it is a safe CSS colour value, otherwise
 * `undefined`. Prevents breaking out of a `style` attribute.
 */
export function safeCssColor(color: string | undefined): string | undefined {
  if (!color) {
    return undefined;
  }

  const trimmed = color.trim();

  return SAFE_COLOR.test(trimmed) ? trimmed : undefined;
}

/** Icon names map onto `dlt-c8y-icon-*` class names, so restrict them to that shape. */
const SAFE_ICON = /^[a-z0-9-]+$/i;

/**
 * Returns the icon name only if it is usable as a CSS class suffix, otherwise
 * `undefined`. Prevents injecting extra classes or closing the attribute.
 */
export function safeIconName(icon: string | undefined): string | undefined {
  if (!icon) {
    return undefined;
  }

  const trimmed = icon.trim();

  return SAFE_ICON.test(trimmed) ? trimmed : undefined;
}
