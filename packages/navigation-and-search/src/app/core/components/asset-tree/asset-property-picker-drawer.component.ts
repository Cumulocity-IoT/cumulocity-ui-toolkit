import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { IManagedObject } from '@c8y/client';
import { BottomDrawerRef, CoreModule } from '@c8y/ngx-components';
import {
  AssetPropertyListComponent,
  type AssetPropertyListConfig,
  type AssetPropertyType,
} from '@c8y/ngx-components/asset-properties';

/**
 * "Add asset properties": the platform's asset property list (`c8y-asset-property-list`) over
 * one asset, in a bottom drawer stacked on the settings drawer. Opened by
 * `DetailFieldConfigComponent` with `BottomDrawerService.openDrawer`; `result` resolves with the
 * checked properties, or rejects on cancel.
 *
 * Not the platform's `AssetPropertySelectorDrawerComponent`: for an asset (`c8y_IsAsset`) that
 * lists only the modelled properties (DTM definition or asset library) and has no way to add
 * the asset's own fragments — on a tenant without DTM it shows nothing. The list takes them as
 * `extraProperties`.
 */
@Component({
  selector: 'ps-asset-property-picker-drawer',
  imports: [CoreModule, AssetPropertyListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-contents' },
  template: `
    <div class="card-header separator flex-no-shrink">
      <span class="h4 card-title" id="drawerTitle">{{ 'Add asset properties' | translate }}</span>
      @if (subtitle) {
        <span class="text-muted m-l-8">{{ subtitle }}</span>
      }
    </div>
    <div class="inner-scroll flex-grow" data-cy="navigation-and-search--property-picker">
      <c8y-asset-property-list
        [asset]="asset"
        [extraProperties]="extraProperties"
        [config]="config"
        (selectedProperties)="picked.set($event)"
      />
    </div>
    <div class="card-footer text-center p-24 separator flex-no-shrink">
      <button class="btn btn-default" (click)="cancel()" type="button">
        {{ 'Cancel' | translate }}
      </button>
      <button
        class="btn btn-primary"
        [disabled]="!picked().length"
        (click)="add()"
        type="button"
        data-cy="navigation-and-search--property-picker-add"
      >
        {{ 'Add' | translate }}
        @if (picked().length) {
          ({{ picked().length }})
        }
      </button>
    </div>
  `,
})
export class AssetPropertyPickerDrawerComponent implements OnInit {
  /** The asset whose properties are listed — the full managed object. */
  asset!: IManagedObject;
  /** Properties the list would not discover on its own (the asset's fragments). */
  extraProperties: AssetPropertyType[] = [];
  /** Shown next to the title: what the properties are added for. */
  subtitle = '';

  protected readonly config: AssetPropertyListConfig = {
    selectMode: 'multi',
    expansionMode: 'collapsedByDefault',
    filterable: true,
    showHeader: true,
    showKey: true,
    showValue: true,
    inputPropertiesHandle: 'merge',
  };

  protected readonly picked = signal<AssetPropertyType[]>([]);

  private readonly drawerRef = inject(BottomDrawerRef);
  private readonly destroyRef = inject(DestroyRef);
  private resolve!: (properties: AssetPropertyType[]) => void;
  private reject!: () => void;

  readonly result = new Promise<AssetPropertyType[]>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });

  protected add(): void {
    this.resolve(this.picked());
    void this.drawerRef.close();
  }

  protected cancel(): void {
    this.reject();
    void this.drawerRef.close();
  }

  ngOnInit(): void {
    // Esc or a route change closes the drawer without a button: that is a cancel.
    this.drawerRef.onClosed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reject());
  }
}
