import { signal, type Signal } from '@angular/core';

/**
 * Hover-intent and layering rules for the cascade (§6.5) — "the highest-value and
 * highest-risk piece of the design. Get these wrong and it flickers."
 *
 * A plain class, not a service: each container owns one instance, and the timers are
 * per-container state with nothing to inject.
 *
 * The rules it implements, verbatim from the design:
 *
 * - open delay 250ms for detail
 * - close delay 220ms grace period, cancelled if the pointer enters the panel
 * - moving between rows swaps content in the open panel **without re-animating**
 * - focusing a row opens the panel; `Esc` closes the innermost level
 * - no prefetch on mouse-move — only on committed hover intent
 */
export const CASCADE_OPEN_DELAY_DETAIL = 250;
export const CASCADE_CLOSE_GRACE = 220;

/**
 * What the cascade currently shows. Two kinds share the one controller — and therefore
 * the one open/grace/lock state machine — because only one panel may ever be out at a
 * time: hovering a hierarchy row while the quick-access panel is open must *swap* to the
 * detail panel, not stack a second one.
 *
 * (Quick access was a hover panel originally, then in-place expansion
 * for keyboard reachability — it is a cascade again now that `openNow` gives the
 * keyboard a way in, and the in-place variant is gone so the list is never on screen
 * twice. See §6.1.)
 */
export type CascadeTarget =
  | {
      kind: 'detail';
      /** The asset whose detail panel is shown. */
      id: string;
      /** Viewport-relative top of the anchor row, for vertical alignment (§6.4 rule 4). */
      anchorTop: number;
    }
  | {
      kind: 'quick-access';
      /** Viewport-relative top of the quick-access header row. */
      anchorTop: number;
    };

export class CascadeController {
  private readonly openTarget = signal<CascadeTarget | null>(null);

  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  /** The target a pending open is for — dropped if the pointer leaves first. */
  private pending: CascadeTarget | null = null;

  /** Level 1/2 content, or `null` when nothing is open. */
  readonly target: Signal<CascadeTarget | null> = this.openTarget.asReadonly();
  /**
   * Committed hover intent on a row.
   *
   * When a panel is already open, the swap is **immediate and animation-free**: the
   * user has already paid the open delay once, and re-arming it per row is what makes
   * a cascade feel like it is fighting the pointer (AC-T5).
   */
  enter(target: CascadeTarget): void {
    this.cancelClose();

    if (this.openTarget()) {
      this.cancelOpen();
      this.openTarget.set(target);

      return;
    }
    if (this.pending && sameTarget(this.pending, target)) return;
    this.cancelOpen();
    this.pending = target;
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      const committed = this.pending;

      this.pending = null;
      if (committed) this.openTarget.set(committed);
    }, CASCADE_OPEN_DELAY_DETAIL);
  }

  /**
   * Pointer left the row. Starts the grace period rather than closing — the pointer
   * has to cross the gap between the row and the panel, and closing on `mouseleave`
   * would make the panel unreachable.
   */
  leave(): void {
    // A pending open that was never committed is simply dropped: no request was
    // issued and no panel was shown, so there is nothing to grace.
    this.cancelOpen();
    this.pending = null;
    if (!this.openTarget()) return;
    this.cancelClose();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.close();
    }, CASCADE_CLOSE_GRACE);
  }

  /** Pointer entered the panel — it is being used, so cancel the pending close. */
  hold(): void {
    this.cancelClose();
  }

  /** Keyboard/touch: open immediately, since there is no hover to express intent. */
  openNow(target: CascadeTarget): void {
    this.cancelOpen();
    this.cancelClose();
    this.pending = null;
    this.openTarget.set(target);
  }

  /** Re-aligns the open panel, e.g. after the tree scrolled under a focused row. */
  realign(anchorTop: number): void {
    const current = this.openTarget();

    if (current) this.openTarget.set({ ...current, anchorTop });
  }

  /**
   * Closes the open panel, and reports whether anything closed — the tree
   * needs that to decide whether `Esc` should instead bubble as `requestClose` (§3.6).
   */
  closeInnermost(): boolean {
    if (this.openTarget()) {
      this.close();

      return true;
    }

    return false;
  }

  close(): void {
    this.cancelOpen();
    this.cancelClose();
    this.pending = null;
    this.openTarget.set(null);
  }

  /** Called on resize start: an open panel's anchor is about to be wrong (§6.4 rule 5). */
  dispose(): void {
    this.close();
  }

  private cancelOpen(): void {
    if (this.openTimer !== null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  private cancelClose(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }
}

function sameTarget(a: CascadeTarget, b: CascadeTarget): boolean {
  if (a.kind !== b.kind) return false;

  return a.kind === 'quick-access' || a.id === (b as { id: string }).id;
}
