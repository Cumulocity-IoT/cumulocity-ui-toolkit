import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * The generic cascade surface (§6.4). One component for every level, so the
 * positioning and layering rules exist in exactly one place:
 *
 * 1. **Left edge exactly on the anchor's right edge** — `left = fromLeft`. Level 3
 *    passes `containerWidth + level2Width`. No gap, no overlap.
 * 2. **No left border**, radius `0 8px 8px 0`, shadow cast rightward only.
 * 3. **`z-index` below the host's**, so the seam is hidden and the drawer is never
 *    covered. Enforced in the stylesheet, not by callers.
 * 4. **Vertically aligned to the anchor row**, clamped inside the host with a 6px
 *    margin — the clamp is the reason this is not a plain tooltip.
 * 5. Re-anchors on host resize; the container closes the panel on resize start.
 * 6. Rendered **inside** the host element, so overflow clipping and stacking are
 *    predictable.
 */
@Component({
  selector: 'ps-cascade-panel',
  template: `
    <div
      class="ps-cascade"
      [class.ps-cascade--level3]="level() === 3"
      [style.left.px]="fromLeft()"
      [style.top.px]="top()"
      [style.width.px]="width()"
      [style.max-height.px]="maxHeight()"
      (mouseenter)="hold.emit()"
      (mouseleave)="release.emit()"
    >
      <ng-content />
    </div>
  `,
  styleUrls: ['./cascade-panel.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CascadePanelComponent {
  /** Left offset in px: the anchor's right edge. */
  readonly fromLeft = input.required<number>();
  /** Viewport-relative top of the anchor row. */
  readonly anchorTop = input.required<number>();
  readonly width = input(280);
  /** 1 = quick access, 2 = detail, 3 = field config. Only 3 changes the styling. */
  readonly level = input<1 | 2 | 3>(2);
  /** Panel height used for clamping; the panel itself scrolls beyond it. */
  readonly height = input(320);

  readonly hold = output<void>();
  readonly release = output<void>();

  private readonly host = inject(ElementRef<HTMLElement>);

  /** Space the panel must stay inside, top and bottom. */
  private static readonly MARGIN = 6;

  /**
   * Bumped whenever the host box changes size.
   *
   * The clamp below is a `computed()` over a `getBoundingClientRect()` read, and a DOM read
   * is not a signal — without this the clamp is computed once per anchor change and then
   * never again, so rule 5 ("re-anchors on host resize") silently did not hold: after the
   * drawer was widened or the window resized, the panel kept a clamp measured against the
   * old box. This is the missing dependency.
   */
  private readonly hostBox = signal(0);

  /**
   * The clamp (rule 4). Measured against the host's own box rather than the viewport:
   * the panel lives inside the container, so the container's edges are the ones it must
   * not escape — and that keeps it correct when the drawer itself is offset.
   */
  protected readonly top = computed(() => {
    const anchor = this.anchorTop();

    this.hostBox();
    const element = this.host.nativeElement as HTMLElement;
    const box = element.getBoundingClientRect();

    // Before the host is laid out there is nothing to clamp against; the anchor is
    // already viewport-relative, so it is the right answer either way.
    if (!box.height) return anchor;
    const relative = anchor - box.top;
    const margin = CascadePanelComponent.MARGIN;
    const limit = box.height - this.height() - margin;
    return Math.max(margin, limit > margin ? Math.min(relative, limit) : margin);
  });

  protected readonly maxHeight = computed(() => {
    this.hostBox();
    const element = this.host.nativeElement as HTMLElement;
    const box = element.getBoundingClientRect();
    const available = (box.height || this.height()) - 2 * CascadePanelComponent.MARGIN;
    return Math.max(120, Math.min(this.height(), available));
  });

  constructor() {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.hostBox.update((version) => version + 1));

    observer.observe(this.host.nativeElement as HTMLElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
