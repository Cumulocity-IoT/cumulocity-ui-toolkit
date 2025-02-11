import {
    AfterViewInit,
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
    ViewChild
  } from '@angular/core';
  import { BehaviorSubject, Subject } from 'rxjs';
  import { FormBuilder, FormsModule } from '@angular/forms';
  import { filter, takeUntil, tap } from 'rxjs/operators';
  import { CoreModule, CountdownIntervalComponent, gettext } from '@c8y/ngx-components';
  import { PopoverModule } from 'ngx-bootstrap/popover';
    import { TooltipModule } from 'ngx-bootstrap/tooltip';
  
  @Component({
    selector: 'ps-auto-refresh',
    templateUrl: './ps-auto-refresh.component.html',
    standalone: true,
    imports: [PopoverModule, TooltipModule, FormsModule, CoreModule]

  })
  export class PSAutoRefreshComponent implements OnInit, AfterViewInit, OnDestroy {
    readonly refreshIntervalsInMilliseconds = [5_000, 10_000, 15_000, 30_000, 60_000];
    readonly DISABLE_AUTO_REFRESH = gettext('Disable auto refresh');
    readonly ENABLE_AUTO_REFRESH = gettext('Enable auto refresh');
    readonly SECONDS_UNTIL_REFRESH = gettext('{{ seconds }} s');
  
    /**
     * Controls the loading state of the alarms list reload button.
     */
    @Input()
    isLoading$: BehaviorSubject<boolean>;
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
    @Input()
    set isIntervalToggleEnabled(value: boolean) {
      const shouldSetInterval = this.isIntervalToggleEnabled || this.doesUserCheckedIntervalToggle;
      const shouldToggleInterval =
        this.isIntervalToggleEnabled && this.doesUserCheckedIntervalToggle && value;
      const intervalToggleControl = this.toggleIntervalForm.get('intervalToggle');
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
    }
    /**
     * This getter allows you to access the current state of the `isIntervalEnabled` property, which reflects
     * the state of a toggle button. It retrieves the value from the associated form control, providing the
     * current state of the toggle button.
     */
    get isIntervalToggleEnabled(): boolean {
      return this.toggleIntervalForm.get('intervalToggle').value;
    }
    /**
     * Event emitter for notifying when a countdown timer has completed.
     */
    @Output()
    onCountdownEnded = new EventEmitter<void>();
  
    @ViewChild(CountdownIntervalComponent)
    countdownIntervalComponent: CountdownIntervalComponent;
    toggleIntervalForm = this.initForm();
    private destroy$: Subject<void> = new Subject<void>();
    /**
     * Indicates whether the user has been interacting with the interval toggle.
     * Property holds the current state of the interval toggle input element entered by the user,
     * distinguishing it from changes made programmatically (e.g. value from isIntervalToggleEnabled).
     */
    private doesUserCheckedIntervalToggle: boolean;
  
    constructor(
      private fb: FormBuilder,
    ) {}
  
    ngOnInit(): void {
      this.listenToRefreshIntervalChange();
    }
  
    ngAfterViewInit(): void {
      this.onIntervalToggleChange();
      this.listenOnLoadingChanges();
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
      this.toggleIntervalForm
        .get('intervalToggle')
        .valueChanges.pipe(takeUntil(this.destroy$), filter(Boolean))
        .subscribe(() => setTimeout(() => this.startCountdown()));
    }
  
    private initForm() {
      return this.fb.group({
        intervalToggle: true,
        refreshInterval: 30_000
      });
    }
  
    private listenToRefreshIntervalChange(): void {
      this.toggleIntervalForm
        .get('refreshInterval')
        .valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe(() => this.resetCountdown());
    }
  
    private listenOnLoadingChanges() {
      this.isLoading$
        .pipe(tap(() => this.countdownIntervalComponent?.stop()))
        .subscribe(state => {
          !state && this.countdownIntervalComponent?.reset();
        });
    }
  }
  