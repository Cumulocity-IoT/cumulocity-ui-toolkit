import { inject, Injectable } from '@angular/core';
import { EventService, IEvent, IManagedObject, InventoryService, ISource } from '@c8y/client';
import { has } from 'lodash';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { LocalStorageService } from '~services/local-storage.service';
import { ReleaseNotesDisplayListModalComponent } from '../components';
import {
  RELEASE_NOTES__EVENT_TYPE,
  RELEASE_NOTES__LAST_CHECKED_KEY,
  RELEASE_NOTES__MO_TYPE,
  RELEASE_NOTES__PUBLISHED_FRAGMENT,
  ReleaseNote,
  ReleaseNoteEvent,
  ReleaseNoteEventPayload,
} from '../models/release-notes.model';

@Injectable()
export class ReleaseNotesService {
  private eventService = inject(EventService);
  private inventoryService = inject(InventoryService);
  private modalService = inject(BsModalService);
  private localStorageService = inject(LocalStorageService);

  private source: ISource;

  async list(showNewOnly = false, publishedOnly = true, pageSize = 500): Promise<ReleaseNote[]> {
    const requestFilter = {
      type: RELEASE_NOTES__EVENT_TYPE,
      pageSize,
      dateFrom: new Date(0).toISOString(),
      revert: false,
      withTotalPages: false,
    };

    if (publishedOnly) {
      requestFilter['fragmentType'] = RELEASE_NOTES__PUBLISHED_FRAGMENT;
    }

    const response = await this.eventService.list(requestFilter);

    if (showNewOnly) response.data = this.filterByPublishDate(response.data as ReleaseNoteEvent[]);

    return this.convertEventListToReleaseList(response.data);
  }

  async create(release: Partial<ReleaseNote>): Promise<ReleaseNote> {
    const event = await this.convertReleaseToEvent(release);
    const response = await this.eventService.create(event);

    return this.convertEventToRelease(response.data);
  }

  async delete(releaseNoteID: ReleaseNote['id']): Promise<void> {
    await this.eventService.delete(releaseNoteID);
  }

  async publish(release: ReleaseNote, isPublished: ReleaseNote['published']): Promise<ReleaseNote> {
    release.published = isPublished;
    release.publicationTime = isPublished ? new Date() : null;

    return await this.update(release);
  }

  async update(release: ReleaseNote): Promise<ReleaseNote> {
    const event = await this.convertReleaseToEvent(release);
    const response = await this.eventService.update(event);

    return this.convertEventToRelease(response.data);
  }

  async checkForNewRelease(): Promise<void> {
    const lastChecked = this.localStorageService.get<string>(RELEASE_NOTES__LAST_CHECKED_KEY);

    if (!lastChecked) this.setLastChecked();
    else if (await this.hasNewerReleases(lastChecked)) this.openReleaseNotesModal(true);
  }

  setLastChecked(): void {
    this.localStorageService.set(RELEASE_NOTES__LAST_CHECKED_KEY, new Date().toISOString());
  }

  openReleaseNotesModal(showOnlyNewReleases = false): BsModalRef {
    return this.modalService.show(ReleaseNotesDisplayListModalComponent, {
      class: 'modal-md',
      initialState: { showOnlyNewReleases },
    });
  }

  private convertEventListToReleaseList(releaseEvents: IEvent[]): ReleaseNote[] {
    return releaseEvents.map((release) => this.convertEventToRelease(release));
  }

  private convertEventToRelease(releaseEvent: IEvent | ReleaseNoteEvent): ReleaseNote {
    const eventData = releaseEvent[RELEASE_NOTES__EVENT_TYPE] as ReleaseNoteEventPayload;

    return {
      id: releaseEvent.id,
      version: eventData.version,
      published: (releaseEvent.published as boolean) || false,
      publicationTime: eventData.publicationTime ? new Date(eventData.publicationTime) : null,
      body: eventData.body || null,
    };
  }

  private async convertReleaseToEvent(release: Partial<ReleaseNote>): Promise<ReleaseNoteEvent> {
    const source = await this.getSourceObjectID();

    const data = {
      version: release.version,
      published: release.published,
      publicationTime: release.publicationTime?.toISOString() || null,
      body: release.body || '',
    };

    const event = {
      [RELEASE_NOTES__EVENT_TYPE]: data,
      text: `Release ${release.version}`,
    } as ReleaseNoteEvent;

    if (release.id) {
      // update
      event.id = release.id;
    } else {
      // create
      event.type = RELEASE_NOTES__EVENT_TYPE;
      event.time = new Date().toISOString();
      event.source = source;
    }

    event.published = release.published ? {} : null;

    return event;
  }

  private filterByPublishDate(events: ReleaseNoteEvent[]): ReleaseNoteEvent[] {
    const lastChecked = this.localStorageService.get<string>(RELEASE_NOTES__LAST_CHECKED_KEY);

    return events.filter((event) => event[RELEASE_NOTES__EVENT_TYPE].publicationTime > lastChecked);
  }

  private getSourceFromManagedObject(id: IManagedObject['id']): ISource {
    return { id } as ISource;
  }

  private async getSourceObjectID(): Promise<ISource> {
    if (this.source) return this.source;

    const response = await this.inventoryService.list({
      type: RELEASE_NOTES__MO_TYPE,
      pageSize: 1,
    });
    let id: IManagedObject['id'];

    if (response.data.length) {
      id = response.data[0].id;
    } else {
      const sourceResponse = await this.inventoryService.create({
        type: RELEASE_NOTES__MO_TYPE,
      });

      id = sourceResponse.data.id;
    }

    this.source = this.getSourceFromManagedObject(id);

    return this.source;
  }

  private async hasNewerReleases(date: string): Promise<boolean> {
    const response = await this.eventService.list({
      type: RELEASE_NOTES__EVENT_TYPE,
      pageSize: 1,
      withTotalPages: false,
      fragmentType: RELEASE_NOTES__PUBLISHED_FRAGMENT,
    });

    const eventList = response.data as ReleaseNoteEvent[];

    return (
      eventList.length &&
      has(eventList[0][RELEASE_NOTES__EVENT_TYPE], 'publicationTime') &&
      eventList[0][RELEASE_NOTES__EVENT_TYPE].publicationTime > date
    );
  }
}
