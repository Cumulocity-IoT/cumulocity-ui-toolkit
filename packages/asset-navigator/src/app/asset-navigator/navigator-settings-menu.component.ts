import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { BsModalService } from 'ngx-bootstrap/modal';
import { DetailFieldsModalComponent } from './detail-fields-modal.component';
import {
  LIST_LIMIT,
  type NavigatorSettings,
} from '../core/services/settings/navigator-settings.model';
import { NavigatorSettingsService } from '../core/services/settings/navigator-settings.service';
import { chordFromEvent, parseChord } from '../core/services/shortcuts/chord';

/**
 * The explorer drawer's options menu (cog next to the pin): what the drawer shows, the
 * keyboard shortcut that opens it, list sizes, the inventory fallback for tenants without the
 * Digital Twin Manager, and the detail panel's fields ("Detail fields…", a modal). Every change applies and is stored at once — the menu
 * has no save step (see {@link NavigatorSettingsService} for where it is stored).
 */
@Component({
  selector: 'ps-navigator-settings-menu',
  standalone: true,
  imports: [CoreModule, BsDropdownModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './navigator-settings-menu.component.html',
  styleUrl: './navigator-settings-menu.component.less',
})
export class NavigatorSettingsMenuComponent {
  protected readonly service = inject(NavigatorSettingsService);
  protected readonly settings = this.service.settings;
  protected readonly limit = LIST_LIMIT;
  protected readonly recording = signal(false);
  private readonly modals = inject(BsModalService);

  constructor() {
    // Closing the drawer removes the field without a blur: never leave the drawer's own
    // shortcut muted by a recording that can no longer finish.
    inject(DestroyRef).onDestroy(() => this.stopRecording());
  }

  protected readonly shortcutLabel = computed(
    () => parseChord(this.settings().shortcut)?.label ?? ''
  );

  protected set<K extends keyof NavigatorSettings>(key: K, value: NavigatorSettings[K]): void {
    void this.service.update({ [key]: value });
  }

  protected setCount(key: 'maxPinned' | 'maxRecent', raw: string): void {
    const n = Number(raw);

    if (raw !== '' && Number.isFinite(n)) this.set(key, n);
  }

  protected startRecording(): void {
    this.recording.set(true);
    this.service.recordingShortcut.set(true);
  }

  protected stopRecording(): void {
    this.recording.set(false);
    this.service.recordingShortcut.set(false);
  }

  /** While recording: the first modifier chord becomes the shortcut, Escape cancels. */
  protected onShortcutKeydown(event: KeyboardEvent): void {
    if (!this.recording()) return;
    if (event.key === 'Tab') return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      this.stopRecording();

      return;
    }
    const chord = chordFromEvent(event);

    if (!chord) return;
    this.set('shortcut', chord);
    this.stopRecording();
  }

  protected clearShortcut(): void {
    this.set('shortcut', '');
  }

  /** The detail-field editor, for a type picked in the modal (or the default list). */
  protected openDetailFields(): void {
    this.modals.show(DetailFieldsModalComponent);
  }

  protected reset(): void {
    void this.service.reset();
  }
}
