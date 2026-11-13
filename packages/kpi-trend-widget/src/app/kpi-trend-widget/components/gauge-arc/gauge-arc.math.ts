/**
 * Geometry and scale maths for {@link GaugeArcComponent}.
 *
 * Pure functions in their own module: this is where the logic that can be wrong lives, none of
 * it needs Angular, and it is the part covered by unit tests.
 */

/** `viewBox="0 0 140 140"`, centre (70, 70), r = 58, stroke-width 12. */
export const GAUGE_ARC_VIEWBOX = 140;
export const GAUGE_ARC_CENTER = 70;
export const GAUGE_ARC_RADIUS = 58;
export const GAUGE_ARC_STROKE_WIDTH = 12;
export const GAUGE_ARC_CIRCUMFERENCE = 2 * Math.PI * GAUGE_ARC_RADIUS;

/** A 270° sweep — three quarters of the circle. */
export const GAUGE_ARC_SWEEP_RATIO = 0.75;
export const GAUGE_ARC_SWEEP_LENGTH = GAUGE_ARC_CIRCUMFERENCE * GAUGE_ARC_SWEEP_RATIO;
export const GAUGE_ARC_SWEEP_DEGREES = 360 * GAUGE_ARC_SWEEP_RATIO;

/**
 * Where the sweep begins, in SVG degrees clockwise from east — the `rotate(135)` on both circles.
 * 135° puts the start at the lower left; the band then runs clockwise over the top (270°, the
 * midpoint) to the lower right (45°).
 */
export const GAUGE_ARC_SWEEP_START_DEGREES = 135;

/** How far a tick reaches either side of the band's centre line (the stroke is 12 wide). */
export const GAUGE_ARC_TICK_HALF_LENGTH = 8;

/**
 * How the value fills the band.
 *
 * - `magnitude` — a 0→max quantity, filling from the start of the sweep.
 * - `signed` — a ± deviation, filling outward from the sweep's midpoint in the direction of the
 *   sign. A magnitude arc would discard which side of zero the value sits on, which for something
 *   like yaw deviation is half the answer.
 */
export type GaugeArcMode = 'magnitude' | 'signed';

/** The scale a value is being placed on. `range` is read in `signed` mode, `min`/`max` otherwise. */
export interface GaugeArcScale {
  mode: GaugeArcMode;
  min: number;
  max: number;
  /** Half-span for `signed`: the band runs from `-range` to `+range`. */
  range: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Maps a value in the gauge's own units onto a fraction of the sweep — `0` is the start of the
 * band, `0.5` its midpoint, `1` the end.
 *
 * `clampToScale` separates the two callers. The **value arc** pins to the end of the band, so an
 * out-of-range reading shows as "at the limit" while the readout carries the true magnitude. A
 * **tick** instead returns `undefined` and is dropped: clamping it would assert that a limit sits
 * exactly where the scale happens to stop.
 *
 * A degenerate scale (`max <= min`, or a non-positive `range`) yields the band's origin rather
 * than `NaN` — a misconfigured widget should render an empty gauge, not a broken path.
 */
export function sweepFraction(
  value: number,
  scale: GaugeArcScale,
  clampToScale = true
): number | undefined {
  let fraction: number;

  if (scale.mode === 'signed') {
    fraction = scale.range > 0 ? 0.5 + value / scale.range / 2 : 0.5;
  } else {
    const span = scale.max - scale.min;

    fraction = span > 0 ? (value - scale.min) / span : 0;
  }

  if (clampToScale) {
    return clamp(fraction, 0, 1);
  }

  return fraction < 0 || fraction > 1 ? undefined : fraction;
}

/**
 * The span the value arc covers, in sweep fractions. `magnitude` always starts at the band's
 * origin; `signed` grows outward from the midpoint, so which end is the origin depends on the sign.
 */
export function filledSpan(fraction: number, mode: GaugeArcMode): { from: number; to: number } {
  if (mode === 'signed') {
    return fraction >= 0.5 ? { from: 0.5, to: fraction } : { from: fraction, to: 0.5 };
  }

  return { from: 0, to: fraction };
}

/**
 * `stroke-dasharray` / `stroke-dashoffset` for a filled span.
 *
 * The offset is what makes `signed` work at all: a dash pattern always starts at the path's own
 * origin, so a band that begins partway along the sweep is expressed by shifting the pattern back
 * by that distance. Note the distances are fractions of the **sweep**, not of the circumference —
 * conflating the two puts the midpoint 45° off, which looks plausible enough to ship.
 */
export function arcDashArray(span: { from: number; to: number }): {
  dashArray: string;
  dashOffset: string;
} {
  const length = (span.to - span.from) * GAUGE_ARC_SWEEP_LENGTH;

  return {
    dashArray: `${length.toFixed(2)} ${GAUGE_ARC_CIRCUMFERENCE.toFixed(2)}`,
    dashOffset: (-span.from * GAUGE_ARC_SWEEP_LENGTH).toFixed(2),
  };
}

export interface GaugeArcTickGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Endpoints of the tick crossing the band at `fraction` along the sweep. */
export function tickGeometry(fraction: number): GaugeArcTickGeometry {
  const radians =
    ((GAUGE_ARC_SWEEP_START_DEGREES + fraction * GAUGE_ARC_SWEEP_DEGREES) * Math.PI) / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);
  const inner = GAUGE_ARC_RADIUS - GAUGE_ARC_TICK_HALF_LENGTH;
  const outer = GAUGE_ARC_RADIUS + GAUGE_ARC_TICK_HALF_LENGTH;

  return {
    x1: GAUGE_ARC_CENTER + inner * dirX,
    y1: GAUGE_ARC_CENTER + inner * dirY,
    x2: GAUGE_ARC_CENTER + outer * dirX,
    y2: GAUGE_ARC_CENTER + outer * dirY,
  };
}
