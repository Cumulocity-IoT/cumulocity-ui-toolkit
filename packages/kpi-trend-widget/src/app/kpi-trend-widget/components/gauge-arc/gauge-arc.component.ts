import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';
import {
  GAUGE_ARC_CENTER,
  GAUGE_ARC_CIRCUMFERENCE,
  GAUGE_ARC_RADIUS,
  GAUGE_ARC_STROKE_WIDTH,
  GAUGE_ARC_SWEEP_LENGTH,
  GAUGE_ARC_SWEEP_START_DEGREES,
  GAUGE_ARC_VIEWBOX,
  type GaugeArcMode,
  type GaugeArcScale,
  arcDashArray,
  filledSpan,
  sweepFraction,
  tickGeometry,
} from './gauge-arc.math';

export {
  GAUGE_ARC_CENTER,
  GAUGE_ARC_CIRCUMFERENCE,
  GAUGE_ARC_RADIUS,
  GAUGE_ARC_STROKE_WIDTH,
  GAUGE_ARC_VIEWBOX,
} from './gauge-arc.math';
export type { GaugeArcMode } from './gauge-arc.math';

/**
 * Semantic colour of the band. Deliberately the platform's own status vocabulary rather than a
 * per-widget palette, so `warning` means the same thing on every card — and so a rebranded or
 * dark-mode tenant recolours all of them at once.
 */
export type GaugeArcTone = 'default' | 'good' | 'warning' | 'critical' | 'neutral';

/** A reference mark on the band (a contractual target, a tolerance limit), in the value's own units. */
export interface GaugeArcTick {
  value: number;
  /** Optional description; surfaces only in the host's `ariaLabel`, never rendered as text. */
  label?: string;
}

/**
 * The arc gauge of the radial layout: one geometry, one colour vocabulary, two fill modes.
 *
 * Copied from the DER Add-on's shared library, where all gauges render through it; the widget uses
 * the `magnitude` mode only.
 *
 * The readout is projected rather than an input, so the host decides what goes in the middle.
 * Hosts use the `kt-gauge-arc__value` / `__unit` / `__sub` classes for it, so the type scale is
 * defined once; that is also why this component is `ViewEncapsulation.None`, since scoped styles
 * never reach projected content. Every selector is prefixed accordingly.
 *
 * ```html
 * <ps-kpi-trend-gauge-arc
 *   mode="magnitude"
 *   [value]="value()" [min]="0" [max]="100"
 *   [tone]="tone()"
 *   [ariaLabel]="'71 %'"
 * >
 *   <span class="kt-gauge-arc__value">71</span>
 *   <span class="kt-gauge-arc__sub">of 100</span>
 * </ps-kpi-trend-gauge-arc>
 * ```
 */
@Component({
  selector: 'ps-kpi-trend-gauge-arc',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'kt-gauge-arc',
    '[class.kt-gauge-arc--good]': "tone() === 'good'",
    '[class.kt-gauge-arc--warning]': "tone() === 'warning'",
    '[class.kt-gauge-arc--critical]': "tone() === 'critical'",
    '[class.kt-gauge-arc--neutral]': "tone() === 'neutral'",
    '[class.kt-gauge-arc--stale]': 'stale()',
    '[style.--kt-gauge-arc-size.px]': 'size()',
    '[style.--kt-gauge-arc-color]': 'color()',
    role: 'img',
    '[attr.aria-label]': 'ariaLabel()',
  },
  template: `
    <svg
      class="kt-gauge-arc__svg"
      [attr.viewBox]="'0 0 ' + viewBox + ' ' + viewBox"
      aria-hidden="true"
    >
      <!-- Track: the value's own colour at low opacity, so an empty gauge still reads as the
           same instrument rather than as a grey ring that happens to sit nearby. -->
      <circle
        class="kt-gauge-arc__track"
        [attr.cx]="center"
        [attr.cy]="center"
        [attr.r]="radius"
        [attr.stroke-width]="strokeWidth"
        [attr.stroke-dasharray]="trackDash"
        [attr.transform]="sweepTransform"
        fill="none"
      />

      <circle
        class="kt-gauge-arc__value-arc"
        [attr.cx]="center"
        [attr.cy]="center"
        [attr.r]="radius"
        [attr.stroke-width]="strokeWidth"
        [attr.stroke-dasharray]="dash().dashArray"
        [attr.stroke-dashoffset]="dash().dashOffset"
        [attr.transform]="sweepTransform"
        fill="none"
        stroke-linecap="round"
      />

      @for (tick of tickMarks(); track tick.key) {
        <line
          class="kt-gauge-arc__tick"
          [attr.x1]="tick.x1"
          [attr.y1]="tick.y1"
          [attr.x2]="tick.x2"
          [attr.y2]="tick.y2"
        />
      }
    </svg>

    <div class="kt-gauge-arc__readout">
      <ng-content />
    </div>
  `,
  styles: `
    .kt-gauge-arc {
      position: relative;
      display: block;
      width: var(--kt-gauge-arc-size, 140px);
      height: var(--kt-gauge-arc-size, 140px);
      flex-shrink: 0;
    }

    .kt-gauge-arc__svg {
      display: block;
      width: 100%;
      height: 100%;
      /* Ticks reach past the band, which itself reaches the viewBox edge. */
      overflow: visible;
    }

    /*
     * Colour lives here, never on the SVG elements: a var(--c8y-…) token in a presentation
     * attribute (stroke="…") is silently ignored by the platform's renderer, so every gauge
     * colour has to arrive through CSS. --kt-gauge-arc-color is the host's optional override
     * (a KPI whose datapoint carries a configured colour); absent it, each tone resolves to a
     * platform status token, which is what makes light/dark and rebranded tenants work without
     * this component knowing anything about themes.
     */
    .kt-gauge-arc__track,
    .kt-gauge-arc__value-arc {
      stroke: var(--kt-gauge-arc-color, var(--c8y-brand-primary, #1776bf));
    }

    .kt-gauge-arc--good .kt-gauge-arc__track,
    .kt-gauge-arc--good .kt-gauge-arc__value-arc {
      stroke: var(--kt-gauge-arc-color, var(--c8y-palette-status-success, #0ca30c));
    }

    .kt-gauge-arc--warning .kt-gauge-arc__track,
    .kt-gauge-arc--warning .kt-gauge-arc__value-arc {
      stroke: var(--kt-gauge-arc-color, var(--c8y-palette-status-warning, #d98c05));
    }

    .kt-gauge-arc--critical .kt-gauge-arc__track,
    .kt-gauge-arc--critical .kt-gauge-arc__value-arc {
      stroke: var(--kt-gauge-arc-color, var(--c8y-palette-status-danger, #d03b3b));
    }

    /* No verdict available (no contract, no threshold) — never a fabricated colour. */
    .kt-gauge-arc--neutral .kt-gauge-arc__track,
    .kt-gauge-arc--neutral .kt-gauge-arc__value-arc {
      stroke: var(--kt-gauge-arc-color, var(--c8y-text-muted, #657381));
    }

    .kt-gauge-arc__track {
      opacity: 0.2;
    }

    .kt-gauge-arc__value-arc {
      transition:
        stroke-dasharray 0.4s cubic-bezier(0.2, 0.75, 0.3, 1),
        stroke-dashoffset 0.4s cubic-bezier(0.2, 0.75, 0.3, 1);
    }

    @media (prefers-reduced-motion: reduce) {
      .kt-gauge-arc__value-arc {
        transition: none;
      }
    }

    .kt-gauge-arc__tick {
      stroke: var(--c8y-text-color, #1e2a33);
      stroke-width: 2.4;
      stroke-linecap: round;
    }

    /*
     * Readings too old to stand behind — the host still decides what counts as too old.
     *
     * The readout dims; the band does not. Fading the band leaves a washed-out arc inside an
     * otherwise full-strength card, which reads as a rendering fault rather than as "this number
     * is old" — and the band is the mark carrying the magnitude, so it is the last thing that
     * should lose contrast. A host that wants the whole instrument to recede should dim its own
     * container, as nacelle-widget does for both its panels at once.
     *
     * (No backticks in this block: these styles are a template literal, so one would close it.)
     */
    .kt-gauge-arc--stale .kt-gauge-arc__readout {
      opacity: 0.5;
    }

    /*
     * The horizontal padding is load-bearing, not cosmetic: it constrains projected content to the
     * ring's clear interior so a long readout wraps instead of running out under the band.
     *
     * The band's inner edge is at r = 52 of a 150-unit viewBox (r 58 less half of a 12-wide stroke),
     * so the widest clear span is ~69% of the box — but the readout sits below the centre, where the
     * chord is narrower, so 62% is the honest figure. A percentage rather than a pixel value because
     * the size is a host input.
     *
     * Without this, each host has to guess its own max-width, and that guess silently rots: the
     * availability card carried a 104px cap tuned for one set of labels, and simply shortening a label
     * turned a two-line subtitle into one 103px line overlapping the arc.
     */
    .kt-gauge-arc__readout {
      position: absolute;
      inset: 0;
      padding: 0 19%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      text-align: center;
      pointer-events: none;
    }

    /* The shared readout type scale — hosts opt in by using these class names. */
    .kt-gauge-arc__value {
      font-size: 23px;
      font-weight: 730;
      letter-spacing: -0.03em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .kt-gauge-arc__unit {
      margin-top: 3px;
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--c8y-text-muted, #657381);
    }

    .kt-gauge-arc__sub {
      font-size: 9.5px;
      color: var(--c8y-text-muted, #657381);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class GaugeArcComponent {
  /** See {@link GaugeArcMode}. */
  readonly mode = input<GaugeArcMode>('magnitude');

  /** The reading. `undefined` draws the track only — an absent value is not zero. */
  readonly value = input<number | undefined>(undefined);

  /** `magnitude` scale floor. */
  readonly min = input(0);
  /** `magnitude` scale ceiling. */
  readonly max = input(100);

  /** `signed` half-span: the band runs from `-range` to `+range`. */
  readonly range = input(60);

  /** Reference marks, in the value's own units. Out-of-scale ticks are dropped, not clamped. */
  readonly ticks = input<readonly GaugeArcTick[]>([]);

  readonly tone = input<GaugeArcTone>('default');

  /** Dims the readout without changing what it says. The band keeps full contrast — see the styles. */
  readonly stale = input(false);

  /** Rendered size in px; the viewBox scales with it. */
  readonly size = input(140);

  /**
   * Explicit colour, overriding `tone` — for a KPI whose datapoint carries a configured colour.
   * Leave unset in every other case so the platform's status tokens apply.
   */
  readonly color = input<string | undefined>(undefined);

  /** Describes the whole gauge; the host composes it because only it knows the units. */
  readonly ariaLabel = input<string>('');

  protected readonly viewBox = GAUGE_ARC_VIEWBOX;
  protected readonly center = GAUGE_ARC_CENTER;
  protected readonly radius = GAUGE_ARC_RADIUS;
  protected readonly strokeWidth = GAUGE_ARC_STROKE_WIDTH;
  protected readonly trackDash = `${GAUGE_ARC_SWEEP_LENGTH.toFixed(2)} ${GAUGE_ARC_CIRCUMFERENCE.toFixed(2)}`;
  protected readonly sweepTransform = `rotate(${GAUGE_ARC_SWEEP_START_DEGREES} ${GAUGE_ARC_CENTER} ${GAUGE_ARC_CENTER})`;

  private readonly scale = computed<GaugeArcScale>(() => ({
    mode: this.mode(),
    min: this.min(),
    max: this.max(),
    range: this.range(),
  }));

  protected readonly dash = computed(() => {
    const value = this.value();

    if (value === undefined) {
      return arcDashArray({ from: 0, to: 0 });
    }

    return arcDashArray(filledSpan(sweepFraction(value, this.scale())!, this.mode()));
  });

  protected readonly tickMarks = computed(() =>
    this.ticks().flatMap((tick, index) => {
      const fraction = sweepFraction(tick.value, this.scale(), false);

      return fraction === undefined ? [] : [{ key: index, ...tickGeometry(fraction) }];
    })
  );
}
