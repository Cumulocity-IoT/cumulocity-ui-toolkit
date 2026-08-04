import { Component, EventEmitter, Output, input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { ITrack } from '../layered-map-widget.model';

@Component({
  selector: 'track-list',
  templateUrl: './track-list.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class TrackListComponent {
  title = input('');
  tracks = input<ITrack[]>([]);
  selectedTrackName = input('');
  selectable = input(false);

  @Output() deleteTrack = new EventEmitter<ITrack>();
  @Output() userChangedSelection = new EventEmitter<{
    checked: boolean;
    track: ITrack;
  }>();

  onUserChangedSelection(event: Event, track: ITrack): void {
    const checked = (<HTMLInputElement>event.currentTarget).checked;

    this.userChangedSelection.emit({
      checked,
      track: track,
    });
  }

  onDeleteTrack(track: ITrack): void {
    this.deleteTrack.emit(track);
  }
}
