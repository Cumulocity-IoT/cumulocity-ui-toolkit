import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import type { DotSeverity } from './status-dot.model';

/**
 * The fleet status dot — 8px, coloured by severity, with its fill carrying availability.
 *
 * **One implementation, three callers.** This was copied twice before it was extracted: the
 * asset-tree row and the quick-access row each carried their own block, and the copies had
 * already drifted. The palette would have been a third. The union of both is here.
 *
 * The two encodings, both load-bearing (OQ-T1, resolved: both):
 * - **Colour** — the worst active alarm severity in the subtree.
 * - **Fill** — solid when everything is available (or not availability-monitored), a hollow
 *   ring when a device in the subtree is unavailable (`c8y_Availability`). An unavailable
 *   device with no alarm is exactly the case a severity-only dot hides.
 *
 * `ViewEncapsulation.None` so the classes are global and a consuming plugin needs no extra
 * style import — the same reason `geo-map` does it. The trade is that these class names are
 * effectively global, hence the `ps-status-dot` prefix.
 */
@Component({
  selector: 'ps-status-dot',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ps-status-dot',
    '[class]': "'ps-status-dot ps-status-dot--' + severity()",
    '[class.ps-status-dot--unavailable]': 'unavailable()',
    '[attr.title]': 'description() || null',
    '[attr.aria-label]': 'description() || null',
    // With a description the dot carries meaning and is announced; without one it is decorative
    // — inside the severity chips, for instance, where the chip's own label already says it. An
    // empty `aria-label` on `role="img"` would announce an unlabelled image instead.
    '[attr.role]': "description() ? 'img' : null",
    '[attr.aria-hidden]': "description() ? null : 'true'",
  },
  template: '',
  styles: [
    `
      .ps-status-dot {
        --ps-dot: var(--c8y-palette-status-success, #71a112);

        display: block;
        flex: 0 0 8px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--ps-dot);
      }

      .ps-status-dot--critical {
        --ps-dot: var(--c8y-palette-status-danger, #d70f0f);
      }
      .ps-status-dot--major {
        --ps-dot: var(--c8y-palette-status-warning, #ff8800);
      }
      .ps-status-dot--minor {
        --ps-dot: var(--c8y-palette-yellow-60, #ffbe00);
      }
      .ps-status-dot--warning {
        --ps-dot: var(--c8y-palette-status-info, #056ad6);
      }
      /* No longer in the fleet — a pinned or recent entry whose asset has disappeared. */
      .ps-status-dot--gone {
        --ps-dot: var(--c8y-palette-gray-60, #b9c0c9);
      }
      /* Unavailable with nothing else wrong reads as grey rather than as a green ring. */
      .ps-status-dot--ok.ps-status-dot--unavailable {
        --ps-dot: var(--c8y-palette-gray-50, #8f9ba8);
      }

      /* Hollow ring: something in the subtree is unavailable. */
      .ps-status-dot--unavailable {
        background-color: transparent;
        box-shadow: inset 0 0 0 2px var(--ps-dot);
      }
    `,
  ],
})
export class StatusDotComponent {
  readonly severity = input<DotSeverity>('ok');
  readonly unavailable = input(false);
  /** The dot's meaning in words — see `describeDot`. Colour alone is not accessible. */
  readonly description = input<string>('');
}
