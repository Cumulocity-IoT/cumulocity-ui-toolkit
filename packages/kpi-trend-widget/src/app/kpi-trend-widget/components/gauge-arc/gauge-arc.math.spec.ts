import {
  GAUGE_ARC_CENTER,
  GAUGE_ARC_RADIUS,
  GAUGE_ARC_SWEEP_LENGTH,
  type GaugeArcScale,
  arcDashArray,
  filledSpan,
  sweepFraction,
  tickGeometry,
} from './gauge-arc.math';

const MAGNITUDE: GaugeArcScale = { mode: 'magnitude', min: 0, max: 100, range: 60 };
/** A scale that deliberately does not start at 0. */
const OFFSET_SCALE: GaugeArcScale = { mode: 'magnitude', min: 90, max: 100, range: 60 };
/** A signed scale: ±60° (e.g. a yaw deviation). */
const SIGNED: GaugeArcScale = { mode: 'signed', min: 0, max: 100, range: 60 };

describe('sweepFraction', () => {
  it('maps a magnitude value across the band', () => {
    expect(sweepFraction(0, MAGNITUDE)).toBe(0);
    expect(sweepFraction(50, MAGNITUDE)).toBe(0.5);
    expect(sweepFraction(100, MAGNITUDE)).toBe(1);
  });

  it('honours a non-zero floor', () => {
    // 95 is halfway up a 90–100 scale, not 95% of the way.
    expect(sweepFraction(95, OFFSET_SCALE)).toBe(0.5);
    expect(sweepFraction(90, OFFSET_SCALE)).toBe(0);
  });

  it('puts signed zero at the midpoint and the extremes at the ends', () => {
    expect(sweepFraction(0, SIGNED)).toBe(0.5);
    expect(sweepFraction(60, SIGNED)).toBe(1);
    expect(sweepFraction(-60, SIGNED)).toBe(0);
  });

  it('places a signed value on the side its sign says', () => {
    expect(sweepFraction(30, SIGNED)).toBe(0.75);
    expect(sweepFraction(-30, SIGNED)).toBe(0.25);
  });

  it('pins an out-of-range value to the end of the band', () => {
    // A turbine parked 140° off the wind is a real state, not an error — the arc shows "at the
    // limit" while the readout still carries the true magnitude.
    expect(sweepFraction(140, SIGNED)).toBe(1);
    expect(sweepFraction(-140, SIGNED)).toBe(0);
    expect(sweepFraction(250, MAGNITUDE)).toBe(1);
  });

  it('drops an out-of-scale tick rather than clamping it', () => {
    // Clamping would draw a limit line exactly where the scale stops, asserting something false.
    expect(sweepFraction(140, SIGNED, false)).toBeUndefined();
    expect(sweepFraction(85, OFFSET_SCALE, false)).toBeUndefined();
    expect(sweepFraction(15, SIGNED, false)).toBe(0.625);
  });

  it('yields the band origin for a degenerate scale instead of NaN', () => {
    expect(sweepFraction(5, { mode: 'magnitude', min: 10, max: 10, range: 60 })).toBe(0);
    expect(sweepFraction(5, { mode: 'signed', min: 0, max: 100, range: 0 })).toBe(0.5);
  });
});

describe('filledSpan', () => {
  it('fills a magnitude arc from the start of the band', () => {
    expect(filledSpan(0.4, 'magnitude')).toEqual({ from: 0, to: 0.4 });
  });

  it('grows a signed arc outward from the midpoint, on the correct side', () => {
    expect(filledSpan(0.75, 'signed')).toEqual({ from: 0.5, to: 0.75 });
    expect(filledSpan(0.25, 'signed')).toEqual({ from: 0.25, to: 0.5 });
  });

  it('collapses to nothing at signed zero', () => {
    expect(filledSpan(0.5, 'signed')).toEqual({ from: 0.5, to: 0.5 });
  });
});

describe('arcDashArray', () => {
  it('measures the dash against the sweep, not the full circumference', () => {
    // The trap this guards: the sweep is 270°, so half of it is 0.375 of the circle. Using half
    // the circumference puts the signed midpoint 45° off — plausible enough to ship unnoticed.
    const { dashOffset } = arcDashArray({ from: 0.5, to: 0.6 });

    expect(Number(dashOffset)).toBeCloseTo(-GAUGE_ARC_SWEEP_LENGTH / 2, 2);
    expect(Number(dashOffset)).not.toBeCloseTo(-(2 * Math.PI * GAUGE_ARC_RADIUS) / 2, 0);
  });

  it('spans the whole band at full scale', () => {
    const { dashArray, dashOffset } = arcDashArray({ from: 0, to: 1 });

    expect(Number(dashArray.split(' ')[0])).toBeCloseTo(GAUGE_ARC_SWEEP_LENGTH, 2);
    expect(Number(dashOffset)).toBe(0);
  });

  it('draws nothing for an empty span', () => {
    expect(Number(arcDashArray({ from: 0.5, to: 0.5 }).dashArray.split(' ')[0])).toBe(0);
  });
});

describe('tickGeometry', () => {
  it("puts the midpoint tick at twelve o'clock", () => {
    const tick = tickGeometry(0.5);

    // Straight up: x stays on the centre line, both ends sit above it.
    expect(tick.x1).toBeCloseTo(GAUGE_ARC_CENTER, 6);
    expect(tick.x2).toBeCloseTo(GAUGE_ARC_CENTER, 6);
    expect(tick.y1).toBeLessThan(GAUGE_ARC_CENTER);
    expect(tick.y2).toBeLessThan(tick.y1);
  });

  it('crosses the band, reaching either side of the stroke', () => {
    const tick = tickGeometry(0.5);
    const inner = Math.hypot(tick.x1 - GAUGE_ARC_CENTER, tick.y1 - GAUGE_ARC_CENTER);
    const outer = Math.hypot(tick.x2 - GAUGE_ARC_CENTER, tick.y2 - GAUGE_ARC_CENTER);

    expect(inner).toBeLessThan(GAUGE_ARC_RADIUS);
    expect(outer).toBeGreaterThan(GAUGE_ARC_RADIUS);
  });

  it('starts the band at the lower left and ends it at the lower right', () => {
    const start = tickGeometry(0);
    const end = tickGeometry(1);

    expect(start.x1).toBeLessThan(GAUGE_ARC_CENTER);
    expect(start.y1).toBeGreaterThan(GAUGE_ARC_CENTER);
    expect(end.x1).toBeGreaterThan(GAUGE_ARC_CENTER);
    expect(end.y1).toBeGreaterThan(GAUGE_ARC_CENTER);
  });

  it('mirrors ticks placed symmetrically about the midpoint', () => {
    // ±15° on the nacelle's ±60° scale — the tolerance limits must sit level with each other.
    const left = tickGeometry(sweepFraction(-15, SIGNED)!);
    const right = tickGeometry(sweepFraction(15, SIGNED)!);

    expect(left.y1).toBeCloseTo(right.y1, 6);
    expect(GAUGE_ARC_CENTER - left.x1).toBeCloseTo(right.x1 - GAUGE_ARC_CENTER, 6);
  });
});
