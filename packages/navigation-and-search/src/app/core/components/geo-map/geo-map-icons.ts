import type { GeoMapCategory } from './geo-map.types';

export const NEUTRAL_COLOR = 'var(--c8y-palette-gray-50, #8f9ba8)';

export const PIN_WIDTH = 30;
export const PIN_HEIGHT = 40;
export const CLUSTER_SIZE = 44;

const PIN_PATH = 'M15 1C7.3 1 1 7.3 1 15c0 9.6 12.2 22 14 22s14-12.4 14-22C29 7.3 22.7 1 15 1Z';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// NOTE: CSS custom properties (var(--…)) are ONLY valid in style="" — never in
// SVG presentation attributes (fill/stroke), where they are silently ignored.

/** Single marker: colored pin with the category icon inside and an optional label below. */
export function buildPinHtml(options: { category?: GeoMapCategory; label?: string }): string {
  const color = options.category?.color ?? NEUTRAL_COLOR;
  const icon = options.category?.icon
    ? `<i class="dlt-c8y-icon dlt-c8y-icon-${escapeHtml(options.category.icon)}"></i>`
    : '';
  const label = options.label
    ? `<div class="ps-gm-marker__label">${escapeHtml(options.label)}</div>`
    : '';
  return `
    <div class="ps-gm-marker">
      <div class="ps-gm-marker__pin" style="color:${color}">
        <svg width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}" aria-hidden="true">
          <path d="${PIN_PATH}" style="fill:currentColor;stroke:rgba(0,0,0,.25);stroke-width:1"/>
          <circle cx="15" cy="15" r="9" style="fill:var(--c8y-root-component-background-default, #fff)"/>
        </svg>
        ${icon}
      </div>
      ${label}
    </div>`;
}

/** Cluster bubble: count in the middle, donut ring segmented by category share. */
export function buildClusterHtml(options: {
  total: number;
  /** Insertion-ordered category → count (null key = uncategorized). */
  counts: Map<GeoMapCategory | null, number>;
  ring: boolean;
  containsSelected: boolean;
}): string {
  const r = 18.5;
  const circumference = 2 * Math.PI * r;
  let segments = '';

  if (options.ring) {
    let offset = 0;

    for (const [category, count] of options.counts) {
      const fraction = count / options.total;
      const color = category?.color ?? NEUTRAL_COLOR;

      segments += `<circle cx="22" cy="22" r="${r}" stroke-dasharray="${fraction * circumference} ${circumference}"
        stroke-dashoffset="${-offset * circumference}"
        style="fill:none;stroke:${color};stroke-width:5"/>`;
      offset += fraction;
    }
  } else {
    segments = `<circle cx="22" cy="22" r="${r}" style="fill:none;stroke:${NEUTRAL_COLOR};stroke-width:5"/>`;
  }

  return `
    <div class="ps-gm-cluster${options.containsSelected ? ' ps-gm--selected' : ''}">
      <svg width="${CLUSTER_SIZE}" height="${CLUSTER_SIZE}" viewBox="0 0 ${CLUSTER_SIZE} ${CLUSTER_SIZE}" aria-hidden="true">
        <circle cx="22" cy="22" r="21" style="fill:var(--c8y-root-component-background-default, #fff);stroke:rgba(0,0,0,.15);stroke-width:1"/>
        <g transform="rotate(-90 22 22)">${segments}</g>
      </svg>
      <span class="ps-gm-cluster__count">${options.total}</span>
    </div>`;
}
