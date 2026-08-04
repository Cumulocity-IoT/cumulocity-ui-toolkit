import {
  effect,
  input,
  output,
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Subject } from 'rxjs';
import { FormControl, FormGroup, FormsModule } from '@angular/forms';
import { filter, takeUntil } from 'rxjs/operators';
import { CoreModule, CountdownIntervalComponent } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { TooltipModule } from 'ngx-bootstrap/tooltip';

@Component({
  selector: 'ps-auto-refresh',
  templateUrl: './ps-auto-refresh.component.html',
  standalone: true,
  imports: [PopoverModule, TooltipModule, FormsModule, CoreModule],
})
export class PSAutoRefreshComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly refreshIntervalsInMilliseconds = [5_000, 10_000, 15_000, 30_000, 60_000];
  readonly DISABLE_AUTO_REFRESH = gettext('Disable auto refresh');
  readonly ENABLE_AUTO_REFRESH = gettext('Enable auto refresh');
  readonly SECONDS_UNTIL_REFRESH = gettext('{{ seconds }} s');

  /**
   * Controls the loading state of the alarms list reload button.
   */
  /**
   * Loading state of the caller's reload action. Previously an
   * `input<BehaviorSubject<boolean>>()`, which forced callers to hand a Subject
   * to the component and left an untorn-down subscription behind.
   */
  isLoading = input(false);

  /**
   * * Set the value of `isIntervalEnabled` in response to user interactions with the alarm list scroll.
   *  *
   *  * This input setter allows you to control the `isIntervalEnabled` property, which is used to manage the state
   *  * of a toggle button. When a user scrolls through the alarms list, you can update the `isIntervalEnabled` value
   *  * using this setter.
   *  *
   *  * @param value - A boolean value representing the new state of the `isIntervalEnabled` property.
   *  *   - `true` indicates that the interval is enabled.
   *  *   - `false` indicates that the interval is disabled.
   */
  isIntervalToggleEnabledInput = input<boolean | undefined>(undefined, {
    alias: 'isIntervalToggleEnabled',
  });

  /**
   * This getter allows you to access the current state of the `isIntervalEnabled` property, which reflects
   * the state of a toggle button. It retrieves the value from the associated form control, providing the
   * current state of the toggle button.
   */
  /**
   * `FormGroup.value` is a `Partial`, so the raw control value is exposed here to
   * keep the template binding non-optional under `strictTemplates`.
   */
  get refreshInterval(): number {
    return this.toggleIntervalForm.controls.refreshInterval.value;
  }

  get isIntervalToggleEnabled(): boolean {
    return this.toggleIntervalForm.controls.intervalToggle.value;
  }

  /**
   * Event emitter for notifying when a countdown timer has completed.
   */
  readonly countdownEnded = output<void>();

  @ViewChild(CountdownIntervalComponent)
  countdownIntervalComponent!: CountdownIntervalComponent;

  /**
   * Built from explicit non-nullable controls rather than `FormBuilder.group()`
   * so `controls.x` is typed and never `null` — `form.get('x')` returns
   * `AbstractControl | null` and forced a guard at every use.
   */
  readonly toggleIntervalForm = new FormGroup({
    intervalToggle: new FormControl<boolean>(true, { nonNullable: true }),
    refreshInterval: new FormControl<number>(30_000, { nonNullable: true }),
  });

  private destroy$: Subject<void> = new Subject<void>();
  /**
   * Indicates whether the user has been interacting with the interval toggle.
   * Property holds the current state of the interval toggle input element entered by the user,
   * distinguishing it from changes made programmatically (e.g. value from isIntervalToggleEnabled).
   */
  private doesUserCheckedIntervalToggle = false;

  constructor() {
    // `effect()` requires an injection context, and the countdown child is
    // guarded with `?.` because the first run may precede view initialisation.
    this.listenOnLoadingChanges();

    effect(() => {
      const value = this.isIntervalToggleEnabledInput();

      if (value === undefined) {
        return;
      }

      const shouldSetInterval = this.isIntervalToggleEnabled || this.doesUserCheckedIntervalToggle;
      const shouldToggleInterval =
        this.isIntervalToggleEnabled && this.doesUserCheckedIntervalToggle && value;
      const intervalToggleControl = this.toggleIntervalForm.controls.intervalToggle;

      /**
       * We check if any interactions to toggle interval button were made.
       * When user interacts with toggle button, we need to ignore assigning value to the form.
       */
      if (intervalToggleControl.dirty && !shouldSetInterval) {
        return;
      }

      /**
       * This condition checks if the interval toggle is enabled and if there has been user interaction,
       * and if the provided value is truthy.
       * If all conditions are met, the interval toggle should not be updated due to unnecessary update of countdown interval component
       */
      if (shouldToggleInterval) {
        return;
      }
      intervalToggleControl.setValue(value);
    });
  }

  ngOnInit(): void {
    this.listenToRefreshIntervalChange();
  }

  ngAfterViewInit(): void {
    this.onIntervalToggleChange();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  resetCountdown(): void {
    this.countdownIntervalComponent?.reset();
  }

  trackUserClickOnIntervalToggle(target: EventTarget): void {
    this.doesUserCheckedIntervalToggle = (target as HTMLInputElement).checked;
  }

  private startCountdown(): void {
    this.countdownIntervalComponent.start();
  }

  private onIntervalToggleChange(): void {
    this.toggleIntervalForm.controls.intervalToggle.valueChanges
      .pipe(takeUntil(this.destroy$), filter(Boolean))
      .subscribe(() => setTimeout(() => this.startCountdown()));
  }

  private listenToRefreshIntervalChange(): void {
    this.toggleIntervalForm.controls.refreshInterval.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.resetCountdown());
  }

  /**
   * Stops the countdown while a reload is in flight and resets it afterwards.
   * Registered as an effect, so it is torn down with the component.
   */
  private listenOnLoadingChanges() {
    effect(() => {
      const loading = this.isLoading();

      this.countdownIntervalComponent?.stop();

      if (!loading) {
        this.countdownIntervalComponent?.reset();
      }
    });
  }
}
